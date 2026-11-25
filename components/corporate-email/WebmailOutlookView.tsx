import React, { useState, useMemo, useEffect } from 'react';
import { 
  Inbox, 
  Star, 
  Send, 
  FileEdit, 
  Trash2, 
  Paperclip, 
  Reply, 
  ReplyAll, 
  Forward, 
  Printer, 
  Search, 
  Filter, 
  RefreshCw, 
  Plus, 
  CheckCheck, 
  Mail, 
  Clock, 
  ChevronDown, 
  Download, 
  ExternalLink,
  ShieldCheck,
  FileText,
  User,
  Sparkles,
  Archive,
  MoreVertical,
  Check,
  X,
  AppWindow
} from 'lucide-react';
import type { CorporateEmailAccount, CorporateEmailFolder, CorporateEmailMessage, CorporateEmailAttachment } from '../../types';
import { corporateEmailService } from '../../services/corporateEmailService';
import { ComposeEmailModal } from './ComposeEmailModal';
import { useToast } from '../../hooks/useToast';

let externalWebmailWindowRef: Window | null = null;

export function openExternalWebmailWindow(): void {
  if (typeof window === 'undefined') return;
  try {
    if (externalWebmailWindowRef && !externalWebmailWindowRef.closed) {
      externalWebmailWindowRef.focus();
      return;
    }
  } catch {}

  const width = Math.min(1380, Math.max(1024, window.screen.availWidth - 80));
  const height = Math.min(860, Math.max(680, window.screen.availHeight - 80));
  const left = Math.max(20, Math.round((window.screen.availWidth - width) / 2));
  const top = Math.max(20, Math.round((window.screen.availHeight - height) / 2));

  externalWebmailWindowRef = window.open(
    '/webmail',
    'transcunha_webmail_standalone',
    `popup=yes,width=${width},height=${height},left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=yes`
  );
  if (externalWebmailWindowRef) {
    externalWebmailWindowRef.focus();
  }
}

interface WebmailOutlookViewProps {
  accounts: CorporateEmailAccount[];
  onOpenSignatures?: () => void;
  onOpenServerConfig?: () => void;
  isStandalone?: boolean;
}

