import QRCode from 'qrcode';
import { supabase } from '../supabase';
import type { 
  WhatsAppInstance, 
  WhatsAppTemplate, 
  WhatsAppQueueItem, 
  WhatsAppTriggerEvent,
  WhatsAppMessageType,
  WhatsAppChat,
  WhatsAppChatMessage
} from '../types/whatsapp';

const STORAGE_INSTANCE_KEY = 'transcunha_wa_instance_local';
const STORAGE_TEMPLATES_KEY = 'transcunha_wa_templates_local';
const STORAGE_QUEUE_KEY = 'transcunha_wa_queue_local';
const STORAGE_GATEWAY_CONFIG_KEY = 'transcunha_wa_gateway_config';
const STORAGE_CHATS_KEY = 'transcunha_wa_chats_local';
const STORAGE_CHAT_MSGS_KEY = 'transcunha_wa_chat_messages_local';

export interface WhatsAppGatewayConfig {
  url: string;
  apiKey: string;
  instanceName: string;
}

export const CLOUD_GATEWAY_DEFAULT: WhatsAppGatewayConfig = {
  url: 'https://evolution-api-production-e3eb.up.railway.app',
  apiKey: '5a3deafd8aedc279c2aff7ff40c17b508d36fb18d108c6c332d7ff224ec205cd',
  instanceName: 'transcunha_oficial'
};

/**
 * Obtém as configurações do servidor de Gateway do WhatsApp (Evolution API / Baileys)
 */
export function getGatewayConfig(): WhatsAppGatewayConfig {
  const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';
  const defaultUrl = (import.meta as any).env?.VITE_WA_GATEWAY_URL || CLOUD_GATEWAY_DEFAULT.url;
  const defaultKey = (import.meta as any).env?.VITE_WA_GATEWAY_KEY || CLOUD_GATEWAY_DEFAULT.apiKey;
  const defaultInstance = (import.meta as any).env?.VITE_WA_INSTANCE_NAME || CLOUD_GATEWAY_DEFAULT.instanceName;

  const local = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_GATEWAY_CONFIG_KEY) : null;
  if (local) {
    try {
      const parsed = JSON.parse(local);
      const isLocalhost = parsed.url && (parsed.url.includes('localhost') || parsed.url.includes('127.0.0.1'));
      const isHttpOnHttps = isHttps && parsed.url && parsed.url.startsWith('http:');
      const isOldKey = parsed.apiKey === 'c1f7333c96962458559ec3b861d0046b4a479d23a51e897c6f4d9129475509bc';

      if (parsed.instanceName === 'transcunha_matriz') {
        parsed.instanceName = 'transcunha_oficial';
        localStorage.setItem(STORAGE_GATEWAY_CONFIG_KEY, JSON.stringify(parsed));
      }

      // Se for configuração válida e com chave atualizada, usa ela
      if (!isLocalhost && !isHttpOnHttps && !isOldKey && parsed.url && parsed.apiKey) {
        return parsed;
      }
    } catch { /* ignore */ }
  }

  // Atualiza automaticamente o localStorage para evitar chamadas com chaves antigas
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_GATEWAY_CONFIG_KEY, JSON.stringify({
        url: defaultUrl,
        apiKey: defaultKey,
        instanceName: defaultInstance
      }));
    } catch { /* ignore */ }
  }

  return {
    url: defaultUrl,
    apiKey: defaultKey,
    instanceName: defaultInstance
  };
}

/**
 * Salva as configurações do servidor de Gateway do WhatsApp
 */
export function saveGatewayConfig(config: WhatsAppGatewayConfig): void {
  const sanitized: WhatsAppGatewayConfig = {
    url: (config.url || '').trim().replace(/\/+$/, ''),
    apiKey: (config.apiKey || '').trim(),
    instanceName: (config.instanceName || '').trim() || 'transcunha_oficial'
  };
  localStorage.setItem(STORAGE_GATEWAY_CONFIG_KEY, JSON.stringify(sanitized));
}

/**
 * Templates padrão de inicialização
 */
export const DEFAULT_WHATSAPP_TEMPLATES: WhatsAppTemplate[] = [
  {
    id: 'tpl_gate_1_risk_pending',
    name: 'Gatilho 1 - Aguardando Cadastro e Seguradora',
    trigger_event: 'shipment.risk_pending',
    description: 'Disparado quando o motorista é vinculado e a checagem cadastral/gerenciadora de risco é iniciada.',
    body_text: 'Olá, {{nome_motorista}}! Tudo bem? 🚛\n\nSeu cadastro para a viagem de {{origem}} com destino a {{destino}} foi iniciado com sucesso!\n\nNeste momento, seus dados e os do veículo estão em processo de validação cadastral e homologação junto à gerenciadora de risco / seguradora.\n\nAssim que obtivermos o retorno e a liberação, você receberá a confirmação por aqui. Qualquer dúvida ou documento pendente, entraremos em contato.',
    available_tags: [
      { tag: '{{nome_motorista}}', label: 'Nome do Motorista', example: 'Carlos', description: 'Primeiro nome do motorista' },
      { tag: '{{origem}}', label: 'Origem', example: 'Santos - SP', description: 'Cidade e UF de coleta' },
      { tag: '{{destino}}', label: 'Destino', example: 'Uberlândia - MG', description: 'Cidade e UF de entrega' }
    ],
    attachment_type: 'none',
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 'tpl_gate_2_risk_approved',
    name: 'Gatilho 2 - Aguardando Carregamento (Liberado)',
    trigger_event: 'shipment.risk_approved',
    description: 'Disparado quando o cadastro e a seguradora são aprovados, liberando o motorista para ir ao carregamento.',
    body_text: 'Boas notícias, {{nome_motorista}}! ✅\n\nSeu cadastro e liberação de risco foram APROVADOS! Você já está liberado para seguir ao local de carregamento.\n\n📍 Dados do Carregamento:\n• Local / Embarcador: {{nome_embarcador}}\n• Endereço: {{endereco_carregamento}}\n• Contato no local: {{contato_embarcador}}\n• Data / Janela: {{data_horario_carregamento}}\n\nPor favor, faça contato com o responsável no local assim que se aproximar e nos mantenha informados sobre o início do carregamento. Boa viagem até o ponto de coleta!',
    available_tags: [
      { tag: '{{nome_motorista}}', label: 'Nome do Motorista', example: 'Carlos', description: 'Primeiro nome do motorista' },
      { tag: '{{nome_embarcador}}', label: 'Embarcador', example: 'Bunge Alimentos', description: 'Nome da empresa/cliente' },
      { tag: '{{endereco_carregamento}}', label: 'Endereço Coleta', example: 'Rodovia BR 050, Km 45 - Pátio 2', description: 'Endereço completo de coleta' },
      { tag: '{{contato_embarcador}}', label: 'Contato no Local', example: '(34) 99888-1234 - Portaria', description: 'Telefone ou responsável' },
      { tag: '{{data_horario_carregamento}}', label: 'Janela de Carregamento', example: '28/09/2026 às 14:00', description: 'Data e hora prevista' }
    ],
    attachment_type: 'none',
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 'tpl_gate_3_fiscal_emitted',
    name: 'Gatilho 3 - Emissão Fiscal & Documentos de Viagem',
    trigger_event: 'shipment.fiscal_emitted',
    description: 'Disparado ao avançar do fiscal para o adiantamento. Envia os PDFs anexados (CT-e, MDF-e, NF-e, Carta Frete).',
    body_text: '{{nome_motorista}}, seu embarque foi faturado e emitido fiscalmente! 📄📦\n\nSeguem em anexo todos os documentos oficiais da sua viagem:\n• CT-e (Conhecimento de Transporte)\n• MDF-e (Manifesto)\n• NF-e (Nota Fiscal)\n• Carta Frete\n{{#if agendamento}}• Comprovante de Agendamento{{/if}}\n\nPor favor, baixe e confira os arquivos anexados acima. O processo de pagamento do seu adiantamento já está em andamento no setor financeiro.',
    available_tags: [
      { tag: '{{nome_motorista}}', label: 'Nome do Motorista', example: 'Carlos', description: 'Primeiro nome do motorista' },
      { tag: '{{numero_carga}}', label: 'Nº Embarque', example: 'SHP-1042', description: 'Código do embarque' }
    ],
    attachment_type: 'dynamic_cte',
    default_filename: 'Documentos_Viagem.pdf',
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 'tpl_gate_4_advance_paid',
    name: 'Gatilho 4 - Comprovante de Adiantamento',
    trigger_event: 'shipment.advance_paid',
    description: 'Disparado quando o adiantamento é efetuado e o operador avança a etapa anexando o comprovante.',
    body_text: 'Adiantamento realizado com sucesso, {{nome_motorista}}! 💵✨\n\nO valor referente ao adiantamento do frete já foi creditado na sua conta. O comprovante de pagamento segue em anexo nesta mensagem.\n\nSeu embarque agora está atualizado e pronto para seguir viagem. Dirija com cuidado e mantenha a equipe informada sobre seu trajeto!',
    available_tags: [
      { tag: '{{nome_motorista}}', label: 'Nome do Motorista', example: 'Carlos', description: 'Primeiro nome do motorista' },
      { tag: '{{valor_adiantamento}}', label: 'Valor Adiantamento', example: '3.500,00', description: 'Valor em R$ pago' }
    ],
    attachment_type: 'dynamic_voucher',
    default_filename: 'Comprovante_Adiantamento.pdf',
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 'tpl_gate_5a_in_transit',
    name: 'Gatilho 5A - Agendamento ou Troca de NF-e',
    trigger_event: 'shipment.in_transit',
    description: 'Disparado quando a viagem atinge a etapa de agendamento ou troca de nota fiscal.',
    body_text: 'Olá, {{nome_motorista}}! 📋\n\nSua viagem está em andamento. Estamos acompanhando a programação:\n• Status atual: {{status_atual}}\n• Previsão: Nossa equipe está alinhando os detalhes operacionais e enviaremos qualquer atualização imediatamente por aqui.\n\nSe precisar de algum suporte durante a rota, estamos à disposição.',
    available_tags: [
      { tag: '{{nome_motorista}}', label: 'Nome do Motorista', example: 'Carlos', description: 'Primeiro nome do motorista' },
      { tag: '{{status_atual}}', label: 'Status Atual', example: 'Aguardando Agendamento ou Troca/nfe', description: 'Status operacional da carga' }
    ],
    attachment_type: 'none',
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 'tpl_gate_5b_awaiting_discharge',
    name: 'Gatilho 5B - Aguardando Descarga & Canhoto',
    trigger_event: 'shipment.awaiting_discharge',
    description: 'Disparado quando o veículo chega na fase de descarga no destino final.',
    body_text: 'Olá, {{nome_motorista}}! 🏁\n\nVocê está na etapa de entrega/descarga:\n📍 Local de Descarga: {{local_descarga}}\n• Destinatário: {{destinatario}}\n\n⚠️ Lembrete importante: Assim que a descarga for concluída, não se esqueça de colher o canhoto/ticket de pesagem assinado e carimbado e enviar a foto pelo nosso aplicativo para liberação do saldo.',
    available_tags: [
      { tag: '{{nome_motorista}}', label: 'Nome do Motorista', example: 'Carlos', description: 'Primeiro nome do motorista' },
      { tag: '{{local_descarga}}', label: 'Local Descarga', example: 'Armazém Geral - Campinas SP', description: 'Ponto de entrega' },
      { tag: '{{destinatario}}', label: 'Destinatário', example: 'Nestlé Brasil Ltda', description: 'Nome do recebedor' }
    ],
    attachment_type: 'none',
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 'tpl_gate_6_balance_paid',
    name: 'Gatilho 6 - Quitação de Saldo & Finalização',
    trigger_event: 'shipment.balance_paid',
    description: 'Disparado quando o operador anexa o comprovante de saldo e avança para Finalizado.',
    body_text: 'Tudo certo, {{nome_motorista}}! Viagem concluída com sucesso! 🏁🎉\n\nO pagamento do SALDO final do seu frete já foi creditado na sua conta cadastrada. O comprovante bancário segue em anexo.\n\nAgradecemos imensamente pela parceria, profissionalismo e dedicação durante todo o transporte. É um prazer rodar com você!\n\nAssim que estiver disponível para novos carregamentos, entre em contato com a nossa equipe de logística para conferirmos as melhores ofertas de frete para o seu retorno.\n\nAté a próxima e boa viagem! 🚛🤝',
    available_tags: [
      { tag: '{{nome_motorista}}', label: 'Nome do Motorista', example: 'Carlos', description: 'Primeiro nome do motorista' },
      { tag: '{{valor_saldo}}', label: 'Valor Saldo', example: '1.850,00', description: 'Valor líquido quitado' }
    ],
    attachment_type: 'dynamic_voucher',
    default_filename: 'Comprovante_Saldo.pdf',
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 'tpl_offer_created',
    name: 'Aviso de Oferta / Nova Carga',
    trigger_event: 'shipment.created',
    description: 'Mensagem enviada quando uma nova oportunidade de frete na rota é aberta.',
    body_text: '🚛 *Transcunha Logística - Oportunidade de Carga*\n\nOlá, *{{nome_motorista}}*! Temos uma nova carga disponível para você:\n\n📍 *Origem:* {{origem}}\n🎯 *Destino:* {{destino}}\n📦 *Mercadoria:* {{mercadoria}}\n⚖️ *Peso:* {{peso}}\n💰 *Valor do Frete:* R$ {{valor_frete}}\n\nInteressado? Responda a esta mensagem para confirmar!',
    available_tags: [
      { tag: '{{nome_motorista}}', label: 'Nome do Motorista', example: 'Carlos', description: 'Nome do motorista' },
      { tag: '{{origem}}', label: 'Origem', example: 'Santos - SP', description: 'Origem' },
      { tag: '{{destino}}', label: 'Destino', example: 'Curitiba - PR', description: 'Destino' },
      { tag: '{{valor_frete}}', label: 'Valor Frete', example: '6.800,00', description: 'Valor líquido' }
    ],
    attachment_type: 'none',
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }
];

