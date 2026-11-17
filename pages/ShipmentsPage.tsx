
import React, { useState, useMemo, useEffect, useRef } from 'react';
import Header from '../components/Header';
import ShipmentTable from '../components/ShipmentTable';
import ShipmentStatusFilter from '../components/ShipmentStatusFilter';
import AttachmentModal from '../components/AttachmentModal';
import EditPriceModal from '../components/EditPriceModal';
import CancelShipmentModal from '../components/CancelShipmentModal';
import HistoryModal from '../components/HistoryModal';
import CadastroAnttModal from '../components/CadastroAnttModal';
import CargoDetailsModal from '../components/CargoDetailsModal';
import TransferShipmentModal from '../components/TransferShipmentModal';
import EditScheduledDateTimeModal from '../components/EditScheduledDateTimeModal';
import SwapCargoModal from '../components/SwapCargoModal';
import type { Shipment, Cargo, Client, Driver, User, ProfilePermissions, Product, Vehicle, ShipmentLock, RiskQueryOption } from '../types';

import { ShipmentStatus, UserProfile, REQUIRED_DOCUMENT_MAP } from '../types';
import { can, isDemoUser, isDeveloperUser } from '../auth';
import { FileText, X } from 'lucide-react';
import { getShipmentCte, isCteApplicableForStatus, findCargoById, findProductForCargo, checkRequiresRiskManagement } from '../utils';
import { StayRecord } from '../utils/toolStorage';
import type { Ticket } from '../types';

