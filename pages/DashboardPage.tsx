
import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Card from '../components/Card';
import Header from '../components/Header';
import DonutChartCard from '../components/DonutChartCard';
import ShipmentFunnelCard from '../components/ShipmentFunnelCard';
import ShipperRankingCard from '../components/ShipperRankingCard';
import { TruckIcon } from '../components/icons/TruckIcon';
import { PackageIcon } from '../components/icons/PackageIcon';
import { DollarSignIcon } from '../components/icons/DollarSignIcon';
import { ClientsIcon } from '../components/icons/ClientsIcon';
import { WhatsAppIcon } from '../components/icons/WhatsAppIcon';
import { DashboardIcon } from '../components/icons/DashboardIcon';
import { ChevronDownIcon } from '../components/icons/ChevronDownIcon';
import { CheckCircleIcon } from '../components/icons/CheckCircleIcon';
import { Building2, ChevronRight, Calendar, ChevronDown, Check, X, Filter } from 'lucide-react';
import { CargoStatus, ShipmentStatus, UserProfile, FreightOfferStatus, REQUIRED_DOCUMENT_MAP } from '../types';
import type { Cargo, Driver, Shipment, User, Client, Product, Vehicle, FreightOffer, RiskQueryOption, Owner } from '../types';
import ShipmentDetailsModal from '../components/ShipmentDetailsModal';
import AttachmentModal from '../components/AttachmentModal';
import CadastroAnttModal from '../components/CadastroAnttModal';
import { OptimizedShipmentsBoard, KanbanColumnConfig } from '../components/OptimizedShipmentsBoard';
import FreightOfferModal from '../components/FreightOfferModal';
import FreightOffersList from '../components/FreightOffersList';
import DriverOrderRequestsList from '../components/DriverOrderRequestsList';
import { getMatchedCargo, getShipmentEffectiveDate, hasCteAttached, findCargoById, findProductForCargo, checkRequiresRiskManagement } from '../utils';

import ShipmentHistoryModal from '../components/ShipmentHistoryModal';
import NewShipmentModal from '../components/NewShipmentModal';
import ClientBranchesHistoryModal from '../components/ClientBranchesHistoryModal';

type DashboardViewMode = 'geral' | 'fiscal' | 'financeiro' | 'supervisor';

interface ViewModeConfig {
  id: DashboardViewMode;
  label: string;
  title: string;
  shortBadge: string;
  description: string;
  icon: React.FC<React.SVGProps<SVGSVGElement>>;
  color: string;
  badgeBg: string;
  badgeText: string;
}

const VIEW_MODES: ViewModeConfig[] = [
  {
    id: 'geral',
    label: 'Dashboard Geral',
    title: 'Dashboard',
    shortBadge: 'Geral',
    description: 'Indicadores, ofertas de frete, gráficos operacionais e ranking',
    icon: DashboardIcon,
    color: 'from-blue-600 to-indigo-600',
    badgeBg: 'bg-blue-100 dark:bg-blue-900/40 border-blue-200 dark:border-blue-700/50',
    badgeText: 'text-blue-700 dark:text-blue-300'
  },
  {
    id: 'fiscal',
    label: 'Dashboard Fiscal',
    title: 'Dashboard Fiscal',
    shortBadge: 'Fiscal',
    description: 'Controle de seguradora, cadastro ANTT e documentação fiscal',
    icon: CheckCircleIcon,
    color: 'from-emerald-600 to-teal-600',
    badgeBg: 'bg-emerald-100 dark:bg-emerald-900/40 border-emerald-200 dark:border-emerald-700/50',
    badgeText: 'text-emerald-700 dark:text-emerald-300'
  },
  {
    id: 'financeiro',
    label: 'Dashboard Financeiro',
    title: 'Dashboard Financeiro',
    shortBadge: 'Financeiro',
    description: 'Controle de adiantamentos, liquidação de saldos e trânsito',
    icon: DollarSignIcon,
    color: 'from-amber-500 to-orange-600',
    badgeBg: 'bg-amber-100 dark:bg-amber-900/40 border-amber-200 dark:border-amber-700/50',
    badgeText: 'text-amber-700 dark:text-amber-300'
  },
  {
    id: 'supervisor',
    label: 'Dashboard do Supervisor',
    title: 'Dashboard do Supervisor',
    shortBadge: 'Supervisor',
    description: 'Acompanhamento operacional e pesagem/carregamento de veículos',
    icon: TruckIcon,
    color: 'from-purple-600 to-indigo-600',
    badgeBg: 'bg-purple-100 dark:bg-purple-900/40 border-purple-200 dark:border-purple-700/50',
    badgeText: 'text-purple-700 dark:text-purple-300'
  }
];

interface DashboardPageProps {
  cargos: Cargo[];
  shipments: Shipment[];
  users: User[];
  currentUser: User | null;
  clients: Client[];
  products: Product[];
  companyLogo?: string | null;
  vehicles: Vehicle[];
  drivers?: Driver[];
  owners?: Owner[];
  onDeleteAttachment?: (shipmentId: string, url: string) => Promise<void>;
  onUpdateAttachment?: (shipmentId: string, data: any) => Promise<void>;
  onUpdateShipmentData?: (shipmentId: string, data: Partial<Shipment>, options?: { silent?: boolean }) => Promise<void>;
  onAddAttachments?: (shipmentId: string, files: File[]) => Promise<void>;
  onUpdateAnttAndBankDetails?: (shipmentId: string, data: { anttOwnerIdentifier: string; bankDetails?: string }) => Promise<void>;
  onUpdatePrice?: (shipmentId: string, data: { newTotal: number, newRate?: number, newCompanyRate?: number }) => void;
  freightOffers?: FreightOffer[];
  onSaveFreightOffer?: (offer: FreightOffer | Omit<FreightOffer, 'id' | 'createdAt'>) => Promise<void>;
  onAcceptFreightOffer?: (offer: FreightOffer) => void;
  onDeleteFreightOffer?: (offer: FreightOffer) => void;
  onConvertToCargo?: (offer: FreightOffer) => void;
  onCreateShipment?: (data: any) => Promise<void>;
  allShipments?: Shipment[];
  riskQueryOptions?: RiskQueryOption[];
  onSwapCargo?: (shipmentId: string, newCargoId: string) => void;
  realtimeStatus?: 'connected' | 'connecting' | 'disconnected' | 'error';
  lastSyncTime?: Date;
  onRefreshData?: (isBackground?: boolean) => Promise<void>;
}



interface ShipmentListCardProps {
  title: string;
  shipments: Shipment[];
  users: User[];
  thresholds?: { yellow: number; red: number }; // in minutes
  onShowDetails?: (shipment: Shipment) => void;
}

