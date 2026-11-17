import { createClient } from '@supabase/supabase-js';

/**
 * Webhook Oficial do Rdo Nacional para recebimento de pareceres concluídos
 * Rota: POST /api/rdo-nacional/parecer
 * 
 * Cabeçalho esperado: x-access-token: <token_de_callback>
 */
export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-access-token');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  const incomingToken = req.headers['x-access-token'];

  // Dados do Supabase
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('[RDO Webhook] Credenciais do Supabase ausentes no ambiente');
    return res.status(500).json({ error: 'Configuração interna do banco de dados ausente' });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Validação opcional de token de callback se estiver configurado
  try {
    const { data: permData } = await supabase.from('profile_permissions').select('permissions').eq('id', 1).single();
    const rdoConfig = permData?.permissions?.rdo_config;
    const expectedCallbackToken = rdoConfig?.callbackToken || process.env.RDO_CALLBACK_TOKEN;

    if (expectedCallbackToken && expectedCallbackToken.trim()) {
      if (!incomingToken || incomingToken.trim() !== expectedCallbackToken.trim()) {
        console.warn('[RDO Webhook] Token de callback inválido:', incomingToken);
        return res.status(401).json({ error: 'Unauthorized: Token de callback inválido' });
      }
    }
  } catch (err) {
    console.warn('[RDO Webhook] Não foi possível validar token nas configurações:', err);
  }

  // Extrai o payload enviado pelo RDO Nacional (suporta camelCase e PascalCase oficial da API)
  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  const idSolicitacao = body?.idSolicitacao || body?.IdSolicitacao || body?.id || body?.Id;
  const parecerRaw = body?.parecer !== undefined ? body?.parecer : (body?.Parecer !== undefined ? body?.Parecer : 0);
  const observacao = body?.observacao || body?.Observacao || null;
  const cpf = body?.cpf || body?.Cpf;
  const nome = body?.nome || body?.Nome;
  const documentoDoProprietario = body?.documentoDoProprietario || body?.DocumentoDoProprietario;
  const nomeDoProprietario = body?.nomeDoProprietario || body?.NomeDoProprietario;
  const placa = body?.placa || body?.Placa || body?.placaDoCavalo || body?.PlacaDoCavalo;

  if (!idSolicitacao) {
    return res.status(400).json({ error: 'Campo idSolicitacao é obrigatório' });
  }

  const parecerInt = Number(parecerRaw);
  const statusStr = parecerInt === 0 ? 'aprovado' : 'consta_informacao';
  const cleanCpf = cpf ? String(cpf).replace(/\D/g, '') : '';
  const cleanPlaca = placa ? String(placa).replace(/[^A-Za-z0-9]/g, '').toUpperCase() : '';

  try {
    let existingRecord: any = null;

    // 1. Tenta buscar registro existente na tabela rdo_requests
    try {
      const { data } = await supabase
        .from('rdo_requests')
        .select('*')
        .eq('id', idSolicitacao)
        .maybeSingle();
      if (data) existingRecord = data;
    } catch {}

    // Se não encontrou na tabela, busca em profile_permissions
    if (!existingRecord) {
      try {
        const { data: permRow } = await supabase.from('profile_permissions').select('permissions').eq('id', 1).single();
        const currentList: any[] = permRow?.permissions?.rdo_requests_list || [];
        existingRecord = currentList.find((r: any) => r.id === idSolicitacao || (cleanCpf && String(r.cpf).replace(/\D/g, '') === cleanCpf));
      } catch {}
    }

    const recordPayload: any = {
      id: idSolicitacao,
      codigo: existingRecord?.codigo || 0,
      shipmentId: existingRecord?.shipment_id || existingRecord?.shipmentId || null,
      driverId: existingRecord?.driver_id || existingRecord?.driverId || null,
      cpf: cleanCpf || existingRecord?.cpf || '',
      nome: nome || existingRecord?.nome || '',
      documentoDoProprietario: documentoDoProprietario || existingRecord?.documento_proprietario || existingRecord?.documentoDoProprietario || null,
      nomeDoProprietario: nomeDoProprietario || existingRecord?.nome_proprietario || existingRecord?.nomeDoProprietario || null,
      placaDoCavalo: cleanPlaca || existingRecord?.placa_cavalo || existingRecord?.placaDoCavalo || null,
      parecer: parecerInt,
      status: statusStr,
      observacao: observacao || null,
      concludedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdAt: existingRecord?.created_at || existingRecord?.createdAt || new Date().toISOString(),
      rawWebhookPayload: body,
    };

    // 2. Persiste na tabela rdo_requests se disponível
    try {
      await supabase.from('rdo_requests').upsert({
        id: idSolicitacao,
        codigo: recordPayload.codigo,
        shipment_id: recordPayload.shipmentId,
        driver_id: recordPayload.driverId,
        cpf: recordPayload.cpf,
        nome: recordPayload.nome,
        documento_proprietario: recordPayload.documentoDoProprietario,
        nome_proprietario: recordPayload.nomeDoProprietario,
        placa_cavalo: recordPayload.placaDoCavalo,
        parecer: recordPayload.parecer,
        status: recordPayload.status,
        observacao: recordPayload.observacao,
        concluded_at: recordPayload.concludedAt,
        updated_at: recordPayload.updatedAt,
        created_at: recordPayload.createdAt,
        raw_webhook_payload: body,
      });
    } catch (tableErr) {
      console.warn('[RDO Webhook] Tabela rdo_requests ausente ou inacessível, usando profile_permissions');
    }

    // 3. Persiste em profile_permissions (id: 1, permissions.rdo_requests_list) para garantia multi-device
    try {
      const { data: permData } = await supabase.from('profile_permissions').select('permissions').eq('id', 1).single();
      const currentPerms = permData?.permissions || {};
      const list: any[] = Array.isArray(currentPerms.rdo_requests_list) ? [...currentPerms.rdo_requests_list] : [];
      const idx = list.findIndex((r: any) => r.id === idSolicitacao);
      if (idx >= 0) {
        list[idx] = { ...list[idx], ...recordPayload };
      } else {
        list.unshift(recordPayload);
      }
      await supabase.from('profile_permissions').upsert({
        id: 1,
        permissions: {
          ...currentPerms,
          rdo_requests_list: list.slice(0, 500),
        }
      });
    } catch (permErr) {
      console.warn('[RDO Webhook] Erro ao gravar em profile_permissions:', permErr);
    }

    // 4. Se houver um shipmentId vinculado (ou se localizarmos por CPF do motorista), atualiza dados do embarque caso aprovado
    let targetShipmentId = recordPayload.shipmentId;
    if (!targetShipmentId && cleanCpf) {
      try {
        const { data: matchedShipments } = await supabase
          .from('shipments')
          .select('id, driver_cpf, horse_plate, status')
          .order('created_at', { ascending: false })
          .limit(20);
        const found = (matchedShipments || []).find((s: any) => 
          (s.driver_cpf && String(s.driver_cpf).replace(/\D/g, '') === cleanCpf) ||
          (cleanPlaca && s.horse_plate && String(s.horse_plate).replace(/[^A-Za-z0-9]/g, '').toUpperCase() === cleanPlaca)
        );
        if (found) targetShipmentId = found.id;
      } catch {}
    }

    if (targetShipmentId && parecerInt === 0) {
      const releaseCode = recordPayload.codigo && recordPayload.codigo > 0
        ? `RDO-${recordPayload.codigo}` 
        : `RDO-${idSolicitacao.slice(0, 8).toUpperCase()}`;

      await supabase
        .from('shipments')
        .update({
          risk_release_code: releaseCode,
          risk_query_type: 'RDO Nacional',
        })
        .eq('id', targetShipmentId);
    }

    // 5. Resposta de Sucesso conforme documentação (200 OK)
    return res.status(200).json({
      success: true,
      message: 'Parecer recebido e processado com sucesso pelo sistema Transcunha',
      idSolicitacao,
      status: statusStr,
      targetShipmentId: targetShipmentId || null,
    });
  } catch (err: any) {
    console.error('[RDO Webhook] Erro ao gravar parecer no Supabase:', err);
    return res.status(500).json({
      error: 'Erro interno ao processar o parecer do webhook',
      details: err?.message || String(err)
    });
  }
}
