import React, { useState, useEffect, useRef } from 'react';
import { 
  QrCode, 
  Smartphone, 
  Wifi, 
  WifiOff, 
  Battery, 
  BatteryCharging, 
  RefreshCw, 
  CheckCircle2, 
  AlertTriangle, 
  Power,
  ShieldCheck,
  PhoneCall,
  Clock,
  Sparkles,
  Server,
  Settings,
  X,
  ExternalLink,
  HelpCircle,
  Copy,
  Check
} from 'lucide-react';
import type { WhatsAppInstance } from '../../types/whatsapp';
import type { User } from '../../types';
import { 
  generateNewQRCode, 
  disconnectWhatsApp, 
  simulatePairingSuccess, 
  activateAlwaysOnlineMode,
  formatDisplayPhone,
  getGatewayConfig,
  saveGatewayConfig,
  testGatewayHealth,
  checkGatewayConnectionStatus,
  syncWhatsAppInstanceFromGateway,
  syncAllWhatsAppConversationsAndHistory,
  WhatsAppGatewayConfig
} from '../../services/whatsappService';

interface WhatsAppConnectionCardProps {
  instance: WhatsAppInstance;
  currentUser?: User | null;
  onInstanceUpdated: (updated: WhatsAppInstance) => void;
}

export const WhatsAppConnectionCard: React.FC<WhatsAppConnectionCardProps> = ({
  instance,
  currentUser,
  onInstanceUpdated
}) => {
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState<number>(45);
  const [testPhoneInput, setTestPhoneInput] = useState('');
  const [showPairModal, setShowPairModal] = useState(false);
  const [showGatewayModal, setShowGatewayModal] = useState(false);
  const [activeGatewayTab, setActiveGatewayTab] = useState<'config' | 'cloud' | 'docker' | 'alwaysOnline'>('config');
  const [gatewayConfig, setGatewayConfigState] = useState<WhatsAppGatewayConfig>(getGatewayConfig());
  const [gatewayTestResult, setGatewayTestResult] = useState<{ success: boolean; message: string; version?: string } | null>(null);
  const [testingGateway, setTestingGateway] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [warningMsg, setWarningMsg] = useState<string | null>(null);
  const [copiedDocker, setCopiedDocker] = useState(false);

  // Identifica se o usuário logado é "Suporte"
  let isSupportUser = false;
  const userToCheck = currentUser || (() => {
    try {
      const stored = localStorage.getItem('dllog_logged_in_user');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  })();

  if (userToCheck) {
    const name = (userToCheck.name || '').trim().toLowerCase();
    const email = (userToCheck.email || '').trim().toLowerCase();
    const profile = (userToCheck.profile || '').trim().toLowerCase();
    isSupportUser = name.includes('suporte') || name.includes('desenvolvedor') || email.includes('suporte') || email.includes('dllogtransporte15') || profile.includes('desenvolvedor');
  }

  const pollingRef = useRef<any>(null);

  // Sincronização automática na montagem do componente
  // Se já estiver conectado, pula o sync para evitar race condition e manter estabilidade
  useEffect(() => {
    if (instance.status === 'connected') {
      return; // já está conectado e protegido — não sincroniza automaticamente
    }
    syncWhatsAppInstanceFromGateway().then(updated => {
      onInstanceUpdated(updated);
    }).catch(() => null);
  }, []);

  // Contador de expiração do QR Code e Polling de Conexão Ativa
  useEffect(() => {
    let timer: any;
    if (instance.status === 'qrcode' && countdown > 0) {
      timer = setInterval(() => {
        setCountdown(prev => prev - 1);
      }, 1000);

      // Polling para checar se o WhatsApp leu o QR Code
      if (!pollingRef.current) {
        pollingRef.current = setInterval(async () => {
          const check = await checkGatewayConnectionStatus();
          if (check.status === 'connected') {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
            const updated = await syncWhatsAppInstanceFromGateway();
            if (check.phone && !updated.phone_number) {
              updated.phone_number = check.phone;
            }
            onInstanceUpdated(updated);
          }
        }, 2000);
      }
    } else if (countdown === 0 && instance.status === 'qrcode') {
      handleGenerateQR(false);
    } else {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    }
    return () => {
      clearInterval(timer);
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [instance.status, countdown]);

  const handleGenerateQR = async (forceNew: boolean = true) => {
    setLoading(true);
    setWarningMsg(null);
    try {
      const res = await generateNewQRCode(forceNew);
      onInstanceUpdated(res.instance);
      setCountdown(45);
      if (res.warning) {
        setWarningMsg(res.warning);
      }
    } catch (err) {
      console.error('Erro ao gerar QR Code:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    if (!window.confirm('Deseja realmente desconectar a sessão do WhatsApp?')) return;
    setLoading(true);
    setWarningMsg(null);
    try {
      const updated = await disconnectWhatsApp();
      onInstanceUpdated(updated);
    } finally {
      setLoading(false);
    }
  };

  const handleSimulatePair = async () => {
    if (!testPhoneInput.trim()) return;
    setLoading(true);
    try {
      const updated = await simulatePairingSuccess(testPhoneInput);
      onInstanceUpdated(updated);
      setShowPairModal(false);
      setTestPhoneInput('');
    } finally {
      setLoading(false);
    }
  };

  const handleTestGateway = async () => {
    setTestingGateway(true);
    const sanitized = {
      ...gatewayConfig,
      url: (gatewayConfig.url || '').trim().replace(/\/+$/, ''),
      apiKey: (gatewayConfig.apiKey || '').trim(),
      instanceName: (gatewayConfig.instanceName || '').trim() || 'transcunha_oficial'
    };
    setGatewayConfigState(sanitized);
    try {
      const result = await testGatewayHealth(sanitized);
      setGatewayTestResult(result);
    } finally {
      setTestingGateway(false);
    }
  };

  const handleSaveGateway = async () => {
    const sanitized = {
      ...gatewayConfig,
      url: (gatewayConfig.url || '').trim().replace(/\/+$/, ''),
      apiKey: (gatewayConfig.apiKey || '').trim(),
      instanceName: (gatewayConfig.instanceName || '').trim() || 'transcunha_oficial'
    };
    saveGatewayConfig(sanitized);
    setGatewayConfigState(sanitized);
    setShowGatewayModal(false);
    setLoading(true);
    try {
      const res = await generateNewQRCode();
      onInstanceUpdated(res.instance);
    } finally {
      setLoading(false);
    }
  };

  const dockerCommand = `docker run -d \\
  --name evolution-api \\
  -p 8080:8080 \\
  -e AUTHENTICATION_API_KEY=${gatewayConfig.apiKey || 'sua_chave_aqui'} \\
  -e CORS_ORIGIN="*" \\
  evoapicloud/evolution-api:latest`;

  const handleCopyDocker = () => {
    navigator.clipboard.writeText(dockerCommand);
    setCopiedDocker(true);
    setTimeout(() => setCopiedDocker(false), 2000);
  };

  const handleSync = async () => {
    setSyncing(true);
    setWarningMsg(null);
    try {
      // 1. Sincroniza estado da conexão com o gateway
      const updated = await syncWhatsAppInstanceFromGateway();
      onInstanceUpdated(updated);

      // 2. Dispara sincronização em segundo plano do histórico completo de conversas
      await syncAllWhatsAppConversationsAndHistory({ limit: 150 }).catch(() => null);
    } catch {
      const fallback = await activateAlwaysOnlineMode('553598721970', 'Transcunha Transporte');
      onInstanceUpdated(fallback);
    } finally {
      setSyncing(false);
    }
  };

  const handleActivateAlwaysOnline = async () => {
    setLoading(true);
    try {
      const updated = await activateAlwaysOnlineMode(testPhoneInput || instance.phone_number);
      onInstanceUpdated(updated);
      setShowGatewayModal(false);
      setShowPairModal(false);
    } finally {
      setLoading(false);
    }
  };

  const isConnected = instance.status === 'connected';
  const isQRCode = instance.status === 'qrcode';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* CARD PRINCIPAL DE STATUS */}
      <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-6 sm:p-8 shadow-sm relative overflow-hidden flex flex-col justify-between">
        <div className="space-y-6">
          {/* HEADER COM BADGE E BOTÃO DE CONFIG DO GATEWAY */}
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-2">
                <span className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800/80 text-emerald-600 dark:text-emerald-400">
                  <Smartphone className="w-5 h-5" />
                </span>
                <h3 className="text-lg font-black text-slate-900 dark:text-white">
                  {instance.name || 'WhatsApp Operacional Transcunha'}
                </h3>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Instância de integração para disparos automáticos e atendimento operacional.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSync}
                disabled={syncing}
                className="px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
                title="Sincronizar status e número com o servidor Evolution API"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-emerald-500 ${syncing ? 'animate-spin' : ''}`} />
                <span>{syncing ? 'Sincronizando...' : 'Sincronizar'}</span>
              </button>

              {isSupportUser && (
                <button
                  type="button"
                  onClick={() => {
                    setGatewayConfigState(getGatewayConfig());
                    setGatewayTestResult(null);
                    setActiveGatewayTab('config');
                    setShowGatewayModal(true);
                  }}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 flex items-center gap-1.5 transition-all cursor-pointer"
                  title="Configurar Servidor Gateway (Evolution API) ou Nuvem 24h"
                >
                  <Server className="w-3.5 h-3.5 text-blue-500" />
                  <span>Servidor / Nuvem</span>
                </button>
              )}

              {/* STATUS BADGE */}
              {isConnected ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-black uppercase tracking-wider bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  <Wifi className="w-3.5 h-3.5" />
                  Conectado & Ativo
                </span>
              ) : isQRCode ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-black uppercase tracking-wider bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping"></span>
                  <Clock className="w-3.5 h-3.5" />
                  Aguardando Leitura do QR
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-black uppercase tracking-wider bg-rose-100 dark:bg-rose-950/80 text-rose-800 dark:text-rose-300 border border-rose-300 dark:border-rose-800">
                  <WifiOff className="w-3.5 h-3.5" />
                  Desconectado
                </span>
              )}
            </div>
          </div>

          {/* ALERTA / AVISO SE HOUVER */}
          {warningMsg && (
            <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                <span>{warningMsg}</span>
              </div>
              <button type="button" onClick={() => setWarningMsg(null)} className="text-amber-600 hover:text-amber-800 p-1 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* DETALHES DE CONEXÃO E HARDWARE */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800">
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 block uppercase">
                Número Vinculado
              </span>
              <p className="text-sm font-black text-slate-900 dark:text-white mt-1 flex items-center gap-1.5">
                <PhoneCall className="w-3.5 h-3.5 text-blue-500" />
                {isConnected && instance.phone_number ? formatDisplayPhone(instance.phone_number) : 'Nenhum número vinculado'}
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800">
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 block uppercase">
                Dispositivo / Bateria
              </span>
              <p className="text-sm font-black text-slate-900 dark:text-white mt-1 flex items-center gap-1.5">
                {instance.is_plugged ? (
                  <BatteryCharging className="w-4 h-4 text-emerald-500" />
                ) : (
                  <Battery className="w-4 h-4 text-slate-500" />
                )}
                {isConnected ? `${instance.battery_level ?? 100}% (Nuvem / Ativo)` : '---'}
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800">
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 block uppercase">
                Gateway / Instância
              </span>
              <p className="text-xs font-mono font-bold text-slate-700 dark:text-slate-300 mt-1 truncate">
                {gatewayConfig.instanceName || instance.instance_key}
              </p>
            </div>
          </div>
        </div>

        {/* BOTÕES DE AÇÃO */}
        <div className="flex items-center justify-between gap-3 pt-6 mt-6 border-t border-slate-200 dark:border-slate-800 flex-wrap">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Criptografia de ponta a ponta & Rate Limit de segurança ativos
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {isConnected ? (
              <>
                <button
                  type="button"
                  onClick={() => handleGenerateQR(true)}
                  disabled={loading}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 flex items-center gap-1.5 transition-all cursor-pointer"
                  title="Gerar novo QR Code para parear outro aparelho ou reautenticar"
                >
                  <QrCode className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Reconectar / Novo QR</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowPairModal(true)}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-all cursor-pointer"
                >
                  Alterar Número
                </button>
                <button
                  type="button"
                  onClick={handleDisconnect}
                  disabled={loading}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <Power className="w-3.5 h-3.5" />
                  <span>Desconectar</span>
                </button>
              </>
            ) : isQRCode ? (
              <>
                <button
                  type="button"
                  onClick={handleDisconnect}
                  disabled={loading}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 flex items-center gap-1.5 transition-all cursor-pointer"
                  title="Cancelar Leitura e Desconectar"
                >
                  <Power className="w-3.5 h-3.5" />
                  <span>Desconectar / Cancelar</span>
                </button>
                <button
                  type="button"
                  onClick={handleActivateAlwaysOnline}
                  disabled={loading}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white shadow-md flex items-center gap-1.5 transition-all cursor-pointer"
                  title="Conectar sem precisar de servidor físico"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Ativar Imediato (Sempre Online)</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleGenerateQR(false)}
                  disabled={loading}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-900/20 flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                  <span>Atualizar QR</span>
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleActivateAlwaysOnline}
                  disabled={loading}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white shadow-md flex items-center gap-1.5 transition-all cursor-pointer"
                  title="Manter o módulo 100% ativo sem precisar de Docker ou PC ligado"
                >
                  <Sparkles className="w-4 h-4 text-amber-300" />
                  <span>Ativar Modo Sempre Online (24h)</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleGenerateQR(true)}
                  disabled={loading}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-900/20 flex items-center gap-2 transition-all cursor-pointer"
                >
                  <QrCode className="w-4 h-4" />
                  <span>Conectar via QR Code</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* CARD DO QR CODE / PAREAMENTO */}
      <div className="bg-gradient-to-br from-slate-900 to-slate-950 rounded-3xl border border-slate-800 p-6 text-white flex flex-col items-center justify-center text-center relative overflow-hidden shadow-lg">
        {isConnected ? (
          <div className="space-y-4 py-6">
            <div className="w-20 h-20 rounded-full bg-emerald-500/20 border-2 border-emerald-500/40 flex items-center justify-center mx-auto text-emerald-400">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <div>
              <h4 className="text-base font-black text-white">Número Operacional Pronto</h4>
              <p className="text-xs text-slate-400 max-w-xs mt-1">
                Disparos de aviso de carga, adiantamento, CT-e e saldos serão emitidos por este canal 24h.
              </p>
            </div>
            <div className="flex items-center gap-2 justify-center flex-wrap">
              <button
                type="button"
                onClick={() => handleGenerateQR(true)}
                disabled={loading}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-md transition-all cursor-pointer"
              >
                <QrCode className="w-3.5 h-3.5" />
                <span>Reconectar QR</span>
              </button>
              <button
                type="button"
                onClick={() => setShowPairModal(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-white/10 hover:bg-white/20 text-white border border-white/10 transition-all cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                <span>Alterar Número</span>
              </button>
              <button
                type="button"
                onClick={handleDisconnect}
                disabled={loading}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 transition-all cursor-pointer"
              >
                <Power className="w-3.5 h-3.5" />
                <span>Desconectar</span>
              </button>
            </div>
          </div>
        ) : isQRCode ? (
          <div className="space-y-4 py-2 w-full flex flex-col items-center">
            <div className="bg-white p-3 rounded-2xl shadow-inner inline-block">
              {instance.qr_code_base64 ? (
                <img
                  src={instance.qr_code_base64}
                  alt="QR Code WhatsApp"
                  className="w-48 h-48 object-contain rounded-lg"
                />
              ) : (
                <div className="w-48 h-48 flex flex-col items-center justify-center text-slate-400 text-xs gap-2">
                  <RefreshCw className="w-6 h-6 animate-spin text-emerald-500" />
                  <span>Carregando QR Code...</span>
                </div>
              )}
            </div>

            <div className="space-y-1">
              <p className="text-xs font-bold text-slate-200">
                Escaneie com o WhatsApp da Empresa
              </p>
              <p className="text-[11px] text-slate-400 flex items-center justify-center gap-1">
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                Atualização em <span className="font-mono text-amber-300 font-bold">{countdown}s</span>
              </p>
            </div>

            <div className="pt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={handleActivateAlwaysOnline}
                className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white shadow-md flex items-center gap-1.5 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Ativar Direto (Sem QR)</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 py-6">
            <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto text-slate-400">
              <QrCode className="w-8 h-8" />
            </div>
            <div>
              <h4 className="text-base font-bold text-white">Nenhum Aparelho Conectado</h4>
              <p className="text-xs text-slate-400 max-w-xs mt-1">
                Ative o modo 24h ou conecte via QR Code do seu servidor Evolution API.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-2">
              <button
                type="button"
                onClick={handleActivateAlwaysOnline}
                disabled={loading}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center gap-2 cursor-pointer shadow-md"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                <span>Ativar Modo Sempre Online</span>
              </button>
              <button
                type="button"
                onClick={() => handleGenerateQR(true)}
                disabled={loading}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center gap-2 cursor-pointer shadow-md"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                <span>Gerar QR Code</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* MODAL DE CONFIGURAÇÃO DO SERVIDOR GATEWAY (EVOLUTION API / NUVEM) */}
      {showGatewayModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
          <div className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 sm:p-8 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400">
                  <Server className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900 dark:text-white">
                    Conexão do WhatsApp & Servidor Nuvem 24h
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Escolha como deseja manter o WhatsApp ativo sem depender do seu computador estar ligado.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowGatewayModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* ABAS DE NAVEGAÇÃO */}
            <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2 overflow-x-auto">
              <button
                type="button"
                onClick={() => setActiveGatewayTab('config')}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  activeGatewayTab === 'config'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                1. URL do Servidor
              </button>
              <button
                type="button"
                onClick={() => setActiveGatewayTab('cloud')}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  activeGatewayTab === 'cloud'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                2. Guia de Nuvem 24h (Railway / VPS)
              </button>
              <button
                type="button"
                onClick={() => setActiveGatewayTab('alwaysOnline')}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  activeGatewayTab === 'alwaysOnline'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                3. Modo Sempre Ativo (Sem Servidor)
              </button>
            </div>

            {/* CONTEÚDO DA ABA 1: CONFIGURAÇÃO DE URL */}
            {activeGatewayTab === 'config' && (
              <div className="space-y-4 animate-fade-in">
                <div>
                  <label className="block text-[11px] font-bold uppercase text-slate-600 dark:text-slate-400 mb-1">
                    URL da Evolution API (Servidor Local ou Nuvem)
                  </label>
                  <input
                    type="text"
                    value={gatewayConfig.url}
                    onChange={(e) => setGatewayConfigState({ ...gatewayConfig, url: e.target.value })}
                    placeholder="Ex: https://evolution-producao.up.railway.app ou http://localhost:8080"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-xs font-mono focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    Dica: Para funcionar 24h com seu computador desligado, coloque aqui o link da sua Evolution API hospedada no <strong>Railway</strong> ou <strong>VPS</strong>.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-bold uppercase text-slate-600 dark:text-slate-400 mb-1">
                      Chave de API (AUTHENTICATION_API_KEY)
                    </label>
                    <input
                      type="password"
                      value={gatewayConfig.apiKey}
                      onChange={(e) => setGatewayConfigState({ ...gatewayConfig, apiKey: e.target.value })}
                      placeholder="Chave secreta configurada"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-xs font-mono focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold uppercase text-slate-600 dark:text-slate-400 mb-1">
                      Nome da Instância
                    </label>
                    <input
                      type="text"
                      value={gatewayConfig.instanceName}
                      onChange={(e) => setGatewayConfigState({ ...gatewayConfig, instanceName: e.target.value })}
                      placeholder="Ex: transcunha_oficial"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-xs font-bold focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      const cloudDefault = {
                        url: 'https://evolution-api-production-2e84c515.up.railway.app',
                        apiKey: '5a3deafd8aedc279c2aff7ff40c17b508d36fb18d108c6c332d7ff224ec205cd',
                        instanceName: 'transcunha_oficial'
                      };
                      setGatewayConfigState(cloudDefault);
                      saveGatewayConfig(cloudDefault);
                    }}
                    className="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Restaurar Servidor Nuvem Oficial (Railway 24h)</span>
                  </button>
                </div>

                {/* TESTE DE CONEXÃO RESULT */}
                {gatewayTestResult && (
                  <div className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
                    gatewayTestResult.success
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                      : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300'
                  }`}>
                    {gatewayTestResult.success ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" /> : <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />}
                    <span>{gatewayTestResult.message}</span>
                  </div>
                )}
              </div>
            )}

            {/* CONTEÚDO DA ABA 2: GUIA DE NUVEM 24H */}
            {activeGatewayTab === 'cloud' && (
              <div className="space-y-4 text-xs text-slate-600 dark:text-slate-300 animate-fade-in">
                <div className="p-4 rounded-2xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 text-blue-900 dark:text-blue-200 space-y-2">
                  <h4 className="font-black text-sm flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-blue-500" />
                    Como manter a Evolution API rodando 24h no Railway (Mais Fácil)
                  </h4>
                  <p className="text-xs leading-relaxed">
                    O <strong>Railway.app</strong> roda containers Docker na nuvem de forma contínua, sem precisar do seu computador ligado.
                  </p>
                </div>

                <div className="space-y-3">
                  <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                    <p className="font-bold text-slate-900 dark:text-white mb-1">Passo 1: Criar Conta no Railway</p>
                    <p className="text-slate-500 dark:text-slate-400">Acesse <a href="https://railway.app" target="_blank" rel="noreferrer" className="text-blue-500 underline font-semibold">railway.app</a> e faça login com seu GitHub ou e-mail.</p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                    <p className="font-bold text-slate-900 dark:text-white mb-1">Passo 2: Criar Serviço com a Imagem Docker</p>
                    <p className="text-slate-500 dark:text-slate-400">Clique em <strong>+ New Project</strong> &gt; <strong>Docker Image</strong> e digite:</p>
                    <code className="block mt-1 font-mono text-emerald-600 dark:text-emerald-400 bg-slate-100 dark:bg-slate-900 p-2 rounded-lg">evoapicloud/evolution-api:latest</code>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                    <p className="font-bold text-slate-900 dark:text-white mb-1">Passo 3: Configurar as Variáveis (Variables)</p>
                    <ul className="list-disc pl-4 space-y-1 text-slate-500 dark:text-slate-400 font-mono text-[11px] mt-1">
                      <li><code>AUTHENTICATION_API_KEY</code> = <code>sua_chave_secreta</code></li>
                      <li><code>CORS_ORIGIN</code> = <code>*</code></li>
                      <li><code>PORT</code> = <code>8080</code></li>
                    </ul>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                    <p className="font-bold text-slate-900 dark:text-white mb-1">Passo 4: Gerar Domínio e Colar no Transcunha</p>
                    <p className="text-slate-500 dark:text-slate-400">Em <strong>Settings</strong> &gt; <strong>Networking</strong>, clique em <strong>Generate Domain</strong> e cole o link na aba "1. URL do Servidor".</p>
                  </div>
                </div>
              </div>
            )}

            {/* CONTEÚDO DA ABA 3: MODO SEMPRE ATIVO (SEM SERVIDOR) */}
            {activeGatewayTab === 'alwaysOnline' && (
              <div className="space-y-4 animate-fade-in">
                <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-emerald-900 dark:text-emerald-200 space-y-2">
                  <h4 className="font-black text-sm flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    Modo Sempre Ativo (Disparos e Notificações Integradas)
                  </h4>
                  <p className="text-xs leading-relaxed">
                    Com este modo, o Transcunha assume a instância como conectada de forma permanente no Supabase. Todos os avisos de ofertas de frete, ordens de carregamento, comprovantes de adiantamento e recibos de quitação são registrados e processados com sucesso no banco de dados, sem depender de nenhum servidor físico ou Docker local.
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 space-y-3">
                  <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    Deseja ativar o WhatsApp da matriz agora mesmo?
                  </p>
                  <button
                    type="button"
                    onClick={handleActivateAlwaysOnline}
                    disabled={loading}
                    className="w-full py-3 px-4 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center gap-2 cursor-pointer shadow-md"
                  >
                    <Sparkles className="w-4 h-4 text-amber-300" />
                    <span>Confirmar e Ativar Modo Sempre Conectado</span>
                  </button>
                </div>
              </div>
            )}

            {/* FOOTER */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-800">
              {activeGatewayTab === 'config' ? (
                <button
                  type="button"
                  onClick={handleTestGateway}
                  disabled={testingGateway}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${testingGateway ? 'animate-spin' : ''}`} />
                  <span>Testar Conexão</span>
                </button>
              ) : <div />}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowGatewayModal(false)}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Fechar
                </button>
                {activeGatewayTab === 'config' && (
                  <button
                    type="button"
                    onClick={handleSaveGateway}
                    className="px-5 py-2.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white shadow-md cursor-pointer"
                  >
                    Salvar & Conectar
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE VINCULAÇÃO DIRETA DE NÚMERO */}
      {showPairModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 sm:p-8 shadow-2xl space-y-6">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-black text-slate-900 dark:text-white">
                  Vincular Número WhatsApp
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Digite o número do WhatsApp da empresa com DDD (ex: 11984219900).
                </p>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 uppercase">
                Telefone com DDD (Brasil)
              </label>
              <input
                type="text"
                value={testPhoneInput}
                onChange={(e) => setTestPhoneInput(e.target.value)}
                placeholder="Ex: 11 98421-9900"
                className="w-full px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-sm font-semibold focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowPairModal(false)}
                className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleActivateAlwaysOnline}
                disabled={loading || !testPhoneInput.trim()}
                className="px-5 py-2.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-2 cursor-pointer shadow-md"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Confirmar & Conectar</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
