import React, { useState, useEffect, useMemo } from 'react';
import { UserProfile } from '../types';
import type {
  User,
  CorporateEmailAccount,
  CorporateEmailServerConfig,
  CorporateEmailDepartment,
  CorporateEmailStatus
} from '../types';
import { isDeveloperUser, filterVisibleUsers } from '../auth';
import {
  corporateEmailService,
  DEFAULT_EMAIL_SERVER_CONFIG,
  PROVIDER_PRESETS
} from '../services/corporateEmailService';
import {
  Mail,
  Inbox,
  Plus,
  Search,
  Filter,
  ExternalLink,
  Copy,
  Check,
  Eye,
  EyeOff,
  Key,
  Server,
  ShieldCheck,
  HardDrive,
  Users,
  Edit3,
  Trash2,
  Send,
  Sparkles,
  FileText,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Globe,
  HelpCircle,
  X,
  Smartphone,
  Laptop,
  Briefcase
} from 'lucide-react';
import Header from '../components/Header';
import { useToast } from '../hooks/useToast';
import { WebmailOutlookView } from '../components/corporate-email/WebmailOutlookView';

interface CorporateEmailPageProps {
  currentUser: User;
  users: User[];
  companyLogo?: string | null;
}

const DEPARTMENT_COLORS: Record<CorporateEmailDepartment, { bg: string; text: string; border: string }> = {
  Diretoria: {
    bg: 'bg-purple-100 dark:bg-purple-950/60',
    text: 'text-purple-700 dark:text-purple-300',
    border: 'border-purple-200 dark:border-purple-800'
  },
  Financeiro: {
    bg: 'bg-emerald-100 dark:bg-emerald-950/60',
    text: 'text-emerald-700 dark:text-emerald-300',
    border: 'border-emerald-200 dark:border-emerald-800'
  },
  Operacional: {
    bg: 'bg-blue-100 dark:bg-blue-950/60',
    text: 'text-blue-700 dark:text-blue-300',
    border: 'border-blue-200 dark:border-blue-800'
  },
  Comercial: {
    bg: 'bg-amber-100 dark:bg-amber-950/60',
    text: 'text-amber-700 dark:text-amber-300',
    border: 'border-amber-200 dark:border-amber-800'
  },
  'RH / Administrativo': {
    bg: 'bg-rose-100 dark:bg-rose-950/60',
    text: 'text-rose-700 dark:text-rose-300',
    border: 'border-rose-200 dark:border-rose-800'
  },
  'TI / Suporte': {
    bg: 'bg-cyan-100 dark:bg-cyan-950/60',
    text: 'text-cyan-700 dark:text-cyan-300',
    border: 'border-cyan-200 dark:border-cyan-800'
  },
  Geral: {
    bg: 'bg-slate-100 dark:bg-slate-800',
    text: 'text-slate-700 dark:text-slate-300',
    border: 'border-slate-200 dark:border-slate-700'
  }
};

