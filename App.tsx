
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from './supabase';
import { useDatabase } from './hooks/useDatabase';
import type { Client, Owner, Driver, Vehicle, Product, Cargo, Shipment, User, Page, ProfilePermissions, HistoryLog, Ticket, TicketHistory, ShipmentLock, Branch, FreightOffer, RiskQueryOption, RealProfitData, ExpedidorRecebedor } from './types';
import { CargoStatus, ShipmentStatus, UserProfile, TicketStatus, TicketPriority, DriverClassification, VehicleSetType, VehicleBodyType, REQUIRED_DOCUMENT_MAP, OwnerType, FreightOfferStatus, DEFAULT_RISK_QUERY_OPTIONS, AnttModality, DriverPaymentMethod } from './types';
import { formatId, isCteApplicableForStatus, getShipmentCte, getShipmentCteEmissionDate, findCargoById, findProductForCargo, checkRequiresRiskManagement } from './utils';
import { extractFiscalDocNumbers, isCteDocType } from './utils/fiscalDocParser';
import { calculateAdvanceAndBalance, ADVANCE_ELIGIBLE_STATUSES, isShipment100PercentAdvance, isShipment0PercentAdvance } from './utils/freightCalculation';
import { INITIAL_PERMISSIONS, can, isDemoUser, isDeveloperUser, isAdminUser, filterVisibleUsers } from './auth';
import { useToast } from './hooks/useToast';
import { getExpedidoresRecebedores, saveExpedidorRecebedor, deleteExpedidorRecebedor, syncLocationsFromCargos } from './utils/locationStorage';

// Lazy-loaded Page Imports (Code Splitting for Optimal Performance)
const DashboardPage = React.lazy(() => import('./pages/DashboardPage'));
const LoginPage = React.lazy(() => import('./pages/LoginPage'));
const ClientsPage = React.lazy(() => import('./pages/ClientsPage'));
const OwnersPage = React.lazy(() => import('./pages/OwnersPage'));
const DriversPage = React.lazy(() => import('./pages/DriversPage'));
const VehiclesPage = React.lazy(() => import('./pages/VehiclesPage'));
const LoadsPage = React.lazy(() => import('./pages/LoadsPage'));
const LocationsPage = React.lazy(() => import('./pages/LocationsPage'));
const ProductsPage = React.lazy(() => import('./pages/ProductsPage'));
const ShipmentsPage = React.lazy(() => import('./pages/ShipmentsPage'));
const OperationalLoadsPage = React.lazy(() => import('./pages/OperationalLoadsPage'));
const OperationalMapPage = React.lazy(() => import('./pages/OperationalMapPage'));
const CommissionsPage = React.lazy(() => import('./pages/CommissionsPage'));
const FinancialPage = React.lazy(() => import('./pages/FinancialPage'));
const ReportsPage = React.lazy(() => import('./pages/ReportsPage'));
const UsersPage = React.lazy(() => import('./pages/UsersPage'));
const CorporateEmailPage = React.lazy(() => import('./pages/CorporateEmailPage'));
const AppearancePage = React.lazy(() => import('./pages/AppearancePage'));
const ShipmentHistoryPage = React.lazy(() => import('./pages/ShipmentHistoryPage'));
const LoadHistoryPage = React.lazy(() => import('./pages/LoadHistoryPage'));
const LayoverCalculatorPage = React.lazy(() => import('./pages/LayoverCalculatorPage'));
const FreightQuotePage = React.lazy(() => import('./pages/FreightQuotePage'));
const AtuaReconciliationPage = React.lazy(() => import('./pages/AtuaReconciliationPage'));
const ToolsHistoryPage = React.lazy(() => import('./pages/ToolsHistoryPage'));
const FreightOffersHistoryPage = React.lazy(() => import('./pages/FreightOffersHistoryPage'));
const BranchesPage = React.lazy(() => import('./pages/BranchesPage'));
const SystemMonitorPage = React.lazy(() => import('./pages/SystemMonitorPage'));
const DownloadAppPage = React.lazy(() => import('./pages/DownloadAppPage'));
const RiskManagementPage = React.lazy(() => import('./pages/RiskManagementPage'));
const RiskQueryTypesPage = React.lazy(() => import('./pages/RiskQueryTypesPage'));
const WhatsAppManagementPage = React.lazy(() => import('./pages/WhatsAppManagementPage'));
const MessengerPage = React.lazy(() => import('./pages/MessengerPage'));
const CommercialPresentationPage = React.lazy(() => import('./pages/CommercialPresentationPage'));
const InstitutionalWebsitePage = React.lazy(() => import('./pages/InstitutionalWebsitePage'));
const ShipperCoursePage = React.lazy(() => import('./pages/ShipperCoursePage'));

// Component Imports
import TopNavBar from './components/TopNavBar';
import TicketModal from './components/TicketModal';
import PasswordChangeModal from './components/PasswordChangeModal';
import DriverPortal from './components/DriverPortal';
import NewShipmentModal from './components/NewShipmentModal';
import SystemUpdateModal from './components/SystemUpdateModal';
import SelectEmbarcadorModal from './components/SelectEmbarcadorModal';
import CargoDetailsModal from './components/CargoDetailsModal';
import ShipmentDetailsModal from './components/ShipmentDetailsModal';
import CargoSyncShipmentsModal, { CargoChangedField } from './components/CargoSyncShipmentsModal';
import { shouldShowUpdateModal } from './utils/systemUpdates';
import { dispatchShipmentWhatsAppTrigger, ShipmentWhatsAppTriggerType } from './services/shipmentWhatsAppAutomation';
import { reconcileCargoWithShipments, calculateCargoBalance } from './utils/cargoBalance';

import {
  upsertClient, upsertOwner, upsertDriver, upsertVehicle, upsertCargo, insertCargo,
  upsertShipment, insertShipment, upsertUser, upsertTicket, insertUniqueTicket, saveProfilePermissions,
  upsertManyDrivers, upsertManyVehicles, upsertManyShipments, upsertManyCargos,
  uploadShipmentAttachment, getShipmentAttachmentUrl,
  saveAppSettings,
  deleteCargo, deleteShipment, deleteUser, deleteClient, upsertProduct, deleteProduct,
  tryAcquireShipmentLock, releaseShipmentLock, toUser,
  deleteShipmentAttachmentFromStorage, upsertBranch, deleteBranch, deleteTicket,
  upsertFreightOffer, deleteFreightOffer, fetchFreightOffers,
  upsertRiskQueryOption, deleteRiskQueryOption, saveAllRiskQueryOptions,
  mergeClients, fetchClients, fetchCargos
} from './lib/db';

const PageLoadingFallback: React.FC = () => (
  <div className="flex flex-col items-center justify-center min-h-[50vh] w-full gap-3 py-12">
    <div className="w-10 h-10 border-4 border-slate-200 dark:border-slate-700 border-t-blue-600 rounded-full animate-spin" />
    <span className="text-sm font-medium text-slate-500 dark:text-slate-400">Carregando módulo...</span>
  </div>
);



const FIELD_TRANSLATIONS: Record<string, string> = {
  // Cargo fields
  clientId: 'Cliente',
  productId: 'Produto',
  origin: 'Origem',
  originMapLink: 'Link do Mapa (Origem)',
  destination: 'Destino',
  destinationMapLink: 'Link do Mapa (Destino)',
  totalVolume: 'Volume Total',
  scheduledVolume: 'Volume Agendado',
  loadedVolume: 'Volume Carregado',
  companyFreightValuePerTon: 'Frete Empresa (p/ Ton)',
  companyFreightHasToll: 'Pedágio Frete Empresa',
  driverFreightValuePerTon: 'Frete Motorista (p/ Ton)',
  driverFreightHasToll: 'Pedágio Frete Motorista PJ',
  driverFreightPfHasToll: 'Pedágio Frete Motorista PF',
  hasIcms: 'Incide ICMS',
  icmsPercentage: '% ICMS',
  requiresScheduling: 'Exige Agendamento',
  type: 'Tipo de Carga',
  status: 'Status da Carga',
  createdById: 'Comercial Responsável',
  freightLegs: 'Trechos de Frete',
  dailySchedule: 'Agenda Diária',
  originCoords: 'Coordenadas de Origem',
  destinationCoords: 'Coordenadas de Destino',
  tmsLoteNumber: 'Lote TMS',
  isExport: 'Operação de Exportação',

  // Shipment fields
  driverId: 'Motorista',
  driverName: 'Nome do Motorista',
  driverContact: 'Contato do Motorista',
  driverCpf: 'CPF do Motorista',
  anttOwnerIdentifier: 'CPF/CNPJ Titular ANTT',
  anttModality: 'Modalidade ANTT',
  etcTaxRegime: 'Regime Tributário ETC',
  driverFreightType: 'Tipo de Frete Motorista',
  bankDetails: 'Dados Bancários',
  embarcadorId: 'Embarcador',
  horsePlate: 'Placa Cavalo',
  trailer1Plate: 'Placa Carreta 1',
  trailer2Plate: 'Placa Carreta 2',
  trailer3Plate: 'Placa Carreta 3',
  vehicleTag: 'Tag de Pedágio / Sem Parar',
  shipmentTonnage: 'Peso Carregado (Ton)',
  unloadedTonnage: 'Peso Descarregado (Ton)',
  driverFreightValue: 'Valor Frete Motorista',
  driverFreightRateSnapshot: 'Frete Motorista (p/ Ton)',
  vehicleSetType: 'Tipo de Veículo',
  vehicleBodyType: 'Tipo de Carroceria',
  cteNumber: 'Número do CT-e',
  cteEmissionDate: 'Data/Hora de Emissão do CT-e',
  ciotNumber: 'Número do CIOT',
  ciot: 'Número do CIOT',
  nfeNumber: 'Número da NF-e',
  nfeValue: 'Valor da NF-e',
  codigoAtua: 'CODG. ATUA',
  mdfeNumber: 'Número do MDF-e',
  federalTax: 'Imposto Federal',
  isFederalTaxManual: 'Imposto Federal Manual',
  generatedCredit: 'Crédito Gerado',
  isGeneratedCreditManual: 'Crédito Gerado Manual',
  riskQueryType: 'Tipo de Consulta de Risco (Modalidade)',
  riskQueryCost: 'Custo da Consulta de Risco',
  riskReleaseCode: 'Código de Liberação da Seguradora',
  advancePercentage: 'Adiantamento (%)',
  advanceValue: 'Valor de Adiantamento (Conta)',
  tollValue: 'Valor do Pedágio (Tag)',
  balanceToReceiveValue: 'Saldo a Receber',
  discountValue: 'Desconto por Quebra',
  netBalanceValue: 'Saldo Líquido',
  isBreakageWaived: 'Quebra Abonada',
  driverExtraPaymentsTotal: 'Acréscimos Avulsos ao Motorista',
  route: 'Rota do Motorista',
  paymentMethod: 'Forma de Pagamento',
  pixKey: 'Chave Pix',
  driverReferences: 'Referências do Motorista',
  ownerContact: 'Contato do Proprietário',
  cancellationReason: 'Motivo do Cancelamento',
  statusPendingObservation: 'Pendência do Status Atual',
};

