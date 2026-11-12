import React, { useState, useEffect, useMemo } from 'react';
import type { Shipment, Cargo, Client, Driver, User } from '../types';
import { 
  Send, 
  Smartphone, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  FileText, 
  QrCode, 
  KeyRound, 
  LogOut, 
  RefreshCw, 
  Sparkles, 
  Search, 
  Copy, 
  Check, 
  MessageSquare,
  ShieldCheck,
  TrendingUp,
  UserCheck,
  Settings,
  Server,
  XCircle,
  ExternalLink,
  X,
  Radio,
  BookOpen,
  RotateCcw
} from 'lucide-react';
import { 
  getWhatsAppInstance, 
  generateNewQRCode, 
  requestPairingCode, 
  disconnectWhatsAppInstance,
  enqueueWhatsAppMessage,
  getWhatsAppQueue,
  getWhatsAppTemplates,
  sanitizePhoneNumber,
  formatDisplayPhone,
  subscribeToWhatsAppRealtime,
  getGatewayConfig,
  saveGatewayConfig,
  testGatewayHealth,
  type WhatsAppGatewayConfig,
  CLOUD_GATEWAY_DEFAULT
} from '../services/whatsappService';
import type { WhatsAppInstance, WhatsAppQueueItem, WhatsAppTemplate } from '../types/whatsapp';
import { useToast } from '../hooks/useToast';

interface MessengerPageProps {
  shipments: Shipment[];
  cargos: Cargo[];
  clients: Client[];
  drivers: Driver[];
  users: User[];
  currentUser: User | null;
}

const OFFICIAL_PHONE_NUMBER = '553598721970';
const OFFICIAL_PHONE_DISPLAY = '(35) 9872-1970';