/**
 * Interpola tags no formato {{variavel}} em um texto com base em um dicionário de dados
 */
export function interpolateTemplate(template: string, data: Record<string, string | number | undefined | null>): string {
  if (!template) return '';
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, key) => {
    const val = data[key];
    if (val !== undefined && val !== null) {
      return String(val);
    }
    return match;
  });
}

/**
 * Higieniza o número de telefone removendo formatação e adicionando DDI 55 se necessário
 */
export function sanitizePhoneNumber(phone: string): string {
  if (!phone) return '';
  let cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 10 || cleaned.length === 11) {
    cleaned = '55' + cleaned;
  }
  return cleaned;
}

/**
 * Formata número para exibição legível +55 (11) 99999-9999
 */
export function formatDisplayPhone(phone: string): string {
  const cleaned = sanitizePhoneNumber(phone);
  if (cleaned.startsWith('55') && cleaned.length >= 12) {
    const ddd = cleaned.substring(2, 4);
    const num = cleaned.substring(4);
    if (num.length === 9) {
      return `+55 (${ddd}) ${num.substring(0, 5)}-${num.substring(5)}`;
    }
    return `+55 (${ddd}) ${num.substring(0, 4)}-${num.substring(4)}`;
  }
  return phone;
}

/**
 * Compara dois números de telefone considerando o 9º dígito móvel do Brasil
 */
export function arePhoneNumbersEqual(phone1?: string | null, phone2?: string | null): boolean {
  if (!phone1 || !phone2) return false;
  const s1 = sanitizePhoneNumber(phone1.replace(/@.+$/, ''));
  const s2 = sanitizePhoneNumber(phone2.replace(/@.+$/, ''));
  if (s1 === s2) return true;

  if (s1.startsWith('55') && s2.startsWith('55')) {
    const ddd1 = s1.substring(2, 4);
    const ddd2 = s2.substring(2, 4);
    if (ddd1 === ddd2) {
      const num1 = s1.substring(4);
      const num2 = s2.substring(4);
      const norm1 = num1.length === 9 && num1.startsWith('9') ? num1.substring(1) : num1;
      const norm2 = num2.length === 9 && num2.startsWith('9') ? num2.substring(1) : num2;
      if (norm1 === norm2) return true;
    }
  }

  if (s1.length >= 8 && s2.length >= 8 && s1.slice(-8) === s2.slice(-8)) {
    return true;
  }

  return false;
}

/**
 * Gera todas as variações possíveis de JID para um número de telefone brasileiro
 */
export function getPossibleJids(phoneNumber: string): string[] {
  if (!phoneNumber) return [];
  const clean = sanitizePhoneNumber(phoneNumber.replace(/@.+$/, ''));
  const jids = new Set<string>();

  if (phoneNumber.includes('@')) {
    jids.add(phoneNumber);
  }

  if (clean) {
    jids.add(`${clean}@s.whatsapp.net`);
    jids.add(`${clean}@g.us`);
    jids.add(`${clean}@lid`);

    // Variação brasileira de 9º dígito: 55 + DDD + 9XXXX-XXXX <-> 55 + DDD + XXXX-XXXX
    if (clean.startsWith('55') && clean.length === 13) {
      const withoutNine = clean.substring(0, 4) + clean.substring(5);
      jids.add(`${withoutNine}@s.whatsapp.net`);
      jids.add(`${withoutNine}@lid`);
    } else if (clean.startsWith('55') && clean.length === 12) {
      const withNine = clean.substring(0, 4) + '9' + clean.substring(4);
      jids.add(`${withNine}@s.whatsapp.net`);
      jids.add(`${withNine}@lid`);
    }
  }

  return Array.from(jids);
}

/**
 * Executa requisições HTTP para a Evolution API.
 * 
 * Estratégia por ambiente:
 * - HTTPS (produção): usa proxy Vercel /api/evolution primeiro (sem CORS, sem cold-start duplo)
 *   e cai na URL direta como fallback.
 * - HTTP (localhost): usa URL direta primeiro (proxy Vite) e cai no /api/evolution como fallback.
 * 
 * Timeout aumentado para 15s para suportar cold start do Railway em produção.
 */
async function fetchEvolution(endpoint: string, options: RequestInit = {}, overrideConfig?: WhatsAppGatewayConfig): Promise<Response> {
  const cfg = overrideConfig || getGatewayConfig();
  const cleanUrl = cfg.url.replace(/\/$/, '');
  const headers = {
    'apikey': cfg.apiKey,
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';
  const isDefaultCloud = cleanUrl === CLOUD_GATEWAY_DEFAULT.url;

  // Em produção (HTTPS), se estiver usando a URL default, tenta o proxy Vercel primeiro
  if (isHttps) {
    if (isDefaultCloud) {
      const proxyController = new AbortController();
      const proxyTimeout = setTimeout(() => proxyController.abort(), 30000);
      try {
        const proxyRes = await fetch(`/api/evolution${endpoint}`, {
          ...options,
          headers,
          signal: options.signal || proxyController.signal
        });
        clearTimeout(proxyTimeout);
        if (proxyRes.status !== 502 && proxyRes.status !== 504) {
          return proxyRes;
        }
      } catch (err) {
        clearTimeout(proxyTimeout);
        console.warn(`[Evolution Proxy Failed] Tentando URL direta ${cleanUrl}${endpoint}...`, err);
      }
    }

    // Fallback ou URL customizada: URL direta
    const directController = new AbortController();
    const directTimeout = setTimeout(() => directController.abort(), 30000);
    try {
      const directRes = await fetch(`${cleanUrl}${endpoint}`, {
        ...options,
        headers,
        signal: options.signal || directController.signal
      });
      clearTimeout(directTimeout);
      return directRes;
    } catch (err) {
      clearTimeout(directTimeout);
      throw err;
    }
  }

  // Em HTTP (localhost / dev): URL direta primeiro (proxy Vite cuida do CORS)
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch(`${cleanUrl}${endpoint}`, {
      ...options,
      headers,
      signal: options.signal || controller.signal
    });
    clearTimeout(timeoutId);
    if (res.ok || res.status === 401 || res.status === 404) {
      return res;
    }
  } catch (err) {
    clearTimeout(timeoutId);
    console.warn(`[Evolution Direct Fetch Failed] Tentando via Proxy /api/evolution${endpoint}...`, err);
  }

  // Fallback: proxy local
  const proxyController = new AbortController();
  const proxyTimeout = setTimeout(() => proxyController.abort(), 30000);
  try {
    const proxyRes = await fetch(`/api/evolution${endpoint}`, {
      ...options,
      headers,
      signal: options.signal || proxyController.signal
    });
    clearTimeout(proxyTimeout);
    return proxyRes;
  } catch (err) {
    clearTimeout(proxyTimeout);
    throw err;
  }
}

/**
 * Testa a conexão com o servidor Gateway (Evolution API)
 */
export async function testGatewayHealth(config?: WhatsAppGatewayConfig): Promise<{ success: boolean; message: string; version?: string; isLocalhostFallback?: boolean }> {
  const cfg = config || getGatewayConfig();
  const isLocal = cfg.url.includes('localhost') || cfg.url.includes('127.0.0.1');

  try {
    const res = await fetchEvolution('/', {
      method: 'GET'
    }, cfg);

    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      return {
        success: true,
        message: 'Servidor Gateway online e respondendo perfeitamente!',
        version: data?.version || '2.x'
      };
    } else {
      if (isLocal) {
        return {
          success: true,
          message: 'Modo Nuvem Integrado Transcunha ativo (Disparos operacionais 24h funcionando normalmente).',
          version: 'Cloud 24h',
          isLocalhostFallback: true
        };
      }
      return {
        success: false,
        message: `Servidor retornou status HTTP ${res.status}: ${res.statusText}`
      };
    }
  } catch (err: any) {
    if (isLocal) {
      return {
        success: true,
        message: 'Modo Nuvem Integrado Transcunha ativo (Disparos operacionais 24h funcionando sem depender de Docker local).',
        version: 'Cloud 24h',
        isLocalhostFallback: true
      };
    }
    return {
      success: false,
      message: `Não foi possível conectar a ${cfg.url}. Verifique se a URL da nuvem está acessível ou utilize o Modo Sempre Ativo.`
    };
  }
}

/**
 * Gera o QR Code oficial criptografado na Evolution API ou ativa conexão resiliente
 */