interface NewShipmentRequestData extends Omit<Shipment, 'id' | 'orderId' | 'status' | 'documents' | 'history' | 'createdAt' | 'createdById' | 'statusHistory'> {
  status?: ShipmentStatus;
  history?: HistoryLog[];
  driverCnh?: string;
  vehicleSetType?: VehicleSetType;
  vehicleBodyType?: VehicleBodyType;
  filesToAttach?: File[];
  documents?: { [key: string]: any };
  isComplementar?: boolean;
  parentShipmentId?: string;
  complementarOriginType?: string;
  complementarCteNumber?: string;
  complementarCompanyFreight?: number;
  complementarDriverFreight?: number;
  complementarNfeNumber?: string;
  complementarNfeValue?: number;
}

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    try {
      localStorage.removeItem('trancunha_currentUser');
      localStorage.removeItem('trancunha_user_email');
    } catch {}
    const saved = sessionStorage.getItem('trancunha_currentUser');
    try {
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const location = useLocation();
  const navigate = useNavigate();
  const currentPage = (location.pathname === '/' ? 'dashboard' : location.pathname.substring(1)) as Page;
  const setCurrentPage = (page: Page) => navigate(`/${page}`);

  const [isTicketModalOpen, setIsTicketModalOpen] = useState(false);
  const [ticketModalInitialCreate, setTicketModalInitialCreate] = useState(false);
  const [isAnyModalOpen, setIsAnyModalOpen] = useState(false);
  const [offerToConvert, setOfferToConvert] = useState<FreightOffer | null>(null);
  const [offerForNewShipment, setOfferForNewShipment] = useState<FreightOffer | null>(null);
  const [isSelectEmbarcadorModalOpen, setIsSelectEmbarcadorModalOpen] = useState(false);
  const [selectedCargoForRequest, setSelectedCargoForRequest] = useState<Cargo | null>(null);
  const [selectedCargoForDetails, setSelectedCargoForDetails] = useState<Cargo | null>(null);
  const [selectedShipmentForDetails, setSelectedShipmentForDetails] = useState<Shipment | null>(null);

  // Theme Mode ('dark' or 'light')
  const [themeMode, setThemeMode] = useState<'dark' | 'light'>(() => {
    const saved = localStorage.getItem('trancunha_theme_mode');
    if (saved === 'dark' || saved === 'light') return saved;
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
    return 'dark';
  });

  const handleThemeModeChange = (mode: 'dark' | 'light') => {
    setThemeMode(mode);
    localStorage.setItem('trancunha_theme_mode', mode);
    if (mode === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  useEffect(() => {
    if (themeMode === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [themeMode]);
  
  // Use custom hook for all database-related state and logic
  const {
    clients, setClients,
    owners, setOwners,
    drivers, setDrivers,
    vehicles, setVehicles,
    products, setProducts,
    cargos, setCargos,
    shipments, setShipments,
    users, setUsers,
    tickets, setTickets,
    activeLocks, setActiveLocks,
    profilePermissions, setProfilePermissions,
    isLoading, loadError,
    companyLogo, setCompanyLogo,
    themeImage, setThemeImage,
    nextIds, setNextIds,
    isAnyModalActiveRef,
    branches, setBranches,
    stays, setStays,
    freightOffers, setFreightOffers,
    riskQueryOptions, setRiskQueryOptions,
    loadingOrderModels, setLoadingOrderModels,
    realtimeStatus,
    lastSyncTime,
    loadAllData
  } = useDatabase(currentUser);

  const { showToast } = useToast();
  const currentCargoForDetails = useMemo(() => {
    if (!selectedCargoForDetails) return null;
    return cargos.find(c => c.id === selectedCargoForDetails.id) || selectedCargoForDetails;
  }, [cargos, selectedCargoForDetails]);

  const currentShipmentForDetails = useMemo(() => {
    if (!selectedShipmentForDetails) return null;
    return shipments.find(s => s.id === selectedShipmentForDetails.id) || selectedShipmentForDetails;
  }, [shipments, selectedShipmentForDetails]);

  const [locations, setLocations] = useState<ExpedidorRecebedor[]>(() => getExpedidoresRecebedores());

  // Sincronizar locais extraídos das cargas cadastradas
  useEffect(() => {
    if (cargos && cargos.length > 0) {
      const synced = syncLocationsFromCargos(cargos);
      setLocations(synced);
    }
  }, [cargos]);

  const handleSaveLocation = async (locData: ExpedidorRecebedor | Omit<ExpedidorRecebedor, 'id' | 'createdAt'>) => {
    const updated = await saveExpedidorRecebedor(locData);
    setLocations(updated);
    showToast("Expedidor/Recebedor salvo com sucesso!", 'success');
  };

  const handleDeleteLocation = async (id: string) => {
    if (isDemoUser(currentUser)) {
      showToast('Usuário em modo demonstração possui acesso apenas de visualização.', 'warning');
      return;
    }
    if (currentUser?.profile === UserProfile.GerenciadoraDeRisco) {
      showToast('Perfil Gerenciadora de Risco não possui permissão para excluir registros.', 'warning');
      return;
    }
    const updated = await deleteExpedidorRecebedor(id);
    setLocations(updated);
    showToast("Local removido com sucesso!", 'info');
  };

  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);
  const [cargoSyncModalData, setCargoSyncModalData] = useState<{
    isOpen: boolean;
    oldCargo: Cargo;
    newCargo: Cargo;
    changedFields: CargoChangedField[];
    linkedShipments: Shipment[];
  } | null>(null);
  const [isGlobalWhatsAppFloatingOpen, setIsGlobalWhatsAppFloatingOpen] = useState(false);
  const [globalWhatsAppInitialPhone, setGlobalWhatsAppInitialPhone] = useState<string | undefined>(undefined);
  const [globalWhatsAppInitialName, setGlobalWhatsAppInitialName] = useState<string | undefined>(undefined);

  useEffect(() => {
    const handleOpenFloating = (e: any) => {
      const detail = e.detail || {};
      setGlobalWhatsAppInitialPhone(detail.phone);
      setGlobalWhatsAppInitialName(detail.name);
      setIsGlobalWhatsAppFloatingOpen(true);
    };
    window.addEventListener('transcunha:open_whatsapp_chat', handleOpenFloating);
    return () => {
      window.removeEventListener('transcunha:open_whatsapp_chat', handleOpenFloating);
    };
  }, []);

  useEffect(() => {
    if (currentUser?.id && !isLoading) {
      if (currentUser?.profile !== UserProfile.Cliente && shouldShowUpdateModal(currentUser)) {
        const timer = setTimeout(() => {
          setIsUpdateModalOpen(true);
        }, 800);
        return () => clearTimeout(timer);
      }
    }
  }, [currentUser, isLoading]);

  // Sincronizar o Código ATUA histórico dos motoristas cadastrados
  useEffect(() => {
    if (isLoading || drivers.length === 0 || shipments.length === 0) return;
    let hasChanges = false;
    const updatedDrivers = drivers.map(driver => {
      if (driver.codigoAtua && String(driver.codigoAtua).trim() !== '') return driver;
      const cleanCpf = (driver.cpf || '').replace(/\D/g, '');
      const cleanName = (driver.name || '').trim().toLowerCase();

      // Checar cache local
      const cached = cleanCpf ? localStorage.getItem(`transcunha_driver_atua_${cleanCpf}`) : null;
      if (cached && cached.trim()) {
        hasChanges = true;
        return { ...driver, codigoAtua: cached.trim() };
      }

      // Checar histórico de embarques existentes
      const matchedShipment = shipments.find(s => {
        const sCpf = (s.driverCpf || '').replace(/\D/g, '');
        const sName = (s.driverName || '').trim().toLowerCase();
        const match = (cleanCpf && sCpf === cleanCpf) || (cleanName && sName === cleanName);
        if (!match) return false;
        const code = s.codigoAtua || (s.documents as any)?.codigo_atua || (s.documents as any)?.codg_atua || (s.documents as any)?.codigoAtua;
        return typeof code === 'string' && code.trim() !== '';
      });

      if (matchedShipment) {
        const foundCode = String(
          matchedShipment.codigoAtua || 
          (matchedShipment.documents as any)?.codigo_atua || 
          (matchedShipment.documents as any)?.codg_atua || 
          (matchedShipment.documents as any)?.codigoAtua
        ).trim();
        if (cleanCpf) {
          try { localStorage.setItem(`transcunha_driver_atua_${cleanCpf}`, foundCode); } catch {}
        }
        hasChanges = true;
        return { ...driver, codigoAtua: foundCode };
      }
      return driver;
    });

    if (hasChanges) {
      setDrivers(updatedDrivers);
    }
  }, [isLoading, shipments.length]);

  const handleSaveRiskQueryOption = async (optionData: RiskQueryOption | Omit<RiskQueryOption, 'id'>) => {
    if (isDemoUser(currentUser)) {
      showToast('Usuário em modo demonstração possui acesso apenas de visualização.', 'warning');
      return;
    }
    try {
      const saved = await upsertRiskQueryOption(optionData);
      setRiskQueryOptions(prev => {
        const index = prev.findIndex(o => o.id === saved.id);
        if (index >= 0) {
          const updated = [...prev];
          updated[index] = saved;
          return updated;
        }
        return [...prev, saved];
      });
      showToast('Modalidade de consulta salva com sucesso!', 'success');
    } catch (err: any) {
      console.error('Error saving risk query option:', err);
      showToast('Erro ao salvar modalidade de consulta: ' + (err?.message || ''), 'error');
      throw err;
    }
  };

  const handleDeleteRiskQueryOption = async (optionId: string) => {
    if (isDemoUser(currentUser)) {
      showToast('Usuário em modo demonstração possui acesso apenas de visualização.', 'warning');
      return;
    }
    if (currentUser?.profile === UserProfile.GerenciadoraDeRisco) {
      showToast('Perfil Gerenciadora de Risco não possui permissão para excluir modalidades de consulta.', 'warning');
      return;
    }
    try {
      await deleteRiskQueryOption(optionId);
      setRiskQueryOptions(prev => prev.filter(o => o.id !== optionId));
      showToast('Modalidade de consulta excluída com sucesso!', 'success');
    } catch (err: any) {
      console.error('Error deleting risk query option:', err);
      showToast('Erro ao excluir modalidade de consulta: ' + (err?.message || ''), 'error');
    }
  };

  const handleRestoreRiskQueryDefaults = async () => {
    if (isDemoUser(currentUser)) {
      showToast('Usuário em modo demonstração possui acesso apenas de visualização.', 'warning');
      return;
    }
    try {
      await saveAllRiskQueryOptions(DEFAULT_RISK_QUERY_OPTIONS);
      setRiskQueryOptions(DEFAULT_RISK_QUERY_OPTIONS);
      showToast('Modalidades padrão restauradas com sucesso!', 'success');
    } catch (err: any) {
      console.error('Error restoring defaults:', err);
      showToast('Erro ao restaurar modalidades padrão', 'error');
    }
  };

  const isAnyModalActive = isAnyModalOpen || isSelectEmbarcadorModalOpen || !!offerForNewShipment || !!cargoSyncModalData?.isOpen;
  
  // Sincronização de modais para supressão de real-time
  useEffect(() => {
    isAnyModalActiveRef.current = isAnyModalActive;
  }, [isAnyModalActive, isAnyModalActiveRef]);

  // Previne recarregamento acidental no celular/navegador quando houver formulários ou modais abertos
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isAnyModalActive) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isAnyModalActive]);


  // Track app activity for motoristas
  useEffect(() => {
    if (currentUser?.profile === UserProfile.Motorista) {
      
      // Update persistent status in database, silently catch error if column missing
      supabase.from('drivers').update({ has_app: true }).eq('id', currentUser.id).then(({error}) => {
         if (error) console.log("has_app column might not exist yet", error);
      });

      const channel = supabase.channel('driver_tracking', {
        config: { presence: { key: currentUser.id } },
      });
      channel.on('presence', { event: 'sync' }, () => {});
      channel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ driverName: currentUser.name, isAppActive: true });
        }
      });
      return () => {
        channel.untrack();
        supabase.removeChannel(channel);
      };
    }
  }, [currentUser]);

  // Controle de PWA (Instalação)
  useEffect(() => {
    const isPwaEnabled = profilePermissions?.system_settings?.pwa_enabled !== false;
    
    // Prevent beforeinstallprompt if disabled
    const handleBeforeInstallPrompt = (e: any) => {
      if (!isPwaEnabled) {
        e.preventDefault();
      }
    };
    
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    
    // Manipulate manifest link
    let manifestLink = document.querySelector("link[rel='manifest']") as HTMLLinkElement | null;
    if (!isPwaEnabled) {
      if (manifestLink) {
        manifestLink.setAttribute('data-href', manifestLink.href);
        manifestLink.removeAttribute('href');
      }
    } else {
      if (manifestLink && manifestLink.hasAttribute('data-href')) {
        manifestLink.href = manifestLink.getAttribute('data-href') as string;
      }
    }
    
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, [profilePermissions?.system_settings?.pwa_enabled]);

  // Persistência da sessão (apenas enquanto a janela/navegador estiver aberta)
  useEffect(() => {
    if (currentUser) {
      sessionStorage.setItem('trancunha_currentUser', JSON.stringify(currentUser));
      sessionStorage.setItem('trancunha_user_email', currentUser.email);
    } else {
      sessionStorage.removeItem('trancunha_currentUser');
      sessionStorage.removeItem('trancunha_user_email');
    }
  }, [currentUser]);

  // Removido persistência local da rota, agora controlada pela URL

  // UI Effects (Branding & Theme)
  useEffect(() => {
    if (companyLogo) {
      localStorage.setItem('trancunha_companyLogo', companyLogo);
      const link = (document.querySelector("link[rel*='icon']") as HTMLLinkElement) || document.createElement('link');
      link.type = 'image/x-icon';
      link.rel = 'shortcut icon';
      link.href = companyLogo;
      if (!document.querySelector("link[rel*='icon']")) {
        document.getElementsByTagName('head')[0].appendChild(link);
      }
    }
  }, [companyLogo]);

  // Notification Sound Generator using Web Audio API
  const playNotificationSound = useCallback(() => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const playNote = (delay: number, frequency: number, duration: number) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(frequency, audioCtx.currentTime + delay);
        
        gain.gain.setValueAtTime(0.08, audioCtx.currentTime + delay);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + delay + duration);
        
        osc.start(audioCtx.currentTime + delay);
        osc.stop(audioCtx.currentTime + delay + duration);
      };
      
      playNote(0, 587.33, 0.15); // D5
      playNote(0.15, 880, 0.3);   // A5
    } catch (e) {
      console.warn("Web Audio API not supported or blocked by user interaction policy", e);
    }
  }, []);

  // Notifications in document title (bell in tab) and sound alert
  const lastPendingCountRef = useRef(0);
  useEffect(() => {
    if (!currentUser || !freightOffers) {
      document.title = "Transcunha Logística";
      return;
    }

    const isAllowedProfile = 
      currentUser.profile === UserProfile.Desenvolvedor ||
      isDeveloperUser(currentUser) ||
      currentUser.profile === UserProfile.Admin ||
      currentUser.profile === UserProfile.GerenciadoraDeRisco ||
      currentUser.profile === UserProfile.Diretor ||
      currentUser.profile === UserProfile.Comercial ||
      currentUser.profile === UserProfile.Supervisor ||
      currentUser.profile === UserProfile.Cliente ||
      currentUser.profile === UserProfile.Demonstracao ||
      (currentUser.profile as string) === 'Demo';

    if (!isAllowedProfile) {
      document.title = "Transcunha Logística";
      lastPendingCountRef.current = 0;
      return;
    }

    const isClient = currentUser.profile === UserProfile.Cliente;
    
    // Filter offers relevant to the logged-in user's pending actions (Aguardando preço, Contraproposta, ou Aceita sem carga gerada)
    const relevantOffers = freightOffers.filter(offer => {
      // Se a oferta foi aceita, verifica se já existe carga gerada para ela no passado ou presente
      if (offer.status === FreightOfferStatus.Aceita || offer.status === FreightOfferStatus.ContrapropostaAceita) {
        const hasCargo = (offer.cargoId && cargos.some(c => c.id === offer.cargoId)) ||
          cargos.some(c => 
            c.clientId === offer.clientId &&
            c.productId === offer.productId &&
            c.origin === offer.origin &&
            c.destination === offer.destination
          );
        // Se já existe carga gerada/vinculada no passado, desativa a notificação para esta oferta aceita
        if (hasCargo) return false;
      }

      if (isClient) {
        // Client side: waiting for carrier to send initial price, pending offer, or accepted without load
        return offer.clientId === currentUser.clientId && (
          offer.status === FreightOfferStatus.AguardandoPreco ||
          offer.status === FreightOfferStatus.Pendente ||
          offer.status === FreightOfferStatus.Aceita ||
          offer.status === FreightOfferStatus.ContrapropostaAceita
        );
      } else {
        // Carrier/Internal side: pending offers, waiting to send price, counter-offer pending approval, or accepted without load
        return !offer.driverId && (
          offer.status === FreightOfferStatus.AguardandoPreco ||
          offer.status === FreightOfferStatus.Pendente ||
          offer.status === FreightOfferStatus.Contraproposta ||
          offer.status === FreightOfferStatus.Aceita ||
          offer.status === FreightOfferStatus.ContrapropostaAceita
        );
      }
    });

    const pendingCount = relevantOffers.length;

    // Update document title with a bell emoji and count
    if (pendingCount > 0) {
      document.title = `🔔 (${pendingCount}) Transcunha Logística`;
    } else {
      document.title = "Transcunha Logística";
    }

    // Play notification sound
    if (pendingCount > 0) {
      // Play immediately if count increased
      if (pendingCount > lastPendingCountRef.current) {
        playNotificationSound();
      }
      
      // Setup periodic reminder sound every 60 seconds
      const intervalId = setInterval(() => {
        playNotificationSound();
      }, 60000);

      lastPendingCountRef.current = pendingCount;
      return () => clearInterval(intervalId);
    } else {
      lastPendingCountRef.current = 0;
    }
  }, [freightOffers, cargos, currentUser, playNotificationSound]);

  useEffect(() => {
    try {
      if (themeImage) {
        localStorage.setItem('transcunha_themeImage', themeImage);
        document.body.style.backgroundImage = `url("${themeImage.replace(/"/g, '\\"')}")`;
        document.body.style.backgroundSize = 'cover';
        document.body.style.backgroundPosition = 'center';
        document.body.style.backgroundAttachment = 'fixed';
      } else {
        localStorage.removeItem('trancunha_themeImage');
        localStorage.removeItem('transcunha_themeImage');
        document.body.style.backgroundImage = '';
      }
    } catch (e) {
      console.warn('[App] Não foi possível salvar tema no localStorage:', e);
      if (themeImage) {
        document.body.style.backgroundImage = `url("${themeImage.replace(/"/g, '\\"')}")`;
      }
    }
  }, [themeImage]);

  useEffect(() => {
    try {
      if (companyLogo) {
        localStorage.setItem('transcunha_companyLogo', companyLogo);
      } else {
        localStorage.removeItem('trancunha_companyLogo');
        localStorage.removeItem('transcunha_companyLogo');
      }
    } catch (e) {
      console.warn('[App] Não foi possível salvar logo no localStorage:', e);
    }
  }, [companyLogo]);

  const verifySession = useCallback(async () => {
    setIsAuthChecking(true);
    console.log('[Auth] Iniciando verificação de sessão...');

    try {
      const savedUserEmail = sessionStorage.getItem('trancunha_user_email');

      if (savedUserEmail) {
        console.log('[Auth] Recuperando perfil para:', savedUserEmail);

        // Verifica se o usuário salvo na sessão já é um motorista
        let savedUser: User | null = null;
        try { savedUser = JSON.parse(sessionStorage.getItem('trancunha_currentUser') || 'null'); } catch { savedUser = null; }
        const isMotoristaSession = savedUser?.profile === UserProfile.Motorista;

        if (isMotoristaSession) {
          // Motorista: valida diretamente na tabela drivers via CPF (não existe em app_users)
          const cleanCpf = savedUserEmail.replace(/\D/g, "");
          const formattedCpf = cleanCpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");

          let { data: dbDriver } = await supabase
            .from('drivers')
            .select('*')
            .eq("cpf", formattedCpf)
            .maybeSingle();

          if (!dbDriver) {
            const { data: dbDriverClean } = await supabase
              .from('drivers')
              .select('*')
              .eq("cpf", cleanCpf)
              .maybeSingle();
            dbDriver = dbDriverClean;
          }

          if (dbDriver && dbDriver.active) {
            const driverProfile: User = {
              id: dbDriver.id,
              name: dbDriver.name,
              email: dbDriver.cpf,
              profile: UserProfile.Motorista,
              active: dbDriver.active,
            };
            setCurrentUser(driverProfile);
            console.log('[Auth] Sessão de motorista restaurada:', driverProfile.name);
          } else {
            console.warn('[Auth] Motorista não encontrado ou inativo.');
            setCurrentUser(null);
          }
          return;
        }

        // Usuário interno: busca em app_users
        const { data: dbUser, error: dbError } = await supabase
          .from('app_users')
          .select('*')
          .eq("email", savedUserEmail)
          .maybeSingle();

        if (!dbError && dbUser) {
          const userProfile = toUser(dbUser);

          if (userProfile.active) {
            if (userProfile.passwordUpdatedAt) {
              const lastUpdate = new Date(userProfile.passwordUpdatedAt).getTime();
              const now = new Date().getTime();
              const daysSinceUpdate = (now - lastUpdate) / (1000 * 3600 * 24);
              if (daysSinceUpdate >= 30) {
                userProfile.requirePasswordChange = true;
              }
            }
            setCurrentUser(userProfile);
            console.log('[Auth] Sessão restaurada com sucesso:', userProfile.name);
          } else {
            console.warn('[Auth] Usuário inativo no banco.');
            setCurrentUser(null);
          }
        } else {
          if (dbError) console.error('[Auth] Erro ao recuperar perfil:', dbError.message);
          setCurrentUser(null);
        }
      } else {
        console.log('[Auth] Nenhuma sessão encontrada na aba atual.');
        setCurrentUser(null);
      }
    } catch (err) {
      console.error('[Auth] Erro crítico na verificação:', err);
    } finally {
      setIsAuthChecking(false);
    }
  }, []);

  useEffect(() => {
    verifySession();
  }, [verifySession]);

  useEffect(() => {
    if (currentUser && users.length > 0) {
      const dbMatch = users.find(u => u.id === currentUser.id || u.email?.toLowerCase() === currentUser.email?.toLowerCase());
      if (dbMatch && (dbMatch.name !== currentUser.name || dbMatch.profile !== currentUser.profile || JSON.stringify(dbMatch.customPermissions) !== JSON.stringify(currentUser.customPermissions))) {
        console.log('[Auth] Sincronizando perfil atualizado do usuário no estado local:', dbMatch.profile);
        setCurrentUser(prev => prev ? { ...prev, name: dbMatch.name, profile: dbMatch.profile, customPermissions: dbMatch.customPermissions } : null);
      }
    }
  }, [users, currentUser]);

  const nextStatusMap: Partial<Record<ShipmentStatus, ShipmentStatus>> = {
    [ShipmentStatus.PreCadastro]: ShipmentStatus.AguardandoSeguradora,            // 1 -> 2
    [ShipmentStatus.AguardandoSeguradora]: ShipmentStatus.AguardandoCarregamento, // 2 -> 3
    [ShipmentStatus.AguardandoCarregamento]: ShipmentStatus.AguardandoNota,       // 3 -> 4
    [ShipmentStatus.AguardandoNota]: ShipmentStatus.AguardandoFiscal,             // 4 -> 5
    [ShipmentStatus.AguardandoFiscal]: ShipmentStatus.AguardandoAdiantamento,     // 5 -> 6 (ou pula p/ 7 se 0%)
    [ShipmentStatus.AguardandoAdiantamento]: ShipmentStatus.AguardandoAgendamento,// 6 -> 7
    [ShipmentStatus.AguardandoAgendamento]: ShipmentStatus.AguardandoDescarga,    // 7 -> 8
    [ShipmentStatus.AguardandoDescarga]: ShipmentStatus.ValidacaoTicket,          // 8 -> 9
    [ShipmentStatus.ValidacaoTicket]: ShipmentStatus.AguardandoPagamentoSaldo,    // 9 -> 10 (ou pula p/ 11 se 100%)
    [ShipmentStatus.AguardandoPagamentoSaldo]: ShipmentStatus.Finalizado,         // 10 -> 11
  };

  // --- HISTORY LOGGING ---
  const createHistoryLog = (description: string): HistoryLog => {
    if (!currentUser) throw new Error("Ação não pode ser realizada sem um usuário logado.");
    const newLog = {
      id: `log_${nextIds.history}`,
      userId: currentUser.id,
      timestamp: new Date().toISOString(),
      description: `${description}`,
    };
    setNextIds((prev: any) => ({...prev, history: prev.history + 1}));
    return newLog;
  }

  // --- AUTH HANDLERS ---
  const handleLogin = (user: User) => {
    sessionStorage.setItem('trancunha_user_email', user.email);
    sessionStorage.setItem('trancunha_currentUser', JSON.stringify(user));
    localStorage.removeItem('trancunha_user_email');
    localStorage.removeItem('trancunha_currentUser');
    setCurrentUser(user);
    if (user.profile === UserProfile.Motorista) {
      setCurrentPage('operational-loads');
    } else {
      setCurrentPage('dashboard');
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem('trancunha_user_email');
    sessionStorage.removeItem('trancunha_currentUser');
    localStorage.removeItem('trancunha_user_email');
    localStorage.removeItem('trancunha_currentUser');
    setCurrentUser(null);
    setCurrentPage('dashboard');
  };

  const handlePasswordChange = async (newPassword: string, currentPassword: string) => {
    if (!currentUser) return;
    if (isDemoUser(currentUser)) {
      showToast('Usuário em modo demonstração não pode alterar senha.', 'warning');
      return;
    }
    
    try {
      // 1. Atualiza no Banco de Dados
      let data, dbError;
      
      if (currentUser.isFirstSetup) {
         // Primeira vez configurando a senha (motorista)
         const result = await supabase.from('app_users').upsert({
           id: currentUser.id,
           name: currentUser.name,
           email: currentUser.email,
           profile: currentUser.profile,
           active: currentUser.active,
           password: newPassword,
           require_password_change: false,
           password_updated_at: new Date().toISOString()
         }).select();
         data = result.data;
         dbError = result.error;
      } else {
          // Atualização de senha padrão
          const result = await supabase
            .from('app_users')
            .update({ 
              password: newPassword,
              require_password_change: false,
              password_updated_at: new Date().toISOString()
            })
            .eq('id', currentUser.id)
            .eq('password', currentPassword)
            .select();
          data = result.data;
          dbError = result.error;
      }
      
      if (dbError || !data || data.length === 0) {
        console.error('Erro ao atualizar senha no Banco:', dbError || 'Nenhuma linha afetada (senha incorreta)');
        throw new Error('A senha atual está incorreta ou houve um erro no banco.');
      }

      // Atualiza estado local
      const updatedUser: User = {
        ...currentUser, 
        password: newPassword, 
        requirePasswordChange: false,
        passwordUpdatedAt: data[0].password_updated_at
      };
      
      setCurrentUser(updatedUser);
      setUsers(prev => prev.map(u => u.id === updatedUser.id ? updatedUser : u));
      
      showToast('Senha atualizada com sucesso no sistema! Próxima atualização em 30 dias.', 'success');
    } catch (err: any) {
      console.error('Erro geral no handlePasswordChange:', err);
      throw err;
    }
  };

  const handleSavePermissions = async (newPermissions: ProfilePermissions) => {
    if (isDemoUser(currentUser)) {
      showToast('Usuário em modo demonstração possui acesso apenas de visualização.', 'warning');
      return;
    }
    setProfilePermissions(newPermissions);
    try {
      await saveProfilePermissions(newPermissions);
    } catch (err) {
      console.error('Erro ao salvar permissões:', err);
    }
    showToast("Permissões salvas com sucesso!", 'success');
  };
  
  const handleSaveLogo = async (logo: string) => {
    if (isDemoUser(currentUser)) {
      showToast('Usuário em modo demonstração possui acesso apenas de visualização.', 'warning');
      return;
    }
    setCompanyLogo(logo || null);
    try {
      await saveAppSettings({ company_logo: logo || null });
    } catch (err) {
      console.error('Erro ao salvar logo no Supabase:', err);
    }
    showToast("Logo da empresa atualizado com sucesso!", 'success');
  };

  const handleSaveThemeImage = async (image: string) => {
    if (isDemoUser(currentUser)) {
      showToast('Usuário em modo demonstração possui acesso apenas de visualização.', 'warning');
      return;
    }
    setThemeImage(image || null);
    try {
      await saveAppSettings({ theme_image: image || null });
    } catch (err) {
      console.error('Erro ao salvar tema no Supabase:', err);
    }
    showToast("Tema de fundo atualizado com sucesso!", 'success');
  };

  const handleSaveTicket = async (ticketData: Omit<Ticket, 'id' | 'history' | 'createdAt' | 'createdById'>) => {
    if (!currentUser) return;
    if (isDemoUser(currentUser)) {
      showToast('Usuário em modo demonstração possui acesso apenas de visualização.', 'warning');
      return;
    }

    try {
      const assignedUser = users.find(u => u.id === ticketData.assignedToId);
      const assignedName = assignedUser?.name || 'Responsável';
      const nowIso = new Date().toISOString();

      const createdTicket = await insertUniqueTicket({
        ...ticketData,
        status: TicketStatus.Aberto,
        createdById: currentUser.id,
        createdAt: nowIso,
        history: [{
          userId: currentUser.id,
          timestamp: nowIso,
          comment: `Chamado aberto por ${currentUser.name} e direcionado para ${assignedName}.`,
          newStatus: TicketStatus.Aberto,
        }],
      });

      // Atualiza o estado da lista de chamados com segurança
      setTickets((prev: Ticket[]) => [createdTicket, ...prev.filter(t => t.id !== createdTicket.id)]);
      
      const numSeq = parseInt(createdTicket.id.replace(/\D/g, ''), 10);
      if (!isNaN(numSeq)) {
        setNextIds((prev: any) => ({ ...prev, ticket: Math.max(prev.ticket || 1, numSeq + 1) }));
      }

      showToast(`Chamado ${createdTicket.id} criado com sucesso e registrado na auditoria!`, 'success');
    } catch (err: any) {
      console.error('[handleSaveTicket] Erro ao criar chamado:', err);
      showToast(`Aviso: Erro ao sincronizar com o servidor (${err?.message || 'rede'}), mas salvo com segurança localmente.`, 'warning');
    }
  };

  const handleDeleteTicket = async (ticketId: string) => {
    if (isDemoUser(currentUser)) {
      showToast('Usuário em modo demonstração possui acesso apenas de visualização.', 'warning');
      return;
    }
    if (currentUser?.profile === UserProfile.GerenciadoraDeRisco) {
      showToast('Perfil Gerenciadora de Risco não possui permissão para excluir chamados.', 'warning');
      return;
    }

    const ticketToDelete = tickets.find(t => t.id === ticketId);
    if (ticketToDelete && (ticketToDelete.status === TicketStatus.Aberto || ticketToDelete.status === TicketStatus.EmAndamento)) {
      showToast('⛔ Bloqueio de Auditoria: Chamados "Abertos" ou "Em Atendimento" não podem ser excluídos. Eles devem permanecer no histórico.', 'warning');
      return;
    }

    if (!window.confirm("Tem certeza que deseja excluir permanentemente este chamado concluído? Todos os registros de auditoria serão removidos.")) return;
    
    setTickets((prev: Ticket[]) => prev.filter(t => t.id !== ticketId));
    try {
      await deleteTicket(ticketId);
      showToast('Chamado excluído com sucesso.', 'success');
    } catch (err) {
      console.error('Erro ao excluir ticket:', err);
      showToast('Erro ao excluir chamado.', 'error');
    }
  };

  const handleUpdateTicket = async (ticketId: string, newStatus: TicketStatus, comment: string) => {
    if (!currentUser) return;
    if (isDemoUser(currentUser)) {
      showToast('Usuário em modo demonstração possui acesso apenas de visualização.', 'warning');
      return;
    }
    
    const ticketToUpdate = tickets.find(t => t.id === ticketId);
    if (!ticketToUpdate) return;

    const oldStatus = ticketToUpdate.status;
    const nowIso = new Date().toISOString();

    let finalComment = comment.trim();
    if (!finalComment) {
      finalComment = newStatus === TicketStatus.Resolvido
        ? 'Chamado marcado como resolvido.'
        : (newStatus === TicketStatus.Fechado ? 'Chamado finalizado/fechado.' : `Status alterado para ${newStatus}.`);
    }

    // Identifica e registra carimbos de data/hora de auditoria e responsáveis
    let startedAt = ticketToUpdate.startedAt;
    let startedById = ticketToUpdate.startedById;
    let resolvedAt = ticketToUpdate.resolvedAt;
    let resolvedById = ticketToUpdate.resolvedById;
    let closedAt = ticketToUpdate.closedAt;
    let closedById = ticketToUpdate.closedById;

    if (newStatus === TicketStatus.EmAndamento && !startedAt) {
      startedAt = nowIso;
      startedById = currentUser.id;
    }

    if (newStatus === TicketStatus.Resolvido) {
      resolvedAt = nowIso;
      resolvedById = currentUser.id;
    }

    if (newStatus === TicketStatus.Fechado) {
      closedAt = nowIso;
      closedById = currentUser.id;
    }

    // Calcula durações de SLA
    const createdAtMs = new Date(ticketToUpdate.createdAt).getTime();
    let timeToAttendMs = ticketToUpdate.timeToAttendMs;
    let timeToResolveMs = ticketToUpdate.timeToResolveMs;

    if (startedAt && (!timeToAttendMs || timeToAttendMs <= 0)) {
      timeToAttendMs = new Date(startedAt).getTime() - createdAtMs;
    }
    if ((resolvedAt || closedAt) && (!timeToResolveMs || timeToResolveMs <= 0)) {
      timeToResolveMs = new Date(resolvedAt || closedAt!).getTime() - createdAtMs;
    }

    const newHistoryEntry: TicketHistory = {
      userId: currentUser.id,
      timestamp: nowIso,
      comment: finalComment,
      oldStatus,
      newStatus,
    };

    const updatedTicket: Ticket = { 
      ...ticketToUpdate, 
      status: newStatus,
      startedAt,
      startedById,
      resolvedAt,
      resolvedById,
      closedAt,
      closedById,
      timeToAttendMs,
      timeToResolveMs,
      history: [...ticketToUpdate.history, newHistoryEntry] 
    };

    setTickets((prevTickets: Ticket[]) =>
      prevTickets.map(ticket => ticket.id === ticketId ? updatedTicket : ticket)
    );

    try {
      await upsertTicket(updatedTicket);
      showToast(`Chamado ${ticketId} atualizado para "${newStatus}"!`, 'success');
    } catch (err: any) {
      console.error('Erro ao atualizar ticket:', err);
      showToast(`Erro ao sincronizar atualização no banco: ${err?.message || 'Falha de conexão'}`, 'error');
    }
  };


  // --- DATA FILTERING BASED ON USER ---
  const visibleLoads = useMemo(() => {
    if (!currentUser) return [];

    return cargos.filter(c => {
      // 1. Admin, Gerenciadora de Risco and Demo always see all loads
      if (
        currentUser.profile === UserProfile.Desenvolvedor ||
        isDeveloperUser(currentUser) ||
        currentUser.profile === UserProfile.Admin ||
        currentUser.profile === UserProfile.GerenciadoraDeRisco ||
        (currentUser.profile as string) === 'Gerenciadora de Risco' ||
        currentUser.profile === UserProfile.Demonstracao ||
        (currentUser.profile as string) === 'Demo' ||
        Boolean(currentUser.name && (currentUser.name.toLowerCase().includes('samanta') || currentUser.name.toLowerCase().includes('samantha'))) ||
        Boolean(currentUser.email && (currentUser.email.toLowerCase().includes('samanta') || currentUser.email.toLowerCase().includes('samantha')))
      ) return true;

      // 2. Motorista profile: exibir estritamente as cargas cujo status/etapa seja "Cargas em Operação" (CargoStatus.EmAndamento)
      if (currentUser.profile === UserProfile.Motorista) {
        return c.status === CargoStatus.EmAndamento;
      }

      // 3. Client profile specific filtering (must match clientId or secondary CNPJs)
      if (currentUser.profile === UserProfile.Cliente) {
        if (!currentUser.clientId) return false;
        if (c.clientId === currentUser.clientId) return true;
        const client = clients.find(cl => cl.id === currentUser.clientId);
        if (!client) return false;
        const cleanCargoCnpj = c.clientCnpj?.replace(/\D/g, '');
        if (cleanCargoCnpj) {
          if (client.cnpj?.replace(/\D/g, '') === cleanCargoCnpj) return true;
          if (client.secondaryCnpjs?.some(b => b.cnpj.replace(/\D/g, '') === cleanCargoCnpj || b.id === c.clientBranchId)) return true;
        }
        return false;
      }

      // 4. Filter by allowed user IDs if defined on cargo (Admin, Diretor, Fiscal & Financeiro have global access)
      if (c.allowedUserIds && c.allowedUserIds.length > 0) {
        if (!c.allowedUserIds.includes(currentUser.id) && ![UserProfile.Desenvolvedor, UserProfile.Admin, UserProfile.GerenciadoraDeRisco, UserProfile.Diretor, UserProfile.Fiscal, UserProfile.Financeiro, UserProfile.Demonstracao].includes(currentUser.profile as UserProfile)) {
          return false;
        }
      } else if (c.allowedProfiles && c.allowedProfiles.length > 0) {
        if (!c.allowedProfiles.includes(currentUser.profile) && ![UserProfile.Desenvolvedor, UserProfile.Admin, UserProfile.GerenciadoraDeRisco, UserProfile.Diretor, UserProfile.Fiscal, UserProfile.Financeiro, UserProfile.Demonstracao].includes(currentUser.profile as UserProfile)) {
          return false;
        }
      }

      // 5. Embarcador & Agenciador profile
      if (currentUser.profile === UserProfile.Embarcador || currentUser.profile === UserProfile.Agenciador) {
        return true;
      }

      // 5. Profiles that see all branches
      if ([UserProfile.Diretor, UserProfile.Fiscal, UserProfile.GerenciadoraDeRisco, UserProfile.Financeiro].includes(currentUser.profile as UserProfile)) {
        return true;
      }

      // 6. Branch filtering for other profiles (e.g. Comercial, Supervisor)
      if (currentUser.branchId) {
        return c.branchId === currentUser.branchId || !c.branchId;
      }

      return true;
    });
  }, [currentUser, cargos, clients]);

  const visibleShipments = useMemo(() => {
    if (!currentUser) return [];

    // Motorista sees their assigned shipments
    if (currentUser.profile === UserProfile.Motorista) {
      const driverCpfClean = (currentUser.email || '').replace(/\D/g, '');
      return shipments.filter(s => (s.driverCpf || '').replace(/\D/g, '') === driverCpfClean);
    }

    // Embarcador & Agenciador see their shipments (ou da sua filial)
    if (currentUser.profile === UserProfile.Embarcador || currentUser.profile === UserProfile.Agenciador) {
      return shipments.filter(s => s.embarcadorId === currentUser.id || s.createdById === currentUser.id || (currentUser.branchId && s.branchId === currentUser.branchId));
    }

    // Admin, Gerenciadora de Risco, Demo & Financeiro see all shipments
    if (
      currentUser.profile === UserProfile.Desenvolvedor ||
      isDeveloperUser(currentUser) ||
      currentUser.profile === UserProfile.Admin ||
      currentUser.profile === UserProfile.GerenciadoraDeRisco ||
      (currentUser.profile as string) === 'Gerenciadora de Risco' ||
      currentUser.profile === UserProfile.Demonstracao ||
      (currentUser.profile as string) === 'Demo' ||
      currentUser.profile === UserProfile.Financeiro ||
      Boolean(currentUser.name && (currentUser.name.toLowerCase().includes('samanta') || currentUser.name.toLowerCase().includes('samantha'))) ||
      Boolean(currentUser.email && (currentUser.email.toLowerCase().includes('samanta') || currentUser.email.toLowerCase().includes('samantha')))
    ) {
      return shipments;
    }

    const visibleCargoIds = new Set(visibleLoads.map(c => c.id));

    // Cliente sees shipments of permitted visible loads matching their client
    if (currentUser.profile === UserProfile.Cliente && currentUser.clientId) {
      return shipments.filter(s => visibleCargoIds.has(s.cargoId));
    }

    // Profiles with all-branch visibility must still respect cargo profile permissions
    if ([UserProfile.Diretor, UserProfile.Fiscal].includes(currentUser.profile as UserProfile)) {
      return shipments.filter(s => visibleCargoIds.has(s.cargoId));
    }

    // Branch filtering for other profiles
    if (currentUser.branchId) {
      return shipments.filter(s => visibleCargoIds.has(s.cargoId) && (s.branchId === currentUser.branchId || !s.branchId));
    }

    return shipments.filter(s => visibleCargoIds.has(s.cargoId));
  }, [currentUser, shipments, visibleLoads]);
  
  const visibleUsers = useMemo(() => {
    return filterVisibleUsers(users, currentUser);
  }, [users, currentUser]);

  const visibleEmbarcadores = useMemo(() => {
    if (!currentUser) return [];
    const allEmbarcadorUsers = visibleUsers.filter(u => u.profile === UserProfile.Embarcador || u.profile === UserProfile.Agenciador);

    if (currentUser.profile === UserProfile.Embarcador || currentUser.profile === UserProfile.Agenciador) {
        return allEmbarcadorUsers.filter(u => u.id === currentUser.id);
    }
    
    return allEmbarcadorUsers;
  }, [currentUser, visibleUsers]);


  const inProgressLoads = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const filtered = visibleLoads.filter(c => {
      // Oculta cargas suspensas ou fechadas
      if (c.status !== CargoStatus.EmAndamento) {
        return false;
      }
      // Oculta cargas sem programação ativa a partir de hoje
      return Boolean(c.dailySchedule && c.dailySchedule.some(ds => ds.date >= today));
    });

    // Para motoristas: garantir que os cargos dos embarques ativos sempre estejam incluídos,
    // mesmo que o dailySchedule da carga já tenha passado
    if (currentUser?.profile === UserProfile.Motorista) {
      const driverCpfClean = (currentUser.email || '').replace(/\D/g, '');
      const activeShipmentCargoIds = new Set(
        shipments
          .filter(s =>
            (s.driverCpf || '').replace(/\D/g, '') === driverCpfClean &&
            s.status !== ShipmentStatus.Finalizado &&
            s.status !== ShipmentStatus.Cancelado
          )
          .map(s => s.cargoId)
      );
      // Adicionar cargas faltantes (as que têm embarques ativos mas não passaram no filtro de datas)
      const filteredIds = new Set(filtered.map(c => c.id));
      const missingCargos = visibleLoads.filter(c =>
        activeShipmentCargoIds.has(c.id) && !filteredIds.has(c.id)
      );
      return [...filtered, ...missingCargos];
    }

    return filtered;
  }, [visibleLoads, currentUser, shipments]);

  const handleAcceptFreightOffer = async (offer: FreightOffer) => {
    if (isDemoUser(currentUser)) {
      showToast('Usuário em modo demonstração possui acesso apenas de visualização.', 'warning');
      return;
    }
    try {
      if (offer.cargoId && offer.driverId) {
        // It's a Driver's request for a Shipment
        // We will accept it immediately and ideally open the shipment modal, but since it's hard to pass state directly,
        // we can just approve it and show a message to go to the Cargo to dispatch.
        await handleSaveFreightOffer({ ...offer, status: FreightOfferStatus.Aceita, history: [...(offer.history || []), {
          id: `log_${Date.now()}_sys`,
          userId: currentUser?.id || 'system',
          timestamp: new Date().toISOString(),
          description: `Solicitação aprovada. O embarque deve ser criado na página de Cargas Operacionais.`
        }]});
        showToast('Solicitação aprovada! Vá para Cargas Operacionais e clique em Novo Embarque para esta carga.', 'success');
        return;
      }

      // Salva a oferta imediatamente no Supabase e atualiza o estado local com os novos anexos
      await upsertFreightOffer(offer);
      setFreightOffers(prev => prev.map(o => o.id === offer.id ? offer : o));

      setOfferToConvert(offer);
      setCurrentPage('loads');
      showToast('Preenchendo dados da nova carga a partir da oferta...', 'success');
    } catch (e) {
      console.error(e);
      showToast('Erro ao abrir o formulário da carga.', 'error');
    }
  };

  const handleSaveFreightOffer = async (offerData: FreightOffer | Omit<FreightOffer, 'id' | 'createdAt'>) => {
    if (isDemoUser(currentUser)) {
      showToast('Usuário em modo demonstração possui acesso apenas de visualização.', 'warning');
      return;
    }
    try {
      const hasExistingId = 'id' in offerData && Boolean((offerData as FreightOffer).id);
      const uuid = hasExistingId ? (offerData as FreightOffer).id : crypto.randomUUID();

      let displayId = ('displayId' in offerData && (offerData as FreightOffer).displayId) ? (offerData as FreightOffer).displayId : '';
      if (!displayId) {
        const nextNum = nextIds.freightOffer || 1;
        displayId = formatId(nextNum, 'OFR', 2);
        setNextIds((prev: any) => ({ ...prev, freightOffer: (prev.freightOffer || nextNum) + 1 }));
      }

      const tempOffer: FreightOffer = {
        ...offerData,
        id: uuid,
        displayId: displayId,
        createdAt: ('createdAt' in offerData && offerData.createdAt) ? offerData.createdAt : new Date().toISOString(),
        history: ('history' in offerData && offerData.history?.length) ? offerData.history : [{
          id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
          userId: currentUser?.id || '',
          timestamp: new Date().toISOString(),
          description: offerData.freightValuePerTon ? `Oferta criada com valor inicial de R$ ${(offerData.freightValuePerTon || 0).toFixed(2)}.` : `Oferta criada. Aguardando preço da transportadora.`
        }]
      };

      setFreightOffers(prev => {
        const exists = prev.some(o => o.id === tempOffer.id);
        if (exists) {
          return prev.map(o => o.id === tempOffer.id ? tempOffer : o);
        } else {
          return [tempOffer, ...prev];
        }
      });
      
      await upsertFreightOffer(tempOffer);
      showToast(hasExistingId ? 'Oferta de frete atualizada com sucesso!' : 'Oferta de frete criada com sucesso!', 'success');
    } catch (err) {
      console.error('Erro ao salvar oferta de frete:', err);
      showToast('Erro ao atualizar oferta de frete.', 'error');
    }
  };

  const handleRequestLoadOrder = (cargo: Cargo) => {
    if (!currentUser) return;
    if (isDemoUser(currentUser)) {
      showToast('Usuário em modo demonstração possui acesso apenas de visualização.', 'warning');
      return;
    }
    
    // Check if the user already has a pending offer for this cargo
    const existingOffer = freightOffers.find(o => o.cargoId === cargo.id && o.driverId === currentUser.id && o.status === FreightOfferStatus.Pendente);
    if (existingOffer) {
       showToast('Você já possui uma solicitação pendente para esta carga!', 'warning');
       return;
    }
    
    setSelectedCargoForRequest(cargo);
    setIsSelectEmbarcadorModalOpen(true);
  };

  const handleConfirmRequestOrder = async (embarcadorId: string) => {
    if (!currentUser || !selectedCargoForRequest) return;
    if (isDemoUser(currentUser)) {
      showToast('Usuário em modo demonstração possui acesso apenas de visualização.', 'warning');
      return;
    }
    const cargo = selectedCargoForRequest;
    
    const newOffer: FreightOffer | Omit<FreightOffer, 'id' | 'createdAt'> = {
      clientId: cargo.clientId,
      origin: cargo.origin,
      originLocation: cargo.originMapLink,
      destination: cargo.destination,
      destinationLocation: cargo.destinationMapLink,
      totalTonnage: Math.max(0, cargo.scheduledVolume - cargo.loadedVolume) || cargo.scheduledVolume, 
      productId: cargo.productId,
      freightValuePerTon: cargo.driverFreightValuePerTon,
      status: FreightOfferStatus.Pendente,
      driverId: currentUser.id,
      cargoId: cargo.id,
      requestedEmbarcadorId: embarcadorId,
      requestTimestamp: new Date().toISOString(),
      history: [{
        id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        userId: currentUser.id,
        timestamp: new Date().toISOString(),
        description: `Motorista ${currentUser.name} solicitou ordem de carregamento para a Carga ${cargo.sequenceId}.`
      }]
    };
    
    await handleSaveFreightOffer(newOffer);
    showToast('Ordem de carregamento solicitada com sucesso! Aguarde aprovação do Embarcador.', 'success');
    setIsSelectEmbarcadorModalOpen(false);
    setSelectedCargoForRequest(null);
  };

  const handleAcceptOrderRequestFromNotification = (offer: FreightOffer) => {
    if (currentUser) {
      if (isDemoUser(currentUser)) {
        showToast('Usuário em modo demonstração possui acesso apenas de visualização.', 'warning');
        return;
      }
    }
    setOfferForNewShipment(offer);
  };

  const handleRefuseOrderRequestFromNotification = async (offer: FreightOffer, reason?: string) => {
    if (currentUser) {
      if (isDemoUser(currentUser)) {
        showToast('Usuário em modo demonstração possui acesso apenas de visualização.', 'warning');
        return;
      }
      const refusalReason = reason || 'Solicitação de ordem recusada pelo embarcador';
      const history = [...(offer.history || []), {
        id: `log_${Date.now()}_sys`,
        userId: currentUser.id,
        timestamp: new Date().toISOString(),
        description: `Solicitação de ordem de carregamento recusada por ${currentUser.name}. Motivo: ${refusalReason}`
      }];
      await handleSaveFreightOffer({ ...offer, status: FreightOfferStatus.Recusada, history });

      // Registrar essa recusa no histórico de embarques cancelados
      if (offer.cargoId) {
        const driverUser = users.find(u => u.id === offer.driverId);
        const driverInDb = drivers.find(d => d.id === offer.driverId || (driverUser?.email && d.cpf.replace(/\D/g, '') === driverUser.email.replace(/\D/g, '')));
        const dName = driverInDb?.name || driverUser?.name || (offer as any).driverName || 'Motorista';
        const dCpf = driverInDb?.cpf || (driverUser?.email && driverUser.email.replace(/\D/g, '').length === 11 ? driverUser.email : '') || (offer as any).driverCpf || '';
        const dContact = driverInDb?.phone || driverUser?.phone || (offer as any).driverContact || '';

        const cargo = cargos.find(c => c.id === offer.cargoId);
        const ton = offer.totalTonnage || (cargo ? Math.max(0, cargo.scheduledVolume - cargo.loadedVolume) : 0) || 0;
        const driverFreightRate = offer.freightValuePerTon || cargo?.driverFreightValuePerTon || 0;

        await handleCreateShipment({
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

      showToast('Solicitação de ordem de carregamento recusada e registrada no histórico de cancelados.', 'success');
    }
  };

  const handleDeleteFreightOffer = async (offer: FreightOffer) => {
    if (isDemoUser(currentUser)) {
      showToast('Usuário em modo demonstração possui acesso apenas de visualização.', 'warning');
      return;
    }
    if (currentUser?.profile === UserProfile.GerenciadoraDeRisco) {
      showToast('Perfil Gerenciadora de Risco não possui permissão para excluir ofertas de frete.', 'warning');
      return;
    }
    if (!window.confirm("Tem certeza que deseja excluir permanentemente esta informação?")) return;
    try {
      setFreightOffers(prev => prev.filter(o => o.id !== offer.id));
      await deleteFreightOffer(offer.id);
      showToast('Oferta excluída com sucesso!', 'success');
    } catch (err) {
      console.error('Erro ao excluir oferta de frete:', err);
      showToast('Erro ao excluir oferta de frete.', 'error');
      // Refetch to undo optimistic update
      const offers = await fetchFreightOffers();
      setFreightOffers(offers);
    }
  };

  const activeLoads = useMemo(() => 
    visibleLoads.filter(c => c.status !== CargoStatus.Fechada),
    [visibleLoads]
  );

  const closedLoads = useMemo(() => 
    visibleLoads.filter(c => c.status === CargoStatus.Fechada),
    [visibleLoads]
  );

  
  // --- CRUD HANDLERS ---
  const handleCreateShipment = async (data: NewShipmentRequestData) => {
    if (!currentUser) return;
    if (isDemoUser(currentUser)) {
      showToast('Usuário em modo demonstração possui acesso apenas de visualização.', 'warning');
      return;
    }
    
    let currentNextIds = { ...nextIds };
    let historyId = currentNextIds.history;
    
    const createHistoryLogLocal = (description: string): HistoryLog => {
      const newLog = {
        id: `log_${historyId}`,
        userId: currentUser.id,
        timestamp: new Date().toISOString(),
        description,
      };
      historyId++;
      return newLog;
    };

    let newDrivers = [...drivers];
    let addedDrivers: Driver[] = [];
    let driverToUse = drivers.find(d => 
        (d.name.trim().toLowerCase() === data.driverName.trim().toLowerCase() && data.driverName.trim() !== '') || 
        (d.cpf.replace(/\D/g, '') === (data.driverCpf || '').replace(/\D/g, '') && (data.driverCpf || '').trim() !== '')
    );
    const isAlreadyRegisteredDriver = !!driverToUse;

    const driverCpfClean = (data.driverCpf || driverToUse?.cpf || '').replace(/\D/g, '');
    const driverNameClean = (data.driverName || driverToUse?.name || '').trim().toLowerCase();

    // Verificar se o motorista já tem histórico de embarque efetivado (embarque anterior não cancelado)
    const hasCompletedTrip = shipments.some(s => {
      const sCpfClean = (s.driverCpf || '').replace(/\D/g, '');
      const sNameClean = (s.driverName || '').trim().toLowerCase();
      
      const isDriverMatch = (driverCpfClean !== '' && sCpfClean === driverCpfClean) ||
                            (driverNameClean !== '' && sNameClean === driverNameClean);
      if (!isDriverMatch) return false;

      return s.status !== ShipmentStatus.Cancelado;
    });

    // 1. Verificar se o motorista já possui Código do ATUA informado no cadastro do motorista, no formulário de criação, em embarques anteriores ou em cache local
    const atuaFromDriver = driverToUse?.codigoAtua ? String(driverToUse.codigoAtua).trim() : '';
    const atuaFromForm = data.codigoAtua ? String(data.codigoAtua).trim() : '';
    const atuaFromCache = driverCpfClean ? (localStorage.getItem(`transcunha_driver_atua_${driverCpfClean}`) || '').trim() : '';

    let atuaFromShipments = '';
    if (!atuaFromDriver && !atuaFromForm && !atuaFromCache) {
      const prevShipmentWithAtua = shipments.find(s => {
        const sCpfClean = (s.driverCpf || '').replace(/\D/g, '');
        const sNameClean = (s.driverName || '').trim().toLowerCase();
        const isDriverMatch = (driverCpfClean !== '' && sCpfClean === driverCpfClean) ||
                              (driverNameClean !== '' && sNameClean === driverNameClean);
        if (!isDriverMatch) return false;

        const code = s.codigoAtua || 
                     (s.documents as any)?.codigo_atua || 
                     (s.documents as any)?.codg_atua || 
                     (s.documents as any)?.codigoAtua;
        return typeof code === 'string' && code.trim() !== '';
      });
      if (prevShipmentWithAtua) {
        atuaFromShipments = String(
          prevShipmentWithAtua.codigoAtua || 
          (prevShipmentWithAtua.documents as any)?.codigo_atua || 
          (prevShipmentWithAtua.documents as any)?.codg_atua || 
          (prevShipmentWithAtua.documents as any)?.codigoAtua
        ).trim();
      }
    }

    const resolvedCodigoAtua = atuaFromForm || atuaFromDriver || atuaFromCache || atuaFromShipments;
    const driverHasAtua = Boolean(resolvedCodigoAtua && resolvedCodigoAtua !== '');

    // Salvar em cache imediato caso tenhamos o código resolvido e o CPF
    if (driverCpfClean && resolvedCodigoAtua) {
      try { localStorage.setItem(`transcunha_driver_atua_${driverCpfClean}`, resolvedCodigoAtua); } catch {}
    }

    const isReembarque = Boolean((data as any).isReembarque);
    let cargoAutoExpanded = false;
    let autoExpandedVolume = 0;
    let extraVolumeAdded = 0;

    const relatedCargo = findCargoById(cargos, data.cargoId);
    if (relatedCargo) {
      const cargoBalance = calculateCargoBalance(relatedCargo, shipments);
      if (data.shipmentTonnage > cargoBalance.availableVolume + 0.001) {
        if (!isReembarque && !data.isComplementar) {
          showToast(`SALDO TOTAL INSUFICIENTE: O lote possui apenas ${cargoBalance.availableVolume.toLocaleString('pt-BR')} ton disponíveis no saldo total. Não é permitido criar embarques de ${data.shipmentTonnage.toLocaleString('pt-BR')} ton.`, 'error');
          return;
        } else if (isReembarque) {
          cargoAutoExpanded = true;
          extraVolumeAdded = Number((data.shipmentTonnage - Math.max(0, cargoBalance.availableVolume)).toFixed(2));
          autoExpandedVolume = Number((relatedCargo.totalVolume + extraVolumeAdded).toFixed(2));
        }
      }
    }
    const shouldReactivateCargo = Boolean(isReembarque && relatedCargo && relatedCargo.status !== CargoStatus.EmAndamento);
    const relatedProduct = findProductForCargo(products, relatedCargo);
    const productRequiresRisk = checkRequiresRiskManagement(relatedCargo, relatedProduct);

    // REGRA DE NEGÓCIO:
    // Todos os motoristas cadastrados que ainda NÃO tiveram o código do ATUA informado
    // DEVEM parar obrigatoriamente na etapa "1 - Ag. Cadastro" para poder informar esse código.
    // Somente se já possuir histórico de viagem concluída E já possuir o código do ATUA informado é que pode pular essa etapa.
    const canSkipCadastro = hasCompletedTrip && driverHasAtua;

    let initialStatus: ShipmentStatus;
    if (!productRequiresRisk) {
      // Produto não necessita de Gerenciamento de Risco (GR):
      // Se motorista com histórico de viagem concluída E código do ATUA informado: pula Ag. Cadastro E Ag. Seguradora -> vai direto para "3 - Ag. Carregamento"
      // Se motorista sem histórico OU sem código do ATUA: para em "1 - Ag. Cadastro"
      if (canSkipCadastro) {
        initialStatus = ShipmentStatus.AguardandoCarregamento;
      } else {
        initialStatus = ShipmentStatus.PreCadastro;
      }
    } else {
      if (canSkipCadastro) {
        // Motorista com histórico de viagem concluída E código do ATUA informado: pula "1 - Ag. Cadastro" e inicia em "2 - Ag. Seguradora"
        initialStatus = ShipmentStatus.AguardandoSeguradora;
      } else {
        // Motorista sem histórico prévio OU sem código do ATUA: inicia em "1 - Ag. Cadastro"
        initialStatus = ShipmentStatus.PreCadastro;
      }
    }

    if (!driverToUse) {
      const newDriverId = formatId(currentNextIds.driver, 'DRV');
      driverToUse = {
        id: newDriverId,
        name: data.driverName,
        cpf: data.driverCpf || '',
        cnh: data.driverCnh || '',
        phone: data.driverContact || '',
        classification: DriverClassification.Terceiro,
        active: true,
        codigoAtua: resolvedCodigoAtua || undefined,
      };
      newDrivers.unshift(driverToUse);
      addedDrivers.push(driverToUse);
      currentNextIds.driver++;
    } else if (resolvedCodigoAtua && (!driverToUse.codigoAtua || driverToUse.codigoAtua !== resolvedCodigoAtua)) {
      driverToUse = { ...driverToUse, codigoAtua: resolvedCodigoAtua };
      newDrivers = newDrivers.map(d => d.id === driverToUse!.id ? driverToUse! : d);
      if (!addedDrivers.some(d => d.id === driverToUse!.id)) {
        addedDrivers.push(driverToUse);
      }
    }

    let newVehicles = [...vehicles];
    let addedVehicles: Vehicle[] = [];
    let newOwners = [...owners];
    let addedOwner: Owner | null = null;

    // Process Owner registration / lookup
    const rawAnttId = (data.anttOwnerIdentifier || '').trim();
    const cleanAnttId = rawAnttId.replace(/\D/g, '');

    let targetOwner: Owner | null = null;
    if (cleanAnttId) {
      targetOwner = newOwners.find(o => o.cpfCnpj && o.cpfCnpj.replace(/\D/g, '') === cleanAnttId) || null;
    }

    const ownerType = (data.anttModality === AnttModality.TAC || cleanAnttId.length === 11)
      ? OwnerType.PessoaFisica
      : OwnerType.PessoaJuridica;

    // Format payment details string to keep inside the Owner record
    const paymentParts: string[] = [];
    if (data.paymentMethod === DriverPaymentMethod.PixEFrete && data.pixKey) {
      paymentParts.push(`PIX (${data.paymentMethod}): ${data.pixKey}`);
    } else if (data.paymentMethod === DriverPaymentMethod.DepositoConta && data.bankDetails) {
      paymentParts.push(`Conta (${data.paymentMethod}): ${data.bankDetails}`);
    } else if (data.bankDetails) {
      paymentParts.push(data.bankDetails);
    } else if (data.pixKey) {
      paymentParts.push(`PIX: ${data.pixKey}`);
    }
    const paymentInfoStr = paymentParts.join(' | ');

    const ownerNameFinal = (data.ownerName || '').trim() || 
      (cleanAnttId && cleanAnttId === (data.driverCpf || '').replace(/\D/g, '') ? data.driverName : '') || 
      targetOwner?.name || 
      (ownerType === OwnerType.PessoaFisica ? data.driverName : 'Proprietário PJ') || 
      'Proprietário';

    const ownerPhoneFinal = (data.ownerContact || '').trim() || (data.driverContact || '').trim() || targetOwner?.phone || '';

    if (targetOwner) {
      // Update existing owner with any enriched details
      const updatedOwner: Owner = {
        ...targetOwner,
        name: ownerNameFinal || targetOwner.name,
        phone: ownerPhoneFinal || targetOwner.phone,
        type: targetOwner.type || ownerType,
        bankDetails: paymentInfoStr || targetOwner.bankDetails,
      };
      newOwners = newOwners.map(o => o.id === targetOwner!.id ? updatedOwner : o);
      targetOwner = updatedOwner;
      addedOwner = updatedOwner;
    } else if (cleanAnttId) {
      // Create new Owner
      const newOwnerId = formatId(currentNextIds.owner, 'OWN');
      targetOwner = {
        id: newOwnerId,
        name: ownerNameFinal,
        cpfCnpj: rawAnttId,
        phone: ownerPhoneFinal,
        type: ownerType,
        bankDetails: paymentInfoStr,
      };
      newOwners.unshift(targetOwner);
      addedOwner = targetOwner;
      currentNextIds.owner++;
    } else {
      targetOwner = null;
    }

    // Link driver to targetOwner if explicitly provided
    if (targetOwner) {
      driverToUse.ownerId = targetOwner.id;
      newDrivers = newDrivers.map(d => d.id === driverToUse.id ? { ...d, ownerId: targetOwner!.id } : d);
      if (!addedDrivers.some(d => d.id === driverToUse.id)) {
        addedDrivers.push(driverToUse);
      }
    }

    const processVehicle = (plate: string, isHorse: boolean, trailerIndex: number = 0) => {
      if (!plate || !plate.trim()) return;
      const cleanPlate = plate.trim().toUpperCase();
      let vehicle = newVehicles.find(v => v.plate.trim().toUpperCase() === cleanPlate);
      
      const vehicleSetTypeToUse = isHorse 
        ? (data.vehicleSetType || VehicleSetType.LSSimples) 
        : (trailerIndex === 1 ? VehicleSetType.LSSimples : (vehicle?.setType || VehicleSetType.LSSimples));

      if (!vehicle) {
        const newVehicleId = formatId(currentNextIds.vehicle, 'VEH');
        const newVehicle: Vehicle = {
          id: newVehicleId,
          plate: cleanPlate,
          setType: vehicleSetTypeToUse,
          bodyType: data.vehicleBodyType || VehicleBodyType.Graneleiro,
          classification: DriverClassification.Terceiro,
          driverId: driverToUse.id,
          ownerId: targetOwner ? targetOwner.id : '',
        };
        newVehicles.unshift(newVehicle);
        addedVehicles.push(newVehicle);
        currentNextIds.vehicle++;
      } else {
        const updatedVehicle: Vehicle = {
          ...vehicle,
          driverId: driverToUse.id,
          ownerId: targetOwner ? targetOwner.id : (vehicle.ownerId === 'OWN-100' ? '' : vehicle.ownerId),
          setType: isHorse && data.vehicleSetType ? data.vehicleSetType : vehicle.setType,
          bodyType: data.vehicleBodyType ? data.vehicleBodyType : vehicle.bodyType,
        };
        newVehicles = newVehicles.map(v => v.id === vehicle!.id ? updatedVehicle : v);
        if (!addedVehicles.some(v => v.id === updatedVehicle.id)) {
          addedVehicles.push(updatedVehicle);
        }
      }
    };

    processVehicle(data.horsePlate, true, 0);
    processVehicle(data.trailer1Plate || '', false, 1);
    processVehicle(data.trailer2Plate || '', false, 2);
    processVehicle(data.trailer3Plate || '', false, 3);

    const prefix = currentUser?.name ? currentUser.name.substring(0, 3).toUpperCase() : 'SHP';
    const newShipmentId = formatId(currentNextIds.shipment, prefix);
    
    const documentsUrlMap: { [key: string]: string[] } = {};
    const attachedFileNames: string[] = [];
    if (data.filesToAttach && data.filesToAttach.length > 0) {
      try {
        const newDocUrls = [];
        for (const file of data.filesToAttach) {
          const path = await uploadShipmentAttachment(newShipmentId, 'Arquivos Iniciais', file);
          const url = getShipmentAttachmentUrl(path);
          newDocUrls.push(url);
          attachedFileNames.push(file.name);
        }
        documentsUrlMap['Arquivos Iniciais'] = newDocUrls;
      } catch (error) {
        console.error('Erro ao fazer upload dos anexos iniciais:', error);
        showToast('Ocorreu um erro ao enviar os arquivos. O embarque foi criado, mas os arquivos não puderam ser salvos.', 'warning');
      }
    }
    
    let historyMsg = `Embarque ${newShipmentId} criado.`;
    if (!productRequiresRisk) {
      if (!hasCompletedTrip) {
        historyMsg += ` Primeiro embarque do motorista (sem histórico de viagem concluída) — direcionado para Ag. Cadastro (GR dispensado para este produto).`;
      } else {
        historyMsg += ` Produto com GR dispensado e motorista com histórico — direcionado diretamente para Ag. Carregamento.`;
      }
    } else {
      if (!hasCompletedTrip) {
        historyMsg += ` Primeiro embarque do motorista (sem histórico de viagem concluída) — direcionado para Ag. Cadastro.`;
      } else {
        historyMsg += ` Motorista com histórico de viagem concluída — direcionado diretamente para Ag. Seguradora.`;
      }
    }
    if (attachedFileNames.length > 0) historyMsg += ` Anexo(s): ${attachedFileNames.join(', ')}.`;
    if (data.bankDetails) historyMsg += ` Dados bancários preenchidos.`;

    // Identificação de comissão automática:
    // 1. Agenciador: ativação automática de comissão de agência vinculada ao Líder da Agência
    const requestingUser = users.find(u => u.id === data.embarcadorId) || currentUser;
    const isAgenciadorRequester = requestingUser.profile === UserProfile.Agenciador || currentUser.profile === UserProfile.Agenciador;
    
    const activeAgenciador = requestingUser.profile === UserProfile.Agenciador 
      ? requestingUser 
      : (currentUser.profile === UserProfile.Agenciador ? currentUser : null);

    const agencyLeader = (activeAgenciador && activeAgenciador.agencyRole === 'embarque' && activeAgenciador.agencyLeaderId)
      ? users.find(u => u.id === activeAgenciador.agencyLeaderId)
      : activeAgenciador;

    const agencyRateConfigured = agencyLeader?.agencyCommissionPercentage ?? 30;
    const agencyNameAuto = agencyLeader
      ? (agencyLeader.branchId ? `Agência ${agencyLeader.branchId} (${agencyLeader.name})` : agencyLeader.name)
      : (requestingUser.branchId ? `Agência ${requestingUser.branchId} (${requestingUser.name})` : requestingUser.name);

    // 2. Embarcador com taxa R$/ton configurada: ativação automática da comissão do embarcador
    const shipperRateConfigured = requestingUser.shipperCommissionRatePerTon || (data.embarcadorId ? users.find(u => u.id === data.embarcadorId)?.shipperCommissionRatePerTon : undefined);
    const isShipperCommAuto = Boolean(shipperRateConfigured && shipperRateConfigured > 0);

    if (isAgenciadorRequester) {
      (documentsUrlMap as any).agency_commission_enabled = true;
      (documentsUrlMap as any).agency_commission_percentage = agencyRateConfigured;
      (documentsUrlMap as any).agency_commission_agency_name = agencyNameAuto;
    }
    if (isShipperCommAuto) {
      (documentsUrlMap as any).shipper_commission_enabled = true;
      (documentsUrlMap as any).shipper_commission_rate_per_ton = shipperRateConfigured;
    }

    if (resolvedCodigoAtua) {
      (documentsUrlMap as any).codigo_atua = resolvedCodigoAtua;
      (documentsUrlMap as any).codg_atua = resolvedCodigoAtua;
    }

    const newShipment: Shipment = {
      id: newShipmentId,
      orderId: `ord_${newShipmentId}`,
      cargoId: data.cargoId,
      driverName: data.driverName,
      driverContact: data.driverContact,
      driverCpf: data.driverCpf,
      codigoAtua: resolvedCodigoAtua || undefined,
      embarcadorId: data.embarcadorId,
      horsePlate: data.horsePlate,
      trailer1Plate: data.trailer1Plate,
      trailer2Plate: data.trailer2Plate,
      trailer3Plate: data.trailer3Plate,
      shipmentTonnage: data.shipmentTonnage,
      driverFreightValue: data.driverFreightValue,
      driverFreightRateSnapshot: data.driverFreightRateSnapshot ?? (findCargoById(cargos, data.cargoId)?.driverFreightValuePerTon || 0),
      companyFreightRateSnapshot: findCargoById(cargos, data.cargoId)?.companyFreightValuePerTon,
      driverFreightType: data.driverFreightType || 'PJ',
      status: data.status || initialStatus,
      cancellationReason: data.cancellationReason,
      scheduledDate: data.scheduledDate,
      scheduledTime: data.scheduledTime,
      paymentMethod: data.paymentMethod,
      pixKey: data.pixKey,
      bankDetails: data.bankDetails,
      advancePercentage: data.isComplementar ? 100 : data.advancePercentage,
      advanceValue: data.isComplementar ? data.driverFreightValue : (data as any).advanceValue,
      balanceToReceiveValue: data.isComplementar ? 0 : (data as any).balanceToReceiveValue,
      isComplementar: data.isComplementar,
      parentShipmentId: data.parentShipmentId,
      complementarOriginType: data.complementarOriginType,
      complementarCteNumber: data.complementarCteNumber,
      complementarCompanyFreight: data.complementarCompanyFreight,
      complementarDriverFreight: data.complementarDriverFreight,
      complementarNfeNumber: data.complementarNfeNumber,
      complementarNfeValue: data.complementarNfeValue,
      nfeNumber: data.complementarNfeNumber || (data as any).nfeNumber,
      nfeValue: data.complementarNfeValue !== undefined ? data.complementarNfeValue : (data as any).nfeValue,
      cteNumber: data.complementarCteNumber || (data as any).cteNumber,
      documents: data.documents ? { ...data.documents, ...(Object.keys(documentsUrlMap).length > 0 ? documentsUrlMap : {}) } : (Object.keys(documentsUrlMap).length > 0 ? documentsUrlMap : undefined),
      history: data.history ? data.history : [createHistoryLogLocal(historyMsg)],
      createdAt: new Date().toISOString(),
      createdById: currentUser.id,
      driverReferences: data.driverReferences,
      ownerName: data.ownerName || targetOwner?.name,
      ownerContact: data.ownerContact || targetOwner?.phone,
      anttOwnerIdentifier: data.anttOwnerIdentifier,
      anttModality: data.anttModality,
      etcTaxRegime: data.etcTaxRegime,
      agencyCommissionEnabled: isAgenciadorRequester ? true : undefined,
      agencyCommissionPercentage: isAgenciadorRequester ? agencyRateConfigured : undefined,
      agencyCommissionAgencyName: isAgenciadorRequester ? agencyNameAuto : undefined,
      shipperCommissionEnabled: isShipperCommAuto ? true : undefined,
      shipperCommissionRatePerTon: isShipperCommAuto ? shipperRateConfigured : undefined,
      financialCostMonthlyRate: data.financialCostMonthlyRate ?? (findCargoById(cargos, data.cargoId)?.financialCostEnabled ? findCargoById(cargos, data.cargoId)?.financialCostMonthlyRate : undefined),
      financialCostDaysTerm: data.financialCostDaysTerm ?? (findCargoById(cargos, data.cargoId)?.financialCostEnabled ? findCargoById(cargos, data.cargoId)?.financialCostDaysTerm : undefined),
      financialCostRate: data.financialCostRate ?? (findCargoById(cargos, data.cargoId)?.financialCostEnabled ? findCargoById(cargos, data.cargoId)?.financialCostEffectiveRate : undefined),
      financialCostValue: data.financialCostValue ?? ((findCargoById(cargos, data.cargoId)?.financialCostEnabled && findCargoById(cargos, data.cargoId)?.companyFreightValuePerTon && data.shipmentTonnage) 
        ? Number(((findCargoById(cargos, data.cargoId)!.companyFreightValuePerTon * data.shipmentTonnage) * ((findCargoById(cargos, data.cargoId)?.financialCostEffectiveRate || 0) / 100)).toFixed(2)) 
        : undefined),
      statusHistory: [{
        status: data.status || initialStatus,
        timestamp: new Date().toISOString(),
        userId: currentUser.id,
      }],
      vehicleTag: data.vehicleTag,
      vehicleSetType: data.vehicleSetType,
      vehicleBodyType: data.vehicleBodyType,
      branchId: currentUser.branchId,
    };
    const newShipments = [newShipment, ...shipments];
    
    const newCargos = cargos.map(cargo => {
      const isTarget = cargo.id === data.cargoId || String(cargo.id) === String(data.cargoId) || (cargo.sequenceId && String(cargo.sequenceId) === String(data.cargoId).replace(/\D/g, ''));
      if (isTarget) {
        let baseCargo = cargo;
        const reembarqueHistoryLogs: HistoryLog[] = [];
        if (cargoAutoExpanded) {
          reembarqueHistoryLogs.push(createHistoryLogLocal(`Volume total do lote expandido automaticamente de ${baseCargo.totalVolume} ton para ${autoExpandedVolume} ton (+${extraVolumeAdded} ton) para comportar o reembarque do motorista ${data.driverName} (${data.horsePlate}).`));
          baseCargo = {
            ...baseCargo,
            totalVolume: autoExpandedVolume,
          };
        }
        if (shouldReactivateCargo) {
          reembarqueHistoryLogs.push(createHistoryLogLocal(`Lote reativado automaticamente para "Em Andamento" devido ao reembarque do motorista ${data.driverName} (${data.horsePlate}).`));
          baseCargo = {
            ...baseCargo,
            status: CargoStatus.EmAndamento,
          };
        }
        const reconciled = reconcileCargoWithShipments(baseCargo, newShipments);
        return {
          ...reconciled,
          history: [
            ...(cargo.history || []),
            ...reembarqueHistoryLogs,
            createHistoryLogLocal(`Volume agendado atualizado para ${reconciled.scheduledVolume.toFixed(2)} ton devido ao novo embarque ${newShipmentId}`),
          ],
        };
      }
      return cargo;
    });
    
    currentNextIds.shipment++;
    currentNextIds.history = historyId;
    
    // Batch state updates (optimistic)
    setDrivers(newDrivers);
    setVehicles(newVehicles);
    setShipments(newShipments);
    setCargos(newCargos);
    setOwners(newOwners);
    setNextIds(currentNextIds);

    // Persist to Supabase
    try {
      const updatedCargo = findCargoById(newCargos, data.cargoId);
      if (addedOwner) await upsertOwner(addedOwner);
      await upsertManyDrivers(addedDrivers);
      await upsertManyVehicles(addedVehicles);
      await insertShipment(newShipment);
      if (updatedCargo) await upsertCargo(updatedCargo);
    } catch (err: any) {
      console.error('Erro ao salvar embarque no Supabase:', err);
      // Rollback optimistic state
      setDrivers(drivers);
      setVehicles(vehicles);
      setShipments(shipments);
      setCargos(cargos);
      setOwners(owners);
      setNextIds(nextIds);
      const errorMessage = err?.message || 'Erro desconhecido ao salvar no banco de dados.';
      showToast(`[ERRO CRÍTICO] O embarque não pôde ser salvo no banco de dados: ${errorMessage}. Verifique sua conexão ou contate o suporte.`, 'error');
      throw err;
    }

    setCurrentPage('shipments');
    let toastMessage = `Novo embarque ${newShipmentId} criado com sucesso!`;
    if (data.isComplementar) {
      toastMessage = `Embarque Complementar ${newShipmentId} criado com sucesso (CT-e ${data.complementarCteNumber || ''}) e registrado como Finalizado no histórico!`;
    } else if (cargoAutoExpanded || shouldReactivateCargo) {
      toastMessage = `Reembarque ${newShipmentId} criado com sucesso! Lote atualizado${cargoAutoExpanded ? ` com expansão de +${extraVolumeAdded} ton` : ''}${shouldReactivateCargo ? ' e reativado' : ''}.`;
    } else if (!productRequiresRisk) {
      if (!hasCompletedTrip) {
        toastMessage = `Embarque ${newShipmentId} criado! Primeiro embarque do motorista — direcionado para "Ag. Cadastro" (GR dispensado para este produto).`;
      } else {
        toastMessage = `Embarque ${newShipmentId} criado! Produto sem exigência de GR — direcionado direto para "Ag. Carregamento".`;
      }
    } else {
      if (!hasCompletedTrip) {
        toastMessage = `Embarque ${newShipmentId} criado! Primeiro embarque do motorista (sem histórico de viagem concluída) — direcionado para "Ag. Cadastro".`;
      } else {
        toastMessage = `Embarque ${newShipmentId} criado! Motorista com histórico de viagem concluída — direcionado direto para "Ag. Seguradora".`;
      }
    }
    showToast(toastMessage, 'success');

    // Disparo automático WhatsApp ao vincular motorista ao novo embarque
    try {
      const relatedCargoForTrigger = findCargoById(newCargos, data.cargoId);
      const relatedClientForTrigger = clients.find(c => c.id === relatedCargoForTrigger?.clientId);
      const createTriggerType: ShipmentWhatsAppTriggerType = (newShipment.status === ShipmentStatus.AguardandoCarregamento) 
        ? 'risk_approved' 
        : 'risk_pending';

      dispatchShipmentWhatsAppTrigger(createTriggerType, {
        shipment: newShipment,
        cargo: relatedCargoForTrigger,
        client: relatedClientForTrigger,
        driver: driverToUse,
        drivers: newDrivers,
        user: currentUser,
        targetStatus: newShipment.status
      }).then(res => {
        if (res.success) {
          console.log(`[WhatsApp Automation] ${res.message}`);
        }
      }).catch(err => {
        console.warn('[WhatsApp Automation] Erro no disparo inicial:', err);
      });
    } catch (e) {
      console.warn('[WhatsApp Automation] Falha ao preparar disparo inicial:', e);
    }
  };

  const handleMarkArrival = async (shipmentId: string) => {
    if (!currentUser) return;
    if (isDemoUser(currentUser)) {
      showToast('Usuário em modo demonstração possui acesso apenas de visualização.', 'warning');
      return;
    }
    const shipmentToUpdate = shipments.find(s => s.id === shipmentId);
    if (!shipmentToUpdate) return;

    const now = new Date().toISOString();
    const updatedShipment: Shipment = { 
      ...shipmentToUpdate, 
      arrivalTime: now, 
      history: [...shipmentToUpdate.history, createHistoryLog(`Chegada do veículo marcada em ${new Date(now).toLocaleString('pt-BR')}`)] 
    };

    setShipments((prev: Shipment[]) => prev.map(s => s.id === shipmentId ? updatedShipment : s));
    try {
      await upsertShipment(updatedShipment);
    } catch (err) {
      console.error('Erro ao marcar chegada:', err);
    }
  };


  const handleAddShipmentAttachments = async (shipmentId: string, files: File[]) => {
    if (!currentUser) {
      showToast('Usuário não autenticado.', 'error');
      return;
    }
    if (isDemoUser(currentUser)) {
      showToast('Usuário em modo demonstração possui acesso apenas de visualização.', 'warning');
      return;
    }
    
    const shipment = shipments.find(s => s.id === shipmentId);
    if (!shipment) {
      showToast('Embarque não encontrado.', 'error');
      return;
    }

    try {
      const updatedDocuments = { ...(shipment.documents || {}) };
      const newUrls: string[] = [];
      const fileNames: string[] = [];

      for (const file of files) {
        const path = await uploadShipmentAttachment(shipmentId, 'Arquivos Iniciais', file);
        const url = getShipmentAttachmentUrl(path);
        newUrls.push(url);
        fileNames.push(file.name);
      }

      const existingDocs = updatedDocuments['Arquivos Iniciais'] || [];
      updatedDocuments['Arquivos Iniciais'] = [...existingDocs, ...newUrls];

      const updatedShipment: Shipment = {
        ...shipment,
        documents: updatedDocuments,
        history: [...shipment.history, createHistoryLog(`Novos anexos adicionados: ${fileNames.join(', ')}.`)]
      };

      await upsertShipment(updatedShipment);
      setShipments(prev => prev.map(s => s.id === shipmentId ? updatedShipment : s));
      showToast('Documentos anexados com sucesso!', 'success');
    } catch (error) {
      console.error('Erro ao anexar documentos:', error);
      showToast('Erro ao anexar documentos. Verifique sua conexão.', 'error');
    }
  };
  
  const handleDeleteShipmentAttachment = async (shipmentId: string, url: string) => {
    if (!currentUser) return;
    if (isDemoUser(currentUser)) {
      showToast('Usuário em modo demonstração possui acesso apenas de visualização.', 'warning');
      return;
    }
    if (currentUser?.profile === UserProfile.GerenciadoraDeRisco) {
      showToast('Perfil Gerenciadora de Risco não possui permissão para excluir anexos.', 'warning');
      return;
    }
    
    const shipment = shipments.find(s => s.id === shipmentId);
    if (!shipment || !shipment.documents) return;

    try {
      // 1. Storage Removal (non-blocking best effort)
      await deleteShipmentAttachmentFromStorage(url);

      // 2. Database Update
      const updatedDocuments = { ...shipment.documents };
      let foundCategory = '';
      let fileName = '';

      const urlStr = typeof url === 'string' ? url : (url && typeof url === 'object' ? ((url as any).url || (url as any).fileUrl || (url as any).path || '') : String(url || ''));
      const rawParts = urlStr ? urlStr.split('/') : [];
      const rawDecoded = rawParts.length > 0 ? decodeURIComponent(rawParts[rawParts.length - 1].split('?')[0]) : 'Anexo';
      fileName = rawDecoded.includes('_') ? rawDecoded.split('_').slice(2).join('_') : rawDecoded;

      // Find the category and remove the URL safely whether it's an Array or a String
      Object.keys(updatedDocuments).forEach(category => {
        const val = updatedDocuments[category];
        if (Array.isArray(val)) {
          if (val.includes(url)) {
            foundCategory = category;
            updatedDocuments[category] = val.filter((u: string) => u !== url);
            if (updatedDocuments[category].length === 0) {
              delete updatedDocuments[category];
            }
          }
        } else if (typeof val === 'string' && val === url) {
          foundCategory = category;
          delete updatedDocuments[category];
        }
      });

      const updatedShipment: Shipment = {
        ...shipment,
        documents: updatedDocuments,
        history: [...shipment.history, createHistoryLog(`Anexo removido (${foundCategory || 'Geral'}): ${fileName || 'Arquivo'}`)]
      };

      await upsertShipment(updatedShipment);
      setShipments(prev => prev.map(s => s.id === shipmentId ? updatedShipment : s));
      showToast('Anexo removido com sucesso!', 'success');
    } catch (error: any) {
      console.error('Erro ao remover anexo:', error);
      showToast(`Erro ao remover anexo: ${error?.message || 'Verifique sua conexão.'}`, 'error');
    }
  };

  const handleUpdateShipmentAttachment = async (shipmentId: string, data: { 
    filesToAttach: { [key: string]: File[] }, 
    bankDetails?: string, 
    loadedTonnage?: number, 
    driverFreightValue?: number,
    icmsValue?: number,
    advancePercentage?: number, 
    advanceValue?: number,
    tollValue?: number, 
    balanceToReceiveValue?: number,
    discountValue?: number,
    isBreakageWaived?: boolean,
    netBalanceValue?: number,
    unloadedTonnage?: number,
    route?: string,
    grStatus?: 'aprovado' | 'reprovado' | 'reprovado_restrito',
    riskReleaseCode?: string,
    riskQueryType?: string,
    riskQueryCost?: number,
    realProfitData?: RealProfitData,
    codigoAtua?: string,
  }) => {
    const { filesToAttach, bankDetails, loadedTonnage, driverFreightValue, icmsValue, advancePercentage, advanceValue, tollValue, balanceToReceiveValue, discountValue, isBreakageWaived, netBalanceValue, unloadedTonnage, route, grStatus, riskReleaseCode, riskQueryType, riskQueryCost, realProfitData, codigoAtua } = data;
    
    if (!currentUser) {
      showToast('Usuário não autenticado.', 'error');
      throw new Error('Usuário não autenticado');
    }

    if (isDemoUser(currentUser)) {
      showToast('Usuário em modo demonstração possui acesso apenas de visualização.', 'warning');
      throw new Error('Usuário em modo demonstração possui acesso apenas de visualização.');
    }

    const originalShipment = shipments.find(s => s.id === shipmentId);
    
    if (!originalShipment) {
      showToast('Embarque não encontrado.', 'error');
      throw new Error('Embarque não encontrado');
    }

    // Validation for "Aguardando Seguradora" transition
    if (originalShipment.status === ShipmentStatus.AguardandoSeguradora) {
        if (!grStatus || grStatus === 'aprovado') {
            // Resolve the product linked to this shipment's cargo
            const relatedCargo = findCargoById(cargos, originalShipment.cargoId);
            const relatedProduct = findProductForCargo(products, relatedCargo);
            const needsFullRiskFlow = checkRequiresRiskManagement(relatedCargo, relatedProduct);

            if (needsFullRiskFlow) {
                // Fluxo completo: exige código de liberação + tipo de consulta
                if (!riskReleaseCode?.trim()) {
                    showToast('O Código de Liberação da Gerenciadora é obrigatório.', 'warning');
                    throw new Error('O Código de Liberação da Gerenciadora é obrigatório.');
                }
                if (!riskQueryType) {
                    showToast('O Tipo de Consulta Realizada é obrigatório.', 'warning');
                    throw new Error('O Tipo de Consulta Realizada é obrigatório.');
                }
            }
        }
    }


    // Validation for "Aguardando Nota" transition
    if (originalShipment.status === ShipmentStatus.AguardandoNota && !originalShipment.bankDetails && !bankDetails) {
        showToast('Dados bancários são obrigatórios para avançar para a etapa de adiantamento.', 'warning');
        throw new Error('Dados bancários são obrigatórios para avançar para a etapa de adiantamento.');
    }

    if (originalShipment.status === ShipmentStatus.AguardandoCarregamento && !route?.trim()) {
        showToast('A rota do motorista é obrigatória para avançar para a próxima etapa.', 'warning');
        throw new Error('A rota do motorista é obrigatória para avançar para a próxima etapa.');
    }

    if (originalShipment.status === ShipmentStatus.AguardandoCarregamento && (!loadedTonnage || loadedTonnage <= 0)) {
        showToast('O peso carregado é obrigatório para avançar para a próxima etapa.', 'warning');
        throw new Error('O peso carregado é obrigatório para avançar para a próxima etapa.');
    }

    const relatedCargoForTransition = findCargoById(cargos, originalShipment.cargoId);
    const relatedProductForTransition = findProductForCargo(products, relatedCargoForTransition);
    const productRequiresRiskForTransition = checkRequiresRiskManagement(relatedCargoForTransition, relatedProductForTransition);
    const cargoRequiresScheduling = Boolean(relatedCargoForTransition?.requiresScheduling);

    let nextStatus: ShipmentStatus | undefined;

    if (originalShipment.status === ShipmentStatus.AguardandoSeguradora && (grStatus === 'reprovado' || grStatus === 'reprovado_restrito')) {
        nextStatus = ShipmentStatus.Cancelado;
    } else if (originalShipment.status === ShipmentStatus.PreCadastro) {
        // 1 - Ag. Cadastro -> 2 - Ag. Seguradora (ou pula para 3 - Ag. Carregamento se produto não requer GR)
        nextStatus = productRequiresRiskForTransition ? ShipmentStatus.AguardandoSeguradora : ShipmentStatus.AguardandoCarregamento;
    } else if (originalShipment.status === ShipmentStatus.AguardandoSeguradora) {
        // 2 - Ag. Seguradora -> 3 - Ag. Carregamento
        nextStatus = ShipmentStatus.AguardandoCarregamento;
    } else if (originalShipment.status === ShipmentStatus.AguardandoCarregamento) {
        // 3 - Ag. Carregamento -> 4 - Ag. Nota
        nextStatus = ShipmentStatus.AguardandoNota;
    } else if (originalShipment.status === ShipmentStatus.AguardandoNota) {
        // 4 - Ag. Nota -> 5 - Ag. Fiscal
        nextStatus = ShipmentStatus.AguardandoFiscal;
    } else if (originalShipment.status === ShipmentStatus.AguardandoFiscal) {
        // 5 - Ag. Fiscal -> 6 - Ag. Adiantamento (ou pula para 7/8 se explicitamente 0% de adiantamento)
        const isComplementar = Boolean(originalShipment.isComplementar || (originalShipment.documents as any)?.is_complementar);
        const is0PercentAdvance = isShipment0PercentAdvance(originalShipment, advancePercentage);

        if (is0PercentAdvance) {
            // Pula "6 - Ag. Adiantamento"
            // Para complementar, vai direto para Aguardando Descarga
            nextStatus = (cargoRequiresScheduling && !isComplementar) ? ShipmentStatus.AguardandoAgendamento : ShipmentStatus.AguardandoDescarga;
        } else {
            nextStatus = ShipmentStatus.AguardandoAdiantamento;
        }
    } else if (originalShipment.status === ShipmentStatus.AguardandoAdiantamento) {
        // 6 - Ag. Adiantamento -> 7 - Ag. Agend. ou Troca/nfe apenas se a carga tiver "Exige Agendamento" ligada; senão vai direto para 8 - Ag. Descarga
        const isComplementar = Boolean(originalShipment.isComplementar || (originalShipment.documents as any)?.is_complementar);
        const existingAdvReceipt = originalShipment.documents?.['Comprovante de Adiantamento'] || (originalShipment.documents as any)?.comprovante_adiantamento;
        const hasAttachedReceipt = (filesToAttach['Comprovante de Adiantamento'] && filesToAttach['Comprovante de Adiantamento'].length > 0) ||
                                   (filesToAttach['Comprovante de Pagamento de Adiantamento'] && filesToAttach['Comprovante de Pagamento de Adiantamento'].length > 0);
        const hasExistingReceipt = Array.isArray(existingAdvReceipt) ? existingAdvReceipt.length > 0 : Boolean(existingAdvReceipt);

        if (!hasAttachedReceipt && !hasExistingReceipt) {
            console.warn(`[handleUpdateShipmentAttachment] Embarque ${originalShipment.id} tentou avançar de Aguardando Adiantamento sem comprovante anexado. Mantendo em Aguardando Adiantamento.`);
            nextStatus = ShipmentStatus.AguardandoAdiantamento;
        } else {
            nextStatus = (cargoRequiresScheduling && !isComplementar) ? ShipmentStatus.AguardandoAgendamento : ShipmentStatus.AguardandoDescarga;
        }
    } else if (originalShipment.status === ShipmentStatus.AguardandoAgendamento) {
        // 7 - Ag. Agend. ou Troca/nfe -> 8 - Ag. Descarga
        nextStatus = ShipmentStatus.AguardandoDescarga;
    } else if (currentUser.profile === UserProfile.Motorista && originalShipment.status === ShipmentStatus.AguardandoDescarga) {
        nextStatus = ShipmentStatus.AguardandoDescarga;
    } else if (originalShipment.status === ShipmentStatus.AguardandoDescarga) {
        const isComplementar = Boolean(originalShipment.isComplementar || (originalShipment.documents as any)?.is_complementar);
        if (isComplementar) {
            // Para complementar, o comprovante de descarga já foi conferido no original.
            // Se foi 100% adiantamento, pula Aguardando Saldo e vai direto para Finalizado!
            const is100PercentAdvance = isShipment100PercentAdvance({
              ...originalShipment,
              ...(unloadedTonnage !== undefined ? { unloadedTonnage } : {}),
            });
            nextStatus = is100PercentAdvance ? ShipmentStatus.Finalizado : ShipmentStatus.AguardandoPagamentoSaldo;
        } else {
            // 8 - Ag. Descarga -> 9 - Valid. de Ticket
            nextStatus = ShipmentStatus.ValidacaoTicket;
        }
    } else if (originalShipment.status === ShipmentStatus.ValidacaoTicket) {
        // 9 - Valid. de Ticket -> 10 - Ag. Saldo (ou pula para 11 se 100% de adiantamento)
        const is100PercentAdvance = isShipment100PercentAdvance({
          ...originalShipment,
          ...(unloadedTonnage !== undefined ? { unloadedTonnage } : {}),
        });
        if (is100PercentAdvance) {
            // Pula "10 - Ag. Saldo" e vai direto para "11 - Finalizado"
            nextStatus = ShipmentStatus.Finalizado;
        } else {
            nextStatus = ShipmentStatus.AguardandoPagamentoSaldo;
        }
    } else if (originalShipment.status === ShipmentStatus.AguardandoPagamentoSaldo) {
        // 10 - Ag. Saldo -> 11 - Finalizado
        nextStatus = ShipmentStatus.Finalizado;
    } else if (originalShipment.status === ShipmentStatus.Finalizado) {
        nextStatus = ShipmentStatus.Finalizado;
    } else {
        nextStatus = nextStatusMap[originalShipment.status];
    }
    
    if (!nextStatus) {
      console.warn(`[handleUpdateShipmentAttachment] No next status found for ${originalShipment.status}`);
      throw new Error(`Não há próximo status configurado para ${originalShipment.status}`);
    }

    const currentStatus = originalShipment.status;
    let isUserAllowed = true;
    let alertMessage = '';

    // Check permissions based on the current status
    if (isDeveloperUser(currentUser) || currentUser.profile === UserProfile.Desenvolvedor) {
        isUserAllowed = true;
    } else if (currentStatus === ShipmentStatus.PreCadastro) {
        isUserAllowed = [UserProfile.Fiscal, UserProfile.Diretor, UserProfile.Supervisor, UserProfile.Embarcador, UserProfile.Comercial, UserProfile.Admin, UserProfile.Agenciador, UserProfile.GerenciadoraDeRisco].includes(currentUser.profile);
        alertMessage = 'Apenas os perfis Gerenciadora de Risco, Comercial, Fiscal, Diretor, Supervisor, Embarcador, Agenciador ou Administrador podem realizar esta ação.';
    } else if (currentStatus === ShipmentStatus.AguardandoSeguradora) {
        isUserAllowed = [UserProfile.GerenciadoraDeRisco, UserProfile.Admin, UserProfile.Diretor, UserProfile.Supervisor, UserProfile.Embarcador, UserProfile.Fiscal, UserProfile.Comercial, UserProfile.Financeiro].includes(currentUser.profile);
        alertMessage = 'Apenas o perfil Gerenciadora de Risco, Embarcador ou Administrador do Sistema pode avançar embarques neste status.';
    } else if (currentStatus === ShipmentStatus.AguardandoDescarga) {
        isUserAllowed = [UserProfile.Embarcador, UserProfile.Fiscal, UserProfile.Diretor, UserProfile.Supervisor, UserProfile.Comercial, UserProfile.Admin, UserProfile.Financeiro, UserProfile.Agenciador, UserProfile.Motorista, UserProfile.GerenciadoraDeRisco].includes(currentUser.profile);
        alertMessage = 'Você não tem permissão para anexar o comprovante de descarga.';
    } else if (currentStatus === ShipmentStatus.ValidacaoTicket) {
        isUserAllowed = [UserProfile.Fiscal, UserProfile.Diretor, UserProfile.Supervisor, UserProfile.Comercial, UserProfile.Admin, UserProfile.Financeiro, UserProfile.GerenciadoraDeRisco].includes(currentUser.profile);
        alertMessage = 'Apenas os perfis Fiscal, Supervisor, Diretor, Comercial, Financeiro, Gerenciadora de Risco ou Administrador do Sistema podem validar o ticket do embarque (bloqueado para Embarcador).';
    } else if (currentStatus === ShipmentStatus.AguardandoAdiantamento || currentStatus === ShipmentStatus.AguardandoPagamentoSaldo || currentStatus === ShipmentStatus.Finalizado) {
        isUserAllowed = [UserProfile.Financeiro, UserProfile.Diretor, UserProfile.Supervisor, UserProfile.Admin, UserProfile.Fiscal, UserProfile.Comercial, UserProfile.GerenciadoraDeRisco].includes(currentUser.profile);
        alertMessage = 'Apenas os perfis Financeiro, Diretor, Supervisor, Fiscal, Comercial, Gerenciadora de Risco ou Administrador do Sistema podem realizar esta ação.';
    }


    if (!isUserAllowed) {
        showToast(`Você não tem permissão para alterar o status deste embarque. ${alertMessage}`, 'error');
        throw new Error(`Você não tem permissão para alterar o status deste embarque. ${alertMessage}`);
    }

    // 1. Upload Files - Fetch freshest documents from Supabase to prevent concurrent overwrites
    let latestDbDocs: Record<string, any> = {};
    let latestDbCteNumber: string | undefined = undefined;
    let latestDbCteDate: string | undefined = undefined;
    let latestDbNfeNumber: string | undefined = undefined;
    let latestDbMdfeNumber: string | undefined = undefined;

    try {
      const { data: freshRow } = await supabase
        .from('shipments')
        .select('documents, cte_number, cte_emission_date, nfe_number, mdfe_number')
        .eq('id', shipmentId)
        .single();
      if (freshRow?.documents) {
        latestDbDocs = freshRow.documents;
      }
      latestDbCteNumber = freshRow?.cte_number || freshRow?.documents?.cte_number;
      latestDbCteDate = freshRow?.cte_emission_date || freshRow?.documents?.cte_emission_date;
      latestDbNfeNumber = freshRow?.nfe_number || freshRow?.documents?.nfe_number;
      latestDbMdfeNumber = freshRow?.mdfe_number || freshRow?.documents?.mdfe_number;
    } catch (err) {
      console.warn('[handleUpdateShipmentAttachment] Could not fetch freshest db documents:', err);
    }

    const updatedDocuments = { ...(originalShipment.documents || {}), ...latestDbDocs };
    const attachedFileNames: string[] = [];

    try {
      for (const docType in filesToAttach) {
        const files = filesToAttach[docType];
        if (!Array.isArray(files) || files.length === 0) continue;
        
        const newDocUrls = [];
        for (const file of files) {
          const path = await uploadShipmentAttachment(shipmentId, docType, file);
          const url = getShipmentAttachmentUrl(path);
          newDocUrls.push(url);
          attachedFileNames.push(file.name);
        }
        const existingDocs = updatedDocuments[docType] || [];
        updatedDocuments[docType] = Array.from(new Set([...existingDocs, ...newDocUrls]));
      }

      if (codigoAtua !== undefined && codigoAtua !== null && String(codigoAtua).trim() !== '') {
        const cleanAtua = String(codigoAtua).trim();
        updatedDocuments.codigo_atua = cleanAtua;
        updatedDocuments.codg_atua = cleanAtua;
      }

      if (originalShipment.status === ShipmentStatus.AguardandoAdiantamento && nextStatus !== originalShipment.status) {
        const nowIso = new Date().toISOString();
        updatedDocuments.data_liberacao_adiantamento = nowIso;
        updatedDocuments.hora_data_liberacao_adiantamento = nowIso;
      }

      if (originalShipment.status === ShipmentStatus.AguardandoPagamentoSaldo && nextStatus !== originalShipment.status) {
        const nowIso = new Date().toISOString();
        updatedDocuments.data_liberacao_saldo = nowIso;
        updatedDocuments.hora_data_liberacao_saldo = nowIso;
      }
    } catch (error) {
      console.error('Erro ao fazer upload dos anexos:', error);
      showToast('Ocorreu um erro ao enviar os arquivos. Verifique sua conexão e tente novamente.', 'error');
      throw error;
    }

    // 1b. Extract fiscal document numbers (CT-e, NF-e, MDF-e, Data de Emissão) from attached files
    const targetStatus = nextStatus || originalShipment.status;
    const canExtractCte = isCteApplicableForStatus(targetStatus);

    let extractedCteNumber: string | undefined = originalShipment.cteNumber || latestDbCteNumber || undefined;
    let extractedCteEmissionDate: string | undefined = originalShipment.cteEmissionDate || latestDbCteDate || undefined;
    let extractedCiotNumber: string | undefined = originalShipment.ciotNumber || originalShipment.ciot || undefined;
    let extractedNfeNumber: string | undefined = originalShipment.nfeNumber || latestDbNfeNumber || undefined;
    let extractedMdfeNumber: string | undefined = originalShipment.mdfeNumber || latestDbMdfeNumber || undefined;
    let fiscalDocLog = '';
    let extractedTollValue: number | undefined = undefined;
    let extractedAdvanceValue: number | undefined = undefined;
    let extractedAdvancePercentage: number | undefined = undefined;
    let extractedFiscalNums: any = null;

    if (Object.keys(filesToAttach).length > 0) {
      try {
        const fiscalNums = await extractFiscalDocNumbers(filesToAttach);
        extractedFiscalNums = fiscalNums;
        const hasCteFileInBatch = Object.keys(filesToAttach).some(dt => isCteDocType(dt));

        if (canExtractCte && fiscalNums.cteNumber && (hasCteFileInBatch || !extractedCteNumber)) {
          extractedCteNumber = fiscalNums.cteNumber;
        }
        if (canExtractCte && fiscalNums.cteEmissionDate && (hasCteFileInBatch || !extractedCteEmissionDate)) {
          extractedCteEmissionDate = fiscalNums.cteEmissionDate;
        }
        if (fiscalNums.ciotNumber) {
          extractedCiotNumber = fiscalNums.ciotNumber;
          updatedDocuments.ciot_number = fiscalNums.ciotNumber;
          updatedDocuments.ciot = fiscalNums.ciotNumber;
        }
        if (fiscalNums.sestSenatValue !== undefined) {
          updatedDocuments.sest_senat = fiscalNums.sestSenatValue;
          updatedDocuments.sestSenat = fiscalNums.sestSenatValue;
        }
        if (fiscalNums.inssRetidoValue !== undefined) {
          updatedDocuments.inss_retido = fiscalNums.inssRetidoValue;
          updatedDocuments.inssRetido = fiscalNums.inssRetidoValue;
        }
        if (fiscalNums.subtotalSaldoValue !== undefined) {
          updatedDocuments.saldo_liquido = fiscalNums.subtotalSaldoValue;
        }
        if (fiscalNums.cteRemetente) {
          updatedDocuments.cte_remetente = fiscalNums.cteRemetente;
          updatedDocuments.cteRemetente = fiscalNums.cteRemetente;
        }
        if (fiscalNums.cteTomadorNome) {
          updatedDocuments.cte_tomador = fiscalNums.cteTomadorNome;
          updatedDocuments.cteTomadorNome = fiscalNums.cteTomadorNome;
        }
        if (fiscalNums.cteTomadorCnpj) {
          updatedDocuments.cte_tomador_cnpj = fiscalNums.cteTomadorCnpj;
          updatedDocuments.cteTomadorCnpj = fiscalNums.cteTomadorCnpj;
        }
        if (fiscalNums.nfeNumber) extractedNfeNumber = fiscalNums.nfeNumber;
        if (fiscalNums.mdfeNumber) extractedMdfeNumber = fiscalNums.mdfeNumber;
        if (fiscalNums.tollValue !== undefined) extractedTollValue = fiscalNums.tollValue;
        if (fiscalNums.advanceValue !== undefined) extractedAdvanceValue = fiscalNums.advanceValue;
        if (fiscalNums.advancePercentage !== undefined) extractedAdvancePercentage = fiscalNums.advancePercentage;

        // Se o embarque estava em Ag. Fiscal e a Carta Frete extraiu adiantamento > 0 ou % > 0, garante que avança para Ag. Adiantamento
        if (originalShipment.status === ShipmentStatus.AguardandoFiscal) {
          if ((extractedAdvancePercentage !== undefined && extractedAdvancePercentage > 0) || (extractedAdvanceValue !== undefined && extractedAdvanceValue > 1.00)) {
            nextStatus = ShipmentStatus.AguardandoAdiantamento;
          }
        }

        const docLogs = [
          (canExtractCte && fiscalNums.cteNumber) ? `CT-e nº ${fiscalNums.cteNumber}` : null,
          (canExtractCte && fiscalNums.cteEmissionDate) ? `Emissão: ${fiscalNums.cteEmissionDate}` : null,
          fiscalNums.ciotNumber ? `CIOT nº ${fiscalNums.ciotNumber}` : null,
          fiscalNums.nfeNumber ? `NF-e nº ${fiscalNums.nfeNumber}` : null,
          fiscalNums.mdfeNumber ? `MDF-e nº ${fiscalNums.mdfeNumber}` : null,
          fiscalNums.advanceValue !== undefined ? `Adiantamento: R$ ${fiscalNums.advanceValue.toLocaleString('pt-BR')}` : null,
          fiscalNums.tollValue !== undefined ? `Pedágio: R$ ${fiscalNums.tollValue.toLocaleString('pt-BR')}` : null,
          fiscalNums.advancePercentage !== undefined ? `% Adiantamento: ${fiscalNums.advancePercentage}%` : null,
        ].filter(Boolean);
        if (docLogs.length > 0) {
          fiscalDocLog = docLogs.join(', ');
        }
      } catch (e) {
        console.warn('[handleUpdateShipmentAttachment] Could not extract fiscal doc numbers:', e);
      }
    }

    // Safety fallback: if CTE is applicable and we have CTE documents attached, derive CTE number if still missing
    if (canExtractCte && !extractedCteNumber) {
      const derivedCte = getShipmentCte({ status: targetStatus, documents: updatedDocuments });
      if (derivedCte && derivedCte !== '-') {
        extractedCteNumber = derivedCte;
      }
    }
    if (canExtractCte && !extractedCteEmissionDate) {
      const derivedDate = getShipmentCteEmissionDate({ status: targetStatus, documents: updatedDocuments });
      if (derivedDate) {
        extractedCteEmissionDate = derivedDate;
      }
    }

    // 2. Prepare Updates
    const addedFilesLog: string[] = [];
    for (const [docType, files] of Object.entries(filesToAttach)) {
      if (!files || files.length === 0) continue;
      const fNames = files.map(f => f.name);
      addedFilesLog.push(`[${docType}]: ${fNames.join(', ')}`);
    }

    const historyLogs = [];
    if (addedFilesLog.length > 0) {
      historyLogs.push(`Anexos inseridos: ${addedFilesLog.join('; ')}.`);
    }
    if (bankDetails && bankDetails !== originalShipment.bankDetails) {
      historyLogs.push(`Dados bancários informados: "${bankDetails}".`);
    }
    if (fiscalDocLog) {
      historyLogs.push(`Dados fiscais vinculados: ${fiscalDocLog}.`);
    }

    let updatedTonnage = originalShipment.shipmentTonnage;
    let updatedDriverFreight = originalShipment.driverFreightValue;
    let updatedCompanyFreight: number | undefined;
    
    if (loadedTonnage !== undefined && loadedTonnage > 0) {
        updatedTonnage = loadedTonnage;
        if (driverFreightValue === undefined) {
          const rateToUse = originalShipment.driverFreightRateSnapshot || cargos.find(c => c.id === originalShipment.cargoId)?.driverFreightValuePerTon || 0;
          updatedDriverFreight = rateToUse * loadedTonnage;
        }
        const compRateToUse = originalShipment.companyFreightRateSnapshot || cargos.find(c => c.id === originalShipment.cargoId)?.companyFreightValuePerTon || 0;
        if (compRateToUse > 0) {
          updatedCompanyFreight = Number((compRateToUse * loadedTonnage).toFixed(2));
        }
        const formattedVal = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(updatedDriverFreight);
        if (loadedTonnage !== originalShipment.shipmentTonnage) {
          historyLogs.push(`Peso/Toneladas efetivadas atualizadas: ${loadedTonnage.toLocaleString('pt-BR')} ton (Frete Motorista: ${formattedVal}).`);
        }

        // Recalcular Custo Financeiro proporcional ao peso carregado real
        const relatedCargoForFin = cargos.find(c => c.id === originalShipment.cargoId || (c.sequenceId && `CRG-${c.sequenceId}` === originalShipment.cargoId));
        if (relatedCargoForFin?.financialCostEnabled) {
          const effectiveRate = originalShipment.financialCostRate ?? relatedCargoForFin.financialCostEffectiveRate ?? (
            relatedCargoForFin.financialCostMonthlyRate && relatedCargoForFin.financialCostDaysTerm
              ? Number(((relatedCargoForFin.financialCostMonthlyRate * relatedCargoForFin.financialCostDaysTerm) / (relatedCargoForFin.financialCostBaseDays || 30)).toFixed(4))
              : undefined
          );
          const compRate = originalShipment.companyFreightRateSnapshot || relatedCargoForFin.companyFreightValuePerTon || 0;
          if (effectiveRate !== undefined && effectiveRate > 0 && compRate > 0) {
            const newFinCost = Number(((compRate * loadedTonnage) * (effectiveRate / 100)).toFixed(2));
            updatedDocuments.financial_cost_value = newFinCost;
          } else if (relatedCargoForFin.financialCostPerTon) {
            updatedDocuments.financial_cost_value = Number((relatedCargoForFin.financialCostPerTon * loadedTonnage).toFixed(2));
          }
        }
    }

    if (driverFreightValue !== undefined && driverFreightValue > 0) {
        updatedDriverFreight = driverFreightValue;
        const formattedVal = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(driverFreightValue);
        historyLogs.push(`Frete Motorista atualizado conforme Carta Frete: ${formattedVal}.`);
    }

    const relatedCargo = cargos.find(c => c.id === originalShipment.cargoId || (c.sequenceId && `CRG-${c.sequenceId}` === originalShipment.cargoId));
    const isCargoWithoutIcms = Boolean(
      relatedCargo &&
      !relatedCargo.hasIcms &&
      !(relatedCargo.icmsPercentage && Number(relatedCargo.icmsPercentage) > 0) &&
      !(relatedCargo.freightLegs && relatedCargo.freightLegs[0]?.hasIcms === true) &&
      !(relatedCargo.freightLegs && Number(relatedCargo.freightLegs[0]?.icmsPercentage) > 0) &&
      (relatedCargo as any).freightCalculationType !== 'per_ton_plus_icms' &&
      !(relatedCargo.freightLegs && (relatedCargo.freightLegs[0] as any)?.freightCalculationType === 'per_ton_plus_icms')
    );

    if (isCargoWithoutIcms) {
      updatedDocuments.is_icms_exempt = true;
      updatedDocuments.isIcmsExempt = true;
      updatedDocuments.icms_value = 0;
      updatedDocuments.valor_icms = 0;
    } else if (icmsValue !== undefined) {
      const formattedVal = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(icmsValue);
      historyLogs.push(`ICMS atualizado conforme CT-e: ${formattedVal}.`);
      updatedDocuments.icms_value = icmsValue;
    }
    
    let calculatedAdvanceValue = originalShipment.advanceValue;
    let finalAdvancePercentage = originalShipment.advancePercentage;
    const effectiveTollValue = tollValue !== undefined ? tollValue : (extractedTollValue !== undefined ? extractedTollValue : originalShipment.tollValue);
    const effectiveAdvancePercentage = advancePercentage !== undefined ? advancePercentage : (extractedAdvancePercentage !== undefined ? extractedAdvancePercentage : (originalShipment.advancePercentage !== undefined ? originalShipment.advancePercentage : 70));

    const isPfCalc = (originalShipment.driverFreightType === 'PF' || originalShipment.anttModality === 'TAC');
    const calcResult = calculateAdvanceAndBalance({
      driverFreightValue: updatedDriverFreight,
      tollValue: effectiveTollValue || 0,
      advancePercentage: effectiveAdvancePercentage,
      driverFreightType: isPfCalc ? 'PF' : 'PJ',
    });

    if (advanceValue !== undefined) {
        calculatedAdvanceValue = advanceValue;
        finalAdvancePercentage = effectiveAdvancePercentage;
        historyLogs.push(`Valor pago na conta de R$ ${Number(calculatedAdvanceValue).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} registrado.`);
    } else if (extractedAdvanceValue !== undefined) {
        calculatedAdvanceValue = extractedAdvanceValue;
        finalAdvancePercentage = effectiveAdvancePercentage;
        historyLogs.push(`Valor pago na conta de R$ ${Number(calculatedAdvanceValue).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} extraído do documento.`);
    } else if (effectiveAdvancePercentage !== undefined && effectiveAdvancePercentage > 0) {
        finalAdvancePercentage = effectiveAdvancePercentage;
        calculatedAdvanceValue = calcResult.advanceInAccountValue;
        const formattedAdv = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(calculatedAdvanceValue);
        historyLogs.push(`Pagamento de Adiantamento: ${effectiveAdvancePercentage}% registrado (Conta: ${formattedAdv} + Tag: R$ ${(effectiveTollValue || 0).toLocaleString('pt-BR')}).`);
    }

    if (effectiveTollValue !== undefined && effectiveTollValue !== originalShipment.tollValue && (advanceValue !== undefined || extractedAdvanceValue !== undefined)) {
      historyLogs.push(`Pedágio no Tag: R$ ${Number(effectiveTollValue).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}.`);
    }

    let finalBalanceToReceive = balanceToReceiveValue ?? (
      (extractedFiscalNums?.subtotalSaldoValue !== undefined && extractedFiscalNums.subtotalSaldoValue > 0)
        ? extractedFiscalNums.subtotalSaldoValue
        : ((originalShipment.balanceToReceiveValue !== undefined && originalShipment.balanceToReceiveValue > 0 && originalShipment.status === ShipmentStatus.AguardandoPagamentoSaldo) ? originalShipment.balanceToReceiveValue : calcResult.balanceToReceiveValue)
    );
    let finalDiscountValue = isBreakageWaived ? 0 : (discountValue ?? originalShipment.discountValue);
    let finalNetBalanceValue = netBalanceValue ?? originalShipment.netBalanceValue;
    let finalIsBreakageWaived = isBreakageWaived !== undefined ? isBreakageWaived : originalShipment.isBreakageWaived;

    // Se o adiantamento for de 100%, zera saldo a receber e saldo líquido com precisão estrita
    if (finalAdvancePercentage !== undefined && finalAdvancePercentage >= 100) {
      finalBalanceToReceive = 0;
      finalNetBalanceValue = 0;
      updatedDocuments.porcentagem_adiantamento = 100;
      updatedDocuments.advance_percentage = 100;
      updatedDocuments.saldo = 0;
      updatedDocuments.saldo_motorista = 0;
    }

    if (isBreakageWaived) {
        historyLogs.push(`Quebra de carga abonada (sem aplicação de desconto).`);
    } else if (discountValue !== undefined && discountValue > 0) {
        const formattedDiscount = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(discountValue);
        historyLogs.push(`Desconto de quebra aplicado: ${formattedDiscount}.`);
    }

    if (balanceToReceiveValue !== undefined || discountValue !== undefined || netBalanceValue !== undefined) {
        historyLogs.push(`Pagamento de Saldo registrado.`);
    }

    let finalUnloadedTonnage = unloadedTonnage ?? originalShipment.unloadedTonnage;
    if (unloadedTonnage !== undefined && unloadedTonnage > 0 && unloadedTonnage !== originalShipment.unloadedTonnage) {
        historyLogs.push(`Peso descarregado conferido: ${unloadedTonnage.toLocaleString('pt-BR')} ton.`);
    }
    
    if (route && route !== originalShipment.route) historyLogs.push(`Rota informada: "${route}".`);
    if (riskReleaseCode) historyLogs.push(`Liberação de Seguradora: Cód ${riskReleaseCode} (${riskQueryType} - R$ ${riskQueryCost})`);

    let cancellationReason = originalShipment.cancellationReason;
    if (originalShipment.status === ShipmentStatus.AguardandoSeguradora && (grStatus === 'reprovado' || grStatus === 'reprovado_restrito')) {
        if (grStatus === 'reprovado') {
            cancellationReason = 'Reprovado no GR';
            historyLogs.push('Embarque cancelado devido a Reprovado no GR.');
        } else {
            cancellationReason = 'Reprovado no GR e Restrito';
            historyLogs.push('Embarque cancelado devido a Reprovado no GR e Restrito. Motorista negativado/restrito no sistema.');
        }
    }

    const isStatusSame = nextStatus === originalShipment.status;
    let logMessage = '';
    if (isStatusSame) {
        logMessage = `Alterações em Gerenciar Anexos: ${historyLogs.join(' ') || 'Dados e anexos salvos com sucesso.'}`;
    } else {
        if (!isStatusSame && originalShipment.statusPendingObservation) {
            historyLogs.push(`(Pendência arquivada do status anterior "${originalShipment.status}": "${originalShipment.statusPendingObservation}")`);
        }
        logMessage = `Status alterado para "${nextStatus}". ${historyLogs.join(' ')}`;
    }
    const statusChangeLog = createHistoryLog(logMessage);

    const updatedShipment: Shipment = {
        ...originalShipment,
        status: nextStatus,
        statusPendingObservation: isStatusSame ? originalShipment.statusPendingObservation : undefined,
        cancellationReason: cancellationReason,
        documents: updatedDocuments,
        financialCostValue: updatedDocuments.financial_cost_value !== undefined ? updatedDocuments.financial_cost_value : originalShipment.financialCostValue,
        bankDetails: bankDetails || originalShipment.bankDetails,
        shipmentTonnage: updatedTonnage,
        driverFreightValue: updatedDriverFreight,
        advancePercentage: finalAdvancePercentage,
        advanceValue: calculatedAdvanceValue,
        tollValue: effectiveTollValue !== undefined ? effectiveTollValue : originalShipment.tollValue,
        balanceToReceiveValue: finalBalanceToReceive,
        discountValue: finalDiscountValue,
        netBalanceValue: finalNetBalanceValue,
        isBreakageWaived: finalIsBreakageWaived,
        unloadedTonnage: finalUnloadedTonnage,
        route: route || originalShipment.route,
        riskReleaseCode: riskReleaseCode || originalShipment.riskReleaseCode,
        riskQueryType: riskQueryType || originalShipment.riskQueryType,
        riskQueryCost: riskQueryCost !== undefined ? riskQueryCost : originalShipment.riskQueryCost,
        cteNumber: extractedCteNumber,
        cteEmissionDate: extractedCteEmissionDate,
        ciotNumber: extractedCiotNumber,
        ciot: extractedCiotNumber,
        nfeNumber: extractedNfeNumber,
        mdfeNumber: extractedMdfeNumber,
        isIcmsExempt: isCargoWithoutIcms ? true : (originalShipment.isIcmsExempt ?? (updatedDocuments.is_icms_exempt === true || updatedDocuments.isIcmsExempt === true)),
        icmsValue: isCargoWithoutIcms ? 0 : (icmsValue !== undefined ? icmsValue : originalShipment.icmsValue),
        codigoAtua: (codigoAtua !== undefined && codigoAtua !== null && String(codigoAtua).trim() !== '') ? String(codigoAtua).trim() : originalShipment.codigoAtua,
        realProfitData: (realProfitData || originalShipment.realProfitData || extractedFiscalNums?.sestSenatValue !== undefined || icmsValue !== undefined || isCargoWithoutIcms || updatedCompanyFreight !== undefined)
          ? {
              ...(originalShipment.realProfitData || {}),
              ...(updatedCompanyFreight !== undefined ? { companyFreight: updatedCompanyFreight } : {}),
              ...(realProfitData || {}),
              ...(extractedFiscalNums?.sestSenatValue !== undefined ? { sestSenat: extractedFiscalNums.sestSenatValue } : {}),
              ...(extractedFiscalNums?.inssRetidoValue !== undefined ? { inssRetido: extractedFiscalNums.inssRetidoValue } : {}),
              ...(isCargoWithoutIcms ? { isIcmsExempt: true, icmsDifference: 0, icms: 0 } : (icmsValue !== undefined ? { icmsDifference: icmsValue } : {})),
            } as any
          : undefined,
        history: [...originalShipment.history, statusChangeLog],
        statusHistory: isStatusSame
            ? (originalShipment.statusHistory || [])
            : [
                ...(originalShipment.statusHistory || []),
                {
                    status: nextStatus,
                    timestamp: new Date().toISOString(),
                    userId: currentUser.id,
                }
            ],
    };

    if (!isStatusSame && updatedDocuments) {
        delete (updatedDocuments as any).status_pending_observation;
        delete (updatedDocuments as any).statusPendingObservation;
    }

    // 3. Prepare Cargo Update (if applicable)
    const statusOrder = [
        ShipmentStatus.AguardandoSeguradora, ShipmentStatus.PreCadastro,
        ShipmentStatus.AguardandoCarregamento, ShipmentStatus.AguardandoNota, ShipmentStatus.AguardandoFiscal,
        ShipmentStatus.AguardandoAdiantamento, ShipmentStatus.AguardandoAgendamento,
        ShipmentStatus.AguardandoDescarga, ShipmentStatus.ValidacaoTicket, ShipmentStatus.AguardandoPagamentoSaldo,
        ShipmentStatus.Finalizado
    ];

    const updatedShipments = shipments.map(s => s.id === shipmentId ? updatedShipment : s);
    let updatedCargo: Cargo | undefined;
    if (relatedCargo) {
        const reconciled = reconcileCargoWithShipments(relatedCargo, updatedShipments);
        let logDesc = '';
        if (nextStatus === ShipmentStatus.Cancelado && originalShipment.status !== ShipmentStatus.Cancelado) {
            logDesc = `Volume agendado ajustado devido ao cancelamento do embarque ${shipmentId} (Reprovação no GR).`;
        } else if (Math.abs(reconciled.loadedVolume - (relatedCargo.loadedVolume || 0)) >= 0.01) {
            logDesc = `Volume carregado atualizado para ${reconciled.loadedVolume.toFixed(2)} ton via embarque ${shipmentId}.`;
        } else if (Math.abs(reconciled.scheduledVolume - (relatedCargo.scheduledVolume || 0)) >= 0.01) {
            logDesc = `Volume agendado atualizado para ${reconciled.scheduledVolume.toFixed(2)} ton via embarque ${shipmentId}.`;
        }
        updatedCargo = {
            ...reconciled,
            history: logDesc ? [...relatedCargo.history, createHistoryLog(logDesc)] : relatedCargo.history
        };
    }

    let updatedDriverToRestrict: Driver | undefined;
    if (grStatus === 'reprovado_restrito' && (originalShipment.driverCpf || originalShipment.driverName)) {
        const driverObj = drivers.find(d => (d.cpf && d.cpf === originalShipment.driverCpf) || d.name === originalShipment.driverName);
        if (driverObj) {
            updatedDriverToRestrict = {
                ...driverObj,
                active: false,
                restrictionReason: 'Reprovado no GR',
            };
        }
    }

    let createdTicket: Ticket | undefined;
    if (currentUser.profile === UserProfile.Motorista && originalShipment.status === ShipmentStatus.AguardandoDescarga) {
        const commentMsg = `Chamado criado automaticamente após o envio do comprovante de descarga pelo motorista ${currentUser.name}.`;
        const assignedToId = originalShipment.embarcadorId || '';

        const is100PercentAdvance = isShipment100PercentAdvance(originalShipment);
        const targetStatusText = is100PercentAdvance ? '"Finalizado"' : '"Ag. Saldo"';

        try {
          createdTicket = await insertUniqueTicket({
            title: `Confirmação de Descarga - Embarque ${shipmentId}`,
            description: `O motorista ${currentUser.name} anexou o Comprovante de Descarga para o embarque ${shipmentId}.\nPor favor, confirme o peso descarregado (Informado pelo motorista: ${unloadedTonnage ? unloadedTonnage + ' Ton' : 'Não informado'}) e altere o status do embarque para ${targetStatusText}.`,
            status: TicketStatus.Aberto,
            priority: TicketPriority.Alta,
            createdById: currentUser.id,
            assignedToId: assignedToId,
            shipmentId: shipmentId,
            cargoId: originalShipment.cargoId,
            history: [{
                userId: currentUser.id,
                timestamp: new Date().toISOString(),
                comment: commentMsg
            }]
          });
        } catch (ticketErr) {
          console.warn('[handleUpdateShipmentAttachment] Aviso ao criar chamado de descarga com insertUniqueTicket:', ticketErr);
        }
    }

    // 4. Persist to Supabase
    try {
      await upsertShipment(updatedShipment);
      if (updatedCargo) {
        await upsertCargo(updatedCargo);
      }
      if (updatedDriverToRestrict) {
        await upsertDriver(updatedDriverToRestrict);
      }
      
      // 5. Update local state on SUCCESS
      setShipments((prev: Shipment[]) => prev.map(s => s.id === shipmentId ? updatedShipment : s));
      if (updatedCargo) {
        const cargoToUpdate = updatedCargo; // capture for closure
        setCargos(prev => prev.map(c => c.id === cargoToUpdate.id ? cargoToUpdate : c));
      }
      if (createdTicket) {
        const ticketToUpdate = createdTicket;
        setTickets((prev: Ticket[]) => [ticketToUpdate, ...prev.filter(t => t.id !== ticketToUpdate.id)]);
        const numSeq = parseInt(ticketToUpdate.id.replace(/\D/g, ''), 10);
        if (!isNaN(numSeq)) {
          setNextIds((prev: any) => ({ ...prev, ticket: Math.max(prev.ticket || 1, numSeq + 1) }));
        }
      }
      if (updatedDriverToRestrict) {
        const driverToUpdate = updatedDriverToRestrict;
        setDrivers((prev: Driver[]) => prev.map(d => d.id === driverToUpdate.id ? driverToUpdate : d));
      }
      if (codigoAtua !== undefined && codigoAtua !== null && String(codigoAtua).trim() !== '') {
        const cleanAtua = String(codigoAtua).trim();
        setDrivers((prev: Driver[]) => prev.map(d => {
          const matchCpf = originalShipment.driverCpf && d.cpf && d.cpf.replace(/\D/g, '') === originalShipment.driverCpf.replace(/\D/g, '');
          const matchName = d.name && originalShipment.driverName && d.name.trim().toLowerCase() === originalShipment.driverName.trim().toLowerCase();
          if (matchCpf || matchName) {
            return { ...d, codigoAtua: cleanAtua };
          }
          return d;
        }));
        if (originalShipment.driverCpf) {
          const cleanCpf = originalShipment.driverCpf.replace(/\D/g, '');
          if (cleanCpf) {
            try {
              localStorage.setItem(`transcunha_driver_atua_${cleanCpf}`, cleanAtua);
            } catch { }
          }
        }
      }
      
      let successMsg = 'Embarque atualizado com sucesso!';
      if (grStatus === 'reprovado') {
        successMsg = 'Embarque cancelado devido a reprovação na Gerenciadora de Risco (GR).';
      } else if (grStatus === 'reprovado_restrito') {
        successMsg = 'Embarque cancelado e motorista marcado como RESTRITO por reprovação no GR.';
      } else if (currentUser.profile === UserProfile.Motorista && originalShipment.status === ShipmentStatus.AguardandoDescarga) {
        successMsg = 'Comprovante enviado! Aguardando confirmação do peso pelo embarcador.';
      }
      showToast(successMsg, 'success');

      // Automação de WhatsApp por Mudança de Etapa / Status
      try {
        const resolvedCargo = cargos.find(c => c.id === updatedShipment.cargoId);
        const resolvedClient = clients.find(c => c.id === resolvedCargo?.clientId);
        const matchedDriver = drivers.find(d => (d.cpf && d.cpf === updatedShipment.driverCpf) || d.name === updatedShipment.driverName);

        let autoTrigger: ShipmentWhatsAppTriggerType | null = null;

        if (originalShipment.status === ShipmentStatus.PreCadastro && nextStatus === ShipmentStatus.AguardandoSeguradora) {
          // GATILHO 1: Status "Aguardando Cadastro e Seguradora" (Homologação)
          autoTrigger = 'risk_pending';
        } else if (
          (originalShipment.status === ShipmentStatus.PreCadastro || originalShipment.status === ShipmentStatus.AguardandoSeguradora) && 
          nextStatus === ShipmentStatus.AguardandoCarregamento
        ) {
          // GATILHO 2: Status "Aguardando Carregamento" (Cadastro e Risco Liberados)
          autoTrigger = 'risk_approved';
        } else if (
          originalShipment.status === ShipmentStatus.AguardandoFiscal && 
          (nextStatus === ShipmentStatus.AguardandoAdiantamento || nextStatus === ShipmentStatus.AguardandoAgendamento || nextStatus === ShipmentStatus.AguardandoDescarga)
        ) {
          // GATILHO 3: Saída de "Aguardando Fiscal" para "Aguardando Adiantamento" / etapas seguintes (Envio de Documentação + PDFs)
          autoTrigger = 'fiscal_emitted';
        } else if (
          originalShipment.status === ShipmentStatus.AguardandoAdiantamento && 
          nextStatus !== ShipmentStatus.AguardandoAdiantamento
        ) {
          // GATILHO 4: Avanço do "Aguardando Adiantamento" (Comprovante de Adiantamento)
          autoTrigger = 'advance_paid';
        } else if (
          originalShipment.status !== ShipmentStatus.AguardandoAdiantamento && 
          nextStatus === ShipmentStatus.AguardandoAgendamento && 
          originalShipment.status !== ShipmentStatus.AguardandoAgendamento
        ) {
          // GATILHO 5A: Status "Aguardando Agendamento" / "Troca de NF-e"
          autoTrigger = 'in_transit';
        } else if (
          nextStatus === ShipmentStatus.AguardandoDescarga && 
          originalShipment.status !== ShipmentStatus.AguardandoDescarga
        ) {
          // GATILHO 5B: Status "Aguardando Descarga"
          autoTrigger = 'awaiting_discharge';
        } else if (
          (originalShipment.status === ShipmentStatus.AguardandoPagamentoSaldo || originalShipment.status === ShipmentStatus.ValidacaoTicket) && 
          nextStatus === ShipmentStatus.Finalizado
        ) {
          // GATILHO 6: Status "Aguardando Saldo" -> "Finalizado" (Comprovante de Saldo e Agradecimento)
          autoTrigger = 'balance_paid';
        }

        if (autoTrigger) {
          dispatchShipmentWhatsAppTrigger(autoTrigger, {
            shipment: updatedShipment,
            cargo: resolvedCargo,
            client: resolvedClient,
            driver: matchedDriver,
            drivers: drivers,
            user: currentUser,
            previousStatus: originalShipment.status,
            targetStatus: nextStatus
          }).then(res => {
            if (res.success) {
              console.log(`[WhatsApp Automation] Gatilho ${autoTrigger} disparado: ${res.message}`);
            } else if (res.error) {
              console.warn(`[WhatsApp Automation] Aviso no gatilho ${autoTrigger}: ${res.error}`);
            }
          }).catch(triggerErr => {
            console.warn(`[WhatsApp Automation] Falha ao disparar ${autoTrigger}:`, triggerErr);
          });
        }
      } catch (triggerSetupErr) {
        console.warn('[WhatsApp Automation] Erro ao preparar gatilho operacional:', triggerSetupErr);
      }
    } catch(err: any) { 
      console.error('Erro ao salvar no Supabase:', err);
      const errorMessage = err?.message || 'Erro desconhecido ao salvar no banco de dados.';
      showToast(`[ERRO CRÍTICO] Falha ao persistir dados: ${errorMessage}`, 'error');
      throw err;
    }
  };

  const handleUpdateShipmentAnttAndBankDetails = async (shipmentId: string, data: { anttOwnerIdentifier: string; bankDetails?: string }) => {
    if (!currentUser) return;
    if (isDemoUser(currentUser)) {
      showToast('Usuário em modo demonstração possui acesso apenas de visualização.', 'warning');
      return;
    }
    const shipmentToUpdate = shipments.find(s => s.id === shipmentId);
    if (!shipmentToUpdate) return;

    const changes: string[] = [];
    if (shipmentToUpdate.anttOwnerIdentifier !== data.anttOwnerIdentifier) changes.push(`${FIELD_TRANSLATIONS.anttOwnerIdentifier} definido.`);
    if (data.bankDetails && shipmentToUpdate.bankDetails !== data.bankDetails) changes.push(`${FIELD_TRANSLATIONS.bankDetails} definidos.`);

    const updatedShipment: Shipment = { 
      ...shipmentToUpdate, 
      anttOwnerIdentifier: data.anttOwnerIdentifier, 
      bankDetails: data.bankDetails || shipmentToUpdate.bankDetails, 
      history: changes.length > 0 ? [...shipmentToUpdate.history, createHistoryLog(changes.join(' '))] : shipmentToUpdate.history 
    };

    setShipments((prev: Shipment[]) => prev.map(s => s.id === shipmentId ? updatedShipment : s));
    try {
      await upsertShipment(updatedShipment);
    } catch (err) {
      console.error('Erro ao atualizar ANTT/banco:', err);
    }
  };

  const handleUpdateShipmentData = async (shipmentId: string, data: Partial<Shipment>, options?: { silent?: boolean }) => {
    if (!currentUser) return;
    if (isDemoUser(currentUser)) {
      if (!options?.silent) {
        showToast('Usuário em modo demonstração possui acesso apenas de visualização.', 'warning');
      }
      return;
    }
    const shipmentToUpdate = shipments.find(s => s.id === shipmentId);
    if (!shipmentToUpdate) return;

    const changes: string[] = [];
    const fieldsToTrack: (keyof Shipment)[] = [
      'driverName', 'driverCpf', 'driverContact', 
      'horsePlate', 'trailer1Plate', 'trailer2Plate', 'trailer3Plate', 
      'vehicleTag', 'vehicleSetType', 'vehicleBodyType',
      'shipmentTonnage', 'unloadedTonnage', 'driverFreightValue', 'driverFreightRateSnapshot',
      'driverFreightType', 'anttModality', 'anttOwnerIdentifier', 'etcTaxRegime',
      'bankDetails', 'driverReferences', 'ownerContact',
      'cteNumber', 'cteEmissionDate', 'ciotNumber', 'ciot', 'nfeNumber', 'nfeValue', 'codigoAtua', 'mdfeNumber', 
      'federalTax', 'isFederalTaxManual', 'generatedCredit', 'isGeneratedCreditManual',
      'riskQueryType', 'riskQueryCost', 'riskReleaseCode',
      'advancePercentage', 'advanceValue', 'tollValue',
      'balanceToReceiveValue', 'discountValue', 'netBalanceValue', 'isBreakageWaived',
      'driverExtraPaymentsTotal',
      'route', 'paymentMethod', 'pixKey', 'cancellationReason', 'statusPendingObservation'
    ];

    fieldsToTrack.forEach(field => {
      if (data[field] !== undefined && data[field] !== shipmentToUpdate[field]) {
        const rawOld = shipmentToUpdate[field];
        const rawNew = data[field];
        let oldVal = rawOld !== undefined && rawOld !== null && rawOld !== '' ? String(rawOld) : 'Não informado';
        let newVal = rawNew !== undefined && rawNew !== null && rawNew !== '' ? String(rawNew) : 'Não informado';

        if (['driverFreightValue', 'driverExtraPaymentsTotal', 'advanceValue', 'tollValue', 'balanceToReceiveValue', 'discountValue', 'netBalanceValue', 'federalTax', 'generatedCredit', 'riskQueryCost', 'nfeValue'].includes(field)) {
          oldVal = rawOld !== undefined && rawOld !== null ? `R$ ${Number(rawOld).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : 'R$ 0,00';
          newVal = rawNew !== undefined && rawNew !== null ? `R$ ${Number(rawNew).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : 'R$ 0,00';
        } else if (['shipmentTonnage', 'unloadedTonnage'].includes(field)) {
          oldVal = rawOld !== undefined && rawOld !== null ? `${rawOld} ton` : '0 ton';
          newVal = rawNew !== undefined && rawNew !== null ? `${rawNew} ton` : '0 ton';
        } else if (field === 'advancePercentage') {
          oldVal = rawOld !== undefined && rawOld !== null ? `${rawOld}%` : '0%';
          newVal = rawNew !== undefined && rawNew !== null ? `${rawNew}%` : '0%';
        } else if (['isFederalTaxManual', 'isGeneratedCreditManual', 'isBreakageWaived'].includes(field)) {
          oldVal = rawOld ? 'Sim' : 'Não';
          newVal = rawNew ? 'Sim' : 'Não';
        }

        if (field === 'statusPendingObservation') {
          if (!rawNew || rawNew === 'Não informado') {
            changes.push(`Pendência do status "${shipmentToUpdate.status}" removida (era: "${oldVal}").`);
          } else if (!rawOld || rawOld === 'Não informado') {
            changes.push(`Pendência do status "${shipmentToUpdate.status}" informada: "${newVal}".`);
          } else {
            changes.push(`Pendência do status "${shipmentToUpdate.status}" alterada de "${oldVal}" para "${newVal}".`);
          }
        } else {
          changes.push(`${FIELD_TRANSLATIONS[field] || field} alterado de "${oldVal}" para "${newVal}".`);
        }
      }
    });

    if (changes.length === 0 && Object.keys(data).length === 0) return;

    let updatedDriverFreight = data.driverFreightValue !== undefined ? data.driverFreightValue : shipmentToUpdate.driverFreightValue;
    let updatedCargo: Cargo | undefined;
    let calculatedFinCostFromTonnage: number | undefined;

    const rateToUse = data.driverFreightRateSnapshot !== undefined 
      ? data.driverFreightRateSnapshot 
      : (shipmentToUpdate.driverFreightRateSnapshot || cargos.find(c => c.id === shipmentToUpdate.cargoId)?.driverFreightValuePerTon || 0);

    const targetTonnage = data.shipmentTonnage !== undefined ? data.shipmentTonnage : shipmentToUpdate.shipmentTonnage;

    if (data.shipmentTonnage !== undefined && data.shipmentTonnage !== shipmentToUpdate.shipmentTonnage) {
        const cargo = cargos.find(c => c.id === shipmentToUpdate.cargoId || (c.sequenceId && `CRG-${c.sequenceId}` === shipmentToUpdate.cargoId));
        if (cargo && data.shipmentTonnage > shipmentToUpdate.shipmentTonnage) {
            const currentBal = calculateCargoBalance(cargo, shipments);
            const deltaTon = data.shipmentTonnage - shipmentToUpdate.shipmentTonnage;
            if (deltaTon > currentBal.availableVolume + 0.001) {
                showToast(`SALDO TOTAL INSUFICIENTE: Não é possível aumentar a tonelagem em ${deltaTon.toLocaleString('pt-BR')} ton. O lote possui apenas ${currentBal.availableVolume.toLocaleString('pt-BR')} ton disponíveis no saldo total.`, 'error');
                return;
            }
        }

        updatedDriverFreight = rateToUse * targetTonnage;
        
        if (cargo) {
            const updatedShipments = shipments.map(s => s.id === shipmentId ? { ...s, shipmentTonnage: targetTonnage } : s);
            const reconciled = reconcileCargoWithShipments(cargo, updatedShipments);
            updatedCargo = {
                ...reconciled,
                history: [...cargo.history, createHistoryLog(`Volume ajustado devido à correção de tonelagem no embarque ${shipmentId} (${shipmentToUpdate.shipmentTonnage} -> ${data.shipmentTonnage}).`)]
            };
        }

        // Recalcular Custo Financeiro proporcional se a tonelagem do embarque foi alterada
        const relatedCargoForFin = cargos.find(c => c.id === shipmentToUpdate.cargoId || (c.sequenceId && `CRG-${c.sequenceId}` === shipmentToUpdate.cargoId));
        if (relatedCargoForFin?.financialCostEnabled && targetTonnage > 0 && data.financialCostValue === undefined) {
          const effectiveRate = shipmentToUpdate.financialCostRate ?? relatedCargoForFin.financialCostEffectiveRate ?? (
            relatedCargoForFin.financialCostMonthlyRate && relatedCargoForFin.financialCostDaysTerm
              ? Number(((relatedCargoForFin.financialCostMonthlyRate * relatedCargoForFin.financialCostDaysTerm) / (relatedCargoForFin.financialCostBaseDays || 30)).toFixed(4))
              : undefined
          );
          const compRate = shipmentToUpdate.companyFreightRateSnapshot || relatedCargoForFin.companyFreightValuePerTon || 0;
          if (effectiveRate !== undefined && effectiveRate > 0 && compRate > 0) {
            calculatedFinCostFromTonnage = Number(((compRate * targetTonnage) * (effectiveRate / 100)).toFixed(2));
          } else if (relatedCargoForFin.financialCostPerTon) {
            calculatedFinCostFromTonnage = Number((relatedCargoForFin.financialCostPerTon * targetTonnage).toFixed(2));
          }
        }
    } else if (data.driverFreightRateSnapshot !== undefined && data.driverFreightRateSnapshot !== shipmentToUpdate.driverFreightRateSnapshot) {
        updatedDriverFreight = rateToUse * targetTonnage;
    } else if (data.driverFreightValue === undefined && rateToUse > 0 && targetTonnage > 0) {
        // Blindagem contra divergência/corrupção de frete motorista bruto em cargas por tonelada
        const contractualCalc = Number((rateToUse * targetTonnage).toFixed(2));
        if (updatedDriverFreight && Math.abs(updatedDriverFreight - contractualCalc) > 5.00) {
            updatedDriverFreight = contractualCalc;
        }
    }

    const updatedDocs = {
      ...(shipmentToUpdate.documents || {}),
      ...(calculatedFinCostFromTonnage !== undefined ? { financial_cost_value: calculatedFinCostFromTonnage } : {}),
      ...(data.documents || {}),
      ...(data.cteNumber !== undefined ? { cte_number: data.cteNumber } : {}),
      ...(data.cteEmissionDate !== undefined ? { cte_emission_date: data.cteEmissionDate } : {}),
      ...(data.nfeNumber !== undefined ? { nfe_number: data.nfeNumber } : {}),
      ...(data.nfeValue !== undefined ? { nfe_value: data.nfeValue, valor_mercadoria: data.nfeValue } : {}),
      ...(data.mdfeNumber !== undefined ? { mdfe_number: data.mdfeNumber } : {}),
      ...(data.riskQueryType !== undefined ? { risk_query_type: data.riskQueryType } : {}),
      ...(data.riskQueryCost !== undefined ? { risk_query_cost: data.riskQueryCost } : {}),
      ...(data.riskReleaseCode !== undefined ? { risk_release_code: data.riskReleaseCode } : {}),
      ...(data.isFederalTaxManual !== undefined ? { is_federal_tax_manual: data.isFederalTaxManual } : {}),
      ...(data.federalTax !== undefined ? { federal_tax: data.federalTax, imposto_federal: data.federalTax } : {}),
      ...(data.driverExtraPayments !== undefined ? { driver_extra_payments: data.driverExtraPayments } : {}),
      ...(data.driverExtraPaymentsTotal !== undefined ? { driver_extra_payments_total: data.driverExtraPaymentsTotal } : {}),
      ...(data.realProfitData !== undefined ? { real_profit_data: data.realProfitData } : {}),
    };

    if (data.isFederalTaxManual === false) {
      updatedDocs.is_federal_tax_manual = false;
      delete (updatedDocs as any).federal_tax;
      delete (updatedDocs as any).imposto_federal;
    }

    let calculatedAdvanceVal = data.advanceValue !== undefined ? data.advanceValue : shipmentToUpdate.advanceValue;
    let calculatedBalanceVal = data.balanceToReceiveValue !== undefined ? data.balanceToReceiveValue : shipmentToUpdate.balanceToReceiveValue;
    let calculatedAdvancePct = data.advancePercentage !== undefined ? data.advancePercentage : (shipmentToUpdate.advancePercentage !== undefined ? shipmentToUpdate.advancePercentage : 70);

    if (ADVANCE_ELIGIBLE_STATUSES.includes(shipmentToUpdate.status)) {
      const toll = data.tollValue !== undefined ? data.tollValue : (shipmentToUpdate.tollValue || 0);
      const isPfCalc = (shipmentToUpdate.driverFreightType === 'PF' || shipmentToUpdate.anttModality === 'TAC');
      const calc = calculateAdvanceAndBalance({
        driverFreightValue: updatedDriverFreight,
        driverFreightRate: rateToUse,
        tonnage: targetTonnage,
        tollValue: toll,
        advancePercentage: calculatedAdvancePct,
        driverFreightType: isPfCalc ? 'PF' : 'PJ',
      });
      calculatedAdvanceVal = calc.advanceInAccountValue;
      calculatedBalanceVal = calc.balanceToReceiveValue;
      calculatedAdvancePct = calc.advancePercentage;
    }

    if (data.statusPendingObservation !== undefined) {
      if (data.statusPendingObservation.trim()) {
        (updatedDocs as any).status_pending_observation = data.statusPendingObservation.trim();
      } else {
        delete (updatedDocs as any).status_pending_observation;
        delete (updatedDocs as any).statusPendingObservation;
      }
    }

    const updatedShipment: Shipment = {
      ...shipmentToUpdate,
      ...data,
      statusPendingObservation: data.statusPendingObservation !== undefined ? (data.statusPendingObservation.trim() || undefined) : shipmentToUpdate.statusPendingObservation, 
      advancePercentage: calculatedAdvancePct,
      advanceValue: calculatedAdvanceVal,
      balanceToReceiveValue: calculatedBalanceVal,
      financialCostValue: calculatedFinCostFromTonnage !== undefined ? calculatedFinCostFromTonnage : (data.financialCostValue !== undefined ? data.financialCostValue : shipmentToUpdate.financialCostValue),
      documents: updatedDocs,
      driverFreightRateSnapshot: rateToUse,
      driverFreightValue: updatedDriverFreight,
      history: data.history 
        ? data.history 
        : (changes.length > 0 
          ? [...shipmentToUpdate.history, createHistoryLog(`Dados do embarque corrigidos: ${changes.join(' ')}`)]
          : shipmentToUpdate.history)
    };

    setShipments((prev: Shipment[]) => prev.map(s => s.id === shipmentId ? updatedShipment : s));
    if (updatedCargo) {
        setCargos(prev => prev.map(c => c.id === updatedShipment.cargoId ? updatedCargo! : c));
    }

    try {
      await upsertShipment(updatedShipment);
      if (updatedCargo) await upsertCargo(updatedCargo);
      if (!options?.silent) {
        if (data.statusPendingObservation !== undefined && Object.keys(data).length === 1) {
          showToast('Pendência do status atual atualizada com sucesso!', 'success');
        } else {
          showToast('Dados do embarque atualizados com sucesso!', 'success');
        }
      }
    } catch (err) {
      console.error('Erro ao atualizar dados do embarque:', err);
      if (!options?.silent) {
        showToast('Erro ao salvar alterações no banco de dados.', 'error');
      }
    }
  };

  const handleBatchUpdateShipments = async (updatedList: Shipment[]) => {
    if (!currentUser) return;
    if (isDemoUser(currentUser)) {
      showToast('Usuário em modo demonstração possui acesso apenas de visualização.', 'warning');
      return;
    }
    if (!updatedList || updatedList.length === 0) return;
    
    // Atualiza estado local imediatamente
    setShipments((prev: Shipment[]) => {
      const map = new Map(updatedList.map(u => [u.id, u]));
      return prev.map(s => map.get(s.id) || s);
    });

    try {
      await upsertManyShipments(updatedList);
      showToast(`${updatedList.length} embarque(s) sincronizados com sucesso no banco de dados!`, 'success');
    } catch (err: any) {
      console.error('Erro ao salvar atualização em lote de embarques:', err);
      showToast(`Erro ao salvar no banco: ${err?.message || 'Erro desconhecido'}`, 'error');
    }
  };

  const handleUpdateShipmentPrice = async (shipmentId: string, data: { newTotal: number, newRate?: number, newCompanyRate?: number }) => {
    if (!currentUser) return;
    if (isDemoUser(currentUser)) {
      showToast('Usuário em modo demonstração possui acesso apenas de visualização.', 'warning');
      return;
    }
    const isAdmin = currentUser.profile === UserProfile.Desenvolvedor ||
      isDeveloperUser(currentUser) ||
      currentUser.profile === UserProfile.Admin ||
      currentUser.profile === UserProfile.GerenciadoraDeRisco ||
      (currentUser.profile as string) === 'Administrador do Sistema' ||
      (currentUser.profile as string) === 'Gerenciadora de Risco' ||
      Boolean(currentUser.name && (currentUser.name.toLowerCase().includes('samanta') || currentUser.name.toLowerCase().includes('samantha'))) ||
      Boolean(currentUser.email && (currentUser.email.toLowerCase().includes('samanta') || currentUser.email.toLowerCase().includes('samantha')));

    const isOperationalEditor = [
      UserProfile.Embarcador,
      UserProfile.Agenciador,
      UserProfile.Comercial
    ].includes(currentUser.profile);

    if (!isAdmin && !isOperationalEditor) {
      showToast('Apenas Administradores do Sistema, Gerenciadora de Risco, Embarcadores, Agenciadores e Comercial têm permissão para alterar o preço do frete.', 'error');
      return;
    }
    const shipmentToUpdate = shipments.find(s => s.id === shipmentId);
    if (!shipmentToUpdate) return;

    const ton = shipmentToUpdate.shipmentTonnage || 0;
    const resolvedRate = data.newRate !== undefined ? data.newRate : shipmentToUpdate.driverFreightRateSnapshot;

    // Validação de teto para perfis operacionais: no máximo até R$ 5,00 a mais do valor colocado na carga
    if (!isAdmin && isOperationalEditor) {
      const cargo = cargos.find(c => c.id === shipmentToUpdate.cargoId || (c.sequenceId && `CRG-${c.sequenceId}` === shipmentToUpdate.cargoId));
      const cargoBaseRate = (cargo?.driverFreightValuePerTon !== undefined && cargo.driverFreightValuePerTon > 0)
        ? cargo.driverFreightValuePerTon
        : (shipmentToUpdate.driverFreightRateSnapshot || (ton > 0 ? shipmentToUpdate.driverFreightValue / ton : 0));
      const maxAllowedRate = Number((cargoBaseRate + 5.00).toFixed(2));

      if (resolvedRate !== undefined && resolvedRate > maxAllowedRate + 0.001) {
        showToast(`Permissão operacional excedida: ${currentUser.profile} pode aumentar no máximo até R$ 5,00 a mais do valor da carga (Teto permitido: R$ ${maxAllowedRate.toFixed(2)}/ton).`, 'error');
        return;
      }

      if (ton > 0 && data.newTotal > (maxAllowedRate * ton) + 0.01) {
        showToast(`Permissão operacional excedida: o total informado excede o limite máximo de R$ 5,00 a mais por tonelada da carga.`, 'error');
        return;
      }
    }

    const finalTotal = (resolvedRate !== undefined && resolvedRate > 0 && ton > 0)
      ? Number((resolvedRate * ton).toFixed(2))
      : data.newTotal;

    const oldPriceFormatted = shipmentToUpdate.driverFreightValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const newPriceFormatted = finalTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const historyMsgParts = [`${FIELD_TRANSLATIONS['driverFreightValue']} alterado de "${oldPriceFormatted}" para "${newPriceFormatted}".`];

    const updateObj: Partial<Shipment> = { driverFreightValue: finalTotal };
    
    if (data.newRate !== undefined) {
      const oldRateFormatted = (shipmentToUpdate.driverFreightRateSnapshot || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
      const newRateFormatted = data.newRate.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
      updateObj.driverFreightRateSnapshot = data.newRate;
      historyMsgParts.push(`Taxa do motorista alterada de "${oldRateFormatted}" para "${newRateFormatted}".`);
    }

    if (isAdmin && data.newCompanyRate !== undefined) {
      const oldCompanyRateFormatted = (shipmentToUpdate.companyFreightRateSnapshot || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
      const newCompanyRateFormatted = data.newCompanyRate.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
      updateObj.companyFreightRateSnapshot = data.newCompanyRate;
      historyMsgParts.push(`Frete Empresa alterado de "${oldCompanyRateFormatted}" para "${newCompanyRateFormatted}".`);
    }

    if (ADVANCE_ELIGIBLE_STATUSES.includes(shipmentToUpdate.status)) {
      const isPfCalc = (shipmentToUpdate.driverFreightType === 'PF' || shipmentToUpdate.anttModality === 'TAC');
      const calc = calculateAdvanceAndBalance({
        driverFreightValue: finalTotal,
        driverFreightRate: resolvedRate,
        tonnage: ton,
        tollValue: shipmentToUpdate.tollValue || 0,
        advancePercentage: shipmentToUpdate.advancePercentage !== undefined ? shipmentToUpdate.advancePercentage : 70,
        driverFreightType: isPfCalc ? 'PF' : 'PJ',
      });
      updateObj.advancePercentage = calc.advancePercentage;
      updateObj.advanceValue = calc.advanceInAccountValue;
      updateObj.balanceToReceiveValue = calc.balanceToReceiveValue;
    }

    const updatedShipment: Shipment = { 
      ...shipmentToUpdate, 
      ...updateObj, 
      history: [...shipmentToUpdate.history, createHistoryLog(historyMsgParts.join(' '))] 
    };

    setShipments((prev: Shipment[]) => prev.map(s => s.id === shipmentId ? updatedShipment : s));
    try {
      await upsertShipment(updatedShipment);
    } catch (err) {
      console.error('Erro ao atualizar preço:', err);
    }
  };

  const handleUpdateScheduledDateTime = async (shipmentId: string, data: { scheduledDate: string, scheduledTime?: string }) => {
    if (!currentUser) return;
    if (isDemoUser(currentUser)) {
      showToast('Usuário em modo demonstração possui acesso apenas de visualização.', 'warning');
      return;
    }
    const shipmentToUpdate = shipments.find(s => s.id === shipmentId);
    if (!shipmentToUpdate) return;

    const changes: string[] = [];
    if (shipmentToUpdate.scheduledDate !== data.scheduledDate) {
      changes.push(`Data Programada alterada de "${shipmentToUpdate.scheduledDate}" para "${data.scheduledDate}".`);
    }
    if (data.scheduledTime !== undefined && shipmentToUpdate.scheduledTime !== data.scheduledTime) {
      changes.push(`Horário Previsto alterado de "${shipmentToUpdate.scheduledTime || 'N/A'}" para "${data.scheduledTime}".`);
    }

    if (changes.length === 0) return;

    const updatedShipment: Shipment = { 
      ...shipmentToUpdate, 
      scheduledDate: data.scheduledDate,
      scheduledTime: data.scheduledTime,
      history: [...shipmentToUpdate.history, createHistoryLog(changes.join(' '))] 
    };

    setShipments((prev: Shipment[]) => prev.map(s => s.id === shipmentId ? updatedShipment : s));
    try {
      await upsertShipment(updatedShipment);
    } catch (err) {
      console.error('Erro ao atualizar agendamento:', err);
    }
  };

  
  const handleConfirmCancelShipment = async (shipmentId: string, reason: string) => {
    if (isDemoUser(currentUser)) {
      showToast('Usuário em modo demonstração possui acesso apenas de visualização.', 'warning');
      return;
    }
    const shipmentToCancel = shipments.find(s => s.id === shipmentId);
    if (!shipmentToCancel || !currentUser) return;
    
    const oldStatus = shipmentToCancel.status;
    const pendArchived = shipmentToCancel.statusPendingObservation ? ` (Pendência arquivada do status anterior: "${shipmentToCancel.statusPendingObservation}")` : '';
    const historyEntry = `Status alterado de "${oldStatus}" para "${ShipmentStatus.Cancelado}". Motivo: ${reason}${pendArchived}`;
    
    const cancelledShipment: Shipment = { 
      ...shipmentToCancel, 
      status: ShipmentStatus.Cancelado,
      statusPendingObservation: undefined,
      cancellationReason: reason,
      history: [...shipmentToCancel.history, createHistoryLog(historyEntry)], 
      statusHistory: [...(shipmentToCancel.statusHistory || []), { status: ShipmentStatus.Cancelado, timestamp: new Date().toISOString(), userId: currentUser.id }] 
    };

    const updatedShipments = shipments.map(s => s.id === shipmentId ? cancelledShipment : s);
    setShipments(updatedShipments);

    const relatedCargo = cargos.find(c => c.id === shipmentToCancel.cargoId || (c.sequenceId && `CRG-${c.sequenceId}` === shipmentToCancel.cargoId));
    
    let updatedCargo: Cargo | undefined;
    if (relatedCargo) {
        const reconciled = reconcileCargoWithShipments(relatedCargo, updatedShipments);
        const historyDescription = `Volumes ajustados devido ao cancelamento do embarque ${shipmentId}`;
        
        updatedCargo = { 
            ...reconciled, 
            history: [...relatedCargo.history, createHistoryLog(historyDescription)] 
        };
        
        setCargos(prevCargos => prevCargos.map(cargo => cargo.id === relatedCargo.id ? updatedCargo! : cargo));
    }

    try {
      await upsertShipment(cancelledShipment);
      if (updatedCargo) await upsertCargo(updatedCargo);
    } catch (err) {
      console.error('Erro ao cancelar embarque:', err);
    }
  };

  const handleTransferShipment = async (shipmentId: string, newEmbarcadorId: string) => {
    if (!currentUser) return;
    if (isDemoUser(currentUser)) {
      showToast('Usuário em modo demonstração possui acesso apenas de visualização.', 'warning');
      return;
    }

    const newEmbarcador = users.find(u => u.id === newEmbarcadorId);
    const newEmbarcadorName = newEmbarcador?.name || 'N/A';

    // Identificação de regras de comissão / agência do novo responsável
    const isNewAgenciador = newEmbarcador?.profile === UserProfile.Agenciador;
    const newActiveAgenciador = isNewAgenciador ? newEmbarcador : null;
    const newAgencyLeader = (newActiveAgenciador && newActiveAgenciador.agencyRole === 'embarque' && newActiveAgenciador.agencyLeaderId)
      ? users.find(u => u.id === newActiveAgenciador.agencyLeaderId)
      : newActiveAgenciador;

    const newAgencyRateConfigured = newAgencyLeader?.agencyCommissionPercentage ?? 30;
    const newAgencyNameAuto = newAgencyLeader
      ? (newAgencyLeader.branchId ? `Agência ${newAgencyLeader.branchId} (${newAgencyLeader.name})` : newAgencyLeader.name)
      : (newEmbarcador?.branchId ? `Agência ${newEmbarcador.branchId} (${newEmbarcador.name})` : newEmbarcador?.name);

    const newShipperRateConfigured = newEmbarcador?.shipperCommissionRatePerTon;
    const isNewShipperComm = Boolean(newShipperRateConfigured && newShipperRateConfigured > 0);

    let updated: Shipment | undefined;
    setShipments((prev: Shipment[]) => prev.map(s => {
        if (s.id === shipmentId) {
            const oldEmbarcadorName = users.find(u => u.id === s.embarcadorId || u.id === s.createdById)?.name || 'N/A';
            
            const docsUpdated = { ...(s.documents || {}) };
            if (isNewAgenciador) {
              docsUpdated.agency_commission_enabled = true;
              docsUpdated.agency_commission_percentage = newAgencyRateConfigured;
              docsUpdated.agency_commission_agency_name = newAgencyNameAuto;
            }
            if (isNewShipperComm) {
              docsUpdated.shipper_commission_enabled = true;
              docsUpdated.shipper_commission_rate_per_ton = newShipperRateConfigured;
            }

            updated = { 
              ...s, 
              embarcadorId: newEmbarcadorId,
              createdById: newEmbarcadorId, // Atualiza também o solicitante do embarque
              branchId: newEmbarcador?.branchId || s.branchId,
              agencyCommissionEnabled: isNewAgenciador ? true : s.agencyCommissionEnabled,
              agencyCommissionPercentage: isNewAgenciador ? newAgencyRateConfigured : s.agencyCommissionPercentage,
              agencyCommissionAgencyName: isNewAgenciador ? newAgencyNameAuto : s.agencyCommissionAgencyName,
              shipperCommissionEnabled: isNewShipperComm ? true : s.shipperCommissionEnabled,
              shipperCommissionRatePerTon: isNewShipperComm ? newShipperRateConfigured : s.shipperCommissionRatePerTon,
              documents: Object.keys(docsUpdated).length > 0 ? docsUpdated : s.documents,
              history: [
                ...s.history, 
                createHistoryLog(`Embarque transferido: Solicitante e embarcador responsável alterados de "${oldEmbarcadorName}" para "${newEmbarcadorName}".`)
              ] 
            };
            return updated;
        }
        return s;
    }));
    if (updated) {
      try { 
        await upsertShipment(updated); 
        showToast(`Embarque transferido com sucesso para ${newEmbarcadorName}.`, 'success');
      } catch(err) { 
        console.error('Erro ao transferir embarque:', err); 
        showToast('Erro ao transferir embarque no banco de dados.', 'error');
      }
    }
  };

  const handleSwapCargo = async (shipmentId: string, newCargoId: string) => {
    if (!currentUser) return;
    if (isDemoUser(currentUser)) {
      showToast('Usuário em modo demonstração possui acesso apenas de visualização.', 'warning');
      return;
    }

    const shipment = shipments.find(s => s.id === shipmentId);
    if (!shipment) return;

    const oldCargoId = shipment.cargoId;
    if (oldCargoId === newCargoId) return;

    const oldCargo = cargos.find(c => c.id === oldCargoId);
    const newCargo = cargos.find(c => c.id === newCargoId);

    if (!newCargo) {
      showToast('Nova carga não encontrada.', 'error');
      return;
    }

    const tonnage = Number(shipment.shipmentTonnage) || 0;
    const isLoaded = [
      ShipmentStatus.AguardandoNota,
      ShipmentStatus.AguardandoFiscal,
      ShipmentStatus.AguardandoAdiantamento,
      ShipmentStatus.AguardandoAgendamento,
      ShipmentStatus.AguardandoDescarga,
      ShipmentStatus.ValidacaoTicket,
      ShipmentStatus.AguardandoPagamentoSaldo,
      ShipmentStatus.Finalizado
    ].includes(shipment.status);
    const loadedTon = Number(shipment.loadedTonnage) || tonnage;

    // 1. Prepare updated Shipment
    const newDriverRate = newCargo.driverFreightValuePerTon;
    const newCompanyRate = newCargo.companyFreightValuePerTon;
    const newTotalDriverFreight = newDriverRate * tonnage;

    const updatedShipment: Shipment = {
      ...shipment,
      cargoId: newCargoId,
      branchId: newCargo.branchId || shipment.branchId,
      driverFreightRateSnapshot: newDriverRate,
      companyFreightRateSnapshot: newCompanyRate,
      driverFreightValue: newTotalDriverFreight,
      history: [
        ...shipment.history,
        createHistoryLog(`Carga trocada de #${oldCargo?.sequenceId || oldCargoId} para #${newCargo.sequenceId}. Taxas e valores de frete atualizados para o fluxo da nova carga.`)
      ]
    };

    const updatedShipments = shipments.map(s => s.id === shipmentId ? updatedShipment : s);

    // 2. Prepare updated Old Cargo (if exists)
    let updatedOldCargo: Cargo | undefined;
    if (oldCargo) {
      const reconciledOld = reconcileCargoWithShipments(oldCargo, updatedShipments);
      updatedOldCargo = {
        ...reconciledOld,
        history: [
          ...oldCargo.history,
          createHistoryLog(`Volume reduzido devido à troca de carga do embarque ${shipmentId} para a carga #${newCargo.sequenceId}.`)
        ]
      };
    }

    // 3. Prepare updated New Cargo
    const reconciledNew = reconcileCargoWithShipments(newCargo, updatedShipments);
    const updatedNewCargo: Cargo = {
      ...reconciledNew,
      history: [
        ...newCargo.history,
        createHistoryLog(`Volume aumentado devido à troca de carga do embarque ${shipmentId} da carga #${oldCargo?.sequenceId || oldCargoId}.`)
      ]
    };

    // Optimistic UI updates
    setShipments(prev => prev.map(s => s.id === shipmentId ? updatedShipment : s));
    setCargos(prev => prev.map(c => {
      if (c.id === oldCargoId && updatedOldCargo) return updatedOldCargo;
      if (c.id === newCargoId) return updatedNewCargo;
      return c;
    }));

    // Persistence
    try {
      const promises = [
        upsertShipment(updatedShipment),
        upsertCargo(updatedNewCargo)
      ];
      if (updatedOldCargo) promises.push(upsertCargo(updatedOldCargo));
      
      await Promise.all(promises);
      showToast(`Embarque ${shipmentId} transferido para a carga #${newCargo.sequenceId} com sucesso!`, 'success');
    } catch (err) {
      console.error('Erro ao trocar carga:', err);
      showToast('Erro ao persistir a troca de carga no banco de dados.', 'error');
    }
  };

  const handleSaveClient = async (clientData: Client | Omit<Client, 'id'>) => {
    if (isDemoUser(currentUser)) {
      showToast('Usuário em modo demonstração possui acesso apenas de visualização.', 'warning');
      return;
    }
    let saved: Client;
    if ('id' in clientData) {
      saved = clientData;
      setClients(prev => prev.map(c => c.id === clientData.id ? clientData : c));
    } else { 
      const newId = formatId(nextIds.client, 'CLI');
      saved = { ...clientData, id: newId };
      setClients(prev => [saved, ...prev]);
      setNextIds((prev: any) => ({ ...prev, client: prev.client + 1 }));
    }
    try { 
      await upsertClient(saved); 
      showToast('Cliente salvo com sucesso!', 'success');
    } catch(err: any) { 
      console.error('Erro ao salvar cliente:', err); 
      showToast(`Erro ao salvar cliente: ${err.message || 'Erro desconhecido'}`, 'error');
    }
  };

  const handleDeleteClient = async (clientId: string) => {
    if (isDemoUser(currentUser)) {
      showToast('Usuário em modo demonstração possui acesso apenas de visualização.', 'warning');
      return;
    }
    if (currentUser?.profile === UserProfile.GerenciadoraDeRisco) {
      showToast('Perfil Gerenciadora de Risco não possui permissão para excluir clientes.', 'warning');
      return;
    }
    try {
      await deleteClient(clientId);
      setClients(prev => prev.filter(c => c.id !== clientId));
      showToast('Cliente excluído com sucesso.', 'success');
    } catch (err: any) {
      console.error('Erro ao excluir cliente:', err);
      showToast(`Erro ao excluir cliente: ${err.message || 'Erro desconhecido'}`, 'error');
    }
  };

  const handleMergeClients = async (targetClientId: string, sourceClientIds: string[]) => {
    if (isDemoUser(currentUser)) {
      showToast('Usuário em modo demonstração possui acesso apenas de visualização.', 'warning');
      return;
    }
    try {
      await mergeClients(targetClientId, sourceClientIds, clients, cargos, freightOffers, users);
      const [refreshedClients, refreshedCargos, refreshedOffers] = await Promise.all([
        fetchClients(),
        fetchCargos(),
        fetchFreightOffers()
      ]);
      setClients(refreshedClients);
      setCargos(refreshedCargos);
      setFreightOffers(refreshedOffers);
      showToast('Cadastros de clientes unificados com sucesso!', 'success');
    } catch (err: any) {
      console.error('Erro ao unir clientes:', err);
      showToast(`Erro ao unir clientes: ${err.message || 'Falha na unificação'}`, 'error');
      throw err;
    }
  };
  
  const handleDeleteCargo = async (cargoId: string) => {
    if (isDemoUser(currentUser)) {
      showToast('Usuário em modo demonstração possui acesso apenas de visualização.', 'warning');
      return;
    }
    if (!window.confirm("Tem certeza que deseja excluir permanentemente esta informação?")) return;
    if (!currentUser || (currentUser.profile !== UserProfile.Admin && !isDeveloperUser(currentUser))) return;
    
    const relatedShipments = shipments.filter(s => s.cargoId === cargoId);
    const confirmMsg = relatedShipments.length > 0
      ? `A carga ${cargoId} possui ${relatedShipments.length} embarque(s) associado(s). Se você excluir a carga, os embarques NÃO serão excluídos, mas poderão ficar sem os detalhes da carga original na visualização. Deseja excluir a carga e manter os embarques?`
      : `Tem certeza que deseja excluir permanentemente a carga ${cargoId}?`;

    if (confirm(confirmMsg)) {
        try {
            await deleteCargo(cargoId);
            setCargos(prev => prev.filter(c => c.id !== cargoId));
            showToast("Carga excluída com sucesso. Os embarques vinculados foram preservados.", 'success');
        } catch (error) {
            console.error('Erro ao excluir carga:', error);
            showToast("Erro ao excluir carga. Verifique o console.", 'error');
        }
    }
  };


  const handleDeleteShipment = async (shipmentId: string) => {
    if (isDemoUser(currentUser)) {
      showToast('Usuário em modo demonstração possui acesso apenas de visualização.', 'warning');
      return;
    }
    if (!window.confirm("Tem certeza que deseja excluir permanentemente esta informação?")) return;
    if (!currentUser || (currentUser.profile !== UserProfile.Admin && !isDeveloperUser(currentUser))) return;
    
    const shipmentToDelete = shipments.find(s => s.id === shipmentId);
    if (!shipmentToDelete) return;

    if (confirm(`Tem certeza que deseja excluir permanentemente o embarque ${shipmentId}?`)) {
        try {
            await deleteShipment(shipmentId);
            const remainingShipments = shipments.filter(s => s.id !== shipmentId);
            setShipments(remainingShipments);

            // Atualizar volumes da carga
            const relatedCargo = cargos.find(c => c.id === shipmentToDelete.cargoId || (c.sequenceId && `CRG-${c.sequenceId}` === shipmentToDelete.cargoId));
            
            if (relatedCargo) {
                const reconciled = reconcileCargoWithShipments(relatedCargo, remainingShipments);
                const updatedCargo: Cargo = { 
                    ...reconciled, 
                    history: [...relatedCargo.history, createHistoryLog(`Embarque ${shipmentId} EXCLUÍDO pelo Administrador. Volumes recalculados.`)]
                };
                
                setCargos(prevCargos => prevCargos.map(cargo => cargo.id === relatedCargo.id ? updatedCargo : cargo));
                await upsertCargo(updatedCargo);
            }
            showToast("Embarque excluído com sucesso e volumes da carga recalculados.", 'success');
        } catch (error) {
            console.error('Erro ao excluir embarque:', error);
            showToast("Erro ao excluir embarque. Verifique o console.", 'error');
        }
    }
  };

  const handleSaveOwner = async (ownerData: Owner | Omit<Owner, 'id'>) => {
    if (isDemoUser(currentUser)) {
      showToast('Usuário em modo demonstração possui acesso apenas de visualização.', 'warning');
      return;
    }
    let saved: Owner;
    if ('id' in ownerData) {
      saved = ownerData;
      setOwners(prev => prev.map(o => o.id === ownerData.id ? ownerData : o));
    } else {
      const newId = formatId(nextIds.owner, 'OWN');
      saved = { ...ownerData, id: newId };
      setOwners(prev => [saved, ...prev]);
      setNextIds((prev: any) => ({ ...prev, owner: prev.owner + 1 }));
    }
    try { await upsertOwner(saved); } catch(err) { console.error('Erro ao salvar proprietário:', err); }
  };

  const handleSaveDriver = async (driverData: Driver | Omit<Driver, 'id'>) => {
    if (isDemoUser(currentUser)) {
      showToast('Usuário em modo demonstração possui acesso apenas de visualização.', 'warning');
      return;
    }
    let saved: Driver;
    if ('id' in driverData) {
      saved = driverData;
      setDrivers(prev => prev.map(d => d.id === driverData.id ? driverData : d));
    } else {
      const newId = formatId(nextIds.driver, 'DRV');
      saved = { ...driverData, id: newId };
      setDrivers(prev => [saved, ...prev]);
      setNextIds((prev: any) => ({ ...prev, driver: prev.driver + 1 }));
    }
    try { 
      await upsertDriver(saved); 
      showToast('Motorista salvo com sucesso!', 'success');
    } catch(err: any) { 
      console.error('Erro ao salvar motorista:', err); 
      showToast(`Erro ao salvar motorista: ${err.message || 'Erro desconhecido'}`, 'error');
    }
  };

  const handleSaveVehicle = async (vehicleData: Vehicle | Omit<Vehicle, 'id'>) => {
    if (isDemoUser(currentUser)) {
      showToast('Usuário em modo demonstração possui acesso apenas de visualização.', 'warning');
      return;
    }
    let saved: Vehicle;
    if ('id' in vehicleData) {
      saved = vehicleData;
      setVehicles(prev => prev.map(v => v.id === vehicleData.id ? vehicleData : v));
    } else {
      const newId = formatId(nextIds.vehicle, 'VEH');
      saved = { ...vehicleData, id: newId };
      setVehicles(prev => [saved, ...prev]);
      setNextIds((prev: any) => ({ ...prev, vehicle: prev.vehicle + 1 }));
    }
    try { 
      await upsertVehicle(saved); 
      showToast('Veículo salvo com sucesso!', 'success');
    } catch(err: any) { 
      console.error('Erro ao salvar veículo:', err); 
      showToast(`Erro ao salvar veículo: ${err.message || 'Erro desconhecido'}`, 'error');
    }
  };

  const handleSaveProduct = async (productData: Product | Omit<Product, 'id'>) => {
    if (isDemoUser(currentUser)) {
      showToast('Usuário em modo demonstração possui acesso apenas de visualização.', 'warning');
      return;
    }
    let saved: Product;
    if ('id' in productData) {
      saved = productData;
      setProducts(prev => prev.map(p => p.id === productData.id ? productData : p));
    } else {
      const newId = `PRD-${String(nextIds.product).padStart(3, '0')}`;
      saved = { ...productData, id: newId };
      setProducts(prev => [saved, ...prev]);
      setNextIds((prev: any) => ({ ...prev, product: prev.product + 1 }));
    }
    try { 
      await upsertProduct(saved); 
      showToast('Produto salvo com sucesso!', 'success');
    } catch(err: any) { 
      console.error('Erro ao salvar produto:', err); 
      showToast(`Erro ao salvar produto: ${err.message || 'Erro desconhecido'}`, 'error');
    }
  };

  const handleDeleteProduct = async (productId: string) => {
    if (isDemoUser(currentUser)) {
      showToast('Usuário em modo demonstração possui acesso apenas de visualização.', 'warning');
      return;
    }
    if (currentUser?.profile === UserProfile.GerenciadoraDeRisco) {
      showToast('Perfil Gerenciadora de Risco não possui permissão para excluir produtos.', 'warning');
      return;
    }
    if (!window.confirm("Tem certeza que deseja excluir permanentemente esta informação?")) return;
    try {
      await deleteProduct(productId);
      setProducts(prev => prev.filter(p => p.id !== productId));
      showToast('Produto excluído com sucesso.', 'success');
    } catch (err) {
      console.error('Erro ao excluir produto:', err);
      showToast('Erro ao excluir produto.', 'error');
    }
  };
  
  const handleSaveLoad = async (loadData: Cargo | Omit<Cargo, 'id' | 'history' | 'createdAt' | 'createdById'>) => {
    if (isDemoUser(currentUser)) {
      showToast('Usuário em modo demonstração possui acesso apenas de visualização.', 'warning');
      return;
    }
    // Sanitize branchId to avoid FK violations ('' is not a valid UUID)
    if (loadData.branchId === '') {
        delete loadData.branchId;
    }

    const executeSaveCargo = async (cargoToSave: Cargo) => {
      const oldCargo = cargos.find(l => l.id === cargoToSave.id);
      if (!oldCargo) return;

      const changes: string[] = [];
      (Object.keys(cargoToSave) as Array<keyof Cargo>).forEach(key => {
        if (key === 'scheduledVolume' || key === 'loadedVolume') return;

        const oldValue: any = oldCargo[key];
        const newValue: any = cargoToSave[key];

        const isChanged = JSON.stringify(oldValue ?? null) !== JSON.stringify(newValue ?? null);
        if (key !== 'id' && key !== 'history' && key !== 'createdAt' && isChanged) {
          const fieldName = FIELD_TRANSLATIONS[key] || key;
          let oldDisplayValue = oldValue;
          let newDisplayValue = newValue;

          switch (key) {
            case 'clientId':
              oldDisplayValue = clients.find(c => c.id === oldValue)?.nomeFantasia || oldValue;
              newDisplayValue = clients.find(c => c.id === newValue)?.nomeFantasia || newValue;
              break;
            case 'productId':
              oldDisplayValue = products.find(p => p.id === oldValue)?.name || oldValue;
              newDisplayValue = products.find(p => p.id === newValue)?.name || newValue;
              break;
            case 'createdById':
              oldDisplayValue = users.find(u => u.id === oldValue)?.name || oldValue;
              newDisplayValue = users.find(u => u.id === newValue)?.name || newValue;
              break;
            case 'hasIcms':
            case 'requiresScheduling':
            case 'companyFreightHasToll':
            case 'driverFreightHasToll':
            case 'driverFreightPfHasToll':
              oldDisplayValue = oldValue ? 'Sim' : 'Não';
              newDisplayValue = newValue ? 'Sim' : 'Não';
              break;
            case 'companyFreightValuePerTon':
            case 'driverFreightValuePerTon':
              oldDisplayValue = oldValue?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) ?? 'N/A';
              newDisplayValue = newValue?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) ?? 'N/A';
              break;
            case 'totalVolume':
              oldDisplayValue = `${oldValue} ton`;
              newDisplayValue = `${newValue} ton`;
              break;
            case 'icmsPercentage':
              oldDisplayValue = `${oldValue}%`;
              newDisplayValue = `${newValue}%`;
              break;
            case 'originCoords':
            case 'destinationCoords':
              oldDisplayValue = oldValue ? `Lat: ${oldValue.lat.toFixed(4)}, Lng: ${oldValue.lng.toFixed(4)}` : 'N/A';
              newDisplayValue = newValue ? `Lat: ${newValue.lat.toFixed(4)}, Lng: ${newValue.lng.toFixed(4)}` : 'N/A';
              break;
            case 'dailySchedule':
              oldDisplayValue = Array.isArray(oldValue) && oldValue.length > 0 ? `${oldValue.length} dias agendados` : (oldValue === "" ? 'Vazio' : 'N/A');
              newDisplayValue = Array.isArray(newValue) && newValue.length > 0 ? `${newValue.length} dias agendados` : 'Vazio';
              break;
            case 'freightLegs':
              oldDisplayValue = Array.isArray(oldValue) && oldValue.length > 0 ? `${oldValue.length} trechos` : 'Padrão';
              newDisplayValue = Array.isArray(newValue) && newValue.length > 0 ? `${newValue.length} trechos` : 'Padrão';
              break;
          }
          changes.push(`${fieldName} alterado de "${oldDisplayValue}" para "${newDisplayValue}"`);
        }
      });

      let updatedCargo: Cargo;
      if (changes.length > 0) {
        const newHistory = createHistoryLog(`Carga atualizada: ${changes.join('; ')}.`);
        updatedCargo = { ...oldCargo, ...cargoToSave, history: [...oldCargo.history, newHistory] };
      } else {
        updatedCargo = { ...oldCargo, ...cargoToSave };
      }

      setCargos(prev => prev.map(l => l.id === cargoToSave.id ? updatedCargo : l));
      try {
        await upsertCargo(updatedCargo);
      } catch (err: any) {
        console.error('Erro ao salvar carga no Supabase:', err);
        const errorMessage = err?.message || 'Erro desconhecido ao salvar no banco de dados.';
        showToast(`[ERRO CRÍTICO] A carga não pôde ser atualizada no banco de dados: ${errorMessage}`, 'error');
        throw err;
      }
    };

    if ('id' in loadData) {
      const oldCargo = cargos.find(l => l.id === loadData.id);
      if (!oldCargo) return;

      const fiscalChanges: CargoChangedField[] = [];

      const oldHasIcms = Boolean(oldCargo.hasIcms);
      const newHasIcms = Boolean(loadData.hasIcms);
      const oldIcmsPct = Number(oldCargo.icmsPercentage || 0);
      const newIcmsPct = Number(loadData.icmsPercentage || 0);
      const oldCalcType = oldCargo.freightCalculationType;
      const newCalcType = loadData.freightCalculationType;

      if (oldHasIcms !== newHasIcms || (newHasIcms && oldIcmsPct !== newIcmsPct) || oldCalcType !== newCalcType) {
        fiscalChanges.push({
          key: 'icms',
          label: 'ICMS Destacado / Alíquota',
          oldValue: oldHasIcms ? `${oldIcmsPct}% (Destacado)` : 'Isento (Sem ICMS)',
          newValue: newHasIcms ? `${newIcmsPct}% (Destacado)` : 'Isento (Sem ICMS)',
          category: 'icms',
        });
      }

      const oldCompRate = Number(oldCargo.companyFreightValuePerTon || 0);
      const newCompRate = Number(loadData.companyFreightValuePerTon || 0);
      if (Math.abs(oldCompRate - newCompRate) > 0.001) {
        fiscalChanges.push({
          key: 'companyFreightValuePerTon',
          label: 'Valor Frete Empresa (por ton)',
          oldValue: oldCompRate > 0 ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(oldCompRate) : 'R$ 0,00',
          newValue: newCompRate > 0 ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(newCompRate) : 'R$ 0,00',
          category: 'company_freight',
        });
      }

      const oldDriverRate = Number(oldCargo.driverFreightValuePerTon || 0);
      const newDriverRate = Number(loadData.driverFreightValuePerTon || 0);

      if (Math.abs(oldDriverRate - newDriverRate) > 0.001) {
        fiscalChanges.push({
          key: 'driverFreightValuePerTon',
          label: 'Valor Frete Motorista (por ton)',
          oldValue: oldDriverRate > 0 ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(oldDriverRate) : 'R$ 0,00',
          newValue: newDriverRate > 0 ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(newDriverRate) : 'R$ 0,00',
          category: 'driver_freight',
        });
      }

      const oldFinEnabled = Boolean(oldCargo.financialCostEnabled);
      const newFinEnabled = Boolean(loadData.financialCostEnabled);
      const oldFinRate = Number(oldCargo.financialCostEffectiveRate || oldCargo.financialCostPerTon || 0);
      const newFinRate = Number(loadData.financialCostEffectiveRate || loadData.financialCostPerTon || 0);
      if (oldFinEnabled !== newFinEnabled || (newFinEnabled && Math.abs(oldFinRate - newFinRate) > 0.001)) {
        fiscalChanges.push({
          key: 'financialCost',
          label: 'Custo Financeiro',
          oldValue: oldFinEnabled ? (oldCargo.financialCostEffectiveRate ? `${oldCargo.financialCostEffectiveRate}%` : (oldCargo.financialCostPerTon ? `R$ ${oldCargo.financialCostPerTon}/t` : 'Habilitado')) : 'Não habilitado',
          newValue: newFinEnabled ? (loadData.financialCostEffectiveRate ? `${loadData.financialCostEffectiveRate}%` : (loadData.financialCostPerTon ? `R$ ${loadData.financialCostPerTon}/t` : 'Habilitado')) : 'Não habilitado',
          category: 'financial_cost',
        });
      }

      const oldCompToll = Boolean(oldCargo.companyFreightHasToll);
      const newCompToll = Boolean(loadData.companyFreightHasToll);
      const oldDriverToll = Boolean(oldCargo.driverFreightHasToll);
      const newDriverToll = Boolean(loadData.driverFreightHasToll);
      if (oldCompToll !== newCompToll || oldDriverToll !== newDriverToll) {
        fiscalChanges.push({
          key: 'toll',
          label: 'Inclusão de Pedágio',
          oldValue: `Emp: ${oldCompToll ? 'Sim' : 'Não'} | Mot: ${oldDriverToll ? 'Sim' : 'Não'}`,
          newValue: `Emp: ${newCompToll ? 'Sim' : 'Não'} | Mot: ${newDriverToll ? 'Sim' : 'Não'}`,
          category: 'toll',
        });
      }

      const linkedShipments = shipments.filter(s => 
        s.cargoId === loadData.id || 
        (oldCargo.sequenceId && s.cargoId === `CRG-${oldCargo.sequenceId}`) ||
        (loadData.sequenceId && s.cargoId === `CRG-${loadData.sequenceId}`)
      );

      if (fiscalChanges.length > 0 && linkedShipments.length > 0) {
        setCargoSyncModalData({
          isOpen: true,
          oldCargo,
          newCargo: loadData as Cargo,
          changedFields: fiscalChanges,
          linkedShipments,
        });
        return;
      }

      await executeSaveCargo(loadData as Cargo);
      showToast('Carga atualizada com sucesso!', 'success');
    } else { 
      if (!currentUser) return;
      
      const validCargos = cargos.filter(c => c.sequenceId && c.sequenceId > 0 && c.sequenceId < 1000000);
      const localMaxSeq = validCargos.reduce((max, c) => Math.max(max, c.sequenceId || 0), 0);
      const safeNextCargo = (nextIds.cargo && nextIds.cargo < 1000000) ? nextIds.cargo : (localMaxSeq + 1);
      const nextSeq = Math.max(localMaxSeq + 1, safeNextCargo, 101);
      const newCargoId = `CRG-${nextSeq}`;

      const newLoad: Cargo = {
        ...loadData,
        id: newCargoId,
        sequenceId: nextSeq,
        createdAt: new Date().toISOString(),
        createdById: (loadData as any).createdById || currentUser.id,
        history: [createHistoryLog(`Carga criada (#${nextSeq})`)],
      } as Cargo;

      // Atualização otimista
      setCargos(prev => [newLoad, ...prev.filter(c => c.id !== newCargoId && c.sequenceId !== nextSeq)]);
      
      try {
        const savedCargo = await insertCargo(newLoad);
        
        // Atualiza o estado local garantindo que não haja duplicação com o Realtime
        setCargos(prev => {
          const filtered = prev.filter(c => c.id !== newCargoId && c.id !== savedCargo.id && c.sequenceId !== nextSeq);
          return [savedCargo, ...filtered];
        });
        
        if (offerToConvert) {
          const updatedOffer = {
            ...offerToConvert, 
            cargoId: savedCargo.id,
            status: FreightOfferStatus.Aceita,
            history: [
              ...(offerToConvert.history || []),
              {
                id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
                userId: currentUser?.id || '',
                timestamp: new Date().toISOString(),
                description: `Carga #${savedCargo.sequenceId || savedCargo.id} criada a partir da oferta.`
              }
            ]
          };
          await upsertFreightOffer(updatedOffer);
          setFreightOffers(prev => prev.map(o => o.id === offerToConvert.id ? updatedOffer : o));
          setOfferToConvert(null);
        }
        
        // Sincroniza o contador local de IDs
        const finalSeq = savedCargo.sequenceId || parseInt(savedCargo.id.split('-')[1], 10);
        if (!isNaN(finalSeq) && finalSeq < 1000000) {
          setNextIds((prev: any) => ({ ...prev, cargo: Math.max(prev.cargo < 1000000 ? prev.cargo : 0, finalSeq + 1) }));
        }

        showToast('Carga criada com sucesso!', 'success');
        
      } catch (err: any) {
        console.error('Erro ao salvar carga no Supabase:', err);
        // Remove a carga em caso de erro (rollback)
        setCargos(prev => prev.filter(c => c.id !== newCargoId));
        
        const errorMessage = err?.message || 'Erro desconhecido ao salvar no banco de dados.';
        showToast(`[ERRO CRÍTICO] A carga não pôde ser salva no banco de dados: ${errorMessage}. Verifique as informações preenchidas.`, 'error');
      }
    }
  };

  const handleSaveCargoOnlyFromSync = async () => {
    if (!cargoSyncModalData) return;
    const targetCargo = cargoSyncModalData.newCargo;
    setCargoSyncModalData(null);
    try {
      const oldCargo = cargos.find(l => l.id === targetCargo.id);
      if (oldCargo) {
        const updatedCargo = { ...oldCargo, ...targetCargo };
        setCargos(prev => prev.map(l => l.id === targetCargo.id ? updatedCargo : l));
        await upsertCargo(updatedCargo);
      }
      showToast('Carga atualizada com sucesso! (Embarques existentes mantidos inalterados)', 'success');
    } catch (err: any) {
      console.error('Erro ao salvar carga:', err);
      showToast('Erro ao salvar carga no banco de dados.', 'error');
    }
  };

  const handleConfirmSyncShipments = async (selectedShipmentIds: string[]) => {
    if (!cargoSyncModalData) return;
    const targetCargo = cargoSyncModalData.newCargo;
    const { changedFields, linkedShipments } = cargoSyncModalData;
    setCargoSyncModalData(null);

    try {
      // 1. Salva a carga
      const oldCargo = cargos.find(l => l.id === targetCargo.id);
      if (oldCargo) {
        const changesSummary = changedFields.map(c => `${c.label}: de "${c.oldValue}" para "${c.newValue}"`).join('; ');
        const newHistory = createHistoryLog(`Carga atualizada com sincronização de embarques: ${changesSummary}`);
        const updatedCargo = { ...oldCargo, ...targetCargo, history: [...oldCargo.history, newHistory] };
        setCargos(prev => prev.map(l => l.id === targetCargo.id ? updatedCargo : l));
        await upsertCargo(updatedCargo);
      }

      // 2. Processa os embarques selecionados
      const updatedShipmentsList: Shipment[] = [];
      const selectedSet = new Set(selectedShipmentIds);
      const changesSummary = changedFields.map(c => `${c.label}: de "${c.oldValue}" para "${c.newValue}"`).join('; ');

      for (const s of linkedShipments) {
        if (!selectedSet.has(s.id)) continue;

        const ton = Number(s.loadedTonnage || s.shipmentTonnage || s.unloadedTonnage || 0);
        const docs = (s.documents && typeof s.documents === 'object') ? { ...s.documents } : {};
        let realProfit = (s.realProfitData || docs.real_profit_data) ? { ...(s.realProfitData || docs.real_profit_data) } : null;

        let newDriverFreight = s.driverFreightValue;
        let newDriverFreightRate = s.driverFreightRateSnapshot;
        let newCompanyFreightRate = s.companyFreightRateSnapshot;
        let newIcmsVal = s.icmsValue;
        let newIsIcmsExempt = s.isIcmsExempt;
        let newAdvanceValue = s.advanceValue;
        let newBalanceValue = s.balanceToReceiveValue;
        let newNetBalanceValue = s.netBalanceValue;
        let newFinancialCost = s.financialCostValue;

        // A. ICMS
        const isNewCargoWithoutIcms = !targetCargo.hasIcms || !targetCargo.icmsPercentage || targetCargo.icmsPercentage <= 0;
        if (isNewCargoWithoutIcms) {
          newIsIcmsExempt = true;
          newIcmsVal = 0;
          docs.is_icms_exempt = true;
          docs.isIcmsExempt = true;
          docs.icms_value = 0;
          docs.valor_icms = 0;
          if (realProfit) {
            realProfit.isIcmsExempt = true;
            realProfit.icmsDifference = 0;
            realProfit.icms = 0;
          }
        } else {
          const compRateForIcms = targetCargo.companyFreightValuePerTon || s.companyFreightRateSnapshot || 0;
          const compFreightForIcms = ton > 0 ? (compRateForIcms * ton) : (realProfit?.companyFreight || s.driverFreightValue || 0);
          const calculatedIcms = Number(((compFreightForIcms * targetCargo.icmsPercentage) / 100).toFixed(2));
          newIsIcmsExempt = false;
          newIcmsVal = calculatedIcms;
          docs.is_icms_exempt = false;
          docs.isIcmsExempt = false;
          docs.icms_value = calculatedIcms;
          docs.valor_icms = calculatedIcms;
          if (realProfit) {
            realProfit.isIcmsExempt = false;
            realProfit.icmsDifference = calculatedIcms;
          }
        }

        // B. Frete Empresa
        if (targetCargo.companyFreightValuePerTon !== undefined) {
          newCompanyFreightRate = targetCargo.companyFreightValuePerTon;
          if (ton > 0 && realProfit) {
            realProfit.companyFreight = Number((targetCargo.companyFreightValuePerTon * ton).toFixed(2));
          }
        }

        // C. Frete Motorista
        const targetDriverRate = targetCargo.driverFreightValuePerTon;

        if (targetDriverRate !== undefined && targetDriverRate > 0) {
          newDriverFreightRate = targetDriverRate;
          if (ton > 0) {
            newDriverFreight = Number((targetDriverRate * ton).toFixed(2));

            const canRecalcAdvance = s.status !== ShipmentStatus.Finalizado && s.status !== ShipmentStatus.AguardandoPagamentoSaldo;
            if (canRecalcAdvance) {
              const isPf = s.driverFreightType === 'PF' || s.anttModality === 'TAC';
              const calc = calculateAdvanceAndBalance({
                driverFreightValue: newDriverFreight,
                tollValue: s.tollValue || 0,
                advancePercentage: s.advancePercentage !== undefined ? s.advancePercentage : 70,
                driverFreightType: isPf ? 'PF' : 'PJ'
              });
              newAdvanceValue = calc.advanceInAccountValue;
              newBalanceValue = calc.balanceToReceiveValue;
              newNetBalanceValue = calc.balanceToReceiveValue;
            }
          }
        }

        // D. Custo Financeiro
        if (targetCargo.financialCostEnabled) {
          if (targetCargo.financialCostEffectiveRate) {
            const baseFreight = realProfit?.companyFreight || ((newCompanyFreightRate || 0) * ton);
            newFinancialCost = Number(((baseFreight * (targetCargo.financialCostEffectiveRate / 100))).toFixed(2));
          } else if (targetCargo.financialCostPerTon) {
            newFinancialCost = Number((targetCargo.financialCostPerTon * ton).toFixed(2));
          }
          docs.financial_cost_value = newFinancialCost;
        } else if (!targetCargo.financialCostEnabled) {
          newFinancialCost = 0;
          docs.financial_cost_value = 0;
        }

        if (realProfit) {
          docs.real_profit_data = realProfit;
        }

        const auditLog = createHistoryLog(
          `Sincronização em massa a partir da Carga #${targetCargo.sequenceId || targetCargo.id} por ${currentUser?.name || 'Sistema'}: ${changesSummary}`
        );

        const updatedShipment: Shipment = {
          ...s,
          isIcmsExempt: newIsIcmsExempt,
          icmsValue: newIcmsVal,
          companyFreightRateSnapshot: newCompanyFreightRate,
          driverFreightRateSnapshot: newDriverFreightRate,
          driverFreightValue: newDriverFreight,
          advanceValue: newAdvanceValue,
          balanceToReceiveValue: newBalanceValue,
          netBalanceValue: newNetBalanceValue,
          financialCostValue: newFinancialCost,
          documents: docs,
          realProfitData: realProfit || undefined,
          history: [...(s.history || []), auditLog],
        };

        updatedShipmentsList.push(updatedShipment);
      }

      if (updatedShipmentsList.length > 0) {
        await handleBatchUpdateShipments(updatedShipmentsList);
        showToast(`Carga e ${updatedShipmentsList.length} embarque(s) sincronizados com sucesso!`, 'success');
      } else {
        showToast('Carga atualizada com sucesso!', 'success');
      }
    } catch (err: any) {
      console.error('Erro na sincronização de carga e embarques:', err);
      showToast(`Erro ao sincronizar: ${err?.message || 'Falha desconhecida'}`, 'error');
    }
  };

  const handleBulkSaveLoads = async (loadsToInsert: Omit<Cargo, 'id'>[]) => {
    if (!loadsToInsert || loadsToInsert.length === 0 || !currentUser) return;
    if (isDemoUser(currentUser)) {
      showToast('Usuário em modo demonstração possui acesso apenas de visualização.', 'warning');
      return;
    }

    try {
      // 1. Descobre o maior sequenceId atual (banco + estado local)
      const validCargos = cargos.filter(c => c.sequenceId && c.sequenceId > 0 && c.sequenceId < 1000000);
      const localMaxSeq = validCargos.reduce((max, c) => Math.max(max, c.sequenceId || 0), 0);
      
      let dbMaxSeq = 0;
      try {
        const { data } = await supabase
          .from('cargos')
          .select('sequence_id')
          .lt('sequence_id', 1000000)
          .order('sequence_id', { ascending: false })
          .limit(1);
        if (data && data.length > 0 && data[0].sequence_id) {
          dbMaxSeq = Number(data[0].sequence_id);
        }
      } catch (err) {
        console.warn('[handleBulkSaveLoads] Aviso ao consultar sequence_id no Supabase:', err);
      }

      const safeNextCargo = (nextIds.cargo && nextIds.cargo < 1000000) ? nextIds.cargo - 1 : 0;
      let currentSeq = Math.max(localMaxSeq, dbMaxSeq, safeNextCargo, 100);

      const createdCargos: Cargo[] = [];

      for (const loadData of loadsToInsert) {
        currentSeq++;
        const realId = `CRG-${currentSeq}`;
        const newCargo: Cargo = {
          ...loadData,
          id: realId,
          sequenceId: currentSeq,
          createdAt: loadData.createdAt || new Date().toISOString(),
          createdById: loadData.createdById || currentUser.id,
          history: [
            createHistoryLog(`Carga criada via Importação em Lote (#${currentSeq})`)
          ]
        } as Cargo;

        const savedCargo = await insertCargo(newCargo);
        createdCargos.push(savedCargo || newCargo);
      }

      setCargos(prev => [...createdCargos, ...prev]);
      setNextIds((prev: any) => ({ ...prev, cargo: Math.max(prev.cargo < 1000000 ? prev.cargo : 0, currentSeq + 1) }));

      showToast(`${createdCargos.length} carga(s) importada(s) e criadas com sucesso no sistema!`, 'success');
    } catch (err: any) {
      console.error('Erro ao salvar cargas em lote:', err);
      const msg = err?.message || 'Erro desconhecido ao salvar lote de cargas.';
      showToast(`Erro na importação em lote: ${msg}`, 'error');
      throw err;
    }
  };

  const handleSaveUser = async (userData: User | Omit<User, 'id'>) => {
    if (isDemoUser(currentUser)) {
      showToast('Usuário em modo demonstração possui acesso apenas de visualização.', 'warning');
      return;
    }
    if (!isDeveloperUser(currentUser)) {
      if (userData.profile === UserProfile.Desenvolvedor || (userData.profile as string) === 'Desenvolvedor') {
        showToast('Você não tem permissão para atribuir este perfil.', 'error');
        return;
      }
      if ('id' in userData) {
        const targetExisting = users.find(u => u.id === userData.id);
        if (targetExisting && isDeveloperUser(targetExisting)) {
          showToast('Você não tem permissão para alterar este usuário.', 'error');
          return;
        }
        if (targetExisting && isDemoUser(targetExisting) && !isAdminUser(currentUser)) {
          showToast('Você não tem permissão para alterar este usuário.', 'error');
          return;
        }
      }
    }
    const cleanBranchId = userData.branchId && userData.branchId.trim() !== '' 
      ? userData.branchId.trim() 
      : ((userData as any).filialId && (userData as any).filialId.trim() !== '' ? (userData as any).filialId.trim() : undefined);

    let saved: User;
    if ('id' in userData) {
      saved = {
        ...userData,
        branchId: cleanBranchId,
        filialId: cleanBranchId,
      } as User;
      setUsers(prev => prev.map(u => u.id === userData.id ? saved : u));
    } else { 
      const newId = formatId(nextIds.user, 'USR');
      saved = { 
        ...userData, 
        id: newId,
        branchId: cleanBranchId,
        filialId: cleanBranchId,
      } as User;
      setUsers(prev => [saved, ...prev]);
      setNextIds((prev: any) => ({ ...prev, user: prev.user + 1 }));
    }
    try { 
      await upsertUser(saved); 
      showToast('Configurações do usuário salvas com sucesso no banco de dados!', 'success');
    } catch(err) { 
      console.error('Erro ao salvar usuário no Supabase:', err); 
      showToast('Erro ao salvar usuário no banco de dados.', 'error');
    }
  };
  
  const handleDeleteUser = async (userId: string) => {
    if (isDemoUser(currentUser)) {
      showToast('Usuário em modo demonstração possui acesso apenas de visualização.', 'warning');
      return;
    }
    if (!window.confirm("Tem certeza que deseja excluir permanentemente esta informação?")) return;
    if (!currentUser || (currentUser.profile !== UserProfile.Admin && !isDeveloperUser(currentUser))) return;
    if (userId === currentUser.id) {
        showToast("Você não pode excluir seu próprio usuário.", 'warning');
        return;
    }
    const targetToDelete = users.find(u => u.id === userId);
    if (!isDeveloperUser(currentUser) && targetToDelete) {
      if (isDeveloperUser(targetToDelete)) {
        showToast("Você não tem permissão para excluir este usuário.", 'error');
        return;
      }
      if (isDemoUser(targetToDelete) && !isAdminUser(currentUser)) {
        showToast("Você não tem permissão para excluir este usuário.", 'error');
        return;
      }
    }
    
    if (confirm('Tem certeza que deseja excluir este usuário?')) {
        try {
            await deleteUser(userId);
            setUsers(prev => prev.filter(u => u.id !== userId));
            showToast("Usuário excluído com sucesso.", 'success');
        } catch (error) {
            console.error('Erro ao excluir usuário:', error);
            showToast("Erro ao excluir usuário. Verifique o console.", 'error');
        }
    }
  };

  const handleSaveBranch = async (branchData: Branch | Omit<Branch, 'id' | 'createdAt'>) => {
    if (isDemoUser(currentUser)) {
      showToast('Usuário em modo demonstração possui acesso apenas de visualização.', 'warning');
      return;
    }
    let saved: Branch;
    if ('id' in branchData) {
      saved = branchData;
      setBranches(prev => prev.map(b => b.id === branchData.id ? branchData : b));
    } else {
      const newId = `FIL-${String(nextIds.branch).padStart(3, '0')}`;
      saved = { ...branchData, id: newId, createdAt: new Date().toISOString() } as Branch;
      setBranches(prev => [saved, ...prev]);
      setNextIds((prev: any) => ({ ...prev, branch: prev.branch + 1 }));
    }
    try { await upsertBranch(saved); } catch(err) { console.error('Erro ao salvar filial:', err); }
    showToast('Filial salva com sucesso!', 'success');
  };

  const handleDeleteBranch = async (branchId: string) => {
    if (isDemoUser(currentUser)) {
      showToast('Usuário em modo demonstração possui acesso apenas de visualização.', 'warning');
      return;
    }
    if (!window.confirm("Tem certeza que deseja excluir permanentemente esta informação?")) return;
    if (!currentUser || (currentUser.profile !== UserProfile.Admin && !isDeveloperUser(currentUser))) return;
    if (confirm('Tem certeza que deseja excluir esta filial?')) {
      try {
        await deleteBranch(branchId);
        setBranches(prev => prev.filter(b => b.id !== branchId));
        showToast('Filial excluída com sucesso.', 'success');
      } catch (err) {
        console.error('Erro ao excluir filial:', err);
        showToast('Erro ao excluir filial.', 'error');
      }
    }
  };

  const handleRevertShipmentStatus = async (shipmentId: string) => {
    if (isDemoUser(currentUser)) {
      showToast('Usuário em modo demonstração possui acesso apenas de visualização.', 'warning');
      return;
    }
    const shipment = shipments.find(s => s.id === shipmentId);
    if (!shipment || !currentUser) return;
    
    const canRevert = [UserProfile.Desenvolvedor, UserProfile.Admin, UserProfile.Diretor, UserProfile.GerenciadoraDeRisco].includes(currentUser.profile) ||
      (currentUser.profile as string) === 'Gerenciadora de Risco' ||
      Boolean(currentUser.name && (currentUser.name.toLowerCase().includes('samanta') || currentUser.name.toLowerCase().includes('samantha'))) ||
      Boolean(currentUser.email && (currentUser.email.toLowerCase().includes('samanta') || currentUser.email.toLowerCase().includes('samantha')));

    if (!canRevert) {
        showToast("Apenas administradores, diretores ou gerenciadora de risco podem reverter o status.", 'warning');
        return;
    }

    const currentStatus = shipment.status;

    // Ordem estrita de reversão: 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1
    const getStrictPreviousStatus = (status: ShipmentStatus, s: Shipment): ShipmentStatus | null => {
      const is100PctAdv = isShipment100PercentAdvance(s);
      const is0PctAdv = isShipment0PercentAdvance(s);

      switch (status) {
        case ShipmentStatus.Finalizado: // 11
          // Se foi 100% adiantamento (pulou Ag. Saldo), volta direto para 9 - Valid. de Ticket
          return is100PctAdv ? ShipmentStatus.ValidacaoTicket : ShipmentStatus.AguardandoPagamentoSaldo;
        case ShipmentStatus.AguardandoPagamentoSaldo: // 10
          return ShipmentStatus.ValidacaoTicket; // 9
        case ShipmentStatus.ValidacaoTicket: // 9
          return ShipmentStatus.AguardandoDescarga; // 8
        case ShipmentStatus.AguardandoDescarga: // 8
          {
            const relCargo = findCargoById(cargos, s.cargoId);
            const cargoRequiresScheduling = Boolean(relCargo?.requiresScheduling);
            if (!cargoRequiresScheduling) {
              // Se a carga NÃO exigia agendamento (pulou Ag. Agend. ou Troca/nfe), reverte para Ag. Adiantamento (ou Ag. Fiscal se 0% adv)
              return is0PctAdv ? ShipmentStatus.AguardandoFiscal : ShipmentStatus.AguardandoAdiantamento;
            }
            return ShipmentStatus.AguardandoAgendamento; // 7
          }
        case ShipmentStatus.AguardandoAgendamento: // 7
          // Se foi 0% adiantamento (pulou Ag. Adiantamento), volta direto para 5 - Ag. Fiscal
          return is0PctAdv ? ShipmentStatus.AguardandoFiscal : ShipmentStatus.AguardandoAdiantamento;
        case ShipmentStatus.AguardandoAdiantamento: // 6
          return ShipmentStatus.AguardandoFiscal; // 5
        case ShipmentStatus.AguardandoFiscal: // 5
          return ShipmentStatus.AguardandoNota; // 4
        case ShipmentStatus.AguardandoNota: // 4
          return ShipmentStatus.AguardandoCarregamento; // 3
        case ShipmentStatus.AguardandoCarregamento: // 3
          {
            const relCargo = findCargoById(cargos, s.cargoId);
            const relProd = findProductForCargo(products, relCargo);
            const prodRequiresRisk = checkRequiresRiskManagement(relCargo, relProd);
            if (!prodRequiresRisk) {
              return s.statusHistory?.some(h => h.status === ShipmentStatus.PreCadastro) ? ShipmentStatus.PreCadastro : null;
            }
            return ShipmentStatus.AguardandoSeguradora; // 2
          }
        case ShipmentStatus.AguardandoSeguradora: // 2
          // Se o motorista passou por Ag. Cadastro (1)
          return s.statusHistory?.some(h => h.status === ShipmentStatus.PreCadastro) ? ShipmentStatus.PreCadastro : null;
        case ShipmentStatus.PreCadastro: // 1
          return null;
        case ShipmentStatus.Cancelado:
          return s.statusHistory && s.statusHistory.length > 1 ? s.statusHistory[s.statusHistory.length - 2].status : ShipmentStatus.PreCadastro;
        default:
          return null;
      }
    };

    let previousStatus: ShipmentStatus | null = null;
    let historyCopy = shipment.statusHistory ? [...shipment.statusHistory] : [];

    if (historyCopy.length > 1) {
      historyCopy.pop(); // Remove o status atual
      const previousStatusEntry = historyCopy[historyCopy.length - 1];
      previousStatus = previousStatusEntry?.status || getStrictPreviousStatus(currentStatus, shipment);
    } else {
      previousStatus = getStrictPreviousStatus(currentStatus, shipment);
      if (previousStatus) {
        historyCopy = [{
          status: previousStatus,
          timestamp: new Date().toISOString(),
          userId: currentUser.id
        }];
      }
    }

    if (!previousStatus) {
      showToast("Não há status anterior para reverter.", 'info');
      return;
    }

    // Build list of document and metadata keys to clear ONLY for the current status that is being reverted/cancelled
    const getDocKeysForStatus = (status: ShipmentStatus): string[] => {
      const mainDoc = REQUIRED_DOCUMENT_MAP[status];
      const keys: string[] = mainDoc ? [mainDoc] : [];
      if (status === ShipmentStatus.AguardandoNota) {
        keys.push('Nota Fiscal', 'nfe_number', 'nfeNumber');
      } else if (status === ShipmentStatus.AguardandoFiscal) {
        keys.push('CT-e', 'CIOT', 'Ciot', 'XML do CT-e', 'MDF-e', 'Carta Frete', 'Outros', 'cte_number', 'cte_emission_date', 'mdfe_number', 'cteNumber', 'cteEmissionDate', 'mdfeNumber');
      } else if (status === ShipmentStatus.AguardandoSeguradora) {
        keys.push('risk_release_code', 'risk_query_type', 'risk_query_cost', 'riskReleaseCode', 'riskQueryType', 'riskQueryCost');
      } else if (status === ShipmentStatus.AguardandoAdiantamento) {
        keys.push('advance_percentage', 'advance_value', 'toll_value', 'advancePercentage', 'advanceValue', 'tollValue', 'Comprovante de Adiantamento');
      } else if (status === ShipmentStatus.AguardandoDescarga) {
        keys.push('unloaded_tonnage', 'unloadedTonnage', 'Comprovante de Descarga');
      } else if (status === ShipmentStatus.ValidacaoTicket) {
        keys.push('ticket_validated', 'ticketValidated');
      } else if (status === ShipmentStatus.AguardandoPagamentoSaldo) {
        keys.push('balance_to_receive_value', 'discount_value', 'net_balance_value', 'is_breakage_waived', 'balanceToReceiveValue', 'discountValue', 'netBalanceValue', 'isBreakageWaived', 'Comprovante de Saldo');
      }
      return keys;
    };

    // CRITICAL: Only remove keys associated with currentStatus being undone; never remove keys of previousStatus
    const keysToRemove = Array.from(new Set(getDocKeysForStatus(currentStatus)));

    const updatedDocuments = { ...(shipment.documents || {}) };

    keysToRemove.forEach(key => {
      if (updatedDocuments[key]) {
        delete updatedDocuments[key];
      }
    });

    const updatedShipment: Shipment = {
        ...shipment,
        status: previousStatus,
        statusHistory: historyCopy,
        cancellationReason: currentStatus === ShipmentStatus.Cancelado ? undefined : shipment.cancellationReason,
        documents: Object.keys(updatedDocuments).length > 0 ? updatedDocuments : undefined,
        riskReleaseCode: keysToRemove.includes('riskReleaseCode') ? undefined : shipment.riskReleaseCode,
        riskQueryType: keysToRemove.includes('riskQueryType') ? undefined : shipment.riskQueryType,
        riskQueryCost: keysToRemove.includes('riskQueryCost') ? undefined : shipment.riskQueryCost,
        cteNumber: (!isCteApplicableForStatus(previousStatus) || keysToRemove.includes('cteNumber')) ? undefined : (shipment.cteNumber || shipment.documents?.cte_number),
        cteEmissionDate: (!isCteApplicableForStatus(previousStatus) || keysToRemove.includes('cteEmissionDate')) ? undefined : (shipment.cteEmissionDate || shipment.documents?.cte_emission_date),
        nfeNumber: keysToRemove.includes('nfeNumber') ? undefined : (shipment.nfeNumber || shipment.documents?.nfe_number),
        mdfeNumber: keysToRemove.includes('mdfeNumber') ? undefined : (shipment.mdfeNumber || shipment.documents?.mdfe_number),
        advancePercentage: keysToRemove.includes('advancePercentage') ? undefined : shipment.advancePercentage,
        advanceValue: keysToRemove.includes('advanceValue') ? undefined : shipment.advanceValue,
        tollValue: keysToRemove.includes('tollValue') ? undefined : shipment.tollValue,
        unloadedTonnage: keysToRemove.includes('unloadedTonnage') ? undefined : shipment.unloadedTonnage,
        balanceToReceiveValue: keysToRemove.includes('balanceToReceiveValue') ? undefined : shipment.balanceToReceiveValue,
        discountValue: keysToRemove.includes('discountValue') ? undefined : shipment.discountValue,
        isBreakageWaived: keysToRemove.includes('isBreakageWaived') ? undefined : shipment.isBreakageWaived,
        netBalanceValue: keysToRemove.includes('netBalanceValue') ? undefined : shipment.netBalanceValue,
        history: [...shipment.history, createHistoryLog(`Status revertido de "${currentStatus}" para "${previousStatus}" por ${currentUser.name}. Anexos e dados da etapa removidos para reanexação.`)]
    };

    const updatedShipments = shipments.map(s => s.id === shipmentId ? updatedShipment : s);
    const cargo = cargos.find(c => c.id === shipment.cargoId || (c.sequenceId && `CRG-${c.sequenceId}` === shipment.cargoId));
    let updatedCargo: Cargo | undefined;
    if (cargo) {
        const reconciled = reconcileCargoWithShipments(cargo, updatedShipments);
        updatedCargo = {
            ...reconciled,
            history: [...cargo.history, createHistoryLog(`Volumes recalculados devido à reversão de status do embarque ${shipmentId} para "${previousStatus}".`)]
        };
    }

    const prevShipmentsState = shipments;
    const prevCargosState = cargos;

    setShipments(updatedShipments);
    if (updatedCargo) {
        setCargos(prev => prev.map(c => (c.id === updatedShipment.cargoId || (c.sequenceId && `CRG-${c.sequenceId}` === updatedShipment.cargoId)) ? updatedCargo! : c));
    }

    try {
        await upsertShipment(updatedShipment);
        if (updatedCargo) await upsertCargo(updatedCargo);
        showToast(`Status revertido para ${previousStatus}. Anexos anteriores removidos para novo envio.`, 'success');
    } catch (err: any) {
        console.error('Erro ao salvar reversão:', err);
        setShipments(prevShipmentsState);
        setCargos(prevCargosState);
        const errMsg = err?.message || 'Erro desconhecido no banco de dados';
        showToast(`Erro ao salvar a reversão no banco de dados: ${errMsg}`, 'error');
    }
  };

  const handleReactivateLoad = async (cargoToReactivate: Cargo) => {
    if (!currentUser) return;
    if (isDemoUser(currentUser)) {
      showToast('Usuário em modo demonstração possui acesso apenas de visualização.', 'warning');
      return;
    }
    
    const updatedCargo: Cargo = {
      ...cargoToReactivate,
      status: CargoStatus.EmAndamento,
      history: [...cargoToReactivate.history, createHistoryLog(`Carga reativada por ${currentUser.name}. Status alterado de "${cargoToReactivate.status}" para "Em Andamento".`)]
    };

    setCargos(prev => prev.map(c => c.id === cargoToReactivate.id ? updatedCargo : c));
    try {
      await upsertCargo(updatedCargo);
    } catch (err) {
      console.error('Erro ao reativar carga:', err);
      showToast("Erro ao reativar carga no banco de dados.", 'error');
    }
  };

  const handleSuspendLoad = async (cargoToSuspend: Cargo) => {
    if (!currentUser) return;
    if (isDemoUser(currentUser)) {
      showToast('Usuário em modo demonstração possui acesso apenas de visualização.', 'warning');
      return;
    }
    
    const updatedCargo: Cargo = {
      ...cargoToSuspend,
      status: CargoStatus.Suspensa,
      history: [...cargoToSuspend.history, createHistoryLog(`Carga suspensa por ${currentUser.name}.`)]
    };

    setCargos(prev => prev.map(c => c.id === cargoToSuspend.id ? updatedCargo : c));
    try {
      await upsertCargo(updatedCargo);
    } catch (err) {
      console.error('Erro ao suspender carga:', err);
      showToast("Erro ao suspender carga no banco de dados.", 'error');
    }
  };

  // --- RENDER LOGIC ---
  const renderPage = () => {
    if (!currentUser) return null;

    // We moved the isLoading check to the top-level to prevent race conditions during login.

    if (loadError) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: '16px' }}>
          <p style={{ color: '#ef4444', fontSize: '16px' }}>{loadError}</p>
          <button onClick={() => window.location.reload()} style={{ padding: '8px 16px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>Tentar novamente</button>
        </div>
      );
    }


    return (
      <React.Suspense fallback={<PageLoadingFallback />}>
        <Routes>
          <Route path="/" element={<DashboardPage cargos={cargos} shipments={visibleShipments} users={visibleUsers} currentUser={currentUser} clients={clients} products={products} companyLogo={companyLogo} vehicles={vehicles} drivers={drivers} owners={owners} onDeleteAttachment={handleDeleteShipmentAttachment} onUpdateAttachment={handleUpdateShipmentAttachment} onUpdateShipmentData={handleUpdateShipmentData} onAddAttachments={handleAddShipmentAttachments} onUpdateAnttAndBankDetails={handleUpdateShipmentAnttAndBankDetails} onUpdatePrice={handleUpdateShipmentPrice} onSwapCargo={handleSwapCargo} freightOffers={freightOffers} onSaveFreightOffer={handleSaveFreightOffer} onAcceptFreightOffer={handleAcceptFreightOffer} onConvertToCargo={(offer) => { setOfferToConvert(offer); setCurrentPage('loads'); }} onCreateShipment={handleCreateShipment} allShipments={shipments} riskQueryOptions={riskQueryOptions} realtimeStatus={realtimeStatus} lastSyncTime={lastSyncTime} onRefreshData={loadAllData} />} />
          <Route path="/dashboard" element={<Navigate to="/" replace />} />
          <Route path="/clients" element={<ClientsPage clients={clients} setClients={setClients} onSaveClient={handleSaveClient} onDeleteClient={handleDeleteClient} onMergeClients={handleMergeClients} currentUser={currentUser} profilePermissions={profilePermissions} loadingOrderModels={loadingOrderModels} />} />
          <Route path="/owners" element={<OwnersPage owners={owners} setOwners={setOwners} onSaveOwner={handleSaveOwner} currentUser={currentUser} profilePermissions={profilePermissions} vehicles={vehicles} drivers={drivers} shipments={shipments} />} />
          <Route path="/drivers" element={<DriversPage drivers={drivers} setDrivers={setDrivers} onSaveDriver={handleSaveDriver} owners={owners} currentUser={currentUser} profilePermissions={profilePermissions} shipments={visibleShipments} cargos={cargos} />} />
          <Route path="/vehicles" element={<VehiclesPage vehicles={vehicles} setVehicles={setVehicles} onSaveVehicle={handleSaveVehicle} owners={owners} currentUser={currentUser} profilePermissions={profilePermissions} shipments={visibleShipments} cargos={cargos} />} />
          <Route path="/loads" element={<LoadsPage loads={activeLoads} setLoads={setCargos} clients={clients} products={products} locations={locations} onSaveLoad={handleSaveLoad} onBulkSaveLoads={handleBulkSaveLoads} onReactivateLoad={handleReactivateLoad} onSuspendLoad={handleSuspendLoad} onUpdatePrice={handleUpdateShipmentPrice} currentUser={currentUser} profilePermissions={profilePermissions} users={visibleUsers} shipments={visibleShipments} allShipments={shipments} onDeleteLoad={handleDeleteCargo} onModalStateChange={setIsAnyModalOpen} companyLogo={companyLogo} vehicles={vehicles} drivers={drivers} owners={owners} onDeleteAttachment={handleDeleteShipmentAttachment} branches={branches} stays={stays} tickets={tickets} offerToConvert={offerToConvert} setOfferToConvert={setOfferToConvert} onCreateShipment={handleCreateShipment} onSwapCargo={handleSwapCargo} />} />
          <Route path="/locations" element={!can('read', currentUser, 'locations', profilePermissions) ? <Navigate to="/" replace /> : <LocationsPage locations={locations} onSaveLocation={handleSaveLocation} onDeleteLocation={handleDeleteLocation} currentUser={currentUser} profilePermissions={profilePermissions} />} />
          <Route path="/products" element={<ProductsPage products={products} onSaveProduct={handleSaveProduct} onDeleteProduct={handleDeleteProduct} currentUser={currentUser} profilePermissions={profilePermissions} />} />
          <Route path="/shipments" element={<ShipmentsPage shipments={visibleShipments} cargos={cargos} clients={clients} products={products} drivers={drivers} vehicles={vehicles} currentUser={currentUser} profilePermissions={profilePermissions} users={visibleUsers} onUpdateAttachment={handleUpdateShipmentAttachment} onAddAttachments={handleAddShipmentAttachments} onUpdatePrice={handleUpdateShipmentPrice} onConfirmCancel={handleConfirmCancelShipment} onUpdateAnttAndBankDetails={handleUpdateShipmentAnttAndBankDetails} onMarkArrival={handleMarkArrival} onTransferShipment={handleTransferShipment} onDeleteShipment={handleDeleteShipment} onRevertStatus={handleRevertShipmentStatus} onUpdateScheduledDateTime={handleUpdateScheduledDateTime} onUpdateShipmentData={handleUpdateShipmentData} onDeleteAttachment={handleDeleteShipmentAttachment} onSwapCargo={handleSwapCargo} activeLocks={activeLocks} onModalStateChange={setIsAnyModalOpen} companyLogo={companyLogo} stays={stays} tickets={tickets} riskQueryOptions={riskQueryOptions} onBatchUpdateShipments={handleBatchUpdateShipments} onCreateShipment={handleCreateShipment} />} />
          <Route path="/operational-loads" element={<OperationalLoadsPage loads={inProgressLoads} clients={clients} products={products} drivers={drivers} owners={owners} vehicles={vehicles} onCreateShipment={handleCreateShipment} onSaveLoad={handleSaveLoad} onBulkSaveLoads={handleBulkSaveLoads} onReactivateLoad={handleReactivateLoad} onSuspendLoad={handleSuspendLoad} currentUser={currentUser} profilePermissions={profilePermissions} shipments={visibleShipments} allShipments={shipments} users={visibleUsers} onDeleteLoad={handleDeleteCargo} onUpdatePrice={handleUpdateShipmentPrice} onUpdateShipmentData={handleUpdateShipmentData} onRequestLoadOrder={handleRequestLoadOrder} onModalStateChange={setIsAnyModalOpen} onDeleteAttachment={handleDeleteShipmentAttachment} branches={branches} stays={stays} tickets={tickets} onUpdateAttachment={handleUpdateShipmentAttachment} onAddAttachments={handleAddShipmentAttachments} riskQueryOptions={riskQueryOptions} onSwapCargo={handleSwapCargo} />} />
          <Route path="/operational-map" element={<OperationalMapPage cargos={cargos} shipments={shipments} clients={clients} products={products} drivers={drivers} owners={owners} vehicles={vehicles} onCreateShipment={handleCreateShipment} currentUser={currentUser} users={visibleUsers} onModalStateChange={setIsAnyModalOpen} onDeleteAttachment={handleDeleteShipmentAttachment} />} />
          <Route path="/financial" element={!can('read', currentUser, 'financial', profilePermissions) ? <Navigate to="/" replace /> : <FinancialPage shipments={visibleShipments} cargos={cargos} clients={clients} users={visibleUsers} currentUser={currentUser} branches={branches} products={products} vehicles={vehicles} owners={owners} stays={stays} />} />
          <Route path="/commissions" element={<CommissionsPage shipments={visibleShipments} cargos={cargos} users={visibleUsers} stays={stays} clients={clients} />} />
          <Route path="/reports" element={!can('read', currentUser, 'reports', profilePermissions) ? <Navigate to="/" replace /> : <ReportsPage shipments={visibleShipments} embarcadores={visibleEmbarcadores} cargos={cargos} users={visibleUsers} currentUser={currentUser} clients={clients} branches={branches} stays={stays} companyLogo={companyLogo} onSaveUser={handleSaveUser} drivers={drivers} vehicles={vehicles} products={products} onUpdateAttachment={handleUpdateShipmentAttachment} onBatchUpdateShipments={handleBatchUpdateShipments} onUpdateShipmentData={handleUpdateShipmentData} />} />
          <Route path="/users-register" element={<UsersPage users={visibleUsers} setUsers={setUsers} onSaveUser={handleSaveUser} currentUser={currentUser} profilePermissions={profilePermissions} onSavePermissions={handleSavePermissions} clients={clients} onDeleteUser={handleDeleteUser} branches={branches} cargos={cargos} shipments={shipments} owners={owners} drivers={drivers} vehicles={vehicles} products={products} freightOffers={freightOffers} stays={stays} tickets={tickets} riskQueryOptions={riskQueryOptions} companyLogo={companyLogo} />} />
          <Route path="/corporate-email" element={!can('read', currentUser, 'corporate-email', profilePermissions) ? <Navigate to="/" replace /> : <CorporateEmailPage currentUser={currentUser} users={visibleUsers} companyLogo={companyLogo} />} />
          <Route path="/appearance" element={<AppearancePage currentLogo={companyLogo} onSaveLogo={handleSaveLogo} currentTheme={themeImage} onSaveTheme={handleSaveThemeImage} themeMode={themeMode} onThemeModeChange={handleThemeModeChange} />} />
          <Route path="/system-monitor" element={<SystemMonitorPage currentUser={currentUser} profilePermissions={profilePermissions} onSavePermissions={handleSavePermissions} />} />
          <Route path="/shipment-history" element={<ShipmentHistoryPage shipments={visibleShipments} cargos={cargos} drivers={drivers} users={visibleUsers} currentUser={currentUser} clients={clients} products={products} vehicles={vehicles} onDeleteShipment={handleDeleteShipment} onRevertStatus={handleRevertShipmentStatus} onDeleteAttachment={handleDeleteShipmentAttachment} onUpdatePrice={handleUpdateShipmentPrice} onUpdateShipmentData={handleUpdateShipmentData} onUpdateAttachment={handleUpdateShipmentAttachment} stays={stays} riskQueryOptions={riskQueryOptions} onCreateShipment={handleCreateShipment} />} />
          <Route path="/load-history" element={<LoadHistoryPage loads={closedLoads} clients={clients} products={products} users={visibleUsers} currentUser={currentUser} shipments={shipments} onDeleteLoad={handleDeleteCargo} onReactivateLoad={handleReactivateLoad} />} />
          <Route path="/layover-calculator" element={<LayoverCalculatorPage currentUser={currentUser} shipments={shipments} cargos={cargos} clients={clients} />} />
          <Route path="/freight-quote" element={<FreightQuotePage currentUser={currentUser} cargos={cargos} />} />
          <Route path="/atua-reconciliation" element={!can('read', currentUser, 'atua-reconciliation', profilePermissions) ? <Navigate to="/" replace /> : <AtuaReconciliationPage currentUser={currentUser} shipments={visibleShipments} cargos={cargos} clients={clients} drivers={drivers} vehicles={vehicles} users={visibleUsers} branches={branches} stays={stays} companyLogo={companyLogo} />} />
          <Route path="/tools-history" element={<ToolsHistoryPage currentUser={currentUser} shipments={shipments} cargos={cargos} clients={clients} />} />
          <Route path="/branches" element={<BranchesPage branches={branches} onSaveBranch={handleSaveBranch} onDeleteBranch={handleDeleteBranch} currentUser={currentUser} profilePermissions={profilePermissions} />} />
          <Route path="/risk-management" element={!can('read', currentUser, 'risk-management', profilePermissions) ? <Navigate to="/" replace /> : <RiskManagementPage shipments={visibleShipments} cargos={cargos} clients={clients} products={products} drivers={drivers} vehicles={vehicles} owners={owners} users={visibleUsers} currentUser={currentUser} companyLogo={companyLogo} riskQueryOptions={riskQueryOptions} onSaveRiskQueryOption={handleSaveRiskQueryOption} onDeleteRiskQueryOption={handleDeleteRiskQueryOption} onRestoreRiskQueryDefaults={handleRestoreRiskQueryDefaults} profilePermissions={profilePermissions} onUpdatePrice={handleUpdateShipmentPrice} onUpdateShipmentData={handleUpdateShipmentData} onAddAttachments={handleAddShipmentAttachments} onDeleteAttachment={handleDeleteShipmentAttachment} onModalStateChange={setIsAnyModalOpen} onSwapCargo={handleSwapCargo} />} />
          <Route path="/risk-query-types" element={!can('read', currentUser, 'risk-query-types', profilePermissions) ? <Navigate to="/" replace /> : <RiskQueryTypesPage riskQueryOptions={riskQueryOptions} onSaveOption={handleSaveRiskQueryOption} onDeleteOption={handleDeleteRiskQueryOption} onRestoreDefaults={handleRestoreRiskQueryDefaults} currentUser={currentUser} profilePermissions={profilePermissions} />} />
          <Route path="/freight-offers-history" element={!can('read', currentUser, 'freight-offers-history', profilePermissions) ? <Navigate to="/" replace /> : <FreightOffersHistoryPage currentUser={currentUser} freightOffers={freightOffers} clients={clients} products={products} cargos={cargos} users={visibleUsers} onSaveFreightOffer={handleSaveFreightOffer} onDeleteFreightOffer={handleDeleteFreightOffer} onConvertToCargo={(offer) => { setOfferToConvert(offer); setCurrentPage('loads'); }} />} />
          <Route path="/whatsapp" element={<Navigate to="/messenger" replace />} />
          <Route path="/messenger" element={!can('read', currentUser, 'messenger', profilePermissions) ? <Navigate to="/" replace /> : <MessengerPage shipments={visibleShipments} cargos={cargos} clients={clients} drivers={drivers} users={visibleUsers} currentUser={currentUser} />} />
          <Route path="/apresentacao" element={<CommercialPresentationPage companyLogo={companyLogo} currentUser={currentUser} onBackToApp={() => navigate('/')} />} />
          <Route path="/apresentacao-comercial" element={<CommercialPresentationPage companyLogo={companyLogo} currentUser={currentUser} onBackToApp={() => navigate('/')} />} />
          <Route path="/site" element={<InstitutionalWebsitePage companyLogo={companyLogo} isLoggedIn={!!currentUser} onGoToSystem={() => navigate('/')} onOpenPresentation={() => navigate('/apresentacao')} />} />
          <Route path="/website" element={<InstitutionalWebsitePage companyLogo={companyLogo} isLoggedIn={!!currentUser} onGoToSystem={() => navigate('/')} onOpenPresentation={() => navigate('/apresentacao')} />} />
          <Route path="/institucional" element={<InstitutionalWebsitePage companyLogo={companyLogo} isLoggedIn={!!currentUser} onGoToSystem={() => navigate('/')} onOpenPresentation={() => navigate('/apresentacao')} />} />
          <Route path="/curso-embarcador" element={<ShipperCoursePage currentUser={currentUser} onBackToApp={() => navigate('/')} />} />
          <Route path="/curso" element={<Navigate to="/curso-embarcador" replace />} />
          <Route path="*" element={<DashboardPage cargos={cargos} shipments={visibleShipments} users={visibleUsers} currentUser={currentUser} clients={clients} products={products} companyLogo={companyLogo} vehicles={vehicles} drivers={drivers} onDeleteAttachment={handleDeleteShipmentAttachment} onUpdateAttachment={handleUpdateShipmentAttachment} onUpdateShipmentData={handleUpdateShipmentData} onAddAttachments={handleAddShipmentAttachments} onUpdateAnttAndBankDetails={handleUpdateShipmentAnttAndBankDetails} onUpdatePrice={handleUpdateShipmentPrice} onSwapCargo={handleSwapCargo} freightOffers={freightOffers} onSaveFreightOffer={handleSaveFreightOffer} onAcceptFreightOffer={handleAcceptFreightOffer} onDeleteFreightOffer={handleDeleteFreightOffer} onCreateShipment={handleCreateShipment} allShipments={shipments} riskQueryOptions={riskQueryOptions} realtimeStatus={realtimeStatus} lastSyncTime={lastSyncTime} onRefreshData={loadAllData} />} />
        </Routes>
      </React.Suspense>
    );
  };

  // Only show the full-screen loader if it's the initial load (no data yet) or checking auth
  if (isAuthChecking || isLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: '16px', background: '#f9fafb' }}>
        <div style={{ width: '48px', height: '48px', border: '4px solid #e5e7eb', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        <p style={{ color: '#6b7280', fontSize: '18px', fontWeight: 500 }}>Carregando Transcunha Logística...</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (location.pathname === '/baixar-app') {
    return (
      <React.Suspense fallback={<PageLoadingFallback />}>
        <DownloadAppPage companyLogo={companyLogo} />
      </React.Suspense>
    );
  }

  if (location.pathname === '/apresentacao' || location.pathname === '/apresentacao-comercial') {
    return (
      <React.Suspense fallback={<PageLoadingFallback />}>
        <CommercialPresentationPage 
          companyLogo={companyLogo} 
          currentUser={currentUser}
          onBackToApp={currentUser ? () => navigate('/') : undefined}
        />
      </React.Suspense>
    );
  }

  if (location.pathname === '/curso-embarcador' || location.pathname === '/curso') {
    return (
      <React.Suspense fallback={<PageLoadingFallback />}>
        <ShipperCoursePage 
          currentUser={currentUser} 
          onBackToApp={currentUser ? () => navigate('/') : undefined}
        />
      </React.Suspense>
    );
  }

  const isInstitutionalHost = typeof window !== 'undefined' && 
    (window.location.hostname.includes('transcunhaoficial.com.br') || window.location.hostname.includes('transcunhaoficial'));

  if (
    location.pathname === '/site' || 
    location.pathname === '/website' || 
    location.pathname === '/institucional' ||
    (isInstitutionalHost && (location.pathname === '/' || location.pathname === ''))
  ) {
    return (
      <React.Suspense fallback={<PageLoadingFallback />}>
        <InstitutionalWebsitePage 
          companyLogo={companyLogo} 
          isLoggedIn={!!currentUser}
          onGoToSystem={currentUser ? () => navigate('/') : () => navigate('/login')}
          onOpenPresentation={() => navigate('/apresentacao')}
        />
      </React.Suspense>
    );
  }

  if (!currentUser) {
    return (
      <React.Suspense fallback={<PageLoadingFallback />}>
        <LoginPage onLogin={handleLogin} users={visibleUsers} companyLogo={companyLogo} profilePermissions={profilePermissions} />
      </React.Suspense>
    );
  }

  if (currentUser.profile === UserProfile.Motorista) {
    return (
      <>
        <DriverPortal
          currentUser={currentUser}
          onLogout={handleLogout}
          cargos={activeLoads}
          shipments={visibleShipments}
          products={products}
          drivers={drivers}
          vehicles={vehicles}
          onRequestLoadOrder={handleRequestLoadOrder}
          onUpdateShipmentAttachment={handleUpdateShipmentAttachment}
          companyLogo={companyLogo}
        />
        <SelectEmbarcadorModal
          isOpen={isSelectEmbarcadorModalOpen}
          onClose={() => setIsSelectEmbarcadorModalOpen(false)}
          onConfirm={handleConfirmRequestOrder}
          users={visibleUsers}
          cargo={selectedCargoForRequest}
        />
        {currentUser?.requirePasswordChange && (
          <PasswordChangeModal 
            user={currentUser} 
            onPasswordChange={handlePasswordChange} 
            onCancel={handleLogout}
          />
        )}
      </>
    );
  }

  const operationalPages: Page[] = ['loads', 'shipments', 'shipment-history', 'load-history', 'operational-loads', 'operational-map', 'risk-management', 'risk-query-types', 'whatsapp'];
  const isOperationalPage = operationalPages.includes(currentPage);

  return (
    <div 
      className="relative flex flex-col h-screen h-[100dvh] max-h-[100dvh] bg-[#f8fafc] dark:bg-[#070c18] text-slate-800 dark:text-slate-100 overflow-hidden font-sans portal-theme-bg"
      style={{ '--theme-bg': themeImage ? `url("${themeImage.replace(/"/g, '\\"')}")` : 'none' } as React.CSSProperties}
    >
      {/* Background Grid Pattern & Ambient Lighting (Model identical to Login Page) */}
      {!themeImage && (
        <>
          <div 
            className="absolute inset-0 pointer-events-none z-0"
            style={{
              backgroundImage: `
                linear-gradient(to right, rgba(59, 130, 246, 0.05) 1px, transparent 1px),
                linear-gradient(to bottom, rgba(59, 130, 246, 0.05) 1px, transparent 1px)
              `,
              backgroundSize: '48px 48px'
            }}
          />
          {/* Soft Radial Ambient Lighting */}
          <div className="absolute top-0 left-1/4 w-[600px] h-[500px] bg-blue-600/10 rounded-full blur-[140px] pointer-events-none z-0" />
          <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-sky-500/10 rounded-full blur-[140px] pointer-events-none z-0" />
          <div className="absolute top-1/2 right-10 w-[350px] h-[350px] bg-indigo-500/10 rounded-full blur-[100px] pointer-events-none z-0" />
        </>
      )}

      <TopNavBar
        user={currentUser}
        onLogout={handleLogout}
        currentPage={currentPage}
        setCurrentPage={setCurrentPage}
        profilePermissions={profilePermissions}
        companyLogo={companyLogo}
        onOpenTickets={(initialCreate?: boolean) => {
          if (currentUser?.profile === UserProfile.Cliente) return;
          setTicketModalInitialCreate(!!initialCreate);
          setIsTicketModalOpen(true);
        }}
        tickets={tickets}
        shipments={shipments}
        freightOffers={freightOffers}
        cargos={cargos}
        drivers={drivers}
        clients={clients}
        products={products}
        vehicles={vehicles}
        users={visibleUsers}
        themeMode={themeMode}
        onThemeModeChange={handleThemeModeChange}
        onAcceptOrderRequest={handleAcceptOrderRequestFromNotification}
        onRefuseOrderRequest={handleRefuseOrderRequestFromNotification}
        onSaveFreightOffer={handleSaveFreightOffer}
        onOpenUpdates={() => {
          if (currentUser?.profile !== UserProfile.Cliente) {
            setIsUpdateModalOpen(true);
          }
        }}
      />
      <main className="relative z-10 flex-1 overflow-y-auto overscroll-contain" style={{ zoom: 0.72 }}>
        <div className="w-full px-4 sm:px-6 lg:px-8 pt-6 pb-36 sm:pb-12" style={{ paddingBottom: 'max(9rem, env(safe-area-inset-bottom, 0px) + 7rem)' }}>
            {renderPage()}
        </div>
      </main>
       <SelectEmbarcadorModal
         isOpen={isSelectEmbarcadorModalOpen}
         onClose={() => setIsSelectEmbarcadorModalOpen(false)}
         onConfirm={handleConfirmRequestOrder}
         users={visibleUsers}
         cargo={selectedCargoForRequest}
       />
       <TicketModal
        isOpen={isTicketModalOpen && currentUser?.profile !== UserProfile.Cliente}
        onClose={() => {
          setIsTicketModalOpen(false);
          setTicketModalInitialCreate(false);
        }}
        initialCreate={ticketModalInitialCreate}
        tickets={tickets}
        users={visibleUsers}
        currentUser={currentUser}
        onSave={handleSaveTicket}
        onUpdate={handleUpdateTicket}
        onDelete={handleDeleteTicket}
        cargos={cargos}
        shipments={shipments}
        onNavigateTo={(type, id) => {
          setIsTicketModalOpen(false);
          if (type === 'cargo') {
            const targetCargo = findCargoById(cargos, id) || cargos.find(c => c.id === id || String(c.sequenceId) === String(id) || `CRG-${c.sequenceId}` === id);
            if (targetCargo) {
              setSelectedCargoForDetails(targetCargo);
            } else {
              showToast('Carga vinculada não encontrada.', 'warning');
            }
            setCurrentPage('loads');
          }
          if (type === 'shipment') {
            const targetShipment = shipments.find(s => s.id === id || s.orderId === id);
            if (targetShipment) {
              setSelectedShipmentForDetails(targetShipment);
            } else {
              showToast('Embarque vinculado não encontrado.', 'warning');
            }
            setCurrentPage('shipments');
          }
        }}
      />
      {currentCargoForDetails && (
        <CargoDetailsModal
          isOpen={!!currentCargoForDetails}
          onClose={() => setSelectedCargoForDetails(null)}
          cargo={currentCargoForDetails}
          client={clients.find(c => c.id === currentCargoForDetails.clientId)}
          product={products.find(p => p.id === currentCargoForDetails.productId)}
          commercialUser={visibleUsers.find(u => u.id === currentCargoForDetails.createdById)}
          stays={stays}
          shipments={shipments}
          currentUser={currentUser || undefined}
        />
      )}
      {currentShipmentForDetails && (
        <ShipmentDetailsModal
          isOpen={!!currentShipmentForDetails}
          onClose={() => setSelectedShipmentForDetails(null)}
          shipment={currentShipmentForDetails}
          cargo={findCargoById(cargos, currentShipmentForDetails.cargoId) || undefined}
          currentUser={currentUser}
          onUpdatePrice={handleUpdateShipmentPrice}
          onUpdateShipmentData={handleUpdateShipmentData}
          onAddAttachments={handleAddShipmentAttachments}
          onSwapCargo={handleSwapCargo}
          cargos={cargos}
          clients={clients}
          products={products}
          companyLogo={companyLogo}
          vehicles={vehicles}
          users={visibleUsers}
          onDeleteAttachment={handleDeleteShipmentAttachment}
        />
      )}
      {offerForNewShipment && (
        <NewShipmentModal
          isOpen={!!offerForNewShipment}
          onClose={() => setOfferForNewShipment(null)}
          onSave={async (data) => {
            const history = [...(offerForNewShipment.history || []), {
              id: `log_${Date.now()}_sys`,
              userId: currentUser?.id || 'system',
              timestamp: new Date().toISOString(),
              description: `Solicitação de ordem aceita por ${currentUser?.name || 'Embarcador'}. Embarque criado com sucesso.`
            }];
            await handleSaveFreightOffer({ ...offerForNewShipment, status: FreightOfferStatus.Aceita, history });
            await handleCreateShipment({
              cargoId: offerForNewShipment.cargoId,
              ...data
            });
            setOfferForNewShipment(null);
          }}
          cargo={findCargoById(cargos, offerForNewShipment.cargoId) || null}
          drivers={drivers}
          clients={clients}
          vehicles={vehicles}
          currentUser={currentUser}
          shipments={shipments}
          users={visibleUsers}
          owners={owners}
          offer={offerForNewShipment}
        />
      )}
      {currentUser?.requirePasswordChange && (
        <PasswordChangeModal 
          user={currentUser} 
          onPasswordChange={handlePasswordChange} 
          onCancel={handleLogout}
        />
      )}
      <SystemUpdateModal 
        isOpen={isUpdateModalOpen && currentUser?.profile !== UserProfile.Cliente} 
        onClose={() => setIsUpdateModalOpen(false)} 
        currentUser={currentUser} 
      />

      {cargoSyncModalData && (
        <CargoSyncShipmentsModal
          isOpen={cargoSyncModalData.isOpen}
          onClose={() => setCargoSyncModalData(null)}
          oldCargo={cargoSyncModalData.oldCargo}
          newCargo={cargoSyncModalData.newCargo}
          changedFields={cargoSyncModalData.changedFields}
          linkedShipments={cargoSyncModalData.linkedShipments}
          onConfirmSync={handleConfirmSyncShipments}
          onSaveCargoOnly={handleSaveCargoOnlyFromSync}
        />
      )}


    </div>
  );
};

export default App;
