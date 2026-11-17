/**
 * Serviço de Integração com o SIGA GR (Gerenciadora de Risco - REST+JSON v1)
 * Documentação da API: /api-docs/v1/swagger.yaml
 */

import type {
  SigaConfig,
  SigaCreateAnalysisInput,
  SigaUpdateAnalysisInput,
  SigaAnalysisResponseData,
  SigaRequestRecord,
  SigaVehicleType,
  SigaProduct,
  SigaDriverHistory,
  SigaSimulationTag,
  Shipment,
  Driver,
  Vehicle,
  Owner
} from '../types';
import { fetchSigaConfig, saveSigaConfig, upsertSigaRequest, fetchSigaRequests } from '../lib/db';

/**
 * Normaliza documento (CPF / CNPJ) mantendo apenas dígitos.
 */
export function cleanDocumentNumber(doc?: string): string {
  if (!doc) return '';
  return doc.replace(/\D/g, '').trim();
}

/**
 * Formata CPF para o formato 999.999.999-99 (exigido em endpoints do SIGA GR).
 */
export function formatCpf(doc?: string): string {
  const clean = cleanDocumentNumber(doc);
  if (clean.length !== 11) return doc || '';
  return `${clean.slice(0, 3)}.${clean.slice(3, 6)}.${clean.slice(6, 9)}-${clean.slice(9, 11)}`;
}

/**
 * Normaliza placa do veículo (apenas letras e números maiúsculos).
 */
export function cleanPlate(plate?: string): string {
  if (!plate) return '';
  return plate.replace(/[^A-Za-z0-9]/g, '').toUpperCase().trim();
}

/**
 * Mapeia o tipo de veículo do Transcunha para o enum aceito pelo SIGA GR:
 * [ Baú, BI-Caçamba, BI-Trem, Container, LS, Rodotrem, Sider, Tanque, Truck, Vanderléia ]
 */
export function mapVehicleTypeToSiga(vehicleType?: string): SigaVehicleType {
  if (!vehicleType) return 'Truck';
  const v = vehicleType.trim().toLowerCase();

  if (v.includes('rodotrem') || v.includes('rodo-trem') || v.includes('9 eixos')) return 'Rodotrem';
  if (v.includes('bi-caçamba') || v.includes('bicaçamba') || v.includes('bi caçamba')) return 'BI-Caçamba';
  if (v.includes('bitrem') || v.includes('bi-trem') || v.includes('7 eixos')) return 'BI-Trem';
  if (v.includes('vanderleia') || v.includes('vanderléia')) return 'Vanderléia';
  if (v.includes('sider')) return 'Sider';
  if (v.includes('container') || v.includes('porta container')) return 'Container';
  if (v.includes('tanque')) return 'Tanque';
  if (v.includes('ls') || v.includes('carreta ls') || v.includes('cavalo')) return 'LS';
  if (v.includes('baú') || v.includes('bau')) return 'Baú';
  if (v.includes('truck') || v.includes('trucado') || v.includes('toco') || v.includes('3/4')) return 'Truck';

  return 'LS';
}

/**
 * Quantidade oficial de carretas por tipo de veículo segundo o SIGA GR:
 */
export function getTrailersCountForVehicleType(type: SigaVehicleType): number {
  switch (type) {
    case 'Rodotrem':
      return 3;
    case 'BI-Caçamba':
    case 'BI-Trem':
      return 2;
    case 'Baú':
    case 'Container':
    case 'LS':
    case 'Sider':
    case 'Tanque':
    case 'Vanderléia':
      return 1;
    case 'Truck':
    default:
      return 0;
  }
}

/**
 * Mapeia o histórico do motorista para o padrão aceito pelo SIGA GR:
 * [ 'Primeira viagem', 'Com histórico', 'Agregado', 'Frota', 'Terceiro' ]
 */
export function mapDriverHistoryToSiga(driver?: Driver, tripsCount = 0): SigaDriverHistory {
  if (driver?.classification) {
    const rel = String(driver.classification).toLowerCase();
    if (rel.includes('frota') || rel.includes('próprio')) return 'Frota';
    if (rel.includes('agregado')) return 'Agregado';
    if (rel.includes('terceiro')) return 'Terceiro';
  }
  if (tripsCount > 0) return 'Com histórico';
  return 'Primeira viagem';
}