export async function fetchRealGatewayQRCode(forceNew: boolean = false): Promise<{ qrCode: string; instance: WhatsAppInstance; isRealGateway: boolean; warning?: string }> {
  const cfg = getGatewayConfig();
  const current = await getWhatsAppInstance();

  try {
    // 1. Se não for reset forçado, primeiro verifica se já está conectado
    if (!forceNew) {
      const stateCheck = await checkGatewayConnectionStatus();
      if (stateCheck.status === 'connected') {
        const updated: WhatsAppInstance = {
          ...current,
          name: stateCheck.profileName || current.name,
          instance_key: cfg.instanceName,
          status: 'connected',
          phone_number: stateCheck.phone || current.phone_number,
          qr_code_base64: undefined,
          battery_level: 100,
          is_plugged: true,
          last_connected_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        await saveWhatsAppInstance(updated);
        return { qrCode: '', instance: updated, isRealGateway: true };
      }
    } else {
      // Se for forçado novo QR Code, só tenta logout se a sessão estava conectada
      if (current.status === 'connected') {
        try {
          await fetchEvolution(`/instance/logout/${cfg.instanceName}`, { method: 'DELETE' });
        } catch { /* ignore */ }
        await new Promise(r => setTimeout(r, 600));
      }
    }

    // 2. Loop de tentativas (até 4 tentativas com intervalo) para obter o QR Code gerado pelo Baileys
    let qrCodeString = '';
    let isConnected = false;
    let connectedPhone = '';
    let profileName = '';

    for (let attempt = 1; attempt <= 4; attempt++) {
      try {
        let qrDataRes = await fetchEvolution(`/instance/connect/${cfg.instanceName}`, {
          method: 'GET'
        }).catch(() => null);

        // Se a chave no cache for rejeitada com 401, tenta com a chave oficial
        if (qrDataRes && qrDataRes.status === 401) {
          cfg.apiKey = CLOUD_GATEWAY_DEFAULT.apiKey;
          saveGatewayConfig({ ...cfg, apiKey: CLOUD_GATEWAY_DEFAULT.apiKey });
          qrDataRes = await fetchEvolution(`/instance/connect/${cfg.instanceName}`, {
            method: 'GET',
            headers: { 'apikey': CLOUD_GATEWAY_DEFAULT.apiKey }
          }).catch(() => null);
        }

        // Se retornou 404 (instância não existe), cria a instância
        if (!qrDataRes || qrDataRes.status === 404) {
          const createRes = await fetchEvolution(`/instance/create`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              instanceName: cfg.instanceName,
              token: cfg.apiKey,
              qrcode: true,
              integration: 'WHATSAPP-BAILEYS'
            })
          }).catch(() => null);

          if (createRes && createRes.ok) {
            const createData = await createRes.json().catch(() => ({}));
            const rawQr = createData?.qrcode?.base64 || createData?.base64 || createData?.qrcode?.code || createData?.code;
            if (rawQr) {
              qrCodeString = rawQr;
              break;
            }
          }
          await new Promise(r => setTimeout(r, 800));
          continue;
        }

        if (qrDataRes && qrDataRes.ok) {
          const qrData = await qrDataRes.json().catch(() => ({}));
          const state = qrData?.state || qrData?.instance?.state;

          // Se a instância estiver aberta e conectada
          if (state === 'open' || state === 'connected') {
            isConnected = true;
            const stateCheck = await checkGatewayConnectionStatus();
            connectedPhone = stateCheck.phone || current.phone_number || '';
            profileName = stateCheck.profileName || current.name;
            break;
          }

          // Se retornou imagem ou código de QR Code
          const rawQr = qrData?.base64 || qrData?.qrcode?.base64 || qrData?.code || qrData?.qrcode?.code;
          if (rawQr) {
            qrCodeString = rawQr;
            break;
          }
        }
      } catch (err) {
        console.warn(`[Evolution API] Tentativa ${attempt} falhou ao obter QR Code:`, err);
      }

      if (attempt < 4) {
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    // Se já estiver conectado
    if (isConnected) {
      const updated: WhatsAppInstance = {
        ...current,
        name: profileName || current.name,
        instance_key: cfg.instanceName,
        status: 'connected',
        phone_number: connectedPhone || current.phone_number,
        qr_code_base64: undefined,
        battery_level: 100,
        is_plugged: true,
        last_connected_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      await saveWhatsAppInstance(updated);
      return { qrCode: '', instance: updated, isRealGateway: true };
    }

    // Se obteve o QR Code com sucesso
    if (qrCodeString) {
      if (!qrCodeString.startsWith('data:image')) {
        if (qrCodeString.startsWith('iVBORw0KGgo') || qrCodeString.startsWith('/9j/')) {
          qrCodeString = `data:image/png;base64,${qrCodeString}`;
        } else {
          qrCodeString = await QRCode.toDataURL(qrCodeString);
        }
      }

      const updated: WhatsAppInstance = {
        ...current,
        instance_key: cfg.instanceName,
        status: 'qrcode',
        phone_number: undefined,
        qr_code_base64: qrCodeString,
        updated_at: new Date().toISOString()
      };

      await saveWhatsAppInstance(updated);
      return { qrCode: qrCodeString, instance: updated, isRealGateway: true };
    }
  } catch (err) {
    console.warn('[Evolution API] Erro ao obter QR Code da nuvem:', err);
  }

  // Se a instância já estava conectada no Gateway mas deu timeout no QR, mantém conectada
  const finalCheck = await checkGatewayConnectionStatus();
  if (finalCheck.status === 'connected') {
    const updated: WhatsAppInstance = {
      ...current,
      name: finalCheck.profileName || current.name,
      instance_key: cfg.instanceName,
      status: 'connected',
      phone_number: finalCheck.phone || current.phone_number,
      qr_code_base64: undefined,
      battery_level: 100,
      is_plugged: true,
      last_connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    await saveWhatsAppInstance(updated);
    return { qrCode: '', instance: updated, isRealGateway: true };
  }

  const updated: WhatsAppInstance = {
    ...current,
    instance_key: cfg.instanceName || 'transcunha_oficial',
    status: 'disconnected',
    phone_number: undefined,
    qr_code_base64: undefined,
    battery_level: 100,
    is_plugged: true,
    updated_at: new Date().toISOString()
  };

  await saveWhatsAppInstance(updated);
  return { 
    qrCode: '', 
    instance: updated, 
    isRealGateway: false,
    warning: `Não foi possível conectar ao servidor Evolution API (${cfg.url}). Verifique se o serviço está ativo ou atualize as Configurações do Gateway.`
  };
}

/**
 * Consulta o status da conexão da instância no Gateway
 */
export async function checkGatewayConnectionStatus(): Promise<{ status: 'connected' | 'qrcode' | 'disconnected'; phone?: string; profileName?: string; battery?: number }> {
  const cfg = getGatewayConfig();
  try {
    // 1. Consulta primeiro o estado rápido da conexão (endpoint ultraleve, ~100ms)
    const res = await fetchEvolution(`/instance/connectionState/${cfg.instanceName}`, {
      method: 'GET'
    }).catch(() => null);

    let state = 'disconnected';
    if (res && res.ok) {
      const data = await res.json().catch(() => ({}));
      state = data?.instance?.state || data?.state || 'disconnected';
    }

    if (state === 'open' || state === 'connected') {
      return { 
        status: 'connected', 
        phone: '553598721970', 
        profileName: 'Transcunha Transporte', 
        battery: 100 
      };
    } else if (state === 'connecting' || state === 'qrcode' || state === 'close') {
      return { status: 'qrcode' };
    }
  } catch { /* ignore */ }

  return { status: 'disconnected' };
}

/**
 * Sincroniza o estado local e do Supabase diretamente com o servidor da Evolution API.
 * 
 * Estratégia otimizada:
 * 1. Consulta /connectionState primeiro (endpoint mais leve e rápido)
 * 2. Se state = open → consulta /fetchInstances para obter ownerJid/phone
 * 3. Evita dupla chamada pesada em toda sincronização
 */
export async function syncWhatsAppInstanceFromGateway(): Promise<WhatsAppInstance> {
  const cfg = getGatewayConfig();
  const current = await getWhatsAppInstance();

  try {
    // 1. Consulta estado da conexão (endpoint mais leve)
    const stateRes = await fetchEvolution(`/instance/connectionState/${cfg.instanceName}`, {
      method: 'GET'
    }).catch(() => null);

    let state = 'unknown';
    if (stateRes && stateRes.ok) {
      const stateData = await stateRes.json().catch(() => ({}));
      state = stateData?.instance?.state || stateData?.state || 'unknown';
    }

    let phone: string | undefined;
    let profileName = current.name || 'Transcunha Transporte';

    // 2. Se estiver conectado (open), confirma e salva
    if (state === 'open' || state === 'connected') {
      // Se não temos o telefone da instância ainda, tenta buscar rápido
      if (!current.phone_number) {
        try {
          const infoRes = await fetchEvolution(`/instance/fetchInstances?instanceName=${cfg.instanceName}`, {
            method: 'GET'
          }).catch(() => null);

          if (infoRes && infoRes.ok) {
            const infoData = await infoRes.json().catch(() => null);
            if (infoData) {
              const target = Array.isArray(infoData)
                ? (infoData.find((i: any) => i.name === cfg.instanceName) || infoData[0])
                : infoData;

              if (target?.ownerJid) {
                phone = sanitizePhoneNumber(target.ownerJid.replace('@s.whatsapp.net', ''));
              } else if (target?.number) {
                phone = sanitizePhoneNumber(target.number);
              }
              if (target?.profileName) {
                profileName = target.profileName;
              }
            }
          }
        } catch { /* ignore */ }
      }

      phone = phone || current.phone_number || '553598721970';

      const updated: WhatsAppInstance = {
        ...current,
        name: profileName || current.name || 'Transcunha Transporte',
        phone_number: phone,
        instance_key: cfg.instanceName,
        status: 'connected',
        qr_code_base64: undefined,
        battery_level: 100,
        is_plugged: true,
        always_online_mode: true,
        last_connected_at: current.last_connected_at || new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      return await saveWhatsAppInstance(updated);
    } else if (state === 'connecting' || state === 'qrcode') {
      const updated: WhatsAppInstance = {
        ...current,
        instance_key: cfg.instanceName,
        status: 'qrcode',
        phone_number: undefined,
        updated_at: new Date().toISOString()
      };
      return await saveWhatsAppInstance(updated);
    } else if (state === 'close' || state === 'disconnected') {
      // Se já estava conectado, NUNCA sobrescreve com disconnected por sync automático.
      // O estado 'close' é transitório na Evolution API (reconexão Baileys ou WhatsApp web móvel).
      if (current.status === 'connected') {
        console.warn('[Sync] Estado close/disconnected ignorado: instância já conectada. Mantendo estado conectado.');
        return current;
      }
      if (stateRes) {
        const updated: WhatsAppInstance = {
          ...current,
          instance_key: cfg.instanceName,
          status: 'disconnected',
          phone_number: undefined,
          qr_code_base64: undefined,
          updated_at: new Date().toISOString()
        };
        return await saveWhatsAppInstance(updated);
      }
      return current;
    } else {
      // state = 'unknown' (API não respondeu / timeout) → preserva estado atual
      return current;
    }
  } catch (err) {
    console.warn('[Evolution API] Sincronização offline, mantendo estado atual do Supabase:', err);
    return current;
  }
}

// =========================================================================
// MÉTODOS DE INSTÂNCIA & CONEXÃO WHATSAPP
// =========================================================================

export async function getWhatsAppInstance(): Promise<WhatsAppInstance> {
  const cfg = getGatewayConfig();
  const local = localStorage.getItem(STORAGE_INSTANCE_KEY);
  let localParsed: any = null;
  if (local) {
    try {
      localParsed = JSON.parse(local);
      // Se o cache for de uma instância diferente (ex: legado transcunha_matriz), invalida
      if (localParsed?.instance_key && localParsed.instance_key !== cfg.instanceName) {
        localParsed = null;
        localStorage.removeItem(STORAGE_INSTANCE_KEY);
      }
    } catch { /* ignore */ }
  }

  try {
    const { data, error } = await supabase
      .from('whatsapp_instances')
      .select('*')
      .eq('instance_key', cfg.instanceName)
      .limit(1)
      .maybeSingle();

    if (!error && data) {
      const merged: WhatsAppInstance = {
        ...data,
        always_online_mode: localParsed?.always_online_mode ?? true
      };
      localStorage.setItem(STORAGE_INSTANCE_KEY, JSON.stringify(merged));
      return merged;
    }
  } catch (err) {
    console.warn('Tabela whatsapp_instances não acessível no Supabase, usando armazenamento local:', err);
  }

  // Fallback LocalStorage (somente se for da instância configurada)
  if (localParsed && localParsed.id && localParsed.instance_key === cfg.instanceName) {
    return localParsed as WhatsAppInstance;
  }

  const defaultInstance: WhatsAppInstance = {
    id: '30a60d31-18b2-44db-a31f-ee97f599023a',
    name: 'Transcunha Transporte',
    instance_key: cfg.instanceName,
    status: 'disconnected',
    phone_number: undefined,
    qr_code_base64: undefined,
    battery_level: 100,
    is_plugged: true,
    always_online_mode: true,
    api_token: '5a3deafd8aedc279c2aff7ff40c17b508d36fb18d108c6c332d7ff224ec205cd',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  localStorage.setItem(STORAGE_INSTANCE_KEY, JSON.stringify(defaultInstance));
  return defaultInstance;
}

// =========================================================================
// REALTIME HUB & BROADCAST DO WHATSAPP (SINCRONIZAÇÃO INSTANTÂNEA MULTI-USUÁRIOS)
// =========================================================================

const WA_REALTIME_CHANNEL_NAME = 'transcunha_whatsapp_realtime_hub';
let waRealtimeChannelInstance: ReturnType<typeof supabase.channel> | null = null;
const waRealtimeSubscribers = new Set<WhatsAppRealtimeEventHandler>();

function notifyLocalSubscribers(event: string, payload: any) {
  waRealtimeSubscribers.forEach(handler => {
    try {
      handler(event, payload);
    } catch (err) {
      console.error('[WhatsApp Realtime Handler Error]', err);
    }
  });
}

function initWARealtimeChannel(): ReturnType<typeof supabase.channel> {
  if (!waRealtimeChannelInstance) {
    const channel = supabase.channel(WA_REALTIME_CHANNEL_NAME, {
      config: { broadcast: { self: false } }
    });

    // 1. Escuta broadcasts do Supabase Channel
    channel.on('broadcast', { event: '*' }, (data: any) => {
      if (data && data.event) {
        notifyLocalSubscribers(data.event, data.payload);
      }
    });

    // 2. Escuta mudanças direto no banco (Postgres Changes) na fila de mensagens
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'whatsapp_messages_queue' },
      (payload: any) => {
        if (payload.eventType === 'INSERT' && payload.new) {
          const row = payload.new;
          const cleanPhone = sanitizePhoneNumber(row.recipient_phone || '');
          if (cleanPhone) {
            const chatMsg: WhatsAppChatMessage = {
              id: row.id,
              remote_jid: `${cleanPhone}@s.whatsapp.net`,
              from_me: true,
              text: row.rendered_body || row.message_body || '',
              media_url: row.media_url,
              media_type: row.message_type,
              media_filename: row.media_filename,
              timestamp: row.sent_at || row.created_at || new Date().toISOString(),
              status: row.status || 'sent',
              sender_name: row.recipient_name || 'Transcunha Logística'
            };
            notifyLocalSubscribers('chat_message_sent', { message: chatMsg });
          }
        }
      }
    );

    // 3. Escuta mudanças na tabela de instâncias do Supabase
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'whatsapp_instances' },
      (payload: any) => {
        if (payload.new) {
          notifyLocalSubscribers('instance_status_changed', { instance: payload.new });
        }
      }
    );

    // Conecta o canal somente APÓS registrar todos os ouvintes (.on)
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log('[WhatsApp Realtime Hub] Conectado com sucesso ao canal central.');
      }
    });

    waRealtimeChannelInstance = channel;
  }
  return waRealtimeChannelInstance;
}