export const WebmailOutlookView: React.FC<WebmailOutlookViewProps> = ({
  accounts,
  onOpenSignatures,
  onOpenServerConfig,
  isStandalone = false,
}) => {
  const { showToast } = useToast();

  const [selectedMailbox, setSelectedMailbox] = useState<string>('all');
  const [currentFolder, setCurrentFolder] = useState<CorporateEmailFolder>('inbox');
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>('msg_001');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterUnreadOnly, setFilterUnreadOnly] = useState<boolean>(false);
  const [filterHasAttOnly, setFilterHasAttOnly] = useState<boolean>(false);
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);

  // Compose Modal State
  const [isComposeOpen, setIsComposeOpen] = useState<boolean>(false);
  const [composeMode, setComposeMode] = useState<'new' | 'reply' | 'replyAll' | 'forward'>('new');
  const [targetMessageForCompose, setTargetMessageForCompose] = useState<CorporateEmailMessage | null>(null);

  // Escutar eventos de atualização de mensagens em tempo real (local, entre janelas e Supabase Realtime)
  useEffect(() => {
    const handleUpdate = () => {
      setRefreshTrigger(prev => prev + 1);
    };

    window.addEventListener('corporate_messages_updated', handleUpdate);
    window.addEventListener('transcunha:new_corporate_email', handleUpdate);

    const unsubscribeRealtime = corporateEmailService.subscribeToRealtime(() => {
      setRefreshTrigger(prev => prev + 1);
    });

    return () => {
      window.removeEventListener('corporate_messages_updated', handleUpdate);
      window.removeEventListener('transcunha:new_corporate_email', handleUpdate);
      unsubscribeRealtime();
    };
  }, []);

  // Mensagens filtradas pela caixa e pasta
  const messages = useMemo(() => {
    return corporateEmailService.getMessages(selectedMailbox, currentFolder);
  }, [selectedMailbox, currentFolder, refreshTrigger]);

  // Mensagens com filtros de busca e checkboxes aplicados
  const filteredMessages = useMemo(() => {
    return messages.filter(m => {
      const q = searchQuery.toLowerCase().trim();
      const matchQ = !q || 
        m.subject.toLowerCase().includes(q) || 
        m.fromName.toLowerCase().includes(q) || 
        m.from.toLowerCase().includes(q) || 
        m.bodyText.toLowerCase().includes(q);

      const matchUnread = !filterUnreadOnly || !m.isRead;
      const matchAtt = !filterHasAttOnly || m.hasAttachments;

      return matchQ && matchUnread && matchAtt;
    });
  }, [messages, searchQuery, filterUnreadOnly, filterHasAttOnly]);

  // Mensagem atualmente aberta para leitura na Coluna 3
  const selectedMessage = useMemo(() => {
    if (!selectedMessageId) return null;
    const all = corporateEmailService.getMessages();
    return all.find(m => m.id === selectedMessageId) || null;
  }, [selectedMessageId, refreshTrigger]);

  // Contadores dinâmicos de cada pasta
  const counts = useMemo(() => {
    const all = corporateEmailService.getMessages(selectedMailbox);
    return {
      inbox: all.filter(m => m.folder === 'inbox').length,
      inboxUnread: all.filter(m => m.folder === 'inbox' && !m.isRead).length,
      starred: all.filter(m => m.isStarred).length,
      sent: all.filter(m => m.folder === 'sent').length,
      drafts: all.filter(m => m.folder === 'drafts').length,
      trash: all.filter(m => m.folder === 'trash').length,
    };
  }, [selectedMailbox, refreshTrigger]);

  // Se a mensagem selecionada não estiver na lista visível, seleciona a primeira
  useEffect(() => {
    if (filteredMessages.length > 0) {
      if (!selectedMessageId || !filteredMessages.some(m => m.id === selectedMessageId)) {
        setSelectedMessageId(filteredMessages[0].id);
      }
    } else {
      setSelectedMessageId(null);
    }
  }, [filteredMessages, selectedMessageId]);

  // Ações sobre a mensagem
  const handleSelectMessage = (msg: CorporateEmailMessage) => {
    setSelectedMessageId(msg.id);
    if (!msg.isRead) {
      corporateEmailService.markAsRead(msg.id, true);
      setRefreshTrigger(c => c + 1);
    }
  };

  const handleToggleStar = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    corporateEmailService.toggleStar(id);
    setRefreshTrigger(c => c + 1);
  };

  const handleToggleRead = (e: React.MouseEvent, id: string, currentRead: boolean) => {
    e.stopPropagation();
    corporateEmailService.markAsRead(id, !currentRead);
    setRefreshTrigger(c => c + 1);
  };

  const handleDeleteMessage = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    corporateEmailService.deleteMessage(id);
    if (selectedMessageId === id) {
      setSelectedMessageId(null);
    }
    setRefreshTrigger(c => c + 1);
    showToast('Mensagem movida para a Lixeira.', 'info');
  };

  const handleReply = (isReplyAll = false) => {
    if (!selectedMessage) return;
    setComposeMode(isReplyAll ? 'replyAll' : 'reply');
    setTargetMessageForCompose(selectedMessage);
    setIsComposeOpen(true);
  };

  const handleForward = () => {
    if (!selectedMessage) return;
    setComposeMode('forward');
    setTargetMessageForCompose(selectedMessage);
    setIsComposeOpen(true);
  };

  const handleNewMessage = () => {
    setComposeMode('new');
    setTargetMessageForCompose(null);
    setIsComposeOpen(true);
  };

  const handlePrint = () => {
    window.print();
  };

  const formatRelativeTime = (iso: string) => {
    try {
      const d = new Date(iso);
      const now = new Date();
      const diffMs = now.getTime() - d.getTime();
      const diffMin = Math.floor(diffMs / (1000 * 60));

      if (diffMin < 1) return 'Agora';
      if (diffMin < 60) return `há ${diffMin} min`;
      const diffHours = Math.floor(diffMin / 60);
      if (diffHours < 24 && d.getDate() === now.getDate()) {
        return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      }
      const yesterday = new Date();
      yesterday.setDate(now.getDate() - 1);
      if (d.getDate() === yesterday.getDate()) return 'Ontem';
      return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
    } catch {
      return '';
    }
  };

  const formatFullDate = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString('pt-BR', { 
        weekday: 'long', 
        day: '2-digit', 
        month: 'long', 
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return iso;
    }
  };

  return (
    <div
      className={
        isStandalone
          ? 'h-full w-full flex bg-white dark:bg-slate-900 overflow-hidden animate-fade-in'
          : 'h-[calc(100vh-14rem)] min-h-[640px] flex rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl overflow-hidden animate-fade-in'
      }
    >
      
      {/* ========================================================= */}
      {/* COLUNA 1: CONTAS, PASTAS & ATALHOS                        */}
      {/* ========================================================= */}
      <div className="w-64 border-r border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 flex flex-col shrink-0 select-none">
        
        {/* Seletor de Conta Corporativa */}
        <div className="p-3 border-b border-slate-200 dark:border-slate-800">
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
            Caixa Postal
          </label>
          <div className="relative">
            <select
              value={selectedMailbox}
              onChange={(e) => setSelectedMailbox(e.target.value)}
              className="w-full pl-2.5 pr-7 py-1.5 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 outline-none focus:border-blue-500 cursor-pointer truncate"
            >
              <option value="all">Todas as Caixas Corporativas</option>
              {accounts.map(acc => (
                <option key={acc.id} value={acc.email}>
                  {acc.email} ({acc.department})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Botão + Nova Mensagem e Abrir Janela Externa */}
        <div className="p-3 space-y-2">
          <button
            onClick={handleNewMessage}
            className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-blue-600 via-primary to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-black shadow-lg shadow-blue-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer transform active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>Nova Mensagem</span>
          </button>

          {!isStandalone && (
            <button
              onClick={openExternalWebmailWindow}
              className="w-full py-2 px-3 rounded-xl bg-slate-200/80 dark:bg-slate-800/90 hover:bg-blue-600 hover:text-white dark:hover:bg-blue-600 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 hover:border-blue-500 text-[11px] font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              title="Abrir caixa de e-mail em janela externa independente (modo aplicativo)"
            >
              <AppWindow className="w-3.5 h-3.5" />
              <span>Abrir Janela Externa</span>
            </button>
          )}
        </div>

        {/* Lista de Pastas do Outlook */}
        <div className="flex-1 overflow-y-auto px-2 py-1 space-y-1">
          {[
            { id: 'inbox', label: 'Caixa de Entrada', icon: Inbox, count: counts.inbox, unread: counts.inboxUnread },
            { id: 'starred', label: 'Com Estrela', icon: Star, count: counts.starred, unread: 0 },
            { id: 'sent', label: 'Itens Enviados', icon: Send, count: counts.sent, unread: 0 },
            { id: 'drafts', label: 'Rascunhos', icon: FileEdit, count: counts.drafts, unread: 0 },
            { id: 'trash', label: 'Lixeira', icon: Trash2, count: counts.trash, unread: 0 },
          ].map(folder => {
            const isActive = currentFolder === folder.id;
            return (
              <button
                key={folder.id}
                onClick={() => setCurrentFolder(folder.id as CorporateEmailFolder)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800/60'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <folder.icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : folder.id === 'starred' ? 'text-amber-400' : 'text-slate-500'}`} />
                  <span className="truncate">{folder.label}</span>
                </div>

                {folder.unread > 0 ? (
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                    isActive ? 'bg-white text-blue-600' : 'bg-blue-600 text-white'
                  }`}>
                    {folder.unread}
                  </span>
                ) : folder.count > 0 ? (
                  <span className={`text-[11px] ${isActive ? 'text-blue-100' : 'text-slate-400'}`}>
                    {folder.count}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        {/* Status de Conexão e Atalhos de Configurações */}
        <div className="p-3 border-t border-slate-200 dark:border-slate-800 space-y-2 bg-slate-100/50 dark:bg-slate-900/40">
          <div className="flex items-center gap-2 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Google Workspace Online</span>
          </div>
          <p className="text-[10px] text-slate-500">
            SSL 465 (smtp.gmail.com)
          </p>

          <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
            {onOpenSignatures && (
              <button
                onClick={onOpenSignatures}
                className="text-blue-600 dark:text-blue-400 hover:underline text-[11px] font-bold flex items-center gap-1 cursor-pointer"
              >
                <Sparkles className="w-3 h-3 text-amber-400" />
                Assinaturas
              </button>
            )}
            {onOpenServerConfig && (
              <button
                onClick={onOpenServerConfig}
                className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 text-[11px] font-bold cursor-pointer"
              >
                Servidor
              </button>
            )}
          </div>
        </div>

      </div>

      {/* ========================================================= */}
      {/* COLUNA 2: LISTA DE MENSAGENS COM BUSCA E FILTROS          */}
      {/* ========================================================= */}
      <div className="w-80 sm:w-96 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col shrink-0">
        
        {/* Cabeçalho da Lista de Mensagens */}
        <div className="p-3 border-b border-slate-200 dark:border-slate-800 space-y-2.5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black text-slate-800 dark:text-white capitalize flex items-center gap-2">
              {currentFolder === 'inbox' ? 'Caixa de Entrada' : currentFolder === 'sent' ? 'Enviados' : currentFolder === 'starred' ? 'Favoritos' : currentFolder === 'drafts' ? 'Rascunhos' : 'Lixeira'}
              <span className="text-xs font-normal text-slate-400">
                ({filteredMessages.length})
              </span>
            </h3>

            <div className="flex items-center gap-1">
              {!isStandalone && (
                <button
                  onClick={openExternalWebmailWindow}
                  className="p-1.5 rounded-lg text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/60 transition-colors cursor-pointer"
                  title="Abrir em janela externa independente"
                >
                  <AppWindow className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                onClick={() => {
                  void corporateEmailService.syncFromCloud().then(() => setRefreshTrigger(c => c + 1));
                  setRefreshTrigger(c => c + 1);
                }}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                title="Sincronizar correio agora"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Campo de Busca */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar remetente, assunto..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-7 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 outline-none focus:border-blue-500"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Filtros Rápidos */}
          <div className="flex items-center gap-2 pt-1 text-[11px]">
            <button
              onClick={() => setFilterUnreadOnly(!filterUnreadOnly)}
              className={`px-2 py-0.5 rounded-lg border font-bold transition-all cursor-pointer ${
                filterUnreadOnly
                  ? 'bg-blue-600 border-blue-600 text-white'
                  : 'border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              Não Lidos
            </button>
            <button
              onClick={() => setFilterHasAttOnly(!filterHasAttOnly)}
              className={`px-2 py-0.5 rounded-lg border font-bold transition-all cursor-pointer flex items-center gap-1 ${
                filterHasAttOnly
                  ? 'bg-blue-600 border-blue-600 text-white'
                  : 'border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Paperclip className="w-3 h-3" />
              Com Anexo
            </button>
          </div>
        </div>

        {/* Lista Scrollável de Mensagens */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/80">
          {filteredMessages.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400 space-y-2">
              <Mail className="w-8 h-8 text-slate-300 dark:text-slate-700 mx-auto" />
              <p>Nenhuma mensagem encontrada nesta pasta.</p>
            </div>
          ) : (
            filteredMessages.map(msg => {
              const isSelected = selectedMessageId === msg.id;
              const isUnread = !msg.isRead;

              return (
                <div
                  key={msg.id}
                  onClick={() => handleSelectMessage(msg)}
                  className={`p-3 transition-all cursor-pointer relative group flex flex-col gap-1 select-none ${
                    isSelected
                      ? 'bg-blue-50/70 dark:bg-blue-950/40 border-l-4 border-l-blue-600'
                      : isUnread
                      ? 'bg-white dark:bg-slate-900 border-l-4 border-l-sky-500 font-bold'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/50 opacity-90'
                  }`}
                >
                  {/* Linha 1: Remetente e Data */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {isUnread && (
                        <span className="w-2 h-2 rounded-full bg-blue-600 shrink-0" />
                      )}
                      <span className={`text-xs truncate ${isUnread ? 'font-black text-slate-900 dark:text-white' : 'font-semibold text-slate-700 dark:text-slate-300'}`}>
                        {msg.fromName || msg.from}
                      </span>
                    </div>

                    <span className="text-[10px] text-slate-400 shrink-0 font-medium">
                      {formatRelativeTime(msg.date)}
                    </span>
                  </div>

                  {/* Linha 2: Estrela e Assunto */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => handleToggleStar(e, msg.id)}
                      className="text-slate-400 hover:text-amber-400 cursor-pointer shrink-0"
                    >
                      <Star className={`w-3.5 h-3.5 ${msg.isStarred ? 'text-amber-400 fill-amber-400' : ''}`} />
                    </button>

                    <h4 className={`text-xs truncate flex-1 ${isUnread ? 'font-black text-slate-900 dark:text-white' : 'font-medium text-slate-600 dark:text-slate-300'}`}>
                      {msg.subject}
                    </h4>

                    {msg.hasAttachments && (
                      <Paperclip className="w-3 h-3 text-slate-400 shrink-0" />
                    )}
                  </div>

                  {/* Linha 3: Prévia de 2 linhas */}
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2 leading-tight">
                    {msg.preview || msg.bodyText}
                  </p>

                  {/* Ações no Hover do Card */}
                  <div className="absolute right-2 top-2 hidden group-hover:flex items-center gap-1 bg-white dark:bg-slate-900 shadow-md border border-slate-200 dark:border-slate-700 rounded-lg p-0.5">
                    <button
                      onClick={(e) => handleToggleRead(e, msg.id, msg.isRead)}
                      className="p-1 rounded text-slate-500 hover:text-blue-600 cursor-pointer"
                      title={msg.isRead ? 'Marcar como não lida' : 'Marcar como lida'}
                    >
                      <Mail className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => handleDeleteMessage(e, msg.id)}
                      className="p-1 rounded text-slate-500 hover:text-rose-600 cursor-pointer"
                      title="Excluir mensagem"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

      </div>

      {/* ========================================================= */}
      {/* COLUNA 3: VISUALIZADOR DE MENSAGEM (LEITURA)              */}
      {/* ========================================================= */}
      <div className="flex-1 bg-slate-50/40 dark:bg-slate-950/40 flex flex-col min-w-0">
        {!selectedMessage ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-400 space-y-3">
            <div className="w-16 h-16 rounded-full bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/40 flex items-center justify-center text-blue-500">
              <Mail className="w-8 h-8" />
            </div>
            <h4 className="text-base font-bold text-slate-700 dark:text-slate-200">
              Nenhuma mensagem selecionada
            </h4>
            <p className="text-xs text-slate-500 max-w-sm">
              Selecione uma mensagem da lista ao lado para ler seu conteúdo, baixar anexos ou responder.
            </p>
          </div>
        ) : (
          <>
            {/* Barra de Ferramentas Superior */}
            <div className="p-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => handleReply(false)}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm shadow-blue-600/30"
                >
                  <Reply className="w-3.5 h-3.5" />
                  <span>Responder</span>
                </button>

                <button
                  onClick={() => handleReply(true)}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <ReplyAll className="w-3.5 h-3.5" />
                  <span>Todos</span>
                </button>

                <button
                  onClick={handleForward}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Forward className="w-3.5 h-3.5" />
                  <span>Encaminhar</span>
                </button>
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={(e) => handleToggleStar(e, selectedMessage.id)}
                  className="p-2 rounded-xl text-slate-400 hover:text-amber-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                  title="Favoritar / Marcar com estrela"
                >
                  <Star className={`w-4 h-4 ${selectedMessage.isStarred ? 'text-amber-400 fill-amber-400' : ''}`} />
                </button>

                <button
                  onClick={handlePrint}
                  className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                  title="Imprimir e-mail"
                >
                  <Printer className="w-4 h-4" />
                </button>

                <button
                  onClick={(e) => handleDeleteMessage(e, selectedMessage.id)}
                  className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors cursor-pointer"
                  title="Excluir mensagem"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Cabeçalho do E-mail */}
            <div className="p-4 sm:p-6 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3">
              <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white leading-tight">
                {selectedMessage.subject}
              </h2>

              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white flex items-center justify-center font-bold text-sm shadow-md shadow-blue-600/20 shrink-0">
                    {selectedMessage.fromName ? selectedMessage.fromName.substring(0, 2).toUpperCase() : 'TC'}
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-slate-900 dark:text-white">
                        {selectedMessage.fromName}
                      </span>
                      <span className="text-xs text-slate-400 font-mono">
                        &lt;{selectedMessage.from}&gt;
                      </span>
                    </div>

                    <div className="text-xs text-slate-500 mt-0.5">
                      Para: <strong className="text-slate-700 dark:text-slate-300">{(selectedMessage.to || []).join(', ')}</strong>
                      {selectedMessage.cc && selectedMessage.cc.length > 0 && (
                        <span className="ml-2">Cc: {selectedMessage.cc.join(', ')}</span>
                      )}
                    </div>
                  </div>
                </div>

                <span className="text-xs text-slate-400 shrink-0 font-medium">
                  {formatFullDate(selectedMessage.date)}
                </span>
              </div>
            </div>

            {/* Bloco de Anexos (se houver) */}
            {selectedMessage.attachments && selectedMessage.attachments.length > 0 && (
              <div className="p-4 bg-slate-100/70 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 space-y-2">
                <span className="text-xs font-bold text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                  <Paperclip className="w-3.5 h-3.5 text-blue-500" />
                  {selectedMessage.attachments.length} arquivo(s) anexado(s)
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {selectedMessage.attachments.map(att => (
                    <div
                      key={att.id}
                      className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex items-center justify-between gap-2 shadow-xs"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 shrink-0">
                          <FileText className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate" title={att.filename}>
                            {att.filename}
                          </p>
                          <span className="text-[10px] text-slate-400">
                            {(att.sizeBytes / 1024).toFixed(1)} KB
                          </span>
                        </div>
                      </div>

                      <button
                        onClick={() => {
                          showToast(`Iniciando download de ${att.filename}...`, 'info');
                        }}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                        title="Baixar anexo"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Corpo da Mensagem */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 text-sm text-slate-800 dark:text-slate-200 leading-relaxed font-sans">
              {selectedMessage.bodyHtml ? (
                <div 
                  dangerouslySetInnerHTML={{ __html: selectedMessage.bodyHtml }} 
                  className="prose dark:prose-invert max-w-none text-sm"
                />
              ) : (
                <div className="whitespace-pre-wrap">
                  {selectedMessage.bodyText}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Modal de Composição */}
      <ComposeEmailModal
        isOpen={isComposeOpen}
        onClose={() => setIsComposeOpen(false)}
        accounts={accounts}
        initialMode={composeMode}
        replyToMessage={targetMessageForCompose}
        onSuccess={() => setRefreshTrigger(c => c + 1)}
      />

    </div>
  );
};
