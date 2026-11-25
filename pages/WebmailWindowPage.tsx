import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Mail, RefreshCw, ArrowLeft, Wifi, X } from 'lucide-react';
import type { User, CorporateEmailAccount } from '../types';
import { isDeveloperUser, filterVisibleUsers } from '../auth';
import { corporateEmailService } from '../services/corporateEmailService';
import { WebmailOutlookView } from '../components/corporate-email/WebmailOutlookView';

interface WebmailWindowPageProps {
  currentUser: User;
  users: User[];
}

export const WebmailWindowPage: React.FC<WebmailWindowPageProps> = ({ currentUser, users }) => {
  const [accounts, setAccounts] = useState<CorporateEmailAccount[]>([]);
  const [lastSyncAt, setLastSyncAt] = useState<string>(() => new Date().toLocaleTimeString('pt-BR'));
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  const visibleUsersForEmail = useMemo(() => filterVisibleUsers(users, currentUser), [users, currentUser]);

  const loadAccounts = useCallback(() => {
    const rawAccs = corporateEmailService.getEmailAccounts(visibleUsersForEmail);
    const filtered = isDeveloperUser(currentUser)
      ? rawAccs
      : rawAccs.filter(
          a =>
            a.userId !== 'USR-001' &&
            a.userId !== 'USR-292' &&
            a.email.toLowerCase() !== 'dllogtransporte15@gmail.com' &&
            a.email.toLowerCase() !== 'demo@demo.com'
        );
    setAccounts(filtered);
  }, [visibleUsersForEmail, currentUser]);

  useEffect(() => {
    const prevTitle = document.title;
    document.title = 'Transcunha Webmail — Caixa Corporativa';
    return () => {
      document.title = prevTitle;
    };
  }, []);

  useEffect(() => {
    loadAccounts();

    const handleAccountsUpdate = () => {
      loadAccounts();
      setLastSyncAt(new Date().toLocaleTimeString('pt-BR'));
    };

    const handleMessagesUpdate = () => {
      setLastSyncAt(new Date().toLocaleTimeString('pt-BR'));
    };

    window.addEventListener('corporate_emails_updated', handleAccountsUpdate);
    window.addEventListener('corporate_messages_updated', handleMessagesUpdate);
    window.addEventListener('transcunha:new_corporate_email', handleMessagesUpdate);

    const unsubscribeRealtime = corporateEmailService.subscribeToRealtime(() => {
      loadAccounts();
      setLastSyncAt(new Date().toLocaleTimeString('pt-BR'));
    });

    return () => {
      window.removeEventListener('corporate_emails_updated', handleAccountsUpdate);
      window.removeEventListener('corporate_messages_updated', handleMessagesUpdate);
      window.removeEventListener('transcunha:new_corporate_email', handleMessagesUpdate);
      unsubscribeRealtime();
    };
  }, [loadAccounts]);

  const handleManualSync = async () => {
    setIsSyncing(true);
    try {
      await Promise.all([
        corporateEmailService.syncFromCloud(),
        corporateEmailService.syncFromGmailImap({ folder: 'inbox' }),
      ]);
      loadAccounts();
      setLastSyncAt(new Date().toLocaleTimeString('pt-BR'));
    } finally {
      setIsSyncing(false);
    }
  };

  const hasOpener = typeof window !== 'undefined' && !!window.opener && !window.opener.closed;

  return (
    <div className="h-screen w-screen flex flex-col bg-slate-950 text-slate-100 overflow-hidden">
      {/* Barra Superior do Aplicativo Webmail Independente */}
      <header className="h-12 px-4 bg-slate-900/95 border-b border-slate-800 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shadow-md shadow-blue-600/30 shrink-0">
            <Mail className="w-4 h-4 text-white" />
          </div>
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm font-black tracking-tight text-white truncate">
              Transcunha Webmail
            </span>
            <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/15 text-blue-300 border border-blue-500/30">
              JANELA EXTERNA INDEPENDENTE
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Status de Sincronização em Tempo Real */}
          <div
            className="hidden md:flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-[11px] font-semibold text-emerald-300"
            title="Sincronizado em tempo real com o sistema principal e nuvem"
          >
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <Wifi className="w-3.5 h-3.5 text-emerald-400" />
            <span>Tempo Real • {lastSyncAt}</span>
          </div>

          <button
            onClick={handleManualSync}
            disabled={isSyncing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 transition-colors cursor-pointer disabled:opacity-60"
            title="Forçar sincronização agora"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-blue-400' : ''}`} />
            <span className="hidden sm:inline">Sincronizar</span>
          </button>

          {hasOpener ? (
            <button
              onClick={() => {
                try {
                  window.opener.focus();
                } catch {}
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/40 text-xs font-bold text-blue-200 transition-colors cursor-pointer"
              title="Focar a janela principal do sistema Transcunha"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Ir para o Sistema</span>
            </button>
          ) : (
            <a
              href="/corporate-email"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/40 text-xs font-bold text-blue-200 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Voltar ao Sistema</span>
            </a>
          )}

          {hasOpener && (
            <button
              onClick={() => window.close()}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-rose-600/20 border border-transparent hover:border-rose-500/40 transition-colors cursor-pointer"
              title="Fechar janela do Webmail"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </header>

      {/* Caixa de E-mail em Tela Cheia */}
      <div className="flex-1 min-h-0 flex">
        <WebmailOutlookView accounts={accounts} isStandalone={true} />
      </div>
    </div>
  );
};

export default WebmailWindowPage;
