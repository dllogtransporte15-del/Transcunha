
import React, { useState, useCallback } from 'react';
import Header from '../components/Header';
import LoadTable from '../components/LoadTable';
import NewShipmentModal from '../components/NewShipmentModal';
import LoadFormModal from '../components/LoadFormModal';
import HistoryModal from '../components/HistoryModal';
import CargoDetailsModal from '../components/CargoDetailsModal';
import CargoShipmentsSidePanel from '../components/CargoShipmentsSidePanel';
import RecommendedDriversModal from '../components/RecommendedDriversModal';
import AttachmentModal from '../components/AttachmentModal';
import BulkCargoImportModal from '../components/BulkCargoImportModal';
import { REQUIRED_DOCUMENT_MAP } from '../types';
import type { Cargo, Client, Product, Driver, Shipment, Vehicle, User, ProfilePermissions, VehicleSetType, VehicleBodyType, Branch, RiskQueryOption, Owner } from '../types';
import { can, isDemoUser } from '../auth';
import { CopyIcon } from '../components/icons/CopyIcon';
import { CargoStatus, UserProfile, ShipmentStatus, FreightCalculationType } from '../types';
import ShipmentTable from '../components/ShipmentTable';
import { StayRecord } from '../utils/toolStorage';
import { formatFretebrasVehicleTypes } from '../utils/formatters';
import { findCargoById, findProductForCargo, checkRequiresRiskManagement } from '../utils';
import type { Ticket } from '../types';

interface OperationalLoadsPageProps {
  loads: Cargo[];
  clients: Client[];
  products: Product[];
  drivers: Driver[];
  owners?: Owner[];
  vehicles: Vehicle[];
  shipments: Shipment[];
  allShipments: Shipment[];
  onCreateShipment: (data: any) => void;
  onSaveLoad: (loadData: Cargo | Omit<Cargo, 'id' | 'history' | 'createdAt' | 'createdById'>) => void;
  onBulkSaveLoads?: (cargos: Omit<Cargo, 'id'>[]) => Promise<void>;
  currentUser: User;
  profilePermissions: ProfilePermissions;
  users: User[];
  onDeleteLoad: (cargoId: string) => void;
  onReactivateLoad?: (cargo: Cargo) => void;
  onSuspendLoad?: (cargo: Cargo) => void;
  onUpdatePrice: (shipmentId: string, data: { newTotal: number, newRate?: number, newCompanyRate?: number }) => void;
  onModalStateChange: (isOpen: boolean) => void;
  onDeleteAttachment?: (shipmentId: string, url: string) => Promise<void>;
  branches: Branch[];
  stays?: StayRecord[];
  tickets?: Ticket[];
  onRequestLoadOrder?: (cargo: Cargo) => void;
  onUpdateAttachment?: (shipmentId: string, data: { 
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
    realProfitData?: any,
    codigoAtua?: string,
  }) => Promise<void>;
  onAddAttachments?: (shipmentId: string, files: File[]) => Promise<void>;
  onUpdateShipmentData?: (shipmentId: string, data: Partial<Shipment>, options?: { silent?: boolean }) => void;
  riskQueryOptions?: RiskQueryOption[];
  onSwapCargo?: (shipmentId: string, newCargoId: string) => void;
}

const formatAllowedVehicleTypes = (allowed?: { setType: VehicleSetType; bodyTypes: VehicleBodyType[] }[]): string => {
    if (!allowed || allowed.length === 0) return 'N/A';
    const allBodyTypes = allowed.flatMap(type => type.bodyTypes);
    const uniqueBodyTypes = [...new Set(allBodyTypes)];
    return uniqueBodyTypes.join(', ');
};

const formatAllowedSetTypes = (allowed?: { setType: VehicleSetType; bodyTypes: VehicleBodyType[] }[]): string => {
    if (!allowed || allowed.length === 0) return '';
    const allSetTypes = allowed.map(type => type.setType);
    const uniqueSetTypes = [...new Set(allSetTypes)];
    return uniqueSetTypes.join(', ');
};