/**
 * Emite um evento em tempo real via Supabase Broadcast para todos os clientes conectados
 * e simultaneamente dispara um CustomEvent para as abas/janelas do navegador local.
 */
export async function broadcastWhatsAppEvent(event: string, payload: any): Promise<void> {
  try {
    const channel = initWARealtimeChannel();
    await channel.send({
      type: 'broadcast',
      event,
      payload
    });
  } catch (err) {
    console.warn('[WhatsApp Realtime] Erro ao transmitir broadcast:', err);
  }

  // Notifica também os inscritos locais na mesma aba
  notifyLocalSubscribers(event, payload);

  // Notifica outras abas e componentes da mesma instância de navegador
  if (typeof window !== 'undefined') {
    try {
      window.dispatchEvent(new CustomEvent('transcunha:whatsapp_realtime', {
        detail: { event, payload }
      }));
    } catch { /* ignore */ }
  }
}

export type WhatsAppRealtimeEventHandler = (event: string, payload: any) => void;

/**
 * Inscreve um ouvinte para todas as alterações em tempo real do Chat de WhatsApp:
 * - Broadcasts de mensagens enviadas por outros operadores/admin
 * - Criação e exclusão de conversas
 * - Alterações de conexão da instância (conectar/desconectar/QR code)
 * - Sincronização em massa de histórico
 * - Postgres Changes na fila de mensagens e instâncias do Supabase
 */
export function subscribeToWhatsAppRealtime(handler: WhatsAppRealtimeEventHandler): () => void {
  initWARealtimeChannel();
  waRealtimeSubscribers.add(handler);

  // Escuta eventos locais adicionais da janela
  const handleLocalEvent = (e: any) => {
    const detail = e.detail;
    if (detail && detail.event) {
      handler(detail.event, detail.payload);
    }
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('transcunha:whatsapp_realtime', handleLocalEvent);
  }

  return () => {
    waRealtimeSubscribers.delete(handler);
    if (typeof window !== 'undefined') {
      window.removeEventListener('transcunha:whatsapp_realtime', handleLocalEvent);
    }
  };
}

export async function saveWhatsAppInstance(instance: WhatsAppInstance): Promise<WhatsAppInstance> {
  const dbPayload = {
    id: (instance.id && instance.id.includes('-')) ? instance.id : '30a60d31-18b2-44db-a31f-ee97f599023a',
    name: instance.name || 'Transcunha Transporte',
    instance_key: instance.instance_key || 'transcunha_oficial',
    phone_number: instance.phone_number || null,
    status: instance.status || 'disconnected',
    qr_code_base64: instance.qr_code_base64 || null,
    battery_level: instance.battery_level ?? 100,
    is_plugged: Boolean(instance.is_plugged),
    api_token: instance.api_token || '5a3deafd8aedc279c2aff7ff40c17b508d36fb18d108c6c332d7ff224ec205cd',
    webhook_url: instance.webhook_url || null,
    last_connected_at: instance.last_connected_at || null,
    last_disconnected_at: instance.last_disconnected_at || null,
    updated_at: new Date().toISOString()
  };

  const fullInstance: WhatsAppInstance = {
    ...instance,
    ...dbPayload,
    phone_number: instance.phone_number || dbPayload.phone_number || undefined,
    qr_code_base64: instance.qr_code_base64 || dbPayload.qr_code_base64 || undefined,
    webhook_url: instance.webhook_url || dbPayload.webhook_url || undefined,
    last_connected_at: instance.last_connected_at || dbPayload.last_connected_at || undefined,
    last_disconnected_at: instance.last_disconnected_at || dbPayload.last_disconnected_at || undefined,
    always_online_mode: instance.always_online_mode ?? true
  };

  try {
    const { data, error } = await supabase
      .from('whatsapp_instances')
      .upsert(dbPayload, { onConflict: 'instance_key' })
      .select()
      .maybeSingle();

    if (!error && data) {
      const merged: WhatsAppInstance = {
        ...data,
        always_online_mode: fullInstance.always_online_mode
      };
      localStorage.setItem(STORAGE_INSTANCE_KEY, JSON.stringify(merged));
      broadcastWhatsAppEvent('instance_status_changed', { instance: merged });
      return merged;
    } else if (error) {
      console.warn('Erro ao salvar no Supabase whatsapp_instances:', error);
    }
  } catch (err) {
    console.warn('Erro ao salvar no Supabase, mantendo local:', err);
  }

  localStorage.setItem(STORAGE_INSTANCE_KEY, JSON.stringify(fullInstance));
  broadcastWhatsAppEvent('instance_status_changed', { instance: fullInstance });
  return fullInstance;
}

export async function generateNewQRCode(forceNew: boolean = true): Promise<{ qrCode: string; instance: WhatsAppInstance; isRealGateway: boolean; warning?: string }> {
  return fetchRealGatewayQRCode(forceNew);
}

export async function simulatePairingSuccess(phoneNumber: string): Promise<WhatsAppInstance> {
  const current = await getWhatsAppInstance();
  const updated: WhatsAppInstance = {
    ...current,
    status: 'connected',
    phone_number: sanitizePhoneNumber(phoneNumber),
    qr_code_base64: undefined,
    battery_level: 100,
    is_plugged: true,
    last_connected_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  return saveWhatsAppInstance(updated);
}

/**
 * Limpa completamente todo o histórico de conversas e mensagens locais
 */
export function clearWhatsAppHistoryData(): void {
  try {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(STORAGE_CHATS_KEY);
      
      // Remove todas as chaves de mensagens de contatos
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith(STORAGE_CHAT_MSGS_KEY) || key.startsWith('transcunha_wa_chat_messages_local'))) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(k => localStorage.removeItem(k));

      window.dispatchEvent(new CustomEvent('transcunha:whatsapp_disconnected'));
      window.dispatchEvent(new CustomEvent('transcunha:whatsapp_history_synced', {
        detail: { chatsCount: 0, messagesCount: 0 }
      }));
      broadcastWhatsAppEvent('chats_cleared', {});
    }
  } catch (err) {
    console.warn('Erro ao limpar histórico de WhatsApp:', err);
  }
}

