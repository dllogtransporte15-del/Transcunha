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
import { isDeveloperUser, isDemoUser } from '../auth';

const STORAGE_EMAILS_KEY = 'transcunha_corporate_emails';
const STORAGE_CONFIG_KEY = 'transcunha_corporate_email_config';
const STORAGE_MESSAGES_KEY = 'transcunha_corporate_messages_v1';

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
  webmailUrl: 'https://outlook.office.com',
  smtpHost: 'smtp.office365.com',
  smtpPort: 587,
  smtpSecure: 'tls',
  imapHost: 'outlook.office365.com',
  imapPort: 993,
  imapSecure: 'ssl',
  popHost: 'outlook.office365.com',
  popPort: 995,
  defaultQuotaMb: 51200, // 50 GB (Padrão Microsoft 365 / Exchange)
  providerPreset: 'microsoft_365',
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
  cpanel: {
    label: 'cPanel / Hospedagem Própria (Padrão Transcunha)',
    smtpHost: 'mail.transcunhaoficial.com.br',
    smtpPort: 465,
    smtpSecure: 'ssl',
    imapHost: 'mail.transcunhaoficial.com.br',
    imapPort: 993,
    imapSecure: 'ssl',
    webmailUrl: 'https://webmail.transcunhaoficial.com.br',
  },
  google_workspace: {
    label: 'Google Workspace (Gmail Corporativo)',
    smtpHost: 'smtp.gmail.com',
    smtpPort: 587,
    smtpSecure: 'tls',
    imapHost: 'imap.gmail.com',
    imapPort: 993,
    imapSecure: 'ssl',
    webmailUrl: 'https://mail.google.com/a/transcunhaoficial.com.br',
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
    signature: 'Setor Financeiro — Transcunha Logística\nTel: (66) 3544-0000 | financeiro@transcunhaoficial.com.br',
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

        if (parsed.providerPreset === 'cpanel' || parsed.providerPreset === 'google_workspace' || parsed.smtpHost === 'mail.transcunha.com.br' || parsed.smtpHost === 'smtp.gmail.com') {
          return { ...DEFAULT_EMAIL_SERVER_CONFIG, domain: 'transcunhaoficial.com.br' };
        }
        return { ...DEFAULT_EMAIL_SERVER_CONFIG, ...parsed, domain: parsed.domain || 'transcunhaoficial.com.br' };
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
   * Gera o código HTML padronizado para assinatura de e-mail da Transcunha Logística.
   */
  generateSignatureHtml(
    account: CorporateEmailAccount, 
    companyLogo?: string | null,
    extraPhone = '(66) 3544-0000'
  ): string {
    const logoUrl = companyLogo || 'https://transcunhaoficial.com.br/logo.png';
    return `<div style="font-family: Arial, Helvetica, sans-serif; font-size: 13px; color: #1e293b; line-height: 1.4; border-left: 4px solid #2563eb; padding-left: 14px; margin-top: 16px;">
  <div style="font-size: 15px; font-weight: bold; color: #0f172a;">${account.displayName}</div>
  <div style="font-size: 12px; color: #64748b; font-weight: 600; text-transform: uppercase;">${account.department} — Transcunha Logística</div>
  <div style="margin-top: 6px; font-size: 12px; color: #334155;">
    <strong>E-mail:</strong> <a href="mailto:${account.email}" style="color: #2563eb; text-decoration: none;">${account.email}</a><br/>
    <strong>Telefone / WhatsApp:</strong> ${extraPhone}<br/>
    <strong>Website:</strong> <a href="https://transcunhaoficial.com.br" target="_blank" style="color: #2563eb; text-decoration: none;">www.transcunhaoficial.com.br</a>
  </div>
  <div style="margin-top: 8px; font-size: 11px; color: #94a3b8; font-style: italic;">
    Transcunha Logística & Transportes — Excelência, Segurança e Eficiência no Transporte Rodoviário.
  </div>
</div>`;
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
    const { to, cc, subject, bodyHtml, bodyText, accountEmail, senderName = 'Transcunha Transportes e Logística', appPassword, attachments = [] } = data;

    let messageId: string | undefined;

    // Se houver senha de app, tenta envio real via /api/send-email
    if (appPassword && appPassword.trim()) {
      const allTo = to.filter(Boolean).join(', ');
      const allCc = cc && cc.length > 0 ? cc.filter(Boolean).join(', ') : undefined;

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

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const errMsg = json?.error || 'Erro no servidor de envio ao disparar e-mail';
        const userHelp = json?.userHelp ? `\n\n👉 Dica: ${json.userHelp}` : '';
        throw new Error(`${errMsg}${userHelp}`);
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

  private saveMessagesToStorage(messages: CorporateEmailMessage[]): void {
    try {
      localStorage.setItem(STORAGE_MESSAGES_KEY, JSON.stringify(messages));
    } catch (e) {
      console.error('[CorporateEmailService] Erro ao salvar mensagens no localStorage:', e);
    }
  }

  private saveAccountsToStorage(accounts: CorporateEmailAccount[]): void {
    try {
      localStorage.setItem(STORAGE_EMAILS_KEY, JSON.stringify(accounts));
    } catch (e) {
      console.error('[CorporateEmailService] Erro ao salvar contas no localStorage:', e);
    }
  }
}

export const corporateEmailService = new CorporateEmailService();