const OperationalLoadsPage: React.FC<OperationalLoadsPageProps> = ({
  loads,
  clients,
  products,
  drivers,
  owners = [],
  vehicles,
  shipments,
  allShipments,
  onCreateShipment,
  onSaveLoad,
  onBulkSaveLoads,
  currentUser,
  profilePermissions,
  users,
  onDeleteLoad,
  onReactivateLoad,
  onSuspendLoad,
  onUpdatePrice,
  onUpdateShipmentData,
  onModalStateChange,
  onDeleteAttachment,
  branches,
  stays = [],
  tickets = [],
  onRequestLoadOrder,
  onUpdateAttachment,
  onAddAttachments,
  riskQueryOptions,
  onSwapCargo
}) => {
  const [isShipmentModalOpen, setIsShipmentModalOpen] = useState(false);
  const [isBulkImportModalOpen, setIsBulkImportModalOpen] = useState(false);
  const [selectedCargo, setSelectedCargo] = useState<Cargo | null>(null);
  const [copyButtonText, setCopyButtonText] = useState('Divulgar Cargas');
  const [fretebrasButtonText, setFretebrasButtonText] = useState('Prompt Fretebras');
  const [dailyBalanceDate, setDailyBalanceDate] = useState(new Date().toISOString().split('T')[0]);
  const isDemo = isDemoUser(currentUser);
  const canCreateShipment = !isDemo && can('create', currentUser, 'shipments', profilePermissions);
  const canUpdateLoad = !isDemo && can('update', currentUser, 'loads', profilePermissions);

  const handleEditLoad = (load: Cargo) => {
    setLoadToEdit(load);
    setInitialModalStep(1);
    setIsLoadFormModalOpen(true);
  };
  const [displayedLoads, setDisplayedLoads] = useState<Cargo[]>([]);

  const operationalLoads = React.useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    return loads.filter(load => {
      // Regra para perfil Motorista: exibir estritamente as cargas cujo status/etapa seja "Cargas em Operação" (CargoStatus.EmAndamento)
      if (currentUser.profile === UserProfile.Motorista) {
        if (load.status !== CargoStatus.EmAndamento) {
          return false;
        }
      } else {
        // Oculta cargas suspensas ou fechadas para os demais perfis
        if (load.status === CargoStatus.Suspensa || load.status === CargoStatus.Fechada) {
          return false;
        }
      }
      // Oculta cargas sem programação ativa a partir de hoje
      const hasActiveSchedule = Array.isArray(load.dailySchedule) && load.dailySchedule.some(ds => ds.date >= today);
      if (!hasActiveSchedule) {
        return false;
      }
      return true;
    });
  }, [loads, currentUser.profile]);

  const handleFilteredLoadsChange = useCallback((filteredLoads: Cargo[]) => {
    setDisplayedLoads(filteredLoads);
  }, []);

  const [isLoadFormModalOpen, setIsLoadFormModalOpen] = useState(false);
  const [loadToEdit, setLoadToEdit] = useState<Cargo | null>(null);
  const [initialModalStep, setInitialModalStep] = useState(1);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [selectedLoadForHistory, setSelectedLoadForHistory] = useState<Cargo | null>(null);
  const [detailsModalCargo, setDetailsModalCargo] = useState<Cargo | null>(null);
  const [isShipmentsPanelOpen, setIsShipmentsPanelOpen] = useState(false);
  const [selectedCargoForShipments, setSelectedCargoForShipments] = useState<Cargo | null>(null);
  const [isRecommendedDriversModalOpen, setIsRecommendedDriversModalOpen] = useState(false);
  const [selectedCargoForRecommendations, setSelectedCargoForRecommendations] = useState<Cargo | null>(null);

  const [isAttachmentModalOpen, setAttachmentModalOpen] = useState(false);
  const [selectedShipment, setSelectedShipment] = useState<Shipment | null>(null);

  React.useEffect(() => {
    if (selectedShipment) {
      const updated = allShipments.find(s => s.id === selectedShipment.id);
      if (updated && JSON.stringify(updated) !== JSON.stringify(selectedShipment)) {
        setSelectedShipment(updated);
      }
    }
  }, [allShipments, selectedShipment]);

  const handleOpenAttachmentModal = (shipment: Shipment) => {
    setSelectedShipment(shipment);
    setAttachmentModalOpen(true);
  };

  const handleCloseAttachmentModal = () => {
    setAttachmentModalOpen(false);
    setSelectedShipment(null);
  };

  const handleSaveAttachment = async (data: any) => {
    if (!selectedShipment || !onUpdateAttachment) return;
    try {
      await onUpdateAttachment(selectedShipment.id, data);
      handleCloseAttachmentModal();
    } catch (err) {
      console.error('Error in handleSaveAttachment:', err);
      throw err;
    }
  };

  React.useEffect(() => {
    const isAnyOpen = isShipmentModalOpen || isBulkImportModalOpen || isLoadFormModalOpen || isHistoryModalOpen || !!detailsModalCargo || isShipmentsPanelOpen || isRecommendedDriversModalOpen || isAttachmentModalOpen;
    onModalStateChange(isAnyOpen);
  }, [isShipmentModalOpen, isBulkImportModalOpen, isLoadFormModalOpen, isHistoryModalOpen, detailsModalCargo, isShipmentsPanelOpen, isRecommendedDriversModalOpen, isAttachmentModalOpen, onModalStateChange]);

  const handleShowCargoDetails = (cargo: Cargo) => {
    setDetailsModalCargo(cargo);
  };

  const handleShowShipments = (cargo: Cargo) => {
    setSelectedCargoForShipments(cargo);
    setIsShipmentsPanelOpen(true);
  };

  const handleOpenRecommendations = (cargo: Cargo) => {
    setSelectedCargoForRecommendations(cargo);
    setIsRecommendedDriversModalOpen(true);
  };

  const handleOpenNewShipmentModal = (cargo: Cargo) => {
    setSelectedCargo(cargo);
    setIsShipmentModalOpen(true);
  };

  const handleCloseShipmentModal = () => {
    setIsShipmentModalOpen(false);
    setSelectedCargo(null);
  };

  const handleCloseLoadFormModal = () => {
    setIsLoadFormModalOpen(false);
    setLoadToEdit(null);
  };

  const handleShowHistory = (load: Cargo) => {
    setSelectedLoadForHistory(load);
    setIsHistoryModalOpen(true);
  };

  const handleSaveAndCloseModal = (load: Cargo | Omit<Cargo, 'id' | 'history' | 'createdAt' | 'createdById'>) => {
    onSaveLoad(load);
    handleCloseLoadFormModal();
  };

  const handleSaveShipment = async (shipmentData: any) => {
    const cargoId = selectedCargo?.id || shipmentData.cargoId;
    if (cargoId && onCreateShipment) {
      await onCreateShipment({
        ...shipmentData,
        cargoId,
      });
    }
  };
  
  const handleShareLoads = () => {
    const loadsToShare = displayedLoads.filter(load => load.status === CargoStatus.EmAndamento);
    if (loadsToShare.length === 0) {
      alert('Nenhuma carga em andamento para divulgar.');
      return;
    }

    const header = '🌐 *LIBERADOS TRANSCUNHA* 🌐\n';

    const loadsText = loadsToShare.map(load => {
      const product = products.find(p => p.id === load.productId)?.name?.toUpperCase() || 'N/A';
      const origin = load.origin.toUpperCase();
      const destination = load.destination.toUpperCase();
      
      const isFixed = load.freightCalculationType === FreightCalculationType.FixedTotal;
      const freightLegs = (load.freightLegs && load.freightLegs.length > 0) ? load.freightLegs : null;

      // Cálculo e formatação do Frete Motorista PJ
      const pjValue = isFixed
        ? (load.driverFreightTotalFixedPj || (freightLegs ? freightLegs.reduce((sum, l) => sum + (l.driverFreightTotalFixedPj || 0), 0) : 0) || load.driverFreightValuePerTon || 0)
        : (freightLegs ? freightLegs.reduce((sum, l) => sum + (Number(l.driverFreightValuePerTon) || 0), 0) : (Number(load.driverFreightValuePerTon) || 0));

      const hasPjToll = load.driverFreightHasToll || freightLegs?.some(l => l.driverFreightHasToll);
      const pjTollText = hasPjToll ? ' + Ped' : '';
      const pjPrice = pjValue > 0
        ? `R$ ${pjValue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${pjTollText}`
        : 'A combinar';

      // Cálculo e formatação do Frete Motorista PF
      const isPfDisabled = freightLegs ? freightLegs.every(l => l.disablePfFreight) : Boolean((load as any).disablePfFreight);
      const loadPfDirect = (load as any).driverFreightValuePerTonPf;
      const pfValue = isFixed
        ? (load.driverFreightTotalFixedPf || (freightLegs ? freightLegs.reduce((sum, l) => sum + (l.driverFreightTotalFixedPf || 0), 0) : 0) || load.driverFreightValuePerTon || 0)
        : (freightLegs
            ? freightLegs.reduce((sum, l) => {
                if (l.disablePfFreight) return sum;
                return sum + (Number(l.driverFreightValuePerTonPf ?? l.driverFreightValuePerTon) || 0);
              }, 0)
            : (Number(loadPfDirect ?? load.driverFreightValuePerTon) || 0));

      const hasPfToll = load.driverFreightPfHasToll || freightLegs?.some(l => l.driverFreightPfHasToll);
      const pfTollText = hasPfToll ? ' + Ped' : '';
      const pfPrice = isPfDisabled
        ? 'A combinar'
        : pfValue > 0
        ? `R$ ${pfValue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${pfTollText}`
        : 'A combinar';

      const bodyTypes = formatAllowedVehicleTypes(load.allowedVehicleTypes);

      let text = `📍 ${origin} x ${destination} \n🌾 ${product} - \n💲 ${pjPrice} PJ - ${pfPrice} PF \n🚛 ${bodyTypes} 🚛`;
      
      if (load.originMapLink) {
        text += `\n📍Coleta - ${load.originMapLink}`;
      }
      if (load.destinationMapLink) {
        text += `\n📍Entrega - ${load.destinationMapLink}`;
      }
      return text;
    }).join('\n\n');

    const textToCopy = header + '\n' + loadsText;

    navigator.clipboard.writeText(textToCopy).then(() => {
      setCopyButtonText('Copiado!');
      setTimeout(() => setCopyButtonText('Divulgar Cargas'), 3000);
    }, (err) => {
      console.error('Falha ao copiar: ', err);
      alert('Não foi possível copiar as cargas. Verifique as permissões do navegador.');
    });
  };

  const handleShareFretebras = () => {
    const loadsToShare = displayedLoads.filter(load => load.status === CargoStatus.EmAndamento);
    if (loadsToShare.length === 0) {
      alert('Nenhuma carga em andamento para divulgar.');
      return;
    }

    const loadsText = loadsToShare.map(load => {
      const product = products.find(p => p.id === load.productId)?.name || '';
      const origin = load.origin;
      const destination = load.destination;
      const hasToll = load.driverFreightHasToll || load.freightLegs?.some(l => l.driverFreightHasToll);
      const tollText = hasToll ? ' + Ped' : '';
      const price = (load.driverFreightValuePerTon && load.driverFreightValuePerTon > 0)
        ? `R$ ${load.driverFreightValuePerTon.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${tollText}`
        : 'A combinar';
      
      const allowed = load.allowedVehicleTypes || [];
      const vehicleTypes = formatFretebrasVehicleTypes(load.allowedVehicleTypes);
      const bodyTypes = allowed.length > 0
        ? [...new Set(allowed.flatMap(t => t.bodyTypes))].join(', ')
        : '';
      const rastreada = load.requiresTracker ? 'Sim' : 'Não';

      return [
        `ORIGEM: ${origin}`,
        `DESTINO: ${destination}`,
        `PRODUTO: ${product}`,
        `VALOR: ${price}`,
        `VEÍCULO: ${vehicleTypes}`,
        `CARROCERIA: ${bodyTypes}`,
        `RASTREADA: ${rastreada}`,
        `LONA: Sim`,
        `FORMA DE PAGAMENTO: Pix, Cartão`,
        `OBSERVAÇÕES:`,
      ].join('\n');
    }).join('\n\n---\n\n');

    navigator.clipboard.writeText(loadsText).then(() => {
      setFretebrasButtonText('Copiado!');
      setTimeout(() => setFretebrasButtonText('Prompt Fretebras'), 3000);
    }, (err) => {
      console.error('Falha ao copiar: ', err);
      alert('Não foi possível copiar as cargas. Verifique as permissões do navegador.');
    });
  };

  const driverActiveShipments = currentUser.profile === UserProfile.Motorista
    ? (() => {
        const driverCpfClean = (currentUser.email || '').replace(/\D/g, '');
        return allShipments.filter(s =>
          (s.driverCpf || '').replace(/\D/g, '') === driverCpfClean &&
          s.status !== ShipmentStatus.Finalizado &&
          s.status !== ShipmentStatus.Cancelado
        );
      })()
    : [];

  return (
    <>
      <Header title="Cargas em Operação">
        {currentUser.profile !== UserProfile.Cliente && currentUser.profile !== UserProfile.Motorista && (
          <div className="flex items-center gap-2">
            {!isDemo && can('create', currentUser, 'loads', profilePermissions) && (
              <button
                onClick={() => setIsBulkImportModalOpen(true)}
                className="flex items-center px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-bold focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 shadow-sm transition-all text-sm"
              >
                📦 Importar em Lote
              </button>
            )}
            <button
              onClick={handleShareLoads}
              className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition-all duration-200"
            >
              <CopyIcon className="w-5 h-5 mr-2" />
              {copyButtonText}
            </button>
            <button
              onClick={handleShareFretebras}
              className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-all duration-200"
            >
              <CopyIcon className="w-5 h-5 mr-2" />
              {fretebrasButtonText}
            </button>
          </div>
        )}
      </Header>
      
      {currentUser.profile === UserProfile.Motorista && driverActiveShipments.length > 0 && (
        <div className="mb-8">
          <h2 className="text-2xl font-semibold text-primary dark:text-blue-400 mb-4 border-b-2 border-primary pb-2">Meu Embarque em Andamento</h2>
          <ShipmentTable
            shipments={driverActiveShipments}
            cargos={loads}
            drivers={drivers}
            clients={clients}
            users={users}
            vehicles={vehicles}
            products={products}
            currentUser={currentUser}
            onShowCargoDetails={handleShowCargoDetails}
            onAttach={!isDemo ? handleOpenAttachmentModal : undefined}
            onUpdateShipmentData={!isDemo ? onUpdateShipmentData : undefined}
            stays={stays}
            activeStatus="all"
          />
        </div>
      )}

      <h2 className="text-2xl font-semibold text-gray-800 dark:text-white mb-4">Oportunidades de Carga</h2>
      <LoadTable 
        loads={operationalLoads} 
        clients={clients} 
        products={products}
        shipments={allShipments}
        dailyBalanceDate={dailyBalanceDate}
        onDailyBalanceDateChange={setDailyBalanceDate}
        onCreateShipment={!isDemo && canCreateShipment ? handleOpenNewShipmentModal : undefined} 
        onEdit={!isDemo && canUpdateLoad ? handleEditLoad : undefined}
        onShowHistory={handleShowHistory}
        onReactivate={!isDemo && (currentUser.profile !== UserProfile.Embarcador && currentUser.profile !== UserProfile.Motorista) ? onReactivateLoad : undefined}
        onSuspend={!isDemo && (currentUser.profile !== UserProfile.Embarcador && currentUser.profile !== UserProfile.Motorista) ? onSuspendLoad : undefined}
        onShowDetails={handleShowCargoDetails}
        onShowShipments={handleShowShipments}
        onRecommendDrivers={handleOpenRecommendations}
        onDelete={!isDemo ? onDeleteLoad : undefined}
        currentUser={currentUser}
        stays={stays}
        tickets={tickets}
        onRequestLoadOrder={!isDemo ? onRequestLoadOrder : undefined}
        onFilteredLoadsChange={handleFilteredLoadsChange}
        onSaveLoad={!isDemo ? onSaveLoad : undefined}
      />

      <NewShipmentModal
        isOpen={isShipmentModalOpen}
        onClose={handleCloseShipmentModal}
        onSave={handleSaveShipment}
        cargo={selectedCargo}
        drivers={drivers}
        owners={owners}
        clients={clients}
        vehicles={vehicles}
        currentUser={currentUser}
        shipments={shipments}
        users={users}
      />

      <LoadFormModal
        isOpen={isLoadFormModalOpen}
        onClose={handleCloseLoadFormModal}
        onSave={handleSaveAndCloseModal}
        loadToEdit={loadToEdit}
        clients={clients}
        products={products}
        currentUser={currentUser}
        users={users}
        loads={loads}
        branches={branches}
        initialStep={initialModalStep}
      />
      
      {selectedLoadForHistory && (
          <HistoryModal
            isOpen={isHistoryModalOpen}
            onClose={() => setIsHistoryModalOpen(false)}
            history={selectedLoadForHistory.history}
            users={users}
            title={`Histórico da Carga ${selectedLoadForHistory.sequenceId}`}
          />
      )}

      <CargoDetailsModal
        isOpen={!!detailsModalCargo}
        onClose={() => setDetailsModalCargo(null)}
        cargo={detailsModalCargo}
        client={detailsModalCargo ? clients.find(c => c.id === detailsModalCargo.clientId) : undefined}
        product={detailsModalCargo ? products.find(p => p.id === detailsModalCargo.productId) : undefined}
        commercialUser={detailsModalCargo ? users.find(u => u.id === detailsModalCargo.createdById) : undefined}
        stays={stays}
        shipments={shipments}
        currentUser={currentUser}
      />

      <CargoShipmentsSidePanel
        isOpen={isShipmentsPanelOpen}
        onClose={() => setIsShipmentsPanelOpen(false)}
        cargo={selectedCargoForShipments}
        shipments={shipments}
        users={users}
        currentUser={currentUser}
        onUpdatePrice={onUpdatePrice}
        clients={clients}
        products={products}
        vehicles={vehicles}
        onDeleteAttachment={onDeleteAttachment}
        onSwapCargo={onSwapCargo}
        cargos={loads}
      />

      <RecommendedDriversModal
        isOpen={isRecommendedDriversModalOpen}
        onClose={() => {
          setIsRecommendedDriversModalOpen(false);
          setSelectedCargoForRecommendations(null);
        }}
        currentCargo={selectedCargoForRecommendations}
        drivers={drivers}
        shipments={allShipments}
        cargos={loads}
      />
      {selectedShipment && (
        <AttachmentModal
          isOpen={isAttachmentModalOpen}
          onClose={handleCloseAttachmentModal}
          onSave={handleSaveAttachment}
          shipment={allShipments.find(s => s.id === selectedShipment.id) || selectedShipment}
          documentName={REQUIRED_DOCUMENT_MAP[selectedShipment.status] || 'Documento'}
          currentUser={currentUser}
          cargo={findCargoById(loads, selectedShipment.cargoId)}
          requiresRiskManagement={
            checkRequiresRiskManagement(
              findCargoById(loads, selectedShipment.cargoId),
              findProductForCargo(products, findCargoById(loads, selectedShipment.cargoId))
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

      <BulkCargoImportModal
        isOpen={isBulkImportModalOpen}
        onClose={() => setIsBulkImportModalOpen(false)}
        clients={clients}
        products={products}
        currentUserId={currentUser?.id || ''}
        onBulkSave={onBulkSaveLoads || (async (cargosList) => {
          for (const c of cargosList) {
            onSaveLoad(c);
          }
        })}
      />

    </>
  );
};

export default OperationalLoadsPage;