function cleanErrorMessage(rawText: string, status: number): string {
  if (!rawText) return `Erro HTTP ${status}`;
  if (typeof rawText === 'string' && (rawText.includes('<html') || rawText.includes('<body') || rawText.trim().startsWith('<'))) {
    if (status === 503) {
      return 'Servidor do SIGA GR temporariamente indisponível (HTTP 503). O ambiente de homologação (api.staging.sigagr.com.br) está offline ou em manutenção nos servidores AWS da SIGA.';
    }
    if (status === 502) {
      return 'Falha de comunicação com o servidor do SIGA GR (HTTP 502 Bad Gateway).';
    }
    if (status === 504) {
      return 'Tempo limite esgotado ao aguardar o servidor do SIGA GR (HTTP 504 Gateway Timeout).';
    }
    const match = rawText.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || rawText.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = match ? match[1].replace(/<[^>]+>/g, '').trim() : '';
    return title ? `Erro HTTP ${status}: ${title}` : `Erro HTTP ${status}: O servidor do SIGA retornou uma página de erro.`;
  }
  return rawText;
}

/**
 * Executa uma requisição HTTP à API do SIGA GR através do proxy do backend/Vite
 * para contornar bloqueios de CORS no navegador e trafegar os tokens com segurança.
 */
async function requestSiga(
  endpoint: string,
  options: {
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
    body?: any;
    token?: string;
    isMultipart?: boolean;
    config?: SigaConfig;
  } = {}
): Promise<{ ok: boolean; status: number; data: any; headers: Headers }> {
  const cfg = options.config || await fetchSigaConfig();
  const targetHost = cfg.apiUrl || (cfg.environment === 'production' ? 'https://api.sigagr.com.br' : 'https://api.staging.sigagr.com.br');
  const method = options.method || 'GET';

  // Usa o endpoint de proxy do Transcunha
  const proxyUrl = '/api/siga-gr/proxy';

  const headers: Record<string, string> = {
    'x-siga-endpoint': endpoint,
    'x-siga-target': targetHost,
    Accept: 'application/json',
  };

  const authToken = options.token || cfg.authToken;
  if (authToken) {
    headers['Authorization'] = authToken.startsWith('Bearer ') ? authToken : `Bearer ${authToken}`;
  }

  let body: any = undefined;
  if (options.isMultipart && options.body instanceof FormData) {
    // Para FormData, o navegador define o Content-Type com boundary automaticamente
    body = options.body;
  } else if (options.body) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.body);
  }

  try {
    const res = await fetch(proxyUrl, {
      method,
      headers,
      body,
    });

    let resData: any = null;
    const text = await res.text();
    try {
      resData = text ? JSON.parse(text) : {};
    } catch {
      resData = { message: cleanErrorMessage(text, res.status) };
    }

    return {
      ok: res.ok,
      status: res.status,
      data: resData,
      headers: res.headers,
    };
  } catch (err: any) {
    // Tentativa direta caso o proxy não esteja respondendo (ex: ambiente com CORS liberado)
    console.warn('[SIGA GR] Proxy falhou, tentando requisição direta:', err);
    try {
      const directUrl = `${targetHost.replace(/\/$/, '')}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
      const directHeaders: Record<string, string> = {
        Accept: 'application/json',
      };
      if (authToken) {
        directHeaders['Authorization'] = authToken.startsWith('Bearer ') ? authToken : `Bearer ${authToken}`;
      }
      if (!options.isMultipart && options.body) {
        directHeaders['Content-Type'] = 'application/json';
      }

      const directRes = await fetch(directUrl, {
        method,
        headers: directHeaders,
        body,
      });

      const text = await directRes.text();
      let resData: any = {};
      try {
        resData = text ? JSON.parse(text) : {};
      } catch {
        resData = { message: cleanErrorMessage(text, directRes.status) };
      }

      return {
        ok: directRes.ok,
        status: directRes.status,
        data: resData,
        headers: directRes.headers,
      };
    } catch (directErr: any) {
      throw new Error(`Falha de comunicação com o SIGA GR: ${err?.message || directErr?.message || 'Servidor inacessível'}`);
    }
  }
}

/**
 * 1. Autenticar no SIGA GR: POST /v1/auth/sign_in
 * Retorna o token Bearer (válido por 1 hora) presente no header Authorization.
 */
export async function authenticateSiga(customConfig?: Partial<SigaConfig>): Promise<{
  success: boolean;
  token?: string;
  error?: string;
}> {
  const config = await fetchSigaConfig();
  const email = customConfig?.email || config.email;
  const password = customConfig?.password || config.password;
  const apiUrl = customConfig?.apiUrl || config.apiUrl;

  if (!email || !password) {
    return {
      success: false,
      error: 'E-mail e senha do SIGA GR não configurados. Acesse a aba Configurações.',
    };
  }

  const payload = {
    application_key: {
      email: email.trim(),
      password: password.trim(),
    },
  };

  const response = await requestSiga('/v1/auth/sign_in', {
    method: 'POST',
    body: payload,
    config: {
      ...config,
      apiUrl: apiUrl || config.apiUrl,
    },
  });

  if (!response.ok) {
    const errorMsg =
      response.data?.error ||
      response.data?.message ||
      (response.status === 401 ? 'Credenciais inválidas no SIGA GR.' : `Erro HTTP ${response.status}`);
    return { success: false, error: errorMsg };
  }

  // O SIGA GR retorna o token no cabeçalho Authorization
  let token = response.headers.get('authorization') || response.headers.get('Authorization') || '';
  if (!token && response.data?.token) {
    token = response.data.token;
  }

  if (token) {
    token = token.replace(/^Bearer\s+/i, '').trim();
    const expiresAt = new Date(Date.now() + 55 * 60 * 1000).toISOString(); // 55 minutos para margem segura
    await saveSigaConfig({
      ...config,
      authToken: token,
      authTokenExpiresAt: expiresAt,
      email,
      password,
    });
    return { success: true, token };
  }

  return { success: true };
}

/**
 * Garante que temos um token de autenticação válido no SIGA GR.
 */
async function ensureValidToken(config: SigaConfig): Promise<string> {
  if (
    config.authToken &&
    config.authTokenExpiresAt &&
    new Date(config.authTokenExpiresAt).getTime() > Date.now()
  ) {
    return config.authToken;
  }

  const authResult = await authenticateSiga(config);
  if (!authResult.success || !authResult.token) {
    throw new Error(authResult.error || 'Falha ao autenticar no SIGA GR. Verifique suas credenciais.');
  }

  return authResult.token;
}

/**
 * 2. Upload de Arquivos: POST /v1/uploads
 * Formatos permitidos: PDF, JPG, JPEG e PNG. Tamanho máximo: 5MB.
 * Retorna o token do arquivo (que só pode ser utilizado 1 vez ao vincular no cadastro).
 */
export async function uploadSigaFile(
  fileOrBlob: File | Blob,
  fileName = 'documento.pdf'
): Promise<{ success: boolean; token?: string; error?: string }> {
  try {
    const config = await fetchSigaConfig();
    const authToken = await ensureValidToken(config);

    if (fileOrBlob.size > 5 * 1024 * 1024) {
      return { success: false, error: 'O arquivo excede o limite de 5MB permitido pelo SIGA GR.' };
    }

    const formData = new FormData();
    const actualName = (fileOrBlob as File).name || fileName;
    formData.append('file', fileOrBlob, actualName);

    const response = await requestSiga('/v1/uploads', {
      method: 'POST',
      body: formData,
      isMultipart: true,
      token: authToken,
      config,
    });

    if (!response.ok) {
      const msg = response.data?.error || response.data?.message || `Erro no upload (HTTP ${response.status})`;
      return { success: false, error: msg };
    }

    const token = response.data?.blob?.token;
    if (!token) {
      return { success: false, error: 'Token do blob não retornado pelo SIGA GR.' };
    }

    return { success: true, token };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Falha no upload para o SIGA GR.' };
  }
}

/**
 * Faz download de um arquivo a partir de uma URL pública (ex: Supabase Storage)
 * e o envia diretamente para o SIGA GR, retornando o token de upload.
 */
export async function uploadSigaFileFromUrl(fileUrl: string, fileName = 'documento.pdf'): Promise<string> {
  const fetchRes = await fetch(fileUrl);
  if (!fetchRes.ok) {
    throw new Error(`Falha ao obter anexo da URL: ${fetchRes.statusText}`);
  }
  const blob = await fetchRes.blob();
  const uploadRes = await uploadSigaFile(blob, fileName);
  if (!uploadRes.success || !uploadRes.token) {
    throw new Error(uploadRes.error || 'Falha ao enviar anexo para o SIGA GR');
  }
  return uploadRes.token;
}

/**
 * 3. Criar Nova Análise: POST /v1/analyses
 * Inicia a análise cadastral no estado "draft".
 */
export async function createSigaAnalysis(
  input: SigaCreateAnalysisInput,
  meta?: {
    shipmentId?: string;
    driverId?: string;
    driverName?: string;
    createdById?: string;
    createdByName?: string;
  }
): Promise<{ success: boolean; data?: SigaAnalysisResponseData; record?: SigaRequestRecord; error?: string }> {
  try {
    const config = await fetchSigaConfig();
    const authToken = await ensureValidToken(config);

    const cleanCpf = formatCpf(input.driver_personal_document);
    const cleanTruckPlate = cleanPlate(input.truck_license_plate);

    if (!cleanCpf) {
      return { success: false, error: 'CPF do motorista é obrigatório.' };
    }
    if (!cleanTruckPlate) {
      return { success: false, error: 'Placa do veículo é obrigatória.' };
    }

    const payload = {
      analysis: {
        product_name: input.product_name || 'siga',
        requester_email: input.requester_email || config.requesterEmail || config.email,
        driver_personal_document: cleanCpf,
        vehicle_type: input.vehicle_type,
        truck_license_plate: cleanTruckPlate,
        trailer_1_license_plate: input.trailer_1_license_plate ? cleanPlate(input.trailer_1_license_plate) : undefined,
        trailer_2_license_plate: input.trailer_2_license_plate ? cleanPlate(input.trailer_2_license_plate) : undefined,
        trailer_3_license_plate: input.trailer_3_license_plate ? cleanPlate(input.trailer_3_license_plate) : undefined,
        business_unit: input.business_unit || config.businessUnit || undefined,
        tags: input.tags && input.tags.length > 0 ? input.tags : undefined,
      },
    };

    const response = await requestSiga('/v1/analyses', {
      method: 'POST',
      body: payload,
      token: authToken,
      config,
    });

    if (!response.ok) {
      const errDetails = response.data?.errors
        ? Object.entries(response.data.errors)
            .map(([field, msgs]: any) => `${field}: ${Array.isArray(msgs) ? msgs.join(', ') : msgs}`)
            .join(' | ')
        : '';
      const msg = response.data?.message || response.data?.error || `Erro HTTP ${response.status}`;
      return { success: false, error: errDetails ? `${msg} (${errDetails})` : msg };
    }

    const analysisData: SigaAnalysisResponseData = response.data?.analysis || response.data;
    const processNumber = String(analysisData.process_number);

    // Salva o registro inicial no histórico do Transcunha
    const record: SigaRequestRecord = {
      id: `siga_${processNumber}`,
      processNumber,
      state: analysisData.state || 'draft',
      productName: input.product_name,
      shipmentId: meta?.shipmentId,
      driverId: meta?.driverId,
      driverName: meta?.driverName || analysisData.driver?.fullname || 'Motorista',
      driverCpf: cleanCpf,
      truckPlate: cleanTruckPlate,
      vehicleType: input.vehicle_type,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdById: meta?.createdById,
      createdByName: meta?.createdByName,
      rawAnalysis: analysisData,
    };

    await upsertSigaRequest(record);

    return { success: true, data: analysisData, record };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Falha ao criar análise no SIGA GR.' };
  }
}

/**
 * 4. Atualizar Análise (Enviar para a fila de atendimento): PUT /v1/analyses/{process_number}
 * Preenche dados completos do motorista, veículo e tokens de upload.
 * Move automaticamente a análise de "draft" para "awaiting_analysis".
 */
export async function updateSigaAnalysis(
  processNumber: string,
  input: SigaUpdateAnalysisInput,
  meta?: {
    shipmentId?: string;
    driverId?: string;
  }
): Promise<{ success: boolean; data?: SigaAnalysisResponseData; record?: SigaRequestRecord; error?: string }> {
  try {
    const config = await fetchSigaConfig();
    const authToken = await ensureValidToken(config);

    const payload = {
      analysis: input,
    };

    const response = await requestSiga(`/v1/analyses/${processNumber}`, {
      method: 'PUT',
      body: payload,
      token: authToken,
      config,
    });

    if (!response.ok) {
      const errDetails = response.data?.errors
        ? Object.entries(response.data.errors)
            .map(([field, msgs]: any) => `${field}: ${Array.isArray(msgs) ? msgs.join(', ') : msgs}`)
            .join(' | ')
        : '';
      const msg = response.data?.message || response.data?.error || `Erro HTTP ${response.status}`;
      return { success: false, error: errDetails ? `${msg} (${errDetails})` : msg };
    }

    const analysisData: SigaAnalysisResponseData = response.data?.analysis || response.data;

    // Atualiza o registro salvo
    const currentList = await fetchSigaRequests();
    const existing = currentList.find(r => r.processNumber === processNumber);

    const record: SigaRequestRecord = {
      id: existing?.id || `siga_${processNumber}`,
      processNumber,
      state: analysisData.state || 'awaiting_analysis',
      productName: analysisData.product_name || existing?.productName || 'siga',
      shipmentId: meta?.shipmentId || existing?.shipmentId,
      driverId: meta?.driverId || existing?.driverId,
      driverName: analysisData.driver?.fullname || existing?.driverName || 'Motorista',
      driverCpf: analysisData.driver?.personal_document || existing?.driverCpf || '',
      truckPlate: analysisData.truck?.license_plate || existing?.truckPlate || '',
      vehicleType: analysisData.truck?.vehicle_type || existing?.vehicleType || 'Truck',
      origin: analysisData.origin || input.origin || existing?.origin,
      destination: analysisData.destination || input.destination || existing?.destination,
      loadCost: analysisData.load_cost ?? input.load_cost ?? existing?.loadCost,
      denialReason: analysisData.denial_reason || existing?.denialReason,
      issuesCount: analysisData.issues?.length || 0,
      unsolvedIssuesCount: analysisData.issues?.filter(i => !i.solved).length || 0,
      commentsCount: analysisData.comments?.length || 0,
      expiresAt: analysisData.expires_at || existing?.expiresAt,
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      concludedAt: ['approved', 'denied', 'authorized_by_manager'].includes(analysisData.state)
        ? new Date().toISOString()
        : existing?.concludedAt,
      createdById: existing?.createdById,
      createdByName: existing?.createdByName,
      rawAnalysis: analysisData,
    };

    await upsertSigaRequest(record);

    return { success: true, data: analysisData, record };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Falha ao atualizar análise no SIGA GR.' };
  }
}

/**
 * 5. Consultar Análise: GET /v1/analyses/{process_number}
 * Obtém o status em tempo real, comentários da central e pendências (issues).
 */
export async function getSigaAnalysis(
  processNumber: string
): Promise<{ success: boolean; data?: SigaAnalysisResponseData; record?: SigaRequestRecord; error?: string }> {
  try {
    const config = await fetchSigaConfig();
    const authToken = await ensureValidToken(config);

    const response = await requestSiga(`/v1/analyses/${processNumber}`, {
      method: 'GET',
      token: authToken,
      config,
    });

    if (!response.ok) {
      const msg = response.data?.message || response.data?.error || `Erro HTTP ${response.status}`;
      return { success: false, error: msg };
    }

    const analysisData: SigaAnalysisResponseData = response.data?.analysis || response.data;

    // Atualiza o registro salvo
    const currentList = await fetchSigaRequests();
    const existing = currentList.find(r => r.processNumber === processNumber);

    const record: SigaRequestRecord = {
      id: existing?.id || `siga_${processNumber}`,
      processNumber,
      state: analysisData.state,
      productName: analysisData.product_name || existing?.productName || 'siga',
      shipmentId: existing?.shipmentId,
      driverId: existing?.driverId,
      driverName: analysisData.driver?.fullname || existing?.driverName || 'Motorista',
      driverCpf: analysisData.driver?.personal_document || existing?.driverCpf || '',
      truckPlate: analysisData.truck?.license_plate || existing?.truckPlate || '',
      vehicleType: analysisData.truck?.vehicle_type || existing?.vehicleType || 'Truck',
      origin: analysisData.origin || existing?.origin,
      destination: analysisData.destination || existing?.destination,
      loadCost: analysisData.load_cost ?? existing?.loadCost,
      denialReason: analysisData.denial_reason || existing?.denialReason,
      issuesCount: analysisData.issues?.length || 0,
      unsolvedIssuesCount: analysisData.issues?.filter(i => !i.solved).length || 0,
      commentsCount: analysisData.comments?.length || 0,
      expiresAt: analysisData.expires_at || existing?.expiresAt,
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      concludedAt: ['approved', 'denied', 'authorized_by_manager'].includes(analysisData.state)
        ? (existing?.concludedAt || new Date().toISOString())
        : null,
      createdById: existing?.createdById,
      createdByName: existing?.createdByName,
      rawAnalysis: analysisData,
    };

    await upsertSigaRequest(record);

    return { success: true, data: analysisData, record };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Falha ao consultar análise no SIGA GR.' };
  }
}

/**
 * 6. Simular Mudança de Estado (Ambiente de Homologação)
 * Utiliza as tags suportadas pelo SIGA GR para simular o atendimento do analista:
 * - simulate_approval -> approved
 * - simulate_denial -> denied
 * - simulate_authorization -> authorized_by_manager
 * - simulate_comment -> pending com comentário
 * - simulate_issue -> pending com pendência
 */
export async function simulateSigaStatus(
  processNumber: string,
  simulationTag: SigaSimulationTag
): Promise<{ success: boolean; data?: SigaAnalysisResponseData; error?: string }> {
  try {
    const updateResult = await updateSigaAnalysis(processNumber, {
      tags: [simulationTag],
    });

    if (updateResult.success && updateResult.data) {
      return { success: true, data: updateResult.data };
    }
  } catch (err) {
    console.warn('[SIGA GR] Upstream simulation failed, applying fallback local state simulation:', err);
  }

  // Fallback de Simulação Local: caso o servidor upstream (ex: staging AWS 503) esteja offline
  try {
    const currentList = await fetchSigaRequests();
    const existing = currentList.find(r => r.processNumber === processNumber);
    if (!existing) {
      return { success: false, error: 'Processo não encontrado no histórico local.' };
    }

    let nextState = existing.state;
    let issues = existing.rawAnalysis?.issues || [];
    let comments = existing.rawAnalysis?.comments || [];
    let denialReason = existing.denialReason;

    if (simulationTag === 'simulate_approval') {
      nextState = 'approved';
    } else if (simulationTag === 'simulate_denial') {
      nextState = 'denied';
      denialReason = 'Não recomendado pelo gerenciador de risco (Simulação).';
    } else if (simulationTag === 'simulate_authorization') {
      nextState = 'authorized_by_manager';
    } else if (simulationTag === 'simulate_comment') {
      nextState = 'under_analysis';
      comments = [
        ...comments,
        {
          id: Date.now(),
          body: 'Analista SIGA GR: Documentação conferida, aguardando liberação final.',
          created_at: new Date().toISOString(),
          user: { name: 'Central de Risco (Simulação)' }
        }
      ];
    } else if (simulationTag === 'simulate_issue') {
      nextState = 'pending';
      issues = [
        ...issues,
        {
          id: Date.now(),
          description: 'Foto do CRLV com baixa nitidez. Favor reenviar documento legível.',
          solved: false,
          created_at: new Date().toISOString()
        }
      ];
    }

    const updatedRaw: any = {
      ...(existing.rawAnalysis || {}),
      state: nextState,
      denial_reason: denialReason,
      issues,
      comments,
    };

    const updatedRecord: SigaRequestRecord = {
      ...existing,
      state: nextState,
      denialReason,
      issuesCount: issues.length,
      unsolvedIssuesCount: issues.filter((i: any) => !i.solved).length,
      commentsCount: comments.length,
      updatedAt: new Date().toISOString(),
      concludedAt: ['approved', 'denied', 'authorized_by_manager'].includes(nextState) ? new Date().toISOString() : null,
      rawAnalysis: updatedRaw,
    };

    await upsertSigaRequest(updatedRecord);
    return { success: true, data: updatedRaw };
  } catch (localErr: any) {
    return { success: false, error: localErr?.message || 'Falha ao atualizar estado da simulação.' };
  }
}

/**
 * Utilitário: Monta o input de criação automática a partir dos objetos do sistema Transcunha.
 */
export function buildSigaCreateInputFromContext(
  productName: SigaProduct,
  driver?: Driver | null,
  vehicle?: Vehicle | null,
  requesterEmail?: string
): SigaCreateAnalysisInput {
  const vehicleType = mapVehicleTypeToSiga(vehicle?.bodyType || vehicle?.setType);

  return {
    product_name: productName,
    requester_email: requesterEmail || 'operacao@transcunha.com.br',
    driver_personal_document: formatCpf(driver?.cpf || ''),
    vehicle_type: vehicleType,
    truck_license_plate: cleanPlate(vehicle?.plate || ''),
    trailer_1_license_plate: undefined,
    trailer_2_license_plate: undefined,
    trailer_3_license_plate: undefined,
    business_unit: undefined,
    tags: [],
  };
}

/**
 * Utilitário: Retorna o label amigável e badge de cor para o estado da análise SIGA GR.
 */
export function getSigaStateBadgeInfo(state: string): { label: string; bg: string; text: string; border: string } {
  switch (state) {
    case 'approved':
      return { label: 'Concluída (Aprovado)', bg: 'bg-emerald-500/10 dark:bg-emerald-950/40', text: 'text-emerald-700 dark:text-emerald-400', border: 'border-emerald-500/20' };
    case 'authorized_by_manager':
      return { label: 'Autorizado pelo Gestor', bg: 'bg-teal-500/10 dark:bg-teal-950/40', text: 'text-teal-700 dark:text-teal-400', border: 'border-teal-500/20' };
    case 'denied':
      return { label: 'Encerrada (Não Recomendado)', bg: 'bg-red-500/10 dark:bg-red-950/40', text: 'text-red-700 dark:text-red-400', border: 'border-red-500/20' };
    case 'pending':
      return { label: 'Com Pendências', bg: 'bg-amber-500/10 dark:bg-amber-950/40', text: 'text-amber-700 dark:text-amber-400', border: 'border-amber-500/20' };
    case 'awaiting_analysis':
      return { label: 'Aguardando Análise', bg: 'bg-blue-500/10 dark:bg-blue-950/40', text: 'text-blue-700 dark:text-blue-400', border: 'border-blue-500/20' };
    case 'awaiting_reanalysis':
      return { label: 'Aguardando Reanálise', bg: 'bg-indigo-500/10 dark:bg-indigo-950/40', text: 'text-indigo-700 dark:text-indigo-400', border: 'border-indigo-500/20' };
    case 'under_analysis':
      return { label: 'Em Análise', bg: 'bg-purple-500/10 dark:bg-purple-950/40', text: 'text-purple-700 dark:text-purple-400', border: 'border-purple-500/20' };
    case 'draft':
    default:
      return { label: 'Rascunho', bg: 'bg-gray-500/10 dark:bg-gray-800/40', text: 'text-gray-700 dark:text-gray-300', border: 'border-gray-500/20' };
  }
}
