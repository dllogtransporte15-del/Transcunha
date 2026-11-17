
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { Shipment, Cargo, User, Vehicle, Client, Product } from '../types';
import { ShipmentStatus, UserProfile } from '../types';
import { PaperclipIcon } from './icons/PaperclipIcon';
import { DollarSignIcon } from './icons/DollarSignIcon';
import { XIcon } from './icons/XIcon';
import { HistoryIcon } from './icons/HistoryIcon';
import { WhatsAppIcon } from './icons/WhatsAppIcon';
import { ExternalLinkIcon } from './icons/ExternalLinkIcon';
import { InfoIcon } from './icons/InfoIcon';
import { TransferIcon } from './icons/TransferIcon';
import { MoreVerticalIcon } from './icons/MoreVerticalIcon';
import { Search, Filter, X, Trash2, RotateCcw, RotateCw, Clock, Package, AlertCircle, Smartphone, MapPin, ChevronLeft, ChevronRight, ArrowUpDown, FileText, Truck, User as UserIcon, UserCheck, Building, Pencil, Check, Loader2, ExternalLink, Paperclip, Copy, Repeat } from 'lucide-react';
import { ReembarqueModal } from './ReembarqueModal';
import { ComplementarShipmentModal, ComplementarShipmentPayload } from './ComplementarShipmentModal';
import { FilePlus2 } from 'lucide-react';
import { StatusPendingModal } from './StatusPendingModal';
import { getShipmentCte, getShipmentCteEmissionDate, isCteApplicableForStatus, getCargoMapUrl } from '../utils';
import { backfillShipmentFiscalNumbers, uploadShipmentAttachment, getShipmentAttachmentUrl, upsertShipment } from '../lib/db';
import { openDocumentInNewTab } from '../utils/documentViewer';
import { useToast } from '../hooks/useToast';
import { StayRecord } from '../utils/toolStorage';
import type { Ticket, Driver } from '../types';
import { TicketStatus } from '../types';
import { useDriverLocations, normalizeDriverKey } from '../hooks/useDriverLocations';
import { isDemoUser, isDeveloperUser } from '../auth';

import MultiSelectDropdown from './MultiSelectDropdown';
import ShipmentDetailsModal from './ShipmentDetailsModal';

import { getShipmentTmsOrderUrl, getShipmentCteFileUrl, getShipmentDischargeTicketUrl } from '../utils/documentViewer';
import { extractDetailedDocData } from '../utils/fiscalDocParser';
import { extractOcNumberFromText } from '../utils/ocParser';
export { getShipmentTmsOrderUrl, getShipmentCteFileUrl, getShipmentDischargeTicketUrl };

interface ShipmentTableProps {
  shipments: Shipment[];
  drivers: Driver[];
  cargos: Cargo[];
  users: User[];
  vehicles: Vehicle[];
  clients: Client[];
  products: Product[];
  stays?: StayRecord[];
  onAttach?: (shipment: Shipment) => void;
  onEditPrice?: (shipment: Shipment) => void;
  onCancel?: (shipment: Shipment) => void;
  onTransfer?: (shipment: Shipment) => void;
  onShowHistory?: (shipment: Shipment) => void;
  onOpenCadastroAntt?: (shipment: Shipment) => void;
  onShowCargoDetails?: (cargo: Cargo) => void;
  onMarkArrival?: (shipmentId: string) => void;
  onDelete?: (shipmentId: string) => void;
  onRevertStatus?: (shipmentId: string) => void;
  canUserAdvanceStatus?: (shipment: Shipment) => { allowed: boolean; reason: string };
  onUpdatePrice?: (shipmentId: string, data: { newTotal: number, newRate?: number, newCompanyRate?: number }) => void;
  onUpdateShipmentData?: (shipmentId: string, data: Partial<Shipment>, options?: { silent?: boolean }) => void;
  onAddAttachments?: (shipmentId: string, files: File[]) => Promise<void>;
  onOpenEditScheduledDateTime?: (shipment: Shipment) => void;
  currentUser: User;

  activeStatus: ShipmentStatus | 'all';
  companyLogo?: string | null;
  onDeleteAttachment?: (shipmentId: string, url: string) => Promise<void>;
  onSwapCargo?: (shipment: Shipment) => void;
  onPerformSwapCargo?: (shipmentId: string, newCargoId: string) => void;
  tickets?: Ticket[];
  filterCte?: string;
  onFilterCteChange?: (val: string) => void;
  onCreateShipment?: (data: any) => Promise<void> | void;
  onReembarcar?: (shipment: Shipment) => void;
  onEmbarqueComplementar?: (shipment: Shipment) => void;
}