const ShipmentListCard: React.FC<ShipmentListCardProps> = ({ title, shipments, users, thresholds, onShowDetails }) => {
  const getEmbarcadorName = (embarcadorId: string): string => {
    return users.find(u => u.id === embarcadorId)?.name || 'N/A';
  };

  const getEmbarcadorWhatsAppLink = (embarcadorId: string): string | null => {
    const user = users.find(u => u.id === embarcadorId);
    if (!user || !user.phone) return null;
    const cleanedPhone = user.phone.replace(/\D/g, '');
    if (cleanedPhone.length >= 10) {
      return `https://wa.me/55${cleanedPhone}`;
    }
    return null;
  };
  
  const getElapsedTimeColor = (startTime: string): string => {
    if (!thresholds) return 'text-gray-800 dark:text-gray-200';

    const start = new Date(startTime).getTime();
    const now = Date.now();
    const diffMinutes = Math.floor((now - start) / (1000 * 60));

    if (diffMinutes > thresholds.red) {
      return 'text-red-500 dark:text-red-400';
    }
    if (diffMinutes > thresholds.yellow) {
      return 'text-yellow-500 dark:text-yellow-400';
    }
    return 'text-gray-800 dark:text-gray-200';
  };


  const formatElapsedTime = (startTime: string): string => {
      const start = new Date(startTime).getTime();
      const now = Date.now();
      const diffMinutes = Math.floor((now - start) / (1000 * 60));

      if (diffMinutes < 1) return '< 1 min';
      if (diffMinutes < 60) return `${diffMinutes} min`;

      const diffHours = Math.floor(diffMinutes / 60);
      if (diffHours < 24) {
          const remainingMinutes = diffMinutes % 60;
          return `${diffHours}h ${remainingMinutes}m`;
      }

      const diffDays = Math.floor(diffHours / 24);
      const remainingHours = diffHours % 24;
      return `${diffDays}d ${remainingHours}h`;
  };

  const formatDate = (timestamp: string) => {
    if (!timestamp) return '';
    return new Date(timestamp).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md col-span-1 lg:col-span-1">
      <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-200 mb-4">{title} ({shipments.length})</h3>
      <div className="max-h-80 overflow-y-auto space-y-3 pr-2">
        {shipments.length > 0 ? (
          shipments.map(shipment => {
            const currentStatusEntry = shipment.statusHistory?.[shipment.statusHistory.length - 1];
            const requestTimestamp = currentStatusEntry?.timestamp || shipment.createdAt;
            const timeColorClass = getElapsedTimeColor(requestTimestamp);
            
            return (
                <div key={shipment.id} className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-md border-l-4 border-primary">
                    <div className="flex justify-between items-start">
                        <div>
                            {onShowDetails ? (
                                <button
                                    onClick={() => onShowDetails(shipment)}
                                    className="font-mono text-xs text-primary dark:text-blue-400 font-bold mb-1 hover:underline text-left"
                                >
                                    {shipment.id}
                                </button>
                            ) : (
                                <p className="font-mono text-xs text-gray-500 mb-1">{shipment.id}</p>
                            )}
                            <p className="font-semibold text-gray-900 dark:text-white truncate">{shipment.driverName}</p>
                            <p className="text-sm text-gray-600 dark:text-gray-300">{shipment.horsePlate}</p>
                        </div>
                        <div className="text-right flex-shrink-0 ml-2">
                            <p className={`font-bold text-sm ${timeColorClass}`} title="Tempo de espera no status atual">{formatElapsedTime(requestTimestamp)}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">{formatDate(requestTimestamp)}</p>
                        </div>
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 flex items-center gap-1">
                      <span>Solicitante: {getEmbarcadorName(shipment.embarcadorId)}</span>
                      {(() => {
                        const link = getEmbarcadorWhatsAppLink(shipment.embarcadorId);
                        if (!link) return null;
                        return (
                          <a
                            href={link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center text-green-500 hover:text-green-600 dark:text-green-400 dark:hover:text-green-300 transition-colors"
                            title="Conversar com o embarcador no WhatsApp"
                          >
                            <WhatsAppIcon className="w-3 h-3" />
                          </a>
                        );
                      })()}
                    </div>
                </div>
            )
          })
        ) : (
          <p className="text-sm text-center text-gray-500 dark:text-gray-400 pt-8">Nenhum embarque neste status.</p>
        )}
      </div>
    </div>
  );
};


const DashboardPage: React.FC<DashboardPageProps> = ({ 
  cargos, 
  shipments, 
  users, 
  currentUser, 
  clients, 
  products, 
  companyLogo, 
  vehicles, 
  drivers = [], 
  owners = [],
  onDeleteAttachment, 
  onUpdateAttachment,
  onUpdateShipmentData,
  onAddAttachments,
  onUpdateAnttAndBankDetails,
  onUpdatePrice, 
  freightOffers = [], 
  onSaveFreightOffer, 
  onAcceptFreightOffer, 
  onDeleteFreightOffer, 
  onConvertToCargo, 
  onCreateShipment, 
  allShipments,
  riskQueryOptions,
  onSwapCargo,
  realtimeStatus,
  lastSyncTime,
  onRefreshData
}) => {
  const navigate = useNavigate();
  const [detailsModalShipment, setDetailsModalShipment] = React.useState<Shipment | null>(null);
  const [isOfferModalOpen, setIsOfferModalOpen] = React.useState(false);
  const [offerFilterStatus, setOfferFilterStatus] = React.useState<string>('all');
  const [offerFilterOrigin, setOfferFilterOrigin] = React.useState<string>('');
  const [offerFilterDestination, setOfferFilterDestination] = React.useState<string>('');
  const [selectedDriverForHistoryId, setSelectedDriverForHistoryId] = React.useState<string | null>(null);
  const [offerForNewShipment, setOfferForNewShipment] = React.useState<FreightOffer | null>(null);
  const [selectedClientForBranchesHistory, setSelectedClientForBranchesHistory] = useState<Client | null>(null);

  // Filtro de Período e Calendário para os Relatórios do Dashboard (Padrão: Mês Atual dos Efetivados)
  const [periodFilter, setPeriodFilter] = useState<'month' | 'today' | 'week' | 'year' | 'custom' | 'all'>('month');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
  const [showDatePickerPopup, setShowDatePickerPopup] = useState<boolean>(false);
  const datePickerPopoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showDatePickerPopup) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (datePickerPopoverRef.current && !datePickerPopoverRef.current.contains(e.target as Node)) {
        setShowDatePickerPopup(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowDatePickerPopup(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [showDatePickerPopup]);

  const dateRangeBounds = useMemo(() => {
    if (periodFilter === 'all') return { start: null, end: null };
    const now = new Date();

    if (periodFilter === 'today') {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).getTime();
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).getTime();
      return { start, end };
    }
    if (periodFilter === 'week') {
      const dayOfWeek = now.getDay();
      const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diffToMonday, 0, 0, 0, 0);
      const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6, 23, 59, 59, 999);
      return { start: monday.getTime(), end: sunday.getTime() };
    }
    if (periodFilter === 'month') {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0).getTime();
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999).getTime();
      return { start: firstDay, end: lastDay };
    }
    if (periodFilter === 'year') {
      const firstDay = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0).getTime();
      const lastDay = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999).getTime();
      return { start: firstDay, end: lastDay };
    }
    if (periodFilter === 'custom') {
      let start: number | null = null;
      let end: number | null = null;
      if (customStartDate) {
        const parts = customStartDate.split('-');
        if (parts.length === 3) {
          start = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), 0, 0, 0, 0).getTime();
        }
      }
      if (customEndDate) {
        const parts = customEndDate.split('-');
        if (parts.length === 3) {
          end = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), 23, 59, 59, 999).getTime();
        }
      }
      return { start, end };
    }
    return { start: null, end: null };
  }, [periodFilter, customStartDate, customEndDate]);

  const periodLabel = useMemo(() => {
    if (periodFilter === 'month') return 'Mês Atual';
    if (periodFilter === 'today') return 'Hoje';
    if (periodFilter === 'week') return 'Esta Semana';
    if (periodFilter === 'year') return 'Este Ano';
    if (periodFilter === 'custom') {
      if (customStartDate && customEndDate) {
        return `${customStartDate.split('-').reverse().join('/')} a ${customEndDate.split('-').reverse().join('/')}`;
      }
      return 'Período Personalizado';
    }
    return 'Todos os Períodos';
  }, [periodFilter, customStartDate, customEndDate]);

  const isShipmentEffectiveAndInPeriod = useCallback((s: Shipment): boolean => {
    if (s.status === ShipmentStatus.Cancelado || (s.status as string) === 'Cancelado') return false;

    // Embarque efetivado: ter CT-e emitido ou ter alcançado status de carregamento efetivo (Ag. Nota em diante)
    const effectiveStatuses: (string | ShipmentStatus)[] = [
      ShipmentStatus.AguardandoNota,
      'Ag. Nota',
      'Aguardando Nota',
      ShipmentStatus.AguardandoFiscal,
      'Ag. Fiscal',
      'Aguardando Fiscal',
      ShipmentStatus.AguardandoAdiantamento,
      'Ag. Adiantamento',
      'Aguardando Adiantamento',
      ShipmentStatus.AguardandoAgendamento,
      'Ag. Agendamento',
      'Ag. Agend. ou Troca/nfe',
      ShipmentStatus.AguardandoDescarga,
      'Ag. Descarga',
      'Aguardando Descarga',
      ShipmentStatus.ValidacaoTicket,
      'Valid. de Ticket',
      'Validação de Ticket',
      ShipmentStatus.AguardandoPagamentoSaldo,
      'Ag. Saldo',
      'Aguardando Saldo',
      ShipmentStatus.Finalizado,
      'Finalizado',
    ];

    const hasCte = Boolean(hasCteAttached(s) || (s.documents as any)?.cte_number || s.cteNumber);
    const isStatusEffective = effectiveStatuses.includes(s.status);

    if (!hasCte && !isStatusEffective) {
      return false;
    }

    if (dateRangeBounds.start === null && dateRangeBounds.end === null) {
      return true;
    }

    const effDateStr = getShipmentEffectiveDate(s);
    let timestamp = 0;
    if (effDateStr) {
      const parts = effDateStr.split('-');
      if (parts.length === 3) {
        timestamp = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), 12, 0, 0).getTime();
      } else {
        timestamp = new Date(effDateStr).getTime();
      }
    } else if (s.createdAt) {
      timestamp = new Date(s.createdAt).getTime();
    }

    if (!timestamp || isNaN(timestamp)) return false;
    if (dateRangeBounds.start !== null && timestamp < dateRangeBounds.start) return false;
    if (dateRangeBounds.end !== null && timestamp > dateRangeBounds.end) return false;

    return true;
  }, [dateRangeBounds]);
  // Modals state for quick direct actions (Attachment and ANTT)
  const [selectedShipmentForAttachment, setSelectedShipmentForAttachment] = useState<Shipment | null>(null);
  const [isAttachmentModalOpen, setAttachmentModalOpen] = useState(false);
  const [selectedShipmentForAntt, setSelectedShipmentForAntt] = useState<Shipment | null>(null);
  const [isAnttModalOpen, setAnttModalOpen] = useState(false);

  const handleOpenAttachmentModal = useCallback((shipment: Shipment) => {
    setSelectedShipmentForAttachment(shipment);
    setAttachmentModalOpen(true);
  }, []);

  const handleCloseAttachmentModal = useCallback(() => {
    setAttachmentModalOpen(false);
    setSelectedShipmentForAttachment(null);
  }, []);

  const handleSaveAttachment = useCallback(async (data: any) => {
    if (!selectedShipmentForAttachment || !onUpdateAttachment) return;
    try {
      await onUpdateAttachment(selectedShipmentForAttachment.id, data);
      handleCloseAttachmentModal();
    } catch (err) {
      console.error('Error in handleSaveAttachment:', err);
      throw err;
    }
  }, [selectedShipmentForAttachment, onUpdateAttachment, handleCloseAttachmentModal]);

  const handleOpenCadastroAntt = useCallback((shipment: Shipment) => {
    setSelectedShipmentForAntt(shipment);
    setAnttModalOpen(true);
  }, []);

  const handleSaveAntt = useCallback(async (data: { anttOwnerIdentifier: string; bankDetails?: string }) => {
    if (!selectedShipmentForAntt) return;
    if (onUpdateAnttAndBankDetails) {
      await onUpdateAnttAndBankDetails(selectedShipmentForAntt.id, data);
    } else if (onUpdateShipmentData) {
      await onUpdateShipmentData(selectedShipmentForAntt.id, data);
    }
    setAnttModalOpen(false);
    setSelectedShipmentForAntt(null);
  }, [selectedShipmentForAntt, onUpdateAnttAndBankDetails, onUpdateShipmentData]);

  // Kanban Column Configs for different profiles
  const fiscalColumns = useMemo<KanbanColumnConfig[]>(() => [
    {
      id: 'aguardando-cadastro',
      title: 'Aguardando Cadastro',
      statuses: [ShipmentStatus.PreCadastro],
      thresholds: { yellow: 60, red: 90 },
      accentColor: '#f59e0b',
      emptyText: 'Nenhum embarque aguardando cadastro ANTT'
    },
    {
      id: 'aguardando-seguradora',
      title: 'Aguardando Seguradora',
      statuses: [ShipmentStatus.AguardandoSeguradora],
      thresholds: { yellow: 30, red: 50 },
      accentColor: '#3b82f6',
      emptyText: 'Nenhum embarque aguardando liberação da seguradora'
    },
    {
      id: 'aguardando-nota',
      title: 'Aguardando Nota Fiscal',
      statuses: [ShipmentStatus.AguardandoNota],
      thresholds: { yellow: 120, red: 240 },
      accentColor: '#8b5cf6',
      emptyText: 'Nenhum embarque aguardando nota fiscal'
    },
    {
      id: 'aguardando-fiscal',
      title: 'Aguardando Fiscal',
      statuses: [ShipmentStatus.AguardandoFiscal],
      thresholds: { yellow: 120, red: 240 },
      accentColor: '#06b6d4',
      emptyText: 'Nenhum embarque aguardando documentação fiscal'
    }
  ], []);

  const grColumns = useMemo<KanbanColumnConfig[]>(() => [
    {
      id: 'aguardando-cadastro',
      title: 'Aguardando Cadastro',
      statuses: [ShipmentStatus.PreCadastro],
      thresholds: { yellow: 60, red: 90 },
      accentColor: '#f59e0b',
      emptyText: 'Nenhum embarque aguardando cadastro ANTT'
    },
    {
      id: 'aguardando-seguradora',
      title: 'Aguardando Seguradora',
      statuses: [ShipmentStatus.AguardandoSeguradora],
      thresholds: { yellow: 30, red: 50 },
      accentColor: '#3b82f6',
      emptyText: 'Nenhum embarque aguardando liberação da seguradora'
    }
  ], []);

  const financeiroColumns = useMemo<KanbanColumnConfig[]>(() => [
    {
      id: 'aguardando-adiantamento',
      title: 'Aguardando Pagamento de Adiantamento',
      statuses: [
        ShipmentStatus.AguardandoAdiantamento,
        'Ag. Adiantamento' as ShipmentStatus,
        'Aguardando Adiantamento' as ShipmentStatus,
        'Aguardando Pagamento de Adiantamento' as ShipmentStatus,
      ],
      thresholds: { yellow: 150, red: 165 }, // 2:30h alerta - 2:45h crítico
      accentColor: '#f59e0b',
      emptyText: 'Nenhum embarque aguardando adiantamento'
    },
    {
      id: 'em-transito',
      title: 'Em Trânsito / Entrega',
      statuses: [
        ShipmentStatus.AguardandoDescarga,
        'Ag. Descarga' as ShipmentStatus,
        'Aguardando Descarga' as ShipmentStatus,
        'Em Trânsito' as ShipmentStatus,
        'Em Transito' as ShipmentStatus,
        ShipmentStatus.ValidacaoTicket,
        'Valid. de Ticket' as ShipmentStatus,
        'Validação de Ticket' as ShipmentStatus,
      ],
      thresholds: { yellow: 24 * 60, red: 48 * 60 },
      accentColor: '#3b82f6',
      emptyText: 'Nenhum embarque em trânsito'
    },
    {
      id: 'aguardando-saldo',
      title: 'Aguardando Pagamento de Saldo',
      statuses: [
        ShipmentStatus.AguardandoPagamentoSaldo,
        'Ag. Saldo' as ShipmentStatus,
        'Aguardando Saldo' as ShipmentStatus,
        'Aguardando Pagamento de Saldo' as ShipmentStatus,
      ],
      thresholds: { yellow: 150, red: 165 }, // 2:30h alerta - 2:45h crítico
      accentColor: '#ef4444',
      emptyText: 'Nenhum embarque aguardando liquidação de saldo'
    }
  ], []);

  const supervisorColumns = useMemo<KanbanColumnConfig[]>(() => [
    {
      id: 'aguardando-carregamento',
      title: 'Embarques Aguardando Carregamento',
      statuses: [ShipmentStatus.AguardandoCarregamento],
      thresholds: { yellow: 60, red: 120 },
      accentColor: '#3b82f6',
      emptyText: 'Nenhum embarque aguardando carregamento'
    }
  ], []);

  const addOfferHistory = (offer: FreightOffer, description: string) => {
    const newLog = {
      id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      userId: currentUser?.id || '',
      timestamp: new Date().toISOString(),
      description
    };
    return [...(offer.history || []), newLog];
  };

  // Sync modal shipment with latest data from props
  useEffect(() => {
    if (detailsModalShipment) {
      const updated = shipments.find(s => s.id === detailsModalShipment.id);
      if (updated && JSON.stringify(updated) !== JSON.stringify(detailsModalShipment)) {
        setDetailsModalShipment(updated);
      }
    }
  }, [shipments, detailsModalShipment]);

  const cargoStatusData = useMemo(() => {
    const counts = cargos.reduce((acc, cargo) => {
      acc[cargo.status] = (acc[cargo.status] || 0) + 1;
      return acc;
    }, {} as Record<CargoStatus, number>);

    return [
      { label: CargoStatus.EmAndamento, value: counts[CargoStatus.EmAndamento] || 0, color: 'bg-blue-500' },
      { label: CargoStatus.Suspensa, value: counts[CargoStatus.Suspensa] || 0, color: 'bg-gray-500' },
      { label: CargoStatus.Fechada, value: counts[CargoStatus.Fechada] || 0, color: 'bg-blue-300' },
    ];
  }, [cargos]);

  const shipmentStatusData = useMemo(() => {
    const activeStatuses = Object.values(ShipmentStatus).filter(
      status => status !== ShipmentStatus.Finalizado && status !== ShipmentStatus.Cancelado
    );
    const counts = shipments.reduce((acc, shipment) => {
      acc[shipment.status] = (acc[shipment.status] || 0) + 1;
      return acc;
    }, {} as Record<ShipmentStatus, number>);

    return activeStatuses.map(status => ({
      label: status,
      value: counts[status] || 0,
    }));
  }, [shipments]);

  const clientVolumeData = useMemo(() => {
    const volumesByClient: Record<string, { total: number; branches: Record<string, { name: string; cnpj: string; city?: string; state?: string; volume: number; shipmentsCount: number }> }> = {};

    shipments.forEach(s => {
      if (!isShipmentEffectiveAndInPeriod(s)) return;

      const cargo = cargos.find(c => c.id === s.cargoId);
      if (cargo) {
        const client = clients.find(c => c.id === cargo.clientId);
        if (!volumesByClient[cargo.clientId]) {
          volumesByClient[cargo.clientId] = { total: 0, branches: {} };
        }
        const clientEntry = volumesByClient[cargo.clientId];
        const tonnage = Number(s.shipmentTonnage) || 0;
        clientEntry.total += tonnage;

            // Resolve branch
            let branchKey = 'matriz';
            let branchName = client?.nomeFantasia ? `${client.nomeFantasia} (Matriz)` : 'Matriz';
            let branchCnpj = client?.cnpj || '';
            let branchCity = client?.city;
            let branchState = client?.state;

            const branches = client?.secondaryCnpjs || [];
            let matchedBranch = undefined;
            if (cargo.clientBranchId) {
              matchedBranch = branches.find(b => b.id === cargo.clientBranchId);
            }
            if (!matchedBranch && cargo.clientCnpj) {
              const cleanCnpj = cargo.clientCnpj.replace(/\D/g, '');
              matchedBranch = branches.find(b => b.cnpj.replace(/\D/g, '') === cleanCnpj);
            }

            if (matchedBranch) {
              branchKey = matchedBranch.id || matchedBranch.cnpj;
              branchName = matchedBranch.nomeFantasia || matchedBranch.razaoSocial || 'Filial';
              branchCnpj = matchedBranch.cnpj;
              branchCity = matchedBranch.city;
              branchState = matchedBranch.state;
            }

            if (!clientEntry.branches[branchKey]) {
              clientEntry.branches[branchKey] = {
                name: branchName,
                cnpj: branchCnpj,
                city: branchCity,
                state: branchState,
                volume: 0,
                shipmentsCount: 0,
              };
            }
            clientEntry.branches[branchKey].volume += tonnage;
            clientEntry.branches[branchKey].shipmentsCount += 1;
      }
    });

    const colors = ['bg-blue-500', 'bg-emerald-500', 'bg-orange-500', 'bg-purple-500', 'bg-red-500', 'bg-yellow-500', 'bg-pink-500', 'bg-indigo-500'];
    
    return Object.entries(volumesByClient)
      .map(([clientId, data], index) => {
        const client = clients.find(c => c.id === clientId);
        const subItems = Object.values(data.branches)
          .map(b => ({
            label: b.name,
            value: b.volume,
            cnpj: b.cnpj,
            city: b.city,
            state: b.state,
            shipmentsCount: b.shipmentsCount
          }))
          .sort((a, b) => b.value - a.value);

        return {
          clientId,
          label: client ? client.nomeFantasia || client.razaoSocial : 'Desconhecido',
          value: data.total,
          color: colors[index % colors.length],
          subItems: (client?.secondaryCnpjs && client.secondaryCnpjs.length > 0) || subItems.length > 1 ? subItems : undefined,
        };
      })
      .sort((a, b) => b.value - a.value);
  }, [shipments, cargos, clients, isShipmentEffectiveAndInPeriod]);
  
  const activeShipments = useMemo(() => {
    return shipments.filter(s => s.status !== ShipmentStatus.Finalizado && s.status !== ShipmentStatus.Cancelado).length;
  }, [shipments]);

  const pendingLoads = useMemo(() => {
    return cargos.filter(c => c.status === CargoStatus.EmAndamento).length;
  }, [cargos]);

  const canViewRanking = useMemo(() => {
    if (!currentUser) return false;
    return [UserProfile.Desenvolvedor, UserProfile.Comercial, UserProfile.Supervisor, UserProfile.Admin, UserProfile.GerenciadoraDeRisco, UserProfile.Diretor, UserProfile.Demonstracao].includes(currentUser.profile);
  }, [currentUser]);

  const dashboardStats = useMemo(() => {
    let monthlyEffectiveTonnage = 0;
    
    shipments.forEach(s => {
      if (isShipmentEffectiveAndInPeriod(s)) {
        monthlyEffectiveTonnage += s.shipmentTonnage || 0;
      }
    });

    const monthlyCommission = monthlyEffectiveTonnage * 2;
    const canViewCommission = currentUser && [UserProfile.Desenvolvedor, UserProfile.Diretor, UserProfile.Comercial, UserProfile.Admin, UserProfile.GerenciadoraDeRisco, UserProfile.Demonstracao].includes(currentUser.profile);

    return {
      monthlyEffectiveTonnage,
      monthlyCommission,
      canViewCommission
    };
  }, [shipments, currentUser, isShipmentEffectiveAndInPeriod]);

  const clientDashboardData = useMemo(() => {
    if (currentUser?.profile !== UserProfile.Cliente) return null;

    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    let volumeLoadedThisMonth = 0;
    let volumeLoadedThisYear = 0;
    let scheduledVehicles = 0;
    let loadedAndFinishedVehicles = 0;

    const scheduledStatuses: (string | ShipmentStatus)[] = [
        ShipmentStatus.PreCadastro,
        'Ag. Cadastro',
        ShipmentStatus.AguardandoSeguradora,
        'Ag. Seguradora',
        ShipmentStatus.AguardandoCarregamento,
        'Ag. Carregamento',
        ShipmentStatus.AguardandoNota,
        'Ag. Nota',
        ShipmentStatus.AguardandoFiscal,
        'Ag. Fiscal',
        ShipmentStatus.AguardandoAdiantamento,
        'Ag. Adiantamento',
        ShipmentStatus.AguardandoAgendamento,
        'Ag. Agendamento',
        'Ag. Agend. ou Troca/nfe',
    ];

    const loadedAndFinishedStatuses: (string | ShipmentStatus)[] = [
        ShipmentStatus.AguardandoDescarga,
        'Ag. Descarga',
        ShipmentStatus.ValidacaoTicket,
        'Validação de Ticket',
        'Valid. de Ticket',
        ShipmentStatus.AguardandoPagamentoSaldo,
        'Ag. Saldo',
        ShipmentStatus.Finalizado,
        'Finalizado',
    ];

    const myClient = clients.find(c => c.id === currentUser.clientId);
    const clientCnpjs = new Set<string>();
    if (myClient?.cnpj) clientCnpjs.add(myClient.cnpj.replace(/\D/g, ''));
    (myClient?.secondaryCnpjs || []).forEach(b => {
      if (b.cnpj) clientCnpjs.add(b.cnpj.replace(/\D/g, ''));
    });

    const isClientCargo = (c: Cargo) => {
      if (c.clientId === currentUser.clientId) return true;
      const cleanCnpj = c.clientCnpj?.replace(/\D/g, '');
      if (cleanCnpj && clientCnpjs.has(cleanCnpj)) return true;
      return false;
    };

    const clientCargos = cargos.filter(isClientCargo);
    const clientCargoIds = new Set(clientCargos.map(c => c.id));
    const allShipmentsPool = (allShipments && allShipments.length > 0 ? allShipments : shipments);
    const myShipments = allShipmentsPool.filter(s => clientCargoIds.has(s.cargoId));

    const getEffectiveDate = (s: Shipment) => {
      const effDateStr = getShipmentEffectiveDate(s);
      if (effDateStr) return new Date(effDateStr + 'T00:00:00');
      if (s.createdAt) return new Date(s.createdAt);
      return null;
    };
    
    myShipments.forEach(s => {
        if (s.status === ShipmentStatus.Cancelado || (s.status as string) === 'Cancelado') return;

        // Volume calculations
        const effectiveDate = getEffectiveDate(s);
        if (effectiveDate && !isNaN(effectiveDate.getTime())) {
            if (effectiveDate.getFullYear() === currentYear) {
                volumeLoadedThisYear += (s.shipmentTonnage || 0);
                if (effectiveDate.getMonth() === currentMonth) {
                    volumeLoadedThisMonth += (s.shipmentTonnage || 0);
                }
            }
        }

        // Vehicle status counts
        if (scheduledStatuses.includes(s.status)) {
            scheduledVehicles++;
        }
        if (loadedAndFinishedStatuses.includes(s.status)) {
            loadedAndFinishedVehicles++;
        }
    });

    return {
        pendingLoads: clientCargos.filter(c => (c.status || '').toLowerCase().includes('andamento')).length,
        volumeLoadedThisMonth,
        volumeLoadedThisYear,
        scheduledVehicles,
        loadedAndFinishedVehicles,
    };
  }, [cargos, shipments, allShipments, currentUser, clients]);

  // View mode switcher for Admin / Diretor / Demo / Gerenciadora de Risco
  const canSwitchView = useMemo(() => {
    if (!currentUser) return false;
    return [
      UserProfile.Desenvolvedor,
      UserProfile.Admin,
      UserProfile.GerenciadoraDeRisco,
      UserProfile.Diretor,
      UserProfile.Demonstracao,
    ].includes(currentUser.profile);
  }, [currentUser]);

  const [viewMode, setViewMode] = useState<DashboardViewMode>(() => {
    if (currentUser?.profile === UserProfile.Fiscal) return 'fiscal';
    if (currentUser?.profile === UserProfile.Financeiro) return 'financeiro';
    if (currentUser?.profile === UserProfile.Supervisor) return 'supervisor';

    const saved = localStorage.getItem('transcunha_dashboard_view_mode');
    if (saved && ['geral', 'fiscal', 'financeiro', 'supervisor'].includes(saved)) {
      return saved as DashboardViewMode;
    }
    return 'geral';
  });

  const [isViewSelectorOpen, setIsViewSelectorOpen] = useState(false);
  const viewSelectorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (viewSelectorRef.current && !viewSelectorRef.current.contains(event.target as Node)) {
        setIsViewSelectorOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsViewSelectorOpen(false);
      }
    };
    if (isViewSelectorOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isViewSelectorOpen]);

  const renderPeriodSelector = () => {
    const periodOptions = [
      { id: 'month', label: 'Este Mês', badge: 'Padrão' },
      { id: 'week', label: 'Esta Semana' },
      { id: 'today', label: 'Hoje' },
      { id: 'year', label: 'Este Ano' },
      { id: 'custom', label: 'Personalizado...' },
      { id: 'all', label: 'Todos os Períodos' },
    ];

    return (
      <div className="relative inline-block text-left" ref={datePickerPopoverRef}>
        <button
          type="button"
          onClick={() => setShowDatePickerPopup(prev => !prev)}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all duration-200 border shadow-sm ${
            periodFilter === 'month'
              ? 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-700 hover:border-primary/50 dark:hover:border-blue-500'
              : 'bg-primary/10 text-primary dark:bg-blue-900/30 dark:text-blue-300 border-primary/30 dark:border-blue-700 hover:bg-primary/15'
          }`}
          title="Filtrar período das métricas e relatórios do Dashboard"
          aria-expanded={showDatePickerPopup}
        >
          <Calendar className="w-4 h-4 text-primary dark:text-blue-400 shrink-0" />
          <span className="truncate max-w-[170px] sm:max-w-[220px]">
            {periodFilter === 'month' ? 'Período: Este Mês' : `Período: ${periodLabel}`}
          </span>
          <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${showDatePickerPopup ? 'rotate-180' : ''}`} />
        </button>

        {showDatePickerPopup && (
          <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl bg-white dark:bg-gray-800 shadow-2xl ring-1 ring-black/10 dark:ring-white/10 z-50 p-3 border border-gray-100 dark:border-gray-700 backdrop-blur-xl animate-in fade-in slide-in-from-top-2 duration-150">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-gray-100 dark:border-gray-700">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-primary dark:text-blue-400" />
                <h4 className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">
                  Filtrar por Período
                </h4>
              </div>
              <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                Apenas Efetivados
              </span>
            </div>

            <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-3 leading-relaxed">
              Exibe apenas embarques efetivados (com CT-e ou carregamento concluído) dentro do período selecionado.
            </p>

            <div className="grid grid-cols-2 gap-1.5 mb-3">
              {periodOptions.map(opt => {
                const isActive = periodFilter === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      setPeriodFilter(opt.id as any);
                      if (opt.id !== 'custom') {
                        setShowDatePickerPopup(false);
                      }
                    }}
                    className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                      isActive
                        ? 'bg-primary text-white shadow-sm'
                        : 'bg-gray-50 dark:bg-gray-700/60 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                  >
                    <span className="truncate">{opt.label}</span>
                    {opt.badge && !isActive && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-300 ml-1 font-bold">
                        {opt.badge}
                      </span>
                    )}
                    {isActive && <Check className="w-3.5 h-3.5 shrink-0 ml-1" />}
                  </button>
                );
              })}
            </div>

            {/* Custom Date Range Inputs */}
            {periodFilter === 'custom' && (
              <div className="p-3 bg-gray-50 dark:bg-gray-700/40 rounded-xl border border-gray-200/80 dark:border-gray-600/60 mb-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-gray-700 dark:text-gray-300">
                    Definir Intervalo:
                  </span>
                  {(customStartDate || customEndDate) && (
                    <button
                      type="button"
                      onClick={() => {
                        setCustomStartDate('');
                        setCustomEndDate('');
                      }}
                      className="text-[10px] text-gray-400 hover:text-red-500 transition-colors"
                    >
                      Limpar datas
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-medium text-gray-500 dark:text-gray-400 mb-0.5">
                      Data Inicial
                    </label>
                    <input
                      type="date"
                      value={customStartDate}
                      onChange={(e) => setCustomStartDate(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-800 dark:text-gray-200 focus:ring-2 focus:ring-primary focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-medium text-gray-500 dark:text-gray-400 mb-0.5">
                      Data Final
                    </label>
                    <input
                      type="date"
                      value={customEndDate}
                      onChange={(e) => setCustomEndDate(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-800 dark:text-gray-200 focus:ring-2 focus:ring-primary focus:outline-none"
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowDatePickerPopup(false)}
                  disabled={!customStartDate && !customEndDate}
                  className="w-full mt-2 py-1.5 text-xs font-semibold bg-primary hover:bg-primary-hover text-white rounded-lg transition-all disabled:opacity-50"
                >
                  Aplicar Período
                </button>
              </div>
            )}

            <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-gray-700 text-[11px]">
              <span className="text-gray-500 dark:text-gray-400">
                Ativo: <strong className="text-gray-700 dark:text-gray-200">{periodLabel}</strong>
              </span>
              {periodFilter !== 'month' && (
                <button
                  type="button"
                  onClick={() => {
                    setPeriodFilter('month');
                    setCustomStartDate('');
                    setCustomEndDate('');
                    setShowDatePickerPopup(false);
                  }}
                  className="text-primary dark:text-blue-400 hover:underline font-medium"
                >
                  Restaurar Mês Atual
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  const currentViewConfig = VIEW_MODES.find(m => m.id === viewMode) || VIEW_MODES[0];

  const renderHeaderTitle = () => {
    if (!canSwitchView) {
      return currentViewConfig.title;
    }

    return (
      <div className="relative inline-block text-left" ref={viewSelectorRef}>
        <button
          type="button"
          onClick={() => setIsViewSelectorOpen(prev => !prev)}
          className="group flex items-center gap-3 px-3 py-1.5 -ml-3 rounded-2xl hover:bg-gray-100/90 dark:hover:bg-gray-800/90 border border-transparent hover:border-gray-200 dark:hover:border-gray-700 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary/40 active:scale-[0.99]"
          aria-expanded={isViewSelectorOpen}
          aria-haspopup="true"
          title="Clique para alternar o modo de visualização do Dashboard"
        >
          <div className="flex items-center gap-2.5">
            <h1 className="text-3xl font-extrabold text-gray-900 dark:text-white tracking-tight group-hover:text-primary dark:group-hover:text-blue-400 transition-colors">
              {currentViewConfig.title}
            </h1>
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border transition-all ${currentViewConfig.badgeBg} ${currentViewConfig.badgeText}`}>
              {currentViewConfig.shortBadge}
            </span>
          </div>
          <div className={`p-1.5 rounded-xl bg-gray-100 dark:bg-gray-700/80 text-gray-600 dark:text-gray-300 group-hover:bg-primary group-hover:text-white dark:group-hover:bg-blue-600 transition-all duration-200 shadow-sm ${isViewSelectorOpen ? 'bg-primary text-white dark:bg-blue-600 rotate-180' : ''}`}>
            <ChevronDownIcon className="w-4 h-4" />
          </div>
        </button>

        {isViewSelectorOpen && (
          <div className="absolute left-0 mt-2 w-80 sm:w-96 rounded-2xl bg-white dark:bg-gray-800 shadow-2xl ring-1 ring-black/10 dark:ring-white/10 z-50 p-2 border border-gray-100 dark:border-gray-700 backdrop-blur-xl animate-in fade-in slide-in-from-top-2 duration-150">
            <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-700/60 mb-1 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                  Modo de Visualização
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Selecione o Dashboard desejado
                </p>
              </div>
              <span className="text-[10px] font-medium text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full">
                Admin
              </span>
            </div>

            <div className="space-y-1">
              {VIEW_MODES.map((mode) => {
                const isSelected = viewMode === mode.id;
                const Icon = mode.icon;
                return (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => {
                      setViewMode(mode.id);
                      localStorage.setItem('transcunha_dashboard_view_mode', mode.id);
                      setIsViewSelectorOpen(false);
                    }}
                    className={`w-full flex items-start gap-3 p-2.5 rounded-xl text-left transition-all duration-150 group ${
                      isSelected
                        ? 'bg-blue-50/90 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/60 shadow-sm'
                        : 'hover:bg-gray-50 dark:hover:bg-gray-700/50 border border-transparent'
                    }`}
                  >
                    <div className={`p-2 rounded-xl flex-shrink-0 transition-all ${
                      isSelected
                        ? 'bg-gradient-to-br ' + mode.color + ' text-white shadow-md'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 group-hover:bg-primary/10 group-hover:text-primary dark:group-hover:text-blue-400'
                    }`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className={`text-sm font-bold ${
                          isSelected ? 'text-blue-700 dark:text-blue-300' : 'text-gray-800 dark:text-gray-200 group-hover:text-gray-900 dark:group-hover:text-white'
                        }`}>
                          {mode.label}
                        </span>
                        {isSelected && (
                          <span className="flex items-center text-[10px] font-bold text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/50 px-2 py-0.5 rounded-full">
                            Ativo
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2 leading-relaxed">
                        {mode.description}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  };

  if (currentUser?.profile === UserProfile.Embarcador) {
    const pendingRequests = freightOffers?.filter(o => {
       if (o.status !== FreightOfferStatus.Pendente) return false;
       if (!o.driverId) return false;
       const reqTime = o.requestTimestamp ? new Date(o.requestTimestamp).getTime() : new Date(o.createdAt).getTime();
       const now = Date.now();
       if ((now - reqTime) >= 10 * 60 * 1000) return false; // Expirada aos 10 minutos
       if (o.requestedEmbarcadorId === currentUser.id) return true;
       if ((now - reqTime) > 5 * 60 * 1000) return true;
       return false;
    }) || [];

    return (
      <>
        <Header title="Dashboard do Embarcador">
          {renderPeriodSelector()}
        </Header>
        {pendingRequests.length > 0 && (
          <div className="mb-8">
            <DriverOrderRequestsList
              title="Solicitações de Ordem de Carregamento (Motoristas)"
              requests={pendingRequests}
              clients={clients}
              products={products}
              cargos={cargos}
              drivers={drivers}
              users={users}
              currentUser={currentUser}
              onAccept={async (offer) => {
                // Open NewShipmentModal pre-filled with driver data without closing the request prematurely
                setOfferForNewShipment(offer);
              }}
              onRefuse={async (offer, reason) => {
                const refusalReason = reason || 'Solicitação de ordem recusada pelo embarcador';
                if (onSaveFreightOffer) {
                  const history = [...(offer.history || []), {
                    id: `log_${Date.now()}_sys`,
                    userId: currentUser.id,
                    timestamp: new Date().toISOString(),
                    description: `Solicitação de ordem recusada por ${currentUser.name}. Motivo: ${refusalReason}`
                  }];
                  await onSaveFreightOffer({ ...offer, status: FreightOfferStatus.Recusada, history });
                }
                // Registrar no histórico de cancelados
                if (offer.cargoId && onCreateShipment) {
                  const driverUser = users.find(u => u.id === offer.driverId);
                  const driverInDb = drivers.find(d => d.id === offer.driverId || (driverUser?.email && d.cpf.replace(/\D/g, '') === driverUser.email.replace(/\D/g, '')));
                  const dName = driverInDb?.name || driverUser?.name || (offer as any).driverName || 'Motorista';
                  const dCpf = driverInDb?.cpf || (driverUser?.email && driverUser.email.replace(/\D/g, '').length === 11 ? driverUser.email : '') || (offer as any).driverCpf || '';
                  const dContact = driverInDb?.phone || driverUser?.phone || (offer as any).driverContact || '';

                  const cargo = cargos.find(c => c.id === offer.cargoId);
                  const ton = offer.totalTonnage || (cargo ? Math.max(0, cargo.scheduledVolume - cargo.loadedVolume) : 0) || 0;
                  const driverFreightRate = offer.freightValuePerTon || cargo?.driverFreightValuePerTon || 0;

                  await onCreateShipment({
                    cargoId: offer.cargoId,
                    driverName: dName,
                    driverCpf: dCpf,
                    driverContact: dContact,
                    embarcadorId: currentUser.id,
                    horsePlate: '-',
                    shipmentTonnage: ton,
                    driverFreightValue: driverFreightRate * ton,
                    driverFreightRateSnapshot: driverFreightRate,
                    status: ShipmentStatus.Cancelado,
                    scheduledDate: new Date().toISOString().split('T')[0],
                    cancellationReason: refusalReason,
                    history: [{
                      id: `log_${Date.now()}_refusal`,
                      userId: currentUser.id,
                      timestamp: new Date().toISOString(),
                      description: `Solicitação de ordem do motorista ${dName} recusada. Motivo: ${refusalReason}`
                    }]
                  });
                }
              }}
              onShowDriverHistory={(driverId) => setSelectedDriverForHistoryId(driverId)}
            />
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card
            title="Embarques Ativos"
            value={activeShipments.toString()}
            icon={<TruckIcon className="w-6 h-6 text-white" />}
            colorClass="bg-primary"
          />
          <Card
            title="Cargas em Andamento"
            value={pendingLoads.toString()}
            icon={<PackageIcon className="w-6 h-6 text-white" />}
            colorClass="bg-secondary"
          />
        </div>
        <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-6">
            <DonutChartCard title="Distribuição de Cargas por Status" data={cargoStatusData} />
            <DonutChartCard 
              title={`Volume Carregado por Cliente (${periodLabel})`} 
              data={clientVolumeData} 
              unit="t" 
              onViewClientHistory={(clientId) => {
                const cl = clients.find(c => c.id === clientId);
                if (cl) setSelectedClientForBranchesHistory(cl);
              }}
            />
          </div>
          <ShipmentFunnelCard title="Funil de Embarques" data={shipmentStatusData} />
          <ShipperRankingCard shipments={allShipments || shipments} cargos={cargos} users={users} currentUser={currentUser} dateRangeBounds={dateRangeBounds} periodLabel={periodLabel} />
        </div>
        <ShipmentDetailsModal
          isOpen={!!detailsModalShipment}
          onClose={() => setDetailsModalShipment(null)}
          shipment={detailsModalShipment}
          cargo={detailsModalShipment ? (findCargoById(cargos, detailsModalShipment.cargoId) || cargos.find(c => c.id === detailsModalShipment.cargoId)) : undefined}
          currentUser={currentUser}
          clients={clients}
          products={products}
          companyLogo={companyLogo}
          vehicles={vehicles}
          users={users}
          onDeleteAttachment={onDeleteAttachment}
          onUpdatePrice={onUpdatePrice}
          onUpdateShipmentData={onUpdateShipmentData}
          onAddAttachments={onAddAttachments}
          onSwapCargo={onSwapCargo}
          cargos={cargos}
        />
        {offerForNewShipment && onCreateShipment && (
          <NewShipmentModal
            isOpen={!!offerForNewShipment}
            onClose={() => setOfferForNewShipment(null)}
            onSave={async (data) => {
              if (onSaveFreightOffer && offerForNewShipment) {
                const history = [...(offerForNewShipment.history || []), {
                  id: `log_${Date.now()}_sys`,
                  userId: currentUser.id,
                  timestamp: new Date().toISOString(),
                  description: `Solicitação de ordem aceita por ${currentUser.name}. Embarque criado com sucesso.`
                }];
                await onSaveFreightOffer({ ...offerForNewShipment, status: FreightOfferStatus.Aceita, history });
              }
              await onCreateShipment({
                cargoId: offerForNewShipment.cargoId,
                ...data
              });
              setOfferForNewShipment(null);
            }}
            cargo={findCargoById(cargos, offerForNewShipment.cargoId) || null}
            drivers={drivers}
            owners={owners}
            clients={clients}
            vehicles={vehicles}
            currentUser={currentUser}
            shipments={shipments}
            users={users}
            offer={offerForNewShipment}
          />
        )}
      </>
    );
  }

  if (!canSwitchView && currentUser?.profile === UserProfile.Supervisor) {
    const totalActiveLoads = cargos.filter(c => c.status === CargoStatus.EmAndamento || c.status === CargoStatus.Suspensa).length;
    const shipmentsAwaitingLoading = shipments.filter(s => s.status === ShipmentStatus.AguardandoCarregamento);

    const SEVENTY_TWO_HOURS_MS = 72 * 60 * 60 * 1000;
    const pendingOffers = freightOffers.filter(o => {
      if (o.status === FreightOfferStatus.Recusada || o.driverId) return false;
      const age = Date.now() - new Date(o.createdAt).getTime();
      if (age > SEVENTY_TWO_HOURS_MS) return false;
      return true;
    });

    return (
      <>
        <Header title="Dashboard do Supervisor" />
        {pendingOffers.length > 0 && (
          <div className="mb-8">
            <FreightOffersList
              offers={pendingOffers}
              clients={clients}
              products={products}
              cargos={cargos}
              users={users}
              isClientProfile={false}
              onAccept={async (offer) => {
                if (onAcceptFreightOffer) {
                  onAcceptFreightOffer(offer);
                } else if (onSaveFreightOffer) {
                  const history = addOfferHistory(offer, `Oferta aceita pela Transportadora.`);
                  await onSaveFreightOffer({ ...offer, status: FreightOfferStatus.Aceita, history });
                }
              }}
              onRefuse={async (offer) => {
                if (onSaveFreightOffer) {
                  const history = addOfferHistory(offer, `Oferta recusada pela Transportadora.`);
                  await onSaveFreightOffer({ ...offer, status: FreightOfferStatus.Recusada, history });
                }
              }}
              onCounterOffer={async (offer, newValue) => {
                if (onSaveFreightOffer) {
                  if (offer.status === FreightOfferStatus.AguardandoPreco) {
                    const history = addOfferHistory(offer, `Preço inicial de R$ ${newValue.toFixed(2)} enviado pela Transportadora.`);
                    await onSaveFreightOffer({ ...offer, status: FreightOfferStatus.AnaliseCliente, freightValuePerTon: newValue, history });
                  } else if (offer.status === FreightOfferStatus.AnaliseCliente) {
                    const oldPrice = offer.freightValuePerTon ? ` (era R$ ${offer.freightValuePerTon.toFixed(2)})` : '';
                    const history = addOfferHistory(offer, `Preço inicial editado para R$ ${newValue.toFixed(2)} pela Transportadora${oldPrice}.`);
                    await onSaveFreightOffer({ ...offer, status: FreightOfferStatus.AnaliseCliente, freightValuePerTon: newValue, history });
                  } else {
                    const history = addOfferHistory(offer, `Contraproposta de R$ ${newValue.toFixed(2)} enviada pela Transportadora.`);
                    await onSaveFreightOffer({ ...offer, status: FreightOfferStatus.Contraproposta, counterOfferValue: newValue, history });
                  }
                }
              }}
              currentUser={currentUser || undefined}
              onDelete={onDeleteFreightOffer}
              onConvertToCargo={onConvertToCargo}
              onSaveFreightOffer={onSaveFreightOffer}
            />
          </div>
        )}
        <div className="mb-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
           <Card
              title="Total de Cargas Ativas"
              value={totalActiveLoads.toString()}
              icon={<PackageIcon className="w-6 h-6 text-white" />}
              colorClass="bg-blue-500"
            />
            <Card
              title="Aguardando Carregamento"
              value={shipmentsAwaitingLoading.length.toString()}
              icon={<TruckIcon className="w-6 h-6 text-white" />}
              colorClass="bg-primary"
            />
        </div>

        <div className="mb-8">
          <OptimizedShipmentsBoard
            title="Embarques Aguardando Carregamento"
            description="Controle e acompanhamento de veículos agendados para pesagem e carregamento"
            columns={supervisorColumns}
            shipments={shipments}
            cargos={cargos}
            clients={clients}
            products={products}
            users={users}
            drivers={drivers}
            vehicles={vehicles}
            currentUser={currentUser}
            onShowDetails={setDetailsModalShipment}
            onAttach={onUpdateAttachment ? handleOpenAttachmentModal : undefined}
            onOpenCadastroAntt={handleOpenCadastroAntt}
            onEditPrice={onUpdatePrice ? (s) => setDetailsModalShipment(s) : undefined}
          />
        </div>
        <ShipmentDetailsModal
          isOpen={!!detailsModalShipment}
          onClose={() => setDetailsModalShipment(null)}
          shipment={detailsModalShipment}
          cargo={detailsModalShipment ? (cargos.find(c => String(c.id) === String(detailsModalShipment.cargoId)) || cargos.find(c => c.id === detailsModalShipment.cargoId)) : undefined}
          currentUser={currentUser}
          clients={clients}
          products={products}
          companyLogo={companyLogo}
          vehicles={vehicles}
          users={users}
          onDeleteAttachment={onDeleteAttachment}
          onUpdatePrice={onUpdatePrice}
          onUpdateShipmentData={onUpdateShipmentData}
          onAddAttachments={onAddAttachments}
        />
        {selectedShipmentForAttachment && currentUser && (
          <AttachmentModal
            isOpen={isAttachmentModalOpen}
            onClose={handleCloseAttachmentModal}
            onSave={handleSaveAttachment}
            shipment={shipments.find(s => s.id === selectedShipmentForAttachment.id) || selectedShipmentForAttachment}
            documentName={REQUIRED_DOCUMENT_MAP[selectedShipmentForAttachment.status] || 'Documento'}
            currentUser={currentUser}
            cargo={findCargoById(cargos, selectedShipmentForAttachment.cargoId)}
            requiresRiskManagement={
              checkRequiresRiskManagement(
                findCargoById(cargos, selectedShipmentForAttachment.cargoId),
                findProductForCargo(products, findCargoById(cargos, selectedShipmentForAttachment.cargoId))
              )
            }
            products={products}
            clients={clients}
            users={users}
            riskQueryOptions={riskQueryOptions}
            onUpdateShipmentData={onUpdateShipmentData}
            onDeleteAttachment={onDeleteAttachment}
          />
        )}
        {selectedShipmentForAntt && (
          <CadastroAnttModal
            isOpen={isAnttModalOpen}
            onClose={() => {
              setAnttModalOpen(false);
              setSelectedShipmentForAntt(null);
            }}
            onSave={handleSaveAntt}
            shipment={selectedShipmentForAntt}
          />
        )}
      </>
    );
  }

  if (!canSwitchView && currentUser?.profile === UserProfile.GerenciadoraDeRisco) {
    return (
      <>
        <Header title="Dashboard GR" />
        <div className="mb-8">
          <OptimizedShipmentsBoard
            title="Gestão de Risco dos Embarques"
            description="Controle e acompanhamento de autorizações de seguradora e cadastros"
            columns={grColumns}
            shipments={shipments}
            cargos={cargos}
            clients={clients}
            products={products}
            users={users}
            drivers={drivers}
            vehicles={vehicles}
            currentUser={currentUser}
            onShowDetails={setDetailsModalShipment}
            onAttach={onUpdateAttachment ? handleOpenAttachmentModal : undefined}
            onOpenCadastroAntt={handleOpenCadastroAntt}
            onEditPrice={onUpdatePrice ? (s) => setDetailsModalShipment(s) : undefined}
          />
        </div>
        <ShipmentDetailsModal
          isOpen={!!detailsModalShipment}
          onClose={() => setDetailsModalShipment(null)}
          shipment={detailsModalShipment}
          cargo={detailsModalShipment ? (cargos.find(c => String(c.id) === String(detailsModalShipment.cargoId)) || cargos.find(c => c.id === detailsModalShipment.cargoId)) : undefined}
          currentUser={currentUser}
          clients={clients}
          products={products}
          companyLogo={companyLogo}
          vehicles={vehicles}
          users={users}
          onDeleteAttachment={onDeleteAttachment}
          onUpdatePrice={onUpdatePrice}
          onUpdateShipmentData={onUpdateShipmentData}
          onAddAttachments={onAddAttachments}
          onSwapCargo={onSwapCargo}
          cargos={cargos}
        />
        {selectedShipmentForAttachment && currentUser && (
          <AttachmentModal
            isOpen={isAttachmentModalOpen}
            onClose={handleCloseAttachmentModal}
            onSave={handleSaveAttachment}
            shipment={shipments.find(s => s.id === selectedShipmentForAttachment.id) || selectedShipmentForAttachment}
            documentName={REQUIRED_DOCUMENT_MAP[selectedShipmentForAttachment.status] || 'Documento'}
            currentUser={currentUser}
            cargo={findCargoById(cargos, selectedShipmentForAttachment.cargoId)}
            requiresRiskManagement={
              checkRequiresRiskManagement(
                findCargoById(cargos, selectedShipmentForAttachment.cargoId),
                findProductForCargo(products, findCargoById(cargos, selectedShipmentForAttachment.cargoId))
              )
            }
            products={products}
            clients={clients}
            users={users}
            riskQueryOptions={riskQueryOptions}
            onUpdateShipmentData={onUpdateShipmentData}
            onDeleteAttachment={onDeleteAttachment}
          />
        )}
        {selectedShipmentForAntt && (
          <CadastroAnttModal
            isOpen={isAnttModalOpen}
            onClose={() => {
              setAnttModalOpen(false);
              setSelectedShipmentForAntt(null);
            }}
            onSave={handleSaveAntt}
            shipment={selectedShipmentForAntt}
          />
        )}
      </>
    );
  }

  if (!canSwitchView && currentUser?.profile === UserProfile.Fiscal) {
    return (
      <>
        <Header title="Dashboard Fiscal" />
        <div className="mb-8">
          <OptimizedShipmentsBoard
            title="Gestão Fiscal dos Embarques"
            description="Controle e acompanhamento de autorizações de seguradora, cadastros e documentação fiscal"
            columns={fiscalColumns}
            shipments={shipments}
            cargos={cargos}
            clients={clients}
            products={products}
            users={users}
            drivers={drivers}
            vehicles={vehicles}
            currentUser={currentUser}
            onShowDetails={setDetailsModalShipment}
            onAttach={onUpdateAttachment ? handleOpenAttachmentModal : undefined}
            onOpenCadastroAntt={handleOpenCadastroAntt}
            onEditPrice={onUpdatePrice ? (s) => setDetailsModalShipment(s) : undefined}
            realtimeStatus={realtimeStatus}
            lastSyncTime={lastSyncTime}
            onRefreshData={onRefreshData}
          />
        </div>
        <ShipmentDetailsModal
          isOpen={!!detailsModalShipment}
          onClose={() => setDetailsModalShipment(null)}
          shipment={detailsModalShipment}
          cargo={detailsModalShipment ? (cargos.find(c => String(c.id) === String(detailsModalShipment.cargoId)) || cargos.find(c => c.id === detailsModalShipment.cargoId)) : undefined}
          currentUser={currentUser}
          clients={clients}
          products={products}
          companyLogo={companyLogo}
          vehicles={vehicles}
          users={users}
          onDeleteAttachment={onDeleteAttachment}
          onUpdatePrice={onUpdatePrice}
          onUpdateShipmentData={onUpdateShipmentData}
          onAddAttachments={onAddAttachments}
          onSwapCargo={onSwapCargo}
          cargos={cargos}
        />
        {selectedShipmentForAttachment && currentUser && (
          <AttachmentModal
            isOpen={isAttachmentModalOpen}
            onClose={handleCloseAttachmentModal}
            onSave={handleSaveAttachment}
            shipment={shipments.find(s => s.id === selectedShipmentForAttachment.id) || selectedShipmentForAttachment}
            documentName={REQUIRED_DOCUMENT_MAP[selectedShipmentForAttachment.status] || 'Documento'}
            currentUser={currentUser}
            cargo={findCargoById(cargos, selectedShipmentForAttachment.cargoId)}
            requiresRiskManagement={
              checkRequiresRiskManagement(
                findCargoById(cargos, selectedShipmentForAttachment.cargoId),
                findProductForCargo(products, findCargoById(cargos, selectedShipmentForAttachment.cargoId))
              )
            }
            products={products}
            clients={clients}
            users={users}
            riskQueryOptions={riskQueryOptions}
            onUpdateShipmentData={onUpdateShipmentData}
            onDeleteAttachment={onDeleteAttachment}
          />
        )}
        {selectedShipmentForAntt && (
          <CadastroAnttModal
            isOpen={isAnttModalOpen}
            onClose={() => {
              setAnttModalOpen(false);
              setSelectedShipmentForAntt(null);
            }}
            onSave={handleSaveAntt}
            shipment={selectedShipmentForAntt}
          />
        )}
      </>
    );
  }

  if (!canSwitchView && currentUser?.profile === UserProfile.Financeiro) {
    return (
      <>
        <Header title="Dashboard Financeiro" />
        <div className="mb-8">
          <OptimizedShipmentsBoard
            title="Gestão Financeira dos Embarques"
            description="Controle e liquidação de adiantamentos, saldos e monitoramento de trânsito em tempo real"
            columns={financeiroColumns}
            shipments={shipments}
            cargos={cargos}
            clients={clients}
            products={products}
            users={users}
            drivers={drivers}
            vehicles={vehicles}
            currentUser={currentUser}
            onShowDetails={setDetailsModalShipment}
            onAttach={onUpdateAttachment ? handleOpenAttachmentModal : undefined}
            onOpenCadastroAntt={handleOpenCadastroAntt}
            onEditPrice={onUpdatePrice ? (s) => setDetailsModalShipment(s) : undefined}
            realtimeStatus={realtimeStatus}
            lastSyncTime={lastSyncTime}
            onRefreshData={onRefreshData}
          />
        </div>
        <ShipmentDetailsModal
          isOpen={!!detailsModalShipment}
          onClose={() => setDetailsModalShipment(null)}
          shipment={detailsModalShipment}
          cargo={detailsModalShipment ? (cargos.find(c => String(c.id) === String(detailsModalShipment.cargoId)) || cargos.find(c => c.id === detailsModalShipment.cargoId)) : undefined}
          currentUser={currentUser}
          clients={clients}
          products={products}
          companyLogo={companyLogo}
          vehicles={vehicles}
          users={users}
          onDeleteAttachment={onDeleteAttachment}
          onUpdatePrice={onUpdatePrice}
          onUpdateShipmentData={onUpdateShipmentData}
          onAddAttachments={onAddAttachments}
          onSwapCargo={onSwapCargo}
          cargos={cargos}
        />
        {selectedShipmentForAttachment && currentUser && (
          <AttachmentModal
            isOpen={isAttachmentModalOpen}
            onClose={handleCloseAttachmentModal}
            onSave={handleSaveAttachment}
            shipment={shipments.find(s => s.id === selectedShipmentForAttachment.id) || selectedShipmentForAttachment}
            documentName={REQUIRED_DOCUMENT_MAP[selectedShipmentForAttachment.status] || 'Documento'}
            currentUser={currentUser}
            cargo={findCargoById(cargos, selectedShipmentForAttachment.cargoId)}
            requiresRiskManagement={
              checkRequiresRiskManagement(
                findCargoById(cargos, selectedShipmentForAttachment.cargoId),
                findProductForCargo(products, findCargoById(cargos, selectedShipmentForAttachment.cargoId))
              )
            }
            products={products}
            clients={clients}
            users={users}
            riskQueryOptions={riskQueryOptions}
            onUpdateShipmentData={onUpdateShipmentData}
            onDeleteAttachment={onDeleteAttachment}
          />
        )}
        {selectedShipmentForAntt && (
          <CadastroAnttModal
            isOpen={isAnttModalOpen}
            onClose={() => {
              setAnttModalOpen(false);
              setSelectedShipmentForAntt(null);
            }}
            onSave={handleSaveAntt}
            shipment={selectedShipmentForAntt}
          />
        )}
      </>
    );
  }

  if (currentUser?.profile === UserProfile.Cliente && clientDashboardData) {
    const myOffers = freightOffers.filter(o => {
      if (o.driverId) return false;
      if (o.clientId !== currentUser.clientId) return false;
      if (o.status === FreightOfferStatus.Aceita) {
        const matchedCargo = getMatchedCargo(o, cargos);
        if (!matchedCargo || matchedCargo.status === CargoStatus.Fechada) {
          return false;
        }
      }
      
      // Apply Client Filters
      if (offerFilterStatus === 'all' && o.status === FreightOfferStatus.Recusada) return false;
      if (offerFilterStatus !== 'all' && o.status !== offerFilterStatus) return false;
      if (offerFilterOrigin && !o.origin.toLowerCase().includes(offerFilterOrigin.toLowerCase())) return false;
      if (offerFilterDestination && !o.destination.toLowerCase().includes(offerFilterDestination.toLowerCase())) return false;

      return true;
    });

    const myClient = clients.find(c => c.id === currentUser.clientId);
    const clientCnpjs = new Set<string>();
    if (myClient?.cnpj) clientCnpjs.add(myClient.cnpj.replace(/\D/g, ''));
    (myClient?.secondaryCnpjs || []).forEach(b => {
      if (b.cnpj) clientCnpjs.add(b.cnpj.replace(/\D/g, ''));
    });

    const isClientCargo = (c: Cargo) => {
      if (c.clientId === currentUser.clientId) return true;
      const cleanCnpj = c.clientCnpj?.replace(/\D/g, '');
      if (cleanCnpj && clientCnpjs.has(cleanCnpj)) return true;
      return false;
    };

    const myCargos = cargos.filter(isClientCargo);
    const cargoStatusCounts = myCargos.reduce((acc, c) => {
      const st = (c.status || '').toLowerCase().trim();
      if (st.includes('andamento')) {
        acc[CargoStatus.EmAndamento] = (acc[CargoStatus.EmAndamento] || 0) + 1;
      } else if (st.includes('fechada')) {
        acc[CargoStatus.Fechada] = (acc[CargoStatus.Fechada] || 0) + 1;
      } else if (st.includes('suspens')) {
        acc[CargoStatus.Suspensa] = (acc[CargoStatus.Suspensa] || 0) + 1;
      } else {
        acc[c.status] = (acc[c.status] || 0) + 1;
      }
      return acc;
    }, {} as Record<string, number>);

    const cargoChartData = [
      { label: 'Em Andamento', value: cargoStatusCounts[CargoStatus.EmAndamento] || 0, color: '#3b82f6' },
      { label: 'Fechada', value: cargoStatusCounts[CargoStatus.Fechada] || 0, color: '#10b981' },
      { label: 'Suspensa', value: cargoStatusCounts[CargoStatus.Suspensa] || 0, color: '#f59e0b' },
    ].filter(d => d.value > 0);

    const clientCargoIds = new Set(myCargos.map(c => c.id));
    const allShipmentsPool = (allShipments && allShipments.length > 0 ? allShipments : shipments);
    const myShipments = allShipmentsPool.filter(s => clientCargoIds.has(s.cargoId));

    const funnelData = [
      { label: 'Ag. Cadastro', value: myShipments.filter(s => s.status === ShipmentStatus.PreCadastro || (s.status as string) === 'Ag. Cadastro').length },
      { label: 'Ag. Carregamento', value: myShipments.filter(s => s.status === ShipmentStatus.AguardandoCarregamento || (s.status as string) === 'Ag. Carregamento').length },
      { label: 'Ag. Nota', value: myShipments.filter(s => s.status === ShipmentStatus.AguardandoNota || (s.status as string) === 'Ag. Nota').length },
      { label: 'Ag. Fiscal', value: myShipments.filter(s => s.status === ShipmentStatus.AguardandoFiscal || (s.status as string) === 'Ag. Fiscal').length },
      { label: 'Ag. Descarga', value: myShipments.filter(s => s.status === ShipmentStatus.AguardandoDescarga || (s.status as string) === 'Ag. Descarga').length },
      { label: 'Valid. de Ticket', value: myShipments.filter(s => s.status === ShipmentStatus.ValidacaoTicket || (s.status as string) === 'Valid. de Ticket' || (s.status as string) === 'Validação de Ticket').length },
      { label: 'Finalizado', value: myShipments.filter(s => s.status === ShipmentStatus.Finalizado || (s.status as string) === 'Finalizado').length },
    ].filter(d => d.value > 0);

    return (
        <>
          <div className="flex justify-between items-center mb-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-800 dark:text-white">Dashboard</h1>
              <p className="text-gray-500 dark:text-gray-400 mt-1">Bem-vindo, {currentUser.name}</p>
            </div>
            <button
              onClick={() => setIsOfferModalOpen(true)}
              className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white rounded-lg font-medium transition-all shadow-md hover:shadow-lg flex items-center gap-2 transform hover:-translate-y-0.5"
            >
              <PackageIcon className="w-5 h-5" />
              Nova Oferta de Frete
            </button>
          </div>

          {myClient && (
            <div className="bg-gradient-to-r from-blue-50/90 to-indigo-50/90 dark:from-blue-950/40 dark:to-indigo-950/40 border border-blue-200/80 dark:border-blue-800/60 rounded-2xl p-5 mb-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-sm">
              <div className="flex items-center gap-3.5">
                <div className="p-3 bg-blue-600 text-white rounded-xl shadow-md">
                  <Building2 className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <h3 className="text-base font-bold text-gray-900 dark:text-white">
                      {myClient.nomeFantasia || myClient.razaoSocial}
                    </h3>
                    {(myClient.secondaryCnpjs || []).length > 0 ? (
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                        {(myClient.secondaryCnpjs || []).length + 1} CNPJs Cadastrados (Matriz & Filiais)
                      </span>
                    ) : (
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 border border-gray-200 dark:border-gray-700">
                        CNPJ: {myClient.cnpj}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">
                    Acompanhe o relatório detalhado e o histórico individual de cada filial e CNPJ da sua empresa.
                  </p>
                </div>
              </div>
              <button
                onClick={() => navigate('/reports')}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm hover:shadow-md cursor-pointer shrink-0"
              >
                <Building2 className="w-4 h-4" />
                Ver Histórico & Relatório por CNPJ
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 mb-8">
            <Card
              title="Cargas em Andamento"
              value={clientDashboardData.pendingLoads.toString()}
              icon={<PackageIcon className="w-6 h-6 text-white" />}
              colorClass="bg-gradient-to-br from-blue-500 to-blue-600 shadow-blue-500/20"
            />
            <Card
              title="Volume Mensal"
              value={`${clientDashboardData.volumeLoadedThisMonth.toLocaleString('pt-BR')} ton`}
              icon={<TruckIcon className="w-6 h-6 text-white" />}
              colorClass="bg-gradient-to-br from-indigo-500 to-indigo-600 shadow-indigo-500/20"
            />
            <Card
              title="Volume Anual"
              value={`${clientDashboardData.volumeLoadedThisYear.toLocaleString('pt-BR')} ton`}
              icon={<TruckIcon className="w-6 h-6 text-white" />}
              colorClass="bg-gradient-to-br from-teal-500 to-emerald-600 shadow-emerald-500/20"
            />
            <Card
              title="Veículos em Trânsito"
              value={clientDashboardData.scheduledVehicles.toString()}
              icon={<TruckIcon className="w-6 h-6 text-white" />}
              colorClass="bg-gradient-to-br from-orange-500 to-red-500 shadow-orange-500/20"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            {cargoChartData.length > 0 ? (
              <DonutChartCard title="Distribuição de Cargas" data={cargoChartData} />
            ) : (
              <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md flex items-center justify-center min-h-[300px]">
                <p className="text-gray-500 dark:text-gray-400">Nenhum dado de cargas disponível.</p>
              </div>
            )}
            
            {funnelData.length > 0 ? (
              <ShipmentFunnelCard title="Status dos Embarques (Ativos)" data={funnelData as any} />
            ) : (
              <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md flex items-center justify-center min-h-[300px]">
                <p className="text-gray-500 dark:text-gray-400">Nenhum dado de embarques disponível.</p>
              </div>
            )}
          </div>

          <div className="mb-4 mt-8">
            <h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-2">Painel de Ofertas</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">Acompanhe e gerencie as ofertas de frete enviadas pela transportadora.</p>
          </div>

          <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm mb-6 flex flex-col md:flex-row gap-4 items-end">
            <div className="flex-1 w-full">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Status</label>
              <select
                value={offerFilterStatus}
                onChange={(e) => setOfferFilterStatus(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-primary focus:border-primary"
              >
                <option value="all">Todos</option>
                {Object.values(FreightOfferStatus).map(status => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
            </div>
            <div className="flex-1 w-full">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Origem</label>
              <input
                type="text"
                value={offerFilterOrigin}
                onChange={(e) => setOfferFilterOrigin(e.target.value)}
                placeholder="Buscar por origem..."
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-primary focus:border-primary"
              />
            </div>
            <div className="flex-1 w-full">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Destino</label>
              <input
                type="text"
                value={offerFilterDestination}
                onChange={(e) => setOfferFilterDestination(e.target.value)}
                placeholder="Buscar por destino..."
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-primary focus:border-primary"
              />
            </div>
            <button 
              onClick={() => {
                setOfferFilterStatus('all');
                setOfferFilterOrigin('');
                setOfferFilterDestination('');
              }}
              className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              Limpar
            </button>
          </div>
          
          <FreightOffersList
            offers={myOffers}
            clients={clients}
            products={products}
            cargos={cargos}
            users={users}
            isClientProfile={true}
            onAccept={async (offer) => {
              if (onSaveFreightOffer) {
                const history = addOfferHistory(offer, `Preço/Oferta aceita pelo Cliente.`);
                await onSaveFreightOffer({ ...offer, status: FreightOfferStatus.Aceita, history });
              }
            }}
            onRefuse={async (offer) => {
              if (onSaveFreightOffer) {
                const history = addOfferHistory(offer, `Oferta recusada pelo Cliente.`);
                await onSaveFreightOffer({ ...offer, status: FreightOfferStatus.Recusada, history });
              }
            }}
            onCounterOffer={async (offer, newValue) => {
              if (onSaveFreightOffer) {
                const history = addOfferHistory(offer, `Contraproposta de R$ ${newValue.toFixed(2)} enviada pelo Cliente.`);
                await onSaveFreightOffer({ ...offer, status: FreightOfferStatus.Contraproposta, counterOfferValue: newValue, history });
              }
            }}
             currentUser={currentUser || undefined}
            onDelete={onDeleteFreightOffer}
            onConvertToCargo={onConvertToCargo}
            onSaveFreightOffer={onSaveFreightOffer}
            onUpdateStatus={async (offer, status) => {
              if (onSaveFreightOffer) {
                const history = addOfferHistory(offer, `Status alterado para "${status}" pelo Cliente.`);
                await onSaveFreightOffer({ ...offer, status, history });
              }
            }}
          />

          <FreightOfferModal
            isOpen={isOfferModalOpen}
            onClose={() => setIsOfferModalOpen(false)}
            clients={clients}
            products={products}
            currentClient={clients.find(c => c.id === currentUser.clientId)}
            onSave={onSaveFreightOffer || (async () => {})}
            currentUser={currentUser}
          />
        </>
    )
  }

  const totalActiveLoads = cargos.filter(c => c.status === CargoStatus.EmAndamento || c.status === CargoStatus.Suspensa).length;
  const shipmentsAwaitingLoading = shipments.filter(s => s.status === ShipmentStatus.AguardandoCarregamento);

  const SEVENTY_TWO_HOURS_MS = 72 * 60 * 60 * 1000;
  const pendingOffers = freightOffers.filter(o => {
    if (o.status === FreightOfferStatus.Recusada || o.driverId) return false;
    const age = Date.now() - new Date(o.createdAt).getTime();
    if (age > SEVENTY_TWO_HOURS_MS) return false;
    return true;
  });

  const driverOffers = freightOffers.filter(o => {
    if (o.driverId !== currentUser?.id) return false;
    if (o.status === FreightOfferStatus.Pendente) return true;
    if (o.status === FreightOfferStatus.Recusada) {
      const age = Date.now() - new Date(o.requestTimestamp || o.createdAt).getTime();
      return age < 24 * 60 * 60 * 1000; // Mantém exibição recente por 24h para acompanhamento do motorista
    }
    return false;
  });

  const canViewOffers = currentUser && [UserProfile.Desenvolvedor, UserProfile.Admin, UserProfile.GerenciadoraDeRisco, UserProfile.Comercial, UserProfile.Supervisor, UserProfile.Diretor, UserProfile.Demonstracao].includes(currentUser.profile);
  const isMotorista = currentUser?.profile === UserProfile.Motorista;

  return (
    <>
      <Header title={renderHeaderTitle()}>
        {renderPeriodSelector()}
      </Header>

      {viewMode === 'fiscal' && (
        <div className="mb-8">
          <OptimizedShipmentsBoard
            title="Gestão Fiscal dos Embarques"
            description="Controle e acompanhamento de autorizações de seguradora, cadastros e documentação fiscal"
            columns={fiscalColumns}
            shipments={shipments}
            cargos={cargos}
            clients={clients}
            products={products}
            users={users}
            drivers={drivers}
            vehicles={vehicles}
            currentUser={currentUser}
            onShowDetails={setDetailsModalShipment}
            onAttach={onUpdateAttachment ? handleOpenAttachmentModal : undefined}
            onOpenCadastroAntt={handleOpenCadastroAntt}
            onEditPrice={onUpdatePrice ? (s) => setDetailsModalShipment(s) : undefined}
            realtimeStatus={realtimeStatus}
            lastSyncTime={lastSyncTime}
            onRefreshData={onRefreshData}
          />
        </div>
      )}

      {viewMode === 'financeiro' && (
        <div className="mb-8">
          <OptimizedShipmentsBoard
            title="Gestão Financeira dos Embarques"
            description="Controle e liquidação de adiantamentos, saldos e monitoramento de trânsito em tempo real"
            columns={financeiroColumns}
            shipments={shipments}
            cargos={cargos}
            clients={clients}
            products={products}
            users={users}
            drivers={drivers}
            vehicles={vehicles}
            currentUser={currentUser}
            onShowDetails={setDetailsModalShipment}
            onAttach={onUpdateAttachment ? handleOpenAttachmentModal : undefined}
            onOpenCadastroAntt={handleOpenCadastroAntt}
            onEditPrice={onUpdatePrice ? (s) => setDetailsModalShipment(s) : undefined}
            realtimeStatus={realtimeStatus}
            lastSyncTime={lastSyncTime}
            onRefreshData={onRefreshData}
          />
        </div>
      )}

      {viewMode === 'supervisor' && (
        <>
          {pendingOffers.length > 0 && (
            <div className="mb-8">
              <FreightOffersList
                offers={pendingOffers}
                clients={clients}
                products={products}
                cargos={cargos}
                users={users}
                isClientProfile={false}
                onAccept={async (offer) => {
                  if (onAcceptFreightOffer) {
                    onAcceptFreightOffer(offer);
                  } else if (onSaveFreightOffer) {
                    const history = addOfferHistory(offer, `Oferta aceita pela Transportadora.`);
                    await onSaveFreightOffer({ ...offer, status: FreightOfferStatus.Aceita, history });
                  }
                }}
                onRefuse={async (offer) => {
                  if (onSaveFreightOffer) {
                    const history = addOfferHistory(offer, `Oferta recusada pela Transportadora.`);
                    await onSaveFreightOffer({ ...offer, status: FreightOfferStatus.Recusada, history });
                  }
                }}
                onCounterOffer={async (offer, newValue) => {
                  if (onSaveFreightOffer) {
                    if (offer.status === FreightOfferStatus.AguardandoPreco) {
                      const history = addOfferHistory(offer, `Preço inicial de R$ ${newValue.toFixed(2)} enviado pela Transportadora.`);
                      await onSaveFreightOffer({ ...offer, status: FreightOfferStatus.AnaliseCliente, freightValuePerTon: newValue, history });
                    } else if (offer.status === FreightOfferStatus.AnaliseCliente) {
                      const oldPrice = offer.freightValuePerTon ? ` (era R$ ${offer.freightValuePerTon.toFixed(2)})` : '';
                      const history = addOfferHistory(offer, `Preço inicial editado para R$ ${newValue.toFixed(2)} pela Transportadora${oldPrice}.`);
                      await onSaveFreightOffer({ ...offer, status: FreightOfferStatus.AnaliseCliente, freightValuePerTon: newValue, history });
                    } else {
                      const history = addOfferHistory(offer, `Contraproposta de R$ ${newValue.toFixed(2)} enviada pela Transportadora.`);
                      await onSaveFreightOffer({ ...offer, status: FreightOfferStatus.Contraproposta, counterOfferValue: newValue, history });
                    }
                  }
                }}
                currentUser={currentUser || undefined}
                onDelete={onDeleteFreightOffer}
                onConvertToCargo={onConvertToCargo}
                onSaveFreightOffer={onSaveFreightOffer}
              />
            </div>
          )}
          <div className="mb-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Card
              title="Total de Cargas Ativas"
              value={totalActiveLoads.toString()}
              icon={<PackageIcon className="w-6 h-6 text-white" />}
              colorClass="bg-blue-500"
            />
            <Card
              title="Aguardando Carregamento"
              value={shipmentsAwaitingLoading.length.toString()}
              icon={<TruckIcon className="w-6 h-6 text-white" />}
              colorClass="bg-primary"
            />
          </div>
          <div className="mb-8">
            <OptimizedShipmentsBoard
              title="Embarques Aguardando Carregamento"
              description="Controle e acompanhamento de veículos agendados para pesagem e carregamento"
              columns={supervisorColumns}
              shipments={shipments}
              cargos={cargos}
              clients={clients}
              products={products}
              users={users}
              drivers={drivers}
              vehicles={vehicles}
              currentUser={currentUser}
              onShowDetails={setDetailsModalShipment}
              onAttach={onUpdateAttachment ? handleOpenAttachmentModal : undefined}
              onOpenCadastroAntt={handleOpenCadastroAntt}
              onEditPrice={onUpdatePrice ? (s) => setDetailsModalShipment(s) : undefined}
            />
          </div>
        </>
      )}

      {viewMode === 'geral' && (
        <>
          {isMotorista && driverOffers.length > 0 && (
            <div className="mb-8">
              <DriverOrderRequestsList
                title="Minhas Solicitações de Ordem de Carregamento"
                requests={driverOffers}
                clients={clients}
                products={products}
                cargos={cargos}
                drivers={drivers}
                users={users}
                currentUser={currentUser}
                isDriverView={true}
                onAccept={async () => {}} 
                onRefuse={async () => {}}
              />
            </div>
          )}

          {canViewOffers && pendingOffers.length > 0 && (
            <div className="mb-8">
              <FreightOffersList
                offers={pendingOffers}
                clients={clients}
                products={products}
                cargos={cargos}
                users={users}
                isClientProfile={false}
                onAccept={async (offer) => {
                  if (onAcceptFreightOffer) {
                    onAcceptFreightOffer(offer);
                  } else if (onSaveFreightOffer) {
                    const history = addOfferHistory(offer, `Oferta aceita pela Transportadora.`);
                    await onSaveFreightOffer({ ...offer, status: FreightOfferStatus.Aceita, history });
                  }
                }}
                onRefuse={async (offer) => {
                  if (onSaveFreightOffer) {
                    const history = addOfferHistory(offer, `Oferta recusada pela Transportadora.`);
                    await onSaveFreightOffer({ ...offer, status: FreightOfferStatus.Recusada, history });
                  }
                }}
                onCounterOffer={async (offer, newValue) => {
                  if (onSaveFreightOffer) {
                    if (offer.status === FreightOfferStatus.AguardandoPreco) {
                      const history = addOfferHistory(offer, `Preço inicial de R$ ${newValue.toFixed(2)} enviado pela Transportadora.`);
                      await onSaveFreightOffer({ ...offer, status: FreightOfferStatus.AnaliseCliente, freightValuePerTon: newValue, history });
                    } else if (offer.status === FreightOfferStatus.AnaliseCliente) {
                      const oldPrice = offer.freightValuePerTon ? ` (era R$ ${offer.freightValuePerTon.toFixed(2)})` : '';
                      const history = addOfferHistory(offer, `Preço inicial editado para R$ ${newValue.toFixed(2)} pela Transportadora${oldPrice}.`);
                      await onSaveFreightOffer({ ...offer, status: FreightOfferStatus.AnaliseCliente, freightValuePerTon: newValue, history });
                    } else {
                      const history = addOfferHistory(offer, `Contraproposta de R$ ${newValue.toFixed(2)} enviada pela Transportadora.`);
                      await onSaveFreightOffer({ ...offer, status: FreightOfferStatus.Contraproposta, counterOfferValue: newValue, history });
                    }
                  }
                }}
                currentUser={currentUser || undefined}
                onDelete={onDeleteFreightOffer}
                onConvertToCargo={onConvertToCargo}
                onSaveFreightOffer={onSaveFreightOffer}
              />
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Card
              title="Embarques Ativos"
              value={activeShipments.toString()}
              icon={<TruckIcon className="w-6 h-6 text-white" />}
              colorClass="bg-primary"
            />
            <Card
              title="Cargas em Andamento"
              value={pendingLoads.toString()}
              icon={<PackageIcon className="w-6 h-6 text-white" />}
              colorClass="bg-secondary"
            />
            <Card
              title={`Tons Efetivadas (${periodLabel})`}
              value={`${dashboardStats.monthlyEffectiveTonnage.toLocaleString('pt-BR')} t`}
              icon={<TruckIcon className="w-6 h-6 text-white" />}
              colorClass="bg-green-500"
            />
            {dashboardStats.canViewCommission ? (
              <Card
                title={`Comissão (${periodLabel})`}
                value={new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(dashboardStats.monthlyCommission)}
                icon={<DollarSignIcon className="w-6 h-6 text-white" />}
                colorClass="bg-accent"
              />
            ) : (
              <Card
                title="Clientes Ativos"
                value="0"
                icon={<ClientsIcon className="w-6 h-6 text-white" />}
                colorClass="bg-gray-400"
              />
            )}
          </div>
          <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-6">
                <DonutChartCard title="Distribuição de Cargas por Status" data={cargoStatusData} />
                <DonutChartCard 
                  title={`Volume Carregado por Cliente (${periodLabel})`} 
                  data={clientVolumeData} 
                  unit="t" 
                  onViewClientHistory={(clientId) => {
                    const cl = clients.find(c => c.id === clientId);
                    if (cl) setSelectedClientForBranchesHistory(cl);
                  }}
                />
            </div>
            <ShipmentFunnelCard title="Funil de Embarques" data={shipmentStatusData} />
            {canViewRanking && <ShipperRankingCard shipments={shipments} cargos={cargos} users={users} currentUser={currentUser} dateRangeBounds={dateRangeBounds} periodLabel={periodLabel} />}
          </div>
        </>
      )}

      <ShipmentDetailsModal
        isOpen={!!detailsModalShipment}
        onClose={() => setDetailsModalShipment(null)}
        shipment={detailsModalShipment}
        cargo={detailsModalShipment ? (cargos.find(c => String(c.id) === String(detailsModalShipment.cargoId)) || cargos.find(c => c.id === detailsModalShipment.cargoId)) : undefined}
        currentUser={currentUser}
        clients={clients}
        products={products}
        companyLogo={companyLogo}
        vehicles={vehicles}
        users={users}
        onDeleteAttachment={onDeleteAttachment}
        onUpdatePrice={onUpdatePrice}
        onUpdateShipmentData={onUpdateShipmentData}
        onAddAttachments={onAddAttachments}
        onSwapCargo={onSwapCargo}
        cargos={cargos}
      />

      <ShipmentHistoryModal
        isOpen={!!selectedDriverForHistoryId}
        onClose={() => setSelectedDriverForHistoryId(null)}
        shipments={(() => {
          if (!selectedDriverForHistoryId) return [];
          const driverUser = users.find(u => u.id === selectedDriverForHistoryId);
          if (!driverUser) return [];
          const driverCpfClean = (driverUser.email || '').replace(/\D/g, '');
          return shipments.filter(s => (s.driverCpf || '').replace(/\D/g, '') === driverCpfClean || s.driverName === driverUser.name);
        })()}
        cargos={cargos}
        title={`Histórico de ${users.find(u => u.id === selectedDriverForHistoryId)?.name || 'Motorista'}`}
      />

      {selectedShipmentForAttachment && currentUser && (
        <AttachmentModal
          isOpen={isAttachmentModalOpen}
          onClose={handleCloseAttachmentModal}
          onSave={handleSaveAttachment}
          shipment={shipments.find(s => s.id === selectedShipmentForAttachment.id) || selectedShipmentForAttachment}
          documentName={REQUIRED_DOCUMENT_MAP[selectedShipmentForAttachment.status] || 'Documento'}
          currentUser={currentUser}
          cargo={findCargoById(cargos, selectedShipmentForAttachment.cargoId)}
          requiresRiskManagement={
            checkRequiresRiskManagement(
              findCargoById(cargos, selectedShipmentForAttachment.cargoId),
              findProductForCargo(products, findCargoById(cargos, selectedShipmentForAttachment.cargoId))
            )
          }
          products={products}
          clients={clients}
          users={users}
          riskQueryOptions={riskQueryOptions}
          onUpdateShipmentData={onUpdateShipmentData}
          onDeleteAttachment={onDeleteAttachment}
        />
      )}

      {selectedShipmentForAntt && (
        <CadastroAnttModal
          isOpen={isAnttModalOpen}
          onClose={() => {
            setAnttModalOpen(false);
            setSelectedShipmentForAntt(null);
          }}
          onSave={handleSaveAntt}
          shipment={selectedShipmentForAntt}
        />
      )}

      <ClientBranchesHistoryModal
        isOpen={!!selectedClientForBranchesHistory}
        onClose={() => setSelectedClientForBranchesHistory(null)}
        client={selectedClientForBranchesHistory}
        shipments={allShipments || shipments}
        cargos={cargos}
        products={products}
        onNavigateToReports={() => navigate('/reports')}
        onOpenShipmentDetails={(s) => setDetailsModalShipment(s)}
      />
    </>
  );
};

export default DashboardPage;
