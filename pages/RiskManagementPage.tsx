import React, { useState, useMemo } from 'react';
import type { Shipment, Cargo, Client, Driver, Vehicle, User, RiskQueryOption, ProfilePermissions, Product, Owner } from '../types';
import { ShipmentStatus, RiskQueryType, RISK_QUERY_COST_MAP, DEFAULT_RISK_QUERY_OPTIONS } from '../types';
import { 
  ShieldCheck, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Search, 
  Download, 
  FileSpreadsheet, 
  DollarSign, 
  TrendingDown, 
  TrendingUp, 
  BarChart3, 
  FileText, 
  Truck, 
  X, 
  Eye, 
  Edit,
  AlertCircle,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Filter,
  FilterX,
  RotateCcw,
  Sliders
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { addPdfLogo } from '../utils/pdfGenerator';
import { isDemoUser } from '../auth';
import { findCargoById, findProductForCargo, checkRequiresRiskManagement } from '../utils';
import ShipmentDetailsModal from '../components/ShipmentDetailsModal';
import DocumentPreviewModal from '../components/DocumentPreviewModal';
import EditRiskQueryModal from '../components/EditRiskQueryModal';
import RiskQueryTypesPage from './RiskQueryTypesPage';
import { RdoNacionalModal } from '../components/RdoNacionalModal';
import { SigaGrModal } from '../components/SigaGrModal';


interface RiskManagementPageProps {
  shipments: Shipment[];
  cargos: Cargo[];
  clients: Client[];
  drivers: Driver[];
  vehicles: Vehicle[];
  owners?: Owner[];
  users: User[];
  currentUser: User | null;
  companyLogo?: string | null;
  riskQueryOptions?: RiskQueryOption[];
  onSaveRiskQueryOption?: (option: RiskQueryOption | Omit<RiskQueryOption, 'id'>) => Promise<void> | void;
  onDeleteRiskQueryOption?: (optionId: string) => Promise<void> | void;
  onRestoreRiskQueryDefaults?: () => Promise<void> | void;
  profilePermissions?: ProfilePermissions;
  onUpdatePrice?: (shipmentId: string, data: { newTotal: number, newRate?: number, newCompanyRate?: number }) => void;
  onUpdateShipmentData?: (shipmentId: string, data: Partial<Shipment>, options?: { silent?: boolean }) => void;
  onAddAttachments?: (shipmentId: string, files: File[]) => Promise<void>;
  onDeleteAttachment?: (shipmentId: string, url: string) => Promise<void>;
  onModalStateChange?: (isOpen: boolean) => void;
  products?: Product[];
  onSwapCargo?: (shipmentId: string, newCargoId: string) => void;
}

export type RiskReleaseStatus = 'Aprovado' | 'Reprovado' | 'Pendente';
export type ShipmentOutcomeStatus = 'Em Andamento' | 'Concluído' | 'Cancelado';

export interface RiskShipmentRow {
  shipment: Shipment;
  cargo: Cargo | undefined;
  client: Client | undefined;
  driver: Driver | undefined;
  vehicle: Vehicle | undefined;
  queryType: string;
  queryCost: number;
  releaseCode: string;
  releaseStatus: RiskReleaseStatus;
  outcomeStatus: ShipmentOutcomeStatus;
  isSequenced: boolean;
  isWastedCost: boolean;
  cancellationReason: string;
  createdAt: string;
  scheduledDate: string;
}

export type SortField = 
  | 'createdAt' 
  | 'driver' 
  | 'vehicle' 
  | 'client' 
  | 'queryType' 
  | 'queryCost' 
  | 'releaseCode' 
  | 'releaseStatus' 
  | 'outcomeStatus' 
  | 'cancellationReason';

export type SortDirection = 'asc' | 'desc';

interface ColumnFilters {
  shipmentOrDate: string;
  driverOrDoc: string;
  vehicleOrPlate: string;
  clientOrCargo: string;
  queryType: string;
  costRange: string;
  releaseCode: string;
  releaseStatus: string;
  outcomeStatus: string;
  cancellationReason: string;
}

const INITIAL_COL_FILTERS: ColumnFilters = {
  shipmentOrDate: '',
  driverOrDoc: '',
  vehicleOrPlate: '',
  clientOrCargo: '',
  queryType: 'ALL',
  costRange: 'ALL',
  releaseCode: '',
  releaseStatus: 'ALL',
  outcomeStatus: 'ALL',
  cancellationReason: ''
};

const RiskManagementPage: React.FC<RiskManagementPageProps> = ({
  shipments = [],
  cargos = [],
  clients = [],
  drivers = [],
  vehicles = [],
  owners = [],
  users = [],
  currentUser,
  companyLogo,
  riskQueryOptions = DEFAULT_RISK_QUERY_OPTIONS,
  onSaveRiskQueryOption,
  onDeleteRiskQueryOption,
  onRestoreRiskQueryDefaults,
  profilePermissions = {},
  onUpdatePrice,
  onUpdateShipmentData,
  onAddAttachments,
  onDeleteAttachment,
  onModalStateChange,
  products = [],
  onSwapCargo
}) => {
  // Tabs: 'operational' | 'analytics' | 'query_types'
  const [activeTab, setActiveTab] = useState<'operational' | 'analytics' | 'query_types'>('operational');
  const [isRdoModalOpen, setIsRdoModalOpen] = useState(false);
  const [isSigaModalOpen, setIsSigaModalOpen] = useState(false);
  const [targetShipmentForIntegration, setTargetShipmentForIntegration] = useState<Shipment | null>(null);
  const isDemo = isDemoUser(currentUser);

  const handleOpenRdo = (shipment?: Shipment) => {
    setTargetShipmentForIntegration(shipment || null);
    setIsRdoModalOpen(true);
  };

  const handleOpenSiga = (shipment?: Shipment) => {
    setTargetShipmentForIntegration(shipment || null);
    setIsSigaModalOpen(true);
  };

  // Global / Quick Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedQueryType, setSelectedQueryType] = useState<string>('ALL');
  const [selectedReleaseStatus, setSelectedReleaseStatus] = useState<string>('ALL');
  const [selectedOutcomeStatus, setSelectedOutcomeStatus] = useState<string>('ALL');
  const [selectedClientId, setSelectedClientId] = useState<string>('ALL');
  const [onlyWastedCost, setOnlyWastedCost] = useState(false);

  // Column-specific Filters
  const [colFilters, setColFilters] = useState<ColumnFilters>(INITIAL_COL_FILTERS);
  const [showColumnFilters, setShowColumnFilters] = useState<boolean>(true);

  // Sorting
  const [sortField, setSortField] = useState<SortField>('createdAt');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(15);

  // Modals
  const [selectedShipmentForDetails, setSelectedShipmentForDetails] = useState<Shipment | null>(null);
  const [shipmentToEditRisk, setShipmentToEditRisk] = useState<Shipment | null>(null);
  const [previewDocument, setPreviewDocument] = useState<{ url: string; name?: string; category?: string } | null>(null);

  // Fast maps
  const cargoMap = useMemo(() => new Map(cargos.map(c => [c.id, c])), [cargos]);
  const clientMap = useMemo(() => new Map(clients.map(c => [c.id, c])), [clients]);
  const driverMap = useMemo(() => new Map(drivers.map(d => [d.cpf ? d.cpf.replace(/\D/g, '') : d.name.toLowerCase(), d])), [drivers]);
  const vehicleMap = useMemo(() => new Map(vehicles.map(v => [v.plate.replace(/[^a-zA-Z0-9]/g, '').toUpperCase(), v])), [vehicles]);
  const productMap = useMemo(() => new Map(products.map(p => [p.id, p])), [products]);
  const costMapFromOptions = useMemo(() => {
    const map = new Map<string, number>();
    riskQueryOptions.forEach(o => map.set(o.name, o.cost));
    return map;
  }, [riskQueryOptions]);

  // Transform all relevant shipments
  const allRiskRows = useMemo<RiskShipmentRow[]>(() => {
    return shipments
      .filter(s => {
        const isCurrentAgSeguradora = s.status === ShipmentStatus.AguardandoSeguradora;
        const hasRiskInfo = !!s.riskQueryType || !!s.riskReleaseCode || (s.riskQueryCost !== undefined && s.riskQueryCost > 0);
        const hasPassedAgSeguradora = s.statusHistory && s.statusHistory.some(h => h.status === ShipmentStatus.AguardandoSeguradora);
        
        const reasonLower = (s.cancellationReason || '').toLowerCase();
        const isCancelledForRisk = s.status === ShipmentStatus.Cancelado && (
          reasonLower.includes('reprov') ||
          reasonLower.includes('seguradora') ||
          reasonLower.includes('risco') ||
          reasonLower.includes('gr') ||
          reasonLower.includes('buonny') ||
          reasonLower.includes('opentech') ||
          reasonLower.includes('pamcary') ||
          reasonLower.includes('restrito') ||
          reasonLower.includes('bloqueado') ||
          reasonLower.includes('consulta')
        );

        // Also check if cargo product requires risk management (or default true)
        const cargo = findCargoById(cargos, s.cargoId) || cargoMap.get(s.cargoId);
        const product = findProductForCargo(products, cargo) || (cargo?.productId ? productMap.get(cargo.productId) : undefined);
        const requiresRisk = checkRequiresRiskManagement(cargo, product);
        const isCancelledFromGRCargo = s.status === ShipmentStatus.Cancelado && requiresRisk;

        return isCurrentAgSeguradora || hasRiskInfo || hasPassedAgSeguradora || isCancelledForRisk || isCancelledFromGRCargo;
      })
      .map(s => {
        const cargo = findCargoById(cargos, s.cargoId) || cargoMap.get(s.cargoId);
        const product = findProductForCargo(products, cargo) || (cargo?.productId ? productMap.get(cargo.productId) : undefined);
        const requiresRisk = checkRequiresRiskManagement(cargo, product);
        const client = cargo ? clientMap.get(cargo.clientId) : undefined;
        
        const cleanCpf = s.driverCpf ? s.driverCpf.replace(/\D/g, '') : '';
        const driver = driverMap.get(cleanCpf) || driverMap.get(s.driverName.toLowerCase());

        const cleanPlate = s.horsePlate ? s.horsePlate.replace(/[^a-zA-Z0-9]/g, '').toUpperCase() : '';
        const vehicle = vehicleMap.get(cleanPlate);

        const isPreCadastroOrSeguradora = s.status === ShipmentStatus.PreCadastro || 
          s.status === ShipmentStatus.AguardandoSeguradora || 
          (s.status as string) === 'Ag. Cadastro' || 
          (s.status as string) === 'Aguardando Cadastro' ||
          (s.status as string) === 'Ag. Seguradora';

        // Query type and cost
        let queryType = s.riskQueryType || ((isPreCadastroOrSeguradora || !requiresRisk) ? 'Pendente de Definição' : 'Cadastro Geral + Biometria');
        let queryCost = 0;
        if (s.riskQueryCost !== undefined && s.riskQueryCost !== null && Number(s.riskQueryCost) > 0) {
          queryCost = Number(s.riskQueryCost);
        } else if (queryType && queryType !== 'Pendente de Definição') {
          queryCost = costMapFromOptions.get(queryType) ?? 
                      costMapFromOptions.get(queryType.toLowerCase().trim()) ?? 
                      RISK_QUERY_COST_MAP[queryType] ?? 
                      RISK_QUERY_COST_MAP[queryType.toLowerCase().trim()] ?? 
                      (requiresRisk ? 31.50 : 0);
        } else if (s.riskReleaseCode) {
          queryCost = costMapFromOptions.get(queryType) ?? 6.50;
        } else if (!requiresRisk || isPreCadastroOrSeguradora) {
          queryCost = (s.riskQueryCost !== undefined && s.riskQueryCost !== null) ? Number(s.riskQueryCost) : 0;
        } else {
          queryCost = (s.riskQueryCost !== undefined && s.riskQueryCost !== null) ? Number(s.riskQueryCost) : 0;
        }

        // Release status
        const releaseCode = s.riskReleaseCode || '';
        let releaseStatus: RiskReleaseStatus = 'Pendente';
        if (s.status === ShipmentStatus.Cancelado) {
          const reasonLower = (s.cancellationReason || '').toLowerCase();
          const isExplicitlyReproved = reasonLower.includes('reprov') || 
                                        reasonLower.includes('seguradora') || 
                                        reasonLower.includes('risco') || 
                                        reasonLower.includes('gr') || 
                                        reasonLower.includes('buonny') || 
                                        reasonLower.includes('opentech') || 
                                        reasonLower.includes('pamcary') || 
                                        reasonLower.includes('restrito') || 
                                        reasonLower.includes('bloqueado');
          if (isExplicitlyReproved) {
            releaseStatus = 'Reprovado';
          } else if (releaseCode) {
            releaseStatus = 'Aprovado';
          } else {
            releaseStatus = 'Reprovado';
          }
        } else if (releaseCode || s.status !== ShipmentStatus.AguardandoSeguradora) {
          releaseStatus = 'Aprovado';
        } else {
          releaseStatus = 'Pendente';
        }

        // Outcome status
        let outcomeStatus: ShipmentOutcomeStatus = 'Em Andamento';
        if (s.status === ShipmentStatus.Finalizado) {
          outcomeStatus = 'Concluído';
        } else if (s.status === ShipmentStatus.Cancelado) {
          outcomeStatus = 'Cancelado';
        } else {
          outcomeStatus = 'Em Andamento';
        }

        const isSequenced = outcomeStatus !== 'Cancelado';
        const isWastedCost = (outcomeStatus === 'Cancelado' || releaseStatus === 'Reprovado') && queryCost > 0;
        const cancellationReason = s.cancellationReason || '';

        return {
          shipment: s,
          cargo,
          client,
          driver,
          vehicle,
          queryType,
          queryCost,
          releaseCode,
          releaseStatus,
          outcomeStatus,
          isSequenced,
          isWastedCost,
          cancellationReason,
          createdAt: s.createdAt,
          scheduledDate: s.scheduledDate || ''
        };
      });
  }, [shipments, cargoMap, clientMap, driverMap, vehicleMap, productMap, costMapFromOptions, riskQueryOptions, products]);

  // Handle Sort Toggle
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Helper for column filter update
  const updateColFilter = (field: keyof ColumnFilters, value: string) => {
    setColFilters(prev => ({ ...prev, [field]: value }));
    setCurrentPage(1);
  };

  // Check if any column filter is active
  const hasActiveColFilters = useMemo(() => {
    return Object.keys(colFilters).some(k => {
      const val = colFilters[k as keyof ColumnFilters];
      return val !== '' && val !== 'ALL';
    });
  }, [colFilters]);

  // Filtered and Sorted Rows
  const filteredAndSortedRows = useMemo(() => {
    // 1. Filter
    const filtered = allRiskRows.filter(row => {
      // Global Search term filter
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const s = row.shipment;
        const matchId = s.id.toLowerCase().includes(term);
        const matchDriver = s.driverName.toLowerCase().includes(term);
        const matchCpf = (s.driverCpf || '').replace(/\D/g, '').includes(term.replace(/\D/g, ''));
        const matchHorse = (s.horsePlate || '').toLowerCase().includes(term);
        const matchTrailer = (s.trailer1Plate || '').toLowerCase().includes(term) ||
                             (s.trailer2Plate || '').toLowerCase().includes(term) ||
                             (s.trailer3Plate || '').toLowerCase().includes(term);
        const matchClient = (row.client?.nomeFantasia || '').toLowerCase().includes(term);
        const matchCode = (row.releaseCode || '').toLowerCase().includes(term);
        const matchReason = (row.cancellationReason || '').toLowerCase().includes(term);

        if (!matchId && !matchDriver && !matchCpf && !matchHorse && !matchTrailer && !matchClient && !matchCode && !matchReason) {
          return false;
        }
      }

      // Date Range Filter
      if (startDate) {
        const itemDate = row.createdAt.substring(0, 10);
        if (itemDate < startDate) return false;
      }
      if (endDate) {
        const itemDate = row.createdAt.substring(0, 10);
        if (itemDate > endDate) return false;
      }

      // Top Filter: Query Type
      if (selectedQueryType !== 'ALL' && row.queryType !== selectedQueryType) {
        return false;
      }

      // Top Filter: Release Status
      if (selectedReleaseStatus !== 'ALL' && row.releaseStatus !== selectedReleaseStatus) {
        return false;
      }

      // Top Filter: Outcome Status
      if (selectedOutcomeStatus !== 'ALL') {
        if (selectedOutcomeStatus === 'SEQUENCED' && !row.isSequenced) return false;
        if (selectedOutcomeStatus === 'CANCELLED' && row.outcomeStatus !== 'Cancelado') return false;
        if (selectedOutcomeStatus === 'COMPLETED' && row.outcomeStatus !== 'Concluído') return false;
        if (selectedOutcomeStatus === 'IN_PROGRESS' && row.outcomeStatus !== 'Em Andamento') return false;
      }

      // Top Filter: Client
      if (selectedClientId !== 'ALL' && row.cargo?.clientId !== selectedClientId) {
        return false;
      }

      // Top Filter: Wasted Cost Toggle
      if (onlyWastedCost && !row.isWastedCost) {
        return false;
      }

      // --- Column-Specific Filters ---
      if (colFilters.shipmentOrDate.trim()) {
        const term = colFilters.shipmentOrDate.toLowerCase();
        const dateStr = new Date(row.createdAt).toLocaleDateString('pt-BR');
        const matches = row.shipment.id.toLowerCase().includes(term) || dateStr.includes(term) || row.createdAt.includes(term);
        if (!matches) return false;
      }

      if (colFilters.driverOrDoc.trim()) {
        const term = colFilters.driverOrDoc.toLowerCase();
        const cleanTerm = term.replace(/\D/g, '');
        const driverName = row.shipment.driverName.toLowerCase();
        const driverCpf = (row.shipment.driverCpf || '').replace(/\D/g, '');
        const matches = driverName.includes(term) || (cleanTerm && driverCpf.includes(cleanTerm));
        if (!matches) return false;
      }

      if (colFilters.vehicleOrPlate.trim()) {
        const term = colFilters.vehicleOrPlate.toLowerCase().replace(/[^a-z0-9]/g, '');
        const plates = [row.shipment.horsePlate, row.shipment.trailer1Plate, row.shipment.trailer2Plate, row.shipment.trailer3Plate]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '');
        if (!plates.includes(term)) return false;
      }

      if (colFilters.clientOrCargo.trim()) {
        const term = colFilters.clientOrCargo.toLowerCase();
        const clientName = (row.client?.nomeFantasia || '').toLowerCase();
        const cargoSeq = String(row.cargo?.sequenceId || '').toLowerCase();
        const cargoId = (row.cargo?.id || '').toLowerCase();
        if (!clientName.includes(term) && !cargoSeq.includes(term) && !cargoId.includes(term)) return false;
      }

      if (colFilters.queryType !== 'ALL' && row.queryType !== colFilters.queryType) {
        return false;
      }

      if (colFilters.costRange !== 'ALL') {
        if (colFilters.costRange === 'zero' && row.queryCost > 0) return false;
        if (colFilters.costRange === 'withCost' && row.queryCost <= 0) return false;
        if (colFilters.costRange === '7' && row.queryCost !== 7) return false;
        if (colFilters.costRange === '15' && row.queryCost !== 15) return false;
        if (colFilters.costRange === '33' && row.queryCost !== 33) return false;
        if (colFilters.costRange === '70' && row.queryCost !== 70) return false;
      }

      if (colFilters.releaseCode.trim()) {
        const term = colFilters.releaseCode.toLowerCase();
        if (!row.releaseCode.toLowerCase().includes(term)) return false;
      }

      if (colFilters.releaseStatus !== 'ALL' && row.releaseStatus !== colFilters.releaseStatus) {
        return false;
      }

      if (colFilters.outcomeStatus !== 'ALL' && row.outcomeStatus !== colFilters.outcomeStatus) {
        return false;
      }

      if (colFilters.cancellationReason.trim()) {
        const term = colFilters.cancellationReason.toLowerCase();
        if (!row.cancellationReason.toLowerCase().includes(term)) return false;
      }

      return true;
    });

    // 2. Sort
    return filtered.sort((a, b) => {
      let comparison = 0;

      switch (sortField) {
        case 'createdAt':
          comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          break;
        case 'driver':
          comparison = a.shipment.driverName.localeCompare(b.shipment.driverName, 'pt-BR');
          break;
        case 'vehicle':
          comparison = (a.shipment.horsePlate || '').localeCompare(b.shipment.horsePlate || '', 'pt-BR');
          break;
        case 'client':
          comparison = (a.client?.nomeFantasia || '').localeCompare(b.client?.nomeFantasia || '', 'pt-BR');
          break;
        case 'queryType':
          comparison = a.queryType.localeCompare(b.queryType, 'pt-BR');
          break;
        case 'queryCost':
          comparison = a.queryCost - b.queryCost;
          break;
        case 'releaseCode':
          comparison = (a.releaseCode || '').localeCompare(b.releaseCode || '', 'pt-BR');
          break;
        case 'releaseStatus':
          comparison = a.releaseStatus.localeCompare(b.releaseStatus, 'pt-BR');
          break;
        case 'outcomeStatus':
          comparison = a.outcomeStatus.localeCompare(b.outcomeStatus, 'pt-BR');
          break;
        case 'cancellationReason':
          comparison = (a.cancellationReason || '').localeCompare(b.cancellationReason || '', 'pt-BR');
          break;
        default:
          comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [allRiskRows, searchTerm, startDate, endDate, selectedQueryType, selectedReleaseStatus, selectedOutcomeStatus, selectedClientId, onlyWastedCost, colFilters, sortField, sortDirection]);

  // Statistics and Financial Metrics
  const stats = useMemo(() => {
    const totalConsultas = filteredAndSortedRows.length;
    let totalGasto = 0;
    let totalDesperdicio = 0;
    let countDesperdicio = 0;

    let countAprovado = 0;
    let countReprovado = 0;
    let countPendente = 0;

    let countSequenciado = 0;
    let countCancelado = 0;
    let countConcluido = 0;
    let countEmAndamento = 0;

    const reasonsMap = new Map<string, { count: number; wastedCost: number }>();
    const queryTypeMap = new Map<string, { count: number; totalCost: number }>();

    filteredAndSortedRows.forEach(row => {
      totalGasto += row.queryCost;

      if (row.isWastedCost) {
        totalDesperdicio += row.queryCost;
        countDesperdicio += 1;
      }

      if (row.releaseStatus === 'Aprovado') countAprovado += 1;
      else if (row.releaseStatus === 'Reprovado') countReprovado += 1;
      else countPendente += 1;

      if (row.isSequenced) countSequenciado += 1;
      if (row.outcomeStatus === 'Cancelado') countCancelado += 1;
      else if (row.outcomeStatus === 'Concluído') countConcluido += 1;
      else countEmAndamento += 1;

      if (row.outcomeStatus === 'Cancelado') {
        const rawReason = row.cancellationReason.trim() || 'Motivo não especificado';
        const curr = reasonsMap.get(rawReason) || { count: 0, wastedCost: 0 };
        curr.count += 1;
        curr.wastedCost += row.queryCost;
        reasonsMap.set(rawReason, curr);
      }

      const qType = row.queryType || 'Não Informado';
      const qCurr = queryTypeMap.get(qType) || { count: 0, totalCost: 0 };
      qCurr.count += 1;
      qCurr.totalCost += row.queryCost;
      queryTypeMap.set(qType, qCurr);
    });

    const reasonsList = Array.from(reasonsMap.entries())
      .map(([reason, data]) => ({ reason, ...data }))
      .sort((a, b) => b.count - a.count);

    const queryTypeList = Array.from(queryTypeMap.entries())
      .map(([type, data]) => ({ type, ...data }))
      .sort((a, b) => b.totalCost - a.totalCost);

    const percentAprovado = totalConsultas > 0 ? (countAprovado / totalConsultas) * 100 : 0;
    const percentReprovado = totalConsultas > 0 ? (countReprovado / totalConsultas) * 100 : 0;
    const percentPendente = totalConsultas > 0 ? (countPendente / totalConsultas) * 100 : 0;

    const percentSequenciado = totalConsultas > 0 ? (countSequenciado / totalConsultas) * 100 : 0;
    const percentCancelado = totalConsultas > 0 ? (countCancelado / totalConsultas) * 100 : 0;
    const percentDesperdicioFinanceiro = totalGasto > 0 ? (totalDesperdicio / totalGasto) * 100 : 0;

    return {
      totalConsultas,
      totalGasto,
      totalDesperdicio,
      countDesperdicio,
      countAprovado,
      countReprovado,
      countPendente,
      countSequenciado,
      countCancelado,
      countConcluido,
      countEmAndamento,
      percentAprovado,
      percentReprovado,
      percentPendente,
      percentSequenciado,
      percentCancelado,
      percentDesperdicioFinanceiro,
      reasonsList,
      queryTypeList
    };
  }, [filteredAndSortedRows]);

  // Paginated Rows
  const totalPages = Math.ceil(filteredAndSortedRows.length / itemsPerPage) || 1;
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedRows = useMemo(() => {
    const start = (safeCurrentPage - 1) * itemsPerPage;
    return filteredAndSortedRows.slice(start, start + itemsPerPage);
  }, [filteredAndSortedRows, safeCurrentPage, itemsPerPage]);

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? dateStr : d.toLocaleDateString('pt-BR');
  };

  // Preset Date Handlers
  const handleSetPresetDate = (preset: 'today' | '7days' | 'thisMonth' | '30days' | 'all') => {
    const today = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const toYMD = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    if (preset === 'today') {
      const formatted = toYMD(today);
      setStartDate(formatted);
      setEndDate(formatted);
    } else if (preset === '7days') {
      const past = new Date(today);
      past.setDate(past.getDate() - 7);
      setStartDate(toYMD(past));
      setEndDate(toYMD(today));
    } else if (preset === 'thisMonth') {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      setStartDate(toYMD(start));
      setEndDate(toYMD(end));
    } else if (preset === '30days') {
      const past = new Date(today);
      past.setDate(past.getDate() - 30);
      setStartDate(toYMD(past));
      setEndDate(toYMD(today));
    } else {
      setStartDate('');
      setEndDate('');
    }
    setCurrentPage(1);
  };

  const handleClearFilters = () => {
    setSearchTerm('');
    setStartDate('');
    setEndDate('');
    setSelectedQueryType('ALL');
    setSelectedReleaseStatus('ALL');
    setSelectedOutcomeStatus('ALL');
    setSelectedClientId('ALL');
    setOnlyWastedCost(false);
    setColFilters(INITIAL_COL_FILTERS);
    setCurrentPage(1);
  };

  const handleResetColumnFiltersOnly = () => {
    setColFilters(INITIAL_COL_FILTERS);
    setCurrentPage(1);
  };

  // Export to Excel (CSV with UTF-8 BOM)
  const handleExportCSV = () => {
    const headers = [
      'ID Embarque',
      'Data Criacao',
      'Data Programada',
      'Cliente',
      'Origem',
      'Destino',
      'Motorista',
      'CPF Motorista',
      'Placa Cavalo',
      'Placa Carreta 1',
      'Placa Carreta 2',
      'Placa Carreta 3',
      'Modalidade Consulta',
      'Custo Consulta (R$)',
      'Cod. Liberacao',
      'Status Liberacao',
      'Status Embarque',
      'Deu Sequencia',
      'Desperdicio',
      'Motivo Cancelamento/Reprova'
    ];

    const rows = filteredAndSortedRows.map(r => [
      `"${r.shipment.id}"`,
      `"${formatDate(r.createdAt)}"`,
      `"${formatDate(r.scheduledDate)}"`,
      `"${(r.client?.nomeFantasia || 'N/A').replace(/"/g, '""')}"`,
      `"${(r.cargo?.origin || 'N/A').replace(/"/g, '""')}"`,
      `"${(r.cargo?.destination || 'N/A').replace(/"/g, '""')}"`,
      `"${r.shipment.driverName.replace(/"/g, '""')}"`,
      `"${r.shipment.driverCpf || '-'}"`,
      `"${r.shipment.horsePlate || '-'}"`,
      `"${r.shipment.trailer1Plate || '-'}"`,
      `"${r.shipment.trailer2Plate || '-'}"`,
      `"${r.shipment.trailer3Plate || '-'}"`,
      `"${r.queryType}"`,
      r.queryCost.toFixed(2).replace('.', ','),
      `"${r.releaseCode || '-'}"`,
      `"${r.releaseStatus}"`,
      `"${r.outcomeStatus}"`,
      `"${r.isSequenced ? 'Sim' : 'Não'}"`,
      `"${r.isWastedCost ? 'Sim' : 'Não'}"`,
      `"${r.cancellationReason.replace(/"/g, '""')}"`
    ]);

    const csvContent = '\uFEFF' + [headers.join(';'), ...rows.map(row => row.join(';'))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Relatorio_Gerenciadora_Risco_${new Date().toISOString().substring(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Export to PDF
  const handleExportPDF = () => {
    const doc = new jsPDF('landscape');
    const pageWidth = doc.internal.pageSize.getWidth();

    addPdfLogo(doc, companyLogo, { align: 'right', y: 6, width: 35, height: 12 });

    doc.setFontSize(16);
    doc.setTextColor(29, 59, 141);
    doc.text('Relatório Gerencial - Gerenciadora de Risco', 14, 15);

    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.text(`Período: ${startDate ? formatDate(startDate) : 'Início'} até ${endDate ? formatDate(endDate) : 'Atual'} | Emitido em: ${new Date().toLocaleString('pt-BR')}`, 14, 21);

    const startY = 26;
    doc.setDrawColor(220, 220, 230);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(14, startY, pageWidth - 28, 16, 2, 2, 'FD');

    doc.setFontSize(8);
    doc.setTextColor(70, 70, 70);
    doc.text(`Total de Consultas: ${stats.totalConsultas}`, 18, startY + 6);
    doc.text(`Gasto Total: ${formatCurrency(stats.totalGasto)}`, 18, startY + 12);

    doc.text(`Aprovadas: ${stats.countAprovado} (${stats.percentAprovado.toFixed(1)}%)`, 75, startY + 6);
    doc.text(`Reprovadas / Pendentes: ${stats.countReprovado + stats.countPendente}`, 75, startY + 12);

    doc.text(`Carregamentos Sequenciados: ${stats.countSequenciado} (${stats.percentSequenciado.toFixed(1)}%)`, 140, startY + 6);
    doc.text(`Embarques Cancelados: ${stats.countCancelado}`, 140, startY + 12);

    doc.setTextColor(220, 38, 38);
    doc.text(`Desperdício Financeiro: ${formatCurrency(stats.totalDesperdicio)} (${stats.percentDesperdicioFinanceiro.toFixed(1)}%)`, 215, startY + 6);
    doc.text(`Consultas sem Carregamento: ${stats.countDesperdicio}`, 215, startY + 12);

    const tableColumns = [
      'ID',
      'Data',
      'Cliente',
      'Motorista',
      'Cavalo/Carreta',
      'Modalidade',
      'Custo',
      'Cód. Lib.',
      'Liberação',
      'Embarque',
      'Motivo Cancelamento'
    ];

    const tableRows = filteredAndSortedRows.map(r => [
      r.shipment.id,
      formatDate(r.createdAt),
      r.client?.nomeFantasia || 'N/A',
      r.shipment.driverName,
      `${r.shipment.horsePlate || '-'}${r.shipment.trailer1Plate ? ' / ' + r.shipment.trailer1Plate : ''}`,
      r.queryType,
      formatCurrency(r.queryCost),
      r.releaseCode || '-',
      r.releaseStatus,
      r.outcomeStatus,
      r.cancellationReason || '-'
    ]);

    tableRows.push([
      'TOTAIS',
      `Reg: ${stats.totalConsultas}`,
      '-',
      '-',
      '-',
      '-',
      formatCurrency(stats.totalGasto),
      '-',
      `Aprov: ${stats.countAprovado}`,
      `Cancel: ${stats.countCancelado}`,
      `Desperdício: ${formatCurrency(stats.totalDesperdicio)}`
    ]);

    autoTable(doc, {
      head: [tableColumns],
      body: tableRows,
      startY: startY + 20,
      theme: 'grid',
      styles: { fontSize: 7, cellPadding: 1.5 },
      headStyles: { fillColor: [29, 59, 141], textColor: 255, fontStyle: 'bold' },
      didParseCell: (data) => {
        if (data.cell.section === 'body') {
          const rawRow = data.row.raw;
          if (Array.isArray(rawRow) && rawRow[0] === 'TOTAIS') {
            data.cell.styles.fillColor = [240, 243, 246];
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.textColor = [0, 0, 0];
          }
        }
      }
    });

    doc.save(`Relatorio_Gerenciadora_Risco_${new Date().toISOString().substring(0, 10)}.pdf`);
  };

  // Render Sort Icon Helper
  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-3.5 h-3.5 text-gray-400 opacity-40 group-hover:opacity-100 transition-opacity" />;
    }
    return sortDirection === 'asc' ? (
      <ArrowUp className="w-3.5 h-3.5 text-primary dark:text-blue-400 font-bold" />
    ) : (
      <ArrowDown className="w-3.5 h-3.5 text-primary dark:text-blue-400 font-bold" />
    );
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 bg-white dark:bg-gray-800 p-6 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-gray-900 dark:text-white tracking-tight flex items-center gap-2">
              Gerenciadora de Risco
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-blue-50 text-primary dark:bg-blue-900/30 dark:text-blue-400 border border-blue-100 dark:border-blue-800">
                Operacional
              </span>
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Controle de consultas de seguradora, custos operacionais, aprovações e auditoria de cancelamentos.
            </p>
          </div>
        </div>

        {/* Action Buttons & Tabs */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Tab Switch */}
          <div className="bg-gray-100 dark:bg-gray-700/60 p-1 rounded-xl flex items-center border border-gray-200 dark:border-gray-600">
            <button
              onClick={() => setActiveTab('operational')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeTab === 'operational'
                  ? 'bg-white dark:bg-gray-800 text-primary dark:text-blue-400 shadow-xs'
                  : 'text-gray-600 dark:text-gray-300 hover:text-gray-900'
              }`}
            >
              <Truck className="w-3.5 h-3.5" />
              Painel Operacional
            </button>
            <button
              onClick={() => setActiveTab('analytics')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeTab === 'analytics'
                  ? 'bg-white dark:bg-gray-800 text-primary dark:text-blue-400 shadow-xs'
                  : 'text-gray-600 dark:text-gray-300 hover:text-gray-900'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              Métricas & Desperdício
            </button>
            <button
              onClick={() => setActiveTab('query_types')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeTab === 'query_types'
                  ? 'bg-white dark:bg-gray-800 text-primary dark:text-blue-400 shadow-xs'
                  : 'text-gray-600 dark:text-gray-300 hover:text-gray-900'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              Modalidades de Consulta
            </button>
          </div>

          {/* Botão RDO Nacional */}
          <button
            onClick={() => handleOpenRdo()}
            className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-500/20 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer active:scale-95"
            title="Abrir painel de análise cadastral e triagem do RDO Nacional (MRB Soluções)"
          >
            <ShieldCheck className="w-4 h-4 text-white" />
            RDO Nacional
          </button>

          {/* Botão SIGA GR */}
          <button
            onClick={() => handleOpenSiga()}
            className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-500/20 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer active:scale-95"
            title="Abrir painel de integração oficial com a gerenciadora SIGA GR"
          >
            <ShieldCheck className="w-4 h-4 text-white" />
            SIGA GR
          </button>

          {/* Export Buttons */}
          <button
            onClick={handleExportCSV}
            className="px-3.5 py-2 rounded-xl bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-300 dark:hover:bg-emerald-900/50 border border-emerald-200 dark:border-emerald-800 text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs"
            title="Exportar dados para Excel/CSV"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            Excel
          </button>
          <button
            onClick={handleExportPDF}
            className="px-3.5 py-2 rounded-xl bg-red-50 text-red-700 hover:bg-red-100 dark:bg-red-900/30 dark:text-red-300 dark:hover:bg-red-900/50 border border-red-200 dark:border-red-800 text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs"
            title="Exportar relatório em PDF"
          >
            <Download className="w-4 h-4 text-red-600 dark:text-red-400" />
            PDF
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Gasto Total com Consultas */}
        <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm relative overflow-hidden">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Gasto Total em Consultas
              </p>
              <h3 className="text-2xl font-black text-gray-900 dark:text-white mt-1">
                {formatCurrency(stats.totalGasto)}
              </h3>
            </div>
            <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center text-primary dark:text-blue-400">
              <DollarSign className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            <span className="font-semibold text-gray-800 dark:text-gray-200">{stats.totalConsultas}</span> consultas registradas
          </div>
        </div>

        {/* Card 2: Desperdício com Cancelamentos */}
        <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl border border-red-100 dark:border-red-900/30 shadow-sm relative overflow-hidden">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[11px] font-bold text-red-600 dark:text-red-400 uppercase tracking-wider">
                Perda por Cancelamento
              </p>
              <h3 className="text-2xl font-black text-red-600 dark:text-red-400 mt-1">
                {formatCurrency(stats.totalDesperdicio)}
              </h3>
            </div>
            <div className="w-10 h-10 rounded-xl bg-red-50 dark:bg-red-900/30 flex items-center justify-center text-red-600 dark:text-red-400">
              <TrendingDown className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between text-xs">
            <span className="text-red-600 dark:text-red-400 font-semibold flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5" />
              {stats.countDesperdicio} consultas perdidas
            </span>
            <span className="text-gray-500 font-medium">
              {stats.percentDesperdicioFinanceiro.toFixed(1)}% do gasto
            </span>
          </div>
        </div>

        {/* Card 3: Status de Liberação */}
        <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm relative overflow-hidden">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Liberação de Seguradora
              </p>
              <div className="flex items-baseline gap-2 mt-1">
                <h3 className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
                  {stats.countAprovado}
                </h3>
                <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                  ({stats.percentAprovado.toFixed(1)}% Aprov.)
                </span>
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
            <span className="text-red-500 font-medium">{stats.countReprovado} reprovados</span>
            <span>•</span>
            <span className="text-amber-500 font-medium">{stats.countPendente} pendentes</span>
          </div>
        </div>

        {/* Card 4: Desfecho dos Carregamentos */}
        <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm relative overflow-hidden">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Desfecho do Carregamento
              </p>
              <div className="flex items-baseline gap-2 mt-1">
                <h3 className="text-2xl font-black text-indigo-600 dark:text-indigo-400">
                  {stats.countSequenciado}
                </h3>
                <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">
                  ({stats.percentSequenciado.toFixed(1)}% Carregaram)
                </span>
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
            <span className="text-emerald-600 dark:text-emerald-400 font-medium">{stats.countConcluido} finalizados</span>
            <span>•</span>
            <span className="text-blue-600 dark:text-blue-400 font-medium">{stats.countEmAndamento} em andamento</span>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por Motorista, CPF, Placa Cavalo/Carreta, Cód. Liberação ou ID..."
              value={searchTerm}
              onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }}
              className="w-full pl-10 pr-4 py-2 text-sm bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary text-gray-900 dark:text-white shadow-sm font-semibold"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Quick Presets */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={() => handleSetPresetDate('today')}
              className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200"
            >
              Hoje
            </button>
            <button
              onClick={() => handleSetPresetDate('7days')}
              className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200"
            >
              7 Dias
            </button>
            <button
              onClick={() => handleSetPresetDate('thisMonth')}
              className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200"
            >
              Mês Atual
            </button>
            <button
              onClick={() => handleSetPresetDate('30days')}
              className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200"
            >
              30 Dias
            </button>
            <button
              onClick={() => handleSetPresetDate('all')}
              className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200"
            >
              Todos
            </button>
          </div>
        </div>

        {/* Detailed Filters Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 pt-2 border-t border-gray-100 dark:border-gray-700">
          {/* Data De */}
          <div>
            <label className="block text-[11px] font-bold text-gray-600 dark:text-slate-300 uppercase tracking-wider mb-1">Data De</label>
            <input
              type="date"
              value={startDate}
              onChange={e => { setStartDate(e.target.value); setCurrentPage(1); }}
              className="w-full p-2 text-xs font-semibold bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-700 rounded-lg text-gray-900 dark:text-slate-100 shadow-sm focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 outline-none transition-colors"
            />
          </div>

          {/* Data Até */}
          <div>
            <label className="block text-[11px] font-bold text-gray-600 dark:text-slate-300 uppercase tracking-wider mb-1">Data Até</label>
            <input
              type="date"
              value={endDate}
              onChange={e => { setEndDate(e.target.value); setCurrentPage(1); }}
              className="w-full p-2 text-xs font-semibold bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-700 rounded-lg text-gray-900 dark:text-slate-100 shadow-sm focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 outline-none transition-colors"
            />
          </div>

          {/* Modalidade de Consulta */}
          <div>
            <label className="block text-[11px] font-bold text-gray-600 dark:text-slate-300 uppercase tracking-wider mb-1">Tipo de Consulta</label>
            <select
              value={selectedQueryType}
              onChange={e => { setSelectedQueryType(e.target.value); setCurrentPage(1); }}
              className="w-full p-2 text-xs font-semibold bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-700 rounded-lg text-gray-900 dark:text-slate-100 shadow-sm focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 outline-none transition-colors"
            >
              <option value="ALL">Todas as Modalidades</option>
              {riskQueryOptions.map((opt, idx) => (
                <option key={opt.id || idx} value={opt.name}>
                  {(opt.orderIndex ?? (idx + 1))} - {opt.name} (R$ {opt.cost.toFixed(2).replace('.', ',')})
                </option>
              ))}
            </select>
          </div>

          {/* Status Liberação */}
          <div>
            <label className="block text-[11px] font-bold text-gray-600 dark:text-slate-300 uppercase tracking-wider mb-1">Status Liberação</label>
            <select
              value={selectedReleaseStatus}
              onChange={e => { setSelectedReleaseStatus(e.target.value); setCurrentPage(1); }}
              className="w-full p-2 text-xs font-semibold bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-700 rounded-lg text-gray-900 dark:text-slate-100 shadow-sm focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 outline-none transition-colors"
            >
              <option value="ALL">Todos os Status</option>
              <option value="Aprovado">Aprovado</option>
              <option value="Reprovado">Reprovado</option>
              <option value="Pendente">Pendente</option>
            </select>
          </div>

          {/* Status Embarque / Desfecho */}
          <div>
            <label className="block text-[11px] font-bold text-gray-600 dark:text-slate-300 uppercase tracking-wider mb-1">Desfecho Embarque</label>
            <select
              value={selectedOutcomeStatus}
              onChange={e => { setSelectedOutcomeStatus(e.target.value); setCurrentPage(1); }}
              className="w-full p-2 text-xs font-semibold bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-700 rounded-lg text-gray-900 dark:text-slate-100 shadow-sm focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 outline-none transition-colors"
            >
              <option value="ALL">Todos os Desfechos</option>
              <option value="SEQUENCED">Deram Sequência (Carregados)</option>
              <option value="CANCELLED">Cancelados / Reprovados</option>
              <option value="IN_PROGRESS">Em Andamento</option>
              <option value="COMPLETED">Concluídos</option>
            </select>
          </div>

          {/* Cliente */}
          <div>
            <label className="block text-[11px] font-bold text-gray-600 dark:text-slate-300 uppercase tracking-wider mb-1">Cliente</label>
            <select
              value={selectedClientId}
              onChange={e => { setSelectedClientId(e.target.value); setCurrentPage(1); }}
              className="w-full p-2 text-xs font-semibold bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-700 rounded-lg text-gray-900 dark:text-slate-100 shadow-sm focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 outline-none transition-colors"
            >
              <option value="ALL">Todos os Clientes</option>
              {clients.map(c => (
                <option key={c.id} value={c.id}>{c.nomeFantasia || c.razaoSocial || 'Cliente'}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Quick Filter Toggles & Active Filters summary */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <div className="flex items-center gap-3">
            <label className="inline-flex items-center gap-2 cursor-pointer text-xs font-semibold text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={onlyWastedCost}
                onChange={e => { setOnlyWastedCost(e.target.checked); setCurrentPage(1); }}
                className="w-4 h-4 rounded text-red-600 focus:ring-red-500"
              />
              <span className="flex items-center gap-1 text-red-600 dark:text-red-400">
                <AlertTriangle className="w-3.5 h-3.5" />
                Mostrar Apenas Desperdício (Cancelados com Custo)
              </span>
            </label>

            <button
              onClick={() => setShowColumnFilters(prev => !prev)}
              className={`px-2.5 py-1 text-xs font-bold rounded-lg border flex items-center gap-1.5 transition-all ${
                showColumnFilters
                  ? 'bg-blue-50 border-blue-200 text-primary dark:bg-blue-900/30 dark:border-blue-800 dark:text-blue-300'
                  : 'bg-gray-100 border-gray-200 text-gray-600 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-300'
              }`}
            >
              <Filter className="w-3.5 h-3.5" />
              {showColumnFilters ? 'Ocultar Filtros nas Colunas' : 'Exibir Filtros nas Colunas'}
            </button>
          </div>

          <div className="flex items-center gap-3 text-xs text-gray-500">
            <span>
              Exibindo <strong>{filteredAndSortedRows.length}</strong> de <strong>{allRiskRows.length}</strong> consultas
            </span>
            {(searchTerm || startDate || endDate || selectedQueryType !== 'ALL' || selectedReleaseStatus !== 'ALL' || selectedOutcomeStatus !== 'ALL' || selectedClientId !== 'ALL' || onlyWastedCost || hasActiveColFilters) && (
              <button
                onClick={handleClearFilters}
                className="text-xs font-semibold text-primary hover:underline flex items-center gap-1"
              >
                <RotateCcw className="w-3 h-3" /> Limpar Todos os Filtros
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Content: Tab 1 (Operational Table) or Tab 2 (Analytics) */}
      {activeTab === 'operational' ? (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex flex-wrap justify-between items-center gap-3 bg-gray-50/50 dark:bg-gray-800/50">
            <div className="flex items-center gap-3">
              <h3 className="text-sm font-bold text-gray-800 dark:text-white uppercase tracking-wider flex items-center gap-2">
                <FileText className="w-4 h-4 text-primary" />
                Listagem Operacional de Consultas de Risco
              </h3>
              {hasActiveColFilters && (
                <button
                  onClick={handleResetColumnFiltersOnly}
                  className="px-2 py-0.5 text-[11px] font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md flex items-center gap-1"
                  title="Limpar apenas os filtros das colunas"
                >
                  <FilterX className="w-3 h-3" /> Limpar Filtros das Colunas
                </button>
              )}
            </div>

            <div className="flex items-center gap-4 text-xs text-gray-500">
              <div className="flex items-center gap-1.5">
                <span className="text-gray-400">Ordenado por:</span>
                <span className="font-bold text-gray-700 dark:text-gray-300">
                  {sortField === 'createdAt' && 'Embarque / Data'}
                  {sortField === 'driver' && 'Motorista'}
                  {sortField === 'vehicle' && 'Veículo / Placas'}
                  {sortField === 'client' && 'Cliente & Carga'}
                  {sortField === 'queryType' && 'Modalidade'}
                  {sortField === 'queryCost' && 'Custo Consulta'}
                  {sortField === 'releaseCode' && 'Cód. Liberação'}
                  {sortField === 'releaseStatus' && 'Status Liberação'}
                  {sortField === 'outcomeStatus' && 'Status Embarque'}
                  {sortField === 'cancellationReason' && 'Motivo Cancelamento'}
                </span>
                <span className="text-primary font-bold">
                  ({sortDirection === 'asc' ? 'Crescente' : 'Decrescente'})
                </span>
              </div>

              <div className="flex items-center gap-2">
                <span>Linhas:</span>
                <select
                  value={itemsPerPage}
                  onChange={e => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1); }}
                  className="p-1 border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-xs"
                >
                  <option value={10}>10</option>
                  <option value={15}>15</option>
                  <option value={30}>30</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                {/* 1. Header Titles Row with Sort Triggers */}
                <tr className="bg-gray-100/90 dark:bg-gray-700/70 text-gray-700 dark:text-gray-200 font-bold uppercase tracking-wider border-b border-gray-200 dark:border-gray-600 select-none">
                  {/* Col 1: EMBARQUE / DATA */}
                  <th 
                    onClick={() => handleSort('createdAt')}
                    className="px-3.5 py-3 cursor-pointer hover:bg-gray-200/70 dark:hover:bg-gray-600/70 transition-colors group"
                    title="Clique para ordenar por Data / ID"
                  >
                    <div className="flex items-center justify-between gap-1.5">
                      <span>Embarque / Data</span>
                      {renderSortIcon('createdAt')}
                    </div>
                  </th>

                  {/* Col 2: MOTORISTA & DOCUMENTO */}
                  <th 
                    onClick={() => handleSort('driver')}
                    className="px-3.5 py-3 cursor-pointer hover:bg-gray-200/70 dark:hover:bg-gray-600/70 transition-colors group"
                    title="Clique para ordenar por Motorista"
                  >
                    <div className="flex items-center justify-between gap-1.5">
                      <span>Motorista & Documento</span>
                      {renderSortIcon('driver')}
                    </div>
                  </th>

                  {/* Col 3: VEÍCULO / PLACAS */}
                  <th 
                    onClick={() => handleSort('vehicle')}
                    className="px-3.5 py-3 cursor-pointer hover:bg-gray-200/70 dark:hover:bg-gray-600/70 transition-colors group"
                    title="Clique para ordenar por Placa"
                  >
                    <div className="flex items-center justify-between gap-1.5">
                      <span>Veículo / Placas</span>
                      {renderSortIcon('vehicle')}
                    </div>
                  </th>

                  {/* Col 4: CLIENTE & CARGA */}
                  <th 
                    onClick={() => handleSort('client')}
                    className="px-3.5 py-3 cursor-pointer hover:bg-gray-200/70 dark:hover:bg-gray-600/70 transition-colors group"
                    title="Clique para ordenar por Cliente"
                  >
                    <div className="flex items-center justify-between gap-1.5">
                      <span>Cliente & Carga</span>
                      {renderSortIcon('client')}
                    </div>
                  </th>

                  {/* Col 5: MODALIDADE */}
                  <th 
                    onClick={() => handleSort('queryType')}
                    className="px-3.5 py-3 cursor-pointer hover:bg-gray-200/70 dark:hover:bg-gray-600/70 transition-colors group"
                    title="Clique para ordenar por Modalidade de Consulta"
                  >
                    <div className="flex items-center justify-between gap-1.5">
                      <span>Modalidade</span>
                      {renderSortIcon('queryType')}
                    </div>
                  </th>

                  {/* Col 6: CUSTO CONSULTA */}
                  <th 
                    onClick={() => handleSort('queryCost')}
                    className="px-3.5 py-3 text-right cursor-pointer hover:bg-gray-200/70 dark:hover:bg-gray-600/70 transition-colors group"
                    title="Clique para ordenar por Custo"
                  >
                    <div className="flex items-center justify-end gap-1.5">
                      <span>Custo Consulta</span>
                      {renderSortIcon('queryCost')}
                    </div>
                  </th>

                  {/* Col 7: CÓD. LIBERAÇÃO */}
                  <th 
                    onClick={() => handleSort('releaseCode')}
                    className="px-3.5 py-3 text-center cursor-pointer hover:bg-gray-200/70 dark:hover:bg-gray-600/70 transition-colors group"
                    title="Clique para ordenar por Código de Liberação"
                  >
                    <div className="flex items-center justify-center gap-1.5">
                      <span>Cód. Liberação</span>
                      {renderSortIcon('releaseCode')}
                    </div>
                  </th>

                  {/* Col 8: STATUS LIBERAÇÃO */}
                  <th 
                    onClick={() => handleSort('releaseStatus')}
                    className="px-3.5 py-3 text-center cursor-pointer hover:bg-gray-200/70 dark:hover:bg-gray-600/70 transition-colors group"
                    title="Clique para ordenar por Status de Liberação"
                  >
                    <div className="flex items-center justify-center gap-1.5">
                      <span>Status Liberação</span>
                      {renderSortIcon('releaseStatus')}
                    </div>
                  </th>

                  {/* Col 9: STATUS EMBARQUE */}
                  <th 
                    onClick={() => handleSort('outcomeStatus')}
                    className="px-3.5 py-3 text-center cursor-pointer hover:bg-gray-200/70 dark:hover:bg-gray-600/70 transition-colors group"
                    title="Clique para ordenar por Status do Embarque"
                  >
                    <div className="flex items-center justify-center gap-1.5">
                      <span>Status Embarque</span>
                      {renderSortIcon('outcomeStatus')}
                    </div>
                  </th>

                  {/* Col 10: MOTIVO CANCELAMENTO / REPROVA */}
                  <th 
                    onClick={() => handleSort('cancellationReason')}
                    className="px-3.5 py-3 cursor-pointer hover:bg-gray-200/70 dark:hover:bg-gray-600/70 transition-colors group"
                    title="Clique para ordenar por Motivo de Cancelamento"
                  >
                    <div className="flex items-center justify-between gap-1.5">
                      <span>Motivo Cancelamento / Reprova</span>
                      {renderSortIcon('cancellationReason')}
                    </div>
                  </th>

                  {/* Col 11: AÇÕES */}
                  <th className="px-3.5 py-3 text-center">Ações</th>
                </tr>

                {/* 2. Column-Level Filter Controls Row (Optional & Toggleable) */}
                {showColumnFilters && (
                  <tr className="bg-gray-50/90 dark:bg-gray-800/90 border-b border-gray-200 dark:border-gray-700">
                    {/* Filter 1: Embarque / Data */}
                    <th className="p-1.5 font-normal">
                      <input
                        type="text"
                        placeholder="Filtrar ID/Data..."
                        value={colFilters.shipmentOrDate}
                        onChange={e => updateColFilter('shipmentOrDate', e.target.value)}
                        className="w-full p-1.5 text-[11px] bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-md text-gray-800 dark:text-gray-200 focus:ring-1 focus:ring-primary focus:outline-none"
                      />
                    </th>

                    {/* Filter 2: Motorista & Documento */}
                    <th className="p-1.5 font-normal">
                      <input
                        type="text"
                        placeholder="Filtrar Motorista/CPF..."
                        value={colFilters.driverOrDoc}
                        onChange={e => updateColFilter('driverOrDoc', e.target.value)}
                        className="w-full p-1.5 text-[11px] bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-md text-gray-800 dark:text-gray-200 focus:ring-1 focus:ring-primary focus:outline-none"
                      />
                    </th>

                    {/* Filter 3: Veículo / Placas */}
                    <th className="p-1.5 font-normal">
                      <input
                        type="text"
                        placeholder="Filtrar Placa..."
                        value={colFilters.vehicleOrPlate}
                        onChange={e => updateColFilter('vehicleOrPlate', e.target.value)}
                        className="w-full p-1.5 text-[11px] bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-md text-gray-800 dark:text-gray-200 focus:ring-1 focus:ring-primary focus:outline-none"
                      />
                    </th>

                    {/* Filter 4: Cliente & Carga */}
                    <th className="p-1.5 font-normal">
                      <input
                        type="text"
                        placeholder="Filtrar Cliente/Carga..."
                        value={colFilters.clientOrCargo}
                        onChange={e => updateColFilter('clientOrCargo', e.target.value)}
                        className="w-full p-1.5 text-[11px] font-semibold bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-700 rounded-md text-gray-900 dark:text-slate-100 focus:ring-1 focus:ring-primary focus:outline-none"
                      />
                    </th>

                    {/* Filter 5: Modalidade */}
                    <th className="p-1.5 font-normal">
                      <select
                        value={colFilters.queryType}
                        onChange={e => updateColFilter('queryType', e.target.value)}
                        className="w-full p-1.5 text-[11px] font-semibold bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-700 rounded-md text-gray-900 dark:text-slate-100 focus:ring-1 focus:ring-primary focus:outline-none"
                      >
                        <option value="ALL">Todas</option>
                        {riskQueryOptions.map(opt => (
                          <option key={opt.id} value={opt.name}>{opt.name}</option>
                        ))}
                      </select>
                    </th>

                    {/* Filter 6: Custo Consulta */}
                    <th className="p-1.5 font-normal">
                      <select
                        value={colFilters.costRange}
                        onChange={e => updateColFilter('costRange', e.target.value)}
                        className="w-full p-1.5 text-[11px] font-semibold bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-700 rounded-md text-gray-900 dark:text-slate-100 focus:ring-1 focus:ring-primary focus:outline-none"
                      >
                        <option value="ALL">Todos</option>
                        <option value="withCost">&gt; R$ 0,00</option>
                        <option value="zero">R$ 0,00 (Grátis)</option>
                        <option value="7">R$ 7,00</option>
                        <option value="15">R$ 15,00</option>
                        <option value="33">R$ 33,00</option>
                        <option value="70">R$ 70,00</option>
                      </select>
                    </th>

                    {/* Filter 7: Cód. Liberação */}
                    <th className="p-1.5 font-normal">
                      <input
                        type="text"
                        placeholder="Filtrar Código..."
                        value={colFilters.releaseCode}
                        onChange={e => updateColFilter('releaseCode', e.target.value)}
                        className="w-full p-1.5 text-[11px] font-semibold bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-700 rounded-md text-gray-900 dark:text-slate-100 focus:ring-1 focus:ring-primary focus:outline-none"
                      />
                    </th>

                    {/* Filter 8: Status Liberação */}
                    <th className="p-1.5 font-normal">
                      <select
                        value={colFilters.releaseStatus}
                        onChange={e => updateColFilter('releaseStatus', e.target.value)}
                        className="w-full p-1.5 text-[11px] font-semibold bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-700 rounded-md text-gray-900 dark:text-slate-100 focus:ring-1 focus:ring-primary focus:outline-none"
                      >
                        <option value="ALL">Todos</option>
                        <option value="Aprovado">Aprovado</option>
                        <option value="Reprovado">Reprovado</option>
                        <option value="Pendente">Pendente</option>
                      </select>
                    </th>

                    {/* Filter 9: Status Embarque */}
                    <th className="p-1.5 font-normal">
                      <select
                        value={colFilters.outcomeStatus}
                        onChange={e => updateColFilter('outcomeStatus', e.target.value)}
                        className="w-full p-1.5 text-[11px] font-semibold bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-700 rounded-md text-gray-900 dark:text-slate-100 focus:ring-1 focus:ring-primary focus:outline-none"
                      >
                        <option value="ALL">Todos</option>
                        <option value="Concluído">Concluído</option>
                        <option value="Em Andamento">Em Andamento</option>
                        <option value="Cancelado">Cancelado</option>
                      </select>
                    </th>

                    {/* Filter 10: Motivo Cancelamento */}
                    <th className="p-1.5 font-normal">
                      <input
                        type="text"
                        placeholder="Filtrar Motivo..."
                        value={colFilters.cancellationReason}
                        onChange={e => updateColFilter('cancellationReason', e.target.value)}
                        className="w-full p-1.5 text-[11px] bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-md text-gray-800 dark:text-gray-200 focus:ring-1 focus:ring-primary focus:outline-none"
                      />
                    </th>

                    {/* Filter 11: Reset Col Filters Button */}
                    <th className="p-1.5 text-center">
                      {hasActiveColFilters && (
                        <button
                          onClick={handleResetColumnFiltersOnly}
                          className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/30 rounded"
                          title="Limpar filtros das colunas"
                        >
                          <FilterX className="w-4 h-4 mx-auto" />
                        </button>
                      )}
                    </th>
                  </tr>
                )}
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {paginatedRows.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="py-12 text-center text-gray-500 dark:text-gray-400">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <AlertCircle className="w-8 h-8 text-gray-400" />
                        <p className="font-semibold">Nenhuma consulta de seguradora encontrada para os filtros selecionados.</p>
                        <button
                          onClick={handleClearFilters}
                          className="text-xs text-primary dark:text-blue-400 hover:underline font-bold"
                        >
                          Limpar todos os filtros para ver todos os registros
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  paginatedRows.map(row => {
                    return (
                      <tr 
                        key={row.shipment.id}
                        className={`hover:bg-blue-50/30 dark:hover:bg-gray-700/40 transition-colors ${
                          row.isWastedCost ? 'bg-red-50/20 dark:bg-red-950/10' : ''
                        }`}
                      >
                        {/* ID e Data */}
                        <td className="px-3.5 py-3">
                          <button
                            onClick={() => setSelectedShipmentForDetails(row.shipment)}
                            className="font-mono font-bold text-primary dark:text-blue-400 hover:underline flex items-center gap-1"
                          >
                            {row.shipment.id}
                          </button>
                          <p className="text-[10px] text-gray-400 mt-0.5">{formatDate(row.createdAt)}</p>
                        </td>

                        {/* Motorista & CPF */}
                        <td className="px-3.5 py-3">
                          <p className="font-semibold text-gray-900 dark:text-gray-100">{row.shipment.driverName}</p>
                          <p className="text-[10px] text-gray-500 dark:text-gray-400">CPF: {row.shipment.driverCpf || '-'}</p>
                        </td>

                        {/* Placas */}
                        <td className="px-3.5 py-3 font-mono">
                          <span className="font-bold text-gray-800 dark:text-gray-200">{row.shipment.horsePlate || '-'}</span>
                          {(row.shipment.trailer1Plate || row.shipment.trailer2Plate) && (
                            <p className="text-[10px] text-gray-500 dark:text-gray-400">
                              {[row.shipment.trailer1Plate, row.shipment.trailer2Plate, row.shipment.trailer3Plate].filter(Boolean).join(' | ')}
                            </p>
                          )}
                        </td>

                        {/* Cliente e Carga */}
                        <td className="px-3.5 py-3">
                          <p className="font-medium text-gray-800 dark:text-gray-200 truncate max-w-[150px]" title={row.client?.nomeFantasia}>
                            {row.client?.nomeFantasia || 'N/A'}
                          </p>
                          <p className="text-[10px] text-gray-400">
                            Carga: #{row.cargo?.sequenceId || row.cargo?.id?.substring(0, 8) || '-'}
                          </p>
                        </td>

                        {/* Modalidade */}
                        <td className="px-3.5 py-3">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-600">
                            {row.queryType}
                          </span>
                        </td>

                        {/* Custo Consulta */}
                        <td className="px-3.5 py-3 text-right font-mono font-bold">
                          <span className={row.queryCost > 0 ? (row.isWastedCost ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400') : 'text-gray-400'}>
                            {formatCurrency(row.queryCost)}
                          </span>
                        </td>

                        {/* Cód Liberação */}
                        <td className="px-3.5 py-3 text-center font-mono">
                          {row.releaseCode ? (
                            <span className="px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-bold border border-blue-200 dark:border-blue-800">
                              {row.releaseCode}
                            </span>
                          ) : (
                            <span className="text-gray-400 italic text-[11px]">-</span>
                          )}
                        </td>

                        {/* Status Liberação */}
                        <td className="px-3.5 py-3 text-center">
                          {row.releaseStatus === 'Aprovado' && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                              <CheckCircle2 className="w-3 h-3" /> Aprovado
                            </span>
                          )}
                          {row.releaseStatus === 'Reprovado' && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300">
                              <XCircle className="w-3 h-3" /> Reprovado
                            </span>
                          )}
                          {row.releaseStatus === 'Pendente' && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                              <Clock className="w-3 h-3" /> Pendente
                            </span>
                          )}
                        </td>

                        {/* Status Embarque */}
                        <td className="px-3.5 py-3 text-center">
                          {row.outcomeStatus === 'Concluído' && (
                            <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                              Concluído
                            </span>
                          )}
                          {row.outcomeStatus === 'Em Andamento' && (
                            <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
                              {row.shipment.status}
                            </span>
                          )}
                          {row.outcomeStatus === 'Cancelado' && (
                            <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400 border border-red-200 dark:border-red-800">
                              Cancelado
                            </span>
                          )}
                        </td>

                        {/* Motivo Cancelamento */}
                        <td className="px-3.5 py-3">
                          {row.cancellationReason ? (
                            <p className="text-red-600 dark:text-red-400 text-xs font-medium max-w-[200px] truncate" title={row.cancellationReason}>
                              {row.cancellationReason}
                            </p>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>

                        {/* Ações */}
                        <td className="px-3.5 py-3 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            {!isDemo && (
                              <>
                                <button
                                  onClick={() => handleOpenRdo(row.shipment)}
                                  className="p-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 text-blue-600 dark:text-blue-400 transition-colors"
                                  title="Triagem e Análise no RDO Nacional (MRB Soluções)"
                                >
                                  <ShieldCheck className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => handleOpenSiga(row.shipment)}
                                  className="p-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-900/30 dark:hover:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 transition-colors"
                                  title="Consulta e Análise na Gerenciadora SIGA GR"
                                >
                                  <ShieldCheck className="w-3.5 h-3.5 text-indigo-500" />
                                </button>
                                <button
                                  onClick={() => setShipmentToEditRisk(row.shipment)}
                                  className="p-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 transition-colors"
                                  title="Editar modalidade / tipo de consulta"
                                >
                                  <Edit className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                            <button
                              onClick={() => setSelectedShipmentForDetails(row.shipment)}
                              className="p-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 transition-colors"
                              title="Ver detalhes do embarque"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {filteredAndSortedRows.length > 0 && (
            <div className="p-4 border-t border-gray-100 dark:border-gray-700 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-gray-500">
              <div>
                Mostrando <strong>{(safeCurrentPage - 1) * itemsPerPage + 1}</strong> a{' '}
                <strong>{Math.min(safeCurrentPage * itemsPerPage, filteredAndSortedRows.length)}</strong> de{' '}
                <strong>{filteredAndSortedRows.length}</strong> registros
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                  disabled={safeCurrentPage === 1}
                  className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 font-medium"
                >
                  Anterior
                </button>
                <span className="font-semibold text-gray-700 dark:text-gray-300">
                  Página {safeCurrentPage} de {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                  disabled={safeCurrentPage === totalPages}
                  className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 font-medium"
                >
                  Próxima
                </button>
              </div>
            </div>
          )}
        </div>
      ) : activeTab === 'analytics' ? (
        /* Tab 2: Analytics & Cancellation Losses */
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Box 1: Custos por Modalidade de Consulta */}
            <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm">
              <h3 className="text-base font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-primary" />
                Custos por Modalidade de Consulta
              </h3>
              <div className="space-y-3">
                {stats.queryTypeList.map(item => {
                  const percent = stats.totalGasto > 0 ? (item.totalCost / stats.totalGasto) * 100 : 0;
                  return (
                    <div key={item.type} className="p-3 bg-gray-50 dark:bg-gray-700/40 rounded-xl border border-gray-100 dark:border-gray-600/50">
                      <div className="flex justify-between items-center mb-1.5">
                        <span className="font-semibold text-xs text-gray-800 dark:text-gray-200">{item.type}</span>
                        <div className="text-right">
                          <span className="font-mono font-bold text-xs text-gray-900 dark:text-white">{formatCurrency(item.totalCost)}</span>
                          <span className="text-[10px] text-gray-400 ml-1.5">({item.count} consultas)</span>
                        </div>
                      </div>
                      <div className="w-full bg-gray-200 dark:bg-gray-600 h-2 rounded-full overflow-hidden">
                        <div
                          className="bg-primary h-full rounded-full transition-all duration-500"
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Box 2: Desfecho & Eficiência */}
            <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm flex flex-col justify-between">
              <div>
                <h3 className="text-base font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-emerald-500" />
                  Eficiência Operacional das Consultas
                </h3>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="p-4 bg-emerald-50 dark:bg-emerald-950/20 rounded-xl border border-emerald-100 dark:border-emerald-900/30">
                    <p className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300 uppercase">Deram Sequência</p>
                    <h4 className="text-2xl font-black text-emerald-800 dark:text-emerald-200 mt-1">
                      {stats.countSequenciado}
                    </h4>
                    <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1 font-semibold">
                      {stats.percentSequenciado.toFixed(1)}% de aproveitamento
                    </p>
                  </div>

                  <div className="p-4 bg-red-50 dark:bg-red-950/20 rounded-xl border border-red-100 dark:border-red-900/30">
                    <p className="text-[11px] font-bold text-red-700 dark:text-red-300 uppercase">Consultas Perdidas</p>
                    <h4 className="text-2xl font-black text-red-800 dark:text-red-200 mt-1">
                      {stats.countDesperdicio}
                    </h4>
                    <p className="text-xs text-red-600 dark:text-red-400 mt-1 font-semibold">
                      {stats.percentCancelado.toFixed(1)}% de cancelamento
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-100 dark:border-blue-800/50">
                <p className="text-xs text-blue-900 dark:text-blue-200 font-medium">
                  💡 <strong>Impacto no Custo:</strong> A cada 100 consultas realizadas, aproximadamente{' '}
                  <strong>{stats.percentCancelado.toFixed(0)}</strong> não chegam ao carregamento, representando um custo perdido de{' '}
                  <strong>{formatCurrency(stats.totalDesperdicio)}</strong> no período analisado.
                </p>
              </div>
            </div>
          </div>

          {/* Ranking dos Principais Motivos de Cancelamento */}
          <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm">
            <h3 className="text-base font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-red-500" />
              Ranking de Motivos de Cancelamento & Desperdício Financeiro
            </h3>

            {stats.reasonsList.length === 0 ? (
              <div className="py-8 text-center text-gray-500 dark:text-gray-400">
                Nenhum cancelamento registrado no período filtrado.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="bg-gray-100/75 dark:bg-gray-700/50 text-gray-600 dark:text-gray-300 font-bold uppercase tracking-wider border-b border-gray-200/60 dark:border-gray-700">
                      <th className="px-4 py-3">Motivo Informado</th>
                      <th className="px-4 py-3 text-center">Qtd. Cancelamentos</th>
                      <th className="px-4 py-3 text-right">Custo Desperdiçado</th>
                      <th className="px-4 py-3 text-right">% do Desperdício</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {stats.reasonsList.map((item, idx) => {
                      const percentOfWaste = stats.totalDesperdicio > 0 ? (item.wastedCost / stats.totalDesperdicio) * 100 : 0;
                      return (
                        <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                          <td className="px-4 py-3 font-semibold text-gray-800 dark:text-gray-200">
                            {item.reason}
                          </td>
                          <td className="px-4 py-3 text-center font-bold text-gray-700 dark:text-gray-300">
                            {item.count}
                          </td>
                          <td className="px-4 py-3 text-right font-mono font-bold text-red-600 dark:text-red-400">
                            {formatCurrency(item.wastedCost)}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold text-gray-600 dark:text-gray-400">
                            {percentOfWaste.toFixed(1)}%
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Tab 3: Modalidades de Consulta (Gerenciamento e Cadastro) */
        <RiskQueryTypesPage
          riskQueryOptions={riskQueryOptions}
          onSaveOption={onSaveRiskQueryOption || (() => {})}
          onDeleteOption={onDeleteRiskQueryOption || (() => {})}
          onRestoreDefaults={onRestoreRiskQueryDefaults}
          currentUser={currentUser || ({} as User)}
          profilePermissions={profilePermissions}
        />
      )}

      {/* Shipment Details Modal */}
      {selectedShipmentForDetails && (
        <ShipmentDetailsModal
          isOpen={!!selectedShipmentForDetails}
          onClose={() => setSelectedShipmentForDetails(null)}
          shipment={selectedShipmentForDetails}
          cargo={cargos.find(c => c.id === selectedShipmentForDetails.cargoId)}
          currentUser={currentUser}
          clients={clients}
          products={products}
          vehicles={vehicles}
          users={users}
          companyLogo={companyLogo}
          onUpdatePrice={onUpdatePrice}
          onUpdateShipmentData={onUpdateShipmentData}
          onAddAttachments={onAddAttachments}
          onDeleteAttachment={onDeleteAttachment}
          onSwapCargo={onSwapCargo}
          cargos={cargos}
        />
      )}

      {/* Edit Risk Query Modal */}
      {shipmentToEditRisk && (
        <EditRiskQueryModal
          isOpen={!!shipmentToEditRisk}
          onClose={() => setShipmentToEditRisk(null)}
          shipment={shipmentToEditRisk}
          cargo={cargos.find(c => c.id === shipmentToEditRisk.cargoId)}
          client={clientMap.get(cargos.find(c => c.id === shipmentToEditRisk.cargoId)?.clientId || '')}
          driver={driverMap.get(shipmentToEditRisk.driverCpf ? shipmentToEditRisk.driverCpf.replace(/\D/g, '') : shipmentToEditRisk.driverName.toLowerCase())}
          vehicle={vehicleMap.get(shipmentToEditRisk.horsePlate ? shipmentToEditRisk.horsePlate.replace(/[^a-zA-Z0-9]/g, '').toUpperCase() : '')}
          riskQueryOptions={riskQueryOptions}
          onSave={async (shipmentId, data) => {
            if (onUpdateShipmentData) {
              await onUpdateShipmentData(shipmentId, data);
            }
          }}
        />
      )}

      {/* RDO Nacional Modal */}
      <RdoNacionalModal
        isOpen={isRdoModalOpen}
        onClose={() => {
          setIsRdoModalOpen(false);
          setTargetShipmentForIntegration(null);
        }}
        shipments={shipments}
        drivers={drivers}
        vehicles={vehicles}
        owners={owners}
        currentUser={currentUser}
        initialShipmentId={targetShipmentForIntegration?.id || undefined}
        initialDriverId={targetShipmentForIntegration?.driverId || undefined}
        onSelectApprovedCode={(code, shipmentId) => {
          const targetId = shipmentId || targetShipmentForIntegration?.id || shipmentToEditRisk?.id;
          if (targetId && onUpdateShipmentData) {
            onUpdateShipmentData(targetId, {
              riskReleaseCode: code,
              riskQueryType: 'RDO Nacional',
            });
          }
        }}
      />

      {/* SIGA GR Modal */}
      <SigaGrModal
        isOpen={isSigaModalOpen}
        onClose={() => {
          setIsSigaModalOpen(false);
          setTargetShipmentForIntegration(null);
        }}
        shipments={shipments}
        drivers={drivers}
        vehicles={vehicles}
        currentUser={currentUser}
        initialShipmentId={targetShipmentForIntegration?.id || undefined}
        initialDriverId={targetShipmentForIntegration?.driverId || undefined}
        onSelectApprovedCode={(code, procNum, shipmentId) => {
          const targetId = shipmentId || targetShipmentForIntegration?.id || shipmentToEditRisk?.id;
          if (targetId && onUpdateShipmentData) {
            onUpdateShipmentData(targetId, {
              riskReleaseCode: code,
              riskQueryType: 'SIGA GR',
            });
          }
        }}
      />
    </div>
  );
};

export default RiskManagementPage;
