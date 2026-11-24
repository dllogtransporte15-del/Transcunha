import React, { useState, useMemo, useEffect } from 'react';
import { 
  Mail, 
  Send, 
  Check, 
  Copy, 
  Building2, 
  Calendar, 
  Paperclip, 
  ExternalLink, 
  CheckSquare, 
  Square, 
  User, 
  X, 
  AlertTriangle,
  ShieldCheck,
  Download,
  Info,
  CheckCircle2,
  FileText,
  Key,
  Eye,
  EyeOff,
  Loader2,
  Sparkles
} from 'lucide-react';
import type { FiscalDocument, Client, Branch } from '../../types';
import { useToast } from '../../hooks/useToast';
import {
  sendDossierEmailViaGoogleWorkspace,
  getSavedAppPassword,
  saveAppPassword,
  getSavedSenderEmail,
  saveSenderEmail,
  DEFAULT_GWORKSPACE_SENDER
} from '../../services/fiscalDossierEmailService';

interface FiscalHomologationModalProps {
  isOpen: boolean;
  onClose: () => void;
  documents: FiscalDocument[];
  clients?: Client[];
  branches?: Branch[];
  preselectedDocId?: string | null;
}

export const FiscalHomologationModal: React.FC<FiscalHomologationModalProps> = ({
  isOpen,
  onClose,
  documents,
  clients = [],
  branches = [],
  preselectedDocId = null,
}) => {
  const { showToast } = useToast();

  // Estados do formulário
  const [selectedClientId, setSelectedClientId] = useState<string>('custom');
  const [recipientEmail, setRecipientEmail] = useState<string>('');
  const [recipientName, setRecipientName] = useState<string>('');
  const [selectedBranchId, setSelectedBranchId] = useState<string>('all');
  const [emailSubject, setEmailSubject] = useState<string>(
    '[TRANSCUNHA] Apresentação Comercial de Parceria & Dossiê Cadastral - Transcunha Transportes e Logística'
  );
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [customObservations, setCustomObservations] = useState<string>('');
  const [copiedType, setCopiedType] = useState<'all' | 'links' | null>(null);
  const [showCopiedBanner, setShowCopiedBanner] = useState<boolean>(false);

  // Estados de Integração Google Workspace (Envio Direto com Anexos)
  const [appPassword, setAppPassword] = useState<string>(() => getSavedAppPassword());
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [senderEmail, setSenderEmail] = useState<string>(() => getSavedSenderEmail());
  const [isSendingDirect, setIsSendingDirect] = useState<boolean>(false);
  const [sendingStatus, setSendingStatus] = useState<string>('');
  const [sendSuccessInfo, setSendSuccessInfo] = useState<{ messageId?: string; count: number } | null>(null);

  // Inicializa documentos selecionados ao abrir o modal
  useEffect(() => {
    if (!isOpen) return;

    if (preselectedDocId) {
      // Se veio de um clique específico em um documento
      setSelectedDocIds([preselectedDocId]);
    } else {
      // Pré-seleciona automaticamente os documentos ativos com anexo e válidos (não vencidos)
      const validDocsWithAttachment = documents.filter(d => {
        const hasAtt = d.attachments && d.attachments.length > 0;
        const isExpired = d.expirationDate && new Date(d.expirationDate + 'T23:59:59') < new Date();
        return hasAtt && !isExpired;
      });
      setSelectedDocIds(validDocsWithAttachment.map(d => d.id));
    }
  }, [isOpen, preselectedDocId, documents]);

  // Atualiza e-mail ao escolher cliente cadastrado
  const handleClientChange = (clientId: string) => {
    setSelectedClientId(clientId);
    if (clientId === 'custom') {
      setRecipientEmail('');
      setRecipientName('');
    } else {
      const c = clients.find(cl => cl.id === clientId);
      if (c) {
        setRecipientEmail(c.email || '');
        setRecipientName(c.nomeFantasia || c.razaoSocial || '');
      }
    }
  };

  const handlePasswordChange = (val: string) => {
    setAppPassword(val);
    saveAppPassword(val);
  };

  const handleSenderEmailChange = (val: string) => {
    setSenderEmail(val);
    saveSenderEmail(val);
  };

  // Filtragem de documentos disponíveis para exibição no checklist
  const displayDocuments = useMemo(() => {
    return documents.filter(doc => {
      if (selectedBranchId === 'all') return true;
      const bFilter = selectedBranchId.toLowerCase().trim();
      const docBId = (doc.branchId || '').toLowerCase().trim();
      const docBName = (doc.branchName || '').toLowerCase().trim();

      if (docBId === 'todas' || docBName.includes('todas')) return true;

      const direct = docBId === bFilter || docBName === bFilter;
      const prMatch = (bFilter.includes('pr') || bFilter.includes('fil-013')) && (docBId.includes('pr') || docBName.includes('pr') || docBId === 'fil-013');
      const goMatch = (bFilter.includes('go') || bFilter.includes('fil-012')) && (docBId.includes('go') || docBName.includes('go') || docBId === 'fil-012');
      const spMatch = (bFilter.includes('sp') || bFilter.includes('fil-011')) && (docBId.includes('sp') || docBName.includes('sp') || docBId === 'fil-011');
      const matrizMatch = (bFilter.includes('matriz') || bFilter.includes('fil-010')) && (docBId.includes('matriz') || docBName.includes('matriz') || docBId === 'fil-010');

      return direct || prMatch || goMatch || spMatch || matrizMatch;
    });
  }, [documents, selectedBranchId]);

  // Lista dos documentos efetivamente selecionados
  const chosenDocs = useMemo(() => {
    return documents.filter(d => selectedDocIds.includes(d.id));
  }, [documents, selectedDocIds]);

  // Toggle de seleção individual
  const toggleDocSelection = (id: string) => {
    setSelectedDocIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  // Selecionar todos os válidos
  const handleSelectAllValid = () => {
    const validIds = displayDocuments
      .filter(d => {
        const hasAtt = d.attachments && d.attachments.length > 0;
        const isExpired = d.expirationDate && new Date(d.expirationDate + 'T23:59:59') < new Date();
        return hasAtt && !isExpired;
      })
      .map(d => d.id);
    setSelectedDocIds(validIds);
    showToast(`${validIds.length} documentos válidos selecionados`, 'info');
  };

  // Desmarcar todos
  const handleDeselectAll = () => {
    setSelectedDocIds([]);
  };

  // Gera o corpo do e-mail formatado em texto puro
  const generatedEmailBody = useMemo(() => {
    const clientGreeting = recipientName.trim()
      ? `Prezados(as) da equipe ${recipientName.trim()},`
      : 'Prezados(as) Senhores(as),';

    const branchNameLabel = selectedBranchId === 'all'
      ? 'Geral / Todas as Unidades'
      : (branches.find(b => b.id === selectedBranchId || b.name === selectedBranchId)?.name || selectedBranchId);

    const docListFormatted = chosenDocs.map((doc, idx) => {
      const isExpired = doc.expirationDate && new Date(doc.expirationDate + 'T23:59:59') < new Date();
      const valStr = doc.expirationDate ? doc.expirationDate.split('-').reverse().join('/') : 'Indeterminada';
      const statusText = isExpired ? '[EXPIRADO]' : '[VÁLIDO]';
      const attLinks = (doc.attachments || []).map(a => a.url).join('\n  Link: ');

      return `${idx + 1}. ${doc.title} (${doc.typeName})
  Unidade: ${doc.branchName || doc.branchId || 'Matriz'} | Validade: ${valStr} ${statusText}
  ${attLinks ? `Link direto: ${attLinks}` : '(Anexo PDF no e-mail)'}`;
    }).join('\n\n');

    return `${clientGreeting}

É com grande satisfação que apresentamos a TRANSCUNHA TRANSPORTES E LOGÍSTICA LTDA. com o objetivo de estabelecer uma sólida e produtiva parceria comercial no fornecimento de soluções em transporte rodoviário de cargas para a sua empresa.

Atuamos com frota qualificada, pontualidade, atendimento ágil e rigoroso padrão de segurança, contando com bases e unidades operacionais estrategicamente localizadas nos principais polos agroindustriais e rodoviários do país.

Para viabilizar nosso cadastro e homologação como transportadora parceira, encaminhamos em anexo o nosso Dossiê Cadastral e Operacional Completo, contendo certidões de regularidade (CNDs), licenças e apólices vigentes.

DADOS CADASTRAIS DA TRANSPORTADORA:
• Razão Social: TRANSCUNHA TRANSPORTES E LOGISTICA LTDA
• CNPJ Matriz: 36.203.306/0001-92 (Pratápolis - MG)
• CNPJ Filial PR: 36.203.306/0003-54 (Cambará - PR)
• CNPJ Filial SP: 36.203.306/0002-73 (Ipaussu - SP)
• CNPJ Filial GO: 36.203.306/0004-35 (Catalão - GO)
• Inscrição Estadual Matriz: 003666245.00-80
• E-mail Oficial: ${senderEmail || DEFAULT_GWORKSPACE_SENDER}
• Telefone: (66) 3544-0000
• Unidade Selecionada: ${branchNameLabel}

COBERTURAS DE SEGURO DE CARGA:
• RCTR-C (Acidentes de Trânsito / Colisão / Tombamento)
• RC-DC (Roubo e Desvio de Cargas / Gerenciamento de Risco Ativo)

${customObservations ? `OBSERVAÇÕES ADICIONAIS:\n${customObservations}\n\n` : ''}RELAÇÃO DE DOCUMENTOS (${chosenDocs.length} SELECIONADOS):
${docListFormatted}

Estamos à inteira disposição para agendarmos uma reunião de alinhamento, apresentar detalhadamente nossa estrutura operacional e realizar cotações de fretes para as rotas e demandas logísticas de sua empresa.

Aguardamos seu retorno para iniciarmos esta promissora parceria!

Atenciosamente,
Equipe Comercial & Controladoria Regulatória
TRANSCUNHA TRANSPORTES E LOGÍSTICA LTDA.
E-mail: ${senderEmail || DEFAULT_GWORKSPACE_SENDER}
Website: https://transcunhaoficial.com.br`;
  }, [recipientName, selectedBranchId, branches, chosenDocs, customObservations, senderEmail]);

  // DISPARO AUTOMÁTICO VIA GOOGLE WORKSPACE COM PDFs ANEXADOS
  const handleDirectSendWithAttachments = async () => {
    if (!recipientEmail || !recipientEmail.trim()) {
      showToast('Por favor, informe o e-mail do destinatário.', 'warning');
      return;
    }

    if (!appPassword || !appPassword.trim()) {
      showToast('Informe a Senha de App do Google Workspace (16 caracteres) para disparo automático.', 'warning');
      return;
    }

    if (chosenDocs.length === 0) {
      showToast('Selecione pelo menos um documento para o dossiê.', 'warning');
      return;
    }

    setIsSendingDirect(true);
    setSendSuccessInfo(null);
    setSendingStatus('Iniciando processamento dos documentos...');

    try {
      const result = await sendDossierEmailViaGoogleWorkspace({
        to: recipientEmail.trim(),
        subject: emailSubject.trim(),
        recipientName,
        selectedBranchId,
        branches,
        chosenDocs,
        customObservations,
        appPassword,
        senderEmail,
        onProgress: (status) => {
          setSendingStatus(status);
        },
      });

      setSendSuccessInfo({
        messageId: result.messageId,
        count: result.totalAttachments,
      });

      if (result.userHelp) {
        showToast(result.userHelp, 'warning', 8000);
      } else {
        showToast(`Dossiê enviado com sucesso com ${result.totalAttachments} documento(s) PDF anexados!`, 'success', 5000);
      }
    } catch (err: any) {
      console.error('Falha no envio direto:', err);
      showToast(err?.message || 'Falha ao disparar e-mail pelo Google Workspace.', 'error', 7000);
    } finally {
      setIsSendingDirect(false);
      setSendingStatus('');
    }
  };

  // Abertura segura no Google Workspace / Gmail Webmail como fallback
  const handleOpenGoogleWorkspace = async () => {
    if (chosenDocs.length === 0) {
      showToast('Selecione pelo menos um documento para o dossiê.', 'warning');
      return;
    }

    // Copia o texto completo para o clipboard (garante que o usuário tem tudo pronto para colar)
    try {
      await navigator.clipboard.writeText(generatedEmailBody);
      setCopiedType('all');
    } catch (e) {
      console.warn('Falha ao copiar para clipboard:', e);
    }

    const to = encodeURIComponent(recipientEmail.trim());
    const su = encodeURIComponent(emailSubject.trim());

    // Google Gmail Web tem limite estrito de tamanho de URL (~1.500 caracteres).
    // Textos longos causam "Bad Request Error 400" no servidor do Google.
    // Usamos um resumo conciso e seguro na URL, instruindo a colar o texto completo com Ctrl+V.
    const clientGreeting = recipientName.trim()
      ? `Prezados(as) da ${recipientName.trim()},`
      : 'Prezados(as) Senhores(as),';

    const shortBody = `${clientGreeting}

Apresentamos a TRANSCUNHA TRANSPORTES E LOGÍSTICA LTDA. para parceria comercial e homologação cadastral (${chosenDocs.length} documentos anexados/selecionados).

--------------------------------------------------
📋 A APRESENTAÇÃO COMPLETA COM TODAS AS CERTIDÕES E DADOS JÁ FOI COPIADA!
👉 Basta pressionar CTRL + V aqui para colar o texto completo.
--------------------------------------------------

Atenciosamente,
Equipe Comercial & Controladoria
TRANSCUNHA TRANSPORTES E LOGÍSTICA LTDA.
E-mail: ${senderEmail || DEFAULT_GWORKSPACE_SENDER}`;

    const safeBody = encodeURIComponent(shortBody);
    const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${to}&su=${su}&body=${safeBody}`;
    
    window.open(gmailUrl, '_blank', 'noopener,noreferrer');
    setShowCopiedBanner(true);
    showToast('Gmail aberto! Dossiê completo copiado (Ctrl+V para colar no corpo)', 'success');
  };

  // Abertura via cliente nativo (mailto:) com limite seguro de caracteres
  const handleOpenMailto = async () => {
    if (chosenDocs.length === 0) {
      showToast('Selecione pelo menos um documento para o dossiê.', 'warning');
      return;
    }

    try {
      await navigator.clipboard.writeText(generatedEmailBody);
      setCopiedType('all');
    } catch (e) {
      console.warn('Falha ao copiar para clipboard:', e);
    }

    const to = encodeURIComponent(recipientEmail.trim());
    const su = encodeURIComponent(emailSubject.trim());

    let bodyText = generatedEmailBody;
    if (encodeURIComponent(bodyText).length > 1000) {
      bodyText = `Prezados,

Apresentamos a TRANSCUNHA TRANSPORTES E LOGÍSTICA LTDA. para proposta de parceria comercial no transporte de cargas.

Dossiê de Homologação com ${chosenDocs.length} documentos selecionados.
O texto completo com a apresentação e dados da transportadora foi copiado para a sua área de transferência (Ctrl+V para colar).

Atenciosamente,
Equipe Comercial & Controladoria
TRANSCUNHA TRANSPORTES E LOGÍSTICA LTDA.
${senderEmail || DEFAULT_GWORKSPACE_SENDER}`;
    }

    const mailtoUrl = `mailto:${to}?subject=${su}&body=${encodeURIComponent(bodyText)}`;
    window.location.href = mailtoUrl;
    setShowCopiedBanner(true);
    showToast('Cliente de e-mail aberto! Dossiê completo copiado na área de transferência.', 'info');
  };

  // Abrir todos os PDFs selecionados em abas para conferência / download
  const handleOpenAllPdfs = () => {
    const urls = chosenDocs
      .flatMap(d => (d.attachments || []).map(a => a.url))
      .filter(Boolean);

    if (urls.length === 0) {
      showToast('Nenhum PDF disponível nos documentos selecionados.', 'warning');
      return;
    }

    urls.forEach((url, i) => {
      setTimeout(() => {
        window.open(url, '_blank', 'noopener,noreferrer');
      }, i * 250);
    });

    showToast(`Abrindo ${urls.length} documento(s) em abas para download/conferência...`, 'info');
  };

  // Copiar E-mail Formatado Completo
  const handleCopyEmailText = async () => {
    try {
      await navigator.clipboard.writeText(generatedEmailBody);
      setCopiedType('all');
      showToast('E-mail de homologação copiado com sucesso!', 'success');
      setTimeout(() => setCopiedType(null), 2500);
    } catch {
      showToast('Não foi possível copiar para a área de transferência.', 'error');
    }
  };

  // Copiar apenas Links Diretos dos Documentos
  const handleCopyDocLinks = async () => {
    try {
      const links = chosenDocs
        .map(d => {
          const u = (d.attachments || []).map(a => a.url).join('\n');
          return `${d.title} (${d.typeName}):\n${u || 'Sem link disponível'}`;
        })
        .join('\n\n');

      await navigator.clipboard.writeText(links);
      setCopiedType('links');
      showToast('Links dos documentos copiados com sucesso!', 'success');
      setTimeout(() => setCopiedType(null), 2500);
    } catch {
      showToast('Não foi possível copiar os links.', 'error');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/75 backdrop-blur-xs animate-fade-in overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-[1350px] max-h-[96vh] flex flex-col shadow-2xl overflow-hidden my-auto">
        
        {/* CABEÇALHO DO MODAL */}
        <div className="p-5 sm:p-7 border-b border-slate-800 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3.5 bg-gradient-to-br from-indigo-500 to-blue-600 text-white rounded-2xl shadow-lg shadow-indigo-500/30">
              <ShieldCheck className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                  Dossiê de Homologação de Fornecedor
                </h2>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-400/30">
                  <Mail className="w-3 h-3 text-blue-400" />
                  Google Workspace Oficial
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                  {senderEmail || DEFAULT_GWORKSPACE_SENDER}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Gere e envie a documentação fiscal, certidões e seguros da Transcunha para aprovação cadastral junto a clientes e embarcadores com os PDFs anexados automaticamente.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            title="Fechar (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* CORPO DO MODAL */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          
          {/* SEÇÃO 1: DESTINATÁRIO E FILIAL */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 rounded-2xl bg-slate-950/60 border border-slate-800/80">
            {/* Cliente Cadastrado */}
            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-indigo-400" />
                Cliente Solicitante
              </label>
              <select
                value={selectedClientId}
                onChange={(e) => handleClientChange(e.target.value)}
                className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-700 bg-slate-900 text-white outline-none focus:border-indigo-500 cursor-pointer"
              >
                <option value="custom">-- Digitar Outro Destinatário / Avulso --</option>
                {clients.map(cl => (
                  <option key={cl.id} value={cl.id}>
                    {cl.nomeFantasia || cl.razaoSocial} {cl.cnpj ? `(${cl.cnpj})` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* E-mail de Envio */}
            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-indigo-400" />
                E-mail do Destinatário *
              </label>
              <input
                type="email"
                name="recipientEmail"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                data-no-uppercase="true"
                placeholder="ex: homologacao@cliente.com.br, compras@..."
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-700 bg-slate-900 text-white placeholder-slate-500 outline-none focus:border-indigo-500 normal-case"
              />
            </div>

            {/* Filial da Documentação */}
            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-indigo-400" />
                Filial Transcunha
              </label>
              <select
                value={selectedBranchId}
                onChange={(e) => setSelectedBranchId(e.target.value)}
                className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-700 bg-slate-900 text-white outline-none focus:border-indigo-500 cursor-pointer"
              >
                <option value="all">Geral / Todas as Filiais</option>
                <option value="Matriz">Matriz (MG) — CNPJ: 36.203.306/0001-92</option>
                <option value="TRANSCUNHA PR FILIAL">TRANSCUNHA PR FILIAL — CNPJ: 36.203.306/0003-54</option>
                <option value="Filial SP">Filial SP (Ipaussu - SP) — CNPJ: 36.203.306/0002-73</option>
                <option value="Filial GO">Filial GO (Catalão - GO) — CNPJ: 36.203.306/0004-35</option>
              </select>
            </div>
          </div>

          {/* SEÇÃO 2: CREDENCIAIS DO GOOGLE WORKSPACE PARA DISPARO AUTOMÁTICO COM PDFs */}
          <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-950/40 via-indigo-950/30 to-slate-950/80 border border-blue-700/40 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-blue-500/20 text-blue-300 border border-blue-400/30">
                  <Key className="w-4 h-4 text-blue-400" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                    Envio Direto com PDFs Anexados (Google Workspace)
                    <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-blue-500/20 text-blue-300 border border-blue-400/30">
                      Disparo Automático
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Insira a Senha de App do Google Workspace para que o sistema faça o disparo automático em segundo plano com os arquivos em anexo físico.
                  </p>
                </div>
              </div>

              <a
                href="https://myaccount.google.com/apppasswords"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] font-bold text-sky-400 hover:text-sky-300 hover:underline flex items-center gap-1 cursor-pointer"
                title="Abrir página oficial do Google para gerar Senha de App"
              >
                <ExternalLink className="w-3 h-3" />
                Como gerar Senha de App (Google)
              </a>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
              {/* Remetente Oficial */}
              <div>
                <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1">
                  E-mail Remetente do Workspace
                </label>
                <input
                  type="email"
                  name="senderEmail"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  data-no-uppercase="true"
                  value={senderEmail}
                  onChange={(e) => handleSenderEmailChange(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-700 bg-slate-900 text-white outline-none focus:border-blue-500 normal-case"
                />
              </div>

              {/* Senha de App */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                    Senha de App do Google (16 dígitos) *
                  </label>
                  <span className="text-[10px] text-slate-400">
                    Salva automaticamente no navegador
                  </span>
                </div>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    name="appPassword"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    data-no-uppercase="true"
                    placeholder="ex: abcd efgh ijkl mnop"
                    value={appPassword}
                    onChange={(e) => handlePasswordChange(e.target.value)}
                    className="w-full pl-3 pr-10 py-2 text-xs font-mono font-bold rounded-xl border border-slate-700 bg-slate-900 text-white placeholder-slate-500 outline-none focus:border-blue-500 normal-case"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer"
                    title={showPassword ? 'Ocultar senha' : 'Exibir senha'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* SEÇÃO 3: SELEÇÃO DE DOCUMENTOS DO DOSSIÊ */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-indigo-400" />
                  Documentos & Apólices do Dossiê
                </span>
                <span className="px-2 py-0.5 rounded-full text-xs font-black bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  {chosenDocs.length} de {displayDocuments.length} selecionado{chosenDocs.length === 1 ? '' : 's'}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSelectAllValid}
                  className="px-2.5 py-1 text-xs font-bold rounded-lg bg-indigo-600/20 text-indigo-300 hover:bg-indigo-600/30 border border-indigo-500/30 transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <CheckSquare className="w-3.5 h-3.5" />
                  Selecionar Todos os Válidos
                </button>
                <button
                  type="button"
                  onClick={handleDeselectAll}
                  className="px-2.5 py-1 text-xs font-bold rounded-lg bg-slate-800 text-slate-400 hover:text-white transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <Square className="w-3.5 h-3.5" />
                  Desmarcar
                </button>
              </div>
            </div>

            {/* Grid de Documentos Ampliado (+30% de capacidade visual) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 max-h-72 overflow-y-auto p-2 border border-slate-800 rounded-2xl bg-slate-950/40">
              {displayDocuments.length === 0 ? (
                <div className="col-span-full py-8 text-center text-xs text-slate-500">
                  Nenhum documento encontrado para a filial selecionada.
                </div>
              ) : (
                displayDocuments.map(doc => {
                  const isSelected = selectedDocIds.includes(doc.id);
                  const hasAtt = doc.attachments && doc.attachments.length > 0;
                  const isExpired = doc.expirationDate && new Date(doc.expirationDate + 'T23:59:59') < new Date();
                  const firstAtt = hasAtt ? doc.attachments![0] : null;

                  return (
                    <div
                      key={doc.id}
                      onClick={() => toggleDocSelection(doc.id)}
                      className={`p-3 rounded-xl border transition-all cursor-pointer flex flex-col justify-between gap-2 select-none ${
                        isSelected
                          ? 'bg-indigo-950/40 border-indigo-500/70 shadow-sm shadow-indigo-950'
                          : 'bg-slate-900/70 border-slate-800 hover:border-slate-700 opacity-70'
                      }`}
                    >
                      <div className="flex items-start gap-2.5">
                        <div className="mt-0.5 shrink-0">
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-indigo-400" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-500" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="text-xs font-bold text-white truncate" title={doc.title}>
                            {doc.title}
                          </h4>
                          <span className="text-[10px] text-slate-400 block truncate">
                            {doc.typeName} • {doc.branchName || doc.branchId || 'Matriz'}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-[10px] pt-1.5 border-t border-slate-800/80">
                        <span className={`font-mono font-semibold ${isExpired ? 'text-rose-400' : 'text-slate-300'}`}>
                          {doc.expirationDate ? `Val: ${doc.expirationDate.split('-').reverse().join('/')}` : 'Val: Indet.'}
                        </span>

                        {hasAtt ? (
                          <a
                            href={firstAtt?.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1 text-sky-400 hover:text-sky-300 font-bold hover:underline"
                            title="Visualizar anexo em nova aba"
                          >
                            <ExternalLink className="w-3 h-3" />
                            PDF
                          </a>
                        ) : (
                          <span className="text-slate-500 italic">Sem PDF</span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* SEÇÃO 4: ASSUNTO E OBSERVAÇÕES ADICIONAIS */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                Assunto do E-mail
              </label>
              <input
                type="text"
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
                className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-700 bg-slate-900 text-white outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                Observações Específicas (Opcional)
              </label>
              <input
                type="text"
                placeholder="ex: Contato do responsável: João (66) 99999-0000 / Rota MT x PR"
                value={customObservations}
                onChange={(e) => setCustomObservations(e.target.value)}
                className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-700 bg-slate-900 text-white placeholder-slate-500 outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          {/* SEÇÃO 5: PRÉ-VISUALIZAÇÃO DA MENSAGEM */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 text-sky-400" />
                Pré-visualização do Conteúdo Oficial da Mensagem
              </label>
              <span className="text-[11px] text-slate-500">
                Remetente: <strong className="text-slate-300">{senderEmail || DEFAULT_GWORKSPACE_SENDER}</strong>
              </span>
            </div>
            
            <textarea
              readOnly
              rows={8}
              value={generatedEmailBody}
              className="w-full p-3 font-mono text-[11px] leading-relaxed rounded-2xl border border-slate-800 bg-slate-950 text-slate-300 outline-none resize-none selection:bg-indigo-600"
            />
          </div>

          {/* BANNER DE SUCESSO DO DISPARO DIRETO */}
          {sendSuccessInfo && (
            <div className="p-4 rounded-2xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs flex items-center justify-between gap-3 animate-fade-in shadow-lg shadow-emerald-950/40">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400">
                  <CheckCircle2 className="w-6 h-6 shrink-0" />
                </div>
                <div>
                  <strong className="block text-emerald-200 text-sm font-bold">
                    Dossiê enviado com sucesso via Google Workspace!
                  </strong>
                  <span>
                    O e-mail foi entregue para <strong>{recipientEmail}</strong> com <strong>{sendSuccessInfo.count} arquivos PDF</strong> anexados fisicamente à mensagem.
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSendSuccessInfo(null)}
                className="p-1 rounded-lg text-emerald-400 hover:text-white hover:bg-emerald-500/20 shrink-0 cursor-pointer"
                title="Fechar aviso"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* BANNER DE INSTRUÇÃO E CONFIRMAÇÃO APÓS ABRIR GMAIL WEB */}
          {showCopiedBanner && (
            <div className="p-3.5 rounded-2xl bg-blue-500/15 border border-blue-500/30 text-blue-300 text-xs flex items-center justify-between gap-3 animate-fade-in">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="w-5 h-5 text-blue-400 shrink-0" />
                <div>
                  <strong className="block text-blue-200">Gmail Web aberto e Dossiê copiado!</strong>
                  <span>Na janela aberta do Gmail, o destinatário e o assunto já estão preenchidos. Para colar a listagem completa com todos os links, pressione <strong>Ctrl + V</strong> no corpo da mensagem.</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCopiedBanner(false)}
                className="p-1 rounded-lg text-blue-400 hover:text-white hover:bg-blue-500/20 shrink-0 cursor-pointer"
                title="Fechar aviso"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

        </div>

        {/* RODAPÉ E BOTÕES DE DISPARO */}
        <div className="p-4 sm:p-5 border-t border-slate-800 bg-slate-950/80 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleCopyEmailText}
              className="px-3 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors flex items-center gap-1.5 cursor-pointer"
              title="Copiar todo o texto formatado para a área de transferência"
            >
              {copiedType === 'all' ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400">E-mail Copiado!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-slate-400" />
                  <span>Copiar E-mail</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleCopyDocLinks}
              className="px-3 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors flex items-center gap-1.5 cursor-pointer"
              title="Copiar apenas a lista de links diretos para download"
            >
              {copiedType === 'links' ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400">Links Copiados!</span>
                </>
              ) : (
                <>
                  <Paperclip className="w-3.5 h-3.5 text-slate-400" />
                  <span>Copiar Apenas Links</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleOpenAllPdfs}
              className="px-3 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors flex items-center gap-1.5 cursor-pointer"
              title="Abrir todos os PDFs dos documentos selecionados em novas abas para download rápido"
            >
              <Download className="w-3.5 h-3.5 text-sky-400" />
              <span>Abrir PDFs</span>
            </button>

            <button
              type="button"
              onClick={handleOpenMailto}
              className="px-3 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer"
              title="Abrir no aplicativo padrão de e-mail (Outlook/Thunderbird)"
            >
              Mailto
            </button>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Fallback Gmail Webmail */}
            <button
              type="button"
              onClick={handleOpenGoogleWorkspace}
              className="px-3.5 py-2.5 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors cursor-pointer flex items-center gap-1.5"
              title="Abrir janela de composição no Gmail Web"
            >
              <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
              <span>Abrir no Gmail Web</span>
            </button>

            {/* BOTÃO PRINCIPAL: DISPARO AUTOMÁTICO COM PDFs ANEXADOS */}
            <button
              type="button"
              disabled={isSendingDirect}
              onClick={handleDirectSendWithAttachments}
              className="px-5 py-2.5 rounded-xl text-xs sm:text-sm font-black bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-500 hover:to-teal-600 text-white shadow-lg shadow-emerald-600/30 transition-all transform active:scale-95 flex items-center gap-2 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
              title="Enviar e-mail diretamente pelo Google Workspace com todos os PDFs anexados automaticamente"
            >
              {isSendingDirect ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                  <span>{sendingStatus || 'Disparando...'}</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>Disparar com PDFs Anexados (Automático)</span>
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

export default FiscalHomologationModal;
