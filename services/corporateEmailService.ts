import type { 
  CorporateEmailAccount, 
  CorporateEmailServerConfig, 
  CorporateEmailDepartment,
  CorporateEmailStatus,
  CorporateEmailFolder,
  CorporateEmailAttachment,
  CorporateEmailMessage,
  User 
} from '../types';
import { isDeveloperUser, isDemoUser, getUserJobFunction } from '../auth';
import { getStoredCompanyLogo } from '../utils/pdfGenerator';
import { supabase } from '../supabase';

const STORAGE_EMAILS_KEY = 'transcunha_corporate_emails';
const STORAGE_CONFIG_KEY = 'transcunha_corporate_email_config';
const STORAGE_MESSAGES_KEY = 'transcunha_corporate_messages_v1';
const SUPABASE_CORPORATE_EMAIL_RECORD_ID = 891;
const CORPORATE_EMAIL_REALTIME_CHANNEL = 'transcunha_corporate_email_realtime';

const localEmailBroadcast =
  typeof window !== 'undefined' && 'BroadcastChannel' in window
    ? new BroadcastChannel('transcunha_corporate_email_sync')
    : null;

let emailRealtimeChannel: ReturnType<typeof supabase.channel> | null = null;
let cloudPersistTimeout: ReturnType<typeof setTimeout> | null = null;

const INITIAL_MESSAGES: CorporateEmailMessage[] = [
  {
    id: 'msg_001',
    accountId: 'email_contato',
    accountEmail: 'contato@transcunhaoficial.com.br',
    folder: 'inbox',
    from: 'compras@agroindustria-brasil.com.br',
    fromName: 'Agroindústria Brasil S/A',
    to: ['contato@transcunhaoficial.com.br'],
    subject: 'Solicitação de Homologação Cadastral & Cotação de Frete Safra',
    preview: 'Prezados, gostaríamos de receber o dossiê fiscal e certidões da Transcunha para homologação de transportador parceiro...',
    bodyHtml: `<p>Prezados(as) da equipe Transcunha,</p>
<p>Esperamos que este e-mail os encontre bem.</p>
<p>Estamos iniciando o processo de cotação e contratação de transportadoras rodoviárias de grande porte para escoamento de grãos e fertilizantes na rota <strong>Catalão (GO) x Porto de Santos (SP)</strong> e <strong>Pratápolis (MG) x Interior de SP</strong>.</p>
<p>Solicitamos o envio da documentação cadastral atualizada (CNDs Federal, Estadual, Trabalhista, ANTT e apólices de seguro RCTR-C / RC-DC) para inclusão no nosso cadastro de fornecedores homologados.</p>
<p>Ficamos no aguardo para agendarmos o início dos carregamentos.</p>
<br/>
<p>Atenciosamente,<br/><strong>Departamento de Suprimentos & Logística</strong><br/>Agroindústria Brasil S/A</p>`,
    bodyText: 'Prezados, gostaríamos de receber o dossiê fiscal e certidões da Transcunha para homologação de transportador parceiro para a safra atual.',
    date: new Date(Date.now() - 1000 * 60 * 45).toISOString(), // 45 min atrás
    isRead: false,
    isStarred: true,
    hasAttachments: false,
    priority: 'high',
  },
  {
    id: 'msg_002',
    accountId: 'email_comercial',
    accountEmail: 'comercial@transcunhaoficial.com.br',
    folder: 'inbox',
    from: 'logistica@cooperativa-graos.com.br',
    fromName: 'Cooperativa Agro Grãos Sul',
    to: ['comercial@transcunhaoficial.com.br'],
    subject: 'Cotação de Frete Rodoviário - 50 Viagens Bitrem Graneleiro',
    preview: 'Olá Comercial Transcunha, temos disponibilidade de carga imediata para escoamento de soja com partida em Cambará (PR)...',
    bodyHtml: `<p>Olá, equipe comercial da Transcunha!</p>
<p>Temos 50 viagens de soja a granel para transporte imediato saindo de <strong>Cambará - PR</strong> com destino ao terminal portuário de Paranaguá.</p>
<p>Favor enviar proposta com valor por tonelada, prazo de carregamento e quantidade de carretas/bitrens disponíveis.</p>
<br/>
<p>Atenciosamente,<br/><strong>Coordenação de Fretes</strong><br/>Cooperativa Agro Grãos Sul</p>`,
    bodyText: 'Temos 50 viagens de soja a granel para transporte imediato saindo de Cambará - PR com destino ao terminal portuário de Paranaguá.',
    date: new Date(Date.now() - 1000 * 60 * 180).toISOString(), // 3h atrás
    isRead: false,
    isStarred: false,
    hasAttachments: false,
    priority: 'normal',
  },
  {
    id: 'msg_003',
    accountId: 'email_operacional',
    accountEmail: 'operacional@transcunhaoficial.com.br',
    folder: 'inbox',
    from: 'averbacao@sompo-seguros.com.br',
    fromName: 'Sompo Seguros Corporativos',
    to: ['operacional@transcunhaoficial.com.br'],
    subject: 'Confirmação de Averbação Automática de Carga - RCTR-C / RC-DC',
    preview: 'Confirmamos o recebimento da averbação eletrônica de transporte rodoviário de cargas para a viagem Transcunha nº 8492...',
    bodyHtml: `<p>Prezada Transcunha Transportes e Logística LTDA,</p>
<p>Confirmamos com sucesso a averbação securitária automática da carga sob as apólices vigentes:</p>
<ul>
  <li><strong>RCTR-C:</strong> Cobertura Integral contra Colisão, Capotagem e Abalroamento.</li>
  <li><strong>RC-DC:</strong> Cobertura contra Roubo e Desaparecimento de Carga com Gerenciamento de Risco Liberado.</li>
</ul>
<p>O comprovante de averbação em formato PDF foi processado eletronicamente.</p>`,
    bodyText: 'Confirmamos com sucesso a averbação securitária automática da carga sob as apólices vigentes RCTR-C e RC-DC.',
    date: new Date(Date.now() - 1000 * 60 * 60 * 8).toISOString(), // 8h atrás
    isRead: true,
    isStarred: false,
    hasAttachments: true,
    attachments: [
      {
        id: 'att_001',
        filename: 'Comprovante_Averbacao_Seguro_8492.pdf',
        sizeBytes: 184500,
        contentType: 'application/pdf',
      }
    ],
    priority: 'normal',
  },
  {
    id: 'msg_004',
    accountId: 'email_contato',
    accountEmail: 'contato@transcunhaoficial.com.br',
    folder: 'sent',
    from: 'contato@transcunhaoficial.com.br',
    fromName: 'Transcunha Transportes e Logística',
    to: ['diretoria@cliente-logistica.com.br'],
    subject: '[TRANSCUNHA] Apresentação Comercial de Parceria & Dossiê Cadastral',
    preview: 'Prezados, é com grande satisfação que apresentamos a Transcunha Transportes e Logística LTDA com nossa documentação cadastral...',
    bodyHtml: `<p>Prezados Senhores,</p>
<p>É com grande satisfação que apresentamos a <strong>TRANSCUNHA TRANSPORTES E LOGÍSTICA LTDA.</strong> com o objetivo de estabelecer uma sólida parceria comercial no fornecimento de soluções em transporte rodoviário de cargas.</p>
<p>Encaminhamos em anexo nosso Dossiê de Homologação completo com CNDs, ANTT e apólices de seguro.</p>
<br/>
<p>Atenciosamente,<br/><strong>Equipe Comercial & Controladoria</strong><br/>Transcunha Transportes e Logística LTDA.</p>`,
    bodyText: 'É com grande satisfação que apresentamos a Transcunha Transportes e Logística LTDA com nosso Dossiê de Homologação completo.',
    date: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(), // 1 dia atrás
    isRead: true,
    isStarred: true,
    hasAttachments: true,
    attachments: [
      {
        id: 'att_002',
        filename: 'Dossie_Homologacao_Transcunha_2026.pdf',
        sizeBytes: 842000,
        contentType: 'application/pdf',
      }
    ],
    priority: 'normal',
  }
];

