
import React, { useState } from 'react';
import Header from '../components/Header';
import LoadTable from '../components/LoadTable';
import LoadFormModal from '../components/LoadFormModal';
import HistoryModal from '../components/HistoryModal';
import CargoDetailsModal from '../components/CargoDetailsModal';
import CargoShipmentsSidePanel from '../components/CargoShipmentsSidePanel';
import NewShipmentModal from '../components/NewShipmentModal';
import BulkCargoImportModal from '../components/BulkCargoImportModal';
import type { Cargo, Client, Product, Driver, User, ProfilePermissions, Shipment, DailyScheduleEntry, Vehicle, Branch, Owner, ExpedidorRecebedor } from '../types';
import { CargoStatus, UserProfile } from '../types';
import { can, isDemoUser } from '../auth';
import { createDemoTestCargo } from '../utils/demoSandbox';
import { StayRecord } from '../utils/toolStorage';
import type { Ticket, FreightOffer } from '../types';

interface LoadsPageProps {
  loads: Cargo[];
  setLoads: React.Dispatch<React.SetStateAction<Cargo[]>>;
  clients: Client[];
  products: Product[];
  drivers: Driver[];
  owners?: Owner[];
  shipments: Shipment[];
  allShipments: Shipment[];
  vehicles: Vehicle[];
  locations?: ExpedidorRecebedor[];
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
  companyLogo?: string | null;
  onDeleteAttachment?: (shipmentId: string, url: string) => Promise<void>;
  branches: Branch[];
  stays?: StayRecord[];
  tickets?: Ticket[];
  offerToConvert?: FreightOffer | null;
  setOfferToConvert?: (offer: FreightOffer | null) => void;
  onCreateShipment?: (data: any) => Promise<void>;
  onSwapCargo?: (shipmentId: string, newCargoId: string) => void;
}