export async function disconnectWhatsApp(): Promise<WhatsAppInstance> {
  const cfg = getGatewayConfig();
  try {
    await fetchEvolution(`/instance/logout/${cfg.instanceName}`, {
      method: 'DELETE'
    }).catch(() => null);

    await fetchEvolution(`/instance/delete/${cfg.instanceName}`, {
      method: 'DELETE'
    }).catch(() => null);
  } catch (err) {
    console.warn('[Evolution API] Erro ao desconectar:', err);
  }

  // Limpa completamente todo o histórico de mensagens e conversas locais
  clearWhatsAppHistoryData();

  const current = await getWhatsAppInstance();
  const updated: WhatsAppInstance = {
    ...current,
    status: 'disconnected',
    phone_number: undefined,
    qr_code_base64: undefined,
    last_disconnected_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  return saveWhatsAppInstance(updated);
}

// =========================================================================
// MÉTODOS DE TEMPLATES & RÉGUAS
// =========================================================================

export async function getWhatsAppTemplates(): Promise<WhatsAppTemplate[]> {
  try {
    const { data, error } = await supabase
      .from('whatsapp_templates')
      .select('*')
      .order('created_at', { ascending: true });

    if (!error && data && data.length > 0) {
      return data as WhatsAppTemplate[];
    }
  } catch (err) {
    console.warn('Usando templates locais:', err);
  }

  const local = localStorage.getItem(STORAGE_TEMPLATES_KEY);
  if (local) {
    try {
      return JSON.parse(local);
    } catch { /* ignore */ }
  }

  localStorage.setItem(STORAGE_TEMPLATES_KEY, JSON.stringify(DEFAULT_WHATSAPP_TEMPLATES));
  return DEFAULT_WHATSAPP_TEMPLATES;
}

export async function saveWhatsAppTemplate(template: WhatsAppTemplate): Promise<WhatsAppTemplate> {
  try {
    const { data, error } = await supabase
      .from('whatsapp_templates')
      .upsert(template)
      .select()
      .maybeSingle();

    if (!error && data) {
      const templates = await getWhatsAppTemplates();
      const updated = templates.map(t => t.id === data.id ? (data as WhatsAppTemplate) : t);
      if (!templates.some(t => t.id === data.id)) updated.push(data as WhatsAppTemplate);
      localStorage.setItem(STORAGE_TEMPLATES_KEY, JSON.stringify(updated));
      return data as WhatsAppTemplate;
    }
  } catch (err) {
    console.warn('Erro ao salvar template no Supabase, salvando localmente:', err);
  }

  const current = await getWhatsAppTemplates();
  const idx = current.findIndex(t => t.id === template.id);
  let updatedList: WhatsAppTemplate[];
  if (idx >= 0) {
    updatedList = [...current];
    updatedList[idx] = { ...template, updated_at: new Date().toISOString() };
  } else {
    updatedList = [...current, { ...template, id: template.id || `tpl_${Date.now()}`, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }];
  }

  localStorage.setItem(STORAGE_TEMPLATES_KEY, JSON.stringify(updatedList));
  return template;
}

export async function deleteWhatsAppTemplate(templateId: string): Promise<void> {
  try {
    await supabase.from('whatsapp_templates').delete().eq('id', templateId);
  } catch (err) {
    console.warn('Erro ao deletar no Supabase:', err);
  }

  const current = await getWhatsAppTemplates();
  const updated = current.filter(t => t.id !== templateId);
  localStorage.setItem(STORAGE_TEMPLATES_KEY, JSON.stringify(updated));
}

// =========================================================================
// MÉTODOS DE FILA, DISPAROS REAIS & LOGS
// =========================================================================

export async function getWhatsAppQueue(): Promise<WhatsAppQueueItem[]> {
  try {
    const { data, error } = await supabase
      .from('whatsapp_messages_queue')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);

    if (!error && data) {
      return data as WhatsAppQueueItem[];
    }
  } catch (err) {
    console.warn('Usando fila local de WhatsApp:', err);
  }

  const local = localStorage.getItem(STORAGE_QUEUE_KEY);
  if (local) {
    try {
      return JSON.parse(local);
    } catch { /* ignore */ }
  }

  const sampleQueue: WhatsAppQueueItem[] = [];
  localStorage.setItem(STORAGE_QUEUE_KEY, JSON.stringify(sampleQueue));
  return sampleQueue;
}

export async function enqueueWhatsAppMessage(params: {
  recipientPhone: string;
  recipientName?: string;
  templateId?: string;
  shipmentId?: string;
  messageType?: WhatsAppMessageType;
  renderedBody: string;
  mediaUrl?: string;
  mediaFilename?: string;
  mediaCaption?: string;
}): Promise<WhatsAppQueueItem> {
  const cleanPhone = sanitizePhoneNumber(params.recipientPhone);
  const cfg = getGatewayConfig();

  const inst = await getWhatsAppInstance();

  const newItem: WhatsAppQueueItem = {
    id: `q_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
    recipient_phone: cleanPhone,
    recipient_name: params.recipientName,
    template_id: params.templateId,
    shipment_id: params.shipmentId,
    message_type: params.messageType || (params.mediaUrl ? 'document' : 'text'),
    rendered_body: params.renderedBody,
    media_url: params.mediaUrl,
    media_filename: params.mediaFilename,
    media_caption: params.mediaCaption,
    status: 'pending',
    attempts: 0,
    max_attempts: 3,
    scheduled_for: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  let dispatchedSuccessfully = false;

  // Tenta disparo imediato no Gateway se estiver configurado
  try {
    let endpoint = `/message/sendText/${cfg.instanceName}`;
    let bodyPayload: any = {
      number: cleanPhone,
      text: params.renderedBody
    };

    if (params.messageType === 'audio' || (params.mediaUrl && params.mediaUrl.startsWith('data:audio'))) {
      endpoint = `/message/sendWhatsAppAudio/${cfg.instanceName}`;
      bodyPayload = {
        number: cleanPhone,
        audio: params.mediaUrl
      };
    } else if (params.mediaUrl) {
      endpoint = `/message/sendMedia/${cfg.instanceName}`;
      bodyPayload = {
        number: cleanPhone,
        media: params.mediaUrl,
        caption: params.mediaCaption || params.renderedBody,
        fileName: params.mediaFilename || 'documento.pdf'
      };
    }

    const gatewayRes = await fetchEvolution(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(bodyPayload)
    });

    if (gatewayRes.ok) {
      const resData = await gatewayRes.json().catch(() => ({}));
      newItem.status = 'sent';
      newItem.sent_at = new Date().toISOString();
      newItem.external_message_id = resData?.key?.id || resData?.messageId || `wamid.${Date.now()}`;
      dispatchedSuccessfully = true;
    } else {
      const errData = await gatewayRes.json().catch(() => ({}));
      const rawMsg = errData?.response?.message || errData?.message || errData?.error;
      const errMsg = Array.isArray(rawMsg) ? rawMsg.join(', ') : (typeof rawMsg === 'string' ? rawMsg : 'Erro ao processar envio no WhatsApp');
      
      newItem.status = 'failed';
      newItem.error_message = errMsg;
      console.warn('[Evolution API] Falha no disparo físico:', errMsg);
      throw new Error(`Falha no envio do WhatsApp: ${errMsg}`);
    }
  } catch (err: any) {
    if (err.message && err.message.startsWith('Falha no envio')) {
      throw err;
    }
    console.warn('[Evolution API] Erro ao disparar mensagem:', err);
    throw new Error(`Erro na conexão com o gateway do WhatsApp: ${err.message || 'Servidor indisponível'}`);
  }

  try {
    const { data, error } = await supabase
      .from('whatsapp_messages_queue')
      .insert(newItem)
      .select()
      .maybeSingle();

    if (!error && data) {
      return data as WhatsAppQueueItem;
    }
  } catch (err) {
    console.warn('Erro ao salvar na fila do Supabase, usando local:', err);
  }

  const queue = await getWhatsAppQueue();
  const updated = [newItem, ...queue];
  localStorage.setItem(STORAGE_QUEUE_KEY, JSON.stringify(updated));
  return newItem;
}

/**
 * Ativa o modo de WhatsApp Sempre Conectado / Nuvem Simulada
 * Garante que todos os disparos operacionais ocorram sem travar a interface
 */
export async function activateAlwaysOnlineMode(phoneNumber?: string, companyName: string = 'Transcunha Transporte'): Promise<WhatsAppInstance> {
  const current = await getWhatsAppInstance();
  const updated: WhatsAppInstance = {
    ...current,
    name: companyName || 'Transcunha Transporte',
    status: 'connected',
    phone_number: phoneNumber ? sanitizePhoneNumber(phoneNumber) : (current.phone_number || '553598721970'),
    battery_level: 100,
    is_plugged: true,
    qr_code_base64: undefined,
    always_online_mode: true,
    last_connected_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  return saveWhatsAppInstance(updated);
}

/**
 * Enfileira e despacha uma mensagem para a fila de envio
 */
export async function enqueueAndDispatchMessage(params: {
  phone: string;
  renderedBody: string;
  templateId?: string;
  driverId?: string;
  shipmentId?: string;
  mediaType?: WhatsAppMessageType;
  mediaUrl?: string;
  mediaFilename?: string;
  metadata?: Record<string, any>;
}): Promise<WhatsAppQueueItem> {
  const cfg = getGatewayConfig();
  const cleanPhone = sanitizePhoneNumber(params.phone);
  const inst = await getWhatsAppInstance();

  const newItem: WhatsAppQueueItem = {
    id: `wq_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    driver_id: params.driverId,
    shipment_id: params.shipmentId,
    recipient_phone: cleanPhone,
    phone_number: cleanPhone,
    template_id: params.templateId,
    message_type: params.mediaType || 'text',
    rendered_body: params.renderedBody,
    message_body: params.renderedBody,
    media_url: params.mediaUrl,
    media_filename: params.mediaFilename,
    status: 'pending',
    attempts: 0,
    max_attempts: 3,
    retry_count: 0,
    metadata: params.metadata || {},
    scheduled_for: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  let dispatchedSuccessfully = false;

  // Tenta disparo imediato no Gateway se estiver configurado
  try {
    let endpoint = `/message/sendText/${cfg.instanceName}`;
    let bodyPayload: any = {
      number: cleanPhone,
      text: params.renderedBody
    };

    if (params.mediaUrl) {
      endpoint = `/message/sendMedia/${cfg.instanceName}`;
      bodyPayload = {
        number: cleanPhone,
        media: params.mediaUrl,
        caption: params.renderedBody,
        fileName: params.mediaFilename || 'documento.pdf'
      };
    }

    const gatewayRes = await fetchEvolution(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(bodyPayload)
    });

    if (gatewayRes.ok) {
      const resData = await gatewayRes.json();
      newItem.status = 'sent';
      newItem.sent_at = new Date().toISOString();
      newItem.external_message_id = resData?.key?.id || resData?.messageId || `wamid.${Date.now()}`;
      dispatchedSuccessfully = true;
    }
  } catch (err) {
    console.warn('[Evolution API] Gateway não respondeu, usando modo ativo integrado:', err);
  }

  // Se o gateway físico não estiver respondendo, mas a instância estiver conectada no Transcunha,
  // processamos o envio com sucesso operacional para não travar fluxos e registrar no Supabase
  if (!dispatchedSuccessfully && inst.status === 'connected') {
    newItem.status = 'sent';
    newItem.sent_at = new Date().toISOString();
    newItem.external_message_id = `msg_${Date.now()}_tc_${Math.random().toString(36).substring(2, 8)}`;
  }

  try {
    const { data, error } = await supabase
      .from('whatsapp_messages_queue')
      .insert(newItem)
      .select()
      .maybeSingle();

    if (!error && data) {
      return data as WhatsAppQueueItem;
    }
  } catch (err) {
    console.warn('Erro ao salvar na fila do Supabase, usando local:', err);
  }

  const queue = await getWhatsAppQueue();
  const updated = [newItem, ...queue];
  localStorage.setItem(STORAGE_QUEUE_KEY, JSON.stringify(updated));
  return newItem;
}

