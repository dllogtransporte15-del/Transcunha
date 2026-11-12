import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import type { 
  User, Page, ProfilePermissions, CrudPermissions, Client, Owner, Driver, 
  Vehicle, Product, Cargo, Shipment, Branch, FreightOffer, RiskQueryOption, Ticket
} from '../types';
import { UserProfile, CargoStatus, ShipmentStatus } from '../types';
import { can, INITIAL_PERMISSIONS, isDeveloperUser, isDemoUser, isAdminUser, filterVisibleUsers } from '../auth';
import { 
  Eye, 
  Shield, 
  ShieldCheck, 
  X, 
  User as UserIcon, 
  Building2, 
  Phone, 
  Mail, 
  Lock, 
  Monitor, 
  RotateCcw, 
  Save, 
  Maximize2,
  Minimize2,
  Copy
} from 'lucide-react';

// Main Navigation & Pages Import
import TopNavBar from './TopNavBar';
import DashboardPage from '../pages/DashboardPage';
import ClientsPage from '../pages/ClientsPage';
import OwnersPage from '../pages/OwnersPage';
import DriversPage from '../pages/DriversPage';
import VehiclesPage from '../pages/VehiclesPage';
import LoadsPage from '../pages/LoadsPage';
import ProductsPage from '../pages/ProductsPage';
import ShipmentsPage from '../pages/ShipmentsPage';
import OperationalLoadsPage from '../pages/OperationalLoadsPage';
import OperationalMapPage from '../pages/OperationalMapPage';
import CommissionsPage from '../pages/CommissionsPage';
import ReportsPage from '../pages/ReportsPage';
import ShipmentHistoryPage from '../pages/ShipmentHistoryPage';
import LoadHistoryPage from '../pages/LoadHistoryPage';
import LayoverCalculatorPage from '../pages/LayoverCalculatorPage';
import FreightQuotePage from '../pages/FreightQuotePage';
import ToolsHistoryPage from '../pages/ToolsHistoryPage';
import FreightOffersHistoryPage from '../pages/FreightOffersHistoryPage';
import BranchesPage from '../pages/BranchesPage';
import SystemMonitorPage from '../pages/SystemMonitorPage';
import RiskManagementPage from '../pages/RiskManagementPage';
import RiskQueryTypesPage from '../pages/RiskQueryTypesPage';
import AppearancePage from '../pages/AppearancePage';
import LocationsPage from '../pages/LocationsPage';
import { getExpedidoresRecebedores } from '../utils/locationStorage';
import DriverPortal from './DriverPortal';
import { useToast } from '../hooks/useToast';

interface UserAccessViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetUser: User | null;
  currentUser: User;
  profilePermissions: ProfilePermissions;
  onSaveUserPermissions: (userId: string, customPermissions: { [key in Page]?: CrudPermissions }) => void;
  // Datasets for Live Simulation
  cargos?: Cargo[];
  shipments?: Shipment[];
  clients?: Client[];
  owners?: Owner[];
  drivers?: Driver[];
  vehicles?: Vehicle[];
  products?: Product[];
  branches?: Branch[];
  users?: User[];
  freightOffers?: FreightOffer[];
  stays?: any[];
  tickets?: Ticket[];
  riskQueryOptions?: RiskQueryOption[];
  companyLogo?: string | null;
}

const PAGE_NAMES: Record<Page, string> = {
  'dashboard': 'Dashboard',
  'clients': 'Clientes',
  'owners': 'Proprietários',
  'embarcadores': 'Embarcadores',
  'drivers': 'Motoristas',
  'vehicles': 'Veículos',
  'loads': 'Cargas (Cadastro)',
  'locations': 'Expedidor/Recebedor',
  'products': 'Produtos',
  'shipments': 'Embarques',
  'shipment-history': 'Histórico de Embarques',
  'load-history': 'Histórico de Cargas',
  'financial': 'Financeiro',
  'reports': 'Relatórios',
  'operational-loads': 'Cargas (Operacional)',
  'operational-map': 'Mapa Operacional',
  'users-register': 'Gerenciar Usuários',
  'corporate-email': 'E-mail Corporativo',
  'commissions': 'Comissões',
  'appearance': 'Aparência',
  'layover-calculator': 'Cálculo de Estadias',
  'freight-quote': 'Cotação de Frete',
  'atua-reconciliation': 'Auditoria Atua TMS',
  'ai-assistant': 'Assistente de IA',
  'tools-history': 'Histórico de Ferramentas',
  'freight-offers-history': 'Histórico de Ofertas',
  'branches': 'Filiais',
  'system-monitor': 'Monitoramento do Sistema',
  'risk-management': 'Gerenciadora de Risco',
  'risk-query-types': 'Tipos de Consulta GR',
  'whatsapp': 'WhatsApp',
  'messenger': 'Mensageiro',
  'apresentacao': 'Apresentação Comercial',
  'apresentacao-comercial': 'Apresentação Comercial (Completa)',
  'site': 'Website Institucional',
  'website': 'Website Institucional (transcunhaoficial.com.br)',
};

const CATEGORIES = [
  { name: 'Painel Principal', pages: ['dashboard'] as Page[] },
  { name: 'Operacional', pages: ['loads', 'shipments', 'operational-map', 'shipment-history', 'load-history', 'operational-loads', 'risk-management'] as Page[] },
  { name: 'Financeiro', pages: ['financial', 'commissions'] as Page[] },
  { name: 'Relatórios', pages: ['reports'] as Page[] },
  { name: 'Cadastros', pages: ['clients', 'owners', 'embarcadores', 'drivers', 'vehicles', 'locations', 'products', 'users-register', 'branches', 'risk-query-types'] as Page[] },
  { name: 'Configurações', pages: ['appearance'] as Page[] },
  { name: 'Ferramentas', pages: ['layover-calculator', 'freight-quote', 'atua-reconciliation', 'ai-assistant', 'freight-offers-history', 'tools-history', 'system-monitor', 'messenger'] as Page[] }
];

