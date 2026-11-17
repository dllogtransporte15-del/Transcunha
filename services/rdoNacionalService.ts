import type { 
  RdoSolicitacaoPayload, 
  RdoSolicitacaoResponse, 
  RdoRequestRecord, 
  RdoExtensaoArquivo, 
  RdoConfig 
} from '../types';
import { fetchRdoConfig, upsertRdoRequest, fetchRdoRequests } from '../lib/db';

/**
 * Utilitário: Remove qualquer caractere não numérico de CPFs e CNPJs
 */
export function cleanDocumentNumber(doc?: string): string {
  if (!doc) return '';
  return doc.replace(/\D/g, '').trim();
}

/**
 * Utilitário: Sanitiza a placa do veículo
 */
export function cleanPlate(plate?: string): string {
  if (!plate) return '';
  return plate.replace(/[^A-Za-z0-9]/g, '').toUpperCase().trim();
}

/**
 * Utilitário: Extrai a extensão e converte um File ou Blob para Base64 puro
 */
export async function fileToBase64(fileOrBlob: File | Blob): Promise<{ base64: string; extension: RdoExtensaoArquivo }> {
  return new Promise((resolve, reject) => {
    let extension: RdoExtensaoArquivo = 'pdf';
    
    if ('name' in fileOrBlob && typeof (fileOrBlob as File).name === 'string') {
      const ext = (fileOrBlob as File).name.split('.').pop()?.toLowerCase();
      if (ext === 'jpg' || ext === 'jpeg') extension = 'jpg';
      else if (ext === 'png') extension = 'png';
      else if (ext === 'pdf') extension = 'pdf';
    } else if (fileOrBlob.type) {
      if (fileOrBlob.type.includes('png')) extension = 'png';
      else if (fileOrBlob.type.includes('jpeg') || fileOrBlob.type.includes('jpg')) extension = 'jpg';
      else if (fileOrBlob.type.includes('pdf')) extension = 'pdf';
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Remove prefixo data:...;base64, para enviar apenas o payload base64 puro
      const pureBase64 = result.includes('base64,') ? result.split('base64,')[1] : result;
      resolve({ base64: pureBase64, extension });
    };
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(fileOrBlob);
  });
}

/**
 * Utilitário: Converte uma URL de arquivo remoto (ex: Supabase Storage) para Base64
 */
export async function urlToBase64(fileUrl: string): Promise<{ base64: string; extension: RdoExtensaoArquivo }> {
  const response = await fetch(fileUrl);
  if (!response.ok) {
    throw new Error(`Falha ao baixar arquivo da URL (${response.statusText})`);
  }
  const blob = await response.blob();
  return fileToBase64(blob);
}

/**
 * Envia uma solicitação de análise cadastral para o RDO Nacional
 * (Post para /api/rdo-nacional/solicitacoes ou direto para o host se ambiente backend)
 */