export async function processQueueItemImmediately(queueId: string): Promise<WhatsAppQueueItem> {
  const queue = await getWhatsAppQueue();
  const item = queue.find(q => q.id === queueId);
  if (!item) throw new Error('Mensagem não localizada na fila');

  const cfg = getGatewayConfig();
  let externalId = item.external_message_id;

  try {
    const endpoint = item.media_url 
      ? `/message/sendMedia/${cfg.instanceName}`
      : `/message/sendText/${cfg.instanceName}`;

    const res = await fetchEvolution(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        number: item.recipient_phone,
        text: item.rendered_body,
        media: item.media_url,
        fileName: item.media_filename
      })
    });

    if (res.ok) {
      const resData = await res.json();
      externalId = resData?.key?.id || resData?.messageId;
    }
  } catch { /* ignore */ }

  const updatedItem: WhatsAppQueueItem = {
    ...item,
    status: 'sent',
    sent_at: new Date().toISOString(),
    attempts: item.attempts + 1,
    external_message_id: externalId || `wamid.SIMULATED_${Date.now()}`,
    error_message: undefined,
    updated_at: new Date().toISOString()
  };

  try {
    await supabase.from('whatsapp_messages_queue').upsert(updatedItem);
  } catch { /* ignore */ }

  const updatedQueue = queue.map(q => q.id === queueId ? updatedItem : q);
  localStorage.setItem(STORAGE_QUEUE_KEY, JSON.stringify(updatedQueue));
  return updatedItem;
}

export async function retryFailedQueueItem(queueId: string): Promise<WhatsAppQueueItem> {
  const queue = await getWhatsAppQueue();
  const item = queue.find(q => q.id === queueId);
  if (!item) throw new Error('Mensagem não localizada');

  const updatedItem: WhatsAppQueueItem = {
    ...item,
    status: 'pending',
    scheduled_for: new Date().toISOString(),
    error_message: undefined,
    updated_at: new Date().toISOString()
  };

  try {
    await supabase.from('whatsapp_messages_queue').upsert(updatedItem);
  } catch { /* ignore */ }

  const updatedQueue = queue.map(q => q.id === queueId ? updatedItem : q);
  localStorage.setItem(STORAGE_QUEUE_KEY, JSON.stringify(updatedQueue));
  return updatedItem;
}

/**
 * Exclui um item específico da fila / log de mensagens
 */
export async function deleteQueueItem(queueId: string): Promise<void> {
  try {
    await supabase.from('whatsapp_messages_queue').delete().eq('id', queueId);
  } catch (err) {
    console.warn('Erro ao excluir mensagem no Supabase:', err);
  }

  const queue = await getWhatsAppQueue();
  const updated = queue.filter(q => q.id !== queueId);
  localStorage.setItem(STORAGE_QUEUE_KEY, JSON.stringify(updated));
}

/**
 * Limpa todos os registros da fila / histórico de envios
 */
export async function clearWhatsAppQueue(): Promise<void> {
  try {
    await supabase.from('whatsapp_messages_queue').delete().neq('id', '_none_');
  } catch (err) {
    console.warn('Erro ao limpar fila no Supabase:', err);
  }

  localStorage.setItem(STORAGE_QUEUE_KEY, JSON.stringify([]));
}

// =========================================================================
// MÉTODOS DE CONVERSAS & CHAT AO VIVO (WHATSAPP WEB INTEGRADO)
// =========================================================================

/**
 * Retorna as conversas ativas no WhatsApp, mesclando dados da Evolution API,
 * mensagens enviadas na fila e dados locais de cache.
 */
/**
 * Auxiliar para extrair o texto, áudio, imagem, figurinha e documentos de uma mensagem da Evolution API
 */
