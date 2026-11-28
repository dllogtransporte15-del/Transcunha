
import React, { useState, useEffect } from 'react';
import type { User, Client, Branch } from '../types';
import { UserProfile } from '../types';
import { isDeveloperUser, isDemoUser, filterVisibleUsers, filterVisibleProfiles, INTERNAL_JOB_FUNCTIONS, getDefaultJobFunctionByName } from '../auth';
import { useToast } from '../hooks/useToast';
import { autoFormatInput, formatCPF } from '../utils/formatters';
import { X, Copy, Check, CheckCircle2, Mail, Key, Building2 } from 'lucide-react';
import { corporateEmailService } from '../services/corporateEmailService';

interface UserFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (user: User | Omit<User, 'id'>) => void;
  userToEdit: User | null;
  clients: Client[];
  branches: Branch[];
  users?: User[];
  defaultProfile?: UserProfile;
  availableProfiles?: UserProfile[];
  currentUser?: User | null;
}

const UserFormModal: React.FC<UserFormModalProps> = ({ 
  isOpen, 
  onClose, 
  onSave, 
  userToEdit, 
  clients, 
  branches, 
  users, 
  defaultProfile,
  availableProfiles,
  currentUser
}) => {
  const { showToast } = useToast();
  const [selectedUserToMirror, setSelectedUserToMirror] = useState<string>('');
  const getInitialState = (): Omit<User, 'id'> => ({
    name: '',
    email: '',
    phone: '',
    profile: defaultProfile || UserProfile.Comercial,
    active: true,
    password: '',
    clientId: undefined,
    branchId: undefined,
    hasCommercialCommission: defaultProfile === UserProfile.GerenteComercial || defaultProfile === UserProfile.Comercial,
    availableForDriverRequests: true,
    agencyRole: 'lider',
    agencyCommissionPercentage: 30,
    operatorCommissionPercentage: undefined,
    agencyLeaderId: undefined,
    corporateEmail: '',
    corporateEmailPassword: '',
    corporateEmailQuotaMb: 5120,
    corporateEmailStatus: 'Ativo',
    jobFunction: '',
  });

  const [user, setUser] = useState<Omit<User, 'id' | 'password'> & { password?: string; customPermissions?: any }>(getInitialState());

  const isMotorista = user.profile === UserProfile.Motorista || defaultProfile === UserProfile.Motorista;
  const isExternalClient = user.profile === UserProfile.Cliente || defaultProfile === UserProfile.Cliente;
  const isEmbarcador = user.profile === UserProfile.Embarcador || defaultProfile === UserProfile.Embarcador;
  const showCorporateFeatures = !isMotorista && !isExternalClient;

  const [copiedInModal, setCopiedInModal] = useState(false);

  const handleCopyAccessInModal = async () => {
    if (!userToEdit) return;
    const loginUser = user.email || userToEdit.email || userToEdit.username || userToEdit.id;
    const loginPassword = user.password || userToEdit.password || 'transcunha2026';
    const name = (user.name || userToEdit.name || 'Colaborador').trim();

    const message = `Olá, *${name}*! 👋

Seguem seus dados de acesso ao sistema *Transcunha*:

🔗 *Link de Acesso:* https://transcunha.digital
👤 *Usuário:* ${loginUser}
🔑 *Senha:* ${loginPassword}

_Recomendamos alterar sua senha no primeiro acesso._
Qualquer dúvida, estamos à disposição! 🚛💨`;

    let success = false;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(message);
        success = true;
      }
    } catch {}

    if (!success) {
      try {
        const textArea = document.createElement('textarea');
        textArea.value = message;
        textArea.style.position = 'fixed';
        textArea.style.top = '0';
        textArea.style.left = '-9999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        success = document.execCommand('copy');
        document.body.removeChild(textArea);
      } catch {}
    }

    if (success) {
      setCopiedInModal(true);
      showToast('Dados de acesso copiados para a área de transferência!', 'success');
      setTimeout(() => setCopiedInModal(false), 2500);
    }
  };

  useEffect(() => {
    if (isOpen) {
        setSelectedUserToMirror('');
        if(userToEdit) {
            const { password, ...userWithoutPass } = userToEdit;
            const existingCorpAccount = corporateEmailService.getEmailAccounts().find(a => a.userId === userToEdit.id || (userToEdit.email && a.email.toLowerCase() === userToEdit.email.toLowerCase()));
            setUser({ 
              ...userWithoutPass, 
              branchId: userToEdit.branchId || (userToEdit as any).filialId || undefined,
              availableForDriverRequests: userToEdit.availableForDriverRequests !== false,
              operatorCommissionPercentage: userToEdit.operatorCommissionPercentage !== undefined 
                ? userToEdit.operatorCommissionPercentage 
                : (userToEdit.agencyRole === 'embarque' && userToEdit.agencyCommissionPercentage !== undefined && userToEdit.agencyCommissionPercentage < 30 ? userToEdit.agencyCommissionPercentage : undefined),
              corporateEmail: userToEdit.corporateEmail || existingCorpAccount?.email || '',
              corporateEmailPassword: userToEdit.corporateEmailPassword || existingCorpAccount?.password || '',
              corporateEmailQuotaMb: userToEdit.corporateEmailQuotaMb || (existingCorpAccount ? existingCorpAccount.quotaMb : 5120),
              corporateEmailStatus: userToEdit.corporateEmailStatus || existingCorpAccount?.status || 'Ativo',
              jobFunction: userToEdit.jobFunction || getDefaultJobFunctionByName(userToEdit.name) || '',
              password: '' 
            }); // Don't load existing password
        } else {
            setUser(getInitialState());
        }
    }
  }, [userToEdit, isOpen, defaultProfile]);

  const visibleUsersForModal = filterVisibleUsers(users || [], currentUser);
  const selectableProfiles = filterVisibleProfiles(availableProfiles || Object.values(UserProfile), currentUser);

  const handleMirrorUser = (sourceUserId: string) => {
    setSelectedUserToMirror(sourceUserId);
    if (!sourceUserId) return;
    const sourceUser = visibleUsersForModal.find(u => u.id === sourceUserId);
    if (!sourceUser) return;
    if (!isDeveloperUser(currentUser) && sourceUser.profile === UserProfile.Desenvolvedor) return;

    setUser(prev => ({
      ...prev,
      profile: sourceUser.profile,
      clientId: sourceUser.clientId,
      branchId: sourceUser.branchId || (sourceUser as any).filialId || undefined,
      hasCommercialCommission: sourceUser.hasCommercialCommission,
      availableForDriverRequests: sourceUser.availableForDriverRequests !== false,
      agencyRole: sourceUser.agencyRole,
      agencyCommissionPercentage: sourceUser.agencyCommissionPercentage,
      operatorCommissionPercentage: sourceUser.operatorCommissionPercentage,
      agencyLeaderId: sourceUser.agencyLeaderId,
      customPermissions: sourceUser.customPermissions ? JSON.parse(JSON.stringify(sourceUser.customPermissions)) : undefined,
    }));

    showToast(`Acessos e perfil de "${sourceUser.name}" (${sourceUser.profile}) espelhados com sucesso!`, 'success');
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    let formattedValue = autoFormatInput(name, value);

    // Se estiver digitando no campo de login e for dígitos de CPF (ou motorista), formata como CPF
    if (name === 'email') {
      const cleanDigits = value.replace(/\D/g, '');
      if ((isMotorista || cleanDigits.length >= 3) && cleanDigits.length <= 11 && !value.includes('@') && !value.includes('.')) {
        if (/^\d+$/.test(value.replace(/\D/g, ''))) {
          formattedValue = formatCPF(value);
        }
      }
    }

    let updatedValue: any = formattedValue;
    if (type === 'checkbox') {
        updatedValue = (e.target as HTMLInputElement).checked;
    }
    
    setUser(prev => {
      const newState = { ...prev, [name]: updatedValue };
      if (name === 'profile' && value !== UserProfile.Cliente) {
        delete newState.clientId;
      }
      if (name === 'profile' && (value === UserProfile.GerenteComercial)) {
        newState.hasCommercialCommission = true;
      }
      return newState;
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!isDeveloperUser(currentUser) && user.profile === UserProfile.Desenvolvedor) {
      showToast('Perfil inválido para o operador atual.', 'error');
      return;
    }
    
    if (user.profile === UserProfile.Cliente && !user.clientId) {
      showToast('Por favor, selecione um cliente para associar a este usuário.', 'warning');
      return;
    }

    if (user.profile === UserProfile.Agenciador && user.agencyRole === 'embarque' && !user.agencyLeaderId) {
      showToast('Por favor, selecione o Agenciador Líder responsável para vincular este Agenciador de Embarque.', 'warning');
      return;
    }

    const cleanBranchId = user.branchId && user.branchId.trim() !== '' ? user.branchId.trim() : undefined;
    const userToSave: any = { 
      ...user,
      branchId: cleanBranchId,
      filialId: cleanBranchId,
    };

    if (userToEdit) {
      userToSave.id = userToEdit.id;
      // If password field is empty on edit, don't change it
      if (!user.password) {
        delete userToSave.password;
      }
    } else {
      // Password is required for new users
      if (!user.password) {
        showToast('O campo de senha é obrigatório para novos usuários.', 'warning');
        return;
      }
    }

    if (showCorporateFeatures && !isEmbarcador && user.corporateEmail && user.corporateEmail.trim()) {
      corporateEmailService.saveEmailAccount({
        email: user.corporateEmail.trim(),
        displayName: user.name,
        userId: userToEdit?.id,
        userName: user.name,
        department: corporateEmailService.mapProfileToDepartment(user.profile),
        password: user.corporateEmailPassword || undefined,
        status: user.corporateEmailStatus || 'Ativo',
        quotaMb: user.corporateEmailQuotaMb || 5120,
      });
    }

    onSave(userToSave);
  };

  if (!isOpen) return null;

  const agencyLeaders = visibleUsersForModal.filter(u => 
    u.profile === UserProfile.Agenciador && 
    (u.agencyRole === 'lider' || !u.agencyRole) && 
    u.id !== userToEdit?.id
  );

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex justify-center items-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden border border-gray-100 dark:border-gray-700 my-auto">
        <div className="p-5 sm:p-6 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50/50 dark:bg-gray-800/50 flex-shrink-0">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-800 dark:text-white flex items-center gap-3">
            {userToEdit ? 'Editar Usuário' : 'Novo Usuário'}
            {userToEdit && (
              <span className="text-xs sm:text-sm font-mono font-bold px-2.5 py-0.5 bg-blue-50 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300 rounded-md border border-blue-200 dark:border-blue-800">
                ID: {userToEdit.id}
              </span>
            )}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="p-5 sm:p-6 overflow-y-auto space-y-4 flex-1">
            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-1">
                Nome Completo
              </label>
              <input 
                name="name" 
                value={user.name} 
                onChange={handleChange} 
                placeholder="Nome Completo do Usuário" 
                className="p-2 w-full border rounded dark:bg-gray-700 dark:border-gray-600 text-sm" 
                required 
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-1">
                {isMotorista ? 'CPF / Usuário de Acesso' : 'Usuário / E-mail de Acesso'}
              </label>
              <input 
                name="email" 
                value={user.email} 
                onChange={handleChange} 
                type="text" 
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                data-no-uppercase="true"
                placeholder={isMotorista ? "000.000.000-00 (CPF do Motorista)" : "Usuário, CPF ou E-mail de Acesso"} 
                className="p-2 w-full border rounded dark:bg-gray-700 dark:border-gray-600 text-sm font-mono normal-case" 
                required 
              />
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
                {isMotorista 
                  ? 'Login do motorista no aplicativo (utilize o CPF ou identificador sem necessidade de "@").' 
                  : 'Identificador para login (pode ser nome de usuário, CPF ou e-mail, sem obrigatoriedade de "@").'}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-1">
                  Telefone / WhatsApp
                </label>
                <input 
                  name="phone" 
                  value={user.phone || ''} 
                  onChange={handleChange} 
                  placeholder="(00) 00000-0000" 
                  className="p-2 w-full border rounded dark:bg-gray-700 dark:border-gray-600 text-sm" 
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
                    Senha de Acesso
                  </label>
                  {userToEdit && !isDemoUser(currentUser) && (
                    <button
                      type="button"
                      onClick={handleCopyAccessInModal}
                      className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 flex items-center gap-1 cursor-pointer transition-colors"
                      title="Copiar mensagem com link (transcunha.digital), usuário e senha para WhatsApp"
                    >
                      {copiedInModal ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-600" />
                          <span>Copiado!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3 text-emerald-600" />
                          <span>Copiar Acesso WhatsApp</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
                <input 
                  name="password" 
                  value={user.password} 
                  onChange={handleChange} 
                  type="password" 
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  data-no-uppercase="true"
                  placeholder={userToEdit ? 'Nova Senha (em branco para manter)' : 'Senha de Acesso'} 
                  className="p-2 w-full border rounded dark:bg-gray-700 dark:border-gray-600 text-sm normal-case" 
                />
              </div>
            </div>

            {/* Campo & Configuração: E-mail Corporativo (@transcunhaoficial.com.br) - Apenas para Usuários Internos (exceto Embarcadores) */}
            {showCorporateFeatures && !isEmbarcador && (
              <div className="p-4 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 uppercase tracking-wider">
                    <Mail className="w-4 h-4 text-blue-600" />
                    E-mail Corporativo (@transcunhaoficial.com.br)
                  </label>
                  <span className="text-[10px] text-slate-500 font-medium">Administração Integrada</span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Configure a caixa postal institucional deste colaborador para envio de ordens, cotações e acesso ao Webmail.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                      Endereço de E-mail Corporativo
                    </label>
                    <input
                      name="corporateEmail"
                      value={user.corporateEmail || ''}
                      onChange={handleChange}
                      type="email"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      data-no-uppercase="true"
                      placeholder="colaborador@transcunhaoficial.com.br"
                      className="p-2 w-full text-xs font-mono border rounded dark:bg-gray-700 dark:border-gray-600 normal-case"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400">
                        Senha da Caixa Postal
                      </label>
                      <button
                        type="button"
                        onClick={() => setUser(prev => ({ ...prev, corporateEmailPassword: corporateEmailService.generateSecurePassword(12) }))}
                        className="text-[10px] text-blue-600 dark:text-blue-400 font-bold hover:underline flex items-center gap-0.5 cursor-pointer"
                      >
                        <Key className="w-3 h-3" />
                        Gerar Senha
                      </button>
                    </div>
                    <input
                      name="corporateEmailPassword"
                      value={user.corporateEmailPassword || ''}
                      onChange={handleChange}
                      type="text"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      data-no-uppercase="true"
                      placeholder="Senha de acesso ao Webmail"
                      className="p-2 w-full text-xs font-mono border rounded dark:bg-gray-700 dark:border-gray-600 normal-case"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                      Status da Caixa
                    </label>
                    <select
                      name="corporateEmailStatus"
                      value={user.corporateEmailStatus || 'Ativo'}
                      onChange={handleChange}
                      className="p-2 w-full text-xs border rounded dark:bg-gray-700 dark:border-gray-600"
                    >
                      <option value="Ativo">Ativo</option>
                      <option value="Inativo">Inativo</option>
                      <option value="Bloqueado">Bloqueado</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                      Cota de Armazenamento
                    </label>
                    <select
                      name="corporateEmailQuotaMb"
                      value={String(user.corporateEmailQuotaMb || 5120)}
                      onChange={(e) => setUser(prev => ({ ...prev, corporateEmailQuotaMb: parseInt(e.target.value, 10) }))}
                      className="p-2 w-full text-xs border rounded dark:bg-gray-700 dark:border-gray-600"
                    >
                      <option value="2048">2 GB</option>
                      <option value="5120">5 GB (Padrão)</option>
                      <option value="10240">10 GB</option>
                      <option value="20480">20 GB</option>
                    </select>
                  </div>
                </div>
              </div>
            )}
          
            {/* Campo: Espelhar Acesso de Outro Usuário - Apenas para Usuários Internos */}
            {showCorporateFeatures && (
              <div className="p-3.5 bg-gradient-to-r from-blue-50/90 to-indigo-50/90 dark:from-blue-950/40 dark:to-indigo-950/40 rounded-xl border border-blue-200/90 dark:border-blue-800/80 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-blue-900 dark:text-blue-200 flex items-center gap-1.5">
                    <Copy className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                    Espelhar Acesso de Outro Usuário
                  </label>
                  <span className="text-[10px] text-blue-700/80 dark:text-blue-300 font-medium">Opcional</span>
                </div>
                <p className="text-[11px] text-blue-800/80 dark:text-blue-300/80">
                  Selecione um usuário para clonar automaticamente seu perfil, permissões personalizadas, filial e vínculos.
                </p>
                <select
                  value={selectedUserToMirror}
                  onChange={(e) => handleMirrorUser(e.target.value)}
                  className="p-2 w-full text-xs font-medium border border-blue-300 dark:border-blue-700 rounded-lg bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all cursor-pointer shadow-xs"
                >
                  <option value="">Selecione um usuário para espelhar acessos...</option>
                  {visibleUsersForModal
                    .filter(u => u.id !== userToEdit?.id)
                    .map(u => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({u.profile}) {u.branchId ? `• Filial: ${u.branchId}` : ''} {u.customPermissions ? '• (Permissões Personalizadas)' : ''}
                      </option>
                    ))
                  }
                </select>
                {selectedUserToMirror && (
                  <div className="flex items-center gap-1.5 text-[11px] text-emerald-700 dark:text-emerald-400 font-medium pt-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Acessos espelhados de: <strong>{visibleUsersForModal.find(u => u.id === selectedUserToMirror)?.name}</strong></span>
                  </div>
                )}
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-1">Perfil de Acesso</label>
              <select name="profile" value={user.profile} onChange={handleChange} className="p-2 w-full border rounded dark:bg-gray-700 dark:border-gray-600 text-sm">
                {selectableProfiles.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>

            {showCorporateFeatures && (
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-1">
                  Função (Exibida na Assinatura Corporativa)
                </label>
                <select
                  name="jobFunction"
                  value={user.jobFunction || getDefaultJobFunctionByName(user.name) || ''}
                  onChange={handleChange}
                  className="p-2 w-full border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none cursor-pointer"
                >
                  <option value="">Selecione a função do colaborador...</option>
                  {INTERNAL_JOB_FUNCTIONS.map(fn => (
                    <option key={fn} value={fn}>{fn}</option>
                  ))}
                </select>
              </div>
            )}

          {user.profile === UserProfile.Cliente && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Associar ao Cliente</label>
              <select name="clientId" value={user.clientId || ''} onChange={handleChange} className="mt-1 p-2 w-full border rounded dark:bg-gray-700 dark:border-gray-600" required>
                <option value="" disabled>Selecione um cliente...</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.nomeFantasia}</option>)}
              </select>
            </div>
          )}

          {showCorporateFeatures && (
            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-1 flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-primary" />
                Filial
              </label>
              <select 
                name="branchId" 
                value={user.branchId || ''} 
                onChange={handleChange} 
                className="p-2 w-full border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none cursor-pointer"
              >
                <option value="">Todas as Filiais / Sem Filial (Acesso Geral)</option>
                {branches && branches.length > 0 ? (
                  branches.map(b => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({b.city} - {b.state})
                    </option>
                  ))
                ) : (
                  <option value="" disabled>Nenhuma filial cadastrada no sistema</option>
                )}
              </select>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
                {user.branchId 
                  ? `Usuário vinculado à filial ${branches?.find(b => b.id === user.branchId)?.name || user.branchId}.` 
                  : 'Usuários sem filial vinculada possuem acesso geral (visão de todas as unidades).'}
              </p>
            </div>
          )}

          {/* INFORMATIVO E CONFIGURAÇÃO: PERFIL AGENCIADOR (LÍDER vs EMBARQUE) */}
          {user.profile === UserProfile.Agenciador && (
            <div className="p-4 bg-purple-50/80 dark:bg-purple-950/40 rounded-xl border border-purple-200/90 dark:border-purple-800/90 space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-xs font-bold text-purple-900 dark:text-purple-200 uppercase tracking-wider">
                  Configuração de Agenciamento
                </span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-purple-100 dark:bg-purple-900/70 text-purple-800 dark:text-purple-300">
                  {user.agencyRole === 'embarque' ? 'Agenciador Embarque' : `Agenciador Líder (${user.agencyCommissionPercentage ?? 30}%)`}
                </span>
              </div>

              {/* SELEÇÃO DA CATEGORIA DE AGENCIADOR */}
              <div>
                <label className="block text-xs font-bold text-purple-900 dark:text-purple-200 mb-1.5">
                  Categoria de Agenciador:
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <label className={`flex items-start gap-2.5 p-2.5 rounded-lg border text-xs cursor-pointer transition-all ${
                    (user.agencyRole || 'lider') === 'lider'
                      ? 'bg-purple-100/90 border-purple-400 text-purple-900 dark:bg-purple-900/60 dark:border-purple-600 dark:text-purple-100 font-bold shadow-xs'
                      : 'bg-white border-purple-200 text-gray-700 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300 hover:bg-purple-50/50'
                  }`}>
                    <input
                      type="radio"
                      name="agencyRole"
                      value="lider"
                      checked={(user.agencyRole || 'lider') === 'lider'}
                      onChange={() => setUser(prev => ({ 
                        ...prev, 
                        agencyRole: 'lider', 
                        agencyLeaderId: undefined 
                      }))}
                      className="mt-0.5 text-purple-600 focus:ring-purple-500 cursor-pointer"
                    />
                    <div>
                      <span className="font-bold block">Agenciador Líder</span>
                      <span className="text-[10px] font-normal text-purple-800/80 dark:text-purple-300 block">
                        Responsável pela Agência. Centraliza o faturamento e comissões da equipe.
                      </span>
                    </div>
                  </label>

                  <label className={`flex items-start gap-2.5 p-2.5 rounded-lg border text-xs cursor-pointer transition-all ${
                    user.agencyRole === 'embarque'
                      ? 'bg-purple-100/90 border-purple-400 text-purple-900 dark:bg-purple-900/60 dark:border-purple-600 dark:text-purple-100 font-bold shadow-xs'
                      : 'bg-white border-purple-200 text-gray-700 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300 hover:bg-purple-50/50'
                  }`}>
                    <input
                      type="radio"
                      name="agencyRole"
                      value="embarque"
                      checked={user.agencyRole === 'embarque'}
                      onChange={() => setUser(prev => ({ 
                        ...prev, 
                        agencyRole: 'embarque',
                        agencyLeaderId: prev.agencyLeaderId || (agencyLeaders[0]?.id || '')
                      }))}
                      className="mt-0.5 text-purple-600 focus:ring-purple-500 cursor-pointer"
                    />
                    <div>
                      <span className="font-bold block">Agenciador Embarque</span>
                      <span className="text-[10px] font-normal text-purple-800/80 dark:text-purple-300 block">
                        Operador de embarques. Vincula-se a um Líder e consolida na agência dele.
                      </span>
                    </div>
                  </label>
                </div>
              </div>

              {/* SE FOR LÍDER: CONFIGURAR PORCENTAGEM DE COMISSÃO */}
              {(user.agencyRole || 'lider') === 'lider' && (
                <div className="pt-2 border-t border-purple-200/70 dark:border-purple-800/70 space-y-2">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <label className="text-xs font-bold text-purple-900 dark:text-purple-200">
                      Porcentagem de Comissão da Agência (%):
                    </label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        max="100"
                        name="agencyCommissionPercentage"
                        value={user.agencyCommissionPercentage ?? 30}
                        onChange={(e) => setUser(prev => ({ 
                          ...prev, 
                          agencyCommissionPercentage: parseFloat(e.target.value) || 0 
                        }))}
                        placeholder="30"
                        className="p-1.5 text-xs w-20 border rounded dark:bg-gray-700 dark:border-gray-600 font-mono font-bold text-center"
                      />
                      <span className="text-xs text-purple-700 dark:text-purple-300 font-bold">%</span>
                    </div>
                  </div>
                  <p className="text-[11px] text-purple-800 dark:text-purple-300">
                    A comissão de <strong>{user.agencyCommissionPercentage ?? 30}% sobre o Lucro Real Líquido</strong> será calculada sobre todos os embarques solicitados por este Líder e por todos os Agenciadores de Embarque vinculados à sua equipe.
                  </p>
                </div>
              )}

              {/* SE FOR EMBARQUE: SELEÇÃO OBRIGATÓRIA DO LÍDER */}
              {user.agencyRole === 'embarque' && (
                <div className="pt-2 border-t border-purple-200/70 dark:border-purple-800/70 space-y-2">
                  <div>
                    <label className="block text-xs font-bold text-purple-900 dark:text-purple-200 mb-1">
                      Agenciador Líder Responsável <span className="text-rose-500">*</span>:
                    </label>
                    {agencyLeaders.length === 0 ? (
                      <div className="p-2.5 bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-700 rounded-lg text-xs text-amber-800 dark:text-amber-200">
                        Nenhum Agenciador Líder cadastrado no sistema. Cadastre primeiro um Agenciador Líder para poder vincular agenciadores de embarque.
                      </div>
                    ) : (
                      <select
                        name="agencyLeaderId"
                        value={user.agencyLeaderId || ''}
                        onChange={handleChange}
                        className="p-2 w-full text-xs border rounded-lg dark:bg-gray-700 dark:border-gray-600 font-medium"
                        required
                      >
                        <option value="">Selecione o Agenciador Líder...</option>
                        {agencyLeaders.map(leader => {
                          const branch = branches.find(b => b.id === leader.branchId);
                          return (
                            <option key={leader.id} value={leader.id}>
                              {leader.name} {branch ? `(${branch.name} - ${branch.city}/${branch.state})` : '(Sem Filial)'} - Comissão da Agência: {leader.agencyCommissionPercentage ?? 30}%
                            </option>
                          );
                        })}
                      </select>
                    )}
                  </div>

                  {/* CAMPO DE COMISSÃO DO AGECIADOR DE EMBARQUE */}
                  <div className="p-3 bg-purple-50/70 dark:bg-purple-950/40 rounded-xl border border-purple-200/80 dark:border-purple-800/80 space-y-2">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <label className="text-xs font-bold text-purple-900 dark:text-purple-200">
                        Porcentagem de Comissão do Operador (%):
                      </label>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          max="100"
                          name="operatorCommissionPercentage"
                          value={user.operatorCommissionPercentage ?? (user.agencyCommissionPercentage !== undefined && user.agencyCommissionPercentage < 30 ? user.agencyCommissionPercentage : '')}
                          onChange={(e) => {
                            const val = e.target.value === '' ? undefined : (parseFloat(e.target.value) || 0);
                            setUser(prev => ({ 
                              ...prev, 
                              operatorCommissionPercentage: val,
                              agencyCommissionPercentage: val ?? 30
                            }));
                          }}
                          placeholder="Ex: 10"
                          className="p-1.5 text-xs w-20 border rounded dark:bg-gray-700 dark:border-gray-600 font-mono font-bold text-center"
                        />
                        <span className="text-xs text-purple-700 dark:text-purple-300 font-bold">%</span>
                      </div>
                    </div>
                    <p className="text-[11px] text-purple-800 dark:text-purple-300">
                      Defina a porcentagem de comissão deste operador (ex: 1% a 20%) calculada sobre o <strong>Lucro Real Líquido</strong> dos embarques operados por ele, repassada a partir da comissão da agência ({agencyLeaders.find(l => l.id === user.agencyLeaderId)?.agencyCommissionPercentage ?? 30}%).
                    </p>
                  </div>

                  <p className="text-[11px] text-purple-800 dark:text-purple-300">
                    Todo embarque solicitado por este agenciador será contabilizado automaticamente no faturamento, lucro líquido e comissão da agência do <strong>Agenciador Líder</strong> selecionado.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* COMISSÃO DO EMBARCADOR POR TONELADA */}
          {user.profile === UserProfile.Embarcador && (
            <div className="p-3 bg-amber-50/70 dark:bg-amber-950/40 rounded-xl border border-amber-200/80 dark:border-amber-800/80 space-y-2">
              <label className="block text-xs font-bold text-amber-900 dark:text-amber-200">
                Comissão do Embarcador (R$ / Tonelada):
              </label>
              <p className="text-[11px] text-amber-800 dark:text-amber-300">
                Defina o valor unitário por tonelada que será automaticamente lançado como custo e creditado ao embarcador nos embarques solicitados por este usuário.
              </p>
              <div className="flex items-center gap-2 pt-1">
                <span className="text-xs font-bold font-mono text-gray-500">R$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  name="shipperCommissionRatePerTon"
                  value={user.shipperCommissionRatePerTon ?? ''}
                  onChange={(e) => setUser(prev => ({ ...prev, shipperCommissionRatePerTon: parseFloat(e.target.value) || undefined }))}
                  placeholder="Ex: 2.00"
                  className="p-1.5 text-xs w-36 border rounded dark:bg-gray-700 dark:border-gray-600 font-mono font-bold"
                />
                <span className="text-xs text-gray-600 dark:text-gray-300 font-semibold">/ tonelada</span>
              </div>
            </div>
          )}

          {/* ATIVAR COMISSÃO COMERCIAL (GERENTE COMERCIAL / AGENCIADOR LÍDER) */}
          {(user.profile === UserProfile.Comercial || 
            user.profile === UserProfile.GerenteComercial || 
            (user.profile === UserProfile.Agenciador && (user.agencyRole || 'lider') === 'lider')) && (
            <div className="p-3 bg-blue-50/70 dark:bg-blue-950/40 rounded-xl border border-blue-200/80 dark:border-blue-800/80 space-y-2">
              <div className="flex items-center">
                <input 
                  type="checkbox" 
                  id="hasCommercialCommission" 
                  name="hasCommercialCommission" 
                  checked={user.hasCommercialCommission || false} 
                  onChange={handleChange} 
                  className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer"
                />
                <label htmlFor="hasCommercialCommission" className="ml-2 block text-sm font-bold text-gray-900 dark:text-gray-200 cursor-pointer">
                  {user.profile === UserProfile.Agenciador 
                    ? 'Ativar Comissão Comercial (Agenciador Líder)' 
                    : 'Ativar Comissão Comercial (Gerente Comercial)'}
                </label>
              </div>
              <p className="text-[11px] text-gray-600 dark:text-gray-400 pl-6">
                {user.profile === UserProfile.Agenciador 
                  ? 'Personalize a base de cálculo individual de comissão deste Agenciador Líder (Fixo R$, % Matriz e % Filiais):'
                  : 'Personalize a base de cálculo individual deste comercial (Fixo R$, % Matriz e % Filiais):'}
              </p>

              {user.hasCommercialCommission && (
                <div className="space-y-3 pt-2 border-t border-blue-200/60 dark:border-blue-800/60">
                  <div>
                    <label className="block text-[11px] font-bold text-gray-700 dark:text-gray-300 mb-1">
                      Tipo de Base de Cálculo do Faturamento:
                    </label>
                    <div className="flex items-center gap-4 text-xs font-bold">
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input 
                          type="radio" 
                          name="commercialCalculationMode" 
                          value="bruto" 
                          checked={(user.commercialCalculationMode || 'bruto') === 'bruto'} 
                          onChange={() => setUser(prev => ({ ...prev, commercialCalculationMode: 'bruto' }))} 
                          className="text-primary focus:ring-primary"
                        />
                        <span>Faturamento BRUTO</span>
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input 
                          type="radio" 
                          name="commercialCalculationMode" 
                          value="liquido" 
                          checked={user.commercialCalculationMode === 'liquido'} 
                          onChange={() => setUser(prev => ({ ...prev, commercialCalculationMode: 'liquido' }))} 
                          className="text-primary focus:ring-primary"
                        />
                        <span>Faturamento LÍQUIDO (Margem)</span>
                      </label>
                    </div>
                  </div>

                  {/* MODALIDADE AGÊNCIA (REPARTIDA) */}
                  <div className="p-2.5 bg-purple-50/60 dark:bg-purple-950/40 rounded-lg border border-purple-200/70 dark:border-purple-800/70 space-y-2">
                    <div className="flex items-center">
                      <input 
                        type="checkbox" 
                        id="commercialIsAgencyMode" 
                        name="commercialIsAgencyMode" 
                        checked={user.commercialIsAgencyMode || false} 
                        onChange={(e) => setUser(prev => ({ ...prev, commercialIsAgencyMode: e.target.checked }))} 
                        className="h-3.5 w-3.5 rounded border-purple-300 text-purple-600 focus:ring-purple-500 cursor-pointer"
                      />
                      <label htmlFor="commercialIsAgencyMode" className="ml-2 block text-xs font-bold text-purple-950 dark:text-purple-200 cursor-pointer">
                        Modalidade Agência (Repartir Comissão entre Membros)
                      </label>
                    </div>
                    <p className="text-[10px] text-purple-700 dark:text-purple-300 leading-tight">
                      Quando ativado, a comissão das filiais selecionadas é dividida igualmente entre os membros comerciais da mesma agência/filiais ou conforme a porcentagem configurada abaixo.
                    </p>

                    {user.commercialIsAgencyMode && (
                      <div className="pt-2 border-t border-purple-200/60 dark:border-purple-800/60">
                        <label className="block text-[10px] font-bold text-purple-900 dark:text-purple-200 mb-1">
                          Participação Individual na Agência (%):
                        </label>
                        <div className="flex items-center gap-2">
                          <input 
                            type="number" 
                            step="1" 
                            min="0" 
                            max="100" 
                            name="commercialAgencySharePercent" 
                            value={user.commercialAgencySharePercent ?? ''} 
                            onChange={(e) => setUser(prev => ({ ...prev, commercialAgencySharePercent: parseFloat(e.target.value) || undefined }))} 
                            placeholder="Automático (Divisão Igual)" 
                            className="p-1.5 text-xs w-48 border rounded dark:bg-gray-700 dark:border-gray-600 font-mono font-bold"
                          />
                          <span className="text-[10px] text-gray-500">(deixe vazio para divisão igual)</span>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-[11px] font-bold text-gray-700 dark:text-gray-300">Fixo (R$)</label>
                      <input 
                        type="number" 
                        step="100" 
                        name="commercialFixedSalary" 
                        value={user.commercialFixedSalary ?? 5000} 
                        onChange={(e) => setUser(prev => ({ ...prev, commercialFixedSalary: parseFloat(e.target.value) || 0 }))} 
                        className="mt-1 p-1.5 text-xs w-full border rounded dark:bg-gray-700 dark:border-gray-600 font-mono font-bold"
                        placeholder="5000"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-gray-700 dark:text-gray-300">% Matriz</label>
                      <input 
                        type="number" 
                        step="0.01" 
                        name="commercialMatrizRate" 
                        value={user.commercialMatrizRate ?? 0.20} 
                        onChange={(e) => setUser(prev => ({ ...prev, commercialMatrizRate: parseFloat(e.target.value) || 0 }))} 
                        className="mt-1 p-1.5 text-xs w-full border rounded dark:bg-gray-700 dark:border-gray-600 font-mono font-bold"
                        placeholder="0.20"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-gray-700 dark:text-gray-300">% Filiais</label>
                      <input 
                        type="number" 
                        step="0.01" 
                        name="commercialFiliaisRate" 
                        value={user.commercialFiliaisRate ?? 0.10} 
                        onChange={(e) => setUser(prev => ({ ...prev, commercialFiliaisRate: parseFloat(e.target.value) || 0 }))} 
                        className="mt-1 p-1.5 text-xs w-full border rounded dark:bg-gray-700 dark:border-gray-600 font-mono font-bold"
                        placeholder="0.10"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-gray-700 dark:text-gray-300 mb-1">
                      Filiais Selecionadas p/ Comissão (% Filiais):
                    </label>
                    <div className="grid grid-cols-2 gap-2 max-h-28 overflow-y-auto p-2 bg-white dark:bg-gray-700 rounded border border-gray-200 dark:border-gray-600 text-xs">
                      {branches.filter(b => !b.name.toLowerCase().includes('matriz')).map(b => {
                        const nonMatrizIds = branches.filter(br => !br.name.toLowerCase().includes('matriz')).map(br => br.id);
                        const selectedIds = user.commercialSelectedBranchIds || nonMatrizIds;
                        const isChecked = selectedIds.includes(b.id);

                        return (
                          <label key={b.id} className="flex items-center gap-2 cursor-pointer font-medium">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                const updated = checked 
                                  ? [...selectedIds, b.id]
                                  : selectedIds.filter(id => id !== b.id);
                                setUser(prev => ({ ...prev, commercialSelectedBranchIds: updated }));
                              }}
                              className="rounded border-gray-300 text-primary focus:ring-primary"
                            />
                            <span>{b.name} ({b.state})</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="space-y-3">
            <div className="flex items-center">
              <input type="checkbox" id="active" name="active" checked={user.active} onChange={handleChange} className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"/>
              <label htmlFor="active" className="ml-2 block text-sm text-gray-900 dark:text-gray-300">Usuário Ativo</label>
            </div>

            {user.profile !== UserProfile.Cliente && user.profile !== UserProfile.Motorista && (
              <div className="flex items-center p-2.5 rounded-lg bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50">
                <input 
                  type="checkbox" 
                  id="availableForDriverRequests" 
                  name="availableForDriverRequests" 
                  checked={user.availableForDriverRequests !== false} 
                  onChange={handleChange} 
                  className="h-4 w-4 rounded border-emerald-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                />
                <label htmlFor="availableForDriverRequests" className="ml-2.5 block text-xs font-semibold text-emerald-900 dark:text-emerald-300 cursor-pointer">
                  Disponível para receber direcionamento de solicitações de carga no App do Motorista
                </label>
              </div>
            )}
          </div>
        </div>

        <div className="p-4 sm:p-5 border-t border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50/50 dark:bg-gray-800/50 flex-shrink-0">
            <div>
              {userToEdit && (
                <button 
                  type="button" 
                  onClick={() => {
                    setUser(prev => ({ ...prev, password: 'transcunha2026', requirePasswordChange: true }));
                    showToast('Senha resetada para "transcunha2026". Atenção: A alteração só será gravada ao clicar em "SALVAR".', 'info', 6000);
                  }} 
                  className="py-2 px-3 sm:px-4 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors font-medium text-xs sm:text-sm flex items-center gap-1.5 shadow-sm"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M4 2a2 2 0 00-2 2v11a3 3 0 106 0V4a2 2 0 00-2-2H4zm1 14a1 1 0 100-2 1 1 0 000 2zm5-1.757l3.9-3.9a.75.75 0 111.06 1.06l-4.5 4.5a.75.75 0 01-1.06 0l-4.5-4.5a.75.75 0 111.06-1.06l3.9 3.9V3.75a.75.75 0 011.5 0v10.493z" clipRule="evenodd" />
                  </svg>
                  Resetar Senha
                </button>
              )}
            </div>
            <div className="flex space-x-3">
              <button type="button" onClick={onClose} className="py-2 px-4 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600 font-medium text-sm transition-colors">
                Cancelar
              </button>
              <button type="submit" className="py-2 px-5 bg-primary text-white rounded-lg hover:bg-primary-dark shadow-md font-medium text-sm transition-colors">
                Salvar
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default UserFormModal;