import React, { useState, useEffect, useMemo, useRef } from 'react';
import type { User, Shipment, FreightOffer, Cargo, Driver, Ticket, Page, Client, Product, Vehicle } from '../types';
import { UserProfile, ShipmentStatus, FreightOfferStatus, TicketStatus, CargoStatus } from '../types';
import { isDemoUser, isDeveloperUser } from '../auth';
import { BellIcon } from './icons/BellIcon';
import { playAlertSound } from '../utils/audioAlert';
import { 
  AlertTriangle, 
  Flame, 
  Truck, 
  ShieldAlert, 
  FileCheck2, 
  Volume2, 
  VolumeX, 
  ChevronRight, 
  X, 
  CheckCircle, 
  XCircle, 
  Wallet,
  DollarSign,
  Tag,
  Package
} from 'lucide-react';
import OrderRequestDecisionModal from './OrderRequestDecisionModal';

export interface SystemAlert {
  id: string;
  type: 'order_request' | 'client_freight_offer' | 'fiscal_sla' | 'insurance_sla' | 'financial_sla' | 'ticket' | 'new_cargo';
  title: string;
  message: string;
  timestamp: string;
  elapsedMinutes?: number;
  urgency: 'normal' | 'warning' | 'critical';
  targetPage?: Page;
  relatedId?: string;
}

interface NotificationBellProps {
  user: User;
  shipments?: Shipment[];
  freightOffers?: FreightOffer[];
  cargos?: Cargo[];
  drivers?: Driver[];
  clients?: Client[];
  products?: Product[];
  vehicles?: Vehicle[];
  users?: User[];
  tickets?: Ticket[];
  onOpenTickets?: () => void;
  onNavigateTo?: (page: Page) => void;
  onAcceptOrderRequest?: (offer: FreightOffer) => void | Promise<void>;
  onRefuseOrderRequest?: (offer: FreightOffer, reason?: string) => void | Promise<void>;
  onSaveFreightOffer?: (offer: FreightOffer | Omit<FreightOffer, 'id' | 'createdAt'>) => Promise<void> | void;
}

export const NotificationBell: React.FC<NotificationBellProps> = ({
  user,
  shipments = [],
  freightOffers = [],
  cargos = [],
  drivers = [],
  clients = [],
  products = [],
  vehicles = [],
  users = [],
  tickets = [],
  onOpenTickets,
  onNavigateTo,
  onAcceptOrderRequest,
  onRefuseOrderRequest,
  onSaveFreightOffer
}) => {
  const isDemo = isDemoUser(user);
  const [isOpen, setIsOpen] = useState(false);
  const [decisionOffer, setDecisionOffer] = useState<FreightOffer | null>(null);
  const [isAudioMuted, setIsAudioMuted] = useState<boolean>(() => {
    return localStorage.getItem('transcunha_audio_muted') === 'true';
  });

  const dropdownRef = useRef<HTMLDivElement>(null);
  const lastAlertIdsRef = useRef<Set<string>>(new Set());

  // Fechar dropdown ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleAudioMute = () => {
    const nextState = !isAudioMuted;
    setIsAudioMuted(nextState);
    localStorage.setItem('transcunha_audio_muted', String(nextState));
  };

  const cargoMap = useMemo(() => new Map(cargos.map(c => [c.id, c])), [cargos]);
  const driverMap = useMemo(() => new Map(drivers.map(d => [d.id, d])), [drivers]);
  const clientMap = useMemo(() => new Map(clients.map(c => [c.id, c])), [clients]);
  const productMap = useMemo(() => new Map(products.map(p => [p.id, p])), [products]);

  // Formatar minutos passados
  const formatElapsedTime = (minutes: number): string => {
    if (minutes < 1) return '< 1 min';
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };

  // Avaliar todos os alertas aplicáveis ao usuário logado
  const activeAlerts = useMemo(() => {
    if (user.profile === UserProfile.Cliente) return [];
    const alerts: SystemAlert[] = [];
    const now = Date.now();

    const isEmbarcador = user.profile === UserProfile.Embarcador;
    const isFiscal = user.profile === UserProfile.Fiscal;
    const isSeguradora = user.profile === UserProfile.GerenciadoraDeRisco;
    const isFinanceiro = user.profile === UserProfile.Financeiro;
    const isAdminOrDiretor = !isDemo && (isDeveloperUser(user) || user.profile === UserProfile.Desenvolvedor || user.profile === UserProfile.Admin || user.profile === UserProfile.Diretor || user.profile === UserProfile.GerenciadoraDeRisco);
    const isCommercialOrSupervisor = !isDemo && (isDeveloperUser(user) || [
      UserProfile.Desenvolvedor,
      UserProfile.Comercial,
      UserProfile.GerenteComercial,
      UserProfile.Supervisor,
      UserProfile.Admin,
      UserProfile.Diretor
    ].includes(user.profile));
    const isMotorista = user.profile === UserProfile.Motorista;

    // 1. REGRA EMBARCADORES: Solicitação de ordem de algum motorista
    if (isEmbarcador || isAdminOrDiretor) {
      freightOffers.forEach(offer => {
        if (offer.status !== FreightOfferStatus.Pendente || !offer.driverId) return;

        const reqTime = new Date(offer.requestTimestamp || (offer as any).createdAt || Date.now()).getTime();
        const now = Date.now();
        const elapsedMs = now - reqTime;

        // Se já passaram 10 minutos sem aceite ou recusa, a solicitação expirou
        if (elapsedMs >= 10 * 60 * 1000) return;

        const cargo = offer.cargoId ? cargoMap.get(offer.cargoId) : undefined;
        const driver = driverMap.get(offer.driverId || '');

        // Filtrar por embarcador se for perfil Embarcador
        if (isEmbarcador) {
          const isMyRequest = offer.requestedEmbarcadorId === user.id || 
                              (cargo && cargo.createdById === user.id) || 
                              (user.clientId && cargo && cargo.clientId === user.clientId);
          if (!isMyRequest) return;
        }

        const driverName = driver?.name || 'Motorista';
        const cargoSeq = cargo ? cargo.sequenceId : (offer.cargoId || 'N/A');
        const remainingMinutes = Math.max(1, Math.ceil((10 * 60 * 1000 - elapsedMs) / 60000));

        alerts.push({
          id: `order_${offer.id}`,
          type: 'order_request',
          title: 'Solicitação de Ordem de Carregamento',
          message: `${driverName} solicitou ordem de carregamento para a Carga #${cargoSeq}. (Expira em ~${remainingMinutes} min)`,
          timestamp: offer.requestTimestamp || (offer as any).createdAt || new Date().toISOString(),
          urgency: remainingMinutes <= 3 ? 'critical' : 'warning',
          targetPage: 'operational-loads',
          relatedId: offer.id
        });
      });
    }

    // 1.1 RETORNO AO MOTORISTA: Avisar motorista quando sua solicitação de ordem for aceita ou recusada
    if (isMotorista) {
      freightOffers.forEach(offer => {
        if (offer.driverId !== user.id) return;
        const cargo = offer.cargoId ? cargoMap.get(offer.cargoId) : undefined;
        const cargoSeq = cargo ? cargo.sequenceId : (offer.cargoId || 'N/A');

        if (offer.status === FreightOfferStatus.Aceita) {
          const lastLog = offer.history?.[offer.history.length - 1];
          alerts.push({
            id: `driver_accepted_${offer.id}`,
            type: 'order_request',
            title: 'Ordem de Carregamento Aprovada!',
            message: `Sua solicitação de ordem para a Carga #${cargoSeq} foi aceita pelo Embarcador.`,
            timestamp: lastLog?.timestamp || offer.requestTimestamp || offer.createdAt,
            urgency: 'normal',
            targetPage: 'dashboard',
            relatedId: offer.id
          });
        } else if (offer.status === FreightOfferStatus.Recusada) {
          const lastLog = offer.history?.[offer.history.length - 1];
          const isExpired = lastLog?.description?.includes('Solicitação exp.') || lastLog?.description?.includes('expirada');
          alerts.push({
            id: `driver_refused_${offer.id}`,
            type: 'order_request',
            title: isExpired ? 'Solicitação de Ordem Expirada' : 'Ordem de Carregamento Recusada',
            message: isExpired
              ? `Sua solicitação de ordem para a Carga #${cargoSeq} expirou por falta de resposta em 10 minutos (Motivo: Solicitação exp.).`
              : `Sua solicitação de ordem para a Carga #${cargoSeq} foi recusada.${lastLog?.description ? ` (${lastLog.description})` : ''}`,
            timestamp: lastLog?.timestamp || offer.requestTimestamp || offer.createdAt,
            urgency: 'warning',
            targetPage: 'dashboard',
            relatedId: offer.id
          });
        }
      });
    }

    // 2. REGRA CLIENTES & COMERCIAL: Solicitações e Cotações de Frete de Clientes
    if (isCommercialOrSupervisor) {
      freightOffers.forEach(offer => {
        if (offer.driverId) return; // Exclusivo cotações de clientes
        const client = clientMap.get(offer.clientId);
        const product = productMap.get(offer.productId);
        const clientName = client?.nomeFantasia || client?.razaoSocial || 'Cliente';
        const productName = product?.name || 'Mercadoria';

        if (offer.status === FreightOfferStatus.AguardandoPreco || offer.status === FreightOfferStatus.Pendente) {
          alerts.push({
            id: `freight_quote_${offer.id}`,
            type: 'client_freight_offer',
            title: 'Nova Solicitação de Frete (Cliente)',
            message: `${clientName} solicitou cotação para ${productName} (${offer.origin} -> ${offer.destination}).`,
            timestamp: offer.createdAt,
            urgency: 'warning',
            targetPage: 'freight-offers-history',
            relatedId: offer.id
          });
        } else if (offer.status === FreightOfferStatus.Contraproposta) {
          alerts.push({
            id: `freight_counter_${offer.id}`,
            type: 'client_freight_offer',
            title: 'Contraproposta de Frete (Cliente)',
            message: `${clientName} enviou contraproposta de R$ ${(offer.counterOfferValue || 0).toFixed(2)}/ton para ${productName}.`,
            timestamp: offer.history?.[offer.history.length - 1]?.timestamp || offer.createdAt,
            urgency: 'warning',
            targetPage: 'freight-offers-history',
            relatedId: offer.id
          });
        } else if (offer.status === FreightOfferStatus.SolicitadoExclusao) {
          alerts.push({
            id: `freight_delete_${offer.id}`,
            type: 'client_freight_offer',
            title: 'Exclusão Solicitada pelo Cliente',
            message: `${clientName} solicitou exclusão da oferta #${offer.displayId || offer.id}.`,
            timestamp: offer.history?.[offer.history.length - 1]?.timestamp || offer.createdAt,
            urgency: 'warning',
            targetPage: 'freight-offers-history',
            relatedId: offer.id
          });
        }
      });
    }

    // 3. REGRA FISCAL: Embarques "Ag. Fiscal" no time "Atenção" (>= 30 min) ou "Crítico" (>= 60 min)
    if (isFiscal || isAdminOrDiretor) {
      shipments.forEach(s => {
        if (s.status !== ShipmentStatus.AguardandoNota && s.status !== ShipmentStatus.AguardandoFiscal) return;

        const currentEntry = s.statusHistory?.[s.statusHistory.length - 1];
        const startTime = new Date(currentEntry?.timestamp || s.createdAt).getTime();
        const elapsedMinutes = Math.max(0, Math.floor((now - startTime) / (1000 * 60)));

        // SLA: Atenção >= 30 min, Crítico >= 60 min
        if (elapsedMinutes >= 30) {
          const urgency: 'warning' | 'critical' = elapsedMinutes >= 60 ? 'critical' : 'warning';
          const driverName = s.driverName || 'Motorista';
          const labelId = s.cteNumber ? `CT-e ${s.cteNumber}` : `Embarque #${s.id.slice(-6)}`;

          alerts.push({
            id: `fiscal_${s.id}`,
            type: 'fiscal_sla',
            title: `Ag. Fiscal - ${urgency === 'critical' ? 'CRÍTICO' : 'ATENÇÃO'}`,
            message: `${labelId} (${driverName}) aguardando fiscal/nota há ${formatElapsedTime(elapsedMinutes)}.`,
            timestamp: currentEntry?.timestamp || s.createdAt,
            elapsedMinutes,
            urgency,
            targetPage: 'shipments',
            relatedId: s.id
          });
        }
      });
    }

    // 4. REGRA GERENCIADORA DE RISCO: Embarques "Ag. Seguradora" no time "Atenção" (>= 30 min) ou "Crítico" (>= 60 min)
    if (isSeguradora || isAdminOrDiretor) {
      shipments.forEach(s => {
        if (s.status !== ShipmentStatus.AguardandoSeguradora) return;

        const currentEntry = s.statusHistory?.[s.statusHistory.length - 1];
        const startTime = new Date(currentEntry?.timestamp || s.createdAt).getTime();
        const elapsedMinutes = Math.max(0, Math.floor((now - startTime) / (1000 * 60)));

        // SLA: Atenção >= 30 min, Crítico >= 60 min
        if (elapsedMinutes >= 30) {
          const urgency: 'warning' | 'critical' = elapsedMinutes >= 60 ? 'critical' : 'warning';
          const driverName = s.driverName || 'Motorista';
          const labelId = s.cteNumber ? `CT-e ${s.cteNumber}` : `Embarque #${s.id.slice(-6)}`;

          alerts.push({
            id: `insurance_${s.id}`,
            type: 'insurance_sla',
            title: `Ag. Seguradora - ${urgency === 'critical' ? 'CRÍTICO' : 'ATENÇÃO'}`,
            message: `${labelId} (${driverName}) aguardando liberação da seguradora há ${formatElapsedTime(elapsedMinutes)}.`,
            timestamp: currentEntry?.timestamp || s.createdAt,
            elapsedMinutes,
            urgency,
            targetPage: 'shipments',
            relatedId: s.id
          });
        }
      });
    }

    // 5. REGRA FINANCEIRO: Embarques "Ag. Adiantamento" e "Ag. Saldo"
    // Time nos status de adiantamento e saldo: 2:30h (150 min) alerta - 2:45h (165 min) crítico
    if (isFinanceiro || isAdminOrDiretor) {
      shipments.forEach(s => {
        if (s.status !== ShipmentStatus.AguardandoAdiantamento && s.status !== ShipmentStatus.AguardandoPagamentoSaldo) return;

        const currentEntry = s.statusHistory?.[s.statusHistory.length - 1];
        const startTime = new Date(currentEntry?.timestamp || s.createdAt).getTime();
        const elapsedMinutes = Math.max(0, Math.floor((now - startTime) / (1000 * 60)));

        // SLA Financeiro: Alerta >= 150 min (2:30h), Crítico >= 165 min (2:45h)
        if (elapsedMinutes >= 150) {
          const urgency: 'warning' | 'critical' = elapsedMinutes >= 165 ? 'critical' : 'warning';
          const driverName = s.driverName || 'Motorista';
          const labelId = s.cteNumber ? `CT-e ${s.cteNumber}` : `Embarque #${s.id.slice(-6)}`;
          const isAdiantamento = s.status === ShipmentStatus.AguardandoAdiantamento;
          const statusTitle = isAdiantamento ? 'Ag. Adiantamento' : 'Ag. Saldo';
          const statusDesc = isAdiantamento ? 'adiantamento' : 'saldo';

          alerts.push({
            id: `financial_${s.id}`,
            type: 'financial_sla',
            title: `${statusTitle} - ${urgency === 'critical' ? 'CRÍTICO' : 'ALERTA'}`,
            message: `${labelId} (${driverName}) aguardando pagamento de ${statusDesc} há ${formatElapsedTime(elapsedMinutes)}.`,
            timestamp: currentEntry?.timestamp || s.createdAt,
            elapsedMinutes,
            urgency,
            targetPage: 'shipments',
            relatedId: s.id
          });
        }
      });
    }

    // 6. TICKETS (Chamados Abertos Atribuídos ao Usuário)
    tickets.forEach(t => {
      if (t.assignedToId === user.id && t.status !== TicketStatus.Resolvido && t.status !== TicketStatus.Fechado) {
        alerts.push({
          id: `ticket_${t.id}`,
          type: 'ticket',
          title: `Chamado Atribuído (#${t.id})`,
          message: t.title || t.description || 'Novo chamado pendente.',
          timestamp: t.createdAt,
          urgency: t.priority === 'Alta' || t.priority === 'Urgente' ? 'critical' : 'warning',
          relatedId: t.id
        });
      }
    });

    // 7. REGRA NOVA CARGA CADASTRADA: Alerta para Comercial, Administrador do Sistema, Agenciador e Embarcador
    const isEligibleForNewCargoAlert = !isDemo && (isDeveloperUser(user) || [
      UserProfile.Desenvolvedor,
      UserProfile.Comercial,
      UserProfile.GerenteComercial,
      UserProfile.Admin,
      UserProfile.GerenciadoraDeRisco,
      UserProfile.Diretor,
      UserProfile.Agenciador,
      UserProfile.Embarcador,
    ].includes(user.profile));

    if (isEligibleForNewCargoAlert) {
      cargos.forEach(cargo => {
        if (cargo.status !== CargoStatus.EmAndamento) return;

        const createdAtTime = new Date(cargo.createdAt).getTime();
        if (isNaN(createdAtTime)) return;

        const elapsedMinutes = Math.max(0, Math.floor((now - createdAtTime) / (1000 * 60)));

        // Exibir cargas cadastradas nas últimas 24 horas (1440 min)
        if (elapsedMinutes <= 1440) {
          const client = clientMap.get(cargo.clientId);
          const product = productMap.get(cargo.productId);
          const clientName = client?.nomeFantasia || client?.razaoSocial || 'Cliente';
          const productName = product?.name || 'Mercadoria';
          const cargoSeq = cargo.sequenceId ? `#${cargo.sequenceId}` : `#${cargo.id.slice(-6)}`;
          const volumeFormatted = cargo.totalVolume ? `${cargo.totalVolume.toLocaleString('pt-BR')} ton` : '';
          const originDest = `${cargo.origin || 'Origem'} ➔ ${cargo.destination || 'Destino'}`;

          alerts.push({
            id: `new_cargo_${cargo.id}`,
            type: 'new_cargo',
            title: `Nova Carga Cadastrada (${cargoSeq})`,
            message: `${clientName} • ${productName} (${originDest})${volumeFormatted ? ` • ${volumeFormatted}` : ''}.`,
            timestamp: cargo.createdAt,
            elapsedMinutes,
            urgency: elapsedMinutes <= 120 ? 'warning' : 'normal',
            targetPage: 'loads',
            relatedId: cargo.id
          });
        }
      });
    }

    // Ordenar alertas: Críticos primeiro, depois Atenção
    return alerts.sort((a, b) => {
      if (a.urgency === 'critical' && b.urgency !== 'critical') return -1;
      if (a.urgency !== 'critical' && b.urgency === 'critical') return 1;
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    });
  }, [user, shipments, freightOffers, cargos, drivers, clients, products, tickets, cargoMap, driverMap, clientMap, productMap]);

  // Contadores por urgência
  const criticalCount = useMemo(() => activeAlerts.filter(a => a.urgency === 'critical').length, [activeAlerts]);
  const warningCount = useMemo(() => activeAlerts.filter(a => a.urgency === 'warning').length, [activeAlerts]);
  const totalCount = activeAlerts.length;

  // Disparar som de alerta sonoro quando novos alertas chegarem ou periodicamente
  useEffect(() => {
    if (user.profile === UserProfile.Cliente || totalCount === 0) {
      lastAlertIdsRef.current.clear();
      return;
    }

    const currentIds = new Set(activeAlerts.map(a => a.id));
    let hasNewAlert = false;

    currentIds.forEach(id => {
      if (!lastAlertIdsRef.current.has(id)) {
        hasNewAlert = true;
      }
    });

    if (hasNewAlert && !isAudioMuted) {
      const highestUrgency = criticalCount > 0 ? 'critical' : (activeAlerts.some(a => a.type === 'order_request') ? 'order' : 'warning');
      playAlertSound(highestUrgency);
    }

    lastAlertIdsRef.current = currentIds;
  }, [activeAlerts, totalCount, criticalCount, isAudioMuted]);

  const handleAlertClick = (alert: SystemAlert) => {
    if (alert.type === 'order_request') {
      if (isDemo) {
        setIsOpen(false);
        return;
      }
      const offerId = alert.relatedId || alert.id.replace('order_', '');
      const matchedOffer = freightOffers.find(o => o.id === offerId);
      if (matchedOffer && user.profile !== UserProfile.Motorista) {
        const reqTime = new Date(matchedOffer.requestTimestamp || (matchedOffer as any).createdAt || Date.now()).getTime();
        if (Date.now() - reqTime >= 10 * 60 * 1000) {
          onRefuseOrderRequest?.(matchedOffer, 'Solicitação exp.');
          setIsOpen(false);
          return;
        }
        setIsOpen(false);
        setDecisionOffer(matchedOffer);
        return;
      }
    }

    setIsOpen(false);
    if (alert.type === 'ticket' && onOpenTickets) {
      onOpenTickets();
    } else if (alert.targetPage && onNavigateTo) {
      onNavigateTo(alert.targetPage);
    }
  };

  const handleOpenDecisionForOffer = (e: React.MouseEvent, offerId: string) => {
    e.stopPropagation();
    if (isDemo) return;
    const matchedOffer = freightOffers.find(o => o.id === offerId);
    if (matchedOffer) {
      const reqTime = new Date(matchedOffer.requestTimestamp || (matchedOffer as any).createdAt || Date.now()).getTime();
      if (Date.now() - reqTime >= 10 * 60 * 1000) {
        onRefuseOrderRequest?.(matchedOffer, 'Solicitação exp.');
        setIsOpen(false);
        return;
      }
      setIsOpen(false);
      setDecisionOffer(matchedOffer);
    }
  };

  if (user.profile === UserProfile.Cliente) {
    return null;
  }

  return (
    <>
      <div className="relative" ref={dropdownRef}>
        {/* BOTÃO DO SINO VISUAL E SONORO */}
        <button
          onClick={() => setIsOpen(prev => !prev)}
          className={`relative p-2 rounded-full transition-all focus:outline-none ${
            criticalCount > 0
              ? 'text-rose-600 dark:text-rose-400 bg-rose-100 dark:bg-rose-950/80 animate-pulse ring-2 ring-rose-500/50'
              : totalCount > 0
              ? 'text-amber-600 dark:text-amber-400 bg-amber-100/80 dark:bg-amber-950/50 hover:bg-amber-200'
              : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
          }`}
          aria-label="Notificações e Alertas"
          title={totalCount > 0 ? `${totalCount} alerta(s) pendente(s)` : 'Sem alertas no momento'}
        >
          <BellIcon className={`w-6 h-6 ${criticalCount > 0 ? 'animate-bounce' : ''}`} />

          {/* BADGE VISUAL DE CONTAGEM DE ALERTAS */}
          {totalCount > 0 && (
            <span className={`absolute -top-1 -right-1 inline-flex items-center justify-center px-1.5 py-0.5 text-[10px] font-black leading-none text-white transform rounded-full shadow-md ${
              criticalCount > 0 ? 'bg-rose-600 animate-pulse' : 'bg-amber-600'
            }`}>
              {totalCount}
            </span>
          )}
        </button>

        {/* DROPDOWN POPUP DE NOTIFICAÇÕES */}
        {isOpen && (
          <div className="absolute right-0 mt-3 w-80 sm:w-96 bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden z-50 animate-in fade-in zoom-in duration-150">
            {/* HEADER DO POPUP */}
            <div className="p-4 bg-gradient-to-r from-blue-900 via-slate-900 to-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BellIcon className="w-5 h-5 text-amber-400" />
                <h4 className="font-bold text-sm">Central de Alertas</h4>
                {totalCount > 0 && (
                  <span className="px-2 py-0.5 text-[11px] font-extrabold bg-amber-500/30 text-amber-300 rounded-full border border-amber-500/40">
                    {totalCount}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                {/* MUTE / UNMUTE AUDIO BOTÃO */}
                <button
                  onClick={toggleAudioMute}
                  title={isAudioMuted ? 'Ativar alerta sonoro' : 'Silenciar alerta sonoro'}
                  className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-gray-200 hover:text-white transition-colors flex items-center gap-1 text-[11px] font-semibold"
                >
                  {isAudioMuted ? (
                    <>
                      <VolumeX className="w-4 h-4 text-rose-400" />
                      <span className="hidden sm:inline text-rose-300">Mudo</span>
                    </>
                  ) : (
                    <>
                      <Volume2 className="w-4 h-4 text-emerald-400" />
                      <span className="hidden sm:inline text-emerald-300">Som On</span>
                    </>
                  )}
                </button>

                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1 hover:bg-white/10 rounded-lg text-gray-300 hover:text-white transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* LISTA DE ALERTAS */}
            <div className="max-h-96 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-700/60">
              {totalCount === 0 ? (
                <div className="p-8 text-center text-gray-500 dark:text-gray-400 space-y-2">
                  <FileCheck2 className="w-8 h-8 text-emerald-500 mx-auto opacity-60" />
                  <p className="text-xs font-bold text-gray-700 dark:text-gray-300">Nenhum alerta pendente!</p>
                  <p className="text-[11px] text-gray-400">Você receberá avisos sonoros e visuais quando houver solicitações ou SLAs em atenção/crítico.</p>
                </div>
              ) : (
                activeAlerts.map(alert => {
                  const isCritical = alert.urgency === 'critical';
                  const isOrderRequest = alert.type === 'order_request';
                  const isClientOffer = alert.type === 'client_freight_offer';
                  const isNewCargo = alert.type === 'new_cargo';
                  const offerId = alert.relatedId || alert.id.replace('order_', '');

                  return (
                    <div
                      key={alert.id}
                      onClick={() => handleAlertClick(alert)}
                      className={`p-3.5 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer transition-all flex items-start gap-3 border-l-4 ${
                        isCritical
                          ? 'border-l-rose-500 bg-rose-50/40 dark:bg-rose-950/20'
                          : isOrderRequest
                          ? 'border-l-blue-500 bg-blue-50/30 dark:bg-blue-950/10'
                          : isClientOffer
                          ? 'border-l-indigo-500 bg-indigo-50/30 dark:bg-indigo-950/10'
                          : isNewCargo
                          ? 'border-l-emerald-500 bg-emerald-50/30 dark:bg-emerald-950/10'
                          : 'border-l-amber-500 bg-amber-50/30 dark:bg-amber-950/10'
                      }`}
                    >
                      <div className="shrink-0 mt-0.5">
                        {alert.type === 'order_request' && (
                          <div className="p-2 rounded-xl bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400">
                            <Truck className="w-4 h-4" />
                          </div>
                        )}
                        {alert.type === 'client_freight_offer' && (
                          <div className="p-2 rounded-xl bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400">
                            <Tag className="w-4 h-4" />
                          </div>
                        )}
                        {alert.type === 'new_cargo' && (
                          <div className="p-2 rounded-xl bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400">
                            <Package className="w-4 h-4" />
                          </div>
                        )}
                        {alert.type === 'fiscal_sla' && (
                          <div className={`p-2 rounded-xl ${isCritical ? 'bg-rose-100 text-rose-600 dark:bg-rose-900/50 dark:text-rose-400' : 'bg-amber-100 text-amber-600 dark:bg-amber-900/50 dark:text-amber-400'}`}>
                            {isCritical ? <Flame className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                          </div>
                        )}
                        {alert.type === 'insurance_sla' && (
                          <div className={`p-2 rounded-xl ${isCritical ? 'bg-rose-100 text-rose-600 dark:bg-rose-900/50 dark:text-rose-400' : 'bg-purple-100 text-purple-600 dark:bg-purple-900/50 dark:text-purple-400'}`}>
                            <ShieldAlert className="w-4 h-4" />
                          </div>
                        )}
                        {alert.type === 'financial_sla' && (
                          <div className={`p-2 rounded-xl ${isCritical ? 'bg-rose-100 text-rose-600 dark:bg-rose-900/50 dark:text-rose-400' : 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/50 dark:text-emerald-400'}`}>
                            {isCritical ? <Flame className="w-4 h-4" /> : <Wallet className="w-4 h-4" />}
                          </div>
                        )}
                        {alert.type === 'ticket' && (
                          <div className="p-2 rounded-xl bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400">
                            <AlertTriangle className="w-4 h-4" />
                          </div>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1">
                          <span className={`text-xs font-black ${
                            isCritical 
                              ? 'text-rose-600 dark:text-rose-400' 
                              : isOrderRequest 
                              ? 'text-blue-900 dark:text-blue-200' 
                              : isClientOffer
                              ? 'text-indigo-900 dark:text-indigo-200'
                              : isNewCargo
                              ? 'text-emerald-900 dark:text-emerald-200'
                              : 'text-gray-900 dark:text-white'
                          }`}>
                            {alert.title}
                          </span>
                          {alert.elapsedMinutes !== undefined && (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold font-mono ${
                              isCritical 
                                ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/60 dark:text-rose-300' 
                                : isNewCargo
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300'
                                : 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300'
                            }`}>
                              {formatElapsedTime(alert.elapsedMinutes)}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-600 dark:text-gray-300 mt-1 leading-snug">
                          {alert.message}
                        </p>

                        {/* Botões de Ação Rápida para Solicitação de Ordem do Motorista */}
                        {isOrderRequest && !isDemo && user.profile !== UserProfile.Motorista && (
                          <div className="mt-2.5 flex items-center gap-2">
                            <button
                              type="button"
                              onClick={(e) => handleOpenDecisionForOffer(e, offerId)}
                              className="px-2.5 py-1 text-[11px] font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-all shadow-xs flex items-center gap-1"
                            >
                              <CheckCircle className="w-3.5 h-3.5" />
                              Aceitar / Recusar
                            </button>
                          </div>
                        )}
                      </div>

                      <ChevronRight className="w-4 h-4 text-gray-400 shrink-0 self-center" />
                    </div>
                  );
                })
              )}
            </div>

            {/* FOOTER DO POPUP */}
            <div className="p-3 bg-gray-50 dark:bg-gray-800/80 border-t border-gray-100 dark:border-gray-700 text-center">
              <p className="text-[11px] text-gray-500 dark:text-gray-400">
                Alertas ativos calculados em tempo real de acordo com seu perfil.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* MODAL DE DECISÃO DA SOLICITAÇÃO DE ORDEM */}
      {decisionOffer && (
        <OrderRequestDecisionModal
          isOpen={!!decisionOffer}
          onClose={() => setDecisionOffer(null)}
          offer={decisionOffer}
          cargo={decisionOffer.cargoId ? cargoMap.get(decisionOffer.cargoId) : undefined}
          driver={driverMap.get(decisionOffer.driverId || '')}
          driverUser={users?.find(u => u.id === decisionOffer.driverId)}
          client={clients?.find(c => c.id === (decisionOffer.clientId || (decisionOffer.cargoId ? cargoMap.get(decisionOffer.cargoId)?.clientId : '')))}
          product={products?.find(p => p.id === (decisionOffer.productId || (decisionOffer.cargoId ? cargoMap.get(decisionOffer.cargoId)?.productId : '')))}
          requestedEmbarcador={users?.find(u => u.id === decisionOffer.requestedEmbarcadorId)}
          onAccept={async (offer) => {
            setDecisionOffer(null);
            if (onAcceptOrderRequest) {
              await onAcceptOrderRequest(offer);
            } else if (onSaveFreightOffer) {
              const history = [...(offer.history || []), {
                id: `log_${Date.now()}_sys`,
                userId: user.id,
                timestamp: new Date().toISOString(),
                description: `Solicitação aceita por ${user.name}.`
              }];
              await onSaveFreightOffer({ ...offer, status: FreightOfferStatus.Aceita, history });
            }
          }}
          onRefuse={async (offer, reason) => {
            setDecisionOffer(null);
            if (onRefuseOrderRequest) {
              await onRefuseOrderRequest(offer, reason);
            } else if (onSaveFreightOffer) {
              const history = [...(offer.history || []), {
                id: `log_${Date.now()}_sys`,
                userId: user.id,
                timestamp: new Date().toISOString(),
                description: `Solicitação recusada por ${user.name}.${reason ? ` Motivo: ${reason}` : ''}`
              }];
              await onSaveFreightOffer({ ...offer, status: FreightOfferStatus.Recusada, history });
            }
          }}
        />
      )}
    </>
  );
};

export default NotificationBell;
