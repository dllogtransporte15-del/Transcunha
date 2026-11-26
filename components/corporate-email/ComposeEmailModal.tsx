import React, { useState, useEffect } from 'react';
import { 
  X, 
  Send, 
  Paperclip, 
  Key, 
  Eye, 
  EyeOff, 
  ExternalLink, 
  FileText, 
  Trash2, 
  Loader2, 
  Check, 
  Sparkles,
  Building2,
  Mail,
  User,
  ShieldCheck
} from 'lucide-react';
import type { CorporateEmailAccount, CorporateEmailAttachment, CorporateEmailMessage } from '../../types';
import { corporateEmailService } from '../../services/corporateEmailService';
import { getSavedAppPassword, saveAppPassword, DEFAULT_GWORKSPACE_SENDER } from '../../services/fiscalDossierEmailService';
import { getUserJobFunction } from '../../auth';
import { useToast } from '../../hooks/useToast';

interface ComposeEmailModalProps {
  isOpen: boolean;
  onClose: () => void;
  accounts: CorporateEmailAccount[];
  initialMode?: 'new' | 'reply' | 'replyAll' | 'forward';
  replyToMessage?: CorporateEmailMessage | null;
  initialTo?: string;
  initialSubject?: string;
  initialBody?: string;
  initialAttachments?: CorporateEmailAttachment[];
  onSuccess?: (msg: CorporateEmailMessage) => void;
}