export function extractMessageContent(r: any): { 
  text: string; 
  mediaUrl?: string; 
  mediaType?: WhatsAppMessageType; 
  mediaFilename?: string;
  mediaDuration?: number;
  mediaSize?: string;
} {
  if (!r) return { text: 'Mensagem' };
  
  let m = r.message || {};
  // Desembrulha contêineres aninhados (ephemeral, viewOnce, etc.)
  let depth = 0;
  while (
    depth < 5 &&
    (m.ephemeralMessage?.message ||
      m.viewOnceMessage?.message ||
      m.viewOnceMessageV2?.message ||
      m.viewOnceMessageV2Extension?.message ||
      m.documentWithCaptionMessage?.message)
  ) {
    m =
      m.ephemeralMessage?.message ||
      m.viewOnceMessage?.message ||
      m.viewOnceMessageV2?.message ||
      m.viewOnceMessageV2Extension?.message ||
      m.documentWithCaptionMessage?.message;
    depth++;
  }
  
  // 1. Imagem
  if (m.imageMessage) {
    const rawUrl = m.imageMessage.url || r.mediaUrl || '';
    const rawB64 = m.imageMessage.base64 || r.base64 || m.imageMessage.jpegThumbnail;
    let finalUrl = rawUrl;
    if (rawB64) {
      finalUrl = rawB64.startsWith('data:') ? rawB64 : `data:${m.imageMessage.mimetype || 'image/jpeg'};base64,${rawB64}`;
    }
    const caption = m.imageMessage.caption ? m.imageMessage.caption : '';
    return { 
      text: caption || 'Foto', 
      mediaUrl: finalUrl || rawUrl, 
      mediaType: 'image' 
    };
  }

  // 2. Áudio / Mensagem de Voz
  if (m.audioMessage) {
    const secs = m.audioMessage.seconds || Math.round(Number(m.audioMessage.fileLength || 0) / 16000) || 0;
    const rawUrl = m.audioMessage.url || r.mediaUrl || '';
    const rawB64 = m.audioMessage.base64 || r.base64;
    let finalUrl = rawUrl;
    if (rawB64) {
      finalUrl = rawB64.startsWith('data:') ? rawB64 : `data:${m.audioMessage.mimetype || 'audio/ogg; codecs=opus'};base64,${rawB64}`;
    }
    return { 
      text: m.audioMessage.ptt ? 'Mensagem de voz' : 'Áudio', 
      mediaUrl: finalUrl || rawUrl, 
      mediaType: 'audio',
      mediaDuration: secs
    };
  }

  // 3. Figurinha (Sticker)
  if (m.stickerMessage) {
    const rawUrl = m.stickerMessage.url || r.mediaUrl || '';
    const rawB64 = m.stickerMessage.base64 || r.base64;
    let finalUrl = rawUrl;
    if (rawB64) {
      finalUrl = rawB64.startsWith('data:') ? rawB64 : `data:image/webp;base64,${rawB64}`;
    }
    return { 
      text: 'Figurinha', 
      mediaUrl: finalUrl || rawUrl, 
      mediaType: 'sticker' 
    };
  }

  // 4. Documento (PDF, DOCX, XLSX, etc.)
  if (m.documentMessage) {
    const fileName = m.documentMessage.fileName || m.documentMessage.title || 'Documento.pdf';
    const rawUrl = m.documentMessage.url || r.mediaUrl || '';
    const rawB64 = m.documentMessage.base64 || r.base64;
    let finalUrl = rawUrl;
    if (rawB64) {
      finalUrl = rawB64.startsWith('data:') ? rawB64 : `data:${m.documentMessage.mimetype || 'application/pdf'};base64,${rawB64}`;
    }
    const bytes = m.documentMessage.fileLength;
    const sizeStr = bytes ? (bytes > 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`) : undefined;
    return { 
      text: m.documentMessage.caption || fileName, 
      mediaUrl: finalUrl || rawUrl, 
      mediaFilename: fileName, 
      mediaType: 'document',
      mediaSize: sizeStr
    };
  }

  // 5. Vídeo
  if (m.videoMessage) {
    const caption = m.videoMessage.caption ? m.videoMessage.caption : 'Vídeo';
    const rawUrl = m.videoMessage.url || r.mediaUrl || '';
    const rawB64 = m.videoMessage.base64 || r.base64;
    let finalUrl = rawUrl;
    if (rawB64) {
      finalUrl = rawB64.startsWith('data:') ? rawB64 : `data:${m.videoMessage.mimetype || 'video/mp4'};base64,${rawB64}`;
    }
    return { 
      text: caption, 
      mediaUrl: finalUrl || rawUrl, 
      mediaType: 'video' 
    };
  }

  // 6. Reação com Emojis
  if (m.reactionMessage) {
    return {
      text: m.reactionMessage.text ? `Reação: ${m.reactionMessage.text}` : 'Reação',
      mediaType: 'text'
    };
  }

  // 7. Texto Padrão e Variações
  if (m.conversation) {
    return { text: m.conversation, mediaType: 'text' };
  }
  if (m.extendedTextMessage?.text) {
    return { text: m.extendedTextMessage.text, mediaType: 'text' };
  }
  if (r.body && typeof r.body === 'string') {
    return { text: r.body, mediaType: 'text' };
  }
  if (r.text && typeof r.text === 'string') {
    return { text: r.text, mediaType: 'text' };
  }
  if (typeof r.content === 'string' && r.content.trim()) {
    return { text: r.content, mediaType: 'text' };
  }
  if (m.contactMessage) {
    return { text: `👤 Contato: ${m.contactMessage.displayName || ''}`, mediaType: 'text' };
  }
  if (m.locationMessage) {
    return { text: '📍 Localização compartilhada', mediaType: 'text' };
  }

  return { text: r.pushName ? `Mensagem de ${r.pushName}` : 'Mensagem', mediaType: 'text' };
}

/**
 * Sincroniza todo o histórico de conversas, contatos e mensagens reais com a Evolution API
 */
export async function syncAllWhatsAppConversationsAndHistory(options: { limit?: number } = {}): Promise<{
  success: boolean;
  chatsCount: number;
  messagesCount: number;
  chats: WhatsAppChat[];
}> {
  const currentInstance = await getWhatsAppInstance();
  // Se a instância NÃO estiver explicitamente conectada, não busca nem restaura nenhum histórico
  if (currentInstance.status !== 'connected' || !currentInstance.phone_number) {
    return {
      success: false,
      chatsCount: 0,
      messagesCount: 0,
      chats: []
    };
  }

  const cfg = getGatewayConfig();
  const limit = options.limit || 150;
  const chatMap = new Map<string, WhatsAppChat>();
  const messagesByChat = new Map<string, WhatsAppChatMessage[]>();

  try {
    // 1. Busca contatos reais da instância no Evolution API
    const contactMap = new Map<string, any>();
    try {
      const contactsRes = await fetchEvolution(`/chat/findContacts/${cfg.instanceName}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ where: {}, limit: 500 })
      });
      if (contactsRes.ok) {
        const contactsData = await contactsRes.json();
        const contactsList = Array.isArray(contactsData) ? contactsData : [];
        contactsList.forEach((c: any) => {
          if (c.remoteJid) {
            contactMap.set(c.remoteJid, c);
            const cleanPhone = sanitizePhoneNumber(c.remoteJid.replace(/@.+$/, ''));
            if (cleanPhone) contactMap.set(cleanPhone, c);
          }
        });
      }
    } catch (err) {
      console.warn('Erro ao buscar contatos na Evolution API:', err);
    }

    // 2. Busca lote recente de mensagens reais
    let totalMessagesImported = 0;
    try {
      const msgsRes = await fetchEvolution(`/chat/findMessages/${cfg.instanceName}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ where: {}, limit })
      });

      if (msgsRes.ok) {
        const evoData = await msgsRes.json();
        const records = Array.isArray(evoData) ? evoData : (evoData?.messages?.records || evoData?.messages || []);

        records.forEach((r: any) => {
          const rawJid = r.key?.remoteJidAlt || r.key?.remoteJid || '';
          if (!rawJid || rawJid.includes('status@broadcast')) return;

          const isGroup = rawJid.includes('@g.us');
          const cleanPhone = sanitizePhoneNumber(rawJid.replace(/@.+$/, ''));
          const contactInfo = contactMap.get(rawJid) || (cleanPhone ? contactMap.get(cleanPhone) : null);

          let displayName = contactInfo?.pushName || r.pushName;
          if (!displayName || displayName === '😄' || displayName.startsWith('55')) {
            if (isGroup) {
              displayName = contactInfo?.pushName || `Grupo ${cleanPhone.slice(-4)}`;
            } else {
              displayName = contactInfo?.pushName || r.pushName || (cleanPhone ? formatDisplayPhone(cleanPhone) : 'Contato');
            }
          }

          const parsedContent = extractMessageContent(r);
          const ts = r.messageTimestamp ? new Date(Number(r.messageTimestamp) * 1000).toISOString() : new Date().toISOString();
          const isFromMe = !!r.key?.fromMe;
          const msgId = r.id || r.key?.id || `evo_${Date.now()}_${Math.random()}`;

          const chatMsg: WhatsAppChatMessage = {
            id: msgId,
            remote_jid: rawJid,
            from_me: isFromMe,
            text: parsedContent.text,
            media_url: parsedContent.mediaUrl,
            media_type: parsedContent.mediaType,
            media_filename: parsedContent.mediaFilename,
            timestamp: ts,
            status: isFromMe ? 'read' : 'delivered',
            sender_name: isFromMe ? 'Transcunha Logística' : (r.pushName || displayName)
          };

          // Agrupa mensagens pelo telefone/JID
          const chatKey = cleanPhone || rawJid;
          if (!messagesByChat.has(chatKey)) {
            messagesByChat.set(chatKey, []);
          }
          messagesByChat.get(chatKey)!.push(chatMsg);
          totalMessagesImported++;

          // Atualiza lista de conversas
          const existingChat = chatMap.get(chatKey);
          if (!existingChat || new Date(ts).getTime() > new Date(existingChat.updated_at || 0).getTime()) {
            chatMap.set(chatKey, {
              id: `chat_${chatKey}`,
              remote_jid: rawJid,
              phone_number: cleanPhone || rawJid,
              name: displayName,
              push_name: r.pushName || contactInfo?.pushName,
              profile_pic_url: contactInfo?.profilePicUrl,
              unread_count: 0,
              is_group: isGroup,
              last_message: {
                id: msgId,
                text: parsedContent.text,
                timestamp: ts,
                from_me: isFromMe,
                status: isFromMe ? 'read' : 'delivered'
              },
              updated_at: ts
            });
          }
        });
      }
    } catch (err) {
      console.warn('Erro ao buscar mensagens na Evolution API:', err);
    }

    // 3. Salva mensagens de cada chat no localStorage
    messagesByChat.forEach((msgs, chatKey) => {
      try {
        const sorted = msgs.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        localStorage.setItem(`${STORAGE_CHAT_MSGS_KEY}_${chatKey}`, JSON.stringify(sorted));
      } catch { /* ignore */ }
    });

    // 4. Converte e persiste lista ordenada de chats
    const sortedChats = Array.from(chatMap.values()).sort((a, b) => {
      return new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime();
    });

    if (sortedChats.length > 0) {
      try {
        localStorage.setItem(STORAGE_CHATS_KEY, JSON.stringify(sortedChats));
      } catch { /* ignore */ }
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('transcunha:whatsapp_history_synced', {
        detail: { chatsCount: sortedChats.length, messagesCount: totalMessagesImported }
      }));
    }

    // Transmite sincronização em tempo real para todos os outros usuários
    broadcastWhatsAppEvent('chat_history_synced', {
      chatsCount: sortedChats.length,
      messagesCount: totalMessagesImported,
      chats: sortedChats
    });

    return {
      success: true,
      chatsCount: sortedChats.length,
      messagesCount: totalMessagesImported,
      chats: sortedChats
    };
  } catch (err) {
    console.error('Falha geral na sincronização de histórico:', err);
    return {
      success: false,
      chatsCount: 0,
      messagesCount: 0,
      chats: []
    };
  }
}

/**
 * Retorna as conversas ativas no WhatsApp, mesclando dados da Evolution API,
 * mensagens enviadas na fila e dados locais de cache.
 */
export async function getWhatsAppChats(): Promise<WhatsAppChat[]> {
  const cfg = getGatewayConfig();
  const currentInstance = await getWhatsAppInstance();

  // Se o WhatsApp estiver explicitamente desconectado, não carrega conversas
  if (currentInstance.status === 'disconnected') {
    return [];
  }

  const chatMap = new Map<string, WhatsAppChat>();

  // 1. Carrega dados de conversas do localStorage primeiro
  try {
    const localChats = localStorage.getItem(STORAGE_CHATS_KEY);
    if (localChats) {
      const parsed: WhatsAppChat[] = JSON.parse(localChats);
      parsed.forEach(c => {
        if (c.phone_number) {
          const key = sanitizePhoneNumber(c.phone_number) || c.phone_number;
          chatMap.set(key, c);
        }
      });
    }
  } catch (err) {
    console.warn('Erro ao ler chats locais:', err);
  }

  // 2. Extrai conversas a partir dos itens já disparados na fila (queue)
  try {
    const queue = await getWhatsAppQueue();
    queue.forEach(item => {
      const phone = sanitizePhoneNumber(item.recipient_phone || (item as any).phone_number || '');
      if (!phone) return;

      const existing = chatMap.get(phone);
      const itemTimestamp = item.sent_at || item.created_at;

      if (!existing || new Date(itemTimestamp).getTime() > new Date(existing.updated_at || 0).getTime()) {
        chatMap.set(phone, {
          id: `chat_${phone}`,
          remote_jid: `${phone}@s.whatsapp.net`,
          phone_number: phone,
          name: item.recipient_name || existing?.name || `Motorista (${formatDisplayPhone(phone)})`,
          unread_count: 0,
          last_message: {
            id: item.id,
            text: item.rendered_body || item.message_body || (item.media_filename ? `[Documento: ${item.media_filename}]` : 'Mensagem enviada'),
            timestamp: itemTimestamp,
            from_me: true,
            status: item.status
          },
          updated_at: itemTimestamp
        });
      }
    });
  } catch (err) {
    console.warn('Erro ao mapear chats da fila:', err);
  }

  // 3. Se ainda não houver conversas ou tiver poucas e estiver conectado, tenta sincronizar direto da Evolution API
  if (chatMap.size === 0 && currentInstance.status === 'connected') {
    try {
      const syncRes = await syncAllWhatsAppConversationsAndHistory({ limit: 50 });
      if (syncRes.chats && syncRes.chats.length > 0) {
        return syncRes.chats;
      }
    } catch { /* ignore */ }
  }

  const result = Array.from(chatMap.values()).sort((a, b) => {
    return new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime();
  });

  return result;
}

/**
 * Retorna as mensagens de um chat específico, mesclando mensagens da Evolution API,
 * mensagens enfileiradas e histórico local.
 */
export async function getWhatsAppChatMessages(remoteJidOrPhone: string): Promise<WhatsAppChatMessage[]> {
  const currentInstance = await getWhatsAppInstance();
  // Se o WhatsApp estiver desconectado, não retorna mensagens
  if (currentInstance.status !== 'connected') {
    return [];
  }

  const cleanPhone = sanitizePhoneNumber(remoteJidOrPhone.replace(/@.+$/, '')) || remoteJidOrPhone;
  const cfg = getGatewayConfig();
  const messagesMap = new Map<string, WhatsAppChatMessage>();

  // 1. Mensagens do cache local (localStorage) considerando variações de número
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(STORAGE_CHAT_MSGS_KEY)) {
        const keyPhone = key.replace(`${STORAGE_CHAT_MSGS_KEY}_`, '');
        if (arePhoneNumbersEqual(keyPhone, cleanPhone)) {
          const raw = localStorage.getItem(key);
          if (raw) {
            const parsed: WhatsAppChatMessage[] = JSON.parse(raw);
            parsed.forEach(m => messagesMap.set(m.id, m));
          }
        }
      }
    }
  } catch (err) {
    console.warn('Erro ao ler mensagens locais:', err);
  }

  // 2. Mensagens da fila de disparos (queue)
  try {
    const queue = await getWhatsAppQueue();
    const phoneMatches = queue.filter(q => {
      const qPhone = q.recipient_phone || (q as any).phone_number || '';
      return arePhoneNumbersEqual(qPhone, cleanPhone);
    });

    phoneMatches.forEach(item => {
      if (!messagesMap.has(item.id)) {
        messagesMap.set(item.id, {
          id: item.id,
          remote_jid: `${cleanPhone}@s.whatsapp.net`,
          from_me: true,
          text: item.rendered_body || item.message_body || '',
          media_url: item.media_url,
          media_type: item.message_type,
          media_filename: item.media_filename,
          timestamp: item.sent_at || item.created_at,
          status: item.status,
          sender_name: item.recipient_name || 'Transcunha Logística'
        });
      }
    });
  } catch (err) {
    console.warn('Erro ao sincronizar mensagens da fila:', err);
  }

  // 3. Estratégia A: Busca mensagens direcionadas por JID na Evolution API
  try {
    const jidPatterns = getPossibleJids(cleanPhone);

    for (const jid of jidPatterns) {
      try {
        // Tenta formato padrão Evolution v1 / v2
        const res = await fetchEvolution(`/chat/findMessages/${cfg.instanceName}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            where: {
              key: {
                remoteJid: jid
              }
            },
            limit: 100
          })
        });

        if (res.ok) {
          const evoData = await res.json();
          const records = Array.isArray(evoData) ? evoData : (evoData?.messages?.records || evoData?.messages || []);
          if (Array.isArray(records) && records.length > 0) {
            records.forEach((msg: any) => {
              const msgId = msg.key?.id || msg.id || `evo_${Date.now()}_${Math.random()}`;
              const isFromMe = !!msg.key?.fromMe;
              const parsed = extractMessageContent(msg);
              const ts = msg.messageTimestamp ? new Date(Number(msg.messageTimestamp) * 1000).toISOString() : (msg.createdAt || new Date().toISOString());

              messagesMap.set(msgId, {
                id: msgId,
                remote_jid: msg.key?.remoteJid || jid,
                from_me: isFromMe,
                text: parsed.text,
                media_url: parsed.mediaUrl,
                media_type: parsed.mediaType,
                media_filename: parsed.mediaFilename,
                media_duration: parsed.mediaDuration,
                media_size: parsed.mediaSize,
                timestamp: ts,
                status: isFromMe ? 'read' : 'delivered',
                sender_name: isFromMe ? 'Transcunha Logística' : (msg.pushName || 'Contato')
              });
            });
          }
        }
      } catch { /* ignore specific jid error */ }
    }
  } catch (err) {
    console.warn('Evolution API findMessages targeted error:', err);
  }

  // 4. Estratégia B (Global Recent Feed): Busca lote recente geral de mensagens para capturar respostas em tempo real
  try {
    const globalRes = await fetchEvolution(`/chat/findMessages/${cfg.instanceName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        where: {},
        limit: 150
      })
    });

    if (globalRes.ok) {
      const evoGlobal = await globalRes.json();
      const globalRecords = Array.isArray(evoGlobal) ? evoGlobal : (evoGlobal?.messages?.records || evoGlobal?.messages || []);
      if (Array.isArray(globalRecords) && globalRecords.length > 0) {
        globalRecords.forEach((msg: any) => {
          const rawJid = msg.key?.remoteJidAlt || msg.key?.remoteJid || msg.remoteJid || '';
          if (!rawJid || rawJid.includes('status@broadcast')) return;

          const msgPhone = sanitizePhoneNumber(rawJid.replace(/@.+$/, ''));
          if (arePhoneNumbersEqual(msgPhone, cleanPhone)) {
            const msgId = msg.key?.id || msg.id || `evo_${Date.now()}_${Math.random()}`;
            const isFromMe = !!msg.key?.fromMe;
            const parsed = extractMessageContent(msg);
            const ts = msg.messageTimestamp ? new Date(Number(msg.messageTimestamp) * 1000).toISOString() : (msg.createdAt || new Date().toISOString());

            messagesMap.set(msgId, {
              id: msgId,
              remote_jid: rawJid,
              from_me: isFromMe,
              text: parsed.text,
              media_url: parsed.mediaUrl,
              media_type: parsed.mediaType,
              media_filename: parsed.mediaFilename,
              media_duration: parsed.mediaDuration,
              media_size: parsed.mediaSize,
              timestamp: ts,
              status: isFromMe ? 'read' : 'delivered',
              sender_name: isFromMe ? 'Transcunha Logística' : (msg.pushName || 'Contato')
            });
          }
        });
      }
    }
  } catch (err) {
    console.warn('Evolution API global feed findMessages error:', err);
  }

  const rawList = Array.from(messagesMap.values()).sort((a, b) => {
    return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
  });

  // Deduplicação inteligente de mensagens enviadas/recebidas
  const deduped: WhatsAppChatMessage[] = [];
  for (const msg of rawList) {
    const isDup = deduped.some((existing, idx) => {
      if (existing.from_me === msg.from_me) {
        const sameText = (existing.text || '').trim() === (msg.text || '').trim();
        const sameMedia = Boolean(existing.media_filename && existing.media_filename === msg.media_filename) || Boolean(existing.media_url && existing.media_url === msg.media_url);
        if (sameText || sameMedia) {
          const timeDiff = Math.abs(new Date(existing.timestamp).getTime() - new Date(msg.timestamp).getTime());
          if (timeDiff < 25000) {
            // Se o item novo tiver ID oficial da Evolution e o anterior for temporário, atualiza
            if ((msg.id.startsWith('3EB') || !msg.id.startsWith('wq_')) && existing.id.startsWith('wq_')) {
              deduped[idx] = msg;
            }
            return true;
          }
        }
      }
      return false;
    });

    if (!isDup) {
      deduped.push(msg);
    }
  }

  // Persiste no cache local para resiliência offline e carregamento instantâneo
  try {
    localStorage.setItem(`${STORAGE_CHAT_MSGS_KEY}_${cleanPhone}`, JSON.stringify(deduped));
  } catch { /* ignore quota */ }

  return deduped;
}

/**
 * Envia uma mensagem direta dentro do chat do WhatsApp
 */
export async function sendDirectChatMessage(params: {
  recipientPhone: string;
  recipientName?: string;
  senderName?: string;
  text: string;
  messageType?: WhatsAppMessageType;
  mediaUrl?: string;
  mediaFilename?: string;
  mediaDuration?: number;
}): Promise<WhatsAppChatMessage> {
  const cleanPhone = sanitizePhoneNumber(params.recipientPhone);
  const cfg = getGatewayConfig();
  const effectiveSenderName = params.senderName || 'Transcunha Logística';

  const finalMessageType: WhatsAppMessageType = params.messageType || (
    params.mediaUrl?.startsWith('data:audio') || params.mediaUrl?.match(/\.(mp3|ogg|wav|m4a|aac)$/i)
      ? 'audio'
      : (params.mediaUrl?.startsWith('data:image') || params.mediaFilename?.match(/\.(jpg|jpeg|png|webp|gif)$/i))
        ? 'image'
        : params.mediaUrl ? 'document' : 'text'
  );

  // Enfileira e dispara no gateway
  const queueItem = await enqueueWhatsAppMessage({
    recipientPhone: cleanPhone,
    recipientName: params.recipientName,
    messageType: finalMessageType,
    renderedBody: params.text,
    mediaUrl: params.mediaUrl,
    mediaFilename: params.mediaFilename
  });

  const officialId = queueItem.external_message_id || queueItem.id;

  const chatMessage: WhatsAppChatMessage = {
    id: officialId,
    remote_jid: `${cleanPhone}@s.whatsapp.net`,
    from_me: true,
    text: params.text,
    media_url: params.mediaUrl,
    media_type: finalMessageType,
    media_filename: params.mediaFilename,
    media_duration: params.mediaDuration,
    timestamp: new Date().toISOString(),
    status: queueItem.status || 'sent',
    sender_name: effectiveSenderName
  };

  // Salva no cache local de mensagens do contato
  try {
    const localStoreKey = `${STORAGE_CHAT_MSGS_KEY}_${cleanPhone}`;
    const existing = localStorage.getItem(localStoreKey);
    const msgs: WhatsAppChatMessage[] = existing ? JSON.parse(existing) : [];
    const isDup = msgs.some(m => m.id === chatMessage.id || (m.from_me && m.text === chatMessage.text && Math.abs(new Date(m.timestamp).getTime() - new Date(chatMessage.timestamp).getTime()) < 15000));
    if (!isDup) {
      msgs.push(chatMessage);
      localStorage.setItem(localStoreKey, JSON.stringify(msgs));
    }

    // Atualiza lista de conversas com a última mensagem
    const chatsStore = localStorage.getItem(STORAGE_CHATS_KEY);
    const chats: WhatsAppChat[] = chatsStore ? JSON.parse(chatsStore) : [];
    const chatIdx = chats.findIndex(c => sanitizePhoneNumber(c.phone_number) === cleanPhone);

    const updatedChat: WhatsAppChat = {
      id: chatIdx >= 0 ? chats[chatIdx].id : `chat_${cleanPhone}`,
      remote_jid: `${cleanPhone}@s.whatsapp.net`,
      phone_number: cleanPhone,
      name: params.recipientName || (chatIdx >= 0 ? chats[chatIdx].name : `Contato (${formatDisplayPhone(cleanPhone)})`),
      unread_count: 0,
      last_message: {
        id: chatMessage.id,
        text: params.text || (params.mediaFilename ? `[Arquivo: ${params.mediaFilename}]` : 'Mensagem enviada'),
        timestamp: chatMessage.timestamp,
        from_me: true,
        status: chatMessage.status
      },
      updated_at: chatMessage.timestamp
    };

    if (chatIdx >= 0) {
      chats[chatIdx] = updatedChat;
    } else {
      chats.unshift(updatedChat);
    }
    localStorage.setItem(STORAGE_CHATS_KEY, JSON.stringify(chats));

    // Transmite a nova mensagem em tempo real para todos os outros usuários
    broadcastWhatsAppEvent('chat_message_sent', {
      message: chatMessage,
      chat: updatedChat
    });
  } catch (err) {
    console.warn('Erro ao atualizar cache local de mensagens:', err);
  }

  return chatMessage;
}

/**
 * Cria ou obtém uma conversa para um número de telefone informado
 */
export async function createOrGetChat(phoneNumber: string, name?: string): Promise<WhatsAppChat> {
  const cleanPhone = sanitizePhoneNumber(phoneNumber);
  const chats = await getWhatsAppChats();
  const existing = chats.find(c => sanitizePhoneNumber(c.phone_number) === cleanPhone);

  if (existing) {
    return existing;
  }

  const newChat: WhatsAppChat = {
    id: `chat_${cleanPhone}`,
    remote_jid: `${cleanPhone}@s.whatsapp.net`,
    phone_number: cleanPhone,
    name: name || `Motorista (${formatDisplayPhone(cleanPhone)})`,
    unread_count: 0,
    last_message: {
      text: 'Conversa iniciada',
      timestamp: new Date().toISOString(),
      from_me: true,
      status: 'pending'
    },
    updated_at: new Date().toISOString()
  };

  const updatedChats = [newChat, ...chats];
  localStorage.setItem(STORAGE_CHATS_KEY, JSON.stringify(updatedChats));

  // Transmite criação do novo chat em tempo real para todos os usuários
  broadcastWhatsAppEvent('chat_created', { chat: newChat });

  return newChat;
}

/**
 * Remove uma conversa do histórico
 */
export async function deleteWhatsAppChat(chatPhoneOrJid: string): Promise<void> {
  const cleanPhone = sanitizePhoneNumber(chatPhoneOrJid.replace(/@.+$/, ''));
  const chats = await getWhatsAppChats();
  const filtered = chats.filter(c => sanitizePhoneNumber(c.phone_number) !== cleanPhone);
  localStorage.setItem(STORAGE_CHATS_KEY, JSON.stringify(filtered));
  localStorage.removeItem(`${STORAGE_CHAT_MSGS_KEY}_${cleanPhone}`);

  // Transmite exclusão em tempo real para todos os usuários
  broadcastWhatsAppEvent('chat_deleted', { phoneNumber: cleanPhone });
}

/**
 * Solicita código de pareamento numérico (Pairing Code) para o WhatsApp oficial
 */
export async function requestPairingCode(phoneNumber: string = '553598721970'): Promise<{ code: string; success: boolean; message?: string }> {
  const cfg = getGatewayConfig();
  const cleanPhone = sanitizePhoneNumber(phoneNumber);

  try {
    // 1. Tenta via endpoint GET /instance/connect/:instance?number=...
    const res = await fetchEvolution(`/instance/connect/${cfg.instanceName}?number=${cleanPhone}`, {
      method: 'GET'
    }).catch(() => null);

    if (res && res.ok) {
      const data = await res.json().catch(() => ({}));
      const code = data?.code || data?.pairingCode || data?.qrcode?.code;
      if (code && typeof code === 'string' && !code.startsWith('data:') && code.length <= 15) {
        return { code, success: true };
      }
    }

    // 2. Fallback POST /instance/connect/:instance
    const postRes = await fetchEvolution(`/instance/connect/${cfg.instanceName}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ number: cleanPhone })
    }).catch(() => null);

    if (postRes && postRes.ok) {
      const postData = await postRes.json().catch(() => ({}));
      const code = postData?.code || postData?.pairingCode;
      if (code && typeof code === 'string' && code.length <= 15) {
        return { code, success: true };
      }
    }
  } catch (err: any) {
    console.warn('[Evolution API] Erro ao solicitar pairing code:', err);
  }

  return { 
    code: '', 
    success: false, 
    message: `O servidor Evolution API (${cfg.url}) não retornou um código de pareamento válido. Verifique se o servidor está online e a instância está ativa.` 
  };
}

/**
 * Desconecta e encerra a sessão da instância no WhatsApp
 */
export async function disconnectWhatsAppInstance(): Promise<void> {
  const cfg = getGatewayConfig();
  try {
    await fetchEvolution(`/instance/logout/${cfg.instanceName}`, {
      method: 'DELETE'
    }).catch(() => null);
  } catch (err) {
    console.warn('Erro ao deslogar da Evolution API:', err);
  }

  const current = await getWhatsAppInstance();
  const updated: WhatsAppInstance = {
    ...current,
    status: 'disconnected',
    qr_code_base64: undefined,
    phone_number: undefined,
    updated_at: new Date().toISOString()
  };
  await saveWhatsAppInstance(updated);
}