export async function submitRdoSolicitacao(
  payload: RdoSolicitacaoPayload,
  extraMeta?: {
    shipmentId?: string;
    driverId?: string;
    createdById?: string;
    createdByName?: string;
    cnhUrl?: string;
  }
): Promise<{ success: boolean; data?: RdoSolicitacaoResponse; record?: RdoRequestRecord; error?: string }> {
  try {
    const config = await fetchRdoConfig();

    if (!config.apiToken || !config.apiToken.trim()) {
      return {
        success: false,
        error: 'Token de Integração do RDO Nacional não configurado. Por favor, configure a chave nas configurações do sistema.'
      };
    }

    const cleanCpf = cleanDocumentNumber(payload.cpf);
    if (!cleanCpf || cleanCpf.length !== 11) {
      return {
        success: false,
        error: 'CPF do motorista inválido ou não informado. É obrigatório ter 11 dígitos.'
      };
    }

    if (!payload.nome || !payload.nome.trim()) {
      return {
        success: false,
        error: 'Nome do motorista é obrigatório.'
      };
    }

    // Monta o payload final conforme documentação oficial
    const requestBody: RdoSolicitacaoPayload = {
      nomeDoCliente: payload.nomeDoCliente || config.clientName || 'TRANSCUNHA TRANSPORTES',
      cpf: cleanCpf,
      nome: payload.nome.trim().toUpperCase(),
      nomeDaMae: payload.nomeDaMae?.trim() ? payload.nomeDaMae.trim().toUpperCase() : undefined,
      dataDeNascimento: payload.dataDeNascimento || undefined,
      documentoDoProprietario: payload.documentoDoProprietario ? cleanDocumentNumber(payload.documentoDoProprietario) : undefined,
      nomeDoProprietario: payload.nomeDoProprietario?.trim() ? payload.nomeDoProprietario.trim().toUpperCase() : undefined,
      placaDoCavalo: payload.placaDoCavalo ? cleanPlate(payload.placaDoCavalo) : undefined,
      cnhBase64: payload.cnhBase64 || undefined,
      cnhExtensao: payload.cnhExtensao || undefined,
    };

    // Chamada através do proxy local / serverless para evitar problemas de CORS no navegador
    // Se estiver no browser, enviamos via endpoint interno '/api/rdo-nacional/solicitacoes'
    const endpoint = '/api/rdo-nacional/solicitacoes';
    const targetHost = config.apiUrl || 'https://painel.mrbsolucoes.com.br';

    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-access-token': config.apiToken.trim(),
        },
        body: JSON.stringify(requestBody),
      });
    } catch (proxyErr) {
      console.warn('[RDO Service] Proxy local falhou, tentando chamada direta ao host:', proxyErr);
      response = await fetch(`${targetHost.replace(/\/$/, '')}/api/integracao/solicitacoes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-access-token': config.apiToken.trim(),
        },
        body: JSON.stringify(requestBody),
      });
    }

    const responseData = await response.json().catch(() => ({}));

    if (!response.ok) {
      const errMsg = responseData?.message || responseData?.error || responseData?.Mensagem || `Erro ${response.status}: ${response.statusText}`;
      return {
        success: false,
        error: errMsg
      };
    }

    // A API do RDO Nacional (MRB Soluções) retorna chaves em PascalCase: { "Id": "...", "Codigo": 17383 }
    const rawId = responseData.id || responseData.Id;
    const rawCodigo = responseData.codigo !== undefined ? responseData.codigo : responseData.Codigo;

    if (!rawId) {
      return {
        success: false,
        error: responseData?.message || responseData?.Mensagem || 'Resposta da API do Rdo Nacional não conteve o identificador único (id).'
      };
    }

    const rdoResponse: RdoSolicitacaoResponse = {
      id: String(rawId),
      codigo: Number(rawCodigo || 0),
    };

    // Registra a solicitação na base de dados
    const newRecord: RdoRequestRecord = {
      id: rdoResponse.id,
      codigo: rdoResponse.codigo,
      shipmentId: extraMeta?.shipmentId,
      driverId: extraMeta?.driverId,
      cpf: requestBody.cpf,
      nome: requestBody.nome,
      nomeDaMae: requestBody.nomeDaMae,
      dataDeNascimento: requestBody.dataDeNascimento,
      documentoDoProprietario: requestBody.documentoDoProprietario,
      nomeDoProprietario: requestBody.nomeDoProprietario,
      placaDoCavalo: requestBody.placaDoCavalo,
      status: 'pendente',
      cnhUrl: extraMeta?.cnhUrl,
      createdAt: new Date().toISOString(),
      createdById: extraMeta?.createdById,
      createdByName: extraMeta?.createdByName,
      rawResponse: responseData,
    };

    await upsertRdoRequest(newRecord);

    return {
      success: true,
      data: rdoResponse,
      record: newRecord,
    };
  } catch (err: any) {
    console.error('[RDO Service] Erro ao enviar solicitação:', err);
    return {
      success: false,
      error: err?.message || 'Falha de conexão com a API do RDO Nacional.'
    };
  }
}

/**
 * Consulta a lista de solicitações gravadas
 */
export async function getRdoHistory(): Promise<RdoRequestRecord[]> {
  return fetchRdoRequests();
}

/**
 * Testa a conectividade e autenticação com o servidor do RDO Nacional (MRB Soluções)
 */
export async function testRdoConnection(customToken?: string, customHost?: string): Promise<{
  success: boolean;
  message: string;
  statusCode?: number;
  data?: any;
}> {
  try {
    const config = await fetchRdoConfig();
    const token = (customToken || config.apiToken || '').trim();

    if (!token) {
      return {
        success: false,
        message: 'Token de integração do RDO Nacional não configurado.',
      };
    }

    const host = (customHost || config.apiUrl || 'https://painel.mrbsolucoes.com.br').replace(/\/$/, '');

    // Payload de teste para validar o cabeçalho x-access-token
    const testPayload = {
      nomeDoCliente: config.clientName || 'TRANSCUNHA TRANSPORTES',
      cpf: '00000000000',
      nome: 'TESTE DE CONEXAO SISTEMA TRANSCUNHA',
    };

    let response: Response;
    try {
      response = await fetch('/api/rdo-nacional/solicitacoes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-access-token': token,
        },
        body: JSON.stringify(testPayload),
      });
    } catch {
      response = await fetch(`${host}/api/integracao/solicitacoes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-access-token': token,
        },
        body: JSON.stringify(testPayload),
      });
    }

    const data = await response.json().catch(() => ({}));

    if (response.ok && (data.Id || data.id || data.Codigo || data.codigo)) {
      const cod = data.Codigo || data.codigo || data.Id || data.id;
      return {
        success: true,
        statusCode: response.status,
        message: `Conexão bem-sucedida! Servidor RDO Nacional ativo e autenticado (Código de teste: #${cod}).`,
        data,
      };
    }

    if (response.status === 401 || response.status === 403) {
      return {
        success: false,
        statusCode: response.status,
        message: 'Token de Integração inválido ou rejeitado pelo RDO Nacional (HTTP 401/403).',
      };
    }

    const err = data.message || data.error || data.Mensagem || `Erro HTTP ${response.status}: ${response.statusText}`;
    return {
      success: false,
      statusCode: response.status,
      message: err,
    };
  } catch (err: any) {
    return {
      success: false,
      message: `Falha ao conectar ao servidor do RDO Nacional: ${err?.message || 'Servidor inacessível'}`,
    };
  }
}