export const CorporateEmailPage: React.FC<CorporateEmailPageProps> = ({
  currentUser,
  users,
  companyLogo
}) => {
  const { showToast } = useToast();

  // State: Dados principais
  const [accounts, setAccounts] = useState<CorporateEmailAccount[]>([]);
  const [serverConfig, setServerConfig] = useState<CorporateEmailServerConfig>(DEFAULT_EMAIL_SERVER_CONFIG);
  const [activeTab, setActiveTab] = useState<'webmail' | 'accounts' | 'server' | 'signature' | 'compose'>('webmail');
  const [unreadTotalCount, setUnreadTotalCount] = useState<number>(() => {
    try {
      return corporateEmailService.getUnreadCount();
    } catch {
      return 0;
    }
  });

  // State: Filtros de busca
  const [searchTerm, setSearchTerm] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // State: Modais
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<CorporateEmailAccount | null>(null);

  // State: Exibição de senhas
  const [visiblePasswords, setVisiblePasswords] = useState<Record<string, boolean>>({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Form State: Modal de Conta
  const [formEmailPrefix, setFormEmailPrefix] = useState('');
  const [formDisplayName, setFormDisplayName] = useState('');
  const [formUserId, setFormUserId] = useState('');
  const [formDepartment, setFormDepartment] = useState<CorporateEmailDepartment>('Operacional');
  const [formPassword, setFormPassword] = useState('');
  const [formStatus, setFormStatus] = useState<CorporateEmailStatus>('Ativo');
  const [formQuotaGb, setFormQuotaGb] = useState('5');
  const [formAliases, setFormAliases] = useState('');
  const [formForwardTo, setFormForwardTo] = useState('');
  const [formNotes, setFormNotes] = useState('');

  // Form State: Configuração de Servidor
  const [configForm, setConfigForm] = useState<CorporateEmailServerConfig>(DEFAULT_EMAIL_SERVER_CONFIG);

  // Signature State
  const [selectedSignatureAccountId, setSelectedSignatureAccountId] = useState<string>('');
  const [signatureExtraPhone, setSignatureExtraPhone] = useState('(66) 3544-0000');
  const [signatureExtraWhatsapp, setSignatureExtraWhatsapp] = useState('(66) 99999-0000');

  // Compose / Test Email State
  const [composeFrom, setComposeFrom] = useState('');
  const [composeTo, setComposeTo] = useState('');
  const [composeSubject, setComposeSubject] = useState('');
  const [composeBody, setComposeBody] = useState('');
  const [isSendingTest, setIsSendingTest] = useState(false);

  const visibleUsersForEmail = useMemo(() => filterVisibleUsers(users, currentUser), [users, currentUser]);

  // Carregar dados iniciais e ouvir atualizações
  const loadData = () => {
    const rawAccs = corporateEmailService.getEmailAccounts(visibleUsersForEmail);
    const accs = isDeveloperUser(currentUser)
      ? rawAccs
      : rawAccs.filter(a => a.userId !== 'USR-001' && a.userId !== 'USR-292' && a.email.toLowerCase() !== 'dllogtransporte15@gmail.com' && a.email.toLowerCase() !== 'demo@demo.com');
    const cfg = corporateEmailService.getServerConfig();
    setAccounts(accs);
    setServerConfig(cfg);
    setConfigForm(cfg);

    if (accs.length > 0 && !selectedSignatureAccountId) {
      setSelectedSignatureAccountId(accs[0].id);
      setComposeFrom(accs[0].email);
    }
  };

  useEffect(() => {
    loadData();

    const handleUpdate = () => {
      loadData();
      try {
        setUnreadTotalCount(corporateEmailService.getUnreadCount());
      } catch {}
    };
    window.addEventListener('corporate_emails_updated', handleUpdate);
    window.addEventListener('corporate_email_config_updated', handleUpdate);
    window.addEventListener('corporate_messages_updated', handleUpdate);
    window.addEventListener('transcunha:new_corporate_email', handleUpdate);

    return () => {
      window.removeEventListener('corporate_emails_updated', handleUpdate);
      window.removeEventListener('corporate_email_config_updated', handleUpdate);
      window.removeEventListener('corporate_messages_updated', handleUpdate);
      window.removeEventListener('transcunha:new_corporate_email', handleUpdate);
    };
  }, [users]);

  // Contas filtradas
  const filteredAccounts = useMemo(() => {
    return accounts.filter(acc => {
      const matchSearch =
        acc.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        acc.displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (acc.userName && acc.userName.toLowerCase().includes(searchTerm.toLowerCase())) ||
        acc.department.toLowerCase().includes(searchTerm.toLowerCase()) ||
        acc.aliases.some(al => al.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchDept = departmentFilter === 'all' || acc.department === departmentFilter;
      const matchStatus = statusFilter === 'all' || acc.status === statusFilter;

      return matchSearch && matchDept && matchStatus;
    });
  }, [accounts, searchTerm, departmentFilter, statusFilter]);

  // Métricas agregadas
  const metrics = useMemo(() => {
    const total = accounts.length;
    const active = accounts.filter(a => a.status === 'Ativo').length;
    const totalQuotaMb = accounts.reduce((acc, a) => acc + (a.quotaMb || 0), 0);
    const totalUsedMb = accounts.reduce((acc, a) => acc + (a.usedMb || 0), 0);
    const totalQuotaGb = (totalQuotaMb / 1024).toFixed(1);
    const totalUsedGb = (totalUsedMb / 1024).toFixed(1);
    const usedPercentage = totalQuotaMb > 0 ? Math.round((totalUsedMb / totalQuotaMb) * 100) : 0;

    return { total, active, totalQuotaGb, totalUsedGb, usedPercentage };
  }, [accounts]);

  // Copiar texto para área de transferência
  const handleCopyText = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2500);
    showToast('Copiado para a área de transferência!', 'success');
  };

  // Alternar visibilidade de senha
  const togglePasswordVisibility = (id: string) => {
    setVisiblePasswords(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Abrir Modal de Criação / Edição
  const handleOpenAccountModal = (acc?: CorporateEmailAccount) => {
    if (acc) {
      setEditingAccount(acc);
      const prefix = acc.email.includes('@') ? acc.email.split('@')[0] : acc.email;
      setFormEmailPrefix(prefix);
      setFormDisplayName(acc.displayName);
      setFormUserId(acc.userId || '');
      setFormDepartment(acc.department);
      setFormPassword(acc.password || '');
      setFormStatus(acc.status);
      setFormQuotaGb(String(Math.round(acc.quotaMb / 1024) || 5));
      setFormAliases(acc.aliases ? acc.aliases.join(', ') : '');
      setFormForwardTo(acc.forwardTo || '');
      setFormNotes(acc.notes || '');
    } else {
      setEditingAccount(null);
      setFormEmailPrefix('');
      setFormDisplayName('');
      setFormUserId('');
      setFormDepartment('Operacional');
      setFormPassword(corporateEmailService.generateSecurePassword(12));
      setFormStatus('Ativo');
      setFormQuotaGb('5');
      setFormAliases('');
      setFormForwardTo('');
      setFormNotes('');
    }
    setIsAccountModalOpen(true);
  };

  // Selecionar usuário e preencher nome/sugestão de e-mail automaticamente
  const handleSelectUser = (selectedId: string) => {
    setFormUserId(selectedId);
    if (!selectedId) return;

    const selected = visibleUsersForEmail.find(u => u.id === selectedId);
    if (selected) {
      if (!formDisplayName) setFormDisplayName(selected.name);
      if (!formEmailPrefix) {
        const cleanName = selected.name
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9]/g, '.');
        setFormEmailPrefix(cleanName);
      }
      setFormDepartment(corporateEmailService.mapProfileToDepartment(selected.profile));
    }
  };

  // Salvar conta
  const handleSaveAccount = (e: React.FormEvent) => {
    e.preventDefault();

    const cleanPrefix = formEmailPrefix.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '');
    if (!cleanPrefix) {
      alert('Informe o prefixo do e-mail corporativo (ex: financeiro ou nome.sobrenome).');
      return;
    }

    const domain = serverConfig.domain || 'transcunhaoficial.com.br';
    const fullEmail = `${cleanPrefix}@${domain}`;
    const selectedUser = users.find(u => u.id === formUserId);

    const aliasesArray = formAliases
      .split(',')
      .map(al => al.trim().toLowerCase())
      .filter(al => al.length > 0 && al.includes('@'));

    const quotaMb = Math.max(1, parseInt(formQuotaGb, 10) || 5) * 1024;

    corporateEmailService.saveEmailAccount({
      id: editingAccount ? editingAccount.id : undefined,
      email: fullEmail,
      displayName: formDisplayName.trim() || fullEmail,
      userId: formUserId || undefined,
      userName: selectedUser?.name || undefined,
      department: formDepartment,
      password: formPassword.trim() || undefined,
      status: formStatus,
      quotaMb,
      aliases: aliasesArray,
      forwardTo: formForwardTo.trim() || undefined,
      notes: formNotes.trim() || undefined,
    }, users);

    setIsAccountModalOpen(false);
    showToast(editingAccount ? 'Conta de e-mail atualizada!' : 'Nova conta corporativa criada!', 'success');
  };

  // Excluir conta
  const handleDeleteAccount = (id: string, email: string) => {
    if (confirm(`Deseja realmente remover a conta de e-mail corporativo ${email}?`)) {
      corporateEmailService.deleteEmailAccount(id);
      showToast('Conta de e-mail removida com sucesso.', 'info');
    }
  };

  // Salvar Configurações de Servidor
  const handleSaveServerConfig = (e: React.FormEvent) => {
    e.preventDefault();
    corporateEmailService.saveServerConfig(configForm);
    setServerConfig(configForm);
    showToast('Configurações de servidor de e-mail salvas com sucesso!', 'success');
  };

  // Aplicar Preset de Provedor
  const handleApplyPreset = (presetKey: CorporateEmailServerConfig['providerPreset']) => {
    const preset = PROVIDER_PRESETS[presetKey];
    if (preset) {
      setConfigForm(prev => ({
        ...prev,
        providerPreset: presetKey,
        smtpHost: preset.smtpHost,
        smtpPort: preset.smtpPort,
        smtpSecure: preset.smtpSecure,
        imapHost: preset.imapHost,
        imapPort: preset.imapPort,
        imapSecure: preset.imapSecure,
        webmailUrl: preset.webmailUrl,
      }));
      showToast(`Preset "${preset.label}" aplicado. Lembre-se de salvar.`, 'info');
    }
  };

  // Opções de colaboradores (Usuários Internos) para assinatura
  const internalSignatureOptions = useMemo<CorporateEmailAccount[]>(() => {
    const internalUsers = visibleUsersForEmail
      .filter(
        u =>
          u.profile !== UserProfile.Cliente &&
          u.profile !== UserProfile.Motorista &&
          u.profile !== UserProfile.Embarcador
      )
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

    return internalUsers.map(u => {
      const matched = accounts.find(
        a =>
          a.userId === u.id ||
          (u.corporateEmail && a.email.toLowerCase() === u.corporateEmail.toLowerCase()) ||
          (u.email && a.email.toLowerCase() === u.email.toLowerCase())
      );

      if (matched) {
        return {
          ...matched,
          displayName: u.name,
          userId: u.id,
          userName: u.name,
        };
      }

      const fallbackLocal =
        u.name
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '.')
          .replace(/^\.+|\.+$/g, '') || 'colaborador';

      const email =
        (u.corporateEmail && u.corporateEmail.trim()) ||
        (u.email && u.email.includes('@') ? u.email.trim() : `${fallbackLocal}@${serverConfig.domain}`);

      return {
        id: `user_${u.id}`,
        email,
        displayName: u.name,
        userId: u.id,
        userName: u.name,
        department: corporateEmailService.mapProfileToDepartment(u.profile),
        status: u.active ? 'Ativo' : 'Inativo',
        quotaMb: serverConfig.defaultQuotaMb || 5120,
        usedMb: 0,
        aliases: [],
        createdAt: '',
        updatedAt: '',
      };
    });
  }, [visibleUsersForEmail, accounts, serverConfig.domain, serverConfig.defaultQuotaMb]);

  // Conta selecionada para assinatura
  const selectedSignatureAccount = useMemo(() => {
    return (
      internalSignatureOptions.find(
        a => a.id === selectedSignatureAccountId || a.userId === selectedSignatureAccountId
      ) ||
      accounts.find(a => a.id === selectedSignatureAccountId) ||
      internalSignatureOptions[0] ||
      accounts[0]
    );
  }, [internalSignatureOptions, accounts, selectedSignatureAccountId]);

  // Enviar e-mail de teste
  const handleSendTestEmail = (e: React.FormEvent) => {
    e.preventDefault();
    if (!composeTo || !composeSubject) {
      alert('Informe o destinatário e o assunto.');
      return;
    }

    setIsSendingTest(true);
    setTimeout(() => {
      setIsSendingTest(false);
      showToast(`E-mail de teste disparado com sucesso para ${composeTo}!`, 'success');
      setComposeSubject('');
      setComposeBody('');
    }, 1200);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 pb-16">
      <Header
        title={
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white flex items-center gap-2.5">
              <span className="p-2 bg-blue-600 text-white rounded-xl shadow-md shadow-blue-600/30">
                <Mail className="w-5 h-5 sm:w-6 sm:h-6" />
              </span>
              <span>E-mail Corporativo Transcunha</span>
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
              Gerenciamento de contas @{serverConfig.domain}, senhas, cotas, servidores SMTP/IMAP e assinaturas oficiais
            </p>
          </div>
        }
      >
        <div className="flex items-center gap-2">
          <a
            href={serverConfig.webmailUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold border border-blue-200 dark:border-blue-800/60 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 hover:bg-blue-100 transition-all cursor-pointer"
          >
            <ExternalLink className="w-4 h-4" />
            <span>Webmail</span>
          </a>
          <button
            onClick={() => handleOpenAccountModal()}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-600/30 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Nova Conta</span>
          </button>
        </div>
      </Header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 space-y-6">

        {/* TOP BAR: CARDS DE MÉTRICAS & ATALHOS RÁPIDOS */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

          {/* Card 1: Total de Contas */}
          <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                Caixas Postais Ativas
              </span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-2xl font-black text-slate-900 dark:text-white">
                  {metrics.active}
                </span>
                <span className="text-xs text-slate-400">
                  de {metrics.total} criadas
                </span>
              </div>
            </div>
            <div className="p-3 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 rounded-2xl border border-blue-200 dark:border-blue-800">
              <Mail className="w-6 h-6" />
            </div>
          </div>

          {/* Card 2: Armazenamento Total Alocado */}
          <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                  Espaço Utilizado
                </span>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className="text-2xl font-black text-slate-900 dark:text-white">
                    {metrics.totalUsedGb} GB
                  </span>
                  <span className="text-xs text-slate-400">
                    / {metrics.totalQuotaGb} GB
                  </span>
                </div>
              </div>
              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 rounded-2xl border border-emerald-200 dark:border-emerald-800">
                <HardDrive className="w-6 h-6" />
              </div>
            </div>
            <div className="w-full bg-slate-100 dark:bg-slate-700 h-2 rounded-full overflow-hidden mt-3">
              <div
                className={`h-full transition-all duration-500 rounded-full ${metrics.usedPercentage > 85 ? 'bg-rose-500' : metrics.usedPercentage > 60 ? 'bg-amber-500' : 'bg-emerald-500'
                  }`}
                style={{ width: `${Math.min(100, Math.max(5, metrics.usedPercentage))}%` }}
              />
            </div>
          </div>

          {/* Card 3: Domínio Conectado */}
          <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                Domínio Corporativo
              </span>
              <div className="flex items-center gap-1.5 mt-1 font-black text-sm text-slate-900 dark:text-white">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block animate-pulse" />
                <span>@{serverConfig.domain}</span>
              </div>
              <span className="text-[11px] text-slate-400 font-medium block mt-0.5">
                SMTP {serverConfig.smtpPort} • IMAP {serverConfig.imapPort}
              </span>
            </div>
            <div className="p-3 bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 rounded-2xl border border-purple-200 dark:border-purple-800">
              <Globe className="w-6 h-6" />
            </div>
          </div>

          {/* Card 4: Botões de Ação Rápida */}
          <div className="bg-gradient-to-br from-blue-600 to-indigo-700 p-5 rounded-2xl shadow-md text-white flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-blue-100">
                Acesso Imediato
              </span>
              <ExternalLink className="w-4 h-4 text-blue-200" />
            </div>
            <div className="flex items-center gap-2 mt-2">
              <a
                href="https://mail.google.com/mail/u/0/?tab=rm&ogbl#inbox"
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 py-2 px-3 bg-white hover:bg-blue-50 text-blue-700 rounded-xl text-xs font-bold text-center transition-all shadow-sm flex items-center justify-center gap-1.5"
                title="Abrir Webmail Transcunha em nova aba"
              >
                <Mail className="w-3.5 h-3.5" />
                <span>Abrir Webmail</span>
              </a>
              <button
                onClick={() => handleOpenAccountModal()}
                className="py-2 px-3 bg-blue-500/80 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                title="Criar nova conta de e-mail corporativo"
              >
                <Plus className="w-4 h-4" />
                <span>Nova</span>
              </button>
            </div>
          </div>

        </div>

        {/* NAVEGAÇÃO DE ABAS */}
        <div className="bg-white dark:bg-slate-800 p-2 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-wrap items-center gap-2">
          <button
            onClick={() => setActiveTab('webmail')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${activeTab === 'webmail'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/60'
              }`}
          >
            <Inbox className="w-4 h-4" />
            <span>Webmail Outlook</span>
            {unreadTotalCount > 0 && (
              <span className={`px-2 py-0.5 text-xs font-black rounded-full ${activeTab === 'webmail' ? 'bg-white text-blue-600' : 'bg-blue-600 text-white animate-pulse'}`}>
                {unreadTotalCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('accounts')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${activeTab === 'accounts'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/60'
              }`}
          >
            <Mail className="w-4 h-4" />
            <span>Contas de E-mail ({accounts.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('server')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${activeTab === 'server'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/60'
              }`}
          >
            <Server className="w-4 h-4" />
            <span>Servidor & DNS (SMTP / IMAP)</span>
          </button>

          <button
            onClick={() => setActiveTab('signature')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${activeTab === 'signature'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/60'
              }`}
          >
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span>Gerador de Assinaturas</span>
          </button>

          <button
            onClick={() => setActiveTab('compose')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${activeTab === 'compose'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/60'
              }`}
          >
            <Send className="w-4 h-4" />
            <span>Testar Envio Institucional</span>
          </button>
        </div>

        {/* BANNER INFORMATIVO PROVEDOR */}
        {serverConfig.providerPreset === 'microsoft_365' && (
          <div className="bg-gradient-to-r from-blue-600/10 via-cyan-500/10 to-indigo-500/10 border border-blue-200 dark:border-blue-800/80 p-5 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 font-black text-sm text-blue-900 dark:text-blue-200">
                <Globe className="w-4 h-4 text-blue-600" />
                <span>Provedor Detectado: Microsoft 365 / Outlook (@{serverConfig.domain})</span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300">
                Os servidores de e-mail oficiais do domínio <strong>{serverConfig.domain || 'transcunhaoficial.com.br'}</strong> estão configurados no <strong>Microsoft 365 / Exchange</strong> (<code className="text-blue-600">outlook.office.com</code>). O acesso às caixas postais corporativas é feito diretamente pelo Outlook.
              </p>
            </div>
            <a
              href="https://admin.google.com/?utm_source=og_am&rapt=AEjHL4NB8yUVlJhoL5PaKW0-2Moki-8dJucxxkB7CpgzglxTADO1dCZ2lA0_6Lw4lsjwRuiFEtKjR5UAOg-mpZQxL3kJTrcT3mwmtfI3RXyZBYTYLoXk2DI"
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-600/30 transition-all shrink-0 flex items-center gap-1.5 cursor-pointer"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Acessar Outlook Web</span>
            </a>
          </div>
        )}

        {serverConfig.providerPreset === 'google_workspace' && (
          <div className="bg-gradient-to-r from-blue-500/10 via-indigo-500/10 to-purple-500/10 border border-blue-200 dark:border-blue-800/80 p-5 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 font-black text-sm text-blue-900 dark:text-blue-200">
                <Globe className="w-4 h-4 text-blue-600" />
                <span>Provedor: Google Workspace (@{serverConfig.domain})</span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300">
                Acesse o Webmail pelo portal padrão do Gmail corporativo (<code className="text-blue-600">mail.google.com</code>).
              </p>
            </div>
            <a
              href="https://mail.google.com"
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-600/30 transition-all shrink-0 flex items-center gap-1.5 cursor-pointer"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Acessar Gmail</span>
            </a>
          </div>
        )}

        {/* ========================================================= */}
        {/* ABA 0: WEBMAIL CORPORATIVO (ESTILO OUTLOOK 3 COLUNAS)    */}
        {/* ========================================================= */}
        {activeTab === 'webmail' && (
          <WebmailOutlookView
            accounts={accounts}
            onOpenSignatures={() => setActiveTab('signature')}
            onOpenServerConfig={() => setActiveTab('server')}
          />
        )}

        {/* ========================================================= */}
        {/* ABA 1: GERENCIAMENTO DE CONTAS DE E-MAIL                  */}
        {/* ========================================================= */}
        {activeTab === 'accounts' && (
          <div className="space-y-4 animate-fade-in">

            {/* Barra de Filtros */}
            <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="flex-1 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                {/* Campo de Busca */}
                <div className="relative flex-1">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Buscar por e-mail, nome, titular ou alias..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                  />
                </div>

                {/* Filtro por Departamento */}
                <select
                  value={departmentFilter}
                  onChange={(e) => setDepartmentFilter(e.target.value)}
                  className="px-3 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                >
                  <option value="all">Todos os Departamentos</option>
                  <option value="Diretoria">Diretoria</option>
                  <option value="Operacional">Operacional</option>
                  <option value="Financeiro">Financeiro</option>
                  <option value="Comercial">Comercial</option>
                  <option value="RH / Administrativo">RH / Administrativo</option>
                  <option value="TI / Suporte">TI / Suporte</option>
                  <option value="Geral">Geral</option>
                </select>

                {/* Filtro por Status */}
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-3 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                >
                  <option value="all">Todos os Status</option>
                  <option value="Ativo">Ativo</option>
                  <option value="Inativo">Inativo</option>
                  <option value="Bloqueado">Bloqueado</option>
                  <option value="Em Configuração">Em Configuração</option>
                </select>
              </div>

              {/* Botão de Criação */}
              <button
                onClick={() => handleOpenAccountModal()}
                className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs sm:text-sm font-bold transition-all shadow-md shadow-blue-600/30 flex items-center justify-center gap-2 cursor-pointer shrink-0"
              >
                <Plus className="w-4 h-4" />
                <span>+ Criar Conta de E-mail</span>
              </button>
            </div>

            {/* Tabela de Contas */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs sm:text-sm">
                  <thead>
                    <tr className="bg-slate-50/80 dark:bg-slate-900/60 text-slate-600 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-700">
                      <th className="py-3.5 px-4">Endereço de E-mail / Titular</th>
                      <th className="py-3.5 px-4">Usuário do Sistema Vinculado</th>
                      <th className="py-3.5 px-4">Departamento</th>
                      <th className="py-3.5 px-4">Senha da Caixa</th>
                      <th className="py-3.5 px-4">Cota de Armazenamento</th>
                      <th className="py-3.5 px-4 text-center">Status</th>
                      <th className="py-3.5 px-4 text-center">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
                    {filteredAccounts.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-12 text-center text-slate-400">
                          <Mail className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600 mb-2" />
                          <p className="font-semibold text-slate-600 dark:text-slate-400">Nenhuma conta de e-mail encontrada com os filtros selecionados.</p>
                          <p className="text-xs text-slate-400 mt-1">Clique no botão "+ Criar Conta de E-mail" para adicionar novas caixas postais.</p>
                        </td>
                      </tr>
                    ) : (
                      filteredAccounts.map(account => {
                        const deptConfig = DEPARTMENT_COLORS[account.department] || DEPARTMENT_COLORS.Geral;
                        const isPwdVisible = Boolean(visiblePasswords[account.id]);
                        const usedPct = account.quotaMb > 0 ? Math.round((account.usedMb / account.quotaMb) * 100) : 0;

                        return (
                          <tr key={account.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-700/40 transition-colors">

                            {/* 1. Endereço & Titular */}
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-2">
                                <div className="p-2 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 rounded-xl shrink-0">
                                  <Mail className="w-4 h-4" />
                                </div>
                                <div>
                                  <div className="flex items-center gap-1.5 font-bold text-slate-900 dark:text-white">
                                    <span>{account.email}</span>
                                    <button
                                      onClick={() => handleCopyText(account.email, `email_${account.id}`)}
                                      title="Copiar e-mail"
                                      className="text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 p-0.5 cursor-pointer"
                                    >
                                      {copiedKey === `email_${account.id}` ? (
                                        <Check className="w-3.5 h-3.5 text-emerald-500" />
                                      ) : (
                                        <Copy className="w-3.5 h-3.5" />
                                      )}
                                    </button>
                                  </div>
                                  <span className="text-xs text-slate-500 dark:text-slate-400 block">
                                    {account.displayName}
                                  </span>
                                  {account.aliases && account.aliases.length > 0 && (
                                    <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                                      <span className="text-[10px] text-slate-400 font-semibold">Aliases:</span>
                                      {account.aliases.map((al, idx) => (
                                        <span key={idx} className="text-[10px] bg-slate-100 dark:bg-slate-700/60 text-slate-600 dark:text-slate-300 px-1.5 py-0.2 rounded font-mono">
                                          {al}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </td>

                            {/* 2. Usuário do Sistema */}
                            <td className="py-3 px-4">
                              {account.userName ? (
                                <div className="flex items-center gap-2">
                                  <div className="w-7 h-7 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center font-bold text-xs text-slate-700 dark:text-slate-300">
                                    {account.userName.charAt(0).toUpperCase()}
                                  </div>
                                  <div>
                                    <span className="font-semibold text-slate-800 dark:text-slate-200 block">
                                      {account.userName}
                                    </span>
                                    <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold block">
                                      Colaborador Vinculado
                                    </span>
                                  </div>
                                </div>
                              ) : (
                                <span className="text-xs text-slate-400 italic">
                                  Caixa Departamental / Setor
                                </span>
                              )}
                            </td>

                            {/* 3. Departamento */}
                            <td className="py-3 px-4">
                              <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold border ${deptConfig.bg} ${deptConfig.text} ${deptConfig.border}`}>
                                <Briefcase className="w-3 h-3" />
                                <span>{account.department}</span>
                              </span>
                            </td>

                            {/* 4. Senha */}
                            <td className="py-3 px-4 font-mono text-xs">
                              {account.password ? (
                                <div className="flex items-center gap-1.5">
                                  <span className="text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-900/60 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700">
                                    {isPwdVisible ? account.password : '••••••••••••'}
                                  </span>
                                  <button
                                    onClick={() => togglePasswordVisibility(account.id)}
                                    title={isPwdVisible ? 'Ocultar senha' : 'Ver senha'}
                                    className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                                  >
                                    {isPwdVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                  </button>
                                  <button
                                    onClick={() => handleCopyText(account.password!, `pwd_${account.id}`)}
                                    title="Copiar senha"
                                    className="p-1 text-slate-400 hover:text-blue-600 cursor-pointer"
                                  >
                                    {copiedKey === `pwd_${account.id}` ? (
                                      <Check className="w-3.5 h-3.5 text-emerald-500" />
                                    ) : (
                                      <Copy className="w-3.5 h-3.5" />
                                    )}
                                  </button>
                                </div>
                              ) : (
                                <span className="text-slate-400 italic">Não definida</span>
                              )}
                            </td>

                            {/* 5. Cota */}
                            <td className="py-3 px-4">
                              <div className="w-36">
                                <div className="flex items-center justify-between text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                                  <span>{(account.usedMb / 1024).toFixed(1)} GB</span>
                                  <span>{Math.round(account.quotaMb / 1024)} GB</span>
                                </div>
                                <div className="w-full bg-slate-100 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${usedPct > 80 ? 'bg-rose-500' : usedPct > 50 ? 'bg-amber-500' : 'bg-blue-500'
                                      }`}
                                    style={{ width: `${Math.min(100, Math.max(5, usedPct))}%` }}
                                  />
                                </div>
                              </div>
                            </td>

                            {/* 6. Status */}
                            <td className="py-3 px-4 text-center">
                              <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${account.status === 'Ativo'
                                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800'
                                  : account.status === 'Bloqueado'
                                    ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border-rose-300 dark:border-rose-800'
                                    : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border-slate-300 dark:border-slate-700'
                                }`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${account.status === 'Ativo' ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                                <span>{account.status}</span>
                              </span>
                            </td>

                            {/* 7. Ações */}
                            <td className="py-3 px-4 text-center whitespace-nowrap">
                              <div className="flex items-center justify-center gap-1.5">
                                <a
                                  href={serverConfig.webmailUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title="Abrir no Webmail"
                                  className="p-1.5 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/50 rounded-lg transition-colors cursor-pointer"
                                >
                                  <ExternalLink className="w-4 h-4" />
                                </a>
                                <button
                                  onClick={() => {
                                    setSelectedSignatureAccountId(account.id);
                                    setActiveTab('signature');
                                  }}
                                  title="Gerar Assinatura Oficial"
                                  className="p-1.5 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/50 rounded-lg transition-colors cursor-pointer"
                                >
                                  <Sparkles className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleOpenAccountModal(account)}
                                  title="Editar Conta"
                                  className="p-1.5 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
                                >
                                  <Edit3 className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleDeleteAccount(account.id, account.email)}
                                  title="Excluir Conta"
                                  className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>

                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        )}

        {/* ========================================================= */}
        {/* ABA 2: CONFIGURAÇÃO DE SERVIDOR & DNS (SMTP / IMAP)        */}
        {/* ========================================================= */}
        {activeTab === 'server' && (
          <div className="space-y-6 animate-fade-in">
            <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-6">

              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-700 gap-3">
                <div>
                  <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                    <Server className="w-5 h-5 text-blue-600" />
                    Parâmetros de Conexão de E-mail Corporativo
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Configure os servidores SMTP de envio e IMAP/POP3 de recebimento para sincronização e acesso externo.
                  </p>
                </div>

                {/* Seletor de Presets */}
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-500">Provedor:</span>
                  <select
                    value={configForm.providerPreset}
                    onChange={(e) => handleApplyPreset(e.target.value as CorporateEmailServerConfig['providerPreset'])}
                    className="px-3 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                  >
                    <option value="cpanel">cPanel / Servidor Próprio (Transcunha)</option>
                    <option value="google_workspace">Google Workspace (Gmail)</option>
                    <option value="microsoft_365">Microsoft 365 (Outlook)</option>
                    <option value="zoho">Zoho Mail</option>
                    <option value="titan">Titan Mail</option>
                    <option value="custom">Personalizado</option>
                  </select>
                </div>
              </div>

              <form onSubmit={handleSaveServerConfig} className="space-y-6">

                {/* 1. Domínio & Webmail */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                      Domínio Oficial da Empresa *
                    </label>
                    <input
                      type="text"
                      value={configForm.domain}
                      onChange={(e) => setConfigForm({ ...configForm, domain: e.target.value })}
                      placeholder="transcunhaoficial.com.br"
                      className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-800 dark:text-slate-100 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                      required
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                      URL de Acesso ao Webmail *
                    </label>
                    <input
                      type="url"
                      value={configForm.webmailUrl}
                      onChange={(e) => setConfigForm({ ...configForm, webmailUrl: e.target.value })}
                      placeholder="https://webmail.transcunhaoficial.com.br"
                      className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-800 dark:text-slate-100 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                      required
                    />
                  </div>
                </div>

                {/* 2. Servidor SMTP (Envio) */}
                <div className="p-4 bg-slate-50 dark:bg-slate-900/60 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-3">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    <Send className="w-4 h-4 text-blue-500" />
                    <span>Servidor de Saída (SMTP - Envio de E-mails)</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-2">
                      <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                        Host SMTP
                      </label>
                      <input
                        type="text"
                        value={configForm.smtpHost}
                        onChange={(e) => setConfigForm({ ...configForm, smtpHost: e.target.value })}
                        placeholder="mail.transcunhaoficial.com.br ou smtp.office365.com"
                        className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-mono text-slate-800 dark:text-slate-100"
                        required
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                          Porta
                        </label>
                        <input
                          type="number"
                          value={configForm.smtpPort}
                          onChange={(e) => setConfigForm({ ...configForm, smtpPort: parseInt(e.target.value, 10) || 465 })}
                          className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-mono text-slate-800 dark:text-slate-100"
                          required
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                          Segurança
                        </label>
                        <select
                          value={configForm.smtpSecure}
                          onChange={(e) => setConfigForm({ ...configForm, smtpSecure: e.target.value as any })}
                          className="w-full px-2 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-100"
                        >
                          <option value="ssl">SSL</option>
                          <option value="tls">TLS</option>
                          <option value="none">Nenhuma</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 3. Servidor IMAP (Recebimento) */}
                <div className="p-4 bg-slate-50 dark:bg-slate-900/60 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-3">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    <Mail className="w-4 h-4 text-emerald-500" />
                    <span>Servidor de Entrada (IMAP - Recebimento e Leitura)</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-2">
                      <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                        Host IMAP
                      </label>
                      <input
                        type="text"
                        value={configForm.imapHost}
                        onChange={(e) => setConfigForm({ ...configForm, imapHost: e.target.value })}
                        placeholder="mail.transcunhaoficial.com.br ou outlook.office365.com"
                        className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-mono text-slate-800 dark:text-slate-100"
                        required
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                          Porta
                        </label>
                        <input
                          type="number"
                          value={configForm.imapPort}
                          onChange={(e) => setConfigForm({ ...configForm, imapPort: parseInt(e.target.value, 10) || 993 })}
                          className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-mono text-slate-800 dark:text-slate-100"
                          required
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                          Segurança
                        </label>
                        <select
                          value={configForm.imapSecure}
                          onChange={(e) => setConfigForm({ ...configForm, imapSecure: e.target.value as any })}
                          className="w-full px-2 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-100"
                        >
                          <option value="ssl">SSL</option>
                          <option value="tls">TLS</option>
                          <option value="none">Nenhuma</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="submit"
                    className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs sm:text-sm font-bold shadow-lg shadow-blue-600/30 transition-all cursor-pointer"
                  >
                    Salvar Parâmetros do Servidor
                  </button>
                </div>
              </form>
            </div>

            {/* GUIA RÁPIDO DE CONFIGURAÇÃO EM CLIENTES DE E-MAIL */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-2">
                <div className="flex items-center gap-2 font-bold text-xs uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  <Smartphone className="w-4 h-4 text-blue-500" />
                  <span>Celular (Android / iOS)</span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Adicione como conta <strong>IMAP</strong> no app de e-mail do celular. Utilize o e-mail corporativo completo como usuário e a senha da caixa postal.
                </p>
              </div>

              <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-2">
                <div className="flex items-center gap-2 font-bold text-xs uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  <Laptop className="w-4 h-4 text-indigo-500" />
                  <span>Outlook / Thunderbird</span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Servidor de Entrada: <code className="text-blue-600">{configForm.imapHost}</code> (porta {configForm.imapPort} com SSL).
                  Saída: <code className="text-blue-600">{configForm.smtpHost}</code> (porta {configForm.smtpPort} com {configForm.smtpSecure.toUpperCase()}).
                </p>
              </div>

              <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-2">
                <div className="flex items-center gap-2 font-bold text-xs uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  <ShieldCheck className="w-4 h-4 text-emerald-500" />
                  <span>Segurança & Autenticação</span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Marque a opção "Meu servidor de saída (SMTP) requer autenticação" com os mesmos dados de login da caixa postal.
                </p>
              </div>
            </div>

          </div>
        )}

        {/* ========================================================= */}
        {/* ABA 3: GERADOR DE ASSINATURAS CORPORATIVAS               */}
        {/* ========================================================= */}
        {activeTab === 'signature' && selectedSignatureAccount && (
          <div className="space-y-6 animate-fade-in">
            <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-6">

              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-700 gap-3">
                <div>
                  <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-amber-500" />
                    Assinatura de E-mail Padronizada Transcunha
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Gere assinaturas profissionais formatadas para colar no Outlook, Gmail ou Webmail corporativo.
                  </p>
                </div>

                {/* Selecionar Conta */}
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-500">Colaborador:</span>
                  <select
                    value={selectedSignatureAccount?.id || ''}
                    onChange={(e) => setSelectedSignatureAccountId(e.target.value)}
                    className="px-3 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                  >
                    {(internalSignatureOptions.length > 0 ? internalSignatureOptions : accounts).map(acc => (
                      <option key={acc.id} value={acc.id}>
                        {acc.displayName} ({acc.email})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Campos de Personalização */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Telefone Fixo da Empresa
                  </label>
                  <input
                    type="text"
                    value={signatureExtraPhone}
                    onChange={(e) => setSignatureExtraPhone(e.target.value)}
                    placeholder="(66) 3544-0000"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-800 dark:text-slate-100"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    WhatsApp Corporativo
                  </label>
                  <input
                    type="text"
                    value={signatureExtraWhatsapp}
                    onChange={(e) => setSignatureExtraWhatsapp(e.target.value)}
                    placeholder="(66) 99999-0000"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-800 dark:text-slate-100"
                  />
                </div>
              </div>

              {/* Pré-visualização ao Vivo */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                  Pré-visualização da Assinatura:
                </span>
                <div className="p-6 bg-slate-50 dark:bg-slate-900/60 rounded-2xl border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row items-start gap-4">
                  {companyLogo ? (
                    <img
                      src={companyLogo}
                      alt="Logo Transcunha"
                      className="h-16 max-w-[140px] object-contain rounded shrink-0 bg-white p-1 border border-slate-200"
                    />
                  ) : (
                    <div className="h-16 w-32 bg-blue-600 rounded-lg flex items-center justify-center font-black text-white text-sm shrink-0">
                      TRANSCUNHA
                    </div>
                  )}

                  <div className="border-l-4 border-blue-600 pl-4 space-y-1">
                    <div className="text-base font-black text-slate-900 dark:text-white">
                      {selectedSignatureAccount.displayName}
                    </div>
                    <div className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider">
                      {selectedSignatureAccount.department} — Transcunha Logística
                    </div>
                    <div className="text-xs text-slate-600 dark:text-slate-300 pt-1 space-y-0.5">
                      <p><strong>E-mail:</strong> <a href={`mailto:${selectedSignatureAccount.email}`} className="text-blue-600 hover:underline">{selectedSignatureAccount.email}</a></p>
                      <p><strong>Telefone / WhatsApp:</strong> {signatureExtraWhatsapp} | {signatureExtraPhone}</p>
                      <p><strong>Website:</strong> <a href="https://transcunhaoficial.com.br" target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">www.transcunhaoficial.com.br</a></p>
                    </div>
                    <p className="text-[11px] text-slate-400 italic pt-1">
                      Transcunha Logística & Transportes — Excelência, Segurança e Eficiência no Transporte Rodoviário.
                    </p>
                  </div>
                </div>
              </div>

              {/* Botões de Cópia */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  onClick={() => {
                    const html = corporateEmailService.generateSignatureHtml(selectedSignatureAccount, companyLogo, signatureExtraWhatsapp);
                    handleCopyText(html, 'signature_html');
                  }}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2"
                >
                  <FileText className="w-4 h-4" />
                  <span>{copiedKey === 'signature_html' ? 'HTML Copiado!' : 'Copiar Código HTML'}</span>
                </button>

                <button
                  onClick={() => {
                    const text = `${selectedSignatureAccount.displayName}\n${selectedSignatureAccount.department} — Transcunha Logística\nE-mail: ${selectedSignatureAccount.email}\nWhatsApp: ${signatureExtraWhatsapp} | Fixo: ${signatureExtraPhone}\nWebsite: www.transcunhaoficial.com.br`;
                    handleCopyText(text, 'signature_text');
                  }}
                  className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-600/30 transition-all cursor-pointer flex items-center gap-2"
                >
                  <Copy className="w-4 h-4" />
                  <span>{copiedKey === 'signature_text' ? 'Texto Copiado!' : 'Copiar Assinatura Formatada'}</span>
                </button>
              </div>

            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* ABA 4: TESTAR ENVIO INSTITUCIONAL                        */}
        {/* ========================================================= */}
        {activeTab === 'compose' && (
          <div className="space-y-6 animate-fade-in">
            <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">

              <div className="pb-3 border-b border-slate-100 dark:border-slate-700">
                <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                  <Send className="w-5 h-5 text-blue-600" />
                  Disparo de Teste / Simulação de E-mail Corporativo
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Teste o fluxo de saída utilizando a conta institucional de remetente configurada.
                </p>
              </div>

              <form onSubmit={handleSendTestEmail} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                      Remetente (Conta Corporativa) *
                    </label>
                    <select
                      value={composeFrom}
                      onChange={(e) => setComposeFrom(e.target.value)}
                      className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                    >
                      {accounts.map(acc => (
                        <option key={acc.id} value={acc.email}>
                          {acc.email} — {acc.displayName}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                      Destinatário (Para) *
                    </label>
                    <input
                      type="email"
                      name="composeTo"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      data-no-uppercase="true"
                      value={composeTo}
                      onChange={(e) => setComposeTo(e.target.value)}
                      placeholder="destinatario@cliente.com.br ou seu.email@pessoal.com"
                      className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40 normal-case"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Assunto do E-mail *
                  </label>
                  <input
                    type="text"
                    value={composeSubject}
                    onChange={(e) => setComposeSubject(e.target.value)}
                    placeholder="[Transcunha Logística] Notificação Oficial / Teste de Conectividade"
                    className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                    required
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Corpo da Mensagem
                  </label>
                  <textarea
                    rows={5}
                    value={composeBody}
                    onChange={(e) => setComposeBody(e.target.value)}
                    placeholder="Olá! Esta é uma mensagem de teste enviada a partir do painel de E-mail Corporativo da Transcunha Logística..."
                    className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40 resize-none"
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="submit"
                    disabled={isSendingTest}
                    className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs sm:text-sm font-bold shadow-lg shadow-blue-600/30 transition-all cursor-pointer flex items-center gap-2 disabled:opacity-50"
                  >
                    {isSendingTest ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Enviando...</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        <span>Disparar E-mail de Teste</span>
                      </>
                    )}
                  </button>
                </div>
              </form>

            </div>
          </div>
        )}

      </main>

      {/* ========================================================= */}
      {/* MODAL: CRIAR OU EDITAR CONTA DE E-MAIL                    */}
      {/* ========================================================= */}
      {isAccountModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-slate-800 w-full max-w-2xl rounded-3xl border border-slate-200 dark:border-slate-700 shadow-2xl overflow-hidden animate-scale-up">

            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/40">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-blue-600 text-white rounded-xl shadow-md shadow-blue-600/30">
                  <Mail className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-sm sm:text-base text-slate-900 dark:text-white">
                    {editingAccount ? 'Editar Conta de E-mail Corporativo' : 'Nova Conta de E-mail Corporativo'}
                  </h3>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    Domínio: @{serverConfig.domain}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setIsAccountModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSaveAccount} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">

              {/* 1. Vínculo com Usuário Existente (Opcional) */}
              <div className="p-3 bg-blue-50/60 dark:bg-blue-950/30 rounded-2xl border border-blue-100 dark:border-blue-900/50 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-blue-900 dark:text-blue-300 flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-blue-600" />
                    Vincular a um Colaborador Cadastrado (Opcional)
                  </label>
                  {formUserId && (
                    <button
                      type="button"
                      onClick={() => setFormUserId('')}
                      className="text-[11px] text-rose-600 hover:underline font-semibold cursor-pointer"
                    >
                      Remover vínculo
                    </button>
                  )}
                </div>
                <select
                  value={formUserId}
                  onChange={(e) => handleSelectUser(e.target.value)}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-blue-200 dark:border-blue-800 rounded-xl text-xs sm:text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                >
                  <option value="">Nenhum (Caixa Departamental / Compartilhada)</option>
                  {visibleUsersForEmail.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.name} — {u.profile} ({u.email})
                    </option>
                  ))}
                </select>
              </div>

              {/* 2. Endereço de E-mail */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Endereço de E-mail *
                  </label>
                  <div className="flex items-center">
                    <input
                      type="text"
                      placeholder="nome.sobrenome ou setor"
                      value={formEmailPrefix}
                      onChange={(e) => setFormEmailPrefix(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ''))}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-l-xl text-xs sm:text-sm text-slate-800 dark:text-slate-100 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                      required
                    />
                    <span className="px-3 py-2 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-mono text-xs font-bold rounded-r-xl border border-l-0 border-slate-200 dark:border-slate-700 shrink-0">
                      @{serverConfig.domain}
                    </span>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Nome de Exibição / Titular *
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: João Silva ou Central Financeira"
                    value={formDisplayName}
                    onChange={(e) => setFormDisplayName(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                    required
                  />
                </div>
              </div>

              {/* 3. Departamento & Status */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Departamento / Setor *
                  </label>
                  <select
                    value={formDepartment}
                    onChange={(e) => setFormDepartment(e.target.value as CorporateEmailDepartment)}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                  >
                    <option value="Diretoria">Diretoria</option>
                    <option value="Operacional">Operacional</option>
                    <option value="Financeiro">Financeiro</option>
                    <option value="Comercial">Comercial</option>
                    <option value="RH / Administrativo">RH / Administrativo</option>
                    <option value="TI / Suporte">TI / Suporte</option>
                    <option value="Geral">Geral</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Status da Conta
                  </label>
                  <select
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value as CorporateEmailStatus)}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                  >
                    <option value="Ativo">Ativo</option>
                    <option value="Inativo">Inativo</option>
                    <option value="Bloqueado">Bloqueado</option>
                    <option value="Em Configuração">Em Configuração</option>
                  </select>
                </div>
              </div>

              {/* 4. Senha da Caixa Postal */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Senha da Caixa Postal *
                  </label>
                  <button
                    type="button"
                    onClick={() => setFormPassword(corporateEmailService.generateSecurePassword(12))}
                    className="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <Key className="w-3 h-3" />
                    <span>Gerar Senha Forte</span>
                  </button>
                </div>
                <input
                  type="text"
                  value={formPassword}
                  onChange={(e) => setFormPassword(e.target.value)}
                  placeholder="Defina uma senha segura"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-mono text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                  required
                />
              </div>

              {/* 5. Cota de Armazenamento */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Cota de Armazenamento (GB)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={formQuotaGb}
                      onChange={(e) => setFormQuotaGb(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                    />
                    <span className="text-xs font-bold text-slate-500 shrink-0">GB</span>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Encaminhar Para (Opcional)
                  </label>
                  <input
                    type="email"
                    placeholder="outro.email@transcunhaoficial.com.br"
                    value={formForwardTo}
                    onChange={(e) => setFormForwardTo(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                  />
                </div>
              </div>

              {/* 6. Aliases */}
              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Aliases / Apelidos Adicionais (separados por vírgula)
                </label>
                <input
                  type="text"
                  placeholder="ex: vendas@transcunhaoficial.com.br, orcamento@transcunhaoficial.com.br"
                  value={formAliases}
                  onChange={(e) => setFormAliases(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                />
              </div>

              {/* 7. Observações */}
              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Observações Internas (Opcional)
                </label>
                <input
                  type="text"
                  placeholder="Informações para a equipe de TI ou administrativo"
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                />
              </div>

              {/* Modal Footer */}
              <div className="pt-4 border-t border-slate-200 dark:border-slate-700 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsAccountModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-bold shadow-lg shadow-blue-600/30 transition-all cursor-pointer"
                >
                  {editingAccount ? 'Salvar Alterações' : 'Criar Conta de E-mail'}
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

    </div>
  );
};

export default CorporateEmailPage;