interface ShipmentsPageProps {
  shipments: Shipment[];
  cargos: Cargo[];
  clients: Client[];
  products: Product[];
  drivers: Driver[];
  vehicles: Vehicle[];
  currentUser: User;
  profilePermissions: ProfilePermissions;
  users: User[];
  onUpdateAttachment: (shipmentId: string, data: { 
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
  onUpdatePrice: (shipmentId: string, data: { newTotal: number, newRate?: number, newCompanyRate?: number }) => void;
  onConfirmCancel: (shipmentId: string, reason: string) => void;
  onUpdateAnttAndBankDetails: (shipmentId: string, data: { anttOwnerIdentifier: string; bankDetails?: string }) => void;
  onTransferShipment: (shipmentId: string, newEmbarcadorId: string) => void;
  onMarkArrival: (shipmentId: string) => void;
  onDeleteShipment: (shipmentId: string) => void;
  onRevertStatus: (shipmentId: string) => void;
  onUpdateScheduledDateTime: (shipmentId: string, data: { scheduledDate: string, scheduledTime?: string }) => void;
  onUpdateShipmentData: (shipmentId: string, data: Partial<Shipment>, options?: { silent?: boolean }) => void;
  activeLocks: ShipmentLock[];
  onModalStateChange: (isOpen: boolean) => void;
  companyLogo?: string | null;
  onDeleteAttachment?: (shipmentId: string, url: string) => Promise<void>;
  onSwapCargo: (shipmentId: string, newCargoId: string) => void;
  stays?: StayRecord[];
  tickets?: Ticket[];
  riskQueryOptions?: RiskQueryOption[];
  onBatchUpdateShipments?: (updatedShipments: Shipment[]) => Promise<void> | void;
  onCreateShipment?: (data: any) => Promise<void> | void;
}


// Removed local requiredDocumentMap as it is now in types.ts (REQUIRED_DOCUMENT_MAP)


const ShipmentsPage: React.FC<ShipmentsPageProps> = ({ 
  shipments, cargos, clients, products, drivers, vehicles, currentUser, 
  profilePermissions, users, onUpdateAttachment, onAddAttachments, onUpdatePrice, onConfirmCancel, 
  onUpdateAnttAndBankDetails, onTransferShipment, onMarkArrival, onDeleteShipment,
  onRevertStatus, onUpdateScheduledDateTime, onUpdateShipmentData, activeLocks, onModalStateChange,
  companyLogo, onDeleteAttachment, onSwapCargo, stays = [], tickets = [], riskQueryOptions,
  onBatchUpdateShipments, onCreateShipment
}) => {

  const [activeStatus, setActiveStatus] = useState<ShipmentStatus | 'all'>(ShipmentStatus.PreCadastro);
  const [isAttachmentModalOpen, setAttachmentModalOpen] = useState(false);
  const [isEditPriceModalOpen, setEditPriceModalOpen] = useState(false);
  const [isCancelModalOpen, setCancelModalOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [isCadastroAnttModalOpen, setCadastroAnttModalOpen] = useState(false);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [isEditScheduledDateTimeModalOpen, setEditScheduledDateTimeModalOpen] = useState(false);
  const [isSwapCargoModalOpen, setSwapCargoModalOpen] = useState(false);
  const [selectedShipment, setSelectedShipment] = useState<Shipment | null>(null);

  const [detailsModalCargo, setDetailsModalCargo] = useState<Cargo | null>(null);

  // Sync selected shipment with latest data from props
  useEffect(() => {
    if (selectedShipment) {
      const updated = shipments.find(s => s.id === selectedShipment.id);
      if (updated && JSON.stringify(updated) !== JSON.stringify(selectedShipment)) {
        setSelectedShipment(updated);
      }
    }
  }, [shipments, selectedShipment]);

  useEffect(() => {
    // Locking heartbeat and beforeunload logic removed per user request
  }, []);

  useEffect(() => {
    const isAnyOpen = isAttachmentModalOpen || isEditPriceModalOpen || isCancelModalOpen || 
                      isHistoryModalOpen || isCadastroAnttModalOpen || isTransferModalOpen || 
                      isEditScheduledDateTimeModalOpen || isSwapCargoModalOpen || !!detailsModalCargo;
    onModalStateChange(isAnyOpen);
  }, [isAttachmentModalOpen, isEditPriceModalOpen, isCancelModalOpen, isHistoryModalOpen, 
      isCadastroAnttModalOpen, isTransferModalOpen, isEditScheduledDateTimeModalOpen, isSwapCargoModalOpen, detailsModalCargo, onModalStateChange]);



  const isDemo = isDemoUser(currentUser);
  const canUpdate = !isDemo && can('update', currentUser, 'shipments', profilePermissions);
  const canDelete = !isDemo && can('delete', currentUser, 'shipments', profilePermissions);

  const isGerenciadora = currentUser?.profile === UserProfile.GerenciadoraDeRisco ||
    (currentUser?.profile as string) === 'Gerenciadora de Risco' ||
    Boolean(currentUser?.name && (currentUser.name.toLowerCase().includes('samanta') || currentUser.name.toLowerCase().includes('samantha'))) ||
    Boolean(currentUser?.email && (currentUser.email.toLowerCase().includes('samanta') || currentUser.email.toLowerCase().includes('samantha')));

  const allowedProfilesForActions = [UserProfile.Desenvolvedor, UserProfile.Comercial, UserProfile.Supervisor, UserProfile.Admin, UserProfile.Diretor, UserProfile.Fiscal, UserProfile.GerenciadoraDeRisco];
  const canPerformSpecialActions = !isDemo && currentUser && (isDeveloperUser(currentUser) || allowedProfilesForActions.includes(currentUser.profile) || isGerenciadora);
  
  const isOperationalPriceEditor = currentUser?.profile ? [UserProfile.Embarcador, UserProfile.Agenciador, UserProfile.Comercial].includes(currentUser.profile) : false;
  const canEditPrice = !isDemo && currentUser && (isDeveloperUser(currentUser) || currentUser.profile === UserProfile.Desenvolvedor || currentUser.profile === UserProfile.Admin || isGerenciadora || (currentUser.profile as string) === 'Administrador do Sistema' || isOperationalPriceEditor);
  const canCancelShipment = canPerformSpecialActions && (canDelete || currentUser.profile === UserProfile.Fiscal || currentUser.profile === UserProfile.Supervisor);
  const canTransferShipment = (canUpdate || currentUser.profile === UserProfile.Supervisor) && canPerformSpecialActions;
  const isClient = currentUser.profile === UserProfile.Cliente;
  const isFinanceiro = currentUser.profile === UserProfile.Financeiro;

  const [filterCte, setFilterCte] = useState('');
  const [filterNfe, setFilterNfe] = useState('');
  const [filterMdfe, setFilterMdfe] = useState('');

  const filteredShipments = useMemo(() => {
    let result: Shipment[];
    if (activeStatus === 'all') {
      result = shipments.filter(s =>
        s.status !== ShipmentStatus.Cancelado &&
        s.status !== ShipmentStatus.Finalizado
      );
    } else {
      result = shipments.filter(shipment => shipment.status === activeStatus);
    }
    if (filterCte.trim()) {
      const q = filterCte.trim().toLowerCase();
      const cleanQ = q.replace(/\\D/g, '');
      result = result.filter(s => {
        const cte = getShipmentCte(s).toLowerCase();
        const baseMatch = (cte !== '-' && cte.includes(q)) || (isCteApplicableForStatus(s.status) && !!s.cteNumber && s.cteNumber.toLowerCase().includes(q));
        if (baseMatch) return true;
        const subCtes = (s.subCtes || (s.documents as any)?.sub_ctes || []) as any[];
        if (subCtes.some(sc => String(sc?.cteNumber || '').toLowerCase().includes(q) || (cleanQ && String(sc?.cteNumber || '').replace(/\\D/g, '').includes(cleanQ)))) return true;
        if (s.cteNumber) {
          const parts = s.cteNumber.split(/[\\/,;\\s]+/);
          if (parts.some(p => p.toLowerCase().includes(q) || (cleanQ && p.replace(/\\D/g, '').includes(cleanQ)))) return true;
        }
        return false;
      });
    }
    return result;
  }, [shipments, activeStatus, filterCte]);
  
  const handleOpenAttachmentModal = async (shipment: Shipment) => {
    // Locking logic removed per user request
    setSelectedShipment(shipment);
    setAttachmentModalOpen(true);
  };
  
  const handleOpenCadastroAnttModal = (shipment: Shipment) => {
    setSelectedShipment(shipment);
    setCadastroAnttModalOpen(true);
  };

  const handleCloseAttachmentModal = () => {
    // Locking logic removed per user request
    setAttachmentModalOpen(false);
    setSelectedShipment(null);
  };

  const handleSaveAttachment = async (data: any) => {
    if (!selectedShipment) return;
    
    try {
      await onUpdateAttachment(selectedShipment.id, data);
      handleCloseAttachmentModal();
    } catch (err) {
      console.error('Error in handleSaveAttachment:', err);
      throw err;
    }
  };
  
  const handleSaveAnttData = (data: { anttOwnerIdentifier: string; bankDetails?: string }) => {
    if (!selectedShipment) return;
    onUpdateAnttAndBankDetails(selectedShipment.id, data);
    setCadastroAnttModalOpen(false);
    setSelectedShipment(null);
  };

  const handleEditPrice = (shipment: Shipment) => {
    setSelectedShipment(shipment);
    setEditPriceModalOpen(true);
  };

  const handleCancelShipment = (shipment: Shipment) => {
    setSelectedShipment(shipment);
    setCancelModalOpen(true);
  };
  
  const handleOpenTransferModal = (shipment: Shipment) => {
    setSelectedShipment(shipment);
    setIsTransferModalOpen(true);
  };

  const handleSavePrice = (data: { newTotal: number, newRate?: number, newCompanyRate?: number }) => {
    if (!selectedShipment || !canEditPrice) return;
    onUpdatePrice(selectedShipment.id, data);
    setEditPriceModalOpen(false);
    setSelectedShipment(null);
  };

  const handleConfirmCancel = (reason: string) => {
    if (!selectedShipment) return;
    onConfirmCancel(selectedShipment.id, reason);
    setCancelModalOpen(false);
    setSelectedShipment(null);
  };
  
  const handleSaveTransfer = (newEmbarcadorId: string) => {
    if (selectedShipment) {
      onTransferShipment(selectedShipment.id, newEmbarcadorId);
    }
    setIsTransferModalOpen(false);
    setSelectedShipment(null);
  };

  const handleShowHistory = (shipment: Shipment) => {
    setSelectedShipment(shipment);
    setIsHistoryModalOpen(true);
  };

  const handleShowCargoDetails = (cargo: Cargo) => {
    setDetailsModalCargo(cargo);
  };

  const handleOpenSwapCargoModal = (shipment: Shipment) => {
    setSelectedShipment(shipment);
    setSwapCargoModalOpen(true);
  };

  const handleSwapCargo = (shipmentId: string, newCargoId: string) => {
    onSwapCargo(shipmentId, newCargoId);
    setSwapCargoModalOpen(false);
    setSelectedShipment(null);
  };

  const canUserAdvanceStatus = (shipment: Shipment): { allowed: boolean; reason: string } => {
    const defaultResponse = { allowed: true, reason: '' };
    if (!currentUser) return { allowed: false, reason: 'Usuário não autenticado.' };

    if (isDemoUser(currentUser)) {
      return { allowed: false, reason: 'Usuário em modo demonstração possui acesso apenas de visualização.' };
    }

    const currentStatus = shipment.status;
    const userProfile = currentUser.profile;

    if (isDeveloperUser(currentUser) || userProfile === UserProfile.Desenvolvedor || userProfile === UserProfile.Admin || userProfile === UserProfile.GerenciadoraDeRisco || isGerenciadora) return defaultResponse;

    if (currentStatus === ShipmentStatus.PreCadastro) {
        if ([UserProfile.Fiscal, UserProfile.Diretor, UserProfile.Supervisor, UserProfile.Embarcador, UserProfile.Comercial, UserProfile.Agenciador].includes(userProfile)) return defaultResponse;
        return { allowed: false, reason: 'Apenas Gerenciadora de Risco, Comercial, Fiscal, Diretor, Supervisor, Embarcador, Agenciador ou Admin podem avançar este status.' };
    }

    if (currentStatus === ShipmentStatus.AguardandoSeguradora) {
        return { allowed: false, reason: 'Apenas o perfil Gerenciadora de Risco ou Administrador do Sistema pode avançar embarques neste status.' };
    }

    if (currentStatus === ShipmentStatus.AguardandoDescarga) {
        if ([UserProfile.Embarcador, UserProfile.Fiscal, UserProfile.Diretor, UserProfile.Supervisor, UserProfile.Comercial, UserProfile.Financeiro, UserProfile.Agenciador, UserProfile.Motorista].includes(userProfile)) return defaultResponse;
        return { allowed: false, reason: 'Você não tem permissão para anexar o comprovante de descarga.' };
    }

    if (currentStatus === ShipmentStatus.ValidacaoTicket) {
        if ([UserProfile.Fiscal, UserProfile.Supervisor, UserProfile.Diretor, UserProfile.Comercial, UserProfile.Financeiro].includes(userProfile)) return defaultResponse;
        return { allowed: false, reason: 'A validação do ticket e peso é restrita aos perfis Fiscal, Supervisor, Financeiro, Diretor ou Administrador (bloqueado para Embarcador).' };
    }

    if (currentStatus === ShipmentStatus.AguardandoAdiantamento || currentStatus === ShipmentStatus.AguardandoPagamentoSaldo) {
        if ([UserProfile.Financeiro, UserProfile.Diretor, UserProfile.Supervisor].includes(userProfile)) return defaultResponse;
        return { allowed: false, reason: 'Apenas Financeiro, Diretor, Supervisor ou Admin podem avançar.' };
    }

    return defaultResponse;
  };


  return (
    <>
      <Header title="Embarques" />
      <ShipmentStatusFilter 
        shipments={shipments} 
        activeStatus={activeStatus} 
        onStatusChange={setActiveStatus}
        currentUser={currentUser}
      />

      <ShipmentTable 
        shipments={filteredShipments} 
        cargos={cargos}
        drivers={drivers}
        users={users}
        vehicles={vehicles}
        filterCte={filterCte}
        onFilterCteChange={setFilterCte}
        onAttach={!isDemo && (canUpdate || isClient || isFinanceiro) ? handleOpenAttachmentModal : undefined}
        onAddAttachments={!isDemo ? onAddAttachments : undefined}
        onEditPrice={canEditPrice ? handleEditPrice : undefined}
        onCancel={canCancelShipment ? handleCancelShipment : undefined}
        onTransfer={canTransferShipment ? handleOpenTransferModal : undefined}
        onShowHistory={handleShowHistory}
        onShowCargoDetails={handleShowCargoDetails}
        canUserAdvanceStatus={canUserAdvanceStatus}
        onMarkArrival={!isDemo ? onMarkArrival : undefined}
        onDelete={!isDemo ? onDeleteShipment : undefined}
        onRevertStatus={!isDemo ? onRevertStatus : undefined}
        onOpenCadastroAntt={!isDemo ? handleOpenCadastroAnttModal : undefined}
        onOpenEditScheduledDateTime={!isDemo ? (shipment) => {
          setSelectedShipment(shipment);
          setEditScheduledDateTimeModalOpen(true);
        } : undefined}
        onUpdatePrice={!isDemo ? onUpdatePrice : undefined}
        onUpdateShipmentData={!isDemo ? onUpdateShipmentData : undefined}
        currentUser={currentUser}
        activeStatus={activeStatus}
        clients={clients}
        products={products}
        companyLogo={companyLogo}
        onDeleteAttachment={!isDemo ? onDeleteAttachment : undefined}
        onSwapCargo={!isDemo ? handleOpenSwapCargoModal : undefined}
        onPerformSwapCargo={!isDemo ? onSwapCargo : undefined}
        tickets={tickets}
        onCreateShipment={!isDemo ? onCreateShipment : undefined}
      />

      {selectedShipment && (
        <AttachmentModal
          isOpen={isAttachmentModalOpen}
          onClose={handleCloseAttachmentModal}
          onSave={handleSaveAttachment}
          shipment={shipments.find(s => s.id === selectedShipment.id) || selectedShipment}
          cargo={findCargoById(cargos, selectedShipment.cargoId)}
          documentName={REQUIRED_DOCUMENT_MAP[selectedShipment.status] || 'Documento'}
          currentUser={currentUser}
          canSave={canUserAdvanceStatus(selectedShipment).allowed}
          requiresRiskManagement={
            checkRequiresRiskManagement(
              findCargoById(cargos, selectedShipment.cargoId),
              findProductForCargo(products, findCargoById(cargos, selectedShipment.cargoId))
            )
          }
          products={products}
          clients={clients}
          users={users}
          riskQueryOptions={riskQueryOptions}
          onUpdateShipmentData={onUpdateShipmentData}
          onDeleteAttachment={!isDemo ? onDeleteAttachment : undefined}
        />
      )}

      {selectedShipment && (
        <CadastroAnttModal
          isOpen={isCadastroAnttModalOpen}
          onClose={() => setCadastroAnttModalOpen(false)}
          onSave={handleSaveAnttData}
          shipment={selectedShipment}
        />
      )}
      {selectedShipment && (
        <EditPriceModal
            isOpen={isEditPriceModalOpen}
            onClose={() => setEditPriceModalOpen(false)}
            onSave={handleSavePrice}
            shipment={selectedShipment}
            currentUser={currentUser}
            cargo={cargos.find(c => c.id === selectedShipment.cargoId || (c.sequenceId && `CRG-${c.sequenceId}` === selectedShipment.cargoId))}
        />
      )}
      {selectedShipment && (
        <CancelShipmentModal
            isOpen={isCancelModalOpen}
            onClose={() => setCancelModalOpen(false)}
            onConfirm={handleConfirmCancel}
            shipmentId={selectedShipment.id}
        />
      )}
      {selectedShipment && (
        <HistoryModal
            isOpen={isHistoryModalOpen}
            onClose={() => setIsHistoryModalOpen(false)}
            history={selectedShipment.history}
            users={users}
            title={`Histórico do Embarque ${selectedShipment.id}`}
        />
      )}
      {selectedShipment && (
        <TransferShipmentModal
          isOpen={isTransferModalOpen}
          onClose={() => setIsTransferModalOpen(false)}
          onSave={handleSaveTransfer}
          shipment={selectedShipment}
          users={users}
        />
      )}

      {selectedShipment && (
        <EditScheduledDateTimeModal
          isOpen={isEditScheduledDateTimeModalOpen}
          onClose={() => {
            setEditScheduledDateTimeModalOpen(false);
            setSelectedShipment(null);
          }}
          onSave={(data) => {
            onUpdateScheduledDateTime(selectedShipment.id, data);
            setEditScheduledDateTimeModalOpen(false);
            setSelectedShipment(null);
          }}
          shipment={selectedShipment}
        />
      )}

      {detailsModalCargo && (
          <CargoDetailsModal
            isOpen={!!detailsModalCargo}
            onClose={() => setDetailsModalCargo(null)}
            cargo={detailsModalCargo}
            client={clients.find(c => c.id === detailsModalCargo.clientId)}
            product={products.find(p => p.id === detailsModalCargo.productId)}
            commercialUser={users.find(u => u.id === detailsModalCargo.createdById)}
            stays={stays}
            shipments={shipments}
            currentUser={currentUser}
          />
      )}

      {selectedShipment && (
        <SwapCargoModal
          isOpen={isSwapCargoModalOpen}
          onClose={() => {
            setSwapCargoModalOpen(false);
            setSelectedShipment(null);
          }}
          onConfirm={handleSwapCargo}
          shipment={selectedShipment}
          cargos={cargos}
          clients={clients}
          products={products}
          shipments={shipments}
        />
      )}

    </>
  );
};

export default ShipmentsPage;