const ShipmentTable: React.FC<ShipmentTableProps> = ({ shipments, drivers, cargos, users, vehicles, onAttach, onEditPrice, onCancel, onTransfer, onShowHistory, onShowCargoDetails, canUserAdvanceStatus, onMarkArrival, onDelete, onRevertStatus, onOpenCadastroAntt, onUpdatePrice, onUpdateShipmentData, onAddAttachments, onOpenEditScheduledDateTime, currentUser, activeStatus, clients, products, stays = [], companyLogo, onDeleteAttachment, onSwapCargo, onPerformSwapCargo, tickets = [], filterCte = '', onFilterCteChange, onCreateShipment, onReembarcar, onEmbarqueComplementar }) => {


  const isDemo = isDemoUser(currentUser);
  const { showToast } = useToast();
  const [openActionMenu, setOpenActionMenu] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number, left: number, isUp: boolean } | null>(null);
  const [detailsModalShipment, setDetailsModalShipment] = useState<Shipment | null>(null);
  const [activeDriverMap, setActiveDriverMap] = useState<{
    driverName: string;
    lat: number;
    lng: number;
    timestamp?: string;
    isOffline?: boolean;
  } | null>(null);

  // Modal de Observação de Pendência do Status
  const [pendingModalShipment, setPendingModalShipment] = useState<Shipment | null>(null);

  const handleOpenPendingModal = (shipment: Shipment) => {
    if (isDemo) {
      showToast('Usuário em modo demonstração possui acesso apenas de visualização.', 'warning');
      return;
    }
    setPendingModalShipment(shipment);
  };

  const handleSavePendingObservation = async (shipmentId: string, pendingObservation: string) => {
    if (isDemo) {
      showToast('Usuário em modo demonstração possui acesso apenas de visualização.', 'warning');
      return;
    }
    if (onUpdateShipmentData) {
      await onUpdateShipmentData(shipmentId, { statusPendingObservation: pendingObservation });
    }
  };

  // Modal de Reembarque de Veículo
  const [reembarqueShipment, setReembarqueShipment] = useState<Shipment | null>(null);

  const handleConfirmReembarque = async (data: {
    selectedCargo: Cargo;
    scheduledDate: string;
    scheduledTime?: string;
    shipmentTonnage: number;
    driverFreightRate: number;
    driverFreightValue: number;
    notes?: string;
  }) => {
    if (!reembarqueShipment) return;

    if (!onCreateShipment) {
      showToast('Ação de criação de novo embarque não disponível nesta visualização.', 'error');
      return;
    }

    const payload: any = {
      isReembarque: true,
      cargoId: data.selectedCargo.id,
      driverName: reembarqueShipment.driverName,
      driverContact: reembarqueShipment.driverContact,
      driverCpf: reembarqueShipment.driverCpf,
      driverCnh: reembarqueShipment.driverCnh,
      codigoAtua: reembarqueShipment.codigoAtua,
      horsePlate: reembarqueShipment.horsePlate,
      trailer1Plate: reembarqueShipment.trailer1Plate,
      trailer2Plate: reembarqueShipment.trailer2Plate,
      trailer3Plate: reembarqueShipment.trailer3Plate,
      shipmentTonnage: data.shipmentTonnage,
      driverFreightValue: data.driverFreightValue,
      driverFreightRateSnapshot: data.driverFreightRate,
      companyFreightRateSnapshot: data.selectedCargo.companyFreightValuePerTon || 0,
      driverFreightType: reembarqueShipment.driverFreightType || 'PJ',
      embarcadorId: reembarqueShipment.embarcadorId,
      scheduledDate: data.scheduledDate,
      scheduledTime: data.scheduledTime,
      paymentMethod: reembarqueShipment.paymentMethod,
      pixKey: reembarqueShipment.pixKey,
      bankDetails: reembarqueShipment.bankDetails,
      advancePercentage: reembarqueShipment.advancePercentage ?? 70,
      anttOwnerIdentifier: reembarqueShipment.anttOwnerIdentifier,
      anttModality: reembarqueShipment.anttModality,
      etcTaxRegime: reembarqueShipment.etcTaxRegime,
      ownerName: reembarqueShipment.ownerName,
      ownerContact: reembarqueShipment.ownerContact,
      vehicleTag: reembarqueShipment.vehicleTag,
      vehicleSetType: reembarqueShipment.vehicleSetType,
      vehicleBodyType: reembarqueShipment.vehicleBodyType,
      history: [
        {
          id: `log_reembarque_${Date.now()}`,
          userId: currentUser.id,
          timestamp: new Date().toISOString(),
          description: `Reembarque programado a partir do Embarque anterior #${reembarqueShipment.id} (${reembarqueShipment.horsePlate} - ${reembarqueShipment.driverName}). Carga vinculada: ${data.selectedCargo.sequenceId ? 'CRG-' + data.selectedCargo.sequenceId : data.selectedCargo.id}.${data.notes ? ` Observação: ${data.notes}` : ''}`
        }
      ]
    };

    await onCreateShipment(payload);
    showToast(`Novo embarque programado com sucesso para o motorista ${reembarqueShipment.driverName}!`, 'success');
    setReembarqueShipment(null);
  };

  const [complementarShipment, setComplementarShipment] = useState<Shipment | null>(null);

  const handleConfirmComplementar = async (data: ComplementarShipmentPayload) => {
    if (!complementarShipment) return;
    if (!onCreateShipment) {
      showToast('Ação de criação de novo embarque não disponível nesta visualização.', 'error');
      return;
    }

    const todayStr = data.paymentDate || new Date().toISOString().split('T')[0];
    const nowTimeStr = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    const payload: any = {
      isComplementar: true,
      parentShipmentId: complementarShipment.id,
      cargoId: complementarShipment.cargoId,
      driverName: complementarShipment.driverName,
      driverContact: complementarShipment.driverContact,
      driverCpf: complementarShipment.driverCpf,
      driverCnh: complementarShipment.driverCnh,
      codigoAtua: complementarShipment.codigoAtua,
      horsePlate: complementarShipment.horsePlate,
      trailer1Plate: complementarShipment.trailer1Plate,
      trailer2Plate: complementarShipment.trailer2Plate,
      trailer3Plate: complementarShipment.trailer3Plate,
      embarcadorId: complementarShipment.embarcadorId,
      driverFreightType: complementarShipment.driverFreightType || 'PJ',
      paymentMethod: complementarShipment.paymentMethod,
      pixKey: complementarShipment.pixKey,
      bankDetails: complementarShipment.bankDetails,
      ownerName: complementarShipment.ownerName,
      ownerContact: complementarShipment.ownerContact,
      anttOwnerIdentifier: complementarShipment.anttOwnerIdentifier,
      anttModality: complementarShipment.anttModality,
      etcTaxRegime: complementarShipment.etcTaxRegime,
      vehicleTag: complementarShipment.vehicleTag,
      vehicleSetType: complementarShipment.vehicleSetType,
      vehicleBodyType: complementarShipment.vehicleBodyType,
      scheduledDate: todayStr,
      scheduledTime: nowTimeStr,
      shipmentTonnage: data.tonnage || 0,
      loadedTonnage: data.tonnage || 0,
      unloadedTonnage: data.tonnage || 0,
      driverFreightValue: data.driverFreightValue,
      driverFreightRateSnapshot: (data.tonnage && data.tonnage > 0) ? Number((data.driverFreightValue / data.tonnage).toFixed(2)) : undefined,
      companyFreightRateSnapshot: (data.tonnage && data.tonnage > 0) ? Number((data.companyFreightValue / data.tonnage).toFixed(2)) : data.companyFreightValue,
      advancePercentage: data.advancePercentage !== undefined ? data.advancePercentage : 0,
      advanceValue: (data.advancePercentage && data.advancePercentage > 0) ? Number(((data.driverFreightValue * data.advancePercentage) / 100).toFixed(2)) : 0,
      balanceToReceiveValue: (data.advancePercentage && data.advancePercentage >= 100) ? 0 : Number((data.driverFreightValue - ((data.advancePercentage && data.advancePercentage > 0) ? ((data.driverFreightValue * data.advancePercentage) / 100) : 0)).toFixed(2)),
      status: ShipmentStatus.AguardandoFiscal,
      federalTax: data.isFederalTaxManual ? data.manualFederalTaxValue : (data.deductions?.impostoFederal || 0),
      isFederalTaxManual: data.isFederalTaxManual || false,
      cteNumber: data.cteNumber,
      complementarCteNumber: data.cteNumber,
      complementarCompanyFreight: data.companyFreightValue,
      complementarDriverFreight: data.driverFreightValue,
      complementarOriginType: data.originType,
      nfeNumber: data.nfNumber || complementarShipment.nfeNumber,
      nfeValue: data.nfValue !== undefined ? data.nfValue : complementarShipment.nfeValue,
      complementarNfeNumber: data.nfNumber,
      complementarNfeValue: data.nfValue,
      documents: {
        'CT-e Complementar': data.cteFileUrl ? [data.cteFileUrl] : [],
        'CT-e': data.cteFileUrl ? [data.cteFileUrl] : [],
        'Nota Fiscal': data.nfFileUrl ? [data.nfFileUrl] : (complementarShipment.documents?.['Nota Fiscal'] || []),
        'Nota Fiscal (NF-e)': data.nfFileUrl ? [data.nfFileUrl] : (complementarShipment.documents?.['Nota Fiscal (NF-e)'] || []),
        'Nota Fiscal Complementar': data.nfFileUrl ? [data.nfFileUrl] : [],
        'Comprovante de Pagamento': data.receiptFileUrl ? [data.receiptFileUrl] : [],
        'Comprovante de Pagamento de Saldo': data.receiptFileUrl ? [data.receiptFileUrl] : [],
        'Comprovante de Adiantamento': data.receiptFileUrl ? [data.receiptFileUrl] : [],
        is_complementar: true,
        parent_shipment_id: complementarShipment.id,
        complementar_cte_number: data.cteNumber,
        complementar_nfe_number: data.nfNumber,
        complementar_nfe_value: data.nfValue,
        complementar_company_freight: data.companyFreightValue,
        complementar_driver_freight: data.driverFreightValue,
        complementar_origin_type: data.originType,
        nfe_number: data.nfNumber,
        cte_number: data.cteNumber,
        cteNumber: data.cteNumber,
        real_profit_data: {
          companyFreight: data.companyFreightValue,
          driverFreight: data.driverFreightValue,
          netMargin: Number((data.companyFreightValue - data.driverFreightValue).toFixed(2)),
          notes: data.notes || `Embarque Complementar referente ao Embarque #${complementarShipment.id} (${data.originType}).`,
        }
      },
      history: [
        {
          id: `log_comp_${Date.now()}`,
          userId: currentUser.id,
          timestamp: new Date().toISOString(),
          description: `Embarque Complementar criado e finalizado referente ao Embarque anterior #${complementarShipment.id} (${complementarShipment.horsePlate} - ${complementarShipment.driverName}). Motivo: ${data.originType}. CT-e Complementar nº ${data.cteNumber}${data.nfNumber ? ` | NF nº ${data.nfNumber}` : ''}. Frete Empresa: R$ ${data.companyFreightValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} | Frete Motorista Pago: R$ ${data.driverFreightValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}.${data.notes ? ` Obs: ${data.notes}` : ''}`
        }
      ]
    };

    await onCreateShipment(payload);

    if (onUpdateShipmentData) {
      const parentHistoryLog = {
        id: `log_comp_ref_${Date.now()}`,
        userId: currentUser.id,
        timestamp: new Date().toISOString(),
        description: `Gerado Embarque Complementar para este frete com CT-e Complementar nº ${data.cteNumber}${data.nfNumber ? ` | NF nº ${data.nfNumber}` : ''}. Motivo: ${data.originType}. Frete Empresa: R$ ${data.companyFreightValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} | Frete Motorista: R$ ${data.driverFreightValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}.`
      };
      await onUpdateShipmentData(complementarShipment.id, {
        history: [...(complementarShipment.history || []), parentHistoryLog],
      }, { silent: true });
    }

    setComplementarShipment(null);
  };
  const actionMenuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  // TMS Loading Order upload state & handler
  const [uploadingTmsOrderId, setUploadingTmsOrderId] = useState<string | null>(null);
  const tmsFileInputRef = useRef<HTMLInputElement>(null);
  const [targetShipmentForTmsUpload, setTargetShipmentForTmsUpload] = useState<Shipment | null>(null);

  const handleTriggerUploadTmsOrder = (shipment: Shipment, e: React.MouseEvent) => {
    e.stopPropagation();
    if (isDemo) return;
    setTargetShipmentForTmsUpload(shipment);
    if (tmsFileInputRef.current) {
      tmsFileInputRef.current.value = '';
      tmsFileInputRef.current.click();
    }
  };

  const handleTmsFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !targetShipmentForTmsUpload || isDemo) return;

    const shipmentId = targetShipmentForTmsUpload.id;
    setUploadingTmsOrderId(shipmentId);
    try {
      const path = await uploadShipmentAttachment(shipmentId, 'Ordem de Carregamento TMS', file);
      const publicUrl = getShipmentAttachmentUrl(path);

      let extractedOcNumber: string | undefined;
      try {
        const detailed = await extractDetailedDocData(file, 'Ordem de Carregamento TMS');
        if (detailed.rawText) {
          const num = extractOcNumberFromText(detailed.rawText);
          if (num) extractedOcNumber = num;
        }
      } catch (err) {
        console.warn('Não foi possível extrair número da OC:', err);
      }

      const latestShipment = shipments.find(s => s.id === shipmentId) || targetShipmentForTmsUpload;
      const currentDocs = latestShipment.documents || {};
      const updatedDocuments = {
        ...currentDocs,
        'Ordem de Carregamento TMS': [publicUrl],
        ...(extractedOcNumber ? {
          ordem_carregamento_numero: extractedOcNumber,
          oc_number: extractedOcNumber
        } : {})
      };

      const newLog = {
        id: `log_${Date.now()}`,
        userId: currentUser.id,
        timestamp: new Date().toISOString(),
        description: `Ordem de carregamento TMS anexada: ${file.name}`
      };

      const updatedHistory = [...(latestShipment.history || []), newLog];

      const updatedShipment: Shipment = {
        ...latestShipment,
        documents: updatedDocuments,
        history: updatedHistory
      };

      await upsertShipment(updatedShipment);

      if (onUpdateShipmentData) {
        onUpdateShipmentData(shipmentId, {
          documents: updatedDocuments,
          history: updatedHistory
        });
      }

      showToast('Ordem de Carregamento TMS anexada com sucesso!', 'success');
    } catch (err) {
      console.error('Erro ao anexar ordem de carregamento TMS:', err);
      showToast('Erro ao enviar o arquivo da ordem de carregamento.', 'error');
    } finally {
      setUploadingTmsOrderId(null);
      setTargetShipmentForTmsUpload(null);
    }
  };

  const formatLocationTimestamp = useCallback((ts?: string): string => {
    if (!ts) return 'Data/hora não registrada';
    const d = new Date(ts);
    if (isNaN(d.getTime())) return ts;
    const dayStr = String(d.getDate()).padStart(2, '0');
    const monthStr = String(d.getMonth() + 1).padStart(2, '0');
    const yearStr = d.getFullYear();
    const hoursStr = String(d.getHours()).padStart(2, '0');
    const minStr = String(d.getMinutes()).padStart(2, '0');
    const secStr = String(d.getSeconds()).padStart(2, '0');
    return `${dayStr}/${monthStr}/${yearStr} às ${hoursStr}:${minStr}:${secStr}`;
  }, []);

  const realDriverLocations = useDriverLocations();
  const driverLocations = useMemo(() => {
    return new Map(realDriverLocations);
  }, [realDriverLocations]);

  const formatRequestedDateTime = useCallback((shipment: Shipment): string => {
    const rawDate = shipment.createdAt || shipment.statusHistory?.[0]?.timestamp;
    if (rawDate) {
      const d = new Date(rawDate);
      if (!isNaN(d.getTime())) {
        const dayStr = String(d.getDate()).padStart(2, '0');
        const monthStr = String(d.getMonth() + 1).padStart(2, '0');
        const yearStr = d.getFullYear();
        const hoursStr = String(d.getHours()).padStart(2, '0');
        const minStr = String(d.getMinutes()).padStart(2, '0');
        return `${dayStr}/${monthStr}/${yearStr} às ${hoursStr}:${minStr}`;
      }
    }
    if (shipment.scheduledDate) {
      const parts = shipment.scheduledDate.split('-');
      const formattedDate = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : shipment.scheduledDate;
      return shipment.scheduledTime ? `${formattedDate} às ${shipment.scheduledTime}` : formattedDate;
    }
    return '-';
  }, []);

  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const handleCopyText = useCallback((text: string, key: string, e: React.MouseEvent, label?: string) => {
    e.stopPropagation();
    if (!text) return;
    try {
      navigator.clipboard.writeText(text);
      setCopiedKey(key);
      showToast(`${label || 'Texto'} copiado: ${text}`, 'success');
      setTimeout(() => {
        setCopiedKey(prev => (prev === key ? null : prev));
      }, 2000);
    } catch {
      showToast('Não foi possível copiar para a área de transferência.', 'warning');
    }
  }, [showToast]);

  const [showFilters, setShowFilters] = useState(false);
  const [filterId, setFilterId] = useState<string>('');
  const [filterPlate, setFilterPlate] = useState<string[]>([]);
  const [filterName, setFilterName] = useState<string[]>([]);
  const [filterSolicitante, setFilterSolicitante] = useState<string[]>([]);
  const [filterOrigin, setFilterOrigin] = useState<string[]>([]);
  const [filterDest, setFilterDest] = useState<string[]>([]);
  const [filterClient, setFilterClient] = useState<string[]>([]);
  
  const [editingCteId, setEditingCteId] = useState<string | null>(null);
  const [editingCteValue, setEditingCteValue] = useState<string>('');
  const [editingCteDateValue, setEditingCteDateValue] = useState<string>('');

  const handleSaveCte = (shipmentId: string) => {
    if (isDemo) return;
    if (onUpdateShipmentData) {
      onUpdateShipmentData(shipmentId, { 
        cteNumber: editingCteValue.trim(),
        cteEmissionDate: editingCteDateValue.trim()
      });
    }
    setEditingCteId(null);
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

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (actionMenuRef.current && !actionMenuRef.current.contains(event.target as Node)) {
        setOpenActionMenu(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const toggleActionMenu = (shipmentId: string, event: React.MouseEvent<HTMLButtonElement>) => {
    if (openActionMenu === shipmentId) {
      setOpenActionMenu(null);
      setMenuPosition(null);
    } else {
      const rect = event.currentTarget.getBoundingClientRect();
      const menuHeight = 250; // Estimated height
      const isUp = rect.bottom + menuHeight > window.innerHeight;
      
      setMenuPosition({
        top: isUp ? rect.top : rect.bottom,
        left: rect.right,
        isUp: isUp
      });
      setOpenActionMenu(shipmentId);
    }
  };

  const getCargoInfo = (cargoId: string): Cargo | null => {
    return cargos.find(c => c.id === cargoId) || null;
  };

  const getEmbarcadorName = (embarcadorId: string): string => {
    return users.find(u => u.id === embarcadorId)?.name || 'N/A';
  };

  const getEmbarcadorWhatsAppLink = (embarcadorId: string): string | null => {
    const user = users.find(u => u.id === embarcadorId);
    if (!user || !user.phone) return null;
    return formatWhatsAppLink(user.phone);
  };

  const getClientName = (clientId: string) => clients.find(c => c.id === clientId)?.nomeFantasia || 'N/A';

  const getDriverCodigoAtua = useCallback((s: Shipment): string => {
    if (s.codigoAtua && s.codigoAtua.trim() !== '' && s.codigoAtua !== '-') return s.codigoAtua.trim();
    const docAtua = (s.documents as any)?.codigo_atua || (s.documents as any)?.codg_atua || (s.documents as any)?.codigoAtua;
    if (docAtua && String(docAtua).trim() !== '' && String(docAtua).trim() !== '-') return String(docAtua).trim();

    // 1. Buscar no cadastro do motorista
    const driver = drivers?.find(d => 
      d.name === s.driverName || 
      normalizeDriverKey(d.name) === normalizeDriverKey(s.driverName) || 
      (d.cpf && s.driverCpf && d.cpf.replace(/\D/g, '') === s.driverCpf.replace(/\D/g, ''))
    );
    if (driver?.codigoAtua && String(driver.codigoAtua).trim() !== '') {
      return String(driver.codigoAtua).trim();
    }

    // 2. Buscar em outros embarques desse mesmo motorista onde o código já foi informado
    const driverCpfClean = (s.driverCpf || driver?.cpf || '').replace(/\D/g, '');
    const driverNameClean = (s.driverName || '').trim().toLowerCase();
    const matchShipment = shipments.find(other => {
      const oCpf = (other.driverCpf || '').replace(/\D/g, '');
      const oName = (other.driverName || '').trim().toLowerCase();
      const isMatch = (driverCpfClean !== '' && oCpf === driverCpfClean) || (driverNameClean !== '' && oName === driverNameClean);
      if (!isMatch) return false;
      const atua = other.codigoAtua || (other.documents as any)?.codigo_atua || (other.documents as any)?.codg_atua;
      return Boolean(atua && String(atua).trim() !== '' && String(atua).trim() !== '-');
    });

    if (matchShipment) {
      const atua = matchShipment.codigoAtua || (matchShipment.documents as any)?.codigo_atua || (matchShipment.documents as any)?.codg_atua;
      return String(atua).trim();
    }

    return '';
  }, [drivers, shipments]);

  // Filter options
  const plateOptions = useMemo(() => Array.from(new Set(shipments.map(s => s.horsePlate))).filter(Boolean).sort(), [shipments]);
  const nameOptions = useMemo(() => Array.from(new Set(shipments.map(s => s.driverName))).filter(Boolean).sort(), [shipments]);
  const solicitanteOptions = useMemo(() => Array.from(new Set(shipments.map(s => getEmbarcadorName(s.embarcadorId)))).filter(n => n && n !== 'N/A').sort(), [shipments, users]);
  const originOptions = useMemo(() => Array.from(new Set(shipments.map(s => getCargoInfo(s.cargoId)?.origin || ''))).filter(Boolean).sort(), [shipments, cargos]);
  const destOptions = useMemo(() => Array.from(new Set(shipments.map(s => getCargoInfo(s.cargoId)?.destination || ''))).filter(Boolean).sort(), [shipments, cargos]);
  const clientOptions = useMemo(() => Array.from(new Set(shipments.map(s => getClientName(getCargoInfo(s.cargoId)?.clientId || '')))).filter(Boolean).sort(), [shipments, cargos, clients]);

  const filteredShipments = useMemo(() => {
    return shipments.filter(shipment => {
        const cargo = getCargoInfo(shipment.cargoId);
        if (filterId.trim()) {
          const q = filterId.trim().toLowerCase();
          const idMatch = shipment.id.toLowerCase().includes(q);
          const cargoSeqMatch = cargo?.sequenceId ? String(cargo.sequenceId).toLowerCase().includes(q) : false;
          const atuaMatch = getDriverCodigoAtua(shipment).toLowerCase().includes(q);
          const cteVal = (getShipmentCte(shipment) || '').toLowerCase();
          const cleanQ = q.replace(/\\D/g, '');
          const cteMatch = (cteVal !== '-' && cteVal.includes(q)) || (shipment.cteNumber && shipment.cteNumber.toLowerCase().includes(q));
          const subCteMatch = (shipment.subCtes || (shipment.documents as any)?.sub_ctes || []).some((sc: any) => String(sc?.cteNumber || '').toLowerCase().includes(q) || (cleanQ && String(sc?.cteNumber || '').replace(/\\D/g, '').includes(cleanQ)));
          const splitCteMatch = (shipment.cteNumber || '').split(/[\\/,;\\s]+/).some((part: string) => { const p = part.trim().toLowerCase(); return p.length > 0 && (p.includes(q) || (cleanQ && p.replace(/\\D/g, '').includes(cleanQ))); });
          const plateMatch = shipment.horsePlate?.toLowerCase().includes(q);
          const driverMatch = shipment.driverName?.toLowerCase().includes(q);
          if (!idMatch && !cargoSeqMatch && !atuaMatch && !cteMatch && !subCteMatch && !splitCteMatch && !plateMatch && !driverMatch) return false;
        }
        if (filterPlate.length > 0 && !filterPlate.includes(shipment.horsePlate)) return false;
        if (filterName.length > 0 && !filterName.includes(shipment.driverName)) return false;
        if (filterSolicitante.length > 0 && !filterSolicitante.includes(getEmbarcadorName(shipment.embarcadorId))) return false;
        if (filterOrigin.length > 0 && !filterOrigin.includes(cargo?.origin || '')) return false;
        if (filterDest.length > 0 && !filterDest.includes(cargo?.destination || '')) return false;
        if (filterClient.length > 0 && !filterClient.includes(getClientName(cargo?.clientId || ''))) return false;
        return true;
    });
  }, [shipments, filterId, filterPlate, filterName, filterSolicitante, filterOrigin, filterDest, filterClient, cargos, clients, users]);

  const activeFiltersCount = (filterId.trim() ? 1 : 0) + (filterPlate.length > 0 ? 1 : 0) + (filterName.length > 0 ? 1 : 0) + (filterSolicitante.length > 0 ? 1 : 0) + (filterOrigin.length > 0 ? 1 : 0) + (filterDest.length > 0 ? 1 : 0) + (filterClient.length > 0 ? 1 : 0);

  const [sortKey, setSortKey] = useState<string>('default');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;

  useEffect(() => {
    setCurrentPage(1);
  }, [filteredShipments]);

  const totalPages = Math.ceil(filteredShipments.length / itemsPerPage) || 1;
  const safeCurrentPage = Math.min(currentPage, totalPages);

  const sortedShipments = useMemo(() => {
    if (sortKey === 'default') return filteredShipments;
    return [...filteredShipments].sort((a, b) => {
      let valA = '';
      let valB = '';
      const cargoA = getCargoInfo(a.cargoId);
      const cargoB = getCargoInfo(b.cargoId);
      if (sortKey === 'id') { valA = a.id || ''; valB = b.id || ''; }
      else if (sortKey === 'driver') { valA = a.driverName || ''; valB = b.driverName || ''; }
      else if (sortKey === 'plate') { valA = a.horsePlate || ''; valB = b.horsePlate || ''; }
      else if (sortKey === 'solicitante') { valA = getEmbarcadorName(a.embarcadorId); valB = getEmbarcadorName(b.embarcadorId); }
      else if (sortKey === 'origin') { valA = cargoA?.origin || ''; valB = cargoB?.origin || ''; }
      else if (sortKey === 'destination') { valA = cargoA?.destination || ''; valB = cargoB?.destination || ''; }
      else if (sortKey === 'client') { valA = getClientName(cargoA?.clientId || ''); valB = getClientName(cargoB?.clientId || ''); }
      else if (sortKey === 'scheduledDate') { valA = a.scheduledDate || ''; valB = b.scheduledDate || ''; }
      else if (sortKey === 'status') { valA = a.status || ''; valB = b.status || ''; }
      const cmp = valA.localeCompare(valB, 'pt-BR', { numeric: true });
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filteredShipments, sortKey, sortDir, cargos, clients, users]);

  const paginatedShipments = sortedShipments.slice((safeCurrentPage - 1) * itemsPerPage, safeCurrentPage * itemsPerPage);

  const clearFilters = () => {
    setFilterId('');
    setFilterPlate([]);
    setFilterName([]);
    setFilterSolicitante([]);
    setFilterOrigin([]);
    setFilterDest([]);
    setFilterClient([]);
    setSortKey('default');
    setSortDir('desc');
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };
  
  const formatDate = (timestamp: string | undefined) => {
    if (!timestamp) return 'N/A';
    return new Date(timestamp).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatWhatsAppLink = (phone: string) => {
    if (!phone) return null;
    const cleanedPhone = phone.replace(/\D/g, '');
    if (cleanedPhone.length >= 10) { 
        return `https://wa.me/55${cleanedPhone}`;
    }
    return null;
  };
  
  const isClient = currentUser.profile === UserProfile.Cliente;
  const isGerenciadora = currentUser.profile === UserProfile.GerenciadoraDeRisco ||
    (currentUser.profile as string) === 'Gerenciadora de Risco' ||
    Boolean(currentUser.name && (currentUser.name.toLowerCase().includes('samanta') || currentUser.name.toLowerCase().includes('samantha'))) ||
    Boolean(currentUser.email && (currentUser.email.toLowerCase().includes('samanta') || currentUser.email.toLowerCase().includes('samantha')));
  const showActionsColumnForClient = isClient && activeStatus === ShipmentStatus.Finalizado;

  const ActionMenuItem: React.FC<{
    icon: React.ElementType;
    text: string;
    onClick: () => void;
    disabled?: boolean;
    isDestructive?: boolean;
    title?: string;
  }> = ({ icon: Icon, text, onClick, disabled, isDestructive, title }) => (
    <button
      onClick={(e) => {
        e.preventDefault();
        if (!disabled) {
          onClick();
          setOpenActionMenu(null);
        }
      }}
      disabled={disabled}
      title={title}
      className={`w-full text-left flex items-center gap-2 px-2.5 py-1 text-xs font-medium transition-colors ${
        disabled 
          ? 'text-gray-400 dark:text-gray-500 cursor-not-allowed' 
          : isDestructive 
            ? 'text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/50' 
            : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'
      }`}
      role="menuitem"
    >
      <Icon className="w-3.5 h-3.5 shrink-0" />
      <span className="truncate">{text}</span>
    </button>
  );

  return (
    <div className="space-y-4 pb-12 sm:pb-6">
      {currentUser.profile !== UserProfile.Motorista && (
      <div className="flex flex-col bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-100 dark:border-gray-700">
        <div className="flex flex-col md:flex-row items-center justify-between p-3 gap-3">
          <div className="w-full md:w-auto flex items-center gap-2.5 flex-wrap">
            <button 
                onClick={() => setShowFilters(!showFilters)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all shadow-sm ${showFilters || activeFiltersCount > 0 ? 'bg-blue-100/80 text-blue-900 border-blue-300 dark:bg-blue-900/40 dark:text-blue-200 dark:border-blue-700' : 'bg-blue-50/40 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300 border-blue-200 dark:border-blue-800/60 hover:bg-blue-50/70'}`}
            >
                <Filter className="w-3.5 h-3.5" />
                <span>Filtros Avançados {activeFiltersCount > 0 && `(${activeFiltersCount})`}</span>
            </button>

            {/* Filtro por ID */}
            <div className="relative flex items-center">
              <Search className="w-3.5 h-3.5 text-blue-500 absolute left-2.5 pointer-events-none" />
              <input
                type="text"
                placeholder="Filtrar por ID..."
                value={filterId}
                onChange={e => setFilterId(e.target.value)}
                className="pl-8 pr-7 py-1.5 text-xs font-semibold border border-blue-200 dark:border-blue-800/60 rounded-lg bg-blue-50/40 dark:bg-blue-900/20 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 w-32 sm:w-36 transition-all shadow-sm"
              />
              {filterId && (
                <button
                  onClick={() => setFilterId('')}
                  className="absolute right-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                  title="Limpar filtro de ID"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {onFilterCteChange && (
              <div className="relative flex items-center">
                <FileText className="w-3.5 h-3.5 text-blue-500 absolute left-2.5 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Filtrar por CT-e..."
                  value={filterCte || ''}
                  onChange={e => onFilterCteChange(e.target.value)}
                  className="pl-8 pr-7 py-1.5 text-xs font-semibold border border-blue-200 dark:border-blue-800/60 rounded-lg bg-blue-50/40 dark:bg-blue-900/20 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 w-36 sm:w-40 transition-all shadow-sm"
                />
                {filterCte && (
                  <button
                    onClick={() => onFilterCteChange('')}
                    className="absolute right-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                    title="Limpar filtro"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            )}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400 font-medium whitespace-nowrap">
            {filteredShipments.length !== shipments.length ? `${filteredShipments.length} de ` : ''}{shipments.length} embarques listados
          </div>
        </div>

        {showFilters && (
            <div className="p-3 border-t border-gray-100 dark:border-gray-700 bg-gray-50/30 dark:bg-gray-800/40">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                    <MultiSelectDropdown label="Placa" icon={Truck} options={plateOptions} selectedValues={filterPlate} onChange={setFilterPlate} placeholder="Todas as Placas..." />
                    <MultiSelectDropdown label="Motorista" icon={UserIcon} options={nameOptions} selectedValues={filterName} onChange={setFilterName} placeholder="Todos os Motoristas..." />
                    <MultiSelectDropdown label="Solicitante" icon={UserCheck} options={solicitanteOptions} selectedValues={filterSolicitante} onChange={setFilterSolicitante} placeholder="Todos os Solicitantes..." />
                    <MultiSelectDropdown label="Cidade de Origem" icon={MapPin} options={originOptions} selectedValues={filterOrigin} onChange={setFilterOrigin} placeholder="Todas as Origens..." />
                    <MultiSelectDropdown label="Cidade de Destino" icon={MapPin} options={destOptions} selectedValues={filterDest} onChange={setFilterDest} placeholder="Todos os Destinos..." />
                    <MultiSelectDropdown label="Cliente" icon={Building} options={clientOptions} selectedValues={filterClient} onChange={setFilterClient} placeholder="Todos os Clientes..." />
                </div>
                {/* Ordenação */}
                <div className="mt-3 pt-3 border-t border-gray-200/60 dark:border-gray-700 flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-1.5">
                        <ArrowUpDown className="w-3.5 h-3.5 text-blue-500" />
                        <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">Ordenar por:</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <select
                            value={sortKey}
                            onChange={e => setSortKey(e.target.value)}
                            className="px-3 py-1 text-xs font-semibold border border-blue-200 dark:border-blue-800/60 rounded-lg bg-blue-50/40 dark:bg-blue-900/20 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary/20 outline-none shadow-sm"
                        >
                            <option value="default">Padrão (sem ordenação)</option>
                            <option value="id">ID do Embarque</option>
                            <option value="driver">Motorista</option>
                            <option value="plate">Placa</option>
                            <option value="solicitante">Solicitante</option>
                            <option value="origin">Cidade de Origem</option>
                            <option value="destination">Cidade de Destino</option>
                            <option value="client">Cliente</option>
                            <option value="scheduledDate">Data Agendada</option>
                            <option value="status">Status</option>
                        </select>
                        {sortKey !== 'default' && (
                            <select
                                value={sortDir}
                                onChange={e => setSortDir(e.target.value as 'asc' | 'desc')}
                                className="px-3 py-1 text-xs font-semibold border border-blue-200 dark:border-blue-800/60 rounded-lg bg-blue-50/40 dark:bg-blue-900/20 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary/20 outline-none shadow-sm"
                            >
                                <option value="asc">Crescente (A → Z)</option>
                                <option value="desc">Decrescente (Z → A)</option>
                            </select>
                        )}
                    </div>
                    {(activeFiltersCount > 0 || sortKey !== 'default') && (
                        <button onClick={clearFilters} className="ml-auto text-xs font-semibold flex items-center gap-1 text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 transition-colors">
                            <X className="w-3.5 h-3.5" /> Limpar Tudo
                        </button>
                    )}
                </div>
            </div>
        )}
      </div>
      )}


      <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg overflow-hidden border border-gray-100 dark:border-gray-700">
        {/* Mobile View - Cards */}
        <div className="grid grid-cols-1 divide-y divide-gray-100 dark:divide-gray-700 lg:hidden">
          {paginatedShipments.map((shipment) => {
            const cargo = getCargoInfo(shipment.cargoId);
            const vehicle = vehicles.find(v => v.plate === shipment.horsePlate);
            const whatsappLink = shipment.driverContact ? formatWhatsAppLink(shipment.driverContact) : null;
            const advanceStatusCheck = canUserAdvanceStatus ? canUserAdvanceStatus(shipment) : { allowed: true, reason: '' };
            const canAdvance = advanceStatusCheck.allowed;
            const disabledReason = advanceStatusCheck.reason;
            const isActionable = shipment.status !== ShipmentStatus.Finalizado && shipment.status !== ShipmentStatus.Cancelado;

            return (
              <div key={shipment.id} className="p-3 space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-1">
                      {isClient ? (
                        <span className="text-sm font-bold text-gray-700 dark:text-gray-300">
                          {shipment.id}
                        </span>
                      ) : (
                        <button 
                          onClick={() => setDetailsModalShipment(shipment)} 
                          className="text-sm font-bold text-primary dark:text-blue-400 hover:underline"
                        >
                          {shipment.id}
                        </button>
                      )}
                      {currentUser?.profile !== UserProfile.Cliente && tickets.some(t => t.shipmentId === shipment.id && t.status !== TicketStatus.Fechado && t.status !== TicketStatus.Resolvido) && (
                        <span className="text-red-500 inline-flex items-center" title="Chamado(s) Aberto(s)">
                          <AlertCircle className="w-4 h-4" />
                        </span>
                      )}
                      {(shipment.isComplementar || (shipment.documents as any)?.is_complementar) && (
                        <span 
                          className="px-1.5 py-0.5 text-[9px] font-black uppercase rounded bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300 border border-purple-300 dark:border-purple-800 ml-1 inline-flex items-center"
                          title={shipment.parentShipmentId ? `Complementar do Embarque #${shipment.parentShipmentId}` : 'Embarque Complementar'}
                        >
                          Complementar{shipment.parentShipmentId ? ` (#${shipment.parentShipmentId})` : ''}
                        </span>
                      )}
                    </div>
                    {cargo && (
                      <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
                        <span>
                          Carga: <button onClick={() => onShowCargoDetails?.(cargo)} className="font-semibold text-primary/80">#{cargo.sequenceId}</button>
                        </span>

                        {(() => {
                          const tmsOrderUrl = getShipmentTmsOrderUrl(shipment);
                          const isAgCarregamento = shipment.status === ShipmentStatus.AguardandoCarregamento;
                          const isUploadingThis = uploadingTmsOrderId === shipment.id;

                          if (tmsOrderUrl) {
                            return (
                              <div className="inline-flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openDocumentInNewTab(tmsOrderUrl, `Ordem de Carregamento TMS - Carga ${cargo.sequenceId} - ${shipment.id}`);
                                  }}
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 hover:bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 dark:hover:bg-emerald-900/60 border border-emerald-300 dark:border-emerald-700 shadow-xs transition-colors cursor-pointer"
                                  title="Ordem de Carregamento TMS Anexada. Clique para abrir em nova aba com opções de imprimir e baixar."
                                >
                                  <FileText className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                                  <span>OC TMS</span>
                                  <ExternalLink className="w-2.5 h-2.5 opacity-70" />
                                </button>
                                {!isClient && !isDemo && (
                                  <button
                                    type="button"
                                    onClick={(e) => handleTriggerUploadTmsOrder(shipment, e)}
                                    className="p-0.5 text-gray-400 hover:text-emerald-700 dark:hover:text-emerald-300 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                    title="Substituir Ordem de Carregamento TMS"
                                  >
                                    <Pencil className="w-2.5 h-2.5" />
                                  </button>
                                )}
                              </div>
                            );
                          }

                          if (isAgCarregamento && !isClient && !isDemo) {
                            return (
                              <button
                                type="button"
                                disabled={isUploadingThis}
                                onClick={(e) => handleTriggerUploadTmsOrder(shipment, e)}
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 hover:bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300 dark:hover:bg-amber-900/60 border border-amber-300 dark:border-amber-700 shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                                title="Anexar Ordem de Carregamento do TMS"
                              >
                                {isUploadingThis ? (
                                  <>
                                    <Loader2 className="w-3 h-3 animate-spin text-amber-600 dark:text-amber-400" />
                                    <span>Enviando...</span>
                                  </>
                                ) : (
                                  <>
                                    <Paperclip className="w-2.5 h-2.5 text-amber-600 dark:text-amber-400 shrink-0" />
                                    <span>+ OC TMS</span>
                                  </>
                                )}
                              </button>
                            );
                          }

                          return null;
                        })()}
                      </div>
                    )}
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-bold px-2 py-1 rounded-full bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                      {shipment.status}
                    </span>
                    {shipment.status === ShipmentStatus.Cancelado && shipment.cancellationReason && (
                        <div className="text-[10px] text-red-500 font-semibold mt-1 max-w-[120px] break-words">
                          Motivo: {shipment.cancellationReason}
                        </div>
                    )}
                    {[ShipmentStatus.AguardandoNota, ShipmentStatus.AguardandoFiscal, ShipmentStatus.AguardandoAdiantamento, ShipmentStatus.AguardandoAgendamento, ShipmentStatus.AguardandoDescarga, ShipmentStatus.ValidacaoTicket, ShipmentStatus.AguardandoPagamentoSaldo, ShipmentStatus.Finalizado].includes(shipment.status) && (
                        <div className="text-[10px] text-blue-600 dark:text-blue-400 font-bold mt-1">
                          {(Number(shipment.shipmentTonnage) || 0).toLocaleString('pt-BR')} ton
                        </div>
                    )}
                    <div className="text-[10px] text-gray-400 mt-1 flex items-center gap-1">
                      <Clock className="w-3 h-3 text-gray-400 shrink-0" />
                      <span>Sol.: {formatRequestedDateTime(shipment)}</span>
                    </div>
                    {shipment.status !== ShipmentStatus.Cancelado && (
                      <div className="mt-1.5 flex justify-end">
                        {shipment.statusPendingObservation ? (
                          <div
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenPendingModal(shipment);
                            }}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-300 shadow-xs hover:bg-amber-100 dark:hover:bg-amber-900/60 cursor-pointer max-w-[180px] transition-all"
                            title="Clique para editar ou limpar a pendência do status"
                          >
                            <AlertCircle className="w-3 h-3 text-amber-600 dark:text-amber-400 shrink-0" />
                            <span className="truncate">{shipment.statusPendingObservation}</span>
                            <Pencil className="w-2.5 h-2.5 shrink-0 text-amber-700 dark:text-amber-300" />
                          </div>
                        ) : (
                          !isDemo && onUpdateShipmentData && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenPendingModal(shipment);
                              }}
                              className="text-[10px] font-medium text-amber-700 dark:text-amber-400 hover:text-amber-900 dark:hover:text-amber-200 inline-flex items-center gap-1 py-0.5 px-1.5 rounded bg-amber-50/60 dark:bg-amber-950/30 border border-amber-200/50 dark:border-amber-800/40"
                              title="Informar nota rápida de pendência para este status"
                            >
                              <AlertCircle className="w-2.5 h-2.5 text-amber-600" />
                              <span>+ Pendência</span>
                            </button>
                          )
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-[10px] text-gray-400 uppercase font-bold">Motorista</div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {(() => {
                        const atua = getDriverCodigoAtua(shipment);
                        return atua ? (
                          <span 
                            onClick={(e) => handleCopyText(atua, `atua_m_${shipment.id}`, e, 'Código ATUA')}
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-black font-mono bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-200 border border-blue-300 dark:border-blue-700/60 shadow-2xs shrink-0 cursor-pointer hover:bg-blue-200/80 dark:hover:bg-blue-800/80 transition-colors" 
                            title={`Código ATUA: ${atua} (Clique para copiar)`}
                          >
                            <span>{atua}</span>
                            <button
                              type="button"
                              onClick={(e) => handleCopyText(atua, `atua_m_${shipment.id}`, e, 'Código ATUA')}
                              className="text-blue-600 hover:text-blue-950 dark:text-blue-300 dark:hover:text-white transition-colors cursor-pointer p-0.5 rounded hover:bg-blue-200/50 dark:hover:bg-blue-800/50"
                              title={`Copiar Código ATUA (${atua})`}
                            >
                              {copiedKey === `atua_m_${shipment.id}` ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                            </button>
                          </span>
                        ) : null;
                      })()}
                      <div className="font-medium dark:text-gray-200">{shipment.driverName}</div>
                      {(() => {
                          const driver = drivers?.find(d => 
                            d.name === shipment.driverName || 
                            normalizeDriverKey(d.name) === normalizeDriverKey(shipment.driverName) || 
                            (d.cpf && shipment.driverCpf && d.cpf.replace(/\D/g, '') === shipment.driverCpf.replace(/\D/g, ''))
                          );

                          const normShipName = normalizeDriverKey(shipment.driverName);
                          const rawShipName = (shipment.driverName || '').trim().toLowerCase();
                          const rawCpf = (shipment.driverCpf || driver?.cpf || '').replace(/\D/g, '');

                          const locationInfo = (() => {
                            if (driver?.id && driverLocations.has(driver.id)) return driverLocations.get(driver.id);
                            if (rawCpf && driverLocations.has(rawCpf)) return driverLocations.get(rawCpf);
                            if (normShipName && driverLocations.has(normShipName)) return driverLocations.get(normShipName);
                            if (rawShipName && driverLocations.has(rawShipName)) return driverLocations.get(rawShipName);

                            return Array.from(driverLocations.values()).find((loc: any) => {
                              if (!loc) return false;
                              const locNormName = normalizeDriverKey(loc.driverName || '');
                              const locRawName = (loc.driverName || '').trim().toLowerCase();
                              const locDriverId = (loc.driverId || '').toString();
                              const matchName = (locNormName && normShipName && (locNormName === normShipName || locNormName.includes(normShipName) || normShipName.includes(locNormName))) ||
                                                (locRawName && rawShipName && (locRawName === rawShipName || locRawName.includes(rawShipName) || rawShipName.includes(locRawName)));
                              const matchId = (driver && (locDriverId === driver.id || locDriverId === driver.cpf)) || (rawCpf && locDriverId.replace(/\D/g, '') === rawCpf);
                              return matchName || matchId;
                            });
                          })();

                          if (locationInfo && locationInfo.isAppActive) {
                              if (locationInfo.lat === 0 && locationInfo.lng === 0) {
                                return (
                                  <span title="Motorista ativo no aplicativo, buscando GPS..." className="text-blue-500 cursor-help">
                                      <Smartphone className="w-4 h-4 animate-pulse" />
                                  </span>
                                );
                              }
                              return (
                                  <button
                                      type="button"
                                      onClick={() => setActiveDriverMap({
                                        driverName: shipment.driverName,
                                        lat: locationInfo.lat,
                                        lng: locationInfo.lng,
                                        timestamp: locationInfo.timestamp,
                                        isOffline: false,
                                      })}
                                      title="App conectado. Clique para ver localização em tempo real."
                                      className="text-blue-500 hover:text-blue-600 transition-colors focus:outline-none"
                                  >
                                      <Smartphone className="w-4 h-4 animate-pulse" />
                                  </button>
                              );
                          }

                          if (driver?.has_app || (locationInfo && (locationInfo.lat !== 0 || locationInfo.lng !== 0))) {
                              const hasCoords = locationInfo && typeof locationInfo.lat === 'number' && typeof locationInfo.lng === 'number' && (locationInfo.lat !== 0 || locationInfo.lng !== 0);
                              const formattedTime = hasCoords ? formatLocationTimestamp(locationInfo.timestamp) : null;
                              const titleText = hasCoords 
                                ? `Motorista off-line. Clique para ver última localização registrada (${formattedTime})`
                                : "Motorista possui o aplicativo (Transmissão de GPS inativa)";

                              const handleOfflineClick = () => {
                                if (hasCoords) {
                                  setActiveDriverMap({
                                    driverName: shipment.driverName,
                                    lat: locationInfo.lat,
                                    lng: locationInfo.lng,
                                    timestamp: locationInfo.timestamp,
                                    isOffline: true,
                                  });
                                } else {
                                  showToast(`O motorista ${shipment.driverName} possui cadastro no aplicativo, mas ainda não registrou coordenadas GPS anteriores.`, 'info');
                                }
                              };

                              return (
                                <button
                                    type="button"
                                    onClick={handleOfflineClick}
                                    title={titleText}
                                    className={`${hasCoords ? 'text-amber-500 hover:text-amber-600' : 'text-gray-400 hover:text-gray-600 opacity-60'} transition-colors focus:outline-none`}
                                >
                                    <Smartphone className="w-4 h-4" />
                                </button>
                              );
                          }

                          return null;
                      })()}
                    </div>
                    {shipment.horsePlate ? (
                      <div className="text-xs text-gray-600 dark:text-gray-400 flex items-center gap-1.5 font-medium mt-0.5">
                        <span 
                          onClick={(e) => handleCopyText(shipment.horsePlate, `plate_m_${shipment.id}`, e, 'Placa do Veículo')}
                          className="font-mono tracking-wider cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                          title={`Clique para copiar a Placa (${shipment.horsePlate})`}
                        >
                          {shipment.horsePlate}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => handleCopyText(shipment.horsePlate, `plate_m_${shipment.id}`, e, 'Placa do Veículo')}
                          className="p-0.5 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 rounded transition-colors cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700"
                          title={`Copiar Placa (${shipment.horsePlate})`}
                        >
                          {copiedKey === `plate_m_${shipment.id}` ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                        </button>
                      </div>
                    ) : null}
                    {(vehicle || shipment.vehicleSetType || shipment.vehicleBodyType) && (
                      <span className="mt-1 inline-block px-2 py-0.5 text-[10px] font-semibold rounded-full bg-gray-200 text-gray-700 dark:bg-gray-600 dark:text-gray-200">
                        {shipment.vehicleSetType || vehicle?.setType} / {shipment.vehicleBodyType || vehicle?.bodyType}
                      </span>
                    )}
                  </div>

                  <div>
                    <div className="text-[10px] text-gray-400 uppercase font-bold">Frete / Ton</div>
                    <div className="font-bold dark:text-gray-200">
                      {isClient 
                        ? formatCurrency(cargo?.companyFreightValuePerTon || 0)
                        : formatCurrency(shipment.driverFreightRateSnapshot || (shipment.shipmentTonnage > 0 ? shipment.driverFreightValue / shipment.shipmentTonnage : cargo?.driverFreightValuePerTon || 0))
                      }
                    </div>
                  </div>
                  {currentUser.profile !== UserProfile.Embarcador && currentUser.profile !== UserProfile.Cliente && currentUser.profile !== UserProfile.Motorista && (
                    <>
                      <div className="col-span-2 mt-1">
                        <div className="text-[10px] text-gray-400 uppercase font-bold mb-1">Detalhamento Financeiro</div>
                        <div className="flex flex-wrap gap-x-4 gap-y-2 bg-gray-50 dark:bg-gray-700/50 p-2 rounded border dark:border-gray-600">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[9px] text-gray-500 font-bold">MTR:</span>
                            <span className="text-xs font-bold dark:text-white">
                              {formatCurrency(shipment.driverFreightRateSnapshot || (shipment.shipmentTonnage > 0 ? shipment.driverFreightValue / shipment.shipmentTonnage : cargo?.driverFreightValuePerTon || 0))}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[9px] text-gray-500 font-bold">EMP:</span>
                            <span className="text-xs font-bold text-primary dark:text-blue-400">
                              {formatCurrency(shipment.companyFreightRateSnapshot || cargo?.companyFreightValuePerTon || 0)}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[9px] text-gray-500 font-bold">MARGEM:</span>
                            {(() => {
                               const companyRate = shipment.companyFreightRateSnapshot || cargo?.companyFreightValuePerTon || 0;
                               const driverRate = shipment.driverFreightRateSnapshot || (shipment.shipmentTonnage > 0 ? shipment.driverFreightValue / shipment.shipmentTonnage : cargo?.driverFreightValuePerTon || 0);
                               const commissionRate = cargo?.salespersonCommissionPerTon || 0;
                               const demurrageProfit = stays.filter(s => s.shipmentId === shipment.id).reduce((sum, s) => sum + ((s.approvedValue || 0) - (s.driverPaidValue || 0)), 0);
                               const perTonProfit = companyRate - driverRate - commissionRate + (demurrageProfit / (shipment.shipmentTonnage || 1));
                               
                               const marginPercent = companyRate > 0 ? (perTonProfit / companyRate) * 100 : 0;
                               
                               let colorClass = 'text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800';
                               if (marginPercent < 5) colorClass = 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30';
                               else if (marginPercent < 6) colorClass = 'text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/30';
                               else if (marginPercent < 7) colorClass = 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30';
                               else colorClass = 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/30';

                               return (
                                 <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${colorClass}`}>
                                   {marginPercent.toFixed(1).replace('.', ',')}%
                                 </span>
                               );
                            })()}
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>

                <div className="bg-gray-50 dark:bg-gray-700/50 p-3 rounded-lg">
                  <div className="text-[10px] text-gray-400 uppercase font-bold mb-1 flex items-center justify-between">
                    <span>Rota (Origem → Destino)</span>
                    {cargo && getCargoMapUrl('route', cargo) && (
                      <a
                        href={getCargoMapUrl('route', cargo)!}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] text-indigo-600 dark:text-indigo-400 hover:underline inline-flex items-center gap-0.5"
                        title="Abrir rota completa no Google Maps"
                      >
                        <MapPin className="w-2.5 h-2.5 text-indigo-500" /> Ver Mapa
                      </a>
                    )}
                  </div>
                  {cargo ? (
                    <div className="text-xs dark:text-gray-300 flex items-center gap-1.5 flex-wrap">
                      <a
                        href={getCargoMapUrl('origin', cargo) || '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-semibold text-gray-800 dark:text-gray-200 hover:text-emerald-600 dark:hover:text-emerald-400 hover:underline truncate"
                        title={`Abrir localização de Origem no Google Maps: ${cargo.origin}${cargo.originLocation ? ` (${cargo.originLocation})` : ''}`}
                      >
                        {cargo.origin}
                      </a>
                      {getCargoMapUrl('route', cargo) ? (
                        <a
                          href={getCargoMapUrl('route', cargo)!}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:scale-110 transition-transform"
                          title="Traçar rota no Google Maps"
                        >
                          →
                        </a>
                      ) : (
                        <span className="mx-1 text-gray-400">→</span>
                      )}
                      <a
                        href={getCargoMapUrl('destination', cargo) || '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-semibold text-gray-800 dark:text-gray-200 hover:text-rose-600 dark:hover:text-rose-400 hover:underline truncate"
                        title={`Abrir localização de Destino no Google Maps: ${cargo.destination}${cargo.destinationLocation ? ` (${cargo.destinationLocation})` : ''}`}
                      >
                        {cargo.destination}
                      </a>
                    </div>
                  ) : (
                    <span className="text-red-500 font-bold text-[10px]">CARGA REMOVIDA</span>
                  )}
                  {(() => {
                    const isCteApplicable = isCteApplicableForStatus(shipment.status);
                    const cteVal = isCteApplicable ? getShipmentCte(shipment) : '-';
                    const cteDate = isCteApplicable ? getShipmentCteEmissionDate(shipment) : null;
                    const isEditingThisCte = editingCteId === shipment.id;
                    const canEditCte = isCteApplicable && !isClient && !!onUpdateShipmentData;

                    if (isEditingThisCte) {
                      return (
                        <div className="mt-2 p-2 bg-blue-50/70 dark:bg-blue-900/30 rounded border border-blue-200 dark:border-blue-800 flex flex-col gap-1.5 w-full sm:w-auto">
                          <span className="text-[10px] text-blue-700 dark:text-blue-300 font-bold uppercase">Editar CT-e:</span>
                          <input
                            type="text"
                            value={editingCteValue}
                            onChange={(e) => setEditingCteValue(e.target.value)}
                            placeholder="Nº do CT-e (ex: 1753)"
                            className="w-full sm:w-44 px-2 py-1 text-xs font-semibold border border-blue-400 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                            autoFocus
                          />
                          <input
                            type="text"
                            value={editingCteDateValue}
                            onChange={(e) => setEditingCteDateValue(e.target.value)}
                            placeholder="Emissão (ex: 13/08/2026 11:40)"
                            className="w-full sm:w-44 px-2 py-1 text-[11px] font-medium border border-blue-300 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleSaveCte(shipment.id);
                              } else if (e.key === 'Escape') {
                                setEditingCteId(null);
                              }
                            }}
                          />
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <button
                              onClick={() => handleSaveCte(shipment.id)}
                              className="px-2.5 py-1 text-xs font-bold text-white bg-green-600 hover:bg-green-700 rounded shadow-xs"
                              title="Salvar"
                            >
                              Salvar
                            </button>
                            <button
                              onClick={() => setEditingCteId(null)}
                              className="px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-200 dark:text-gray-300 dark:hover:bg-gray-700 rounded"
                              title="Cancelar"
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      );
                    }

                    if (cteVal !== '-' || canEditCte) {
                      return (
                        <div className="mt-2 flex flex-col gap-0.5">
                          <div className="flex items-center gap-1.5 bg-blue-50 dark:bg-blue-900/30 px-2 py-1 rounded border border-blue-200 dark:border-blue-800 w-fit group/cte">
                            <FileText className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                            <span className="text-[10px] text-blue-700 dark:text-blue-300 font-bold uppercase">CTE:</span>
                            {(() => {
                              const cteFile = getShipmentCteFileUrl(shipment);
                              return (
                                <div className="flex items-center gap-1">
                                  <span 
                                    onClick={() => {
                                      if (cteFile) {
                                        openDocumentInNewTab(cteFile, `CTE_${cteVal}`);
                                      } else if (canEditCte) {
                                        setEditingCteId(shipment.id);
                                        setEditingCteValue(shipment.cteNumber || (cteVal !== '-' ? cteVal : ''));
                                        setEditingCteDateValue(shipment.cteEmissionDate || (cteDate || ''));
                                      }
                                    }}
                                    className={`text-xs font-bold text-blue-900 dark:text-blue-200 ${
                                      cteFile ? 'cursor-pointer hover:underline text-blue-600 dark:text-blue-400' : canEditCte ? 'cursor-pointer hover:underline' : ''
                                    }`}
                                    title={cteFile ? "Clique para abrir o PDF do CT-e em nova aba" : canEditCte ? "Clique para editar o CT-e" : undefined}
                                  >
                                    {cteVal !== '-' ? cteVal : 'Adicionar CT-e'}
                                  </span>
                                  {cteFile && (
                                    <button
                                      type="button"
                                      onClick={() => openDocumentInNewTab(cteFile, `CTE_${cteVal}`)}
                                      className="p-0.5 rounded text-blue-600 hover:text-blue-800 transition-colors"
                                      title="Abrir PDF do CT-e"
                                    >
                                      <ExternalLink className="w-3 h-3" />
                                    </button>
                                  )}
                                </div>
                              );
                            })()}
                            {canEditCte && (
                              <button
                                onClick={() => {
                                  setEditingCteId(shipment.id);
                                  setEditingCteValue(shipment.cteNumber || (cteVal !== '-' ? cteVal : ''));
                                  setEditingCteDateValue(shipment.cteEmissionDate || (cteDate || ''));
                                }}
                                className="p-0.5 rounded text-blue-600 hover:bg-blue-200 dark:hover:bg-blue-800 transition-all ml-1"
                                title="Editar CT-e"
                              >
                                <Pencil className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                          {cteDate && (
                            <span className="text-[10px] text-gray-500 dark:text-gray-400 font-medium pl-1">
                              Emissão: {cteDate}
                            </span>
                          )}
                        </div>
                      );
                    }

                    return null;
                  })()}
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-gray-50 dark:border-gray-700">
                  <div className="flex gap-2">
                    {whatsappLink && (
                      <a href={whatsappLink} target="_blank" rel="noopener noreferrer" className="p-1 hover:opacity-80 transition-opacity">
                        <WhatsAppIcon className="w-7 h-7" />
                      </a>
                    )}
                    {onShowHistory && (
                      <button onClick={() => onShowHistory(shipment)} className="p-2 rounded-full bg-gray-50 text-gray-600 dark:bg-gray-700 dark:text-gray-400">
                        <HistoryIcon className="w-5 h-5" />
                      </button>
                    )}
                  </div>
                  
                  <div className="flex gap-2">
                    {(!isClient || showActionsColumnForClient) && (
                      currentUser.profile === UserProfile.Motorista && shipment.status !== ShipmentStatus.AguardandoCarregamento && shipment.status !== ShipmentStatus.AguardandoDescarga ? null : (
                        <button 
                          onClick={(e) => toggleActionMenu(shipment.id, e)}
                          className="flex items-center gap-2 px-3 py-1.5 bg-primary text-white text-xs rounded-md shadow-sm hover:bg-primary/90"
                        >
                          Ações <MoreVerticalIcon className="w-3 h-3" />
                        </button>
                      )
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Desktop View - Table */}
        <div className="hidden lg:block overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th scope="col" className="px-6 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 tracking-wider">Embarque / Carga</th>
                <th scope="col" className="px-6 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 tracking-wider">Motorista / Solicitante</th>
                <th scope="col" className="px-6 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 tracking-wider">Origem / Destino</th>
                <th scope="col" className="px-6 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 tracking-wider">CTE</th>
                {currentUser.profile !== UserProfile.Embarcador && currentUser.profile !== UserProfile.Cliente && currentUser.profile !== UserProfile.Motorista && (
                  <th scope="col" className="px-6 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 tracking-wider">Margem</th>
                )}
                <th scope="col" className="px-6 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 tracking-wider">Frete / Ton</th>
                <th scope="col" className="px-6 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 tracking-wider">Status Atual</th>
                <th scope="col" className="px-6 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 tracking-wider">Data Programada</th>
                {(!isClient || showActionsColumnForClient) && (
                  <th scope="col" className="px-6 py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-300 tracking-wider">Ações</th>
                )}
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {paginatedShipments.map((shipment) => {
                const cargo = getCargoInfo(shipment.cargoId);
                const vehicle = vehicles.find(v => v.plate === shipment.horsePlate);
                const isActionable = shipment.status !== ShipmentStatus.Finalizado && shipment.status !== ShipmentStatus.Cancelado;
                const whatsappLink = shipment.driverContact ? formatWhatsAppLink(shipment.driverContact) : null;
                const advanceStatusCheck = canUserAdvanceStatus ? canUserAdvanceStatus(shipment) : { allowed: true, reason: '' };
                const canAdvance = advanceStatusCheck.allowed;
                const disabledReason = advanceStatusCheck.reason;
                const statusHistoryCount = shipment.statusHistory?.length || 0;

                let isLate = false;
                if (shipment.scheduledTime && !shipment.arrivalTime) {
                  const scheduledDateTime = new Date(`${shipment.scheduledDate}T${shipment.scheduledTime}`);
                  if (new Date() > scheduledDateTime) {
                      isLate = true;
                  }
                }

                return (
                  <tr key={shipment.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                    <td className="px-6 py-[11px] whitespace-nowrap text-sm">
                      <div className="flex items-center gap-1">
                        {isClient ? (
                            <span className="font-medium text-gray-700 dark:text-gray-300 text-left block">
                                {shipment.id}
                            </span>
                        ) : (
                            <button 
                                onClick={() => setDetailsModalShipment(shipment)} 
                                className="font-medium text-primary dark:text-blue-400 hover:underline text-left block"
                            >
                                {shipment.id}
                            </button>
                        )}
                        {currentUser?.profile !== UserProfile.Cliente && tickets.some(t => t.shipmentId === shipment.id && t.status !== TicketStatus.Fechado && t.status !== TicketStatus.Resolvido) && (
                          <span className="text-red-500 inline-flex items-center" title="Chamado(s) Aberto(s)">
                            <AlertCircle className="w-4 h-4" />
                          </span>
                        )}
                        {(shipment.isComplementar || (shipment.documents as any)?.is_complementar) && (
                        <span 
                          className="px-1.5 py-0.5 text-[9px] font-black uppercase rounded bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300 border border-purple-300 dark:border-purple-800 ml-1 inline-flex items-center"
                          title={shipment.parentShipmentId ? `Complementar do Embarque #${shipment.parentShipmentId}` : 'Embarque Complementar'}
                        >
                          Complementar{shipment.parentShipmentId ? ` (#${shipment.parentShipmentId})` : ''}
                        </span>
                      )}
                    </div>
                    {cargo && (
                        <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5 flex-wrap mt-0.5">
                          <span>
                            Carga: 
                            {onShowCargoDetails ? (
                              <button onClick={() => onShowCargoDetails(cargo)} className="ml-1 font-semibold text-primary dark:text-blue-400 hover:underline">
                                {cargo.sequenceId}
                              </button>
                            ) : (
                              <span className="ml-1 font-semibold">{cargo.sequenceId}</span>
                            )}
                          </span>

                          {(() => {
                            const tmsOrderUrl = getShipmentTmsOrderUrl(shipment);
                            const isAgCarregamento = shipment.status === ShipmentStatus.AguardandoCarregamento;
                            const isUploadingThis = uploadingTmsOrderId === shipment.id;

                            if (tmsOrderUrl) {
                              return (
                                <div className="inline-flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openDocumentInNewTab(tmsOrderUrl, `Ordem de Carregamento TMS - Carga ${cargo.sequenceId} - ${shipment.id}`);
                                    }}
                                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 hover:bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 dark:hover:bg-emerald-900/60 border border-emerald-300 dark:border-emerald-700 shadow-xs transition-colors cursor-pointer"
                                    title="Ordem de Carregamento TMS Anexada. Clique para abrir em nova aba com opções de imprimir e baixar."
                                  >
                                    <FileText className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                                    <span>OC TMS</span>
                                    <ExternalLink className="w-2.5 h-2.5 opacity-70" />
                                  </button>
                                  {!isClient && !isDemo && (
                                    <button
                                      type="button"
                                      onClick={(e) => handleTriggerUploadTmsOrder(shipment, e)}
                                      className="p-0.5 text-gray-400 hover:text-emerald-700 dark:hover:text-emerald-300 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                      title="Substituir Ordem de Carregamento TMS"
                                    >
                                      <Pencil className="w-2.5 h-2.5" />
                                    </button>
                                  )}
                                </div>
                              );
                            }

                            if (isAgCarregamento && !isClient && !isDemo) {
                              return (
                                <button
                                  type="button"
                                  disabled={isUploadingThis}
                                  onClick={(e) => handleTriggerUploadTmsOrder(shipment, e)}
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 hover:bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300 dark:hover:bg-amber-900/60 border border-amber-300 dark:border-amber-700 shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                                  title="Anexar Ordem de Carregamento do TMS"
                                >
                                  {isUploadingThis ? (
                                    <>
                                      <Loader2 className="w-3 h-3 animate-spin text-amber-600 dark:text-amber-400" />
                                      <span>Enviando...</span>
                                    </>
                                  ) : (
                                    <>
                                      <Paperclip className="w-2.5 h-2.5 text-amber-600 dark:text-amber-400 shrink-0" />
                                      <span>+ OC TMS</span>
                                    </>
                                  )}
                                </button>
                              );
                            }

                            return null;
                          })()}
                        </div>
                      )}

                      {/* PENDÊNCIA DO STATUS ATUAL */}
                      {shipment.status !== ShipmentStatus.Cancelado && (
                        <div className="mt-1.5">
                          {shipment.statusPendingObservation ? (
                            <div
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenPendingModal(shipment);
                              }}
                              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-300 shadow-xs hover:bg-amber-100 dark:hover:bg-amber-900/60 cursor-pointer max-w-[210px] group/pend transition-all"
                              title="Clique para editar ou limpar a pendência do status"
                            >
                              <AlertCircle className="w-3 h-3 text-amber-600 dark:text-amber-400 shrink-0" />
                              <span className="truncate">{shipment.statusPendingObservation}</span>
                              <Pencil className="w-2.5 h-2.5 opacity-0 group-hover/pend:opacity-100 shrink-0 text-amber-700 dark:text-amber-300 transition-opacity" />
                            </div>
                          ) : (
                            !isDemo && onUpdateShipmentData && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleOpenPendingModal(shipment);
                                }}
                                className="text-[11px] font-medium text-amber-700/80 dark:text-amber-400/80 hover:text-amber-900 dark:hover:text-amber-200 inline-flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity py-0.5 px-1.5 rounded hover:bg-amber-50/60 dark:hover:bg-amber-950/30"
                                title="Informar nota rápida de pendência para este status"
                              >
                                <AlertCircle className="w-3 h-3 text-amber-600/70 shrink-0" />
                                <span>+ Pendência</span>
                              </button>
                            )
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-[11px] whitespace-nowrap">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {(() => {
                          const atua = getDriverCodigoAtua(shipment);
                          return atua ? (
                            <span 
                              onClick={(e) => handleCopyText(atua, `atua_${shipment.id}`, e, 'Código ATUA')}
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-black font-mono bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-200 border border-blue-300 dark:border-blue-700/60 shadow-2xs shrink-0 cursor-pointer hover:bg-blue-200/80 dark:hover:bg-blue-800/80 transition-colors" 
                              title={`Código ATUA: ${atua} (Clique para copiar)`}
                            >
                              <span>{atua}</span>
                              <button
                                type="button"
                                onClick={(e) => handleCopyText(atua, `atua_${shipment.id}`, e, 'Código ATUA')}
                                className="text-blue-600 hover:text-blue-950 dark:text-blue-300 dark:hover:text-white transition-colors cursor-pointer p-0.5 rounded hover:bg-blue-200/50 dark:hover:bg-blue-800/50"
                                title={`Copiar Código ATUA (${atua})`}
                              >
                                {copiedKey === `atua_${shipment.id}` ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                              </button>
                            </span>
                          ) : null;
                        })()}
                        <div className="text-sm font-medium text-gray-900 dark:text-white">{shipment.driverName}</div>
                        {(() => {
                            const driver = drivers?.find(d => 
                              d.name === shipment.driverName || 
                              normalizeDriverKey(d.name) === normalizeDriverKey(shipment.driverName) || 
                              (d.cpf && shipment.driverCpf && d.cpf.replace(/\D/g, '') === shipment.driverCpf.replace(/\D/g, ''))
                            );

                            const normShipName = normalizeDriverKey(shipment.driverName);
                            const rawShipName = (shipment.driverName || '').trim().toLowerCase();
                            const rawCpf = (shipment.driverCpf || driver?.cpf || '').replace(/\D/g, '');

                            const locationInfo = (() => {
                              if (driver?.id && driverLocations.has(driver.id)) return driverLocations.get(driver.id);
                              if (rawCpf && driverLocations.has(rawCpf)) return driverLocations.get(rawCpf);
                              if (normShipName && driverLocations.has(normShipName)) return driverLocations.get(normShipName);
                              if (rawShipName && driverLocations.has(rawShipName)) return driverLocations.get(rawShipName);

                              return Array.from(driverLocations.values()).find((loc: any) => {
                                if (!loc) return false;
                                const locNormName = normalizeDriverKey(loc.driverName || '');
                                const locRawName = (loc.driverName || '').trim().toLowerCase();
                                const locDriverId = (loc.driverId || '').toString();
                                const matchName = (locNormName && normShipName && (locNormName === normShipName || locNormName.includes(normShipName) || normShipName.includes(locNormName))) ||
                                                  (locRawName && rawShipName && (locRawName === rawShipName || locRawName.includes(rawShipName) || rawShipName.includes(locRawName)));
                                const matchId = (driver && (locDriverId === driver.id || locDriverId === driver.cpf)) || (rawCpf && locDriverId.replace(/\D/g, '') === rawCpf);
                                return matchName || matchId;
                              });
                            })();

                            if (locationInfo && locationInfo.isAppActive) {
                                if (locationInfo.lat === 0 && locationInfo.lng === 0) {
                                  return (
                                    <span title="Motorista ativo no aplicativo, buscando GPS..." className="text-blue-500 cursor-help">
                                        <Smartphone className="w-4 h-4 animate-pulse" />
                                  </span>
                                );
                                }
                                return (
                                    <button
                                        type="button"
                                        onClick={() => setActiveDriverMap({
                                          driverName: shipment.driverName,
                                          lat: locationInfo.lat,
                                          lng: locationInfo.lng,
                                          timestamp: locationInfo.timestamp,
                                          isOffline: false,
                                        })}
                                        title="App conectado. Clique para ver localização em tempo real."
                                        className="text-blue-500 hover:text-blue-600 transition-colors focus:outline-none"
                                    >
                                        <Smartphone className="w-4 h-4 animate-pulse" />
                                    </button>
                                );
                            }

                            if (driver?.has_app || (locationInfo && (locationInfo.lat !== 0 || locationInfo.lng !== 0))) {
                                const hasCoords = locationInfo && typeof locationInfo.lat === 'number' && typeof locationInfo.lng === 'number' && (locationInfo.lat !== 0 || locationInfo.lng !== 0);
                                const formattedTime = hasCoords ? formatLocationTimestamp(locationInfo.timestamp) : null;
                                const titleText = hasCoords 
                                  ? `Motorista off-line. Clique para ver última localização registrada (${formattedTime})`
                                  : "Motorista possui o aplicativo (Transmissão de GPS inativa)";

                                const handleOfflineClick = () => {
                                  if (hasCoords) {
                                    setActiveDriverMap({
                                      driverName: shipment.driverName,
                                      lat: locationInfo.lat,
                                      lng: locationInfo.lng,
                                      timestamp: locationInfo.timestamp,
                                      isOffline: true,
                                    });
                                  } else {
                                    showToast(`O motorista ${shipment.driverName} possui cadastro no aplicativo, mas ainda não registrou coordenadas GPS anteriores.`, 'info');
                                  }
                                };

                                return (
                                  <button
                                      type="button"
                                      onClick={handleOfflineClick}
                                      title={titleText}
                                      className={`${hasCoords ? 'text-amber-500 hover:text-amber-600' : 'text-gray-400 hover:text-gray-600 opacity-60'} transition-colors focus:outline-none`}
                                  >
                                      <Smartphone className="w-4 h-4" />
                                  </button>
                                );
                            }
                            
                            return null;
                        })()}
                      </div>
                      {shipment.horsePlate ? (
                        <div className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1.5 mt-0.5">
                          <span 
                            onClick={(e) => handleCopyText(shipment.horsePlate, `plate_${shipment.id}`, e, 'Placa do Veículo')}
                            className="font-mono tracking-wider cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                            title={`Clique para copiar a Placa (${shipment.horsePlate})`}
                          >
                            {shipment.horsePlate}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => handleCopyText(shipment.horsePlate, `plate_${shipment.id}`, e, 'Placa do Veículo')}
                            className="p-0.5 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 rounded transition-colors cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700"
                            title={`Copiar Placa (${shipment.horsePlate})`}
                          >
                            {copiedKey === `plate_${shipment.id}` ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      ) : null}
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 flex items-center gap-1">
                          Sol.: <span className="font-medium">{getEmbarcadorName(shipment.embarcadorId)}</span>
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
                                <WhatsAppIcon className="w-3.5 h-3.5" />
                              </a>
                            );
                          })()}
                      </div>
                      <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 flex items-center gap-1">
                          <Clock className="w-3 h-3 text-gray-400 shrink-0" />
                          <span>Solicitado: <span className="font-medium text-gray-700 dark:text-gray-300">{formatRequestedDateTime(shipment)}</span></span>
                      </div>
                      {(vehicle || shipment.vehicleSetType || shipment.vehicleBodyType) && (
                          <div className="mt-1">
                          <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-gray-200 text-gray-700 dark:bg-gray-600 dark:text-gray-200">
                              {shipment.vehicleSetType || vehicle?.setType} / {shipment.vehicleBodyType || vehicle?.bodyType}
                          </span>
                          </div>
                      )}
                    </td>
                    <td className="px-6 py-[11px] whitespace-nowrap text-sm text-gray-900 dark:text-white group relative">
                      {cargo ? (
                        <>
                          <div>
                            <a
                              href={getCargoMapUrl('origin', cargo) || '#'}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="hover:text-emerald-600 dark:hover:text-emerald-400 hover:underline inline-flex items-center gap-1"
                              title={`Abrir localização de Origem no Google Maps: ${cargo.origin}${cargo.originLocation ? ` (${cargo.originLocation})` : ''}`}
                            >
                              <span>{cargo.origin}</span>
                            </a>
                          </div>
                          <div className="text-sm text-gray-500 dark:text-gray-400">
                            <a
                              href={getCargoMapUrl('destination', cargo) || '#'}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="hover:text-rose-600 dark:hover:text-rose-400 hover:underline inline-flex items-center gap-1"
                              title={`Abrir localização de Destino no Google Maps: ${cargo.destination}${cargo.destinationLocation ? ` (${cargo.destinationLocation})` : ''}`}
                            >
                              <span>{cargo.destination}</span>
                            </a>
                          </div>
                        </>
                      ) : (
                        <div className="flex flex-col">
                          <span className="text-red-500 dark:text-red-400 font-bold text-[10px] uppercase">Carga Removida</span>
                          <span className="text-gray-400 text-xs italic">Origem/Destino indisponíveis</span>
                        </div>
                      )}
                       {cargo && onShowCargoDetails && (
                          <button 
                              onClick={() => onShowCargoDetails(cargo)} 
                              className="absolute top-1/2 right-2 -translate-y-1/2 p-1 rounded-full text-gray-400 dark:text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-gray-200 dark:hover:bg-gray-600"
                              title="Ver detalhes da Carga"
                          >
                              <InfoIcon className="w-4 h-4" />
                          </button>
                      )}
                    </td>
                    <td className="px-6 py-[11px] whitespace-nowrap text-sm">
                      {(() => {
                        const isCteApplicable = isCteApplicableForStatus(shipment.status);
                        const cteVal = isCteApplicable ? getShipmentCte(shipment) : '-';
                        const cteDate = isCteApplicable ? getShipmentCteEmissionDate(shipment) : null;
                        const isEditingThisCte = editingCteId === shipment.id;
                        const canEditCte = isCteApplicable && !isClient && !!onUpdateShipmentData;

                        if (isEditingThisCte) {
                          return (
                            <div className="flex flex-col gap-1.5 p-2 bg-blue-50/70 dark:bg-blue-900/30 rounded border border-blue-200 dark:border-blue-800">
                              <span className="text-[10px] text-blue-700 dark:text-blue-300 font-bold uppercase">Editar CT-e:</span>
                              <input
                                type="text"
                                value={editingCteValue}
                                onChange={(e) => setEditingCteValue(e.target.value)}
                                placeholder="Nº do CT-e (ex: 1753)"
                                className="w-36 px-2 py-1 text-xs font-semibold border border-blue-400 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                autoFocus
                              />
                              <input
                                type="text"
                                value={editingCteDateValue}
                                onChange={(e) => setEditingCteDateValue(e.target.value)}
                                placeholder="Emissão (ex: 13/08/2026 11:40)"
                                className="w-36 px-2 py-1 text-[11px] font-medium border border-blue-300 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    handleSaveCte(shipment.id);
                                  } else if (e.key === 'Escape') {
                                    setEditingCteId(null);
                                  }
                                }}
                              />
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <button
                                  onClick={() => handleSaveCte(shipment.id)}
                                  className="px-2 py-0.5 text-xs font-bold text-white bg-green-600 hover:bg-green-700 rounded shadow-xs"
                                  title="Salvar"
                                >
                                  Salvar
                                </button>
                                <button
                                  onClick={() => setEditingCteId(null)}
                                  className="px-2 py-0.5 text-xs font-medium text-gray-600 hover:bg-gray-200 dark:text-gray-300 dark:hover:bg-gray-700 rounded"
                                  title="Cancelar"
                                >
                                  Cancelar
                                </button>
                              </div>
                            </div>
                          );
                        }

                        return (
                          <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-1.5 group/cte">
                              {cteVal && cteVal !== '-' ? (() => {
                                const cteFile = getShipmentCteFileUrl(shipment);
                                return (
                                  <div className="inline-flex items-center gap-1">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (cteFile) {
                                          openDocumentInNewTab(cteFile, `CTE_${cteVal}`);
                                        } else if (canEditCte) {
                                          setEditingCteId(shipment.id);
                                          setEditingCteValue(shipment.cteNumber || (cteVal !== '-' ? cteVal : ''));
                                          setEditingCteDateValue(shipment.cteEmissionDate || (cteDate || ''));
                                        }
                                      }}
                                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 border border-blue-200 dark:border-blue-800 shadow-sm cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900/70 transition-colors"
                                      title={cteFile ? "Clique para abrir o PDF do CT-e em nova aba" : canEditCte ? "Clique para editar o CT-e" : `CT-e nº ${cteVal}`}
                                    >
                                      <FileText className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" />
                                      <span>{cteVal}</span>
                                      {cteFile && <ExternalLink className="w-2.5 h-2.5 opacity-80" />}
                                    </button>
                                  </div>
                                );
                              })() : (
                                <span 
                                  onClick={() => {
                                    if (canEditCte) {
                                      setEditingCteId(shipment.id);
                                      setEditingCteValue(shipment.cteNumber || '');
                                      setEditingCteDateValue(shipment.cteEmissionDate || (cteDate || ''));
                                    }
                                  }}
                                  className={`text-gray-400 text-xs italic ${canEditCte ? 'cursor-pointer hover:text-blue-500 hover:underline' : ''}`}
                                  title={canEditCte ? "Clique para adicionar o CT-e" : undefined}
                                >
                                  -
                                </span>
                              )}

                              {canEditCte && (
                                <button
                                  onClick={() => {
                                    setEditingCteId(shipment.id);
                                    setEditingCteValue(shipment.cteNumber || (cteVal !== '-' ? cteVal : ''));
                                    setEditingCteDateValue(shipment.cteEmissionDate || (cteDate || ''));
                                  }}
                                  className="p-1 rounded text-gray-400 opacity-0 group-hover/cte:opacity-100 hover:text-blue-600 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all"
                                  title="Editar CT-e"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                            {cteDate && (
                              <span className="text-[10px] text-gray-500 dark:text-gray-400 font-medium pl-0.5">
                                {cteDate}
                              </span>
                            )}
                          </div>
                        );
                      })()}
                    </td>
                    {currentUser.profile !== UserProfile.Embarcador && currentUser.profile !== UserProfile.Cliente && currentUser.profile !== UserProfile.Motorista && (
                      <td className="px-6 py-[11px] whitespace-nowrap text-sm">
                        {(() => {
                          const companyRate = shipment.companyFreightRateSnapshot || cargo?.companyFreightValuePerTon || 0;
                          const driverRate = shipment.driverFreightRateSnapshot || (shipment.shipmentTonnage > 0 ? shipment.driverFreightValue / shipment.shipmentTonnage : cargo?.driverFreightValuePerTon || 0);
                          const commissionRate = cargo?.salespersonCommissionPerTon || 0;
                          const perTonProfit = companyRate - driverRate - commissionRate;
                          const marginPercent = companyRate > 0 ? (perTonProfit / companyRate) * 100 : 0;
                          
                          let colorClass = 'text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800';
                          if (marginPercent < 5) colorClass = 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30';
                          else if (marginPercent < 6) colorClass = 'text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/30';
                          else if (marginPercent < 7) colorClass = 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30';
                          else colorClass = 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/30';

                          return (
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${colorClass}`}>
                              {marginPercent.toFixed(1).replace('.', ',')}%
                            </span>
                          );
                        })()}
                      </td>
                    )}
                    <td className="px-6 py-[11px] whitespace-nowrap text-sm">
                      <div className="space-y-1">
                        {currentUser.profile !== UserProfile.Cliente && (
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] text-gray-400 font-bold uppercase">Mtr:</span>
                            <span className="font-bold text-gray-900 dark:text-white">
                              {formatCurrency(shipment.driverFreightRateSnapshot || (shipment.shipmentTonnage > 0 ? shipment.driverFreightValue / shipment.shipmentTonnage : cargo?.driverFreightValuePerTon || 0))}
                            </span>
                          </div>
                        )}
                        {currentUser.profile !== UserProfile.Embarcador && currentUser.profile !== UserProfile.Motorista && (
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] text-gray-400 font-bold uppercase">Emp:</span>
                            <span className="font-medium text-primary dark:text-blue-400">
                              {formatCurrency(shipment.companyFreightRateSnapshot || cargo?.companyFreightValuePerTon || 0)}
                            </span>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-[11px] whitespace-nowrap">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">{shipment.status}</p>
                      {shipment.status === ShipmentStatus.Cancelado && shipment.cancellationReason && (
                        <p className="text-[11px] text-red-600 dark:text-red-400 font-medium mt-1 max-w-[150px] whitespace-normal italic">
                          Motivo: {shipment.cancellationReason}
                        </p>
                      )}
                      {[ShipmentStatus.AguardandoNota, ShipmentStatus.AguardandoFiscal, ShipmentStatus.AguardandoAdiantamento, ShipmentStatus.AguardandoAgendamento, ShipmentStatus.AguardandoDescarga, ShipmentStatus.ValidacaoTicket, ShipmentStatus.AguardandoPagamentoSaldo, ShipmentStatus.Finalizado].includes(shipment.status) && (
                        <p className="text-xs text-blue-600 dark:text-blue-400 font-bold mt-1">
                          Efetivado: {(Number(shipment.shipmentTonnage) || 0).toLocaleString('pt-BR')} ton
                        </p>
                      )}
                      {shipment.scheduledTime && (
                          <p 
                            className={`text-xs mt-1 ${isLate && !shipment.arrivalTime ? 'text-yellow-500' : 'text-gray-500'} cursor-pointer hover:underline flex items-center gap-1`}
                            onClick={() => onOpenEditScheduledDateTime && onOpenEditScheduledDateTime(shipment)}
                            title="Clique para alterar data/hora"
                          >
                            <Clock className="w-3 h-3" />
                            Previsto: {shipment.scheduledTime}
                          </p>
                      )}

                      {shipment.arrivalTime ? (
                          <div className="text-xs text-green-600 dark:text-green-400 font-semibold mt-1">
                              Chegou: {new Date(shipment.arrivalTime).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                          </div>
                      ) : (
                          onMarkArrival && shipment.scheduledTime && (
                              <button onClick={() => onMarkArrival(shipment.id)} className="mt-2 text-xs px-2 py-1 bg-green-600 text-white rounded hover:bg-green-700">
                                  Marcar Chegada
                              </button>
                          )
                      )}
                    </td>
                    <td 
                      className="px-6 py-[11px] whitespace-nowrap text-sm text-gray-500 dark:text-gray-400 cursor-pointer hover:text-primary dark:hover:text-blue-400 transition-colors group/date"
                      onClick={() => onOpenEditScheduledDateTime && onOpenEditScheduledDateTime(shipment)}
                      title="Clique para alterar data/hora"
                    >
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 opacity-0 group-hover/date:opacity-100 transition-opacity" />
                        <span>{new Date(shipment.scheduledDate + 'T00:00:00').toLocaleDateString('pt-BR')}</span>
                      </div>
                    </td>

                    {(!isClient || showActionsColumnForClient) && (
                      <td className="px-6 py-[11px] whitespace-nowrap text-center text-sm font-medium">
                          {isClient ? (
                              <>
                                  {onAttach && (
                                      <button
                                      onClick={() => onAttach(shipment)}
                                      className="flex items-center gap-1.5 text-xs px-2 py-1 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 dark:bg-gray-600 dark:text-gray-200 dark:hover:bg-gray-500 transition-colors whitespace-nowrap"
                                      title="Gerenciar Anexos"
                                      >
                                      <PaperclipIcon className="w-4 h-4" />
                                      <span>Gestor de Anexos</span>
                                      </button>
                                  )}
                              </>
                          ) : (
                              <div className="flex items-center justify-center space-x-1">
                                  {currentUser.profile === UserProfile.Motorista ? (
                                      shipment.status !== ShipmentStatus.AguardandoCarregamento && shipment.status !== ShipmentStatus.AguardandoDescarga ? null : (
                                          <div className="relative">
                                              <button
                                                  onClick={(e) => toggleActionMenu(shipment.id, e)}
                                                  className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-500 dark:text-gray-400"
                                                  title="Mais ações"
                                              >
                                                  <MoreVerticalIcon className="h-5 w-5" />
                                              </button>
                                              {openActionMenu === shipment.id && menuPosition && createPortal(
                                                  <div 
                                                    ref={actionMenuRef}
                                                    style={{
                                                      position: 'fixed',
                                                      top: menuPosition.isUp ? 'auto' : `${menuPosition.top + 8}px`,
                                                      bottom: menuPosition.isUp ? `${window.innerHeight - menuPosition.top + 8}px` : 'auto',
                                                      left: `${menuPosition.left - 172}px`,
                                                      zIndex: 9999
                                                    }}
                                                    className="w-[172px] bg-white dark:bg-gray-800 rounded-md shadow-lg ring-1 ring-black ring-opacity-5 animate-in fade-in zoom-in duration-100 py-0.5"
                                                  >
                                                      <div className="py-0.5" role="menu" aria-orientation="vertical">
                                                          {shipment.status === ShipmentStatus.AguardandoCarregamento && (
                                                              <>
                                                                  <ActionMenuItem icon={MapPin} text="Informar Rota do Motorista" onClick={() => onAttach && onAttach(shipment)} />
                                                                  <ActionMenuItem icon={PaperclipIcon} text="Ticket de Carregamento" onClick={() => onAttach && onAttach(shipment)} />
                                                                  <ActionMenuItem icon={Package} text="Toneladas Carregadas" onClick={() => onAttach && onAttach(shipment)} />
                                                              </>
                                                          )}
                                                          {shipment.status === ShipmentStatus.AguardandoDescarga && (
                                                              <ActionMenuItem icon={PaperclipIcon} text="Comprovante de Descarga" onClick={() => onAttach && onAttach(shipment)} />
                                                          )}
                                                      </div>
                                                  </div>,
                                                  document.body
                                              )}
                                          </div>
                                      )
                                  ) : (
                                      <>
                                          {whatsappLink && (
                                              <a
                                                  href={whatsappLink}
                                                  target="_blank"
                                                  rel="noopener noreferrer"
                                                  className="p-1 hover:opacity-80 transition-opacity"
                                                  title="Abrir WhatsApp"
                                              >
                                                  <WhatsAppIcon className="w-6 h-6" />
                                              </a>
                                          )}
          
                                          {shipment.status === ShipmentStatus.Cancelado && !isDeveloperUser(currentUser) && currentUser.profile !== UserProfile.Desenvolvedor && currentUser.profile !== UserProfile.Admin && currentUser.profile !== UserProfile.Diretor && currentUser.profile !== UserProfile.GerenciadoraDeRisco && !isGerenciadora ? (
                                              <span className="text-xs text-gray-400 dark:text-gray-500 italic px-2">Cancelado</span>
                                          ) : (
                                              <div className="relative">
                                                  <button
                                                      onClick={(e) => toggleActionMenu(shipment.id, e)}
                                                      className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-500 dark:text-gray-400"
                                                      title="Mais ações"
                                                  >
                                                      <MoreVerticalIcon className="h-5 w-5" />
                                                  </button>
                                                  
                                                  {openActionMenu === shipment.id && menuPosition && createPortal(
                                                      <div 
                                                        ref={actionMenuRef}
                                                        style={{
                                                          position: 'fixed',
                                                          top: menuPosition.isUp ? 'auto' : `${menuPosition.top + 8}px`,
                                                          bottom: menuPosition.isUp ? `${window.innerHeight - menuPosition.top + 8}px` : 'auto',
                                                          left: `${menuPosition.left - 172}px`,
                                                          zIndex: 9999
                                                        }}
                                                        className="w-[172px] bg-white dark:bg-gray-800 rounded-md shadow-lg ring-1 ring-black ring-opacity-5 animate-in fade-in zoom-in duration-100 py-0.5"
                                                      >
                                                          <div className="py-0.5" role="menu" aria-orientation="vertical">
                                                              {onShowHistory && <ActionMenuItem icon={HistoryIcon} text="Ver Histórico" onClick={() => onShowHistory(shipment)} />}
                                                              {shipment.status !== ShipmentStatus.Cancelado && (
                                                                  <>
                                                                      {isActionable && onAttach && (
                                                                        <ActionMenuItem 
                                                                            icon={PaperclipIcon} 
                                                                            text="Anexar e Avançar" 
                                                                            onClick={() => onAttach(shipment)} 
                                                                            disabled={!canAdvance && shipment.status !== ShipmentStatus.AguardandoAdiantamento} 
                                                                            title={(!canAdvance && shipment.status !== ShipmentStatus.AguardandoAdiantamento) ? disabledReason : undefined} 
                                                                        />
                                                                      )}
                                                                      {shipment.status === ShipmentStatus.PreCadastro && onOpenCadastroAntt && <ActionMenuItem icon={ExternalLinkIcon} text="Fazer Cadastro" onClick={() => onOpenCadastroAntt(shipment)} />}
                                                                      {isActionable && onEditPrice && (isDeveloperUser(currentUser) || currentUser.profile === UserProfile.Desenvolvedor || currentUser.profile === UserProfile.Admin || currentUser.profile === UserProfile.GerenciadoraDeRisco || isGerenciadora || (currentUser.profile as string) === 'Administrador do Sistema' || currentUser.profile === UserProfile.Embarcador || currentUser.profile === UserProfile.Agenciador || currentUser.profile === UserProfile.Comercial) && <ActionMenuItem icon={DollarSignIcon} text="Alterar Preço" onClick={() => onEditPrice(shipment)} />}
                                                                      {isActionable && onTransfer && <ActionMenuItem icon={TransferIcon} text="Transferir Embarque" onClick={() => onTransfer(shipment)} />}
                                                                      {isActionable && (shipment.status === ShipmentStatus.PreCadastro || shipment.status === ShipmentStatus.AguardandoSeguradora || shipment.status === ShipmentStatus.AguardandoCarregamento) && onSwapCargo && <ActionMenuItem icon={Package} text="Trocar Carga" onClick={() => onSwapCargo(shipment)} />}
                                                                      {onOpenEditScheduledDateTime && <ActionMenuItem icon={Clock} text="Alterar Data/Hora" onClick={() => onOpenEditScheduledDateTime(shipment)} />}
                                                                      {onUpdateShipmentData && (shipment.status as any) !== ShipmentStatus.Cancelado && (
                                                                          <ActionMenuItem 
                                                                              icon={AlertCircle} 
                                                                              text={shipment.statusPendingObservation ? "Editar Pendência" : "Informar Pendência"} 
                                                                              onClick={() => {
                                                                                  setOpenActionMenu(null);
                                                                                  handleOpenPendingModal(shipment);
                                                                              }} 
                                                                          />
                                                                      )}
                                                                      {shipment.status === ShipmentStatus.Finalizado && onAttach && <ActionMenuItem icon={PaperclipIcon} text="Gestor de Anexos" onClick={() => onAttach(shipment)} />}
                                                                      {/* Ação de Reembarcar (Disponível em Ag. Descarga, Valid. Ticket, Ag. Saldo e Finalizado) */}
                                                                      {(shipment.status === ShipmentStatus.AguardandoDescarga ||
                                                                        shipment.status === ShipmentStatus.ValidacaoTicket ||
                                                                        shipment.status === ShipmentStatus.AguardandoPagamentoSaldo ||
                                                                        shipment.status === ShipmentStatus.Finalizado) && (
                                                                        <ActionMenuItem 
                                                                            icon={RotateCw} 
                                                                            text="Reembarcar" 
                                                                            onClick={() => {
                                                                                setOpenActionMenu(null);
                                                                                if (onReembarcar) {
                                                                                    onReembarcar(shipment);
                                                                                } else {
                                                                                    setReembarqueShipment(shipment);
                                                                                }
                                                                            }} 
                                                                        />
                                                                      )}
                                                                      {/* Ação de Embarque Complementar (Disponível em Ag. Descarga, Valid. Ticket, Ag. Saldo e Finalizado) */}
                                                                      {(shipment.status === ShipmentStatus.AguardandoDescarga ||
                                                                        shipment.status === ShipmentStatus.ValidacaoTicket ||
                                                                        shipment.status === ShipmentStatus.AguardandoPagamentoSaldo ||
                                                                        shipment.status === ShipmentStatus.Finalizado) && (
                                                                        <ActionMenuItem 
                                                                            icon={FilePlus2} 
                                                                            text="Embarque Complementar" 
                                                                            onClick={() => {
                                                                                setOpenActionMenu(null);
                                                                                if (onEmbarqueComplementar) {
                                                                                    onEmbarqueComplementar(shipment);
                                                                                } else {
                                                                                    setComplementarShipment(shipment);
                                                                                }
                                                                            }} 
                                                                        />
                                                                      )}
                                                                      {isActionable && onCancel && (currentUser.profile !== UserProfile.Fiscal || shipment.status === ShipmentStatus.AguardandoSeguradora) && <ActionMenuItem icon={XIcon} text="Cancelar Embarque" onClick={() => onCancel(shipment)} isDestructive />}
                                                                  </>
                                                              )}
                                                              {onRevertStatus && (statusHistoryCount > 1 || shipment.status !== ShipmentStatus.PreCadastro) && (isDeveloperUser(currentUser) || currentUser.profile === UserProfile.Desenvolvedor || currentUser.profile === UserProfile.Admin || currentUser.profile === UserProfile.Diretor || currentUser.profile === UserProfile.GerenciadoraDeRisco || isGerenciadora) && (
                                                                  <ActionMenuItem 
                                                                      icon={RotateCcw} 
                                                                      text="Voltar Status Anterior" 
                                                                      onClick={() => {
                                                                          if (confirm(`Tem certeza que deseja REVERTER o status do embarque ${shipment.id} para o estado anterior? Isso também removerá os anexos adicionados no último passo.`)) {
                                                                              onRevertStatus(shipment.id);
                                                                          }
                                                                      }} 
                                                                  />
                                                              )}
                                                              {onDelete && (currentUser.profile === UserProfile.Admin || isDeveloperUser(currentUser)) && <ActionMenuItem icon={Trash2} text="Excluir Embarque" onClick={() => onDelete(shipment.id)} isDestructive />}
                                                          </div>
                                                      </div>,
                                                      document.body
                                                  )}
                                              </div>
                                          )}
                                      </>
                                  )}
                              </div>
                          )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="px-6 py-4 flex flex-col sm:flex-row items-center justify-between border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 gap-4">
            <div className="text-sm text-gray-500 dark:text-gray-400">
              Mostrando <span className="font-medium">{(safeCurrentPage - 1) * itemsPerPage + 1}</span> a <span className="font-medium">{Math.min(safeCurrentPage * itemsPerPage, filteredShipments.length)}</span> de <span className="font-medium">{filteredShipments.length}</span> embarques
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={safeCurrentPage === 1}
                className="p-2 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Página {safeCurrentPage} de {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                disabled={safeCurrentPage === totalPages}
                className="p-2 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>


    <ShipmentDetailsModal
      isOpen={!!detailsModalShipment}
      onClose={() => setDetailsModalShipment(null)}
      shipment={detailsModalShipment}
      cargo={detailsModalShipment ? getCargoInfo(detailsModalShipment.cargoId) || undefined : undefined}
      currentUser={currentUser}
      onUpdatePrice={onUpdatePrice}
      onUpdateShipmentData={onUpdateShipmentData}
      onAddAttachments={onAddAttachments}
      onSwapCargo={onPerformSwapCargo}
      cargos={cargos}
      clients={clients}
      products={products}
      companyLogo={companyLogo}
      vehicles={vehicles}
      users={users}
      onDeleteAttachment={onDeleteAttachment}
    />

    {/* Modal de Reembarque de Veículo */}
    {reembarqueShipment && (
      <ReembarqueModal
        isOpen={Boolean(reembarqueShipment)}
        onClose={() => setReembarqueShipment(null)}
        shipment={reembarqueShipment}
        cargos={cargos}
        shipments={shipments}
        clients={clients}
        products={products}
        currentUser={currentUser}
        onConfirmReembarque={handleConfirmReembarque}
      />
    )}

    {/* Modal de Embarque Complementar */}
    {complementarShipment && (
      <ComplementarShipmentModal
        isOpen={Boolean(complementarShipment)}
        onClose={() => setComplementarShipment(null)}
        shipment={complementarShipment}
        cargos={cargos}
        clients={clients}
        currentUser={currentUser}
        onConfirmComplementar={handleConfirmComplementar}
      />
    )}

    {/* Modal de Observação de Pendência do Status */}
    <StatusPendingModal
      isOpen={Boolean(pendingModalShipment)}
      onClose={() => setPendingModalShipment(null)}
      shipment={pendingModalShipment}
      onSave={handleSavePendingObservation}
    />

    {activeDriverMap && (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full flex flex-col p-6 relative">
          <button 
            onClick={() => setActiveDriverMap(null)}
            className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            title="Fechar"
          >
            <X className="w-6 h-6" />
          </button>
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">
            Localização do Motorista: {activeDriverMap.driverName}
          </h3>
          {activeDriverMap.isOffline ? (
            <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-lg text-amber-800 dark:text-amber-300 text-xs">
              <p className="font-semibold text-amber-900 dark:text-amber-200 mb-0.5">⚠️ Aplicativo off-line / transmissão inativa no momento</p>
              <p>Última visualização das coordenadas: <span className="font-medium">{formatLocationTimestamp(activeDriverMap.timestamp)}</span></p>
              <p className="font-mono mt-0.5 text-[11px]">Coordenadas: {activeDriverMap.lat.toFixed(6)}, {activeDriverMap.lng.toFixed(6)}</p>
            </div>
          ) : (
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
              Coordenadas (ao vivo): {activeDriverMap.lat.toFixed(6)}, {activeDriverMap.lng.toFixed(6)}
              {activeDriverMap.timestamp && ` • Atualizado em ${formatLocationTimestamp(activeDriverMap.timestamp)}`}
            </p>
          )}
          <div className="w-full h-[400px] rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 bg-gray-100">
            <iframe
              title={`Mapa contendo localização de ${activeDriverMap.driverName}`}
              src={`https://maps.google.com/maps?q=${activeDriverMap.lat},${activeDriverMap.lng}&z=15&output=embed`}
              className="w-full h-full border-0"
              allowFullScreen
              loading="lazy"
            ></iframe>
          </div>
          <div className="mt-4 flex justify-between items-center">
            <a 
              href={`https://www.google.com/maps/search/?api=1&query=${activeDriverMap.lat},${activeDriverMap.lng}`}
              target="_blank" 
              rel="noopener noreferrer"
              className="text-xs text-primary hover:underline dark:text-blue-400"
            >
              Abrir no Google Maps externo
            </a>
            <button 
              onClick={() => setActiveDriverMap(null)}
              className="px-4 py-2 bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors text-sm font-semibold"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    )}

    {/* Input invisível para upload da Ordem de Carregamento TMS */}
    <input 
      ref={tmsFileInputRef}
      type="file" 
      className="hidden" 
      accept=".pdf,.png,.jpg,.jpeg,.webp" 
      onChange={handleTmsFileSelected} 
    />

  </div>
);
};

export default ShipmentTable;