export const MessengerPage: React.FC<MessengerPageProps> = ({
  shipments,
  cargos,
  clients,
  drivers,
  users: _users,
  currentUser: _currentUser
}) => {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<'send' | 'connection' | 'history' | 'templates'>('send');

  // Instance & Connection State
  const [instance, setInstance] = useState<WhatsAppInstance | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [qrCodeData, setQrCodeData] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [isGeneratingPairing, setIsGeneratingPairing] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  // Queue & Templates
  const [queue, setQueue] = useState<WhatsAppQueueItem[]>([]);
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);

  // Send Message State
  const [recipientType, setRecipientType] = useState<'driver' | 'client' | 'manual'>('driver');
  const [selectedDriverId, setSelectedDriverId] = useState<string>('');
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [manualPhone, setManualPhone] = useState<string>('');
  const [recipientName, setRecipientName] = useState<string>('');
  const [selectedShipmentId, setSelectedShipmentId] = useState<string>('');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [messageBody, setMessageBody] = useState<string>('');
  const [isSending, setIsSending] = useState(false);
  const [searchTermHistory, setSearchTermHistory] = useState<string>('');

  // Gateway Server Config & Status
  const [gatewayConfig, setGatewayConfig] = useState<WhatsAppGatewayConfig>(getGatewayConfig());
  const [isGatewayModalOpen, setIsGatewayModalOpen] = useState(false);
  const [isGatewayOnline, setIsGatewayOnline] = useState<boolean | null>(null);
  const [gatewayVersion, setGatewayVersion] = useState<string | null>(null);
  const [isTestingGateway, setIsTestingGateway] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; version?: string } | null>(null);
  const [gatewayTab, setGatewayTab] = useState<'config' | 'guide' | 'webhook'>('config');

  // Load Initial Data
  const loadData = async () => {
    try {
      setIsRefreshing(true);
      const [inst, q, tpls, health] = await Promise.all([
        getWhatsAppInstance(),
        getWhatsAppQueue(),
        getWhatsAppTemplates(),
        testGatewayHealth().catch(() => ({ success: false, message: 'Servidor Gateway offline ou inacessível', version: undefined }))
      ]);
      setInstance(inst);
      setQueue(q);
      setTemplates(tpls);
      setIsGatewayOnline(health.success);
      if ('version' in health && health.version) setGatewayVersion(health.version);

      if (inst.qr_code_base64) {
        setQrCodeData(inst.qr_code_base64);
      }

      // Se a linha não estiver conectada e o gateway responder, busca imediatamente o QR Code mais recente
      if (inst.status !== 'connected' && health.success) {
        generateNewQRCode(false).then(res => {
          if (res.qrCode) {
            setQrCodeData(res.qrCode);
            setInstance(res.instance);
          }
        }).catch(err => {
          console.warn('[MessengerPage] Erro ao sincronizar QR Code inicial:', err);
        });
      }
    } catch (err) {
      console.warn('Erro ao carregar dados do WhatsApp:', err);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
    const unsubscribe = subscribeToWhatsAppRealtime((event, payload) => {
      if (event === 'instance_status_changed' && payload.instance) {
        setInstance(payload.instance);
      }
      if (event === 'message_sent' || event === 'message_queued') {
        getWhatsAppQueue().then(setQueue);
      }
    });
    return () => unsubscribe();
  }, []);

  // Handle Gateway Test & Save
  const handleTestGateway = async () => {
    setIsTestingGateway(true);
    setTestResult(null);
    try {
      const res = await testGatewayHealth(gatewayConfig);
      setTestResult(res);
      if (res.success) {
        setIsGatewayOnline(true);
        if (res.version) setGatewayVersion(res.version);
        showToast('Gateway Evolution API online e respondendo perfeitamente!', 'success');
      } else {
        setIsGatewayOnline(false);
        showToast(res.message || 'Falha ao conectar no servidor Gateway.', 'error');
      }
    } catch (err: any) {
      setTestResult({ success: false, message: err.message || 'Falha na conexão com o servidor' });
      setIsGatewayOnline(false);
      showToast('Erro ao testar gateway.', 'error');
    } finally {
      setIsTestingGateway(false);
    }
  };

  const handleSaveGateway = async () => {
    const sanitized: WhatsAppGatewayConfig = {
      url: (gatewayConfig.url || '').trim().replace(/\/+$/, ''),
      apiKey: (gatewayConfig.apiKey || '').trim(),
      instanceName: (gatewayConfig.instanceName || '').trim() || 'transcunha_oficial'
    };
    saveGatewayConfig(sanitized);
    setGatewayConfig(sanitized);
    setIsGatewayModalOpen(false);
    showToast('Configurações do Gateway salvas com sucesso!', 'success');
    await loadData();
  };

  // Handle Pairing Code Generation
  const handleGeneratePairingCode = async () => {
    setIsGeneratingPairing(true);
    try {
      const res = await requestPairingCode(OFFICIAL_PHONE_NUMBER);
      if (res.success && res.code) {
        setPairingCode(res.code);
        showToast('Código de pareamento gerado com sucesso!', 'success');
      } else {
        showToast(res.message || 'Não foi possível gerar o código. Verifique se o Gateway está online.', 'error');
      }
    } catch (err: any) {
      showToast('Erro ao solicitar código de pareamento.', 'error');
    } finally {
      setIsGeneratingPairing(false);
    }
  };

  const handleGenerateQr = async () => {
    setIsRefreshing(true);
    try {
      const res = await generateNewQRCode(true);
      if (res.qrCode) {
        setQrCodeData(res.qrCode);
        setInstance(res.instance);
        showToast('QR Code atualizado com sucesso! Aponte o WhatsApp.', 'success');
      } else if (res.instance?.status === 'connected') {
        setInstance(res.instance);
        showToast('A linha já está conectada e operante!', 'success');
      } else {
        showToast(res.warning || 'Não foi possível gerar o QR Code. Tente novamente.', 'warning');
      }
    } catch (err) {
      showToast('Erro ao gerar QR Code.', 'error');
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleDisconnect = async () => {
    if (!window.confirm('Deseja realmente desconectar o número de WhatsApp oficial?')) return;
    try {
      await disconnectWhatsAppInstance();
      setPairingCode(null);
      setQrCodeData(null);
      await loadData();
      showToast('Instância desconectada.', 'info');
    } catch (err) {
      showToast('Erro ao desconectar instância.', 'error');
    }
  };

  const handleCopyCode = () => {
    if (!pairingCode) return;
    navigator.clipboard.writeText(pairingCode.replace(/-/g, ''));
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2500);
    showToast('Código copiado para a área de transferência!', 'success');
  };

  // Recipient Auto-Fill
  useEffect(() => {
    if (recipientType === 'driver' && selectedDriverId) {
      const d = drivers.find(drv => drv.id === selectedDriverId);
      if (d) {
        setManualPhone(d.phone || '');
        setRecipientName(d.name || '');
      }
    } else if (recipientType === 'client' && selectedClientId) {
      const c = clients.find(cl => cl.id === selectedClientId);
      if (c) {
        setManualPhone(c.phone || '');
        setRecipientName(c.razaoSocial || c.nomeFantasia || '');
      }
    }
  }, [recipientType, selectedDriverId, selectedClientId, drivers, clients]);

  // Apply Template with Variables
  const handleSelectTemplate = (templateId: string) => {
    setSelectedTemplateId(templateId);
    const tpl = templates.find(t => t.id === templateId);
    if (!tpl) return;

    let text = tpl.body_text;
    const targetShipment = shipments.find(s => s.id === selectedShipmentId);
    const targetCargo = cargos.find(c => c.id === targetShipment?.cargoId);

    // Substituições automáticas
    text = text.replace(/{{motorista_nome}}/g, recipientName || 'Motorista');
    text = text.replace(/{{numero_carga}}/g, targetShipment?.id || 'TC-CARGA');
    text = text.replace(/{{origem}}/g, targetCargo?.origin || 'Origem');
    text = text.replace(/{{destino}}/g, targetCargo?.destination || 'Destino');
    text = text.replace(/{{mercadoria}}/g, targetCargo?.type || 'Carga Geral');
    text = text.replace(/{{peso}}/g, targetShipment?.shipmentTonnage ? `${targetShipment.shipmentTonnage} Ton` : '32 Ton');
    text = text.replace(/{{valor_frete}}/g, targetShipment?.driverFreightValue ? targetShipment.driverFreightValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : 'A Combinar');
    text = text.replace(/{{valor_adiantamento}}/g, targetShipment?.advanceValue ? targetShipment.advanceValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '1.500,00');

    setMessageBody(text);
  };

  // Dispatch Message via Official Gateway
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanNumber = sanitizePhoneNumber(manualPhone);

    if (!cleanNumber || cleanNumber.length < 10) {
      showToast('Por favor, informe um número de WhatsApp válido.', 'warning');
      return;
    }

    if (!messageBody.trim()) {
      showToast('O texto da mensagem não pode ficar vazio.', 'warning');
      return;
    }

    setIsSending(true);
    try {
      await enqueueWhatsAppMessage({
        recipientPhone: cleanNumber,
        recipientName: recipientName || undefined,
        shipmentId: selectedShipmentId || undefined,
        templateId: selectedTemplateId || undefined,
        renderedBody: messageBody,
        messageType: 'text'
      });

      showToast(`Mensagem enviada com sucesso para ${formatDisplayPhone(cleanNumber)} via (35) 9872-1970!`, 'success');
      setMessageBody('');
      setSelectedTemplateId('');
      await loadData();
    } catch (err: any) {
      showToast(err.message || 'Erro ao disparar mensagem.', 'error');
    } finally {
      setIsSending(false);
    }
  };

  // Connection State Indicators
  const isConnected = instance?.status === 'connected';

  const filteredHistory = useMemo(() => {
    return queue.filter(q => {
      const matchSearch = 
        q.recipient_phone.includes(searchTermHistory) ||
        (q.recipient_name && q.recipient_name.toLowerCase().includes(searchTermHistory.toLowerCase())) ||
        q.rendered_body.toLowerCase().includes(searchTermHistory.toLowerCase());
      return matchSearch;
    });
  }, [queue, searchTermHistory]);

  return (
    <div className="space-y-6">
      {/* Top Banner do Mensageiro Oficial */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-950 via-slate-900 to-slate-950 border border-emerald-500/20 p-6 sm:p-8 shadow-2xl text-white">
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="p-3.5 bg-gradient-to-tr from-emerald-600 to-teal-500 rounded-2xl shadow-lg shadow-emerald-600/30">
              <Send className="w-8 h-8 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
                  Mensageiro Transcunha
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  OFICIAL
                </span>
              </div>
              <p className="text-sm text-slate-300 mt-1 flex items-center gap-2">
                <span>Linha Corporativa:</span>
                <span className="font-extrabold text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded-lg border border-emerald-500/30 text-sm">
                  {OFFICIAL_PHONE_DISPLAY}
                </span>
              </p>
            </div>
          </div>

          {/* Status da Conexão da Linha & Gateway Evolution */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Status do Gateway Evolution API */}
            <button
              type="button"
              onClick={() => setIsGatewayModalOpen(true)}
              className="flex items-center gap-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl p-2.5 sm:p-3 backdrop-blur-md transition cursor-pointer text-left group"
              title="Clique para configurar o servidor Evolution API (URL, Chave de API e Instância)"
            >
              <div className="p-2 rounded-xl bg-slate-800/80 text-slate-300 group-hover:text-white transition">
                <Server className="w-4 h-4" />
              </div>
              <div className="pr-1">
                <span className="text-[10px] font-semibold text-slate-400 block uppercase tracking-wider">Gateway Evolution</span>
                <div className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${
                    isGatewayOnline === true 
                      ? 'bg-emerald-400 shadow-sm shadow-emerald-400/50' 
                      : isGatewayOnline === false 
                        ? 'bg-rose-400 shadow-sm shadow-rose-400/50' 
                        : 'bg-amber-400'
                  }`} />
                  <span className={`text-xs font-black ${
                    isGatewayOnline === true ? 'text-emerald-400' : isGatewayOnline === false ? 'text-rose-400' : 'text-amber-400'
                  }`}>
                    {isGatewayOnline === true ? (gatewayVersion ? `Online (${gatewayVersion})` : 'Online 24h') : isGatewayOnline === false ? 'Inacessível' : 'Verificando...'}
                  </span>
                </div>
              </div>
              <Settings className="w-4 h-4 text-slate-400 group-hover:text-white group-hover:rotate-45 transition ml-1" />
            </button>

            {/* Status da Conexão da Linha */}
            <div className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-2xl p-3.5 backdrop-blur-md">
              <div className="flex items-center gap-3">
                <span className="relative flex h-3.5 w-3.5">
                  {isConnected ? (
                    <>
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500"></span>
                    </>
                  ) : (
                    <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-rose-500"></span>
                  )}
                </span>
                <div>
                  <span className="text-[11px] font-semibold text-slate-400 block uppercase tracking-wider">Status da Linha</span>
                  <span className={`text-sm font-black ${isConnected ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {isConnected ? 'Conectado & Operante' : 'Aguardando Pareamento'}
                  </span>
                </div>
              </div>

              <div className="h-8 w-px bg-white/10 mx-2" />

              <button
                onClick={loadData}
                disabled={isRefreshing}
                title="Sincronizar status com o servidor"
                className="p-2 hover:bg-white/10 rounded-xl transition text-slate-300 hover:text-white cursor-pointer"
              >
                <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-emerald-400' : ''}`} />
              </button>
            </div>
          </div>
        </div>

        {/* Abas Superiores */}
        <div className="mt-8 pt-5 border-t border-slate-700/60 flex items-center gap-2 overflow-x-auto scrollbar-none">
          <button
            onClick={() => setActiveTab('send')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all duration-200 whitespace-nowrap ${
              activeTab === 'send'
                ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/40 scale-[1.02]'
                : 'bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white'
            }`}
          >
            <Send className="w-4 h-4" />
            <span>Disparo Rápido / Operacional</span>
          </button>

          <button
            onClick={() => setActiveTab('connection')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all duration-200 whitespace-nowrap ${
              activeTab === 'connection'
                ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/40 scale-[1.02]'
                : 'bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white'
            }`}
          >
            <Smartphone className="w-4 h-4" />
            <span>Conexão da Linha (35 9872-1970)</span>
            {!isConnected && (
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
            )}
          </button>

          <button
            onClick={() => setActiveTab('history')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all duration-200 whitespace-nowrap ${
              activeTab === 'history'
                ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/40 scale-[1.02]'
                : 'bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>Histórico de Envios ({queue.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('templates')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all duration-200 whitespace-nowrap ${
              activeTab === 'templates'
                ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/40 scale-[1.02]'
                : 'bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Modelos (Templates)</span>
          </button>
        </div>
      </div>

      {/* Conteúdo da Aba 1: Disparo Operacional */}
      {activeTab === 'send' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Formulário de Envio */}
          <div className="lg:col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-7 shadow-sm space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Send className="w-5 h-5 text-emerald-600" />
                  Novo Disparo Operacional
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  A mensagem será enviada em nome da Transcunha via WhatsApp oficial.
                </p>
              </div>

              <div className="flex items-center p-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setRecipientType('driver')}
                  className={`px-3 py-1.5 rounded-lg transition ${recipientType === 'driver' ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-sm' : 'text-slate-500'}`}
                >
                  Motorista
                </button>
                <button
                  type="button"
                  onClick={() => setRecipientType('client')}
                  className={`px-3 py-1.5 rounded-lg transition ${recipientType === 'client' ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-sm' : 'text-slate-500'}`}
                >
                  Cliente
                </button>
                <button
                  type="button"
                  onClick={() => setRecipientType('manual')}
                  className={`px-3 py-1.5 rounded-lg transition ${recipientType === 'manual' ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-sm' : 'text-slate-500'}`}
                >
                  Manual
                </button>
              </div>
            </div>

            <form onSubmit={handleSendMessage} className="space-y-4">
              {/* Seleção do Destinatário */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {recipientType === 'driver' && (
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                      Selecionar Motorista
                    </label>
                    <select
                      value={selectedDriverId}
                      onChange={(e) => setSelectedDriverId(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-medium focus:ring-2 focus:ring-emerald-500"
                    >
                      <option value="">Selecione o motorista cadastrado...</option>
                      {drivers.map(d => (
                        <option key={d.id} value={d.id}>{d.name} {d.phone ? `(${d.phone})` : ''}</option>
                      ))}
                    </select>
                  </div>
                )}

                {recipientType === 'client' && (
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                      Selecionar Cliente / Embarcador
                    </label>
                    <select
                      value={selectedClientId}
                      onChange={(e) => setSelectedClientId(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-medium focus:ring-2 focus:ring-emerald-500"
                    >
                      <option value="">Selecione o cliente cadastrado...</option>
                      {clients.map(c => (
                        <option key={c.id} value={c.id}>{c.razaoSocial || c.nomeFantasia} {c.phone ? `(${c.phone})` : ''}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                    Número do WhatsApp (com DDD)
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="(35) 99999-9999"
                    value={manualPhone}
                    onChange={(e) => setManualPhone(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-medium focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                    Vincular a um Embarque (Opcional)
                  </label>
                  <select
                    value={selectedShipmentId}
                    onChange={(e) => setSelectedShipmentId(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-medium focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="">Nenhum embarque vinculado</option>
                    {shipments.slice(0, 25).map(s => (
                      <option key={s.id} value={s.id}>
                        {s.id} - {s.driverName || 'Motorista'} ({s.horsePlate || 'Sem Placa'})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Botões Rápidos de Modelos */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1.5">
                  Carregar Modelo Rápido
                </label>
                <div className="flex flex-wrap gap-2">
                  {templates.slice(0, 5).map(tpl => (
                    <button
                      key={tpl.id}
                      type="button"
                      onClick={() => handleSelectTemplate(tpl.id)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition ${
                        selectedTemplateId === tpl.id
                          ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-500 text-emerald-600 dark:text-emerald-400'
                          : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-slate-400'
                      }`}
                    >
                      {tpl.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Texto da Mensagem */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  Texto da Mensagem
                </label>
                <textarea
                  required
                  rows={7}
                  placeholder="Digite aqui a mensagem que será enviada pelo WhatsApp..."
                  value={messageBody}
                  onChange={(e) => setMessageBody(e.target.value)}
                  className="w-full px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-medium focus:ring-2 focus:ring-emerald-500 resize-y"
                />
                <span className="text-[11px] text-slate-400 mt-1 block">
                  Dica de formatação WhatsApp: use *texto* para negrito e _texto_ para itálico.
                </span>
              </div>

              {/* Botão de Envio */}
              <div className="pt-2 flex items-center justify-end">
                <button
                  type="submit"
                  disabled={isSending}
                  className="px-6 py-3 rounded-2xl font-bold text-sm bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-lg shadow-emerald-600/30 flex items-center gap-2 cursor-pointer transition disabled:opacity-50"
                >
                  <Send className={`w-4 h-4 ${isSending ? 'animate-bounce' : ''}`} />
                  <span>{isSending ? 'Disparando Mensagem...' : 'Enviar pelo Mensageiro Oficial'}</span>
                </button>
              </div>
            </form>
          </div>

          {/* Preview da Mensagem (Estilo Balão do WhatsApp) */}
          <div className="bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3 mb-4">
                <Smartphone className="w-5 h-5 text-emerald-600" />
                <h3 className="text-sm font-bold text-slate-800 dark:text-white uppercase tracking-wider">
                  Prévia no WhatsApp
                </h3>
              </div>

              <div className="bg-[#efeae2] dark:bg-[#0b141a] p-4 rounded-2xl border border-slate-200 dark:border-slate-800 min-h-[260px] flex flex-col justify-between">
                <div className="space-y-2">
                  <div className="text-[10px] text-center text-slate-500 dark:text-slate-400 bg-white/60 dark:bg-slate-800/60 py-1 rounded-md max-w-[140px] mx-auto">
                    Hoje
                  </div>
                  {messageBody ? (
                    <div className="bg-[#d9fdd3] dark:bg-[#005c4b] text-slate-900 dark:text-white p-3.5 rounded-2xl rounded-tr-none shadow-sm text-xs leading-relaxed whitespace-pre-wrap max-w-[90%] ml-auto">
                      {messageBody}
                      <span className="text-[9px] text-slate-500 dark:text-emerald-200/70 block text-right mt-1">
                        {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} ✓✓
                      </span>
                    </div>
                  ) : (
                    <div className="text-center text-xs text-slate-400 dark:text-slate-500 py-12">
                      Preencha o formulário para visualizar como a mensagem será exibida na tela do motorista ou cliente.
                    </div>
                  )}
                </div>

                <div className="text-[10px] text-slate-500 text-center mt-3 pt-2 border-t border-slate-200/60 dark:border-slate-800">
                  Enviado via Transcunha Logística Oficial
                </div>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-800 space-y-2 text-xs text-slate-500">
              <div className="flex items-center justify-between">
                <span>Remetente:</span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400">{OFFICIAL_PHONE_DISPLAY}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Fila Anti-Bloqueio:</span>
                <span className="font-bold text-slate-700 dark:text-slate-300">Ativa (delay 3s)</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Conteúdo da Aba 2: Conexão da Linha Oficial */}
      {activeTab === 'connection' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Alerta caso o Gateway esteja Inacessível */}
          {isGatewayOnline === false && (
            <div className="md:col-span-2 p-5 rounded-3xl bg-amber-500/10 dark:bg-amber-950/40 border border-amber-500/30 text-amber-900 dark:text-amber-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm animate-fade-in">
              <div className="flex items-start gap-3.5">
                <div className="p-2.5 rounded-2xl bg-amber-500/20 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5">
                  <AlertCircle className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-amber-900 dark:text-amber-100 flex items-center gap-2">
                    <span>Servidor Evolution API Inacessível</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-300">
                      HTTP 404 / Offline
                    </span>
                  </h4>
                  <p className="text-xs text-amber-800/90 dark:text-amber-300/90 mt-1 max-w-2xl leading-relaxed">
                    O servidor configurado (<span className="font-mono font-semibold underline">{gatewayConfig.url}</span>) não está respondendo. Para gerar o QR Code ou Pareamento por Código, certifique-se de que a instância da Evolution API está em execução no Railway/VPS ou atualize os parâmetros de conexão.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsGatewayModalOpen(true)}
                className="px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs whitespace-nowrap shadow-md cursor-pointer transition flex items-center gap-2 shrink-0"
              >
                <Settings className="w-4 h-4" />
                <span>Configurar Servidor Gateway</span>
              </button>
            </div>
          )}

          {/* Card Pareamento com Código Numérico (Pairing Code) */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-7 shadow-sm space-y-5">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
                <KeyRound className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Conectar com Código no Telefone (Pairing Code)
                </h3>
                <p className="text-xs text-slate-500">Método mais rápido: digite o código de 8 dígitos direto no WhatsApp do aparelho.</p>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-600 dark:text-slate-300">Número da Linha:</span>
                <span className="text-sm font-black text-emerald-600 dark:text-emerald-400">{OFFICIAL_PHONE_DISPLAY}</span>
              </div>

              {pairingCode ? (
                <div className="text-center py-4 bg-white dark:bg-slate-900 rounded-xl border border-emerald-500/40 shadow-inner">
                  <span className="text-xs text-slate-400 block mb-1 uppercase font-bold">Código de Conexão</span>
                  <div className="text-3xl font-black text-emerald-600 dark:text-emerald-400 tracking-widest font-mono">
                    {pairingCode}
                  </div>
                  <button
                    onClick={handleCopyCode}
                    className="mt-3 px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold inline-flex items-center gap-1.5 transition"
                  >
                    {copiedCode ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedCode ? 'Código Copiado!' : 'Copiar Código'}</span>
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleGeneratePairingCode}
                  disabled={isGeneratingPairing}
                  className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-md transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <KeyRound className="w-4 h-4" />
                  <span>{isGeneratingPairing ? 'Gerando Código...' : 'Gerar Código de Pareamento'}</span>
                </button>
              )}
            </div>

            <div className="space-y-2 text-xs text-slate-500">
              <span className="font-bold text-slate-700 dark:text-slate-300 block">Como conectar no aparelho:</span>
              <ol className="list-decimal list-inside space-y-1 pl-1">
                <li>Abra o WhatsApp no celular com o número <strong>(35) 9872-1970</strong>.</li>
                <li>Toque nos <strong>3 pontinhos</strong> ou <strong>Configurações</strong> &gt; <strong>Aparelhos Conectados</strong>.</li>
                <li>Selecione <strong>Conectar um aparelho</strong> &gt; <strong>Conectar com número de telefone</strong>.</li>
                <li>Digite o código numérico exibido acima.</li>
              </ol>
            </div>
          </div>

          {/* Card Pareamento com QR Code */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-7 shadow-sm space-y-5">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400">
                <QrCode className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Conectar via Leitura de QR Code
                </h3>
                <p className="text-xs text-slate-500">Aponte a câmera do WhatsApp para o QR Code abaixo.</p>
              </div>
            </div>

            <div className="flex flex-col items-center justify-center p-6 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 min-h-[220px]">
              {isRefreshing && !qrCodeData ? (
                <div className="flex flex-col items-center justify-center space-y-3 py-6">
                  <RefreshCw className="w-8 h-8 text-emerald-500 animate-spin" />
                  <p className="text-xs font-semibold text-slate-500 animate-pulse">Obtendo QR Code oficial da linha...</p>
                </div>
              ) : qrCodeData ? (
                <div className="space-y-4 flex flex-col items-center">
                  <div className="p-2 bg-white rounded-2xl shadow-md border-2 border-emerald-500/30">
                    <img
                      src={qrCodeData}
                      alt="QR Code WhatsApp Oficial"
                      className="w-48 h-48 rounded-xl object-contain bg-white"
                    />
                  </div>
                  <button
                    onClick={handleGenerateQr}
                    disabled={isRefreshing}
                    className="px-3.5 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600 transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                    <span>{isRefreshing ? 'Atualizando...' : 'Atualizar QR Code'}</span>
                  </button>
                </div>
              ) : (
                <div className="text-center space-y-3">
                  <p className="text-xs text-slate-500">
                    {isConnected ? 'Linha conectada com sucesso!' : 'Clique abaixo para gerar o QR Code de leitura.'}
                  </p>
                  <button
                    onClick={handleGenerateQr}
                    disabled={isRefreshing}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md transition flex items-center gap-2 mx-auto cursor-pointer disabled:opacity-50"
                  >
                    <QrCode className="w-4 h-4" />
                    <span>{isRefreshing ? 'Gerando QR Code...' : isConnected ? 'Reconectar via QR Code' : 'Gerar QR Code'}</span>
                  </button>
                </div>
              )}
            </div>

            {isConnected && (
              <div className="pt-2">
                <button
                  onClick={handleDisconnect}
                  className="w-full py-2.5 rounded-xl border border-rose-300 dark:border-rose-800 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Desconectar Sessão Atual</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Conteúdo da Aba 3: Histórico de Envios */}
      {activeTab === 'history' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Clock className="w-5 h-5 text-emerald-600" />
                Histórico & Relatório de Disparos
              </h2>
              <p className="text-xs text-slate-500">Registro de todas as mensagens disparadas pelo número oficial.</p>
            </div>

            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="text"
                placeholder="Buscar por telefone ou nome..."
                value={searchTermHistory}
                onChange={(e) => setSearchTermHistory(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase font-bold text-[11px]">
                  <th className="py-3 px-3">Destinatário</th>
                  <th className="py-3 px-3">Telefone</th>
                  <th className="py-3 px-3">Mensagem</th>
                  <th className="py-3 px-3">Data / Hora</th>
                  <th className="py-3 px-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium text-slate-700 dark:text-slate-300">
                {filteredHistory.length > 0 ? (
                  filteredHistory.map(item => (
                    <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                      <td className="py-3 px-3 font-bold text-slate-900 dark:text-white">
                        {item.recipient_name || 'Destinatário Avulso'}
                      </td>
                      <td className="py-3 px-3 font-mono text-[11px]">
                        {formatDisplayPhone(item.recipient_phone)}
                      </td>
                      <td className="py-3 px-3 max-w-xs truncate" title={item.rendered_body}>
                        {item.rendered_body}
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap text-slate-500">
                        {new Date(item.created_at).toLocaleString('pt-BR')}
                      </td>
                      <td className="py-3 px-3">
                        {item.status === 'sent' && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800">
                            Enviado ✓
                          </span>
                        )}
                        {item.status === 'delivered' && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400 border border-blue-300 dark:border-blue-800">
                            Entregue ✓✓
                          </span>
                        )}
                        {item.status === 'read' && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-400 border border-sky-300 dark:border-sky-800">
                            Lido ✓✓
                          </span>
                        )}
                        {item.status === 'pending' && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400 border border-amber-300 dark:border-amber-800">
                            Na Fila ⏳
                          </span>
                        )}
                        {item.status === 'failed' && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-400 border border-rose-300 dark:border-rose-800">
                            Falha ❌
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-400">
                      Nenhum envio registrado no histórico.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Conteúdo da Aba 4: Modelos Padronizados (Templates) */}
      {activeTab === 'templates' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {templates.map(tpl => (
            <div key={tpl.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-900 dark:text-white text-sm">
                  {tpl.name}
                </span>
                <span className="text-[10px] uppercase font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-md border border-emerald-500/20">
                  {tpl.trigger_event}
                </span>
              </div>
              <p className="text-xs text-slate-500">{tpl.description}</p>
              <div className="bg-slate-50 dark:bg-slate-800/80 p-3.5 rounded-2xl border border-slate-200/80 dark:border-slate-700 text-xs font-mono whitespace-pre-wrap text-slate-700 dark:text-slate-300">
                {tpl.body_text}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* MODAL DE CONFIGURAÇÕES DO SERVIDOR GATEWAY (EVOLUTION API) */}
      {isGatewayModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
          <div className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
            {/* Cabeçalho do Modal */}
            <div className="p-5 sm:p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/50">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  <Server className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    Servidor Gateway WhatsApp
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
                      Evolution API v2
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Defina o endpoint e credenciais de comunicação para a linha oficial (35) 9872-1970
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsGatewayModalOpen(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Abas Internas do Modal */}
            <div className="flex items-center gap-2 px-6 pt-4 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900">
              <button
                type="button"
                onClick={() => setGatewayTab('config')}
                className={`flex items-center gap-2 px-3.5 py-2 text-xs font-bold border-b-2 transition-all cursor-pointer ${
                  gatewayTab === 'config'
                    ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400'
                    : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
              >
                <Settings className="w-3.5 h-3.5" />
                <span>Parâmetros de Conexão</span>
              </button>

              <button
                type="button"
                onClick={() => setGatewayTab('guide')}
                className={`flex items-center gap-2 px-3.5 py-2 text-xs font-bold border-b-2 transition-all cursor-pointer ${
                  gatewayTab === 'guide'
                    ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400'
                    : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>Guia de Instalação (Railway / Docker)</span>
              </button>

              <button
                type="button"
                onClick={() => setGatewayTab('webhook')}
                className={`flex items-center gap-2 px-3.5 py-2 text-xs font-bold border-b-2 transition-all cursor-pointer ${
                  gatewayTab === 'webhook'
                    ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400'
                    : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
              >
                <Radio className="w-3.5 h-3.5" />
                <span>Webhook de Respostas</span>
              </button>
            </div>

            {/* Corpo do Modal */}
            <div className="p-6 overflow-y-auto space-y-5">
              {gatewayTab === 'config' && (
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase">
                        URL do Servidor Evolution API
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setGatewayConfig({ ...CLOUD_GATEWAY_DEFAULT });
                          setTestResult(null);
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-blue-50 hover:bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:hover:bg-blue-900/80 dark:text-blue-300 border border-blue-200 dark:border-blue-800 transition cursor-pointer shadow-xs active:scale-95"
                        title="Preencher com o endereço oficial ativo no Railway"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-blue-500" />
                        <span>Carregar Servidor Oficial (Railway)</span>
                      </button>
                    </div>
                    <input
                      type="text"
                      placeholder="https://sua-evolution-api.up.railway.app"
                      value={gatewayConfig.url}
                      onChange={(e) => setGatewayConfig({ ...gatewayConfig, url: e.target.value })}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-mono text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500"
                    />
                    <span className="text-[11px] text-slate-400 mt-1 block">
                      Endpoint HTTPS do servidor onde o container da Evolution API está hospedado.
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                        Chave de Autenticação (apikey)
                      </label>
                      <input
                        type="password"
                        placeholder="AUTHENTICATION_API_KEY do servidor"
                        value={gatewayConfig.apiKey}
                        onChange={(e) => setGatewayConfig({ ...gatewayConfig, apiKey: e.target.value })}
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-mono text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                        Nome da Instância
                      </label>
                      <input
                        type="text"
                        placeholder="transcunha_oficial"
                        value={gatewayConfig.instanceName}
                        onChange={(e) => setGatewayConfig({ ...gatewayConfig, instanceName: e.target.value })}
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-mono text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                  </div>

                  {/* Teste de Conexão com Feedback */}
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={handleTestGateway}
                      disabled={isTestingGateway}
                      className="px-4 py-2.5 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isTestingGateway ? 'animate-spin text-emerald-500' : ''}`} />
                      <span>{isTestingGateway ? 'Testando Conexão...' : 'Testar Conexão em Tempo Real'}</span>
                    </button>

                    {testResult && (
                      <div className={`mt-3 p-3.5 rounded-2xl text-xs flex items-start gap-2.5 animate-fade-in ${
                        testResult.success 
                          ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300' 
                          : 'bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-300'
                      }`}>
                        {testResult.success ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                        ) : (
                          <XCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                        )}
                        <div>
                          <span className="font-bold block">{testResult.success ? 'Conexão Estabelecida!' : 'Falha na Conexão'}</span>
                          <span>{testResult.message}</span>
                          {testResult.version && (
                            <span className="block mt-0.5 font-mono text-[10px] opacity-80">
                              Versão identificada: {testResult.version}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {gatewayTab === 'guide' && (
                <div className="space-y-4 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  <div className="p-4 rounded-2xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 text-blue-900 dark:text-blue-200 space-y-2">
                    <h4 className="font-bold text-sm flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-blue-500" />
                      Como rodar a Evolution API v2 no Railway (Recomendado)
                    </h4>
                    <p>
                      A Evolution API é um servidor open-source de alta performance baseado no Baileys que conecta ao WhatsApp sem depender de navegadores pesados.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <span className="font-bold text-slate-800 dark:text-white block">Passos de ativação:</span>
                    <ol className="list-decimal list-inside space-y-1.5 pl-1">
                      <li>Acesse o <a href="https://railway.app" target="_blank" rel="noreferrer" className="text-emerald-600 dark:text-emerald-400 font-bold underline inline-flex items-center gap-0.5">Railway.app <ExternalLink className="w-3 h-3" /></a> e crie um novo projeto.</li>
                      <li>Clique em <strong>Deploy from Template</strong> e busque por <strong>Evolution API</strong> (ou suba a imagem Docker <code className="font-mono bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">atendai/evolution-api:v2.1.2</code>).</li>
                      <li>Adicione um banco <strong>PostgreSQL</strong> no mesmo projeto.</li>
                      <li>Configure a variável de ambiente:
                        <div className="my-1.5 p-2 rounded-xl bg-slate-100 dark:bg-slate-800 font-mono text-[11px] text-slate-800 dark:text-slate-200">
                          AUTHENTICATION_API_KEY=sua_chave_secreta_aqui
                        </div>
                      </li>
                      <li>Copie o domínio público gerado no Railway (ex: <code className="font-mono">https://evolution-api-sua-empresa.up.railway.app</code>) e cole na aba <strong>Parâmetros de Conexão</strong>.</li>
                    </ol>
                  </div>
                </div>
              )}

              {gatewayTab === 'webhook' && (
                <div className="space-y-4 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-emerald-900 dark:text-emerald-200 space-y-2">
                    <h4 className="font-bold text-sm flex items-center gap-2">
                      <Radio className="w-4 h-4 text-emerald-500" />
                      Recebimento de Respostas e Canhotos
                    </h4>
                    <p>
                      Para que as respostas enviadas pelos motoristas (mensagens de texto, áudios e fotos de comprovantes) cheguem ao sistema Transcunha em tempo real, cadastre o webhook no painel da Evolution API.
                    </p>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <span className="font-bold text-slate-800 dark:text-white block mb-1">
                        URL do Webhook da Transcunha:
                      </span>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          readOnly
                          value={`${typeof window !== 'undefined' ? window.location.origin : 'https://app.transcunha.com.br'}/api/whatsapp/webhook`}
                          className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono text-xs text-slate-700 dark:text-slate-300"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const url = `${typeof window !== 'undefined' ? window.location.origin : 'https://app.transcunha.com.br'}/api/whatsapp/webhook`;
                            navigator.clipboard.writeText(url);
                            showToast('URL do webhook copiada!', 'success');
                          }}
                          className="p-2 rounded-xl bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 transition cursor-pointer"
                          title="Copiar URL"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 space-y-1">
                      <span className="font-bold text-slate-700 dark:text-slate-200 block text-[11px]">Eventos Obrigatórios no Webhook:</span>
                      <ul className="list-disc list-inside space-y-0.5 text-[11px] text-slate-500 font-mono">
                        <li>MESSAGES_UPSERT (recebimento de novas mensagens)</li>
                        <li>MESSAGES_UPDATE (status de entregue / lido)</li>
                        <li>CONNECTION_UPDATE (mudança de estado da linha)</li>
                      </ul>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Rodapé do Modal */}
            <div className="p-5 sm:p-6 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 flex items-center justify-between flex-wrap gap-3">
              <button
                type="button"
                onClick={() => {
                  setGatewayConfig({ ...CLOUD_GATEWAY_DEFAULT });
                  setTestResult(null);
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-800 dark:text-white transition cursor-pointer shadow-xs active:scale-95"
              >
                <RotateCcw className="w-3.5 h-3.5 text-slate-500 dark:text-slate-300" />
                <span>Restaurar Padrão Oficial</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsGatewayModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSaveGateway}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-600/30 transition cursor-pointer"
                >
                  Salvar & Conectar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MessengerPage;