export const ComposeEmailModal: React.FC<ComposeEmailModalProps> = ({
  isOpen,
  onClose,
  accounts,
  initialMode = 'new',
  replyToMessage = null,
  initialTo = '',
  initialSubject = '',
  initialBody = '',
  initialAttachments = [],
  onSuccess,
}) => {
  const { showToast } = useToast();

  const senderOptions = React.useMemo(() => {
    const loggedUser = corporateEmailService.getCurrentSessionUser();
    const loggedEmail = (
      (loggedUser?.corporateEmail && loggedUser.corporateEmail.trim()) ||
      (loggedUser?.email && loggedUser.email.trim()) ||
      ''
    ).toLowerCase();

    const loggedRole =
      getUserJobFunction(loggedUser) ||
      corporateEmailService.mapProfileToDepartment(loggedUser?.profile);

    const list: Array<{ id: string; email: string; displayName: string; roleLabel: string }> = [];
    const seenEmails = new Set<string>();

    if (loggedUser && loggedEmail && loggedEmail.includes('@')) {
      const matched = accounts.find(
        a =>
          a.userId === loggedUser.id ||
          a.email.toLowerCase() === loggedEmail
      );
      const emailToUse = matched?.email || loggedEmail;
      seenEmails.add(emailToUse.toLowerCase());
      list.push({
        id: matched?.id || `logged_${loggedUser.id}`,
        email: emailToUse,
        displayName: loggedUser.name || matched?.displayName || emailToUse,
        roleLabel: loggedRole || matched?.department || 'Usuário Logado',
      });
    }

    accounts.forEach(acc => {
      const lower = acc.email.toLowerCase();
      if (!seenEmails.has(lower)) {
        seenEmails.add(lower);
        list.push({
          id: acc.id,
          email: acc.email,
          displayName: acc.displayName,
          roleLabel: acc.department,
        });
      }
    });

    if (!seenEmails.has(DEFAULT_GWORKSPACE_SENDER.toLowerCase())) {
      list.push({
        id: 'default_gworkspace',
        email: DEFAULT_GWORKSPACE_SENDER,
        displayName: 'Transcunha Oficial',
        roleLabel: 'Geral',
      });
    }

    return list;
  }, [accounts, isOpen]);

  const [fromEmail, setFromEmail] = useState<string>(DEFAULT_GWORKSPACE_SENDER);
  const [to, setTo] = useState<string>('');
  const [cc, setCc] = useState<string>('');
  const [showCc, setShowCc] = useState<boolean>(false);
  const [subject, setSubject] = useState<string>('');
  const [body, setBody] = useState<string>('');
  const [attachments, setAttachments] = useState<CorporateEmailAttachment[]>([]);
  const [appPassword, setAppPassword] = useState<string>(() => getSavedAppPassword());
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [isSending, setIsSending] = useState<boolean>(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const wasOpenRef = React.useRef<boolean>(false);

  useEffect(() => {
    if (!isOpen) {
      wasOpenRef.current = false;
      return;
    }

    // Só inicializa os campos na abertura do modal (evita apagar o que o usuário está digitando quando o pai re-renderiza)
    if (wasOpenRef.current && !replyToMessage) {
      return;
    }
    wasOpenRef.current = true;

    // Se houver mensagem para responder ou encaminhar
    if (replyToMessage) {
      const fromAcc = accounts.find(a => a.email === replyToMessage.accountEmail) || accounts[0];
      if (fromAcc) setFromEmail(fromAcc.email);

      if (initialMode === 'reply' || initialMode === 'replyAll') {
        setTo(replyToMessage.from);
        if (initialMode === 'replyAll' && replyToMessage.to) {
          const others = replyToMessage.to.filter(e => e !== fromAcc?.email);
          setCc(others.join(', '));
          setShowCc(others.length > 0);
        } else {
          setCc('');
          setShowCc(false);
        }
        setSubject(replyToMessage.subject.startsWith('Re:') ? replyToMessage.subject : `Re: ${replyToMessage.subject}`);
        setBody('');
      } else if (initialMode === 'forward') {
        setTo('');
        setCc('');
        setShowCc(false);
        setSubject(replyToMessage.subject.startsWith('Fwd:') ? replyToMessage.subject : `Fwd: ${replyToMessage.subject}`);
        setBody(`\n\n---------- Mensagem Encaminhada ----------\nDe: ${replyToMessage.fromName} <${replyToMessage.from}>\nData: ${new Date(replyToMessage.date).toLocaleString('pt-BR')}\nAssunto: ${replyToMessage.subject}\nPara: ${(replyToMessage.to || []).join(', ')}\n\n${replyToMessage.bodyText}`);
        setAttachments(replyToMessage.attachments || []);
      }
    } else {
      // Nova mensagem (prioriza sempre o usuário interno logado no campo "De:")
      if (senderOptions.length > 0) {
        setFromEmail(senderOptions[0].email);
      }
      setTo(initialTo || '');
      setCc('');
      setShowCc(false);
      setSubject(initialSubject || '');
      setBody(initialBody || '');
      setAttachments(initialAttachments || []);
    }
  }, [isOpen, replyToMessage?.id, initialMode]);

  const handlePasswordChange = (val: string) => {
    setAppPassword(val);
    saveAppPassword(val);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64Data = result.replace(/^data:[^;]+;base64,/, '');

        setAttachments(prev => [
          ...prev,
          {
            id: `att_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            filename: file.name,
            sizeBytes: file.size,
            contentType: file.type || 'application/pdf',
            base64: base64Data,
          }
        ]);
      };
      reader.readAsDataURL(file);
    });

    e.target.value = '';
  };

  const handleRemoveAttachment = (id: string) => {
    setAttachments(prev => prev.filter(a => a.id !== id));
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!to.trim()) {
      showToast('Informe o endereço de e-mail do destinatário.', 'warning');
      return;
    }

    if (!subject.trim()) {
      showToast('Informe o assunto da mensagem.', 'warning');
      return;
    }

    setIsSending(true);
    setSendError(null);

    try {
      const toAddresses = to.split(/[,;]/).map(s => s.trim()).filter(Boolean);
      const ccAddresses = cc ? cc.split(/[,;]/).map(s => s.trim()).filter(Boolean) : [];

      const sig = corporateEmailService.buildSignatureForSender(fromEmail);
      const currentAcc = accounts.find(a => a.email === fromEmail);
      const senderName = sig.displayName || currentAcc?.displayName || 'Transcunha Transportes e Logística';

      const fullHtml = `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 14px; color: #1e293b; line-height: 1.6;">
  ${body.replace(/\n/g, '<br/>')}
  <br/><br/>
  ${sig.html}
</div>
      `.trim();

      const fullText = `${body.trim()}\n\n${sig.text}`;

      const result = await corporateEmailService.sendOutgoingEmail({
        to: toAddresses,
        cc: ccAddresses.length > 0 ? ccAddresses : undefined,
        subject: subject.trim(),
        bodyHtml: fullHtml,
        bodyText: fullText,
        accountEmail: fromEmail,
        senderName,
        appPassword,
        attachments,
      });

      showToast(`E-mail enviado com sucesso para ${toAddresses.join(', ')}!`, 'success');
      onClose();
    } catch (err: any) {
      console.error('Erro ao enviar e-mail:', err);
      const errMsg = err?.message || 'Falha ao disparar e-mail corporativo.';
      setSendError(errMsg);
      showToast(errMsg, 'error', 7000);
    } finally {
      setIsSending(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[10050] flex items-center justify-center p-2 sm:p-4 bg-black/75 backdrop-blur-xs animate-fade-in overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-4xl max-h-[94vh] flex flex-col shadow-2xl overflow-hidden my-auto">
        
        {/* CABEÇALHO DO MODAL */}
        <div className="p-4 sm:p-5 border-b border-slate-800 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-600/30 text-blue-400 border border-blue-500/30 rounded-xl">
              <Mail className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                {initialMode === 'reply' ? 'Responder Mensagem' : initialMode === 'forward' ? 'Encaminhar Mensagem' : 'Nova Mensagem Corporativa'}
                <span className="text-[10px] uppercase font-black px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">
                  Transcunha Webmail
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Disparo oficial com layout executivo e anexos físicos
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

        {/* CORPO DO FORMULÁRIO */}
        <form onSubmit={handleSend} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {sendError && (
            <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-200 text-xs whitespace-pre-line">
              <strong className="font-bold block mb-0.5">Não foi possível enviar o e-mail:</strong>
              {sendError}
            </div>
          )}
          
          {/* DE / REMETENTE */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
            <label className="sm:col-span-2 text-xs font-bold text-slate-400 uppercase tracking-wider">
              De:
            </label>
            <div className="sm:col-span-10">
              <select
                value={fromEmail}
                onChange={(e) => setFromEmail(e.target.value)}
                className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-700 bg-slate-950 text-white outline-none focus:border-blue-500 cursor-pointer"
              >
                {senderOptions.map(opt => (
                  <option key={opt.id} value={opt.email}>
                    {opt.email} — {opt.displayName} ({opt.roleLabel})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* PARA */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
            <label className="sm:col-span-2 text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
              <span>Para: *</span>
              {!showCc && (
                <button
                  type="button"
                  onClick={() => setShowCc(true)}
                  className="text-[11px] text-blue-400 hover:underline normal-case font-normal"
                >
                  + Cc
                </button>
              )}
            </label>
            <div className="sm:col-span-10">
              <input
                type="text"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                data-no-uppercase="true"
                placeholder="ex: cliente@empresa.com.br, compras@graos.com"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-700 bg-slate-950 text-white outline-none focus:border-blue-500 normal-case"
                required
              />
            </div>
          </div>

          {/* CC */}
          {showCc && (
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
              <label className="sm:col-span-2 text-xs font-bold text-slate-400 uppercase tracking-wider">
                Cc:
              </label>
              <div className="sm:col-span-10">
                <input
                  type="text"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  data-no-uppercase="true"
                  placeholder="ex: copia@empresa.com.br"
                  value={cc}
                  onChange={(e) => setCc(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-700 bg-slate-950 text-white outline-none focus:border-blue-500 normal-case"
                />
              </div>
            </div>
          )}

          {/* ASSUNTO */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
            <label className="sm:col-span-2 text-xs font-bold text-slate-400 uppercase tracking-wider">
              Assunto: *
            </label>
            <div className="sm:col-span-10">
              <input
                type="text"
                placeholder="[TRANSCUNHA] Cotação de Frete / Alinhamento Operacional"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-700 bg-slate-950 text-white outline-none focus:border-blue-500"
                required
              />
            </div>
          </div>

          {/* SENHA DE APP DO GOOGLE WORKSPACE */}
          <div className="p-3 rounded-2xl bg-slate-950/60 border border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Key className="w-4 h-4 text-blue-400 shrink-0" />
              <div>
                <span className="text-xs font-bold text-slate-300">
                  Senha de App do Google Workspace (SMTP)
                </span>
                <span className="text-[10px] text-slate-500 block">
                  Necessária para disparar via smtp.gmail.com:465
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-60">
                <input
                  type={showPassword ? 'text' : 'password'}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  data-no-uppercase="true"
                  placeholder="16 letras do Google"
                  value={appPassword}
                  onChange={(e) => handlePasswordChange(e.target.value)}
                  className="w-full pl-3 pr-8 py-1.5 text-xs font-mono font-bold rounded-lg border border-slate-700 bg-slate-900 text-white placeholder-slate-600 outline-none focus:border-blue-500 normal-case"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                >
                  {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>

              <a
                href="https://myaccount.google.com/apppasswords"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] font-bold text-sky-400 hover:underline shrink-0 flex items-center gap-1"
                title="Gerar Senha de App no Google"
              >
                <ExternalLink className="w-3 h-3" />
                Gerar
              </a>
            </div>
          </div>

          {/* CORPO DO E-MAIL */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
              Mensagem:
            </label>
            <textarea
              rows={8}
              placeholder="Digite o texto da mensagem aqui..."
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="w-full p-3 text-xs leading-relaxed rounded-2xl border border-slate-700 bg-slate-950 text-slate-200 outline-none focus:border-blue-500 resize-none"
            />
          </div>

          {/* ANEXOS */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Paperclip className="w-3.5 h-3.5 text-blue-400" />
                Arquivos Anexados ({attachments.length})
              </label>

              <label className="px-3 py-1 text-xs font-bold rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors flex items-center gap-1.5 cursor-pointer">
                <Paperclip className="w-3.5 h-3.5 text-blue-400" />
                <span>Anexar Arquivos (PDF, XML, etc.)</span>
                <input
                  type="file"
                  multiple
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>

            {attachments.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 p-2 rounded-2xl bg-slate-950/50 border border-slate-800">
                {attachments.map(att => (
                  <div
                    key={att.id}
                    className="flex items-center justify-between gap-2 p-2 rounded-xl bg-slate-900 border border-slate-800 text-xs"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="w-4 h-4 text-blue-400 shrink-0" />
                      <div className="min-w-0">
                        <p className="font-bold text-white truncate" title={att.filename}>
                          {att.filename}
                        </p>
                        <span className="text-[10px] text-slate-500">
                          {(att.sizeBytes / 1024).toFixed(1)} KB
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveAttachment(att.id)}
                      className="p-1 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* RODAPÉ DO FORMULÁRIO */}
          <div className="pt-4 border-t border-slate-800 flex items-center justify-between gap-3">
            <span className="text-xs text-slate-500 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              Assinatura institucional da Transcunha aplicada automaticamente
            </span>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl border border-slate-700 text-xs font-bold text-slate-300 hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Cancelar
              </button>

              <button
                type="submit"
                disabled={isSending}
                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-bold shadow-lg shadow-blue-600/30 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isSending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Disparando...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>Enviar Mensagem</span>
                  </>
                )}
              </button>
            </div>
          </div>

        </form>

      </div>
    </div>
  );
};