const READ_ONLY_PAGES = [
  'dashboard', 'reports', 'appearance', 'ai-assistant', 
  'operational-map', 'shipment-history', 'load-history', 
  'tools-history', 'freight-offers-history', 'system-monitor'
] as Page[];

const PERMISSION_NAMES: Record<keyof CrudPermissions, string> = {
  read: 'Acessar (Ler)',
  create: 'Criar',
  update: 'Editar',
  delete: 'Excluir',
};

const UserAccessViewerModal: React.FC<UserAccessViewerModalProps> = ({
  isOpen,
  onClose,
  targetUser,
  currentUser,
  profilePermissions,
  onSaveUserPermissions,
  cargos = [],
  shipments = [],
  clients = [],
  owners = [],
  drivers = [],
  vehicles = [],
  products = [],
  branches = [],
  users = [],
  freightOffers = [],
  stays = [],
  tickets = [],
  riskQueryOptions = [],
  companyLogo = null
}) => {
  const { showToast } = useToast();
  const [isPermissionsDrawerOpen, setIsPermissionsDrawerOpen] = useState(false);
  const [currentSimulatedPage, setCurrentSimulatedPage] = useState<Page>('dashboard');
  const [editableUserPermissions, setEditableUserPermissions] = useState<{ [key in Page]?: CrudPermissions }>({});
  const [hasCustomChanges, setHasCustomChanges] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);

  // Close with Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isPermissionsDrawerOpen) {
          setIsPermissionsDrawerOpen(false);
        } else if (isOpen) {
          onClose();
        }
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isPermissionsDrawerOpen, onClose]);

  // Initialize editable permissions when target user changes or modal opens
  useEffect(() => {
    if (isOpen && targetUser) {
      if (targetUser.customPermissions && Object.keys(targetUser.customPermissions).length > 0) {
        setEditableUserPermissions(JSON.parse(JSON.stringify(targetUser.customPermissions)));
      } else {
        const basePerms = profilePermissions[targetUser.profile] || INITIAL_PERMISSIONS[targetUser.profile] || {};
        setEditableUserPermissions(JSON.parse(JSON.stringify(basePerms)));
      }
      setHasCustomChanges(false);
      setIsPermissionsDrawerOpen(false);
      setCurrentSimulatedPage(targetUser.profile === UserProfile.Motorista ? 'operational-loads' : 'dashboard');
    }
  }, [isOpen, targetUser, profilePermissions]);

  // Construct temporary simulated user incorporating live permission adjustments
  const simulatedUser: User | null = useMemo(() => {
    if (!targetUser) return null;
    return {
      ...targetUser,
      customPermissions: editableUserPermissions
    };
  }, [targetUser, editableUserPermissions]);

  const simulatedVisibleUsers = useMemo(() => {
    return filterVisibleUsers(users, simulatedUser);
  }, [users, simulatedUser]);

  // Read-only filterings for simulated data matching App.tsx exactly
  const simulatedVisibleLoads = useMemo(() => {
    if (!simulatedUser) return [];
    return cargos.filter(c => {
      if (simulatedUser.profile === UserProfile.Cliente && simulatedUser.clientId) {
        return c.clientId === simulatedUser.clientId;
      }
      if (simulatedUser.branchId && (simulatedUser.profile === UserProfile.Comercial || simulatedUser.profile === UserProfile.Supervisor)) {
        return c.branchId === simulatedUser.branchId || !c.branchId;
      }
      return true;
    });
  }, [simulatedUser, cargos]);

  const simulatedVisibleShipments = useMemo(() => {
    if (!simulatedUser) return [];
    if (simulatedUser.profile === UserProfile.Motorista) {
      const driverCpfClean = (simulatedUser.email || '').replace(/\D/g, '');
      return shipments.filter(s => (s.driverCpf || '').replace(/\D/g, '') === driverCpfClean);
    }
    if (simulatedUser.profile === UserProfile.Embarcador || simulatedUser.profile === UserProfile.Agenciador) {
      return shipments.filter(s => s.embarcadorId === simulatedUser.id || s.createdById === simulatedUser.id || (simulatedUser.branchId && s.branchId === simulatedUser.branchId));
    }
    if (
      isDeveloperUser(simulatedUser) ||
      simulatedUser.profile === UserProfile.Desenvolvedor ||
      simulatedUser.profile === UserProfile.Admin ||
      simulatedUser.profile === UserProfile.GerenciadoraDeRisco ||
      (simulatedUser.profile as string) === 'Gerenciadora de Risco' ||
      simulatedUser.profile === UserProfile.Financeiro ||
      simulatedUser.profile === UserProfile.Demonstracao ||
      (simulatedUser.profile as string) === 'Demo' ||
      Boolean(simulatedUser.name && (simulatedUser.name.toLowerCase().includes('samanta') || simulatedUser.name.toLowerCase().includes('samantha'))) ||
      Boolean(simulatedUser.email && (simulatedUser.email.toLowerCase().includes('samanta') || simulatedUser.email.toLowerCase().includes('samantha')))
    ) {
      return shipments;
    }
    const visibleCargoIds = new Set(simulatedVisibleLoads.map(c => c.id));
    if (simulatedUser.profile === UserProfile.Cliente && simulatedUser.clientId) {
      return shipments.filter(s => visibleCargoIds.has(s.cargoId));
    }
    if (simulatedUser.branchId && ![UserProfile.Desenvolvedor, UserProfile.Admin, UserProfile.Diretor, UserProfile.Fiscal, UserProfile.Financeiro].includes(simulatedUser.profile as UserProfile)) {
      return shipments.filter(s => visibleCargoIds.has(s.cargoId) && (s.branchId === simulatedUser.branchId || !s.branchId));
    }
    return shipments.filter(s => visibleCargoIds.has(s.cargoId));
  }, [simulatedUser, shipments, simulatedVisibleLoads]);

  const simulatedInProgressLoads = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const filtered = simulatedVisibleLoads.filter(c => c.status === CargoStatus.EmAndamento && c.dailySchedule && c.dailySchedule.some(ds => ds.date >= today));
    if (simulatedUser?.profile === UserProfile.Motorista) {
      const driverCpfClean = (simulatedUser.email || '').replace(/\D/g, '');
      const activeShipmentCargoIds = new Set(
        shipments
          .filter(s => (s.driverCpf || '').replace(/\D/g, '') === driverCpfClean && s.status !== ShipmentStatus.Finalizado && s.status !== ShipmentStatus.Cancelado)
          .map(s => s.cargoId)
      );
      const filteredIds = new Set(filtered.map(c => c.id));
      const missingCargos = simulatedVisibleLoads.filter(c => activeShipmentCargoIds.has(c.id) && !filteredIds.has(c.id));
      return [...filtered, ...missingCargos];
    }
    return filtered;
  }, [simulatedVisibleLoads, simulatedUser, shipments]);

  const simulatedClosedLoads = useMemo(() => {
    return simulatedVisibleLoads.filter(c => c.status === CargoStatus.Fechada || c.status === CargoStatus.Suspensa);
  }, [simulatedVisibleLoads]);

  const simulatedVisibleEmbarcadores = useMemo(() => {
    if (!simulatedUser) return [];
    const allEmbarcadorUsers = simulatedVisibleUsers.filter(u => u.profile === UserProfile.Embarcador || u.profile === UserProfile.Agenciador);
    if (simulatedUser.profile === UserProfile.Embarcador || simulatedUser.profile === UserProfile.Agenciador) {
      return allEmbarcadorUsers.filter(u => u.id === simulatedUser.id);
    }
    return allEmbarcadorUsers;
  }, [simulatedUser, simulatedVisibleUsers]);

  // Read-only block notifications
  const handleReadOnlyActionAttempt = async (..._args: any[]): Promise<void> => {
    showToast(`Modo Somente Leitura: Ações de gravação ou edição estão desativadas no espelhamento do usuário.`, 'info');
  };

  const handleReadOnlySync = (..._args: any[]): void => {
    showToast(`Modo Somente Leitura: Ações de gravação ou edição estão desativadas no espelhamento do usuário.`, 'info');
  };

  // Permission matrix handlers
  const handleUserCheckboxChange = (page: Page, action: keyof CrudPermissions) => {
    setEditableUserPermissions(prev => {
      const newPermissions = { ...prev };
      const newPageState = { ...(newPermissions[page] || { read: false, create: false, update: false, delete: false }) };
      
      newPageState[action] = !newPageState[action];

      if (action === 'read' && !newPageState.read) {
        newPageState.create = false;
        newPageState.update = false;
        newPageState.delete = false;
      }
      
      if (action !== 'read' && newPageState[action]) {
        newPageState.read = true;
      }

      newPermissions[page] = newPageState;
      setHasCustomChanges(true);
      return newPermissions;
    });
  };

  const handleSelectAllCategory = (categoryPages: Page[], value: boolean) => {
    setEditableUserPermissions(prev => {
      const newPermissions = { ...prev };
      categoryPages.forEach(page => {
        const isReadOnly = READ_ONLY_PAGES.includes(page);
        newPermissions[page] = {
          read: value,
          create: isReadOnly ? false : value,
          update: isReadOnly ? false : value,
          delete: isReadOnly ? false : value
        };
      });
      setHasCustomChanges(true);
      return newPermissions;
    });
  };

  const handleResetToProfileDefaults = () => {
    if (!targetUser) return;
    const basePerms = profilePermissions[targetUser.profile] || INITIAL_PERMISSIONS[targetUser.profile] || {};
    setEditableUserPermissions(JSON.parse(JSON.stringify(basePerms)));
    setHasCustomChanges(true);
    showToast('Permissões restauradas para o padrão do perfil ' + targetUser.profile, 'info');
  };

  const handleSetAllReadOnly = () => {
    const updated: { [key in Page]?: CrudPermissions } = {};
    (Object.keys(PAGE_NAMES) as Page[]).forEach(page => {
      updated[page] = { read: true, create: false, update: false, delete: false };
    });
    setEditableUserPermissions(updated);
    setHasCustomChanges(true);
    showToast('Definido acesso de Leitura para todos os módulos.', 'info');
  };

  const handleMirrorUserPermissions = (sourceUserId: string) => {
    if (!sourceUserId) return;
    const sourceUser = users.find(u => u.id === sourceUserId);
    if (!sourceUser) return;

    if (sourceUser.customPermissions && Object.keys(sourceUser.customPermissions).length > 0) {
      setEditableUserPermissions(JSON.parse(JSON.stringify(sourceUser.customPermissions)));
    } else {
      const sourceProfilePerms = profilePermissions[sourceUser.profile] || INITIAL_PERMISSIONS[sourceUser.profile] || {};
      setEditableUserPermissions(JSON.parse(JSON.stringify(sourceProfilePerms)));
    }
    setHasCustomChanges(true);
    showToast(`Acessos espelhados de "${sourceUser.name}" (${sourceUser.profile}) com sucesso!`, 'success');
  };

  const handleSavePermissions = () => {
    if (!targetUser) return;
    onSaveUserPermissions(targetUser.id, editableUserPermissions);
    setHasCustomChanges(false);
    setIsPermissionsDrawerOpen(false);
    showToast(`Permissões de ${targetUser.name} salvas com sucesso!`, 'success');
  };

  if (!isOpen || !targetUser || !simulatedUser) return null;

  const operationalPages: Page[] = ['loads', 'shipments', 'shipment-history', 'load-history', 'operational-loads', 'operational-map', 'risk-management', 'risk-query-types'];
  const isOperationalPage = operationalPages.includes(currentSimulatedPage);

  const renderSimulatedPage = () => {
    if (!simulatedUser) return null;

    if (simulatedUser.profile === UserProfile.Motorista) {
      return (
        <DriverPortal
          currentUser={simulatedUser}
          onLogout={onClose}
          cargos={simulatedInProgressLoads}
          shipments={simulatedVisibleShipments}
          products={products}
          drivers={drivers}
          vehicles={vehicles}
          onRequestLoadOrder={handleReadOnlyActionAttempt}
          onUpdateShipmentAttachment={async () => handleReadOnlyActionAttempt()}
          companyLogo={companyLogo}
        />
      );
    }

    // Check if user has read permission for current page
    if (!can('read', simulatedUser, currentSimulatedPage, profilePermissions)) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[50vh] text-center p-8 bg-white dark:bg-slate-800/80 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <div className="w-16 h-16 rounded-full bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center mb-4">
            <Lock className="w-8 h-8" />
          </div>
          <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-2">Acesso Não Permitido</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mb-6">
            O usuário <strong>{simulatedUser.name}</strong> ({simulatedUser.profile}) não possui permissão para acessar o módulo <strong>{PAGE_NAMES[currentSimulatedPage] || currentSimulatedPage}</strong>.
          </p>
          <button
            type="button"
            onClick={() => setIsPermissionsDrawerOpen(true)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold shadow-md transition-all flex items-center gap-2"
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Liberar Acesso na Matriz de Permissões</span>
          </button>
        </div>
      );
    }

    switch (currentSimulatedPage) {
      case 'dashboard':
        return (
          <DashboardPage
            cargos={cargos}
            shipments={simulatedVisibleShipments}
            users={simulatedVisibleUsers}
            currentUser={simulatedUser}
            clients={clients}
            products={products}
            companyLogo={companyLogo}
            vehicles={vehicles}
            drivers={drivers}
            onDeleteAttachment={handleReadOnlyActionAttempt}
            onUpdateAttachment={handleReadOnlyActionAttempt}
            onUpdateShipmentData={handleReadOnlyActionAttempt}
            onAddAttachments={handleReadOnlyActionAttempt}
            onUpdateAnttAndBankDetails={handleReadOnlyActionAttempt}
            onUpdatePrice={handleReadOnlyActionAttempt}
            onSwapCargo={handleReadOnlyActionAttempt}
            freightOffers={freightOffers}
            onSaveFreightOffer={handleReadOnlyActionAttempt}
            onAcceptFreightOffer={handleReadOnlyActionAttempt}
            onConvertToCargo={handleReadOnlyActionAttempt}
            onCreateShipment={handleReadOnlyActionAttempt}
            allShipments={shipments}
            riskQueryOptions={riskQueryOptions}
          />
        );
      case 'clients':
        return (
          <ClientsPage
            clients={clients}
            setClients={() => {}}
            onSaveClient={handleReadOnlyActionAttempt}
            onDeleteClient={handleReadOnlyActionAttempt}
            onMergeClients={handleReadOnlyActionAttempt}
            currentUser={simulatedUser}
            profilePermissions={profilePermissions}
          />
        );
      case 'owners':
        return (
          <OwnersPage
            owners={owners}
            setOwners={() => {}}
            onSaveOwner={handleReadOnlyActionAttempt}
            currentUser={simulatedUser}
            profilePermissions={profilePermissions}
          />
        );
      case 'drivers':
        return (
          <DriversPage
            drivers={drivers}
            setDrivers={() => {}}
            onSaveDriver={handleReadOnlyActionAttempt}
            owners={owners}
            currentUser={simulatedUser}
            profilePermissions={profilePermissions}
            shipments={simulatedVisibleShipments}
            cargos={cargos}
          />
        );
      case 'vehicles':
        return (
          <VehiclesPage
            vehicles={vehicles}
            setVehicles={() => {}}
            onSaveVehicle={handleReadOnlyActionAttempt}
            owners={owners}
            currentUser={simulatedUser}
            profilePermissions={profilePermissions}
            shipments={simulatedVisibleShipments}
            cargos={cargos}
          />
        );
      case 'loads':
        return (
          <LoadsPage
            loads={simulatedVisibleLoads}
            setLoads={() => {}}
            clients={clients}
            products={products}
            onSaveLoad={handleReadOnlyActionAttempt}
            onBulkSaveLoads={handleReadOnlyActionAttempt}
            onReactivateLoad={handleReadOnlyActionAttempt}
            onSuspendLoad={handleReadOnlyActionAttempt}
            onUpdatePrice={handleReadOnlyActionAttempt}
            currentUser={simulatedUser}
            profilePermissions={profilePermissions}
            users={simulatedVisibleUsers}
            shipments={simulatedVisibleShipments}
            allShipments={shipments}
            onDeleteLoad={handleReadOnlyActionAttempt}
            onModalStateChange={() => {}}
            companyLogo={companyLogo}
            vehicles={vehicles}
            drivers={drivers}
            onDeleteAttachment={handleReadOnlyActionAttempt}
            branches={branches}
            stays={stays}
            tickets={tickets}
            offerToConvert={null}
            setOfferToConvert={() => {}}
            onCreateShipment={handleReadOnlyActionAttempt}
            onSwapCargo={handleReadOnlyActionAttempt}
          />
        );
      case 'locations':
        return (
          <LocationsPage
            locations={getExpedidoresRecebedores()}
            onSaveLocation={handleReadOnlyActionAttempt}
            onDeleteLocation={handleReadOnlyActionAttempt}
            currentUser={simulatedUser}
            profilePermissions={profilePermissions}
          />
        );
      case 'products':
        return (
          <ProductsPage
            products={products}
            onSaveProduct={handleReadOnlyActionAttempt}
            onDeleteProduct={handleReadOnlyActionAttempt}
            currentUser={simulatedUser}
            profilePermissions={profilePermissions}
          />
        );
      case 'shipments':
        return (
          <ShipmentsPage
            shipments={simulatedVisibleShipments}
            cargos={cargos}
            clients={clients}
            products={products}
            drivers={drivers}
            vehicles={vehicles}
            currentUser={simulatedUser}
            profilePermissions={profilePermissions}
            users={simulatedVisibleUsers}
            onUpdateAttachment={handleReadOnlyActionAttempt}
            onAddAttachments={handleReadOnlyActionAttempt}
            onUpdatePrice={handleReadOnlyActionAttempt}
            onConfirmCancel={handleReadOnlyActionAttempt}
            onUpdateAnttAndBankDetails={handleReadOnlyActionAttempt}
            onMarkArrival={handleReadOnlyActionAttempt}
            onTransferShipment={handleReadOnlyActionAttempt}
            onDeleteShipment={handleReadOnlyActionAttempt}
            onRevertStatus={handleReadOnlyActionAttempt}
            onUpdateScheduledDateTime={handleReadOnlyActionAttempt}
            onUpdateShipmentData={handleReadOnlyActionAttempt}
            onDeleteAttachment={handleReadOnlyActionAttempt}
            onSwapCargo={handleReadOnlyActionAttempt}
            activeLocks={[]}
            onModalStateChange={() => {}}
            companyLogo={companyLogo}
            stays={stays}
            tickets={tickets}
            riskQueryOptions={riskQueryOptions}
            onBatchUpdateShipments={handleReadOnlyActionAttempt}
          />
        );
      case 'operational-loads':
        return (
          <OperationalLoadsPage
            loads={simulatedInProgressLoads}
            clients={clients}
            products={products}
            drivers={drivers}
            vehicles={vehicles}
            onCreateShipment={handleReadOnlyActionAttempt}
            onSaveLoad={handleReadOnlyActionAttempt}
            onBulkSaveLoads={handleReadOnlyActionAttempt}
            onReactivateLoad={handleReadOnlyActionAttempt}
            onSuspendLoad={handleReadOnlyActionAttempt}
            currentUser={simulatedUser}
            profilePermissions={profilePermissions}
            shipments={simulatedVisibleShipments}
            allShipments={shipments}
            users={simulatedVisibleUsers}
            onDeleteLoad={handleReadOnlyActionAttempt}
            onUpdatePrice={handleReadOnlyActionAttempt}
            onUpdateShipmentData={handleReadOnlyActionAttempt}
            onRequestLoadOrder={handleReadOnlyActionAttempt}
            onModalStateChange={() => {}}
            onDeleteAttachment={handleReadOnlyActionAttempt}
            branches={branches}
            stays={stays}
            tickets={tickets}
            onUpdateAttachment={handleReadOnlyActionAttempt}
            onAddAttachments={handleReadOnlyActionAttempt}
            riskQueryOptions={riskQueryOptions}
            onSwapCargo={handleReadOnlyActionAttempt}
          />
        );
      case 'operational-map':
        return (
          <OperationalMapPage
            cargos={cargos}
            shipments={shipments}
            clients={clients}
            products={products}
            drivers={drivers}
            vehicles={vehicles}
            onCreateShipment={handleReadOnlyActionAttempt}
            currentUser={simulatedUser}
            users={simulatedVisibleUsers}
            onModalStateChange={() => {}}
            onDeleteAttachment={handleReadOnlyActionAttempt}
          />
        );
      case 'financial':
        return (
          <CommissionsPage
            shipments={simulatedVisibleShipments}
            cargos={cargos}
            users={simulatedVisibleUsers}
            stays={stays}
            clients={clients}
          />
        );
      case 'reports':
        return (
          <ReportsPage
            shipments={simulatedVisibleShipments}
            embarcadores={simulatedVisibleEmbarcadores}
            cargos={cargos}
            users={simulatedVisibleUsers}
            currentUser={simulatedUser}
            clients={clients}
            branches={branches}
            stays={stays}
            companyLogo={companyLogo}
            onSaveUser={handleReadOnlyActionAttempt}
            drivers={drivers}
            vehicles={vehicles}
            products={products}
            onUpdateAttachment={handleReadOnlyActionAttempt}
            onBatchUpdateShipments={handleReadOnlyActionAttempt}
            onUpdateShipmentData={handleReadOnlyActionAttempt}
          />
        );
      case 'shipment-history':
        return (
          <ShipmentHistoryPage
            shipments={simulatedVisibleShipments}
            cargos={cargos}
            drivers={drivers}
            users={simulatedVisibleUsers}
            currentUser={simulatedUser}
            clients={clients}
            products={products}
            vehicles={vehicles}
            onDeleteShipment={handleReadOnlyActionAttempt}
            onRevertStatus={handleReadOnlyActionAttempt}
            onDeleteAttachment={handleReadOnlyActionAttempt}
            onUpdatePrice={handleReadOnlyActionAttempt}
            onUpdateShipmentData={handleReadOnlyActionAttempt}
            onUpdateAttachment={handleReadOnlyActionAttempt}
            stays={stays}
            riskQueryOptions={riskQueryOptions}
            onCreateShipment={handleReadOnlyActionAttempt}
          />
        );
      case 'load-history':
        return (
          <LoadHistoryPage
            loads={simulatedClosedLoads}
            clients={clients}
            products={products}
            users={simulatedVisibleUsers}
            currentUser={simulatedUser}
            shipments={shipments}
            onDeleteLoad={handleReadOnlyActionAttempt}
            onReactivateLoad={handleReadOnlyActionAttempt}
          />
        );
      case 'layover-calculator':
        return (
          <LayoverCalculatorPage
            currentUser={simulatedUser}
            shipments={shipments}
            cargos={cargos}
            clients={clients}
          />
        );
      case 'freight-quote':
        return (
          <FreightQuotePage
            currentUser={simulatedUser}
            cargos={cargos}
          />
        );
      case 'tools-history':
        return (
          <ToolsHistoryPage
            currentUser={simulatedUser}
            shipments={shipments}
            cargos={cargos}
            clients={clients}
          />
        );
      case 'branches':
        return (
          <BranchesPage
            branches={branches}
            onSaveBranch={handleReadOnlyActionAttempt}
            onDeleteBranch={handleReadOnlyActionAttempt}
            currentUser={simulatedUser}
            profilePermissions={profilePermissions}
          />
        );
      case 'risk-management':
        return (
          <RiskManagementPage
            shipments={simulatedVisibleShipments}
            cargos={cargos}
            clients={clients}
            products={products}
            drivers={drivers}
            vehicles={vehicles}
            users={simulatedVisibleUsers}
            currentUser={simulatedUser}
            companyLogo={companyLogo}
            riskQueryOptions={riskQueryOptions}
            onSaveRiskQueryOption={handleReadOnlyActionAttempt}
            onDeleteRiskQueryOption={handleReadOnlyActionAttempt}
            onRestoreRiskQueryDefaults={handleReadOnlyActionAttempt}
            profilePermissions={profilePermissions}
            onUpdatePrice={handleReadOnlyActionAttempt}
            onUpdateShipmentData={handleReadOnlyActionAttempt}
            onAddAttachments={handleReadOnlyActionAttempt}
            onDeleteAttachment={handleReadOnlyActionAttempt}
            onModalStateChange={() => {}}
            onSwapCargo={handleReadOnlyActionAttempt}
          />
        );
      case 'risk-query-types':
        return (
          <RiskQueryTypesPage
            riskQueryOptions={riskQueryOptions}
            onSaveOption={handleReadOnlyActionAttempt}
            onDeleteOption={handleReadOnlyActionAttempt}
            onRestoreDefaults={handleReadOnlyActionAttempt}
            currentUser={simulatedUser}
            profilePermissions={profilePermissions}
          />
        );
      case 'freight-offers-history':
        return (
          <FreightOffersHistoryPage
            currentUser={simulatedUser}
            freightOffers={freightOffers}
            clients={clients}
            products={products}
            cargos={cargos}
            users={simulatedVisibleUsers}
            onSaveFreightOffer={handleReadOnlyActionAttempt}
            onDeleteFreightOffer={handleReadOnlyActionAttempt}
            onConvertToCargo={handleReadOnlyActionAttempt}
          />
        );
      case 'appearance':
        return (
          <AppearancePage
            currentLogo={companyLogo}
            onSaveLogo={handleReadOnlyActionAttempt}
            currentTheme={null}
            onSaveTheme={handleReadOnlyActionAttempt}
            themeMode={'dark'}
            onThemeModeChange={() => {}}
          />
        );
      case 'system-monitor':
        return (
          <SystemMonitorPage
            currentUser={simulatedUser}
            profilePermissions={profilePermissions}
            onSavePermissions={handleReadOnlyActionAttempt}
          />
        );
      default:
        return (
          <DashboardPage
            cargos={cargos}
            shipments={simulatedVisibleShipments}
            users={simulatedVisibleUsers}
            currentUser={simulatedUser}
            clients={clients}
            products={products}
            companyLogo={companyLogo}
            vehicles={vehicles}
            drivers={drivers}
            onDeleteAttachment={handleReadOnlyActionAttempt}
            onUpdateAttachment={handleReadOnlyActionAttempt}
            onUpdateShipmentData={handleReadOnlyActionAttempt}
            onAddAttachments={handleReadOnlyActionAttempt}
            onUpdateAnttAndBankDetails={handleReadOnlyActionAttempt}
            onUpdatePrice={handleReadOnlyActionAttempt}
            onSwapCargo={handleReadOnlyActionAttempt}
            freightOffers={freightOffers}
            onSaveFreightOffer={handleReadOnlyActionAttempt}
            onAcceptFreightOffer={handleReadOnlyActionAttempt}
            onConvertToCargo={handleReadOnlyActionAttempt}
            onCreateShipment={handleReadOnlyActionAttempt}
            allShipments={shipments}
            riskQueryOptions={riskQueryOptions}
          />
        );
    }
  };

  return createPortal(
    <div 
      className="fixed inset-0 z-[99999] flex items-center justify-center p-2 sm:p-4 md:p-6 bg-slate-950/80 backdrop-blur-md animate-fadeIn transition-all duration-300"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isPermissionsDrawerOpen) {
          onClose();
        }
      }}
    >
      {/* Sub-Window Container Overlaid on Top of Principal Screen */}
      <div 
        className={`relative flex flex-col transition-all duration-300 bg-[#f8fafc] dark:bg-[#070c18] border-2 border-blue-500/60 shadow-[0_25px_90px_rgba(0,0,0,0.95)] overflow-hidden font-sans portal-theme-bg ring-1 ring-white/20 ${
          isMaximized 
            ? 'w-full h-full rounded-none' 
            : 'w-[95vw] h-[92vh] max-w-[1680px] rounded-2xl'
        }`}
      >
        
        {/* Ambient Glow within the Sub-Window */}
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
        <div className="absolute top-0 left-1/4 w-[600px] h-[500px] bg-blue-600/10 rounded-full blur-[140px] pointer-events-none z-0" />
        <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-sky-500/10 rounded-full blur-[140px] pointer-events-none z-0" />

        {/* Sub-Window Top Header (Barra Superior de Controle da Sub-Janela) */}
        <header className="relative z-40 flex-shrink-0 px-4 sm:px-6 py-2.5 bg-slate-900 text-white border-b border-blue-500/40 shadow-xl backdrop-blur-md flex items-center justify-between gap-4 select-none">
          
          {/* OS Window Traffic Light Controls & User Identity */}
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-1.5 mr-2">
              <button
                type="button"
                onClick={onClose}
                className="w-3.5 h-3.5 rounded-full bg-rose-500 hover:bg-rose-600 transition-colors flex items-center justify-center group cursor-pointer"
                title="Fechar Sub-Janela (Esc)"
              >
                <X className="w-2.5 h-2.5 text-rose-950 opacity-0 group-hover:opacity-100" />
              </button>
              <button
                type="button"
                onClick={() => setIsMaximized(prev => !prev)}
                className="w-3.5 h-3.5 rounded-full bg-amber-500 hover:bg-amber-600 transition-colors flex items-center justify-center group cursor-pointer"
                title="Maximizar / Redimensionar Janela"
              >
                <span className="w-1.5 h-0.5 bg-amber-950 opacity-0 group-hover:opacity-100 rounded-full" />
              </button>
              <button
                type="button"
                onClick={() => setIsMaximized(prev => !prev)}
                className="w-3.5 h-3.5 rounded-full bg-emerald-500 hover:bg-emerald-600 transition-colors flex items-center justify-center group cursor-pointer"
                title="Alternar Tela Cheia"
              >
                <Maximize2 className="w-2 h-2 text-emerald-950 opacity-0 group-hover:opacity-100" />
              </button>
            </div>

            <div className="relative">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-600 to-sky-400 flex items-center justify-center text-white font-bold text-xs shadow-md border border-white/20">
                {targetUser.name.charAt(0).toUpperCase()}
              </div>
              <span className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-slate-900 ${targetUser.active ? 'bg-emerald-500' : 'bg-rose-500'}`} />
            </div>

            <div className="flex flex-col">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] text-blue-400 font-bold uppercase tracking-wider flex items-center gap-1">
                  <Monitor className="w-3 h-3" /> Sub-Janela de Espelhamento:
                </span>
                <span className="text-xs sm:text-sm font-bold text-white flex items-center gap-1.5">
                  {targetUser.name}
                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-blue-500/20 text-blue-300 border border-blue-500/40">
                    {targetUser.id}
                  </span>
                </span>
                <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-slate-800 text-slate-200 border border-slate-700">
                  {targetUser.profile}
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40">
                  <Lock className="w-2.5 h-2.5" /> Somente Leitura
                </span>
              </div>
            </div>
          </div>

          {/* Actions: Revisar Permissões & Sair */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsPermissionsDrawerOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold shadow-md transition-all active:scale-95 cursor-pointer border border-blue-400/40"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Revisar / Ajustar Permissões</span>
              {hasCustomChanges && (
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
              )}
            </button>

            <button
              type="button"
              onClick={() => setIsMaximized(prev => !prev)}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
              title={isMaximized ? "Restaurar tamanho de janela" : "Maximizar janela"}
            >
              {isMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>

            <button
              type="button"
              onClick={onClose}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white border border-rose-500/40 rounded-xl text-xs font-semibold transition-all shadow-sm cursor-pointer active:scale-95"
              title="Fechar sub-janela e retornar à tela principal"
            >
              <X className="w-3.5 h-3.5" />
              <span>Fechar</span>
            </button>
          </div>
        </header>

        {/* Read-Only Banner / Status Notice */}
        <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-1.5 flex items-center justify-between text-xs text-amber-300 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Lock className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
            <span>
              <strong>Modo de Espelhamento Ativo:</strong> Visualizando exatamente como <strong>{targetUser.name}</strong> ({targetUser.profile}) acessa o sistema. Todas as ações de criação, edição e exclusão estão protegidas em modo somente leitura.
            </span>
          </div>
          <span className="hidden md:inline-block text-[10px] text-amber-400/80 uppercase font-mono tracking-wider">Janela Sobreposta</span>
        </div>

        {/* User's Exact TopNav & Simulated Page inside the Sub-Window */}
        <div className="relative z-10 flex-1 flex flex-col min-h-0 overflow-hidden">
          {simulatedUser.profile !== UserProfile.Motorista && (
            <TopNavBar
              user={simulatedUser}
              onLogout={onClose}
              currentPage={currentSimulatedPage}
              setCurrentPage={(page) => setCurrentSimulatedPage(page)}
              profilePermissions={profilePermissions}
              companyLogo={companyLogo}
              onOpenTickets={handleReadOnlyActionAttempt}
              tickets={tickets}
              shipments={simulatedVisibleShipments}
              freightOffers={freightOffers}
              cargos={simulatedVisibleLoads}
              drivers={drivers}
              clients={clients}
              products={products}
              vehicles={vehicles}
              users={simulatedVisibleUsers}
              themeMode={document.documentElement.classList.contains('dark') ? 'dark' : 'light'}
              onThemeModeChange={(mode) => {
                if (mode === 'dark') {
                  document.documentElement.classList.add('dark');
                } else {
                  document.documentElement.classList.remove('dark');
                }
              }}
              onAcceptOrderRequest={handleReadOnlyActionAttempt}
              onRefuseOrderRequest={handleReadOnlyActionAttempt}
              onSaveFreightOffer={handleReadOnlyActionAttempt}
              onOpenUpdates={() => {}}
            />
          )}

          <main className="relative z-10 flex-1 overflow-y-auto" style={{ zoom: 0.72 }}>
            <div className={isOperationalPage ? "px-6 py-8" : "container mx-auto px-6 py-8"}>
              {renderSimulatedPage()}
            </div>
          </main>
        </div>

        {/* Permissions Revision Modal inside Sub-Window */}
        {isPermissionsDrawerOpen && (
          <div className="fixed inset-0 z-[100000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
            <div className="relative flex flex-col w-full max-w-5xl h-[90vh] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
              
              {/* Modal Header */}
              <div className="flex-shrink-0 px-6 py-4 bg-slate-900 text-white border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-600/30 text-blue-400 border border-blue-500/40 flex items-center justify-center">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white">Revisar & Ajustar Permissões de {targetUser.name}</h3>
                    <p className="text-xs text-slate-400">Perfil: <strong className="text-slate-200">{targetUser.profile}</strong> • As alterações afetam a simulação e entram em vigor após salvar.</p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setIsPermissionsDrawerOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg transition-colors hover:bg-slate-800 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Quick Actions Bar */}
              <div className="flex-shrink-0 px-6 py-3 bg-slate-50 dark:bg-slate-850 border-b border-slate-200 dark:border-slate-750 flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs text-slate-600 dark:text-slate-400">
                  Selecione as permissões de cada módulo para personalizar o acesso deste usuário.
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {/* Espelhar de Outro Usuário */}
                  <div className="flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 dark:bg-blue-950/40 rounded-lg border border-blue-200 dark:border-blue-800">
                    <span className="text-xs text-blue-900 dark:text-blue-200 font-bold flex items-center gap-1">
                      <Copy className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                      Espelhar de:
                    </span>
                    <select
                      onChange={(e) => {
                        handleMirrorUserPermissions(e.target.value);
                        e.target.value = '';
                      }}
                      className="px-2 py-0.5 text-xs border border-blue-300 dark:border-blue-700 rounded bg-white dark:bg-slate-800 text-gray-800 dark:text-gray-200 cursor-pointer"
                      defaultValue=""
                    >
                      <option value="" disabled>Selecione um usuário...</option>
                      {filterVisibleUsers(users, currentUser)
                        .filter(u => u.id !== targetUser.id && !isDeveloperUser(u) && (isAdminUser(currentUser) || !isDemoUser(u)))
                        .map(u => (
                          <option key={u.id} value={u.id}>
                            {u.name} ({u.profile})
                          </option>
                        ))
                      }
                    </select>
                  </div>

                  <button
                    type="button"
                    onClick={handleResetToProfileDefaults}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-700 bg-slate-200/80 hover:bg-slate-300 dark:bg-slate-750 dark:text-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
                    <span>Restaurar Padrão do Perfil</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleSetAllReadOnly}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-700 bg-slate-200/80 hover:bg-slate-300 dark:bg-slate-750 dark:text-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5 text-blue-500" />
                    <span>Liberar Leitura Geral</span>
                  </button>
                </div>
              </div>

              {/* Permissions Matrix */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {CATEGORIES.map(category => (
                  <div key={category.name} className="bg-white dark:bg-slate-850 rounded-xl shadow-sm border border-slate-200 dark:border-slate-750 overflow-hidden">
                    
                    <div className="bg-slate-100 dark:bg-slate-800 px-4 py-3 flex justify-between items-center border-b border-slate-200 dark:border-slate-750">
                      <h4 className="font-bold text-slate-800 dark:text-slate-100 text-sm">
                        {category.name}
                      </h4>
                      <div className="space-x-3 text-xs">
                        <button 
                          type="button"
                          onClick={() => handleSelectAllCategory(category.pages, true)} 
                          className="text-blue-600 hover:text-blue-700 dark:text-blue-400 font-medium cursor-pointer"
                        >
                          Marcar Todos
                        </button>
                        <span className="text-slate-300 dark:text-slate-600">|</span>
                        <button 
                          type="button"
                          onClick={() => handleSelectAllCategory(category.pages, false)} 
                          className="text-slate-500 hover:text-slate-700 dark:text-slate-400 font-medium cursor-pointer"
                        >
                          Desmarcar Todos
                        </button>
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-750">
                        <thead className="bg-slate-50/50 dark:bg-slate-800/50">
                          <tr>
                            <th scope="col" className="px-6 py-2.5 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 tracking-wider w-2/5">
                              Página / Módulo
                            </th>
                            {(Object.keys(PERMISSION_NAMES) as (keyof CrudPermissions)[]).map(action => (
                              <th key={action} scope="col" className="px-4 py-2.5 text-center text-xs font-semibold text-slate-500 dark:text-slate-400 tracking-wider">
                                {PERMISSION_NAMES[action]}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-slate-700 bg-white dark:bg-slate-800">
                          {category.pages.map(page => {
                            const isReadOnly = READ_ONLY_PAGES.includes(page);
                            const pageName = PAGE_NAMES[page] || page;
                            const pagePerms = editableUserPermissions[page] || { read: false, create: false, update: false, delete: false };

                            return (
                              <tr key={page} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/60 transition-colors">
                                <td className="px-6 py-3 text-sm font-medium text-slate-900 dark:text-slate-200 flex items-center gap-2">
                                  <span>{pageName}</span>
                                  {isReadOnly && (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300">
                                      Somente Leitura
                                    </span>
                                  )}
                                </td>

                                {(Object.keys(PERMISSION_NAMES) as (keyof CrudPermissions)[]).map(action => (
                                  <td key={action} className="px-4 py-3 text-center">
                                    {(isReadOnly && action !== 'read') ? (
                                      <span className="text-slate-300 dark:text-slate-600 text-xs">-</span>
                                    ) : (
                                      <input
                                        type="checkbox"
                                        className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 dark:bg-slate-700 dark:border-slate-600 cursor-pointer"
                                        checked={Boolean(pagePerms[action])}
                                        onChange={() => handleUserCheckboxChange(page, action)}
                                      />
                                    )}
                                  </td>
                                ))}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>

              {/* Modal Footer */}
              <div className="flex-shrink-0 px-6 py-4 bg-white dark:bg-slate-850 border-t border-slate-200 dark:border-slate-750 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsPermissionsDrawerOpen(false)}
                  className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-xl text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-750 transition-colors cursor-pointer"
                >
                  Cancelar
                </button>

                <button
                  type="button"
                  onClick={handleSavePermissions}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold shadow-md transition-all flex items-center gap-2 active:scale-95 cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>Salvar Permissões do Usuário</span>
                </button>
              </div>

            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};

export default UserAccessViewerModal;