export const DEFAULT_EMAIL_SERVER_CONFIG: CorporateEmailServerConfig = {
  domain: 'transcunhaoficial.com.br',
  webmailUrl: 'https://mail.google.com/a/transcunhaoficial.com.br',
  smtpHost: 'smtp.gmail.com',
  smtpPort: 465,
  smtpSecure: 'ssl',
  imapHost: 'imap.gmail.com',
  imapPort: 993,
  imapSecure: 'ssl',
  popHost: 'pop.gmail.com',
  popPort: 995,
  defaultQuotaMb: 30720, // 30 GB (Padrão Google Workspace Business)
  providerPreset: 'google_workspace',
};

export const PROVIDER_PRESETS: Record<CorporateEmailServerConfig['providerPreset'], {
  label: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: 'ssl' | 'tls' | 'none';
  imapHost: string;
  imapPort: number;
  imapSecure: 'ssl' | 'tls' | 'none';
  webmailUrl: string;
}> = {
  google_workspace: {
    label: 'Google Workspace Oficial (transcunhaoficial.com.br)',
    smtpHost: 'smtp.gmail.com',
    smtpPort: 465,
    smtpSecure: 'ssl',
    imapHost: 'imap.gmail.com',
    imapPort: 993,
    imapSecure: 'ssl',
    webmailUrl: 'https://mail.google.com/a/transcunhaoficial.com.br',
  },
  cpanel: {
    label: 'cPanel / Servidor Secundário',
    smtpHost: 'mail.transcunhaoficial.com.br',
    smtpPort: 465,
    smtpSecure: 'ssl',
    imapHost: 'mail.transcunhaoficial.com.br',
    imapPort: 993,
    imapSecure: 'ssl',
    webmailUrl: 'https://webmail.transcunhaoficial.com.br',
  },
  microsoft_365: {
    label: 'Microsoft 365 / Outlook Corporativo',
    smtpHost: 'smtp.office365.com',
    smtpPort: 587,
    smtpSecure: 'tls',
    imapHost: 'outlook.office365.com',
    imapPort: 993,
    imapSecure: 'ssl',
    webmailUrl: 'https://outlook.office.com',
  },
  zoho: {
    label: 'Zoho Mail Corporativo',
    smtpHost: 'smtppro.zoho.com',
    smtpPort: 465,
    smtpSecure: 'ssl',
    imapHost: 'imappro.zoho.com',
    imapPort: 993,
    imapSecure: 'ssl',
    webmailUrl: 'https://mail.zoho.com',
  },
  titan: {
    label: 'Titan Mail (Hostinger / Registro.br)',
    smtpHost: 'smtp.titan.email',
    smtpPort: 465,
    smtpSecure: 'ssl',
    imapHost: 'imap.titan.email',
    imapPort: 993,
    imapSecure: 'ssl',
    webmailUrl: 'https://webmail.titan.email',
  },
  custom: {
    label: 'Configuração Personalizada (Servidor Dedicado)',
    smtpHost: 'mail.transcunhaoficial.com.br',
    smtpPort: 465,
    smtpSecure: 'ssl',
    imapHost: 'mail.transcunhaoficial.com.br',
    imapPort: 993,
    imapSecure: 'ssl',
    webmailUrl: 'https://webmail.transcunhaoficial.com.br',
  }
};

const INITIAL_ACCOUNTS: CorporateEmailAccount[] = [
  {
    id: 'email_diretoria',
    email: 'diretoria@transcunhaoficial.com.br',
    displayName: 'Diretoria Executiva',
    department: 'Diretoria',
    password: 'Tc#Diretoria*2026',
    status: 'Ativo',
    quotaMb: 20480, // 20 GB
    usedMb: 4890,
    aliases: ['admin@transcunhaoficial.com.br', 'ceo@transcunhaoficial.com.br'],
    signature: 'Diretoria Executiva — Transcunha Logística & Transportes',
    notes: 'Caixa postal master da diretoria.',
    createdAt: '2026-01-10T10:00:00.000Z',
    updatedAt: '2026-10-12T10:00:00.000Z',
  },
  {
    id: 'email_financeiro',
    email: 'financeiro@transcunhaoficial.com.br',
    displayName: 'Financeiro & Controladoria',
    department: 'Financeiro',
    password: 'Tc#Finan$2026!',
    status: 'Ativo',
    quotaMb: 10240, // 10 GB
    usedMb: 3410,
    aliases: ['cobranca@transcunhaoficial.com.br', 'pagamentos@transcunhaoficial.com.br', 'fiscal@transcunhaoficial.com.br'],
    signature: 'Setor Financeiro — Transcunha Logística\nTel: 35 9872-1970 | financeiro@transcunhaoficial.com.br',
    notes: 'Recepção de NFs, boletos e conciliação bancária.',
    createdAt: '2026-01-10T10:00:00.000Z',
    updatedAt: '2026-10-12T10:00:00.000Z',
  },
  {
    id: 'email_operacional',
    email: 'operacional@transcunhaoficial.com.br',
    displayName: 'Central Operacional & Logística',
    department: 'Operacional',
    password: 'Tc#Operac@2026',
    status: 'Ativo',
    quotaMb: 10240,
    usedMb: 2950,
    aliases: ['logistica@transcunhaoficial.com.br', 'cargas@transcunhaoficial.com.br', 'embarques@transcunhaoficial.com.br'],
    signature: 'Central de Cargas & Rastreamento — Transcunha Logística',
    notes: 'Ordens de carregamento, romaneios e envio de comprovantes de entrega.',
    createdAt: '2026-01-10T10:00:00.000Z',
    updatedAt: '2026-10-12T10:00:00.000Z',
  },
  {
    id: 'email_comercial',
    email: 'comercial@transcunhaoficial.com.br',
    displayName: 'Equipe Comercial & Cotações',
    department: 'Comercial',
    password: 'Tc#Comercial2026$',
    status: 'Ativo',
    quotaMb: 10240,
    usedMb: 1820,
    aliases: ['vendas@transcunhaoficial.com.br', 'cotacao@transcunhaoficial.com.br'],
    signature: 'Departamento Comercial — Transcunha Logística\nCotações rápidas de fretes pesados e agronegócio.',
    notes: 'Atendimento a embarcadores e clientes.',
    createdAt: '2026-01-10T10:00:00.000Z',
    updatedAt: '2026-10-12T10:00:00.000Z',
  },
  {
    id: 'email_contato',
    email: 'contato@transcunhaoficial.com.br',
    displayName: 'Atendimento Geral & SAC',
    department: 'Geral',
    password: 'Tc#Contato2026&',
    status: 'Ativo',
    quotaMb: 5120,
    usedMb: 920,
    aliases: ['sac@transcunhaoficial.com.br', 'suporte@transcunhaoficial.com.br'],
    signature: 'Transcunha Logística & Transportes Ltda.\nExcelência em Logística Rodoviária.',
    notes: 'E-mail institucional principal.',
    createdAt: '2026-01-10T10:00:00.000Z',
    updatedAt: '2026-10-12T10:00:00.000Z',
  }
];