const LoadsPage: React.FC<LoadsPageProps> = ({ loads, setLoads, clients, products, shipments, allShipments, onSaveLoad, onBulkSaveLoads, onReactivateLoad, onSuspendLoad, onUpdatePrice, currentUser, profilePermissions, users, onDeleteLoad, onModalStateChange, companyLogo, vehicles, drivers, owners = [], onDeleteAttachment, branches, stays = [], tickets = [], offerToConvert, setOfferToConvert, onCreateShipment, onSwapCargo, locations }) => {

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isBulkImportModalOpen, setIsBulkImportModalOpen] = useState(false);
  const [loadToEdit, setLoadToEdit] = useState<Cargo | null>(null);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [selectedLoadForHistory, setSelectedLoadForHistory] = useState<Cargo | null>(null);
  const [dailyBalanceDate, setDailyBalanceDate] = useState(new Date().toISOString().split('T')[0]);
  const [initialModalStep, setInitialModalStep] = useState(1);
  const [detailsModalCargo, setDetailsModalCargo] = useState<Cargo | null>(null);
  const [isShipmentsPanelOpen, setIsShipmentsPanelOpen] = useState(false);
  const [selectedCargoForShipments, setSelectedCargoForShipments] = useState<Cargo | null>(null);
  const [isNewShipmentModalOpen, setIsNewShipmentModalOpen] = useState(false);
  const [selectedCargoForShipment, setSelectedCargoForShipment] = useState<Cargo | null>(null);

  React.useEffect(() => {
    const isAnyOpen = isModalOpen || isBulkImportModalOpen || isHistoryModalOpen || !!detailsModalCargo || isShipmentsPanelOpen || isNewShipmentModalOpen;
    onModalStateChange(isAnyOpen);
  }, [isModalOpen, isBulkImportModalOpen, isHistoryModalOpen, detailsModalCargo, isShipmentsPanelOpen, isNewShipmentModalOpen, onModalStateChange]);

  React.useEffect(() => {
    if (offerToConvert) {
      if (offerToConvert.cargoId && offerToConvert.driverId) {
        // Driver request - open NewShipmentModal
        const cargo = loads.find(c => c.id === offerToConvert.cargoId);
        if (cargo) {
           setSelectedCargoForShipment(cargo);
           setIsNewShipmentModalOpen(true);
        }
      } else {
        // Client request - open LoadFormModal
        setLoadToEdit(null);
        setInitialModalStep(1);
        setIsModalOpen(true);
      }
    }
  }, [offerToConvert, loads]);

  const handleCloseNewShipmentModal = () => {
    setIsNewShipmentModalOpen(false);
    setSelectedCargoForShipment(null);
    if (setOfferToConvert) setOfferToConvert(null);
  };

  const handleSaveShipment = async (shipmentData: any) => {
    const cargoId = selectedCargoForShipment?.id || shipmentData.cargoId;
    if (cargoId && onCreateShipment) {
      await onCreateShipment({
        ...shipmentData,
        cargoId,
      });
    }
  };

  const handleShowDetails = (cargo: Cargo) => {
    setDetailsModalCargo(cargo);
  };

  const handleShowShipments = (cargo: Cargo) => {
    setSelectedCargoForShipments(cargo);
    setIsShipmentsPanelOpen(true);
  };

  const isDemo = isDemoUser(currentUser);
  const canCreate = !isDemo && can('create', currentUser, 'loads', profilePermissions);
  const canUpdate = !isDemo && can('update', currentUser, 'loads', profilePermissions);
  const canDelete = !isDemo && can('delete', currentUser, 'loads', profilePermissions);

  const handleOpenModal = () => {
    setLoadToEdit(null);
    setInitialModalStep(1);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    if (setOfferToConvert) setOfferToConvert(null);
  };

  const handleEditLoad = (load: Cargo) => {
    setLoadToEdit(load);
    setInitialModalStep(1);
    setIsModalOpen(true);
  };
  
  // FIX: Changed Omit to use a union type for the keys to be omitted.
  const handleSaveLoad = (load: Cargo | Omit<Cargo, 'id' | 'history' | 'createdAt' | 'createdById'>) => {
    onSaveLoad(load);
    handleCloseModal();
  };

  const handleCloseLoad = (cargoToClose: Cargo) => {
    if (window.confirm(`Tem certeza que deseja fechar a carga ${cargoToClose.id}? Essa ação mudará o status para "Fechada".`)) {
        onSaveLoad({ ...cargoToClose, status: CargoStatus.Fechada });
    }
  };

  const handleShowHistory = (load: Cargo) => {
    setSelectedLoadForHistory(load);
    setIsHistoryModalOpen(true);
  };

  const handleEditSchedule = (load: Cargo) => {
    setLoadToEdit(load);
    setInitialModalStep(2); // Step 2 is the scheduling timeline
    setIsModalOpen(true);
  };

  return (
    <>
      <Header title="Cadastro de Cargas">
        <div className="flex items-center gap-2">
          {isDemo && (
            <button
              onClick={() => onSaveLoad(createDemoTestCargo(clients, products, branches, currentUser))}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-lg shadow-md hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-500 transition-all flex items-center gap-2 text-sm cursor-pointer"
              title="Cria automaticamente uma carga fictícia para testar embarques no perfil Demonstração"
            >
              ⚡ Criar Carga Teste
            </button>
          )}
          {canCreate && (
            <>
              <button
                onClick={() => setIsBulkImportModalOpen(true)}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg shadow-md hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 transition-all flex items-center gap-2 text-sm"
              >
                📦 Importar em Lote
              </button>
              <button
                onClick={handleOpenModal}
                className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary text-sm font-medium"
              >
                Adicionar Carga
              </button>
            </>
          )}
        </div>
      </Header>
      
      <div className="mt-6">
        <LoadTable 
            loads={loads} 
            clients={clients} 
            products={products}
            shipments={allShipments}
            dailyBalanceDate={dailyBalanceDate}
            onDailyBalanceDateChange={setDailyBalanceDate}
            onEdit={!isDemo && canUpdate ? handleEditLoad : undefined}
            onClose={!isDemo && (canDelete || currentUser.profile === UserProfile.Supervisor) ? handleCloseLoad : undefined}
            onShowHistory={handleShowHistory}
            onReactivate={!isDemo && (currentUser.profile !== UserProfile.Embarcador && currentUser.profile !== UserProfile.Motorista) ? onReactivateLoad : undefined}
            onSuspend={!isDemo && (currentUser.profile !== UserProfile.Embarcador && currentUser.profile !== UserProfile.Motorista) ? onSuspendLoad : undefined}
            onEditSchedule={!isDemo && canUpdate ? handleEditSchedule : undefined}
            onShowDetails={handleShowDetails}
            onShowShipments={handleShowShipments}
            onDelete={!isDemo ? onDeleteLoad : undefined}
            currentUser={currentUser}
            stays={stays}
            tickets={tickets}
            onSaveLoad={!isDemo ? handleSaveLoad : undefined}
        />
      </div>


      <LoadFormModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        onSave={handleSaveLoad}
        loadToEdit={loadToEdit}
        clients={clients}
        products={products}
        currentUser={currentUser}
        users={users}
        loads={loads}
        branches={branches}
        locations={locations}
        initialStep={initialModalStep}
        offerToConvert={offerToConvert}
      />

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

      {selectedLoadForHistory && (
          <HistoryModal
            isOpen={isHistoryModalOpen}
            onClose={() => setIsHistoryModalOpen(false)}
            history={selectedLoadForHistory.history}
            users={users}
            title={`Histórico da Carga ${selectedLoadForHistory.id}`}
          />
      )}

      <CargoDetailsModal
        isOpen={!!detailsModalCargo}
        onClose={() => setDetailsModalCargo(null)}
        cargo={detailsModalCargo}
        client={detailsModalCargo ? clients.find(c => c.id === detailsModalCargo.clientId) : undefined}
        product={detailsModalCargo ? products.find(p => p.id === detailsModalCargo.productId) : undefined}
        commercialUser={users.find(u => u.id === detailsModalCargo?.createdById)}
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
        companyLogo={companyLogo}
        vehicles={vehicles}
        onDeleteAttachment={onDeleteAttachment}
        onSwapCargo={onSwapCargo}
        cargos={loads}
      />

      <NewShipmentModal
        isOpen={isNewShipmentModalOpen}
        onClose={handleCloseNewShipmentModal}
        onSave={handleSaveShipment}
        cargo={selectedCargoForShipment}
        drivers={drivers}
        owners={owners}
        clients={clients}
        vehicles={vehicles}
        currentUser={currentUser}
        shipments={shipments}
        users={users}
        offer={offerToConvert}
      />
    </>
  );
};

export default LoadsPage;
