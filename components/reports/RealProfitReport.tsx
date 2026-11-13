import React, { useState, useMemo } from 'react';
import type { Shipment, User, Cargo, Client, Driver, Vehicle, Branch, Product } from '../../types';
import { ShipmentStatus, UserProfile } from '../../types';
import { 
  DollarSign, 
  TrendingUp, 
  TrendingDown, 
  FileText, 
  Download, 
  Search, 
  Filter, 
  Eye, 
  Paperclip, 
  Receipt, 
  X,
  Truck, 
  Sparkles,
  Upload,
  ShieldCheck,
  RefreshCw
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import MultiSelectDropdown from '../MultiSelectDropdown';
import AttachmentModal from '../AttachmentModal';
import { openDocumentInNewTab } from '../../utils/documentViewer';
import { getShipmentCte, getShipmentEffectiveDate, isCteApplicableForStatus, isStayForShipment, hasCteAttached, normalizeWeightTonnage } from '../../utils';
import CteCostAutomationPanel from '../CteCostAutomationPanel';
import { calculateShipmentExpenses } from '../../utils/operationalExpensesCalculator';
import { addPdfLogo } from '../../utils/pdfGenerator';
import { extractCteNumberFromStay, type StayRecord } from '../../utils/toolStorage';

interface RealProfitReportProps {
  shipments: Shipment[];
  cargos: Cargo[];
  clients: Client[];
  users: User[];
  currentUser: User | null;
  drivers?: Driver[];
  vehicles?: Vehicle[];
  branches?: Branch[];
  products?: Product[];
  stays?: StayRecord[];
  companyLogo?: string | null;
  startDate?: string;
  endDate?: string;
  onUpdateAttachment?: (shipmentId: string, data: any) => Promise<void>;
  onBatchUpdateShipments?: (updatedShipments: Shipment[]) => Promise<void> | void;
  onUpdateShipmentData?: (shipmentId: string, data: Partial<Shipment>, options?: { silent?: boolean }) => Promise<void>;
}

export const RealProfitReport: React.FC<RealProfitReportProps> = ({
  shipments,
  cargos,
  clients,
  users,
  currentUser,
  drivers = [],
  vehicles = [],
  branches = [],
  products = [],
  stays = [],
  companyLogo,
  startDate: propStartDate,
  endDate: propEndDate,
  onUpdateAttachment,
  onBatchUpdateShipments,
  onUpdateShipmentData
}) => {
  // Filtros internos
  const [searchTerm, setSearchTerm] = useState('');
  const [startDate, setStartDate] = useState(propStartDate || '');
  const [endDate, setEndDate] = useState(propEndDate || '');
  const [selectedStatus, setSelectedStatus] = useState<string[]>([]);
  const [selectedClients, setSelectedClients] = useState<string[]>([]);
  const isAgenciador = currentUser?.profile === UserProfile.Agenciador || (currentUser?.profile as string) === 'Agenciador';
  const [selectedDrivers, setSelectedDrivers] = useState<string[]>([]);
  const [selectedOrigins, setSelectedOrigins] = useState<string[]>([]);
  const [selectedDestinations, setSelectedDestinations] = useState<string[]>([]);
  const [selectedBranches, setSelectedBranches] = useState<string[]>([]);
  const [selectedRequesters, setSelectedRequesters] = useState<string[]>([]);
  const [selectedExport, setSelectedExport] = useState<string[]>([]);
  const [selectedDriverRegimes, setSelectedDriverRegimes] = useState<string[]>([]);
  const [onlyWithOcr, setOnlyWithOcr] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);

  React.useEffect(() => {
    if (propStartDate) setStartDate(propStartDate);
  }, [propStartDate]);

  React.useEffect(() => {
    if (propEndDate) setEndDate(propEndDate);
  }, [propEndDate]);

  // Modal de Detalhes de Despesas
  const [selectedShipmentForDetail, setSelectedShipmentForDetail] = useState<Shipment | null>(null);
  
  // Modal de Edição / Anexo de Resumo Financeiro
  const [editingShipmentForAttachment, setEditingShipmentForAttachment] = useState<Shipment | null>(null);

  // Mapeamentos rápidos
  const cargoMap = useMemo(() => new Map(cargos.map(c => [c.id, c])), [cargos]);
  const clientMap = useMemo(() => new Map(clients.map(cl => [cl.id, cl])), [clients]);
  const userMap = useMemo(() => new Map(users.map(u => [u.id, u])), [users]);
  const userBranchMap = useMemo(() => new Map(users.map(u => [u.id, u.branchId])), [users]);

  // Função auxiliar para identificar a filial do embarque (considerando o usuário responsável pelo embarque/carga)
  const getShipmentBranchName = (s: Shipment, cargo?: Cargo): string => {
    const bId = s.branchId || 
                userBranchMap.get(s.embarcadorId) || 
                userBranchMap.get(s.createdById) || 
                cargo?.branchId || 
                (cargo ? userBranchMap.get(cargo.createdById) : undefined);

    if (bId) {
      const branch = branches.find(b => b.id === bId);
      if (branch) return branch.name;
    }
    return 'Matriz';
  };

  // Opções para MultiSelect
  const statusOptions = Object.values(ShipmentStatus);
  const exportOptions = ['Exportação', 'Mercado Interno'];
  const driverRegimeOptions = ['PF', 'PJ Simples', 'PJ Real/Presumido'];
  const clientOptions = Array.from(new Set(cargos.map(c => {
    const cl = clientMap.get(c.clientId);
    return cl?.nomeFantasia || cl?.razaoSocial || c.clientId;
  }))).filter(Boolean).sort();

  const driverOptions = Array.from(new Set(shipments.map(s => s.driverName))).filter(Boolean).sort();
  
  const requesterOptions = useMemo(() => {
    const names = new Set<string>();
    shipments.forEach(s => {
      const cargo = cargoMap.get(s.cargoId);
      const requesterUser = userMap.get(s.embarcadorId) || userMap.get(s.createdById) || (cargo?.createdById ? userMap.get(cargo.createdById) : undefined);
      const requesterName = requesterUser?.name || s.agencyCommissionAgencyName || s.embarcadorId || s.createdById;
      if (requesterName) names.add(requesterName);
    });
    return Array.from(names).filter(Boolean).sort();
  }, [shipments, cargoMap, userMap]);

  const branchOptions = useMemo(() => {
    const names = new Set(branches.map(b => b.name));
    names.add('Matriz');
    return Array.from(names).filter(Boolean).sort();
  }, [branches]);

  const originOptions = useMemo(() => {
    const set = new Set<string>();
    shipments.forEach(s => {
      const cargo = cargoMap.get(s.cargoId);
      const origin = ((s as any).origin || cargo?.origin || '').trim();
      if (origin) set.add(origin);
    });
    cargos.forEach(c => {
      if (c.origin && c.origin.trim()) set.add(c.origin.trim());
    });
    return Array.from(set).filter(Boolean).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [shipments, cargos, cargoMap]);

  const destinationOptions = useMemo(() => {
    const set = new Set<string>();
    shipments.forEach(s => {
      const cargo = cargoMap.get(s.cargoId);
      const dest = ((s as any).destination || cargo?.destination || '').trim();
      if (dest) set.add(dest);
    });
    cargos.forEach(c => {
      if (c.destination && c.destination.trim()) set.add(c.destination.trim());
    });
    return Array.from(set).filter(Boolean).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [shipments, cargos, cargoMap]);

  // Filtragem dos embarques
  const filteredData = useMemo(() => {
    return shipments.filter(s => {
      const cargo = cargoMap.get(s.cargoId);
      const client = cargo ? clientMap.get(cargo.clientId) : undefined;
      const clientName = client?.nomeFantasia || client?.razaoSocial || '';

      // Filtro de texto (ID, CT-e, NF-e, Motorista, Placa, Solicitante)
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase().trim();
        const matchesId = s.id.toLowerCase().includes(term);
        const matchesCte = s.cteNumber?.toLowerCase().includes(term);
        const matchesNfe = s.nfeNumber?.toLowerCase().includes(term);
        const matchesDriver = s.driverName.toLowerCase().includes(term);
        const matchesPlate = s.horsePlate.toLowerCase().includes(term);
        const matchesClient = clientName.toLowerCase().includes(term);
        const matchesOrigin = cargo?.origin?.toLowerCase().includes(term);
        const matchesDest = cargo?.destination?.toLowerCase().includes(term);

        // Solicitante / Usuário responsável / Agência
        const requesterUser = userMap.get(s.embarcadorId) || userMap.get(s.createdById) || (cargo?.createdById ? userMap.get(cargo.createdById) : undefined);
        const requesterName = requesterUser?.name || s.agencyCommissionAgencyName || s.embarcadorId || s.createdById || '';
        const requesterEmail = requesterUser?.email || '';
        const matchesRequester = requesterName.toLowerCase().includes(term) || requesterEmail.toLowerCase().includes(term);

        if (!matchesId && !matchesCte && !matchesNfe && !matchesDriver && !matchesPlate && !matchesClient && !matchesOrigin && !matchesDest && !matchesRequester) {
          return false;
        }
      }

      // Filtro por Data de Início e Fim (Data de Emissão CT-e, Data Efetivada ou Data Programada)
      if (startDate || endDate) {
        const shipDate = getShipmentEffectiveDate(s) || s.scheduledDate || (s.createdAt ? s.createdAt.substring(0, 10) : '');

        if (!shipDate) {
          return false;
        }
        if (startDate && shipDate < startDate) {
          return false;
        }
        if (endDate && shipDate > endDate) {
          return false;
        }
      }

      // Filtro de Status
      if (selectedStatus.length > 0 && !selectedStatus.includes(s.status)) {
        return false;
      }

      // Filtro Destinação da Carga (Exportação / Mercado Interno)
      if (selectedExport.length > 0) {
        const isExp = Boolean(
          cargo?.isExport ||
          (s as any)?.isExport ||
          (cargo?.observations && /export/i.test(cargo.observations)) ||
          (cargo?.destination && /(porto|terminal|embarque portu[aá]rio|santos|paranagu[aá]|itaqui|rio grande|barcarena|suape|vit[oó]ria)/i.test(cargo.destination)) ||
          ((s as any)?.observations && /export/i.test((s as any).observations)) ||
          ((s as any)?.destination && /(porto|terminal|embarque portu[aá]rio|santos|paranagu[aá]|itaqui|rio grande|barcarena|suape|vit[oó]ria)/i.test((s as any).destination))
        );
        const expLabel = isExp ? 'Exportação' : 'Mercado Interno';
        if (!selectedExport.includes(expLabel)) {
          return false;
        }
      }

      // Filtro Regime Tributário do Motorista (PF / PJ Simples / PJ Real/Presumido)
      if (selectedDriverRegimes.length > 0) {
        const isPf = s.driverFreightType === 'PF' || s.anttModality === 'TAC';
        let regimeLabel: 'PF' | 'PJ Simples' | 'PJ Real/Presumido' = 'PF';
        if (isPf) {
          regimeLabel = 'PF';
        } else {
          const isSimples = Boolean(
            s.etcTaxRegime === 'Simples Nacional' ||
            s.etcTaxRegime === 'MEI' ||
            (s as any)?.isSimplesNacional ||
            (s.documents as any)?.etc_tax_regime === 'Simples Nacional' ||
            (s.documents as any)?.etc_tax_regime === 'MEI' ||
            (s.documents as any)?.crt === '1' ||
            (s.documents as any)?.crt === '2'
          );
          regimeLabel = isSimples ? 'PJ Simples' : 'PJ Real/Presumido';
        }
        if (!selectedDriverRegimes.includes(regimeLabel)) {
          return false;
        }
      }

      // Filtro de Cliente
      if (selectedClients.length > 0 && !selectedClients.includes(clientName)) {
        return false;
      }

      // Filtro de Motorista
      if (selectedDrivers.length > 0 && !selectedDrivers.includes(s.driverName)) {
        return false;
      }

      // Filtro de Origem
      if (selectedOrigins.length > 0) {
        const originVal = ((s as any).origin || cargo?.origin || '').trim().toLowerCase();
        const matchesOrigin = selectedOrigins.some(selected => {
          const sel = selected.trim().toLowerCase();
          return originVal === sel || originVal.includes(sel) || sel.includes(originVal);
        });
        if (!matchesOrigin) {
          return false;
        }
      }

      // Filtro de Destino
      if (selectedDestinations.length > 0) {
        const destVal = ((s as any).destination || cargo?.destination || '').trim().toLowerCase();
        const matchesDest = selectedDestinations.some(selected => {
          const sel = selected.trim().toLowerCase();
          return destVal === sel || destVal.includes(sel) || sel.includes(destVal);
        });
        if (!matchesDest) {
          return false;
        }
      }

      // Filtro de Solicitante
      if (selectedRequesters.length > 0) {
        const requesterUser = userMap.get(s.embarcadorId) || userMap.get(s.createdById) || (cargo?.createdById ? userMap.get(cargo.createdById) : undefined);
        const requesterName = requesterUser?.name || s.agencyCommissionAgencyName || s.embarcadorId || s.createdById || '';
        if (!selectedRequesters.includes(requesterName)) {
          return false;
        }
      }

      // Filtro de Filial / Matriz (verificando filial do embarque e filial dos usuários vinculados)
      if (selectedBranches.length > 0) {
        const branchName = getShipmentBranchName(s, cargo);
        if (!selectedBranches.includes(branchName)) {
          return false;
        }
      }

      // REGRA OBRIGATÓRIA: Contabilizar apenas embarques efetivados que possuem CT-e emitido
      if (s.status === ShipmentStatus.Cancelado || (s.status as string) === 'Cancelado') {
        return false;
      }

      if (!isCteApplicableForStatus(s.status)) {
        return false;
      }

      const cte = getShipmentCte(s);
      const hasCte = Boolean(cte && cte !== '-' && cte.trim() !== '');
      if (!hasCte) {
        return false;
      }

      // Filtro "Apenas com OCR / Demonstrativo"
      if (onlyWithOcr && !s.realProfitData) {
        return false;
      }

      return true;
    });
  }, [shipments, cargoMap, clientMap, userMap, branches, userBranchMap, searchTerm, startDate, endDate, selectedStatus, selectedOrigins, selectedDestinations, selectedExport, selectedDriverRegimes, selectedClients, selectedDrivers, selectedRequesters, selectedBranches, onlyWithOcr]);

  const canViewFinalNetProfit = useMemo(() => {
    if (!currentUser) return false;
    return [
      UserProfile.Desenvolvedor,
      UserProfile.Comercial,
      UserProfile.GerenteComercial,
      UserProfile.Admin,
      UserProfile.Diretor,
      UserProfile.Financeiro,
      UserProfile.Demonstracao
    ].includes(currentUser.profile) ||
    ['Desenvolvedor', 'Comercial', 'Admin', 'Administrador', 'Diretor', 'Financeiro', 'Demonstração', 'Demo'].includes(currentUser.profile as string);
  }, [currentUser]);

  // Cálculos consolidados para cada embarque (Conforme Automatização do CT-e e Estadias)
  const enrichedRows = useMemo(() => {
    return filteredData.map(s => {
      const cargo = cargoMap.get(s.cargoId);
      const client = cargo ? clientMap.get(cargo.clientId) : undefined;
      const clientName = client?.nomeFantasia || client?.razaoSocial || 'Cliente N/A';
      
      // Apuração Completa e Parametrizada idêntica à "Automatização do CT-e"
      const calculatedExpenses = calculateShipmentExpenses(s, cargo, undefined, stays);
      const {
        companyFreight: baseCompanyFreight,
        driverFreight: baseDriverFreight,
        totalExpenses,
        expenseItems: rawExpenseItems,
        riskCost,
        generatedCredit,
      } = calculatedExpenses;

      // Estadias vinculadas a este embarque
      const shipmentStays = stays.filter(stay => isStayForShipment(stay, s));
      const complementCtes = Array.from(new Set(
        shipmentStays
          .map(stay => stay.cteNumber || extractCteNumberFromStay(stay))
          .filter(Boolean)
      )) as string[];
      const demurrageRevenue = shipmentStays.reduce((sum, stay) => sum + (stay.approvedValue || 0), 0);
      const demurrageDriverPaid = shipmentStays.reduce((sum, stay) => sum + (stay.driverPaidValue || 0), 0);
      const demurrageProfit = demurrageRevenue - demurrageDriverPaid;

      // Totais Consolidados (base + estadia)
      const companyFreight = baseCompanyFreight + demurrageRevenue;
      const driverFreight = baseDriverFreight + demurrageDriverPaid;
      const freightDifference = companyFreight - driverFreight;
      const freightDifferenceMarginPercent = companyFreight > 0 ? (freightDifference / companyFreight) * 100 : 0;
      const netProfit = Number((calculatedExpenses.netProfit + demurrageProfit).toFixed(2));
      const profitMarginPercent = companyFreight > 0 ? (netProfit / companyFreight) * 100 : 0;

      // Valores exclusivos do Frete Base / CT-e Principal (Desacoplados)
      const baseFreightDifference = baseCompanyFreight - baseDriverFreight;
      const baseFreightDifferenceMarginPercent = baseCompanyFreight > 0 ? (baseFreightDifference / baseCompanyFreight) * 100 : 0;
      const baseNetProfit = Number(calculatedExpenses.netProfit.toFixed(2));
      const baseProfitMarginPercent = baseCompanyFreight > 0 ? (baseNetProfit / baseCompanyFreight) * 100 : 0;

      // Apuração de Comissões de Agência e Embarcador
      const requesterUser = users.find(u => u.id === s.embarcadorId || u.id === s.createdById);
      const isAgenciadorRequester = requesterUser?.profile === UserProfile.Agenciador || (requesterUser?.profile as string) === 'Agenciador';

      // 1. Comissão do Embarcador (R$/t)
      const isShipperCommEnabled = Boolean(
        s.shipperCommissionEnabled === true ||
        (s.documents as any)?.shipper_commission_enabled === true ||
        s.realProfitData?.shipperCommissionEnabled === true
      );
      const shipperCommRate = s.shipperCommissionRatePerTon !== undefined && s.shipperCommissionRatePerTon !== null
        ? Number(s.shipperCommissionRatePerTon)
        : ((s.documents as any)?.shipper_commission_rate_per_ton !== undefined && (s.documents as any)?.shipper_commission_rate_per_ton !== null
            ? Number((s.documents as any).shipper_commission_rate_per_ton)
            : (s.realProfitData?.shipperCommissionRatePerTon !== undefined && s.realProfitData?.shipperCommissionRatePerTon !== null
                ? Number(s.realProfitData.shipperCommissionRatePerTon)
                : (requesterUser?.shipperCommissionRatePerTon || 0)));

      const tonnage = s.shipmentTonnage || cargo?.totalVolume || 0;
      const shipperCommission = (isShipperCommEnabled && shipperCommRate > 0 && tonnage > 0)
        ? Number((shipperCommRate * tonnage).toFixed(2))
        : (isShipperCommEnabled && s.shipperCommissionValue !== undefined && s.shipperCommissionValue !== null
            ? Number(s.shipperCommissionValue)
            : (isShipperCommEnabled && s.realProfitData?.shipperCommission !== undefined && s.realProfitData?.shipperCommission !== null
                ? Number(s.realProfitData.shipperCommission)
                : 0));

      // 2. Comissão de Agência (% sobre lucro líquido antes da comissão de agência)
      const isAgencyCommEnabled = Boolean(
        s.agencyCommissionEnabled !== undefined
          ? s.agencyCommissionEnabled
          : ((s.documents as any)?.agency_commission_enabled !== undefined
              ? Boolean((s.documents as any).agency_commission_enabled)
              : (isAgenciadorRequester ? true : false))
      );

      const effectiveAgencyPercentage = s.agencyCommissionPercentage ?? requesterUser?.agencyCommissionPercentage ?? 30;
      const opProfitBeforeAgency = Math.max(0, netProfit - shipperCommission);
      const agencyCommission = (isAgencyCommEnabled && opProfitBeforeAgency > 0)
        ? Number((opProfitBeforeAgency * (effectiveAgencyPercentage / 100)).toFixed(2))
        : (isAgencyCommEnabled && s.agencyCommissionValue !== undefined && s.agencyCommissionValue !== null
            ? Number(s.agencyCommissionValue)
            : 0);

      const totalCommissions = Number((shipperCommission + agencyCommission).toFixed(2));
      const netProfitWithCommissions = Number((netProfit - totalCommissions).toFixed(2));
      const marginWithCommissionsPercent = companyFreight > 0 ? (netProfitWithCommissions / companyFreight) * 100 : 0;

      // Comissões desacopladas do Frete Base e do Complementar
      const opProfitBaseBeforeAgency = Math.max(0, baseNetProfit - shipperCommission);
      const baseAgencyCommission = (isAgencyCommEnabled && opProfitBaseBeforeAgency > 0)
        ? Number((opProfitBaseBeforeAgency * (effectiveAgencyPercentage / 100)).toFixed(2))
        : 0;
      const baseTotalCommissions = Number((shipperCommission + baseAgencyCommission).toFixed(2));
      const baseNetProfitWithCommissions = Number((baseNetProfit - baseTotalCommissions).toFixed(2));
      const baseMarginWithCommissionsPercent = baseCompanyFreight > 0 ? (baseNetProfitWithCommissions / baseCompanyFreight) * 100 : 0;

      const demurrageDifference = demurrageRevenue - demurrageDriverPaid;
      const demurrageAgencyComm = (isAgencyCommEnabled && demurrageProfit > 0)
        ? Number((demurrageProfit * (effectiveAgencyPercentage / 100)).toFixed(2))
        : 0;
      const demurrageNetProfitWithCommissions = Number((demurrageProfit - demurrageAgencyComm).toFixed(2));
      const hasComplement = Boolean((demurrageRevenue > 0 || demurrageDriverPaid > 0) || (complementCtes && complementCtes.length > 0));

      // Comprovante / Anexo de saldo ou despesas
      const saldoDoc = s.documents?.['Comprovante de Pagamento de Saldo'] || 
                       s.documents?.['Comprovante de Saldo'] || 
                       s.documents?.['Resumo de Custos'] ||
                       (s.documents ? Object.values(s.documents).flat().find(f => typeof f === 'string' && (f.includes('saldo') || f.includes('comprovante') || f.includes('resumo'))) : undefined);

      const attachmentUrl = Array.isArray(saldoDoc) ? saldoDoc[0] : (typeof saldoDoc === 'string' ? saldoDoc : undefined);
      const toll = (s.tollValue !== undefined && s.tollValue !== null) ? Number(s.tollValue) || 0 : (s.realProfitData?.toll || 0);
      const driverFreightNetToll = Math.max(0, driverFreight - toll);

      return {
        shipment: s,
        cargo,
        clientName,
        cte: getShipmentCte(s),
        companyFreight,
        driverFreight,
        baseCompanyFreight,
        baseDriverFreight,
        baseFreightDifference,
        baseFreightDifferenceMarginPercent,
        baseNetProfit,
        baseProfitMarginPercent,
        baseAgencyCommission,
        baseTotalCommissions,
        baseNetProfitWithCommissions,
        baseMarginWithCommissionsPercent,
        demurrageDifference,
        demurrageAgencyComm,
        demurrageNetProfitWithCommissions,
        hasComplement,
        shipmentStays,
        toll,
        driverFreightNetToll,
        freightDifference,
        freightDifferenceMarginPercent,
        totalExpenses,
        netProfit,
        profitMarginPercent,
        shipperCommission,
        agencyCommission,
        totalCommissions,
        netProfitWithCommissions,
        marginWithCommissionsPercent,
        expenseItems: rawExpenseItems,
        riskCost,
        generatedCredit,
        hasOcr: Boolean(s.realProfitData),
        attachmentUrl,
        calculatedExpenses,
        weight: normalizeWeightTonnage(s.unloadedTonnage || s.loadedTonnage || s.shipmentTonnage || cargo?.totalVolume || 0),
        icms: (() => {
          const isCargoWithoutIcms = Boolean(
            cargo &&
            !cargo.hasIcms &&
            !(cargo.icmsPercentage && Number(cargo.icmsPercentage) > 0) &&
            !(cargo.freightLegs && cargo.freightLegs[0]?.hasIcms === true) &&
            !(cargo.freightLegs && Number(cargo.freightLegs[0]?.icmsPercentage) > 0) &&
            (cargo as any).freightCalculationType !== 'per_ton_plus_icms' &&
            !(cargo.freightLegs && (cargo.freightLegs[0] as any)?.freightCalculationType === 'per_ton_plus_icms') &&
            !(s as any)?.hasIcms
          );

          if (
            isCargoWithoutIcms ||
            (s as any)?.isIcmsExempt ||
            (s.documents as any)?.is_icms_exempt ||
            s.realProfitData?.isIcmsExempt ||
            s.icmsValue === 0 ||
            (s.documents as any)?.icms_value === 0 ||
            s.realProfitData?.icmsDifference === 0
          ) {
            return 0;
          }
          return Number((calculatedExpenses.icms || (s.documents as any)?.icms_value || s.icmsValue || s.realProfitData?.icmsDifference || 0).toFixed(2));
        })(),
        federalTax: (s.realProfitData?.federalTax !== undefined && s.realProfitData.federalTax !== null)
          ? Number(s.realProfitData.federalTax)
          : Number(calculatedExpenses.impostoFederal || 0),
        demurrageRevenue,
        demurrageDriverPaid,
        demurrageProfit,
        complementCtes,
        requesterName: requesterUser?.name || s.agencyCommissionAgencyName || s.embarcadorId || s.createdById || 'N/A',
      };
    });
  }, [filteredData, cargoMap, clientMap, stays, users, userMap]);

  // Totais Gerais
  const totals = useMemo(() => {
    const totalShipments = enrichedRows.length;
    const sumWeight = enrichedRows.reduce((acc, r) => acc + (r.weight || 0), 0);
    const sumCompanyFreight = enrichedRows.reduce((acc, r) => acc + r.companyFreight, 0);
    const sumDriverFreight = enrichedRows.reduce((acc, r) => acc + r.driverFreight, 0);
    const sumToll = enrichedRows.reduce((acc, r) => acc + r.toll, 0);
    const sumDriverFreightNetToll = enrichedRows.reduce((acc, r) => acc + r.driverFreightNetToll, 0);
    const sumFreightDiff = enrichedRows.reduce((acc, r) => acc + r.freightDifference, 0);
    const sumExpenses = enrichedRows.reduce((acc, r) => acc + r.totalExpenses, 0);
    const sumIcms = enrichedRows.reduce((acc, r) => acc + (r.icms || 0), 0);
    const sumFederalTax = enrichedRows.reduce((acc, r) => acc + (r.federalTax || 0), 0);
    const sumOtherExpenses = Math.max(0, sumExpenses - sumFederalTax);
    const sumGeneratedCredit = enrichedRows.reduce((acc, r) => acc + r.generatedCredit, 0);
    const sumNetProfit = enrichedRows.reduce((acc, r) => acc + r.netProfit, 0);
    const sumShipperCommission = enrichedRows.reduce((acc, r) => acc + r.shipperCommission, 0);
    const sumAgencyCommission = enrichedRows.reduce((acc, r) => acc + r.agencyCommission, 0);
    const sumCommissions = enrichedRows.reduce((acc, r) => acc + r.totalCommissions, 0);
    const sumNetProfitWithCommissions = enrichedRows.reduce((acc, r) => acc + r.netProfitWithCommissions, 0);
    const countOcr = enrichedRows.filter(r => r.hasOcr).length;

    const consolidatedMargin = sumCompanyFreight > 0 ? (sumNetProfit / sumCompanyFreight) * 100 : 0;
    const consolidatedMarginWithCommissions = sumCompanyFreight > 0 ? (sumNetProfitWithCommissions / sumCompanyFreight) * 100 : 0;
    const consolidatedFreightMargin = sumCompanyFreight > 0 ? (sumFreightDiff / sumCompanyFreight) * 100 : 0;

    return {
      totalShipments,
      sumWeight,
      sumCompanyFreight,
      sumDriverFreight,
      sumToll,
      sumDriverFreightNetToll,
      sumFreightDiff,
      sumExpenses,
      sumIcms,
      sumFederalTax,
      sumOtherExpenses,
      sumGeneratedCredit,
      sumNetProfit,
      sumShipperCommission,
      sumAgencyCommission,
      sumCommissions,
      sumNetProfitWithCommissions,
      consolidatedMargin,
      consolidatedMarginWithCommissions,
      consolidatedFreightMargin,
      consolidatedFreightDiffMargin: consolidatedFreightMargin,
      countOcr,
    };
  }, [enrichedRows]);

  // Exportação para PDF
  const handleExportPDF = () => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    
    // Logo
    addPdfLogo(doc, companyLogo, { align: 'right', y: 5, width: 35, height: 14 });

    // Cabeçalho
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Relatório: Lucro Real da Operação de Embarque', 14, 15);
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    const periodText = startDate && endDate 
      ? `Período: ${new Date(startDate + 'T00:00:00').toLocaleDateString('pt-BR')} a ${new Date(endDate + 'T00:00:00').toLocaleDateString('pt-BR')}`
      : (startDate 
          ? `A partir de: ${new Date(startDate + 'T00:00:00').toLocaleDateString('pt-BR')}` 
          : (endDate 
              ? `Até: ${new Date(endDate + 'T00:00:00').toLocaleDateString('pt-BR')}` 
              : 'Todos os períodos'));
    doc.text(`${periodText} | Gerado em: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}`, 14, 21);

    // Tabela - Apenas embarques com CT-e emitido
    const validRows = enrichedRows.filter(r => {
      const cteVal = r.cte || (r.shipment ? getShipmentCte(r.shipment) : '');
      return (Boolean(cteVal && cteVal !== '-' && cteVal !== '---' && cteVal.trim() !== '')) || (r.shipment ? hasCteAttached(r.shipment) : false);
    });

    const pdfTotals = {
      totalShipments: validRows.length,
      sumWeight: validRows.reduce((acc, r) => acc + (r.weight || 0), 0),
      sumCompanyFreight: validRows.reduce((acc, r) => acc + (r.companyFreight || 0), 0),
      sumDriverFreight: validRows.reduce((acc, r) => acc + (r.driverFreight || 0), 0),
      sumToll: validRows.reduce((acc, r) => acc + (r.toll || 0), 0),
      sumFreightDiff: validRows.reduce((acc, r) => acc + (r.freightDifference || 0), 0),
      sumIcms: validRows.reduce((acc, r) => acc + (r.icms || 0), 0),
      sumFederalTax: validRows.reduce((acc, r) => acc + (r.federalTax || 0), 0),
      sumExpenses: validRows.reduce((acc, r) => acc + (r.totalExpenses || 0), 0),
      sumGeneratedCredit: validRows.reduce((acc, r) => acc + (r.generatedCredit || 0), 0),
      sumNetProfit: validRows.reduce((acc, r) => acc + (r.netProfit || 0), 0),
      sumNetProfitWithCommissions: validRows.reduce((acc, r) => acc + (r.netProfitWithCommissions || 0), 0),
      countOcr: validRows.filter(r => r.hasOcr).length,
      consolidatedMargin: 0,
      consolidatedMarginWithCommissions: 0,
    };
    if (pdfTotals.sumCompanyFreight > 0) {
      pdfTotals.consolidatedMargin = (pdfTotals.sumNetProfit / pdfTotals.sumCompanyFreight) * 100;
      pdfTotals.consolidatedMarginWithCommissions = (pdfTotals.sumNetProfitWithCommissions / pdfTotals.sumCompanyFreight) * 100;
    }

    const tableData = validRows.flatMap(r => {
      const cteDisplay = r.cte || '---';

      if (!r.hasComplement) {
        const rowArr = [
          r.shipment.id,
          cteDisplay,
          r.shipment.scheduledDate || '---',
          r.clientName,
          `${r.shipment.driverName} (${r.shipment.horsePlate})`,
          r.weight > 0 ? `${r.weight.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} t` : '---',
          `R$ ${r.companyFreight.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          `R$ ${r.driverFreight.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          r.toll > 0 ? `R$ ${r.toll.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'R$ 0,00',
          `R$ ${r.freightDifference.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${r.freightDifferenceMarginPercent.toFixed(1)}%)`,
          r.icms > 0 ? `R$ ${r.icms.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'R$ 0,00',
          r.federalTax > 0 ? `R$ ${r.federalTax.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'R$ 0,00',
          `R$ ${r.totalExpenses.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          r.generatedCredit > 0 ? `R$ ${r.generatedCredit.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '---',
          `R$ ${r.netProfit.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${r.profitMarginPercent.toFixed(1)}%)`,
        ];
        if (canViewFinalNetProfit) {
          rowArr.push(`R$ ${r.netProfitWithCommissions.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${r.marginWithCommissionsPercent.toFixed(1)}%)`);
        }
        rowArr.push(r.hasOcr ? 'Sim (IA)' : 'Estimado');
        return [rowArr];
      }

      // Linha Principal do Embarque (Frete Base)
      const mainRowArr = [
        r.shipment.id,
        cteDisplay,
        r.shipment.scheduledDate || '---',
        r.clientName,
        `${r.shipment.driverName} (${r.shipment.horsePlate})`,
        r.weight > 0 ? `${r.weight.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} t` : '---',
        `R$ ${r.baseCompanyFreight.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        `R$ ${r.baseDriverFreight.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        r.toll > 0 ? `R$ ${r.toll.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'R$ 0,00',
        `R$ ${r.baseFreightDifference.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${r.baseFreightDifferenceMarginPercent.toFixed(1)}%)`,
        r.icms > 0 ? `R$ ${r.icms.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'R$ 0,00',
        r.federalTax > 0 ? `R$ ${r.federalTax.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'R$ 0,00',
        `R$ ${r.totalExpenses.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        r.generatedCredit > 0 ? `R$ ${r.generatedCredit.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '---',
        `R$ ${r.baseNetProfit.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${r.baseProfitMarginPercent.toFixed(1)}%)`,
      ];
      if (canViewFinalNetProfit) {
        mainRowArr.push(`R$ ${r.baseNetProfitWithCommissions.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${r.baseMarginWithCommissionsPercent.toFixed(1)}%)`);
      }
      mainRowArr.push(r.hasOcr ? 'Sim (IA)' : 'Estimado');

      // Sub-linha Subordinada (CT-e Complementar de Estadia)
      const compCteText = r.complementCtes && r.complementCtes.length > 0
        ? `Comp: ${r.complementCtes.join('/')}`
        : 'CT-e Comp.';
      const compMarginFreight = r.demurrageRevenue > 0 ? (r.demurrageDifference / r.demurrageRevenue) * 100 : 0;
      const compMarginNet = r.demurrageRevenue > 0 ? (r.demurrageProfit / r.demurrageRevenue) * 100 : 0;
      const compMarginWithComms = r.demurrageRevenue > 0 ? (r.demurrageNetProfitWithCommissions / r.demurrageRevenue) * 100 : 0;

      const compRowArr = [
        `↳ ${r.shipment.id}-COMP`,
        compCteText,
        '---',
        r.clientName,
        'Estadia / Complemento',
        '---',
        `R$ ${r.demurrageRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        `R$ ${r.demurrageDriverPaid.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        'R$ 0,00',
        `R$ ${r.demurrageDifference.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${compMarginFreight.toFixed(1)}%)`,
        'R$ 0,00',
        'R$ 0,00',
        'R$ 0,00',
        '---',
        `R$ ${r.demurrageProfit.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${compMarginNet.toFixed(1)}%)`,
      ];
      if (canViewFinalNetProfit) {
        compRowArr.push(`R$ ${r.demurrageNetProfitWithCommissions.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${compMarginWithComms.toFixed(1)}%)`);
      }
      compRowArr.push('Vinculado');

      return [mainRowArr, compRowArr];
    });

    const headRow = [
      'ID Embarque', 
      'CT-e', 
      'Data', 
      'Cliente', 
      'Motorista / Placa', 
      'Peso Efetivado',
      'Frete Empresa (+)', 
      'Frete Motorista (-)', 
      'Pedágio',
      'Dif. Frete', 
      'ICMS',
      'Imp. Federal',
      'Despesas (-)', 
      'Créd. Exp. (Info)',
      'Lucro Real (=)', 
    ];
    if (canViewFinalNetProfit) {
      headRow.push('Líq. Final (- Com.)');
    }
    headRow.push('OCR');

    const totalsHeadRow = [
      '∑ TOTAIS',
      '---',
      `${pdfTotals.totalShipments} emb.`,
      '---',
      '---',
      `${pdfTotals.sumWeight.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} t`,
      `R$ ${pdfTotals.sumCompanyFreight.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      `R$ ${pdfTotals.sumDriverFreight.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      `R$ ${pdfTotals.sumToll.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      `R$ ${pdfTotals.sumFreightDiff.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      `R$ ${pdfTotals.sumIcms.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      `R$ ${pdfTotals.sumFederalTax.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      `R$ ${pdfTotals.sumExpenses.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      `R$ ${pdfTotals.sumGeneratedCredit.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      `R$ ${pdfTotals.sumNetProfit.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${pdfTotals.consolidatedMargin.toFixed(1)}%)`,
    ];
    if (canViewFinalNetProfit) {
      totalsHeadRow.push(`R$ ${pdfTotals.sumNetProfitWithCommissions.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${pdfTotals.consolidatedMarginWithCommissions.toFixed(1)}%)`);
    }
    totalsHeadRow.push(`${pdfTotals.countOcr} lidos`);

    autoTable(doc, {
      head: [headRow, totalsHeadRow],
      body: tableData,
      startY: 25,
      margin: { left: 8, right: 8 },
      styles: { fontSize: 5.8, cellPadding: 1.2, halign: 'center', valign: 'middle' },
      headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      foot: [totalsHeadRow],
      footStyles: { fillColor: [226, 232, 240], textColor: [15, 23, 42], fontStyle: 'bold', fontSize: 5.8 },
      didParseCell: (data) => {
        if (data.section === 'head' && data.row.index === 1) {
          data.cell.styles.fillColor = [15, 23, 42];
          data.cell.styles.textColor = [253, 224, 71];
          data.cell.styles.fontStyle = 'bold';
        }
        if (data.section === 'body') {
          const rawFirstCell = Array.isArray(data.row.raw) ? String(data.row.raw[0] || '') : '';
          if (rawFirstCell.includes('↳')) {
            data.cell.styles.fillColor = [245, 243, 255];
            data.cell.styles.textColor = [109, 40, 217];
            data.cell.styles.fontStyle = 'italic';
          }
        }
      }
    });

    doc.save(`relatorio_lucro_real_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  // Exportação para CSV / Excel
  const handleExportCSV = () => {
    const headers = [
      'ID Embarque',
      'CT-e',
      'Data',
      'Status',
      'Cliente',
      'Origem',
      'Destino',
      'Motorista',
      'Placa',
      'Peso Efetivado (t)',
      'Frete Empresa (R$)',
      'Frete Motorista (R$)',
      'Pedagio (R$)',
      'Diferenca de Frete (R$)',
      'Margem Frete (%)',
      'ICMS (R$)',
      'Imposto Federal (R$)',
      'Despesas Operacionais (R$)',
      'Credito Gerado Exportacao (R$)',
      'Lucro Real Operacional (R$)',
      'Margem Real Operacional (%)',
      ...(canViewFinalNetProfit ? [
        'Comissao Embarcador (R$)',
        'Comissao Agencia (R$)',
        'Total Comissoes (R$)',
        'Lucro Liquido Real Apos Comissoes (R$)',
        'Margem Liquida Real Apos Comissoes (%)'
      ] : []),
      'Despesas Detalhadas',
      'Processado via OCR'
    ];

    const rows = enrichedRows.flatMap(r => {
      const expenseDesc = r.expenseItems.map(e => `${e.name}: R$ ${e.value}`).join(' | ');

      if (!r.hasComplement) {
        const rowData = [
          r.shipment.id,
          r.cte || '',
          r.shipment.scheduledDate || '',
          r.shipment.status,
          `"${r.clientName.replace(/"/g, '""')}"`,
          `"${(r.cargo?.origin || '').replace(/"/g, '""')}"`,
          `"${(r.cargo?.destination || '').replace(/"/g, '""')}"`,
          `"${r.shipment.driverName.replace(/"/g, '""')}"`,
          r.shipment.horsePlate,
          r.weight.toFixed(2),
          r.companyFreight.toFixed(2),
          r.driverFreight.toFixed(2),
          r.toll.toFixed(2),
          r.freightDifference.toFixed(2),
          r.freightDifferenceMarginPercent.toFixed(2),
          r.icms.toFixed(2),
          r.federalTax.toFixed(2),
          r.totalExpenses.toFixed(2),
          r.generatedCredit.toFixed(2),
          r.netProfit.toFixed(2),
          r.profitMarginPercent.toFixed(2),
          ...(canViewFinalNetProfit ? [
            r.shipperCommission.toFixed(2),
            r.agencyCommission.toFixed(2),
            r.totalCommissions.toFixed(2),
            r.netProfitWithCommissions.toFixed(2),
            r.marginWithCommissionsPercent.toFixed(2)
          ] : []),
          `"${expenseDesc.replace(/"/g, '""')}"`,
          r.hasOcr ? 'SIM' : 'NAO'
        ];
        return [rowData.join(';')];
      }

      // Desacoplado: Linha Frete Base
      const mainRowData = [
        r.shipment.id,
        r.cte || '',
        r.shipment.scheduledDate || '',
        r.shipment.status,
        `"${r.clientName.replace(/"/g, '""')}"`,
        `"${(r.cargo?.origin || '').replace(/"/g, '""')}"`,
        `"${(r.cargo?.destination || '').replace(/"/g, '""')}"`,
        `"${r.shipment.driverName.replace(/"/g, '""')}"`,
        r.shipment.horsePlate,
        r.weight.toFixed(2),
        r.baseCompanyFreight.toFixed(2),
        r.baseDriverFreight.toFixed(2),
        r.toll.toFixed(2),
        r.baseFreightDifference.toFixed(2),
        r.baseFreightDifferenceMarginPercent.toFixed(2),
        r.icms.toFixed(2),
        r.federalTax.toFixed(2),
        r.totalExpenses.toFixed(2),
        r.generatedCredit.toFixed(2),
        r.baseNetProfit.toFixed(2),
        r.baseProfitMarginPercent.toFixed(2),
        ...(canViewFinalNetProfit ? [
          r.shipperCommission.toFixed(2),
          r.baseAgencyCommission.toFixed(2),
          r.baseTotalCommissions.toFixed(2),
          r.baseNetProfitWithCommissions.toFixed(2),
          r.baseMarginWithCommissionsPercent.toFixed(2)
        ] : []),
        `"${expenseDesc.replace(/"/g, '""')}"`,
        r.hasOcr ? 'SIM' : 'NAO'
      ];

      // Desacoplado: Sub-linha Subordinada CT-e Complementar
      const compCtesStr = r.complementCtes && r.complementCtes.length > 0 ? r.complementCtes.join('/') : 'COMPLEMENTAR';
      const compMarginFreight = r.demurrageRevenue > 0 ? (r.demurrageDifference / r.demurrageRevenue) * 100 : 0;
      const compMarginNet = r.demurrageRevenue > 0 ? (r.demurrageProfit / r.demurrageRevenue) * 100 : 0;
      const compMarginWithComms = r.demurrageRevenue > 0 ? (r.demurrageNetProfitWithCommissions / r.demurrageRevenue) * 100 : 0;

      const compRowData = [
        `↳ ${r.shipment.id}-COMP`,
        compCtesStr,
        r.shipment.scheduledDate || '',
        'Estadia / Complemento',
        `"${r.clientName.replace(/"/g, '""')}"`,
        '""',
        '""',
        `"${r.shipment.driverName.replace(/"/g, '""')}"`,
        r.shipment.horsePlate,
        '0.00',
        r.demurrageRevenue.toFixed(2),
        r.demurrageDriverPaid.toFixed(2),
        '0.00',
        r.demurrageDifference.toFixed(2),
        compMarginFreight.toFixed(2),
        '0.00',
        '0.00',
        '0.00',
        '0.00',
        r.demurrageProfit.toFixed(2),
        compMarginNet.toFixed(2),
        ...(canViewFinalNetProfit ? [
          '0.00',
          r.demurrageAgencyComm.toFixed(2),
          r.demurrageAgencyComm.toFixed(2),
          r.demurrageNetProfitWithCommissions.toFixed(2),
          compMarginWithComms.toFixed(2)
        ] : []),
        '"CT-e Complementar de Estadia vinculado"',
        'NAO'
      ];

      return [mainRowData.join(';'), compRowData.join(';')];
    });

    const csvContent = '\uFEFF' + [headers.join(';'), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    const dateSuffix = startDate && endDate ? `_${startDate}_a_${endDate}` : `_${new Date().toISOString().split('T')[0]}`;
    link.setAttribute('download', `lucro_real_embarques${dateSuffix}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const hasActiveFilters = Boolean(
    searchTerm.trim() ||
    startDate ||
    endDate ||
    selectedStatus.length > 0 ||
    selectedClients.length > 0 ||
    selectedDrivers.length > 0 ||
    selectedOrigins.length > 0 ||
    selectedDestinations.length > 0 ||
    selectedBranches.length > 0 ||
    selectedExport.length > 0 ||
    selectedDriverRegimes.length > 0 ||
    onlyWithOcr
  );

  return (
    <div className="space-y-6 w-full">
      {/* BANNER DE REGRAS DE DESPESAS OPERACIONAIS E TRIBUTÁRIAS */}
      <div className="bg-gradient-to-r from-slate-900 to-indigo-950 text-white p-3.5 rounded-2xl border border-indigo-800/40 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs w-full">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-indigo-500/20 text-indigo-300 border border-indigo-400/20 shrink-0">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div>
            <p className="font-bold text-slate-100">
              Automatização Completa & Conformidade Tributária Integrada
            </p>
            <p className="text-indigo-200/80 text-[11px] mt-0.5">
              Cálculo exato de Diferença de Frete, Despesas Operacionais, Consultas de Risco, Comissões e Lucro Real apurado individualmente.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="px-2.5 py-1 rounded-lg bg-indigo-500/20 border border-indigo-400/30 text-indigo-200 text-[10px] font-mono font-semibold">
            Apuração Inteligente
          </span>
        </div>
      </div>

      {/* CARDS DE RESUMO CONSOLIDADO (KPIs) */}
      <div className={`grid grid-cols-2 sm:grid-cols-3 ${canViewFinalNetProfit ? 'lg:grid-cols-4 xl:grid-cols-7' : 'lg:grid-cols-3 xl:grid-cols-6'} gap-3 w-full`}>
        {/* Frete Bruto Empresa */}
        <div className="p-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Frete Empresa
            </span>
            <div className="p-1 rounded-md bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
              <DollarSign className="w-3.5 h-3.5" />
            </div>
          </div>
          <p className="text-base sm:text-lg font-mono font-black text-gray-900 dark:text-white truncate" title={`R$ ${totals.sumCompanyFreight.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}>
            R$ {totals.sumCompanyFreight.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </p>
          <p className="text-[10px] text-gray-400 mt-0.5 font-medium">Receita total a faturar</p>
        </div>

        {/* Frete Motorista / Carreteiro */}
        <div className="p-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Frete Motorista
            </span>
            <div className="p-1 rounded-md bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400">
              <Truck className="w-3.5 h-3.5" />
            </div>
          </div>
          <p className="text-base sm:text-lg font-mono font-black text-gray-900 dark:text-white truncate" title={`R$ ${totals.sumDriverFreight.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}>
            R$ {totals.sumDriverFreight.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </p>
          <p className="text-[10px] text-gray-400 mt-0.5 font-medium truncate" title={totals.sumToll > 0 ? `Líquido de Pedágio: R$ ${totals.sumDriverFreightNetToll.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : 'Custo do frete contratado'}>
            {totals.sumToll > 0 ? `Líq. Ped: R$ ${totals.sumDriverFreightNetToll.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : 'Custo do frete contratado'}
          </p>
        </div>

        {/* Diferença de Frete */}
        <div className="p-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Dif. Frete Bruta
            </span>
            <div className="p-1 rounded-md bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400">
              <TrendingUp className="w-3.5 h-3.5" />
            </div>
          </div>
          <p className="text-base sm:text-lg font-mono font-black text-purple-600 dark:text-purple-400 truncate" title={`R$ ${totals.sumFreightDiff.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}>
            R$ {totals.sumFreightDiff.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </p>
          <p className="text-[10px] text-purple-600/80 dark:text-purple-400/80 mt-0.5 font-semibold">
            {totals.consolidatedFreightMargin.toFixed(1)}% do frete bruto
          </p>
        </div>

        {/* Total de Despesas Operacionais */}
        <div className="p-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xs relative overflow-hidden flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-rose-600 dark:text-rose-400">
                Despesas Operac.
              </span>
              <div className="p-1 rounded-md bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400">
                <TrendingDown className="w-3.5 h-3.5" />
              </div>
            </div>
            <p className="text-base sm:text-lg font-mono font-black text-rose-600 dark:text-rose-400 truncate" title={`Total Geral de Despesas Operacionais: R$ ${totals.sumExpenses.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}>
              R$ {totals.sumExpenses.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </p>
          </div>

          <div className="mt-2 pt-1.5 border-t border-rose-100 dark:border-gray-700/60 flex flex-col gap-0.5 text-[10px]">
            <div className="flex items-center justify-between font-bold text-rose-700 dark:text-rose-300" title={`Soma do Imposto Federal dos embarques filtrados: R$ ${totals.sumFederalTax.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}>
              <span className="truncate">Imp. Federal:</span>
              <span className="font-mono shrink-0 font-extrabold">
                R$ {totals.sumFederalTax.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="flex items-center justify-between text-gray-500 dark:text-gray-400 text-[9px] font-medium" title={`Demais deduções (Taxas, Risco, Seguros, Custo Fixo): R$ ${totals.sumOtherExpenses.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}>
              <span className="truncate">Taxas + Risco:</span>
              <span className="font-mono shrink-0">
                R$ {totals.sumOtherExpenses.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        </div>

        {/* Lucro Real Consolidado */}
        <div className="p-3 bg-white dark:bg-gray-800 rounded-xl border-2 border-emerald-500/50 dark:border-emerald-500/40 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              Lucro Real
            </span>
            <div className="p-1 rounded-md bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400">
              <DollarSign className="w-3.5 h-3.5" />
            </div>
          </div>
          <p className={`text-base sm:text-lg font-mono font-black truncate ${totals.sumNetProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`} title={`R$ ${totals.sumNetProfit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}>
            R$ {totals.sumNetProfit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </p>
          <p className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-0.5 font-bold">
            Margem Real: {totals.consolidatedMargin.toFixed(1)}%
          </p>
        </div>

        {/* NOVO CARD: Lucro Líquido Real Pós Comissões (Visível para Comercial, Admin, Diretor e Financeiro) */}
        {canViewFinalNetProfit && (
          <div className="p-3 bg-gradient-to-br from-teal-500/10 via-emerald-500/5 to-cyan-500/10 dark:from-teal-950/40 dark:to-emerald-950/30 rounded-xl border-2 border-teal-500/60 dark:border-teal-400/50 shadow-xs relative overflow-hidden">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-teal-700 dark:text-teal-300">
                Líquido Real Final
              </span>
              <div className="p-1 rounded-md bg-teal-500 text-white shadow-2xs">
                <DollarSign className="w-3.5 h-3.5" />
              </div>
            </div>
            <p className={`text-base sm:text-lg font-mono font-black truncate ${totals.sumNetProfitWithCommissions >= 0 ? 'text-teal-700 dark:text-teal-300' : 'text-rose-600 dark:text-rose-400'}`} title={`R$ ${totals.sumNetProfitWithCommissions.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}>
              R$ {totals.sumNetProfitWithCommissions.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </p>
            <p className="text-[10px] text-teal-700/90 dark:text-teal-300/90 mt-0.5 font-bold truncate" title={`Margem: ${totals.consolidatedMarginWithCommissions.toFixed(1)}% | Comissões abatidas: R$ ${totals.sumCommissions.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}>
              Margem: {totals.consolidatedMarginWithCommissions.toFixed(1)}% {totals.sumCommissions > 0 ? `(- R$ ${totals.sumCommissions.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} com.)` : ''}
            </p>
          </div>
        )}

        {/* Total de Embarques & OCR */}
        <div className="p-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
              Embarques Filtrados
            </span>
            <div className="p-1 rounded-md bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400">
              <Sparkles className="w-3.5 h-3.5" />
            </div>
          </div>
          <p className="text-base sm:text-lg font-mono font-black text-gray-900 dark:text-white">
            {totals.totalShipments} <span className="text-[11px] font-normal text-gray-500">emb.</span>
          </p>
          <p className="text-[10px] text-indigo-600 dark:text-indigo-400 mt-0.5 font-semibold">
            {totals.countOcr} com comprovante OCR
          </p>
        </div>
      </div>

      {/* CABEÇALHO DO RELATÓRIO */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white dark:bg-gray-800 p-3.5 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xs w-full">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white leading-tight">
            Relatório de Lucro Real
          </h2>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
            Acompanhe o desempenho financeiro real das operações de transporte.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowFilters(!showFilters)}
            className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all border cursor-pointer ${
              showFilters || hasActiveFilters
                ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border-indigo-300 dark:border-indigo-700'
                : 'bg-gray-50 dark:bg-gray-700/60 text-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-600'
            }`}
          >
            <Filter className="w-3.5 h-3.5" />
            Filtros Avançados
            {hasActiveFilters && (
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 dark:bg-indigo-400" />
            )}
          </button>



          <button
            type="button"
            onClick={handleExportCSV}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-bold bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            Exportar CSV
          </button>

          <button
            type="button"
            onClick={handleExportPDF}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-bold bg-gray-900 hover:bg-gray-800 text-white dark:bg-indigo-600 dark:hover:bg-indigo-500 transition-colors shadow-xs cursor-pointer"
          >
            <FileText className="w-3.5 h-3.5" />
            Exportar PDF
          </button>
        </div>
      </div>

      {/* PAINEL DE FILTROS */}
      {showFilters && (
        <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm space-y-4 animate-in fade-in duration-200 w-full">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
            {/* Busca textual */}
            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                Busca Rápida
              </label>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" />
                <input
                  type="text"
                  placeholder="ID, CT-e, Motorista, Placa, Solicitante..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs border rounded-xl dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                />
              </div>
            </div>

            {/* Data Início */}
            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                Data Início
              </label>
              <div className="relative">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-2.5 py-2 text-xs border rounded-xl dark:bg-gray-700 dark:border-gray-600 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/20 font-medium"
                />
              </div>
            </div>

            {/* Data Fim */}
            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                Data Fim
              </label>
              <div className="relative">
                <input
                  type="date"
                  value={endDate}
                  min={startDate || undefined}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-2.5 py-2 text-xs border rounded-xl dark:bg-gray-700 dark:border-gray-600 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/20 font-medium"
                />
              </div>
            </div>

            {/* Filtro Destinação Carga (Exportação / Interno) */}
            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                Destinação da Carga
              </label>
              <MultiSelectDropdown
                options={exportOptions}
                selectedValues={selectedExport}
                onChange={setSelectedExport}
                placeholder="Todas..."
              />
            </div>

            {/* Filtro Regime Tributário Motorista (PF / PJ) */}
            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                Regime Motorista (PF/PJ)
              </label>
              <MultiSelectDropdown
                options={driverRegimeOptions}
                selectedValues={selectedDriverRegimes}
                onChange={setSelectedDriverRegimes}
                placeholder="Todos os regimes"
              />
            </div>

            {/* Filtro Status */}
            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                Status do Embarque
              </label>
              <MultiSelectDropdown
                options={statusOptions}
                selectedValues={selectedStatus}
                onChange={setSelectedStatus}
                placeholder="Todos os status"
              />
            </div>

            {/* Filtro Origem */}
            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                Origem
              </label>
              <MultiSelectDropdown
                options={originOptions}
                selectedValues={selectedOrigins}
                onChange={setSelectedOrigins}
                placeholder="Todas as origens"
              />
            </div>

            {/* Filtro Destino */}
            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                Destino
              </label>
              <MultiSelectDropdown
                options={destinationOptions}
                selectedValues={selectedDestinations}
                onChange={setSelectedDestinations}
                placeholder="Todos os destinos"
              />
            </div>

            {/* Filtro Cliente */}
            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                Cliente
              </label>
              <MultiSelectDropdown
                options={clientOptions}
                selectedValues={selectedClients}
                onChange={setSelectedClients}
                placeholder="Todos os clientes"
              />
            </div>

            {/* Filtro Motorista */}
            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                Motorista
              </label>
              <MultiSelectDropdown
                options={driverOptions}
                selectedValues={selectedDrivers}
                onChange={setSelectedDrivers}
                placeholder="Todos os motoristas"
              />
            </div>

            {/* Filtro Solicitante */}
            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                Solicitante
              </label>
              <MultiSelectDropdown
                options={requesterOptions}
                selectedValues={selectedRequesters}
                onChange={setSelectedRequesters}
                placeholder="Todos os solicitantes"
              />
            </div>

            {/* Filtro Filial / Matriz */}
            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                Filial / Matriz
              </label>
              <MultiSelectDropdown
                options={branchOptions}
                selectedValues={selectedBranches}
                onChange={setSelectedBranches}
                placeholder="Todas as filiais"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t dark:border-gray-700">
            <label className="inline-flex items-center gap-2 cursor-pointer text-xs font-semibold text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={onlyWithOcr}
                onChange={(e) => setOnlyWithOcr(e.target.checked)}
                className="w-4 h-4 text-indigo-600 rounded dark:bg-gray-700 dark:border-gray-600"
              />
              Exibir apenas embarques com comprovante OCR processado
            </label>

            <button
              type="button"
              onClick={() => {
                setSearchTerm('');
                setStartDate('');
                setEndDate('');
                setSelectedExport([]);
                setSelectedDriverRegimes([]);
                setSelectedStatus([]);
                setSelectedOrigins([]);
                setSelectedDestinations([]);
                setSelectedClients([]);
                setSelectedDrivers([]);
                setSelectedRequesters([]);
                setSelectedBranches([]);
                setOnlyWithOcr(false);
              }}
              className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-bold"
            >
              Limpar Filtros
            </button>
          </div>
        </div>
      )}

      {/* TABELA DETALHADA DE LUCRO REAL */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden w-full">
        <div className="overflow-x-auto w-full">
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-50 dark:bg-gray-900/60 text-gray-600 dark:text-gray-400 font-bold border-b dark:border-gray-700 uppercase tracking-wider text-[10px]">
              <tr>
                <th className="py-2.5 px-2">ID / Data</th>
                <th className="py-2.5 px-2">Cliente / Trajeto</th>
                <th className="py-2.5 px-2">Motorista / Placa</th>
                <th className="py-2.5 px-2 text-right">Frete Empresa (+)</th>
                <th className="py-2.5 px-2 text-right">Frete Motorista (-)</th>
                <th className="py-2.5 px-2 text-right">Dif. Frete</th>
                <th className="py-2.5 px-2 text-center">Despesas Operac.</th>
                {!isAgenciador && <th className="py-2.5 px-2 text-right">Créd. Exp.</th>}
                <th className="py-2.5 px-2 text-right">Resultado (=)</th>
                {canViewFinalNetProfit && (
                  <th className="py-2.5 px-2 text-right text-teal-700 dark:text-teal-300 font-black">
                    Líquido Real (- Com.)
                  </th>
                )}
                <th className="py-2.5 px-2 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {enrichedRows.length > 0 ? (
                enrichedRows.map((row) => (
                  <React.Fragment key={row.shipment.id}>
                    {/* Linha Principal do Embarque (Frete Base) */}
                    <tr className="hover:bg-gray-50/70 dark:hover:bg-gray-700/30 transition-colors">
                      {/* ID / Data */}
                      <td className="py-2.5 px-2 whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          <span className="font-mono font-bold text-gray-900 dark:text-white">
                            {row.shipment.id}
                          </span>
                          {row.hasOcr && (
                            <span title="Processado via IA Multimodal" className="inline-flex items-center px-1 py-0.2 rounded bg-indigo-50 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-300 text-[8px] font-extrabold">
                              IA
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-gray-500 dark:text-gray-400">
                          {row.shipment.scheduledDate ? new Date(row.shipment.scheduledDate + 'T00:00:00').toLocaleDateString('pt-BR') : '---'}
                        </p>
                        {row.requesterName && row.requesterName !== 'N/A' && (
                          <p className="text-[9px] text-gray-500 dark:text-gray-400 truncate max-w-[120px]" title={`Solicitante: ${row.requesterName}`}>
                            <span className="font-semibold text-gray-600 dark:text-gray-300">Sol:</span> {row.requesterName}
                          </p>
                        )}
                        <div className="flex items-center gap-1 mt-0.5">
                          <span className="inline-block text-[9px] font-bold px-1.5 py-0.2 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                            {row.shipment.status}
                          </span>
                          {row.hasComplement && (
                            <span className="inline-block text-[8px] font-bold px-1 py-0.2 rounded bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800" title="Possui CT-e complementar discriminado na linha abaixo">
                              Comp. ↳
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Cliente / Trajeto */}
                      <td className="py-2.5 px-2 max-w-[140px] xl:max-w-[180px]">
                        <p className="font-semibold text-gray-900 dark:text-white truncate" title={row.clientName}>
                          {row.clientName}
                        </p>
                        <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate" title={`${row.cargo?.origin || ''} → ${row.cargo?.destination || ''}`}>
                          {row.cargo?.origin || '---'} → {row.cargo?.destination || '---'}
                        </p>
                        {row.cte ? (
                          <span className="inline-block mt-0.5 text-[9px] font-mono text-indigo-700 dark:text-indigo-300 font-bold bg-indigo-50 dark:bg-indigo-950/60 px-1 py-0.2 rounded border border-indigo-200 dark:border-indigo-800">
                            CT-e nº {row.cte}
                          </span>
                        ) : null}
                      </td>

                      {/* Motorista / Placa */}
                      <td className="py-2.5 px-2 max-w-[130px] xl:max-w-[160px]">
                        <p className="font-semibold text-gray-900 dark:text-white truncate" title={row.shipment.driverName}>
                          {row.shipment.driverName}
                        </p>
                        <p className="text-[10px] font-mono text-gray-500 dark:text-gray-400 truncate">
                          Placa: {row.shipment.horsePlate}
                        </p>
                      </td>

                      {/* Frete Empresa */}
                      <td className="py-2.5 px-2 text-right font-mono whitespace-nowrap">
                        {row.hasComplement ? (
                          <div>
                            <span className="font-bold text-gray-900 dark:text-white text-xs">
                              R$ {row.baseCompanyFreight.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                            <p className="text-[8.5px] text-purple-600 dark:text-purple-400 font-bold tracking-tight" title={`Consolidado do embarque: Frete Base (R$ ${row.baseCompanyFreight.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}) + CT-e Comp (R$ ${row.demurrageRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })})`}>
                              Total: R$ {row.companyFreight.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </p>
                          </div>
                        ) : (
                          <div>
                            <span className="font-bold text-gray-900 dark:text-white text-xs">
                              R$ {row.companyFreight.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                            {row.shipment.realProfitData?.complementCharged ? (
                              <p className="text-[9px] text-blue-600 dark:text-blue-400">
                                + R$ {row.shipment.realProfitData.complementCharged.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </p>
                            ) : null}
                          </div>
                        )}
                      </td>

                      {/* Frete Motorista */}
                      <td className="py-2.5 px-2 text-right font-mono whitespace-nowrap">
                        {row.hasComplement ? (
                          <div>
                            <span className="font-bold text-gray-800 dark:text-gray-200 text-xs">
                              R$ {row.baseDriverFreight.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                            <p className="text-[8.5px] text-purple-600 dark:text-purple-400 font-bold tracking-tight" title={`Consolidado motorista: Frete Base (R$ ${row.baseDriverFreight.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}) + CT-e Comp (R$ ${row.demurrageDriverPaid.toLocaleString('pt-BR', { minimumFractionDigits: 2 })})`}>
                              Total: R$ {row.driverFreight.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </p>
                          </div>
                        ) : (
                          <div>
                            <span className="font-bold text-gray-800 dark:text-gray-200 text-xs">
                              R$ {row.driverFreight.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                            {row.toll > 0 && (
                              <p className="text-[9px] text-gray-400 dark:text-gray-500" title={`Líquido de Pedágio (R$ ${row.driverFreight.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} - R$ ${row.toll.toLocaleString('pt-BR', { minimumFractionDigits: 2 })})`}>
                                Líq. Ped: R$ {row.driverFreightNetToll.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </p>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Diferença de Frete */}
                      <td className="py-2.5 px-2 text-right font-mono whitespace-nowrap">
                        <p className="font-bold text-indigo-600 dark:text-indigo-400 text-xs">
                          R$ {(row.hasComplement ? row.baseFreightDifference : row.freightDifference).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                        <span className="text-[9px] font-semibold text-gray-500 dark:text-gray-400">
                          {(row.hasComplement ? row.baseFreightDifferenceMarginPercent : row.freightDifferenceMarginPercent).toFixed(1)}%
                        </span>
                      </td>

                      {/* Despesas Operacionais */}
                      <td className="py-2.5 px-2 text-center whitespace-nowrap">
                        {row.totalExpenses > 0 || row.expenseItems.length > 0 ? (
                          <div className="flex flex-col items-center">
                            <span className="font-mono font-bold text-red-600 dark:text-red-400 text-xs">
                              - R$ {row.totalExpenses.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                            <button
                              type="button"
                              onClick={() => setSelectedShipmentForDetail(row.shipment)}
                              className="mt-0.5 text-[9px] text-indigo-600 dark:text-indigo-400 hover:underline font-semibold inline-flex items-center gap-0.5"
                            >
                              <Receipt className="w-2.5 h-2.5" />
                              Ver {row.expenseItems.length} despesa(s)
                            </button>
                          </div>
                        ) : (
                          <span className="text-gray-400 text-[10px]">R$ 0,00</span>
                        )}
                      </td>

                      {/* Crédito Fiscal Gerado (Exportação) - Informativo - Oculto para Agenciador */}
                      {!isAgenciador && (
                        <td className="py-2.5 px-2 text-right font-mono whitespace-nowrap">
                          {row.generatedCredit > 0 ? (
                            <div>
                              <span className="font-bold text-emerald-600 dark:text-emerald-400 text-xs">
                                R$ {row.generatedCredit.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                              <p className="text-[8px] text-gray-500 dark:text-gray-400 font-medium">
                                Informativo
                              </p>
                            </div>
                          ) : (
                            <span className="text-gray-400 dark:text-gray-500 text-[10px]">---</span>
                          )}
                        </td>
                      )}

                      {/* Resultado Final (Lucro Real da Operação) */}
                      <td className="py-2.5 px-2 text-right font-mono whitespace-nowrap">
                        {row.hasComplement ? (
                          <div className="flex flex-col items-end">
                            <span className={`text-xs font-black ${
                              row.baseNetProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                            }`}>
                              R$ {row.baseNetProfit.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                            <span className={`text-[9px] font-extrabold px-1 py-0.2 rounded mt-0.5 ${
                              row.baseNetProfit >= 0 
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300' 
                                : 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300'
                            }`}>
                              {row.baseProfitMarginPercent.toFixed(1)}%
                            </span>
                            <p className="text-[8.5px] text-purple-600 dark:text-purple-400 font-bold tracking-tight mt-0.5" title={`Consolidado do embarque: R$ ${row.netProfit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (${row.profitMarginPercent.toFixed(1)}%)`}>
                              Total: R$ {row.netProfit.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </p>
                          </div>
                        ) : (
                          <div className="flex flex-col items-end">
                            <span className={`text-xs font-black ${
                              row.netProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                            }`}>
                              R$ {row.netProfit.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                            <span className={`text-[9px] font-extrabold px-1 py-0.2 rounded mt-0.5 ${
                              row.netProfit >= 0 
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300' 
                                : 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300'
                            }`}>
                              {row.profitMarginPercent.toFixed(1)}%
                            </span>
                          </div>
                        )}
                      </td>

                      {/* NOVO: Líquido Real Final Pós Comissões (Visível para Comercial, Admin, Diretor e Financeiro) */}
                      {canViewFinalNetProfit && (
                        <td className="py-2.5 px-2 text-right font-mono whitespace-nowrap bg-teal-50/30 dark:bg-teal-950/20">
                          <div className="flex flex-col items-end">
                            <span className={`text-xs font-black ${
                              (row.hasComplement ? row.baseNetProfitWithCommissions : row.netProfitWithCommissions) >= 0 
                                ? 'text-teal-700 dark:text-teal-300' 
                                : 'text-rose-600 dark:text-rose-400'
                            }`}>
                              R$ {(row.hasComplement ? row.baseNetProfitWithCommissions : row.netProfitWithCommissions).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                            <span className={`text-[9px] font-extrabold px-1 py-0.2 rounded mt-0.5 ${
                              (row.hasComplement ? row.baseNetProfitWithCommissions : row.netProfitWithCommissions) >= 0 
                                ? 'bg-teal-100 text-teal-800 dark:bg-teal-900/50 dark:text-teal-300' 
                                : 'bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-300'
                            }`}>
                              {(row.hasComplement ? row.baseMarginWithCommissionsPercent : row.marginWithCommissionsPercent).toFixed(1)}%
                            </span>
                            {row.hasComplement ? (
                              <p className="text-[8.5px] text-purple-600 dark:text-purple-400 font-bold tracking-tight mt-0.5" title={`Consolidado final com comissões: R$ ${row.netProfitWithCommissions.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (${row.marginWithCommissionsPercent.toFixed(1)}%)`}>
                                Total: R$ {row.netProfitWithCommissions.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </p>
                            ) : (
                              row.totalCommissions > 0 ? (
                                <span 
                                  className="text-[8px] text-purple-600 dark:text-purple-400 font-semibold mt-0.5 truncate max-w-[120px]"
                                  title={`Comissões abatidas: R$ ${row.totalCommissions.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (Agência: R$ ${row.agencyCommission.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} | Embarcador: R$ ${row.shipperCommission.toLocaleString('pt-BR', { minimumFractionDigits: 2 })})`}
                                >
                                  - R$ {row.totalCommissions.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} com.
                                </span>
                              ) : (
                                <span className="text-[8px] text-gray-400 dark:text-gray-500 mt-0.5">
                                  Sem comissão
                                </span>
                              )
                            )}
                          </div>
                        </td>
                      )}

                      {/* Acesso ao Anexo e Ação de Correção */}
                      <td className="py-2.5 px-2 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1">
                          {row.attachmentUrl ? (
                            <button
                              type="button"
                              onClick={() => openDocumentInNewTab(row.attachmentUrl!, `Resumo Custos - ${row.shipment.id}`)}
                              className="inline-flex items-center gap-0.5 px-1.5 py-1 rounded bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 text-[10px] font-semibold transition-colors cursor-pointer border border-indigo-200 dark:border-indigo-800"
                              title="Visualizar Comprovante / Imagem Original"
                            >
                              <Eye className="w-3 h-3" />
                              <span>Ver</span>
                            </button>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => setEditingShipmentForAttachment(row.shipment)}
                            className="inline-flex items-center gap-0.5 px-1.5 py-1 rounded bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 text-[10px] font-semibold transition-colors cursor-pointer border border-emerald-200 dark:border-emerald-800"
                            title="Anexar ou corrigir imagem do resumo de custos e recalcular o Lucro Real"
                          >
                            <Upload className="w-3 h-3" />
                            <span>{row.hasOcr ? 'Editar' : 'Anexar'}</span>
                          </button>
                        </div>
                      </td>
                    </tr>

                    {/* Sub-linha Subordinada para CT-e Complementar de Estadia */}
                    {row.hasComplement && (
                      <tr 
                        key={`${row.shipment.id}-complement`}
                        className="bg-purple-50/50 dark:bg-purple-950/25 border-l-4 border-l-purple-500 hover:bg-purple-50/80 dark:hover:bg-purple-950/40 transition-colors"
                      >
                        {/* ID / Subordinado */}
                        <td className="py-2 px-2 whitespace-nowrap pl-3">
                          <div className="flex items-center gap-1.5">
                            <span className="text-purple-600 dark:text-purple-400 font-bold text-sm select-none leading-none">↳</span>
                            <span className="font-mono font-bold text-purple-900 dark:text-purple-200 text-xs">
                              {row.shipment.id}-COMP
                            </span>
                            <span className="inline-flex items-center px-1.5 py-0.2 rounded bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300 text-[8px] font-extrabold uppercase tracking-wide">
                              CT-e Comp.
                            </span>
                          </div>
                          <p className="text-[9px] text-purple-600/90 dark:text-purple-400/90 font-medium mt-0.5">
                            Estadia / Demurrage
                          </p>
                        </td>

                        {/* CT-e Complementar / Info */}
                        <td className="py-2 px-2 max-w-[140px] xl:max-w-[180px]">
                          <div className="flex flex-col gap-0.5">
                            {row.complementCtes && row.complementCtes.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {row.complementCtes.map((compCte, idx) => (
                                  <span 
                                    key={idx}
                                    className="inline-flex items-center gap-1 text-[9px] font-mono text-purple-800 dark:text-purple-200 font-black bg-white dark:bg-gray-800 px-1.5 py-0.5 rounded border border-purple-300 dark:border-purple-700 shadow-2xs"
                                  >
                                    CT-e nº {compCte}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-[9px] font-mono text-purple-700 dark:text-purple-300 font-semibold">
                                CT-e Complementar (Estadia)
                              </span>
                            )}
                            <span className="text-[9px] text-gray-500 dark:text-gray-400 italic">
                              Ref. Embarque {row.shipment.id}
                            </span>
                          </div>
                        </td>

                        {/* Motorista / Ref */}
                        <td className="py-2 px-2 max-w-[130px] xl:max-w-[160px]">
                          <p className="text-[10px] font-semibold text-gray-700 dark:text-gray-300 truncate">
                            {row.shipment.driverName}
                          </p>
                          <p className="text-[9px] text-gray-500 dark:text-gray-400">
                            Repasse de diária
                          </p>
                        </td>

                        {/* Frete Empresa (Receita da Estadia) */}
                        <td className="py-2 px-2 text-right font-mono whitespace-nowrap">
                          <span className="font-bold text-purple-700 dark:text-purple-300 text-xs">
                            + R$ {row.demurrageRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                          <p className="text-[8px] text-purple-500 dark:text-purple-400 font-semibold">
                            Cobrado Cliente
                          </p>
                        </td>

                        {/* Frete Motorista (Repasse ao motorista) */}
                        <td className="py-2 px-2 text-right font-mono whitespace-nowrap">
                          <span className="font-bold text-gray-700 dark:text-gray-300 text-xs">
                            - R$ {row.demurrageDriverPaid.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                          <p className="text-[8px] text-gray-400 dark:text-gray-500 font-semibold">
                            Pago Motorista
                          </p>
                        </td>

                        {/* Dif. Frete da Estadia */}
                        <td className="py-2 px-2 text-right font-mono whitespace-nowrap">
                          <p className="font-bold text-indigo-700 dark:text-indigo-300 text-xs">
                            R$ {row.demurrageDifference.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </p>
                          <span className="text-[9px] font-semibold text-gray-500 dark:text-gray-400">
                            {row.demurrageRevenue > 0 ? ((row.demurrageDifference / row.demurrageRevenue) * 100).toFixed(1) : '0.0'}%
                          </span>
                        </td>

                        {/* Despesas Operac. (R$ 0,00 no complementar) */}
                        <td className="py-2 px-2 text-center whitespace-nowrap">
                          <span className="text-gray-400 text-[10px]">—</span>
                        </td>

                        {/* Créd. Exp. (Informativo - Oculto para Agenciador) */}
                        {!isAgenciador && (
                          <td className="py-2 px-2 text-right font-mono whitespace-nowrap">
                            <span className="text-gray-400 dark:text-gray-500 text-[10px]">—</span>
                          </td>
                        )}

                        {/* Resultado (=) */}
                        <td className="py-2 px-2 text-right font-mono whitespace-nowrap">
                          <div className="flex flex-col items-end">
                            <span className={`text-xs font-black ${
                              row.demurrageProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                            }`}>
                              R$ {row.demurrageProfit.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                            <span className={`text-[8px] font-extrabold px-1 py-0.2 rounded mt-0.5 ${
                              row.demurrageProfit >= 0 
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300' 
                                : 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300'
                            }`}>
                              {row.demurrageRevenue > 0 ? ((row.demurrageProfit / row.demurrageRevenue) * 100).toFixed(1) : '0.0'}%
                            </span>
                          </div>
                        </td>

                        {/* Líquido Real Final Pós Comissões */}
                        {canViewFinalNetProfit && (
                          <td className="py-2 px-2 text-right font-mono whitespace-nowrap bg-purple-100/40 dark:bg-purple-950/40">
                            <div className="flex flex-col items-end">
                              <span className={`text-xs font-black ${
                                row.demurrageNetProfitWithCommissions >= 0 ? 'text-teal-700 dark:text-teal-300' : 'text-rose-600 dark:text-rose-400'
                              }`}>
                                R$ {row.demurrageNetProfitWithCommissions.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                              {row.demurrageAgencyComm > 0 ? (
                                <span className="text-[8px] text-purple-600 dark:text-purple-400 font-semibold mt-0.5">
                                  - R$ {row.demurrageAgencyComm.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} com.
                                </span>
                              ) : (
                                <span className="text-[8px] text-gray-400 dark:text-gray-500 mt-0.5">
                                  Sem comissão
                                </span>
                              )}
                            </div>
                          </td>
                        )}

                        {/* Ações */}
                        <td className="py-2 px-2 text-center whitespace-nowrap">
                          <span className="text-[9px] text-purple-600/70 dark:text-purple-400/70 font-semibold italic">
                            Subordinado
                          </span>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))
              ) : (
                <tr>
                  <td colSpan={isAgenciador ? (canViewFinalNetProfit ? 10 : 9) : (canViewFinalNetProfit ? 11 : 10)} className="py-10 text-center text-gray-500 dark:text-gray-400">
                    <Receipt className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    Nenhum embarque encontrado com os filtros selecionados.
                  </td>
                </tr>
              )}
            </tbody>

            {/* RODAPÉ COM TOTALIZADORES */}
            {enrichedRows.length > 0 && (
              <tfoot className="bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-white font-bold border-t-2 border-gray-300 dark:border-gray-600">
                <tr>
                  <td className="py-2.5 px-2 font-mono font-black uppercase text-[11px]" colSpan={3}>
                    TOTAL CONSOLIDADO ({totals.totalShipments} EMB.)
                  </td>
                  <td className="py-2.5 px-2 text-right font-mono text-xs text-blue-700 dark:text-blue-300">
                    R$ {totals.sumCompanyFreight.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="py-2.5 px-2 text-right font-mono text-xs text-amber-700 dark:text-amber-300">
                    R$ {totals.sumDriverFreight.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="py-2.5 px-2 text-right font-mono text-xs text-indigo-700 dark:text-indigo-300">
                    R$ {totals.sumFreightDiff.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    <p className="text-[9px] font-normal">{totals.consolidatedFreightDiffMargin.toFixed(1)}%</p>
                  </td>
                  <td className="py-2.5 px-2 text-center font-mono text-xs text-red-600 dark:text-red-400">
                    - R$ {totals.sumExpenses.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    <p className="text-[9px] font-bold text-rose-700 dark:text-rose-300 truncate" title={`Soma do Imposto Federal: R$ ${totals.sumFederalTax.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}>
                      Fed: R$ {totals.sumFederalTax.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </p>
                  </td>
                  {!isAgenciador && (
                    <td className="py-2.5 px-2 text-right font-mono text-xs text-emerald-600 dark:text-emerald-400">
                      R$ {totals.sumGeneratedCredit.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      <p className="text-[8px] font-normal text-gray-500 dark:text-gray-400">Informativo</p>
                    </td>
                  )}
                  <td className="py-2.5 px-2 text-right font-mono text-xs">
                    <span className={`text-xs font-black ${
                      totals.sumNetProfit >= 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300'
                    }`}>
                      R$ {totals.sumNetProfit.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    <p className={`text-[9px] font-extrabold ${
                      totals.sumNetProfit >= 0 ? 'text-emerald-800 dark:text-emerald-400' : 'text-red-800 dark:text-red-400'
                    }`}>
                      Margem: {totals.consolidatedMargin.toFixed(2)}%
                    </p>
                  </td>
                  {canViewFinalNetProfit && (
                    <td className="py-2.5 px-2 text-right font-mono text-xs bg-teal-100/40 dark:bg-teal-900/30">
                      <span className={`text-xs font-black ${
                        totals.sumNetProfitWithCommissions >= 0 ? 'text-teal-700 dark:text-teal-300' : 'text-red-700 dark:text-red-300'
                      }`}>
                        R$ {totals.sumNetProfitWithCommissions.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                      <p className={`text-[9px] font-extrabold ${
                        totals.sumNetProfitWithCommissions >= 0 ? 'text-teal-800 dark:text-teal-400' : 'text-red-800 dark:text-red-400'
                      }`}>
                        Margem: {totals.consolidatedMarginWithCommissions.toFixed(2)}%
                      </p>
                      {totals.sumCommissions > 0 && (
                        <p className="text-[8px] text-purple-700 dark:text-purple-300 font-semibold" title={`Comissões totais abatidas: R$ ${totals.sumCommissions.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (Agência: R$ ${totals.sumAgencyCommission.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} | Embarcador: R$ ${totals.sumShipperCommission.toLocaleString('pt-BR', { minimumFractionDigits: 2 })})`}>
                          - R$ {totals.sumCommissions.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} com.
                        </p>
                      )}
                    </td>
                  )}
                  <td className="py-2.5 px-2 text-center text-[10px] text-gray-500">
                    {totals.countOcr} IA
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* MODAL DE DETALHAMENTO DE DESPESAS DA OPERAÇÃO - AUTOMATIZAÇÃO DO CT-E */}
      {selectedShipmentForDetail && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 w-full max-w-4xl rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[94vh]">
            <div className="p-4 border-b dark:border-gray-700 flex items-center justify-between bg-gray-50 dark:bg-gray-900/60 shrink-0">
              <div className="flex items-center gap-2">
                <Receipt className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                <h3 className="text-sm font-bold text-gray-900 dark:text-white">
                  Automatização do CT-e & Lucro Real - Embarque {selectedShipmentForDetail.id}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedShipmentForDetail(null)}
                className="p-1 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {(() => {
              const currentShipment = shipments.find(s => s.id === selectedShipmentForDetail.id) || selectedShipmentForDetail;
              const detailRow = enrichedRows.find(r => r.shipment.id === currentShipment.id);
              const cargo = detailRow?.cargo || cargoMap.get(currentShipment.cargoId);
              const tonnage = currentShipment.shipmentTonnage || cargo?.totalVolume || 0;

              return (
                <div className="p-4 sm:p-5 overflow-y-auto">
                  <CteCostAutomationPanel
                    shipment={currentShipment}
                    cargo={cargo}
                    loadedTonnage={tonnage}
                    stays={stays}
                    users={users}
                    clients={clients}
                    currentUser={currentUser}
                    onUpdateShipmentData={async (shipmentId, data) => {
                      if (onUpdateShipmentData) {
                        await onUpdateShipmentData(shipmentId, data);
                      } else if (onBatchUpdateShipments) {
                        const target = shipments.find(s => s.id === shipmentId) || currentShipment;
                        const updated = { ...target, ...data } as Shipment;
                        await onBatchUpdateShipments([updated]);
                      }
                    }}
                  />
                </div>
              );
            })()}

            <div className="p-4 bg-gray-50 dark:bg-gray-900/60 border-t dark:border-gray-700 flex justify-end shrink-0">
              <button
                type="button"
                onClick={() => setSelectedShipmentForDetail(null)}
                className="px-4 py-2 bg-gray-900 hover:bg-gray-800 dark:bg-gray-700 dark:hover:bg-gray-600 text-white rounded-xl text-xs font-bold transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE ATUALIZAÇÃO / ANEXO DE RESUMO DE CUSTOS */}
      {editingShipmentForAttachment && currentUser && (
        <AttachmentModal
          isOpen={Boolean(editingShipmentForAttachment)}
          onClose={() => setEditingShipmentForAttachment(null)}
          onSave={async (data) => {
            if (onUpdateAttachment && editingShipmentForAttachment) {
              await onUpdateAttachment(editingShipmentForAttachment.id, data);
            }
            setEditingShipmentForAttachment(null);
          }}
          onUpdateShipmentData={onUpdateShipmentData}
          shipment={shipments.find(s => s.id === editingShipmentForAttachment.id) || editingShipmentForAttachment}
          cargo={cargoMap.get(editingShipmentForAttachment.cargoId)}
          documentName="Comprovante de Pagamento de Saldo"
          currentUser={currentUser}
          products={products}
          clients={clients}
          users={users}
        />
      )}


    </div>
  );
};

export default RealProfitReport;