class CorporateEmailService {
  /**
   * Obtém a configuração do servidor de e-mail corporativo (SMTP, IMAP, Webmail).
   */
  getServerConfig(): CorporateEmailServerConfig {
    try {
      const saved = localStorage.getItem(STORAGE_CONFIG_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Atualiza automaticamente o domínio legado transcunha.com.br para transcunhaoficial.com.br
        if (!parsed.domain || parsed.domain === 'transcunha.com.br') {
          parsed.domain = 'transcunhaoficial.com.br';
        }
        if (parsed.webmailUrl && parsed.webmailUrl.includes('transcunha.com.br')) {
          parsed.webmailUrl = parsed.webmailUrl.replace('transcunha.com.br', 'transcunhaoficial.com.br');
        }
        if (parsed.smtpHost && parsed.smtpHost.includes('transcunha.com.br')) {
          parsed.smtpHost = parsed.smtpHost.replace('transcunha.com.br', 'transcunhaoficial.com.br');
        }
        if (parsed.imapHost && parsed.imapHost.includes('transcunha.com.br')) {
          parsed.imapHost = parsed.imapHost.replace('transcunha.com.br', 'transcunhaoficial.com.br');
        }

        if (parsed.providerPreset === 'cpanel' || parsed.providerPreset === 'microsoft_365' || !parsed.providerPreset) {
          return { ...DEFAULT_EMAIL_SERVER_CONFIG, domain: 'transcunhaoficial.com.br' };
        }
        return { ...DEFAULT_EMAIL_SERVER_CONFIG, ...parsed, domain: 'transcunhaoficial.com.br' };
      }
    } catch (e) {
      console.error('[CorporateEmailService] Erro ao ler configuração:', e);
    }
    return { ...DEFAULT_EMAIL_SERVER_CONFIG };
  }

  /**
   * Salva a configuração do servidor de e-mail corporativo.
   */
  saveServerConfig(config: CorporateEmailServerConfig): CorporateEmailServerConfig {
    try {
      localStorage.setItem(STORAGE_CONFIG_KEY, JSON.stringify(config));
      window.dispatchEvent(new CustomEvent('corporate_email_config_updated', { detail: config }));
    } catch (e) {
      console.error('[CorporateEmailService] Erro ao salvar configuração:', e);
    }
    return config;
  }

  /**
   * Lista todas as contas de e-mail corporativo cadastradas.
   */
  getEmailAccounts(users: User[] = []): CorporateEmailAccount[] {
    let accounts: CorporateEmailAccount[] = [];
    try {
      const saved = localStorage.getItem(STORAGE_EMAILS_KEY);
      if (saved) {
        accounts = JSON.parse(saved);
        // Migra contas salvas no localStorage que ainda contenham @transcunha.com.br
        let migrated = false;
        accounts = accounts.map(a => {
          let email = a.email;
          if (email && email.toLowerCase().endsWith('@transcunha.com.br')) {
            email = email.replace(/@transcunha\.com\.br$/i, '@transcunhaoficial.com.br');
            migrated = true;
          }
          const aliases = (a.aliases || []).map(al => {
            if (al.toLowerCase().endsWith('@transcunha.com.br')) {
              migrated = true;
              return al.replace(/@transcunha\.com\.br$/i, '@transcunhaoficial.com.br');
            }
            return al;
          });
          const signature = a.signature ? a.signature.replace(/transcunha\.com\.br/g, 'transcunhaoficial.com.br') : a.signature;
          if (signature !== a.signature) migrated = true;

          return { ...a, email, aliases, signature };
        });
        if (migrated) {
          this.saveAccountsToStorage(accounts);
        }
      } else {
        accounts = [...INITIAL_ACCOUNTS];
        this.saveAccountsToStorage(accounts);
      }
    } catch (e) {
      console.error('[CorporateEmailService] Erro ao ler contas:', e);
      accounts = [...INITIAL_ACCOUNTS];
    }

    // Se houver usuários do sistema com e-mails corporativos (@transcunhaoficial.com.br) ou corporateEmail definido,
    // sincroniza automaticamente seus nomes e vínculos.
    if (users && users.length > 0) {
      let changed = false;
      users.forEach(u => {
        if (isDeveloperUser(u) || isDemoUser(u)) return;
        const corpEmail = (u.corporateEmail || (u.email && (u.email.toLowerCase().endsWith('@transcunhaoficial.com.br') || u.email.toLowerCase().endsWith('@transcunha.com.br')) ? u.email.replace(/@transcunha\.com\.br$/i, '@transcunhaoficial.com.br') : '')).trim().toLowerCase();
        if (corpEmail) {
          const existing = accounts.find(a => a.email.toLowerCase() === corpEmail || a.userId === u.id);
          if (existing) {
            if (existing.userId !== u.id || existing.userName !== u.name) {
              existing.userId = u.id;
              existing.userName = u.name;
              changed = true;
            }
          } else {
            // Cria conta automática para usuário que possui e-mail corporativo
            accounts.push({
              id: `email_user_${u.id}`,
              email: corpEmail,
              displayName: u.name,
              userId: u.id,
              userName: u.name,
              department: this.mapProfileToDepartment(u.profile),
              password: u.corporateEmailPassword || this.generateSecurePassword(12),
              status: (u.corporateEmailStatus as CorporateEmailStatus) || (u.active ? 'Ativo' : 'Inativo'),
              quotaMb: u.corporateEmailQuotaMb || 5120,
              usedMb: 250,
              aliases: [],
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            });
            changed = true;
          }
        }
      });

      if (changed) {
        this.saveAccountsToStorage(accounts);
      }
    }

    return accounts;
  }

  /**
   * Salva ou atualiza uma conta de e-mail corporativo.
   */
  saveEmailAccount(
    accountData: Partial<CorporateEmailAccount> & { email: string; displayName: string },
    users: User[] = []
  ): CorporateEmailAccount {
    const accounts = this.getEmailAccounts(users);
    const now = new Date().toISOString();
    const cleanEmail = accountData.email.trim().toLowerCase();

    const existingIndex = accounts.findIndex(
      a => (accountData.id && a.id === accountData.id) || a.email.toLowerCase() === cleanEmail
    );

    let savedAccount: CorporateEmailAccount;

    if (existingIndex >= 0) {
      savedAccount = {
        ...accounts[existingIndex],
        ...accountData,
        email: cleanEmail,
        updatedAt: now,
      };
      accounts[existingIndex] = savedAccount;
    } else {
      savedAccount = {
        id: accountData.id || `corp_email_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        email: cleanEmail,
        displayName: accountData.displayName.trim(),
        userId: accountData.userId,
        userName: accountData.userName,
        department: accountData.department || 'Geral',
        password: accountData.password || this.generateSecurePassword(12),
        status: accountData.status || 'Ativo',
        quotaMb: accountData.quotaMb || 5120,
        usedMb: accountData.usedMb || 0,
        aliases: accountData.aliases || [],
        forwardTo: accountData.forwardTo,
        signature: accountData.signature,
        notes: accountData.notes,
        createdAt: now,
        updatedAt: now,
      };
      accounts.unshift(savedAccount);
    }

    this.saveAccountsToStorage(accounts);
    window.dispatchEvent(new CustomEvent('corporate_emails_updated', { detail: savedAccount }));
    return savedAccount;
  }

  /**
   * Remove uma conta de e-mail corporativo.
   */
  deleteEmailAccount(id: string): void {
    const accounts = this.getEmailAccounts();
    const filtered = accounts.filter(a => a.id !== id);
    this.saveAccountsToStorage(filtered);
    window.dispatchEvent(new CustomEvent('corporate_emails_updated', { detail: { deletedId: id } }));
  }

  /**
   * Gera uma senha forte e segura para a conta de e-mail.
   */
  generateSecurePassword(length = 12): string {
    const lower = 'abcdefghjkmnpqrstuvwxyz';
    const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const numbers = '23456789';
    const specials = '!@#$%&*';
    const all = lower + upper + numbers + specials;

    let pwd = 'Tc#';
    for (let i = 0; i < length - 4; i++) {
      pwd += all.charAt(Math.floor(Math.random() * all.length));
    }
    pwd += numbers.charAt(Math.floor(Math.random() * numbers.length));
    return pwd;
  }

  /**
   * Mapeia o perfil do usuário para um departamento padrão.
   */
  mapProfileToDepartment(profile?: string): CorporateEmailDepartment {
    if (!profile) return 'Geral';
    const p = String(profile).toLowerCase();
    if (p.includes('diretor') || p.includes('admin')) return 'Diretoria';
    if (p.includes('finan') || p.includes('fiscal')) return 'Financeiro';
    if (p.includes('comercial')) return 'Comercial';
    if (p.includes('operac') || p.includes('supervisor') || p.includes('agenciador')) return 'Operacional';
    return 'Geral';
  }

  /**
   * Gera o código HTML padronizado e sofisticado para assinatura de e-mail da Transcunha Logística.
   */
  generateSignatureHtml(
    account: CorporateEmailAccount,
    companyLogo?: string | null,
    collaboratorPhone = '(66) 99999-0000',
    landlinePhone = '35 9872-1970',
    roleTitle?: string
  ): string {
    const logoHtml = companyLogo
      ? `<img src="${companyLogo}" alt="Transcunha Logística" width="110" style="display:block;max-width:110px;max-height:72px;object-fit:contain;border:0;" />`
      : `<div style="width:96px;height:60px;background:linear-gradient(135deg,#0f172a,#1d4ed8);border-radius:8px;color:#ffffff;font-family:'Segoe UI',Arial,sans-serif;font-weight:800;font-size:13px;letter-spacing:0.08em;text-align:center;line-height:60px;">TRANSCUNHA</div>`;

    const subtitle = roleTitle
      ? `${roleTitle} — Transcunha Logística`
      : `${account.department} — Transcunha Logística`;

    const cleanCollabPhone = (collaboratorPhone || '').trim();
    const cleanLandline = (landlinePhone || '').trim();
    const phonesLine = [
      cleanCollabPhone ? `<span><strong>Celular / WhatsApp:</strong> ${cleanCollabPhone}</span>` : '',
      cleanLandline && cleanLandline !== cleanCollabPhone ? `<span><strong>Fixo:</strong> ${cleanLandline}</span>` : '',
    ]
      .filter(Boolean)
      .join(' &nbsp;|&nbsp; ');

    return `<table cellpadding="0" cellspacing="0" border="0" style="font-family:'Segoe UI',Roboto,Arial,Helvetica,sans-serif;background-color:#ffffff;border:1px solid #e2e8f0;border-radius:10px;padding:16px 20px;max-width:580px;color:#1e293b;margin-top:16px;">
  <tr>
    <td valign="middle" style="padding-right:18px;border-right:3px solid #1d4ed8;">
      ${logoHtml}
    </td>
    <td valign="middle" style="padding-left:18px;">
      <div style="font-size:16px;font-weight:800;color:#0f172a;letter-spacing:-0.01em;line-height:1.2;">${account.displayName}</div>
      <div style="font-size:11px;font-weight:700;color:#1d4ed8;text-transform:uppercase;letter-spacing:0.08em;margin-top:3px;">${subtitle}</div>
      <div style="height:1px;background-color:#e2e8f0;margin:10px 0;"></div>
      <div style="font-size:12px;color:#334155;line-height:1.6;">
        <div><strong>E-mail:</strong> <a href="mailto:${account.email}" style="color:#1d4ed8;text-decoration:none;font-weight:600;">${account.email}</a></div>
        ${phonesLine ? `<div>${phonesLine}</div>` : ''}
        <div><strong>Website:</strong> <a href="https://transcunhaoficial.com.br" target="_blank" style="color:#1d4ed8;text-decoration:none;font-weight:600;">www.transcunhaoficial.com.br</a></div>
      </div>
      <div style="margin-top:10px;padding-top:8px;border-top:1px dashed #e2e8f0;font-size:10px;color:#64748b;letter-spacing:0.02em;">
        <strong style="color:#0f172a;">TRANSCUNHA TRANSPORTES E LOGÍSTICA LTDA.</strong> &bull; Excelência, Segurança e Eficiência no Transporte Rodoviário.
      </div>
    </td>
  </tr>
</table>`;
  }

  /**
   * Obtém o usuário logado na sessão atual (sessionStorage ou espelho em localStorage).
   */
  getCurrentSessionUser(): User | null {
    try {
      if (typeof window === 'undefined') return null;
      const rawSession = sessionStorage.getItem('trancunha_currentUser');
      if (rawSession) return JSON.parse(rawSession) as User;
      const rawMirror = localStorage.getItem('transcunha_active_signature_user');
      return rawMirror ? (JSON.parse(rawMirror) as User) : null;
    } catch {
      return null;
    }
  }

  /**
   * Gera automaticamente a assinatura executiva padrão Transcunha com os dados do usuário remetente.
   */
  buildSignatureForSender(
    senderEmail?: string,
    explicitUser?: User | null
  ): { html: string; text: string; displayName: string; email: string; roleTitle: string; phone: string } {
    const user = explicitUser || this.getCurrentSessionUser();
    const accounts = this.getEmailAccounts();
    const matchedAcc =
      (user &&
        accounts.find(
          a =>
            a.userId === user.id ||
            (user.corporateEmail && a.email.toLowerCase() === user.corporateEmail.toLowerCase()) ||
            (user.email && a.email.toLowerCase() === user.email.toLowerCase())
        )) ||
      (senderEmail ? accounts.find(a => a.email.toLowerCase() === senderEmail.toLowerCase()) : undefined);

    const displayName =
      (user?.name && user.name.trim()) ||
      matchedAcc?.displayName ||
      'Transcunha Transportes e Logística';

    const email =
      (user?.corporateEmail && user.corporateEmail.trim()) ||
      matchedAcc?.email ||
      (user?.email && user.email.trim()) ||
      (senderEmail && senderEmail.trim()) ||
      'contato@transcunhaoficial.com.br';

    const jobFn = getUserJobFunction(user);
    const department = matchedAcc?.department || this.mapProfileToDepartment(user?.profile);
    const roleTitle = jobFn || department;
    const phone = (user?.phone && user.phone.trim()) || '';
    const landline = '35 9872-1970';
    const companyLogo = getStoredCompanyLogo();

    const syntheticAccount: CorporateEmailAccount = {
      id: matchedAcc?.id || (user ? `user_${user.id}` : 'default'),
      email,
      displayName,
      userId: user?.id,
      userName: displayName,
      department,
      status: 'Ativo',
      quotaMb: 5120,
      usedMb: 0,
      aliases: [],
      createdAt: matchedAcc?.createdAt || '',
      updatedAt: matchedAcc?.updatedAt || '',
    };

    const html = this.generateSignatureHtml(syntheticAccount, companyLogo, phone, landline, roleTitle);
    const phoneParts = [
      phone ? `Celular / WhatsApp: ${phone}` : '',
      `Fixo: ${landline}`,
    ]
      .filter(Boolean)
      .join(' | ');

    const text = [
      displayName,
      `${roleTitle} — Transcunha Logística`,
      `E-mail: ${email}`,
      phoneParts,
      `Website: www.transcunhaoficial.com.br`,
      `TRANSCUNHA TRANSPORTES E LOGÍSTICA LTDA. • Excelência, Segurança e Eficiência no Transporte Rodoviário.`,
    ].join('\n');

    return { html, text, displayName, email, roleTitle, phone };
  }

  // --- GESTÃO DE MENSAGENS (WEBMAIL OUTLOOK STYLE) ---

  /**
   * Obtém as mensagens de e-mail corporativo armazenadas.
   */
  getMessages(accountId?: string, folder?: CorporateEmailFolder): CorporateEmailMessage[] {
    try {
      const saved = localStorage.getItem(STORAGE_MESSAGES_KEY);
      let messages: CorporateEmailMessage[] = [];
      if (saved) {
        messages = JSON.parse(saved);
      } else {
        messages = [...INITIAL_MESSAGES];
        this.saveMessagesToStorage(messages);
      }

      if (accountId && accountId !== 'all') {
        messages = messages.filter(m => m.accountId === accountId || m.accountEmail === accountId);
      }

      if (folder) {
        if (folder === 'starred') {
          messages = messages.filter(m => m.isStarred);
        } else {
          messages = messages.filter(m => m.folder === folder);
        }
      }

      // Ordena por data decrescente
      return messages.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    } catch (e) {
      console.error('[CorporateEmailService] Erro ao carregar mensagens:', e);
      return [];
    }
  }

  /**
   * Salva ou atualiza uma mensagem de e-mail.
   */
  saveMessage(msg: CorporateEmailMessage): void {
    const all = this.getMessages();
    const idx = all.findIndex(m => m.id === msg.id);
    let isNew = false;
    if (idx >= 0) {
      all[idx] = msg;
    } else {
      isNew = true;
      all.unshift(msg);
    }
    this.saveMessagesToStorage(all);

    window.dispatchEvent(new CustomEvent('corporate_messages_updated', { detail: { message: msg, isNew } }));

    if (isNew && msg.folder === 'inbox' && !msg.isRead) {
      this.notifyNewEmail(msg);
    }
  }

  /**
   * Marca uma mensagem como lida ou não lida.
   */
  markAsRead(id: string, isRead = true): void {
    const all = this.getMessages();
    const msg = all.find(m => m.id === id);
    if (msg) {
      msg.isRead = isRead;
      this.saveMessagesToStorage(all);
      window.dispatchEvent(new CustomEvent('corporate_messages_updated', { detail: { id, isRead } }));
    }
  }

  /**
   * Alterna a estrela (favorito) da mensagem.
   */
  toggleStar(id: string): void {
    const all = this.getMessages();
    const msg = all.find(m => m.id === id);
    if (msg) {
      msg.isStarred = !msg.isStarred;
      this.saveMessagesToStorage(all);
      window.dispatchEvent(new CustomEvent('corporate_messages_updated', { detail: { id, isStarred: msg.isStarred } }));
    }
  }

  /**
   * Move uma mensagem para outra pasta (inbox, sent, drafts, trash).
   */
  moveToFolder(id: string, folder: CorporateEmailFolder): void {
    const all = this.getMessages();
    const msg = all.find(m => m.id === id);
    if (msg) {
      msg.folder = folder;
      this.saveMessagesToStorage(all);
      window.dispatchEvent(new CustomEvent('corporate_messages_updated', { detail: { id, folder } }));
    }
  }

  /**
   * Exclui uma mensagem (se já estiver na lixeira, remove definitivamente; caso contrário move para trash).
   */
  deleteMessage(id: string): void {
    const all = this.getMessages();
    const msg = all.find(m => m.id === id);
    if (!msg) return;

    if (msg.folder === 'trash') {
      const filtered = all.filter(m => m.id !== id);
      this.saveMessagesToStorage(filtered);
    } else {
      msg.folder = 'trash';
      this.saveMessagesToStorage(all);
    }
    window.dispatchEvent(new CustomEvent('corporate_messages_updated', { detail: { id, deleted: true } }));
  }

  /**
   * Retorna a quantidade de e-mails não lidos na caixa de entrada.
   */
  getUnreadCount(accountId?: string): number {
    const messages = this.getMessages(accountId, 'inbox');
    return messages.filter(m => !m.isRead).length;
  }

  /**
   * Dispara um e-mail novo e salva na caixa de saída (Sent).
   */
  async sendOutgoingEmail(data: {
    to: string[];
    cc?: string[];
    subject: string;
    bodyHtml: string;
    bodyText: string;
    accountEmail: string;
    senderName?: string;
    appPassword?: string;
    attachments?: CorporateEmailAttachment[];
  }): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const { to, cc, subject, accountEmail, appPassword, attachments = [] } = data;
    const sig = this.buildSignatureForSender(accountEmail);
    const senderName = data.senderName || sig.displayName || 'Transcunha Transportes e Logística';
    const bodyHtml = data.bodyHtml.includes('TRANSCUNHA TRANSPORTES E LOGÍSTICA LTDA.')
      ? data.bodyHtml
      : `${data.bodyHtml}<br/><br/>${sig.html}`;
    const bodyText = data.bodyText.includes('TRANSCUNHA TRANSPORTES E LOGÍSTICA LTDA.')
      ? data.bodyText
      : `${data.bodyText}\n\n${sig.text}`;

    let messageId: string | undefined;

    // Se houver senha de app, tenta envio real via /api/send-email
    if (appPassword && appPassword.trim()) {
      const allTo = to.filter(Boolean).join(', ');
      const allCc = cc && cc.length > 0 ? cc.filter(Boolean).join(', ') : undefined;
      const savedAuthUser =
        typeof window !== 'undefined'
          ? localStorage.getItem('transcunha_gworkspace_sender_email')
          : null;
      const authUser = (savedAuthUser && savedAuthUser.trim()) || accountEmail;

      const res = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: allTo,
          cc: allCc,
          subject,
          html: bodyHtml,
          text: bodyText,
          senderEmail: accountEmail,
          authUser,
          senderName,
          appPassword: appPassword.replace(/\s+/g, ''),
          attachments: attachments.map(a => ({
            filename: a.filename,
            url: a.url,
            base64: a.base64,
            contentType: a.contentType || 'application/pdf',
          })),
        }),
      });

      const rawText = await res.text();
      let json: any = null;
      try {
        json = JSON.parse(rawText || '{}');
      } catch {
        if (!res.ok) {
          throw new Error(`Falha no servidor (${res.status}): ${rawText.substring(0, 150)}`);
        }
        throw new Error(
          'O servidor de envio (/api/send-email) não retornou uma resposta JSON válida. Verifique se a API está ativa neste ambiente.'
        );
      }

      if (!res.ok) {
        const errMsg = json?.error || 'Erro no servidor de envio ao disparar e-mail';
        const userHelp = json?.userHelp ? `\n\n👉 Dica: ${json.userHelp}` : '';
        throw new Error(`${errMsg}${userHelp}`);
      }

      if (!json?.success || !json?.messageId) {
        throw new Error(
          json?.error ||
            'O servidor não confirmou o disparo do e-mail (messageId ausente).'
        );
      }

      if (Array.isArray(json?.rejected) && json.rejected.length > 0) {
        if (!json.accepted || json.accepted.length === 0) {
          throw new Error(`O servidor SMTP rejeitou o envio para: ${json.rejected.join(', ')}`);
        }
      }

      messageId = json.messageId;
    } else {
      throw new Error('A Senha de App do Google Workspace não foi informada. Por favor, preencha a Senha de App de 16 caracteres para que o e-mail seja disparado efetivamente.');
    }

    // Salva na pasta 'sent' (Enviados)
    const newMsg: CorporateEmailMessage = {
      id: `msg_sent_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      accountId: accountEmail,
      accountEmail,
      folder: 'sent',
      from: accountEmail,
      fromName: senderName,
      to,
      cc,
      subject,
      bodyHtml,
      bodyText,
      preview: bodyText.substring(0, 120),
      date: new Date().toISOString(),
      isRead: true,
      hasAttachments: attachments.length > 0,
      attachments,
      priority: 'normal',
    };

    this.saveMessage(newMsg);

    return { success: true, messageId };
  }

  /**
   * Testa a conectividade SMTP com o Google Workspace disparando uma mensagem de diagnóstico.
   */
  async testGoogleWorkspaceConnection(
    testRecipient: string,
    appPassword?: string,
    senderEmail = 'contato@transcunhaoficial.com.br'
  ): Promise<{ success: boolean; messageId?: string; accepted?: string[]; details?: string }> {
    const cleanPass = (appPassword || localStorage.getItem('transcunha_gworkspace_app_password') || '').replace(/\s+/g, '');
    if (!cleanPass) {
      throw new Error('Informe a Senha de App de 16 caracteres do Google Workspace para realizar o teste.');
    }

    const testSubject = `[DIAGNÓSTICO TRANSCUNHA] Teste de Conexão Google Workspace — ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR')}`;
    const testHtml = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
        <h2 style="color: #1e3a8a; margin: 0 0 12px 0;">Teste de Conexão Google Workspace Concluído com Sucesso!</h2>
        <p style="color: #334155; font-size: 14px; line-height: 1.6;">
          Este e-mail confirma que a integração direta do sistema <strong>Transcunha Logística</strong> com o servidor SMTP do <strong>Google Workspace</strong> (<code>smtp.gmail.com:465 / 587</code>) está ativa e funcionando perfeitamente.
        </p>
        <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 12px 16px; margin: 16px 0; font-family: monospace; font-size: 13px;">
          <div><strong>Remetente Oficial:</strong> ${senderEmail}</div>
          <div><strong>Destinatário de Teste:</strong> ${testRecipient}</div>
          <div><strong>Data/Hora do Disparo:</strong> ${new Date().toISOString()}</div>
        </div>
        <p style="color: #64748b; font-size: 12px; margin-top: 20px;">
          Transcunha Transportes e Logística LTDA. — Sistema ERP Corporativo
        </p>
      </div>
    `;

    const res = await fetch('/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: testRecipient.trim(),
        subject: testSubject,
        html: testHtml,
        text: `Teste de Conexão Google Workspace Transcunha realizado com sucesso em ${new Date().toISOString()}`,
        senderEmail: senderEmail.trim(),
        authUser: 'contato@transcunhaoficial.com.br',
        senderName: 'Transcunha Logística (Diagnóstico Google Workspace)',
        appPassword: cleanPass,
      }),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const errMsg = json?.error || 'Falha ao testar conexão com Google Workspace.';
      const userHelp = json?.userHelp ? `\n\n👉 Dica: ${json.userHelp}` : '';
      throw new Error(`${errMsg}${userHelp}`);
    }

    return {
      success: true,
      messageId: json.messageId,
      accepted: json.accepted,
      details: `Conexão autenticada e e-mail aceito com sucesso pelo Google Workspace (Message ID: ${json.messageId || 'OK'})`,
    };
  }

  /**
   * Notifica a chegada de novo e-mail no sistema com evento e áudio.
   */
  notifyNewEmail(msg: CorporateEmailMessage): void {
    // Dispara evento customizado para captura no NotificationBell e Toasts
    window.dispatchEvent(new CustomEvent('transcunha:new_corporate_email', {
      detail: {
        id: msg.id,
        subject: msg.subject,
        fromName: msg.fromName,
        from: msg.from,
        preview: msg.preview,
        date: msg.date,
        accountEmail: msg.accountEmail,
      }
    }));

    // Toca som de notificação se áudio não estiver mutado
    try {
      const isMuted = localStorage.getItem('transcunha_audio_muted') === 'true';
      if (!isMuted && typeof Audio !== 'undefined') {
        const audio = new Audio('/sounds/notification.mp3');
        audio.volume = 0.6;
        audio.play().catch(() => {});
      }
    } catch {}
  }

  private saveMessagesToStorage(messages: CorporateEmailMessage[], skipRemoteSync = false): void {
    try {
      localStorage.setItem(STORAGE_MESSAGES_KEY, JSON.stringify(messages));
      if (!skipRemoteSync) {
        this.broadcastLocalSync('messages');
        this.scheduleCloudPersist('messages');
      }
    } catch (e) {
      console.error('[CorporateEmailService] Erro ao salvar mensagens no localStorage:', e);
    }
  }

  private saveAccountsToStorage(accounts: CorporateEmailAccount[], skipRemoteSync = false): void {
    try {
      localStorage.setItem(STORAGE_EMAILS_KEY, JSON.stringify(accounts));
      if (!skipRemoteSync) {
        this.broadcastLocalSync('accounts');
        this.scheduleCloudPersist('accounts');
      }
    } catch (e) {
      console.error('[CorporateEmailService] Erro ao salvar contas no localStorage:', e);
    }
  }

  private broadcastLocalSync(scope: 'messages' | 'accounts' | 'config' | 'all'): void {
    try {
      localEmailBroadcast?.postMessage({
        scope,
        timestamp: Date.now(),
      });
    } catch {}
  }

  private scheduleCloudPersist(reason: string): void {
    if (cloudPersistTimeout) {
      clearTimeout(cloudPersistTimeout);
    }
    cloudPersistTimeout = setTimeout(() => {
      void this.persistToCloud(reason);
    }, 250);
  }

  async persistToCloud(reason = 'update'): Promise<void> {
    try {
      const messagesRaw = localStorage.getItem(STORAGE_MESSAGES_KEY);
      const accountsRaw = localStorage.getItem(STORAGE_EMAILS_KEY);
      const configRaw = localStorage.getItem(STORAGE_CONFIG_KEY);

      const payload = {
        messages: messagesRaw ? JSON.parse(messagesRaw) : [],
        accounts: accountsRaw ? JSON.parse(accountsRaw) : [],
        config: configRaw ? JSON.parse(configRaw) : null,
        updatedAt: new Date().toISOString(),
        reason,
      };

      await supabase.from('profile_permissions').upsert({
        id: SUPABASE_CORPORATE_EMAIL_RECORD_ID,
        permissions: payload,
      });

      const channel = this.getRealtimeChannel();
      channel.send({
        type: 'broadcast',
        event: 'corporate_email_sync',
        payload: {
          reason,
          updatedAt: payload.updatedAt,
        },
      }).catch(() => {});
    } catch (err) {
      console.warn('[CorporateEmailService] Falha ao persistir sincronização em nuvem:', err);
    }
  }

  async syncFromCloud(): Promise<{ updated: boolean; timestamp: string }> {
    const nowIso = new Date().toISOString();
    try {
      const { data, error } = await supabase
        .from('profile_permissions')
        .select('permissions')
        .eq('id', SUPABASE_CORPORATE_EMAIL_RECORD_ID)
        .maybeSingle();

      if (error || !data?.permissions) {
        return { updated: false, timestamp: nowIso };
      }

      const remote = data.permissions as {
        messages?: CorporateEmailMessage[];
        accounts?: CorporateEmailAccount[];
        config?: CorporateEmailServerConfig | null;
        updatedAt?: string;
      };

      let changed = false;

      if (Array.isArray(remote.messages) && remote.messages.length > 0) {
        const localRaw = localStorage.getItem(STORAGE_MESSAGES_KEY);
        const remoteStr = JSON.stringify(remote.messages);
        if (localRaw !== remoteStr) {
          this.saveMessagesToStorage(remote.messages, true);
          window.dispatchEvent(new CustomEvent('corporate_messages_updated', { detail: { source: 'cloud' } }));
          changed = true;
        }
      }

      if (Array.isArray(remote.accounts) && remote.accounts.length > 0) {
        const localAccRaw = localStorage.getItem(STORAGE_EMAILS_KEY);
        const remoteAccStr = JSON.stringify(remote.accounts);
        if (localAccRaw !== remoteAccStr) {
          this.saveAccountsToStorage(remote.accounts, true);
          window.dispatchEvent(new CustomEvent('corporate_emails_updated', { detail: { source: 'cloud' } }));
          changed = true;
        }
      }

      if (remote.config) {
        const localCfgRaw = localStorage.getItem(STORAGE_CONFIG_KEY);
        const remoteCfgStr = JSON.stringify(remote.config);
        if (localCfgRaw !== remoteCfgStr) {
          localStorage.setItem(STORAGE_CONFIG_KEY, remoteCfgStr);
          window.dispatchEvent(new CustomEvent('corporate_email_config_updated', { detail: remote.config }));
          changed = true;
        }
      }

      return { updated: changed, timestamp: remote.updatedAt || nowIso };
    } catch (err) {
      console.warn('[CorporateEmailService] Erro ao sincronizar da nuvem:', err);
      return { updated: false, timestamp: nowIso };
    }
  }

  /**
   * Sincroniza mensagens reais da conta Gmail / Google Workspace via IMAP (/api/fetch-emails).
   */
  async syncFromGmailImap(options?: {
    folder?: CorporateEmailFolder;
    email?: string;
    appPassword?: string;
    limit?: number;
  }): Promise<{ synced: number; newUnread: number; error?: string }> {
    try {
      if (typeof window === 'undefined') return { synced: 0, newUnread: 0 };

      const appPassword = (
        options?.appPassword ||
        localStorage.getItem('transcunha_gworkspace_app_password') ||
        ''
      )
        .replace(/\s+/g, '')
        .trim();

      if (!appPassword) {
        return { synced: 0, newUnread: 0, error: 'MISSING_APP_PASSWORD' };
      }

      const sessionUser = this.getCurrentSessionUser();
      const email = (
        options?.email ||
        localStorage.getItem('transcunha_gworkspace_sender_email') ||
        sessionUser?.corporateEmail ||
        'contato@transcunhaoficial.com.br'
      ).trim();

      const folder = options?.folder || 'inbox';

      const res = await fetch('/api/fetch-emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          appPassword,
          folder,
          limit: options?.limit || 25,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.success || !Array.isArray(json.messages)) {
        return {
          synced: 0,
          newUnread: 0,
          error: json?.userHelp || json?.error || `Erro IMAP (${res.status})`,
        };
      }

      const incoming: CorporateEmailMessage[] = json.messages;
      if (incoming.length === 0) {
        return { synced: 0, newUnread: 0 };
      }

      const currentAll = this.getMessages();
      const existingMap = new Map<string, CorporateEmailMessage>();
      currentAll.forEach(m => existingMap.set(m.id, m));

      let newUnread = 0;
      const newUnreadMsgs: CorporateEmailMessage[] = [];

      for (const msg of incoming) {
        const existing = existingMap.get(msg.id);
        if (!existing) {
          if (msg.folder === 'inbox' && !msg.isRead) {
            newUnread++;
            newUnreadMsgs.push(msg);
          }
        }
        existingMap.set(msg.id, {
          ...msg,
          isRead: existing ? existing.isRead : msg.isRead,
          isStarred: existing ? existing.isStarred : msg.isStarred,
        });
      }

      // Remove mensagens mock iniciais se já houver mensagens reais do IMAP na caixa de entrada
      const merged = Array.from(existingMap.values()).filter(m => {
        if (m.id.startsWith('msg_00') && incoming.some(im => im.folder === 'inbox')) {
          return false;
        }
        return true;
      });

      merged.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      this.saveMessagesToStorage(merged);
      window.dispatchEvent(new CustomEvent('corporate_messages_updated', { detail: { source: 'imap' } }));

      if (newUnreadMsgs.length > 0) {
        this.notifyNewEmail(newUnreadMsgs[0]);
      }

      return { synced: incoming.length, newUnread };
    } catch (err: any) {
      console.warn('[CorporateEmailService] Falha na sincronização IMAP:', err);
      return { synced: 0, newUnread: 0, error: err?.message || 'Erro de rede IMAP' };
    }
  }

  private getRealtimeChannel(): ReturnType<typeof supabase.channel> {
    if (!emailRealtimeChannel) {
      emailRealtimeChannel = supabase.channel(CORPORATE_EMAIL_REALTIME_CHANNEL, {
        config: {
          broadcast: { ack: false, self: false },
        },
      });
      emailRealtimeChannel.subscribe();
    }
    return emailRealtimeChannel;
  }

  /**
   * Inscreve em tempo real refinado: BroadcastChannel (mesmo navegador entre janelas),
   * storage events e Supabase Realtime (broadcast + postgres_changes).
   */
  subscribeToRealtime(onSync: (source: string) => void): () => void {
    const handleLocalBroadcast = (event: MessageEvent) => {
      const scope = event?.data?.scope || 'all';
      if (scope === 'messages' || scope === 'all') {
        window.dispatchEvent(new CustomEvent('corporate_messages_updated', { detail: { source: 'broadcast' } }));
      }
      if (scope === 'accounts' || scope === 'all') {
        window.dispatchEvent(new CustomEvent('corporate_emails_updated', { detail: { source: 'broadcast' } }));
      }
      if (scope === 'config' || scope === 'all') {
        window.dispatchEvent(new CustomEvent('corporate_email_config_updated', { detail: { source: 'broadcast' } }));
      }
      onSync('broadcast');
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_MESSAGES_KEY) {
        window.dispatchEvent(new CustomEvent('corporate_messages_updated', { detail: { source: 'storage' } }));
        onSync('storage');
      } else if (event.key === STORAGE_EMAILS_KEY) {
        window.dispatchEvent(new CustomEvent('corporate_emails_updated', { detail: { source: 'storage' } }));
        onSync('storage');
      } else if (event.key === STORAGE_CONFIG_KEY) {
        window.dispatchEvent(new CustomEvent('corporate_email_config_updated', { detail: { source: 'storage' } }));
        onSync('storage');
      }
    };

    if (localEmailBroadcast) {
      localEmailBroadcast.addEventListener('message', handleLocalBroadcast);
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', handleStorage);
    }

    const rtChannel = supabase
      .channel(`corporate_email_listener_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`)
      .on('broadcast', { event: 'corporate_email_sync' }, async () => {
        await this.syncFromCloud();
        onSync('supabase_broadcast');
      })
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profile_permissions' },
        async (payload: any) => {
          const rowId = payload?.new?.id ?? payload?.old?.id;
          if (rowId === SUPABASE_CORPORATE_EMAIL_RECORD_ID) {
            await this.syncFromCloud();
            onSync('postgres_changes');
          }
        }
      )
      .subscribe();

    // Sincronização inicial imediata com a nuvem
    void this.syncFromCloud().then((res) => {
      if (res.updated) onSync('initial_cloud');
    });

    return () => {
      if (localEmailBroadcast) {
        localEmailBroadcast.removeEventListener('message', handleLocalBroadcast);
      }
      if (typeof window !== 'undefined') {
        window.removeEventListener('storage', handleStorage);
      }
      try {
        void supabase.removeChannel(rtChannel);
      } catch {}
    };
  }
}

export const corporateEmailService = new CorporateEmailService();
