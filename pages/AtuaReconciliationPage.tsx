import React, { useState, useMemo, useRef } from 'react';
import { 
  GitCompare, 
  Upload, 
  FileText, 
  CheckCircle2, 
  AlertTriangle, 
  AlertCircle, 
  HelpCircle, 
  Search, 
  Filter, 
  Download, 
  RefreshCw, 
  ArrowRight, 
  Scale, 
  DollarSign, 
  Layers, 
  Calendar, 
  Sliders, 
  X, 
  Eye, 
  ArrowUpDown,
  FileSpreadsheet,
  Check,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Shipment, Cargo, Client, Driver, Vehicle, User, Branch } from '../types';
import { UserProfile, FreightCalculationType } from '../types';
import { 
  getShipmentCte, 
  getShipmentEffectiveDate, 
  isStayForShipment, 
  normalizeWeightTonnage,
  hasCteAttached
} from '../utils';
import { extractCteNumberFromStay, type StayRecord } from '../utils/toolStorage';
import { calculateShipmentExpenses, DEFAULT_EXPENSES_CONFIG } from '../utils/operationalExpensesCalculator';
import { addPdfLogo } from '../utils/pdfGenerator';
import { 
  parseAtuaPdfFile, 
  parseAtuaExcelFile, 
  parseAtuaTextReport, 
  type AtuaCteRecord, 
  type TranscunhaReportRecord,
  type AtuaReportParseResult,
  normalizePlate,
  normalizeDate 
} from '../utils/atuaReportParser';

interface AtuaReconciliationPageProps {
  currentUser: User;
  shipments: Shipment[];
  cargos: Cargo[];
  clients: Client[];
  drivers: Driver[];
  vehicles: Vehicle[];
  users: User[];
  branches: Branch[];
  stays: StayRecord[];
  companyLogo?: string | null;
  onOpenShipmentDetail?: (shipment: Shipment) => void;
}

export type ReconciliationStatus = 'CONCILIATED' | 'DIVERGENT' | 'ORPHAN_ATUA' | 'PENDING_ATUA';

export interface SimilarityMatchInfo {
  targetId: string;
  targetPlate: string;
  targetDate: string;
  targetCte: string;
  targetWeight: number;
  targetCompanyFreight: number;
  targetDriverFreight: number;
  similarityScore: number;
  similarityReasons: string[];
  isLikelyReissueOrDisagreement: boolean;
}

export interface ReconciliationItem {
  id: string;
  cteNumber: string; // Exibição principal (Atua ou Transcunha)
  cteNumberTrans: string;
  cteNumberAtua: string;
  isCteDivergent: boolean;
  shipmentId?: string;
  shipment?: Shipment;
  cargo?: Cargo;
  stay?: StayRecord;
  isComplementary: boolean;
  plate: string;
  driverName?: string;
  clientName?: string;
  date?: string;
  origin?: string;
  destination?: string;
  status: ReconciliationStatus;
  divergenceReasons: string[];

  // Informação de similaridade / possível reemissão ou desacordo comercial
  similarMatch?: SimilarityMatchInfo;

  // Flags de divergência específicas
  isWeightDivergent: boolean;
  isCompanyFreightDivergent: boolean;
  isCompanyRateDivergent: boolean;
  isDriverFreightDivergent: boolean;
  isDriverRateDivergent: boolean;
  isTollDivergent: boolean;
  isIcmsDivergent: boolean;

  // Conciliação de frete com pedágio incluso/destacado
  isDriverFreightReconciledByToll?: boolean;
  isCompanyFreightReconciledByToll?: boolean;

  // Filial e UF de Faturamento (diferenciação de sequências estaduais de CT-e)
  transUf?: string;
  atuaUf?: string;
  transBranch?: string;
  atuaBranch?: string;

  transcunha: {
    weight: number;
    companyFreight: number;
    companyRatePerTon: number;
    driverFreight: number;
    driverRatePerTon: number;
    toll: number;
    freightDifference: number;
    icms: number;
    federalTax: number;
    totalExpenses: number;
    netProfit: number;
  } | null;

  atua: {
    weight: number;
    companyFreight: number;
    companyRatePerTon: number;
    driverFreight: number;
    driverRatePerTon: number;
    toll: number;
    freightDifference: number;
    icms: number;
    federalTax: number;
    otherCosts: number;
    netProfit: number;
    isCanceled: boolean;
    payer?: string;
  } | null;

  delta: {
    weight: number;
    companyFreight: number;
    companyRatePerTon: number;
    driverFreight: number;
    driverRatePerTon: number;
    toll: number;
    icms: number;
    federalTax: number;
    netProfit: number;
  };
}

const AtuaReconciliationPage: React.FC<AtuaReconciliationPageProps> = ({
  currentUser,
  shipments,
  cargos,
  clients,
  drivers,
  vehicles,
  users,
  branches,
  stays,
  companyLogo,
  onOpenShipmentDetail
}) => {
  const [atuaResult, setAtuaResult] = useState<AtuaReportParseResult | null>(null);
  const [uploadedTranscunhaRecords, setUploadedTranscunhaRecords] = useState<TranscunhaReportRecord[] | null>(null);
  const [transcunhaFileName, setTranscunhaFileName] = useState<string>('');
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string>('');

  // Filtros
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [tolerance, setTolerance] = useState<number>(0.50); // Tolerância padrão de centavos R$ 0,50
  const [rateTolerance, setRateTolerance] = useState<number>(0.10); // Tolerância padrão de tarifa R$ 0,10 / ton
  const [weightTolerance, setWeightTolerance] = useState<number>(0.05); // Tolerância de peso padrão 0.05 t
  const [filterStatus, setFilterStatus] = useState<ReconciliationStatus | 'ALL' | 'SIMILAR'>('ALL');
  const [filterDivergenceType, setFilterDivergenceType] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [viewMode, setViewMode] = useState<'compact' | 'side-by-side'>('side-by-side');
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);

  // Modal de colar texto
  const [isPasteModalOpen, setIsPasteModalOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const transcunhaFileInputRef = useRef<HTMLInputElement>(null);

  const cargoMap = useMemo(() => new Map(cargos.map(c => [c.id, c])), [cargos]);
  const clientMap = useMemo(() => new Map(clients.map(c => [c.id, c.nomeFantasia || c.razaoSocial || ''])), [clients]);
  const branchMap = useMemo(() => new Map(branches.map(b => [b.id, b])), [branches]);

  // Handler de upload do arquivo Atua TMS (com detecção inteligente caso o usuário envie o arquivo Transcunha)
  const handleFileUpload = async (file: File) => {
    setIsParsing(true);
    setParseError(null);

    try {
      let result: AtuaReportParseResult;
      const lower = file.name.toLowerCase();
      if (lower.endsWith('.pdf')) {
        result = await parseAtuaPdfFile(file);
      } else if (lower.endsWith('.xlsx') || lower.endsWith('.xls') || lower.endsWith('.csv')) {
        result = await parseAtuaExcelFile(file);
      } else {
        throw new Error('Formato não suportado. Por favor, envie um arquivo PDF, Excel (.xlsx, .xls) ou CSV.');
      }

      // Se o usuário acidentalmente enviou o relatório de Lucro Real da Transcunha no slot do Atua
      if (result.detectedFileType === 'TRANSCUNHA_PROFIT') {
        const tRecords = result.transcunhaRecords || [];
        setUploadedTranscunhaRecords(tRecords);
        setTranscunhaFileName(file.name);
        setUploadedFileName('');
        if (result.startDate && !startDate) setStartDate(result.startDate);
        if (result.endDate && !endDate) setEndDate(result.endDate);

        setParseError(
          `Arquivo identificado: "Relatório: Lucro Real da Operação de Embarque" da Transcunha (${tRecords.length} embarques importados com sucesso). Para realizar o confronto, selecione agora o "Relatório Detalhado do CTRC" gerado no Atua TMS.`
        );
        return;
      }

      if (result.records.length === 0) {
        throw new Error('Nenhum registro de CT-e pôde ser extraído deste arquivo. Verifique se o relatório é o "Relatório Detalhado do CTRC" do Atua TMS.');
      }

      setAtuaResult(result);
      setUploadedFileName(file.name);

      // Auto-preenche o período se detectado no arquivo
      if (result.startDate && !startDate) {
        setStartDate(result.startDate);
      }
      if (result.endDate && !endDate) {
        setEndDate(result.endDate);
      }
    } catch (err: any) {
      setParseError(err?.message || 'Falha ao processar arquivo.');
      setAtuaResult(null);
    } finally {
      setIsParsing(false);
    }
  };

  // Handler de upload opcional do arquivo de Lucro Real da Transcunha
  const handleTranscunhaFileUpload = async (file: File) => {
    setIsParsing(true);
    setParseError(null);
    setTranscunhaFileName(file.name);

    try {
      let result: AtuaReportParseResult;
      const lower = file.name.toLowerCase();
      if (lower.endsWith('.pdf')) {
        result = await parseAtuaPdfFile(file);
      } else if (lower.endsWith('.xlsx') || lower.endsWith('.xls') || lower.endsWith('.csv')) {
        result = await parseAtuaExcelFile(file);
      } else {
        throw new Error('Formato não suportado. Por favor, envie um arquivo PDF, Excel (.xlsx, .xls) ou CSV.');
      }

      if (result.transcunhaRecords && result.transcunhaRecords.length > 0) {
        setUploadedTranscunhaRecords(result.transcunhaRecords);
      } else if (result.records.length > 0) {
        const converted: TranscunhaReportRecord[] = result.records.map(r => ({
          shipmentId: r.cteNumber,
          cteNumber: r.cteNumber,
          date: r.emissionDate,
          clientName: r.payer || r.recipient || '---',
          plate: r.plate,
          weight: r.weight,
          companyFreight: r.companyFreight,
          driverFreight: r.driverFreight,
          toll: r.toll,
          icms: r.icmsIssqn,
          federalTax: r.federalTax,
          netProfit: r.result,
          rawLine: r.rawLine
        }));
        setUploadedTranscunhaRecords(converted);
      } else {
        throw new Error('Nenhum registro de embarque identificado neste arquivo.');
      }

      if (result.startDate && !startDate) setStartDate(result.startDate);
      if (result.endDate && !endDate) setEndDate(result.endDate);
    } catch (err: any) {
      setParseError(err?.message || 'Falha ao processar arquivo da Transcunha.');
    } finally {
      setIsParsing(false);
    }
  };

  const handleProcessPaste = () => {
    if (!pasteText.trim()) return;
    setIsParsing(true);
    setParseError(null);
    try {
      const result = parseAtuaTextReport(pasteText);
      if (result.detectedFileType === 'TRANSCUNHA_PROFIT') {
        const tRecords = result.transcunhaRecords || [];
        setUploadedTranscunhaRecords(tRecords);
        setTranscunhaFileName('Texto Lucro Real');
        setIsPasteModalOpen(false);
        setPasteText('');
        if (result.startDate && !startDate) setStartDate(result.startDate);
        if (result.endDate && !endDate) setEndDate(result.endDate);
        setParseError(`Identificado como Relatório de Lucro Real Transcunha (${tRecords.length} embarques). Agora envie o CTRC do Atua TMS.`);
        return;
      }

      if (result.records.length === 0) {
        throw new Error('Nenhum CT-e encontrado no texto colado.');
      }
      setAtuaResult(result);
      setUploadedFileName('Texto Colado Manualmente');
      setIsPasteModalOpen(false);
      setPasteText('');

      if (result.startDate && !startDate) setStartDate(result.startDate);
      if (result.endDate && !endDate) setEndDate(result.endDate);
    } catch (err: any) {
      setParseError(err?.message || 'Falha ao processar texto.');
    } finally {
      setIsParsing(false);
    }
  };

  // Função auxiliar para extração estrita do número real de CT-e do embarque
  // NOTA CRÍTICA: 'codigo_atua' é código interno/ordem e NÃO deve ser usado como número fiscal de CT-e.
  const extractShipmentCteClean = (s: Shipment): string => {
    if (!s) return '';
    
    // 1. Número explícito de CT-e cadastrado no embarque
    const direct = s.cteNumber || s.documents?.cte_number || s.documents?.cteNumber;
    if (direct !== undefined && direct !== null) {
      const trimmed = String(direct).trim();
      if (trimmed !== '' && trimmed !== '-' && trimmed !== '0') {
        return trimmed;
      }
    }

    // 2. Extração via função oficial getShipmentCte (com tratamento de anexos)
    const helperVal = getShipmentCte(s);
    if (helperVal && helperVal !== '-' && helperVal !== '0') {
      const cleanDigits = helperVal.replace(/[^0-9]/g, '');
      // Evita timestamps de upload (que têm 10+ dígitos)
      if (cleanDigits.length < 10) {
        return helperVal.trim();
      }
    }

    return '';
  };

  // 1. Enriquecimento dos Embarques do Transcunha no Período Selecionado
  const enrichedTranscunhaData = useMemo(() => {
    // Conjunto de CT-es presentes no relatório Atua carregado
    const atuaCteSet = new Set(
      (atuaResult?.records || []).map(r => r.cteNumber.replace(/[^0-9]/g, '')).filter(Boolean)
    );

    // Filtra estritamente embarques EFETIVADOS COM CT-E e que respeitam o período selecionado
    const validShipments = shipments.filter(s => {
      // 1. Ignora embarques cancelados
      if (s.status === 'Cancelado' || (s as any)?.isCancelled) return false;

      // 2. REGRA MANDATÓRIA: Deve ser embarque efetivado COM CT-E emitido
      const directCte = extractShipmentCteClean(s).replace(/[^0-9]/g, '');
      if (!directCte) return false;

      const plate = normalizePlate(s.horsePlate);
      if (!plate) return false;

      // Se o CT-e do embarque constar no relatório do Atua importado, SEMPRE inclui (independente do filtro de data)
      if (atuaCteSet.has(directCte)) {
        return true;
      }

      // Prioriza a data contábil/efetiva da emissão do CT-e sobre a data agendada
      const effectiveDate = getShipmentEffectiveDate(s);
      const dateStr = normalizeDate(effectiveDate || s.scheduledDate || '');
      if (startDate && dateStr && dateStr < startDate) return false;
      if (endDate && dateStr && dateStr > endDate) return false;
      return true;
    });

    const items: Array<{
      key: string;
      cteNumber: string;
      shipment: Shipment;
      cargo?: Cargo;
      isComplementary: boolean;
      weight: number;
      companyFreight: number;
      companyRatePerTon: number;
      driverFreight: number;
      driverRatePerTon: number;
      toll: number;
      freightDifference: number;
      icms: number;
      federalTax: number;
      totalExpenses: number;
      netProfit: number;
      plate: string;
      date: string;
      clientName: string;
      origin: string;
      destination: string;
      driverName: string;
    }> = [];

    validShipments.forEach(s => {
      const cargo = s.cargoId ? cargoMap.get(s.cargoId) : undefined;
      const clientName = (cargo?.clientId ? clientMap.get(cargo.clientId) : '') || '---';
      const cte = extractShipmentCteClean(s);
      const calculatedExpenses = calculateShipmentExpenses(s, cargo, DEFAULT_EXPENSES_CONFIG, stays);
      const toll = (s.tollValue !== undefined && s.tollValue !== null) ? Number(s.tollValue) || 0 : (s.realProfitData?.toll || 0);

      // Estadias vinculadas
      const shipmentStays = stays.filter(stay => isStayForShipment(stay, s));
      const demurrageRevenue = shipmentStays.reduce((sum, stay) => sum + (stay.approvedValue || 0), 0);
      const demurrageDriverPaid = shipmentStays.reduce((sum, stay) => sum + (stay.driverPaidValue || 0), 0);
      const demurrageProfit = demurrageRevenue - demurrageDriverPaid;
      const hasComplement = Boolean((demurrageRevenue > 0 || demurrageDriverPaid > 0) || shipmentStays.length > 0);

      // Valores base do Frete Original
      const baseCompanyFreight = (s.realProfitData?.companyFreight !== undefined && s.realProfitData?.companyFreight !== null)
        ? Number(s.realProfitData.companyFreight)
        : calculatedExpenses.companyFreight;
      const baseDriverFreight = (s.realProfitData?.driverFreight !== undefined && s.realProfitData?.driverFreight !== null)
        ? Number(s.realProfitData.driverFreight)
        : calculatedExpenses.driverFreight;
      const baseFreightDifference = baseCompanyFreight - baseDriverFreight;
      const baseNetProfit = Number(calculatedExpenses.netProfit.toFixed(2));

      const icms = (() => {
        const isCargoWithoutIcms = Boolean(
          cargo &&
          !cargo.hasIcms &&
          !(cargo.icmsPercentage && Number(cargo.icmsPercentage) > 0) &&
          !(cargo.freightLegs && cargo.freightLegs[0]?.hasIcms === true) &&
          !(cargo.freightLegs && Number(cargo.freightLegs[0]?.icmsPercentage) > 0) &&
          !(s as any)?.hasIcms
        );
        if (
          isCargoWithoutIcms ||
          (s as any)?.isIcmsExempt ||
          (s.documents as any)?.is_icms_exempt ||
          s.realProfitData?.isIcmsExempt ||
          s.icmsValue === 0 ||
          (s.documents as any)?.icms_value === 0
        ) {
          return 0;
        }
        return Number((calculatedExpenses.icms || (s.documents as any)?.icms_value || s.icmsValue || s.realProfitData?.icmsDifference || 0).toFixed(2));
      })();

      const federalTax = (s.realProfitData?.federalTax !== undefined && s.realProfitData.federalTax !== null)
        ? Number(s.realProfitData.federalTax)
        : Number(calculatedExpenses.impostoFederal || 0);

      const weight = normalizeWeightTonnage(s.unloadedTonnage || s.loadedTonnage || s.shipmentTonnage || cargo?.totalVolume || 0);

      // Tarifa por tonelada no Transcunha
      let companyRatePerTon = 0;
      if (s.companyFreightRateSnapshot && s.companyFreightRateSnapshot > 0) {
        companyRatePerTon = Number(s.companyFreightRateSnapshot);
      } else if (cargo?.companyFreightValuePerTon && cargo.companyFreightValuePerTon > 0) {
        companyRatePerTon = Number(cargo.companyFreightValuePerTon);
      } else if (weight > 0 && baseCompanyFreight > 0) {
        companyRatePerTon = Number((baseCompanyFreight / weight).toFixed(2));
      }

      let driverRatePerTon = 0;
      if (s.driverFreightRateSnapshot && s.driverFreightRateSnapshot > 0) {
        driverRatePerTon = Number(s.driverFreightRateSnapshot);
      } else if (cargo?.driverFreightValuePerTon && cargo.driverFreightValuePerTon > 0) {
        driverRatePerTon = Number(cargo.driverFreightValuePerTon);
      } else if (s.freightCalculationType === FreightCalculationType.PerTon && s.driverFreightValue && weight > 0) {
        driverRatePerTon = Number((s.driverFreightValue / weight).toFixed(2));
      } else if (weight > 0 && baseDriverFreight > 0) {
        driverRatePerTon = Number((baseDriverFreight / weight).toFixed(2));
      }

      const shipmentEffectiveDate = normalizeDate(getShipmentEffectiveDate(s) || s.scheduledDate || '');

      // Linha Principal do Embarque (Sempre entra mesmo que ainda não tenha CT-e anexado)
      items.push({
        key: `${s.id}-base`,
        cteNumber: cte ? cte.replace(/[^0-9]/g, '') : '',
        shipment: s,
        cargo,
        isComplementary: false,
        weight,
        companyFreight: baseCompanyFreight,
        companyRatePerTon,
        driverFreight: baseDriverFreight,
        driverRatePerTon,
        toll,
        freightDifference: baseFreightDifference,
        icms,
        federalTax,
        totalExpenses: calculatedExpenses.totalExpenses,
        netProfit: baseNetProfit,
        plate: normalizePlate(s.horsePlate),
        date: shipmentEffectiveDate,
        clientName,
        origin: cargo?.origin || '',
        destination: cargo?.destination || '',
        driverName: s.driverName || '---'
      });

      // Sub-linha de CT-e Complementar de Estadia (apenas se possuir CT-e complementar emitido)
      if (hasComplement) {
        shipmentStays.forEach((stay, idx) => {
          const rawCompCte = stay.cteNumber || extractCteNumberFromStay(stay) || '';
          const compCte = rawCompCte.replace(/[^0-9]/g, '');
          if (!compCte) return; // Só inclui se possuir CT-e complementar emitido

          const stayRev = stay.approvedValue || 0;
          const stayDriver = stay.driverPaidValue || 0;
          const stayDiff = stayRev - stayDriver;

          items.push({
            key: `${s.id}-comp-${idx}`,
            cteNumber: compCte,
            shipment: s,
            cargo,
            isComplementary: true,
            weight: 0,
            companyFreight: stayRev,
            companyRatePerTon: 0,
            driverFreight: stayDriver,
            driverRatePerTon: 0,
            toll: 0,
            freightDifference: stayDiff,
            icms: 0,
            federalTax: 0,
            totalExpenses: 0,
            netProfit: stayDiff,
            plate: normalizePlate(s.horsePlate),
            date: shipmentEffectiveDate,
            clientName,
            origin: cargo?.origin || '',
            destination: cargo?.destination || '',
            driverName: s.driverName || '---'
          });
        });
      }
    });

    // Mescla embarques do relatório Lucro Real em arquivo (se fornecido - apenas efetivados com CT-e)
    if (uploadedTranscunhaRecords && uploadedTranscunhaRecords.length > 0) {
      uploadedTranscunhaRecords.forEach((tr, idx) => {
        const cteClean = tr.cteNumber ? tr.cteNumber.replace(/[^0-9]/g, '') : '';
        if (!cteClean) return; // Ignora registros sem CT-e emitido

        const plateNorm = normalizePlate(tr.plate);
        const dateNorm = normalizeDate(tr.date);

        // Se já está nos itens pelo banco de dados (mesma placa e data), não duplica
        const exists = items.some(it => it.plate === plateNorm && it.date === dateNorm);
        if (!exists) {
          const fakeShipment: Shipment = {
            id: tr.shipmentId || `transcunha-file-${idx}`,
            horsePlate: tr.plate,
            scheduledDate: tr.date,
            client: tr.clientName,
            status: 'concluded'
          } as any;

          const w = tr.weight || 0;
          const compRate = w > 0 ? Number((tr.companyFreight / w).toFixed(2)) : 0;
          const drivRate = w > 0 ? Number((tr.driverFreight / w).toFixed(2)) : 0;

          items.push({
            key: `trans-file-${tr.shipmentId || cteClean || plateNorm}-${idx}`,
            cteNumber: cteClean,
            shipment: fakeShipment,
            cargo: undefined,
            isComplementary: (tr.weight === 0 && tr.companyFreight > 0),
            weight: tr.weight,
            companyFreight: tr.companyFreight,
            companyRatePerTon: compRate,
            driverFreight: tr.driverFreight,
            driverRatePerTon: drivRate,
            toll: tr.toll,
            freightDifference: tr.companyFreight - tr.driverFreight,
            icms: tr.icms,
            federalTax: tr.federalTax,
            totalExpenses: 0,
            netProfit: tr.netProfit,
            plate: plateNorm,
            date: dateNorm,
            clientName: tr.clientName,
            origin: '',
            destination: '',
            driverName: '---'
          });
        }
      });
    }

    return items;
  }, [shipments, cargos, cargoMap, clientMap, stays, startDate, endDate, uploadedTranscunhaRecords, atuaResult]);

  // 2. Motor de Reconciliação / Auditoria Cruzada baseado em CT-E e PLACA + DATA DO EMBARQUE
  const reconciliationItems: ReconciliationItem[] = useMemo(() => {
    if (!atuaResult && enrichedTranscunhaData.length === 0) return [];

    const atuaRecords = atuaResult?.records || [];
    const matchedTranscunhaKeys = new Set<string>();
    const matchedAtuaIndexes = new Set<number>();
    const results: ReconciliationItem[] = [];

    // Passo 1: Para cada linha do Atua, buscar o embarque correspondente
    atuaRecords.forEach((atuaRec, atuaIdx) => {
      const atuaCteClean = atuaRec.cteNumber.replace(/[^0-9]/g, '');
      const atuaPlateClean = normalizePlate(atuaRec.plate);
      const atuaDateClean = normalizeDate(atuaRec.emissionDate || '');

      // Taxas por tonelada no Atua
      const atuaWeight = atuaRec.weight || 0;
      const atuaCompanyRate = (atuaRec.companyTariff && atuaRec.companyTariff > 0)
        ? atuaRec.companyTariff
        : (atuaWeight > 0 ? Number((atuaRec.companyFreight / atuaWeight).toFixed(2)) : 0);

      const atuaDriverRate = (atuaRec.driverTariff && atuaRec.driverTariff > 0)
        ? atuaRec.driverTariff
        : (atuaWeight > 0 ? Number((atuaRec.driverFreight / atuaWeight).toFixed(2)) : 0);

      let match: typeof enrichedTranscunhaData[0] | undefined;

      // Fase 1: Pareamento Direto por Número do CT-e (Prioridade Absoluta)
      // Se tanto o Atua quanto a Transcunha possuem o CT-e com mesmo número (ex: 2053), pertencem garantidamente à mesma operação fiscal
      if (atuaCteClean) {
        match = enrichedTranscunhaData.find(t => 
          !matchedTranscunhaKeys.has(t.key) && 
          t.cteNumber && 
          (t.cteNumber === atuaCteClean || parseInt(t.cteNumber, 10) === parseInt(atuaCteClean, 10))
        );
      }

      // Fase 2: Pareamento por Placa Normalizada + Data de Emissão/Embarque (para auditar numeração de CT-e ou ausência de CT-e)
      if (!match && atuaPlateClean) {
        // Busca exata por placa e data
        const exactMatches = enrichedTranscunhaData.filter(t => 
          !matchedTranscunhaKeys.has(t.key) && 
          (t.plate === atuaPlateClean ||
           normalizePlate(t.shipment?.trailer1Plate || '') === atuaPlateClean ||
           normalizePlate(t.shipment?.trailer2Plate || '') === atuaPlateClean) && 
          t.date === atuaDateClean
        );

        if (exactMatches.length === 1) {
          match = exactMatches[0];
        } else if (exactMatches.length > 1) {
          const cteMatch = exactMatches.find(t => t.cteNumber && t.cteNumber === atuaCteClean);
          if (cteMatch) {
            match = cteMatch;
          } else {
            match = exactMatches.reduce((best, cur) => {
              const diffBest = Math.abs(best.weight - atuaWeight) + Math.abs(best.companyFreight - atuaRec.companyFreight) / 1000;
              const diffCur = Math.abs(cur.weight - atuaWeight) + Math.abs(cur.companyFreight - atuaRec.companyFreight) / 1000;
              return diffCur < diffBest ? cur : best;
            });
          }
        } else {
          // Tolerância de data (até 3 dias de diferença entre data do agendamento/embarque e emissão do CT-e)
          const nearDateMatches = enrichedTranscunhaData.filter(t => {
            if (matchedTranscunhaKeys.has(t.key)) return false;
            const samePlate = (t.plate === atuaPlateClean ||
              normalizePlate(t.shipment?.trailer1Plate || '') === atuaPlateClean ||
              normalizePlate(t.shipment?.trailer2Plate || '') === atuaPlateClean);
            if (!samePlate) return false;
            if (!t.date || !atuaDateClean) return false;
            const diffDays = Math.abs((new Date(t.date).getTime() - new Date(atuaDateClean).getTime()) / (1000 * 60 * 60 * 24));
            return diffDays <= 3;
          });

          if (nearDateMatches.length === 1) {
            match = nearDateMatches[0];
          } else if (nearDateMatches.length > 1) {
            match = nearDateMatches.reduce((best, cur) => {
              const diffBest = Math.abs(best.weight - atuaWeight) + Math.abs(best.companyFreight - atuaRec.companyFreight) / 1000;
              const diffCur = Math.abs(cur.weight - atuaWeight) + Math.abs(cur.companyFreight - atuaRec.companyFreight) / 1000;
              return diffCur < diffBest ? cur : best;
            });
          }
        }
      }

      if (match) {
        matchedTranscunhaKeys.add(match.key);
        matchedAtuaIndexes.add(atuaIdx);

        // 1. Auditoria do CT-e
        const transCte = match.cteNumber;
        const isCteDivergent = !transCte || !atuaCteClean || (transCte !== atuaCteClean && parseInt(transCte, 10) !== parseInt(atuaCteClean, 10));

        // Pedágio de referência da operação para conferência cruzada
        const effectiveToll = (match.toll > 0 ? match.toll : atuaRec.toll) || 0;
        const tollPerTon = match.weight > 0 ? (effectiveToll / match.weight) : (atuaWeight > 0 ? (effectiveToll / atuaWeight) : 0);

        // 2. Auditoria do Frete Empresa
        const rawDeltaCompanyFreight = Number((match.companyFreight - atuaRec.companyFreight).toFixed(2));
        const directDiffCompany = Math.abs(rawDeltaCompanyFreight);
        const diffCompanyMinusToll = Math.abs((match.companyFreight - effectiveToll) - atuaRec.companyFreight);
        const diffCompanyPlusToll = Math.abs((match.companyFreight + effectiveToll) - atuaRec.companyFreight);
        const isCompanyFreightReconciledByToll = effectiveToll > 0 && (
          diffCompanyMinusToll <= tolerance || diffCompanyPlusToll <= tolerance
        );
        const isCompanyFreightDivergent = directDiffCompany > tolerance && !isCompanyFreightReconciledByToll;
        const deltaCompanyFreight = isCompanyFreightReconciledByToll ? 0 : rawDeltaCompanyFreight;

        const rawDeltaCompanyRate = Number((match.companyRatePerTon - atuaCompanyRate).toFixed(2));
        const directDiffCompanyRate = Math.abs(rawDeltaCompanyRate);
        const diffCompanyRateWithToll = Math.abs(directDiffCompanyRate - tollPerTon);
        const isCompanyRateReconciledByToll = isCompanyFreightReconciledByToll || (tollPerTon > 0 && diffCompanyRateWithToll <= rateTolerance);
        const isCompanyRateDivergent = directDiffCompanyRate > rateTolerance && !isCompanyRateReconciledByToll;
        const deltaCompanyRate = isCompanyRateReconciledByToll ? 0 : rawDeltaCompanyRate;

        // 3. Auditoria do Frete Motorista (com conciliação inteligente de pedágio incluso vs destacado)
        const rawDeltaDriverFreight = Number((match.driverFreight - atuaRec.driverFreight).toFixed(2));
        const directDiffDriver = Math.abs(rawDeltaDriverFreight);
        const diffDriverMinusToll = Math.abs((match.driverFreight - effectiveToll) - atuaRec.driverFreight);
        const diffDriverPlusToll = Math.abs((match.driverFreight + effectiveToll) - atuaRec.driverFreight);
        const isDriverFreightReconciledByToll = effectiveToll > 0 && (
          diffDriverMinusToll <= tolerance || diffDriverPlusToll <= tolerance
        );
        const isDriverFreightDivergent = directDiffDriver > tolerance && !isDriverFreightReconciledByToll;
        const deltaDriverFreight = isDriverFreightReconciledByToll ? 0 : rawDeltaDriverFreight;

        const rawDeltaDriverRate = Number((match.driverRatePerTon - atuaDriverRate).toFixed(2));
        const directDiffDriverRate = Math.abs(rawDeltaDriverRate);
        const diffDriverRateWithToll = Math.abs(directDiffDriverRate - tollPerTon);
        const isDriverRateReconciledByToll = isDriverFreightReconciledByToll || (tollPerTon > 0 && diffDriverRateWithToll <= rateTolerance);
        const isDriverRateDivergent = directDiffDriverRate > rateTolerance && !isDriverRateReconciledByToll;
        const deltaDriverRate = isDriverRateReconciledByToll ? 0 : rawDeltaDriverRate;

        // 4. Auditoria do Peso Carregado
        const deltaWeight = Number((match.weight - atuaRec.weight).toFixed(2));
        const isWeightDivergent = Math.abs(deltaWeight) > weightTolerance;

        // 5. Auditoria do Pedágio
        const deltaToll = Number((match.toll - atuaRec.toll).toFixed(2));
        const isTollDivergent = Math.abs(deltaToll) > tolerance;

        // 6. Auditoria do ICMS
        const deltaIcms = Number((match.icms - atuaRec.icmsIssqn).toFixed(2));
        const isIcmsDivergent = Math.abs(deltaIcms) > tolerance;

        // Outras grandezas
        const deltaFederalTax = Number((match.federalTax - atuaRec.federalTax).toFixed(2));
        const deltaNetProfit = Number((match.netProfit - atuaRec.result).toFixed(2));

        const reasons: string[] = [];

        if (isCteDivergent) {
          if (!transCte) {
            reasons.push(`CT-e não cadastrado no Transcunha (Atua: CT-e ${atuaCteClean || atuaRec.cteNumber})`);
          } else if (!atuaCteClean) {
            reasons.push(`CT-e ausente no Atua (Transcunha: CT-e ${transCte})`);
          } else {
            reasons.push(`Número de CT-e diverge: Atua ${atuaCteClean} vs Transcunha ${transCte}`);
          }
        }

        if (isCompanyFreightDivergent) {
          reasons.push(`Frete Empresa Total diverge em R$ ${Math.abs(rawDeltaCompanyFreight).toFixed(2)} (Trans: R$ ${match.companyFreight.toFixed(2)} vs Atua: R$ ${atuaRec.companyFreight.toFixed(2)})`);
        }
        if (isCompanyRateDivergent) {
          reasons.push(`Tarifa Empresa/ton diverge em R$ ${Math.abs(rawDeltaCompanyRate).toFixed(2)}/t (Trans: R$ ${match.companyRatePerTon.toFixed(2)} vs Atua: R$ ${atuaCompanyRate.toFixed(2)})`);
        }

        if (isDriverFreightDivergent) {
          reasons.push(`Frete Motorista Total diverge em R$ ${Math.abs(rawDeltaDriverFreight).toFixed(2)} (Trans: R$ ${match.driverFreight.toFixed(2)} vs Atua: R$ ${atuaRec.driverFreight.toFixed(2)})`);
        }
        if (isDriverRateDivergent) {
          reasons.push(`Tarifa Motorista/ton diverge em R$ ${Math.abs(rawDeltaDriverRate).toFixed(2)}/t (Trans: R$ ${match.driverRatePerTon.toFixed(2)} vs Atua: R$ ${atuaDriverRate.toFixed(2)})`);
        }

        if (isWeightDivergent) {
          reasons.push(`Peso carregado diverge em ${Math.abs(deltaWeight).toFixed(2)} t (Trans: ${match.weight.toFixed(2)} t vs Atua: ${atuaRec.weight.toFixed(2)} t)`);
        }

        if (isTollDivergent) {
          reasons.push(`Pedágio diverge em R$ ${Math.abs(deltaToll).toFixed(2)} (Trans: R$ ${match.toll.toFixed(2)} vs Atua: R$ ${atuaRec.toll.toFixed(2)})`);
        }

        if (isIcmsDivergent) {
          reasons.push(`ICMS diverge em R$ ${Math.abs(deltaIcms).toFixed(2)} (Trans: R$ ${match.icms.toFixed(2)} vs Atua: R$ ${atuaRec.icmsIssqn.toFixed(2)})`);
        }

        // Divergência baseada estritamente nos 6 pilares de auditoria solicitados:
        // CT-e, Frete Empresa (Total e Tarifa), Frete Motorista (Total e Tarifa), Peso (t), Pedágio e ICMS
        const isDivergent = reasons.length > 0;

        results.push({
          id: `match-${atuaRec.cteNumber}-${match.key}`,
          cteNumber: atuaRec.cteNumber || match.cteNumber,
          cteNumberTrans: transCte,
          cteNumberAtua: atuaCteClean,
          isCteDivergent,
          shipmentId: match.shipment.id,
          shipment: match.shipment,
          cargo: match.cargo,
          isComplementary: match.isComplementary || atuaRec.isComplementary,
          plate: match.plate || atuaRec.plate,
          driverName: match.driverName,
          clientName: (match.clientName && match.clientName !== '---') ? match.clientName : (atuaRec.payer || atuaRec.shipper || '---'),
          date: atuaRec.emissionDate || match.date,
          origin: match.origin || atuaRec.originCity,
          destination: match.destination || atuaRec.destinationCity,
          status: isDivergent ? 'DIVERGENT' : 'CONCILIATED',
          divergenceReasons: reasons,

          isWeightDivergent,
          isCompanyFreightDivergent,
          isCompanyRateDivergent,
          isDriverFreightDivergent,
          isDriverRateDivergent,
          isTollDivergent,
          isIcmsDivergent,
          isDriverFreightReconciledByToll,
          isCompanyFreightReconciledByToll,

          transcunha: {
            weight: match.weight,
            companyFreight: match.companyFreight,
            companyRatePerTon: match.companyRatePerTon,
            driverFreight: match.driverFreight,
            driverRatePerTon: match.driverRatePerTon,
            toll: match.toll,
            freightDifference: match.freightDifference,
            icms: match.icms,
            federalTax: match.federalTax,
            totalExpenses: match.totalExpenses,
            netProfit: match.netProfit,
          },
          atua: {
            weight: atuaRec.weight,
            companyFreight: atuaRec.companyFreight,
            companyRatePerTon: atuaCompanyRate,
            driverFreight: atuaRec.driverFreight,
            driverRatePerTon: atuaDriverRate,
            toll: atuaRec.toll,
            freightDifference: atuaRec.companyFreight - atuaRec.driverFreight,
            icms: atuaRec.icmsIssqn,
            federalTax: atuaRec.federalTax,
            otherCosts: atuaRec.otherCosts,
            netProfit: atuaRec.result,
            isCanceled: atuaRec.isCanceled,
            payer: atuaRec.payer,
          },
          delta: {
            weight: deltaWeight,
            companyFreight: deltaCompanyFreight,
            companyRatePerTon: deltaCompanyRate,
            driverFreight: deltaDriverFreight,
            driverRatePerTon: deltaDriverRate,
            toll: deltaToll,
            icms: deltaIcms,
            federalTax: deltaFederalTax,
            netProfit: deltaNetProfit,
          }
        });
      } else {
        // Órfão no Atua (Consta no Atua mas placa/data não foi encontrada no Transcunha no período)
        results.push({
          id: `atua-orphan-${atuaRec.cteNumber}-${atuaIdx}`,
          cteNumber: atuaRec.cteNumber,
          cteNumberTrans: '',
          cteNumberAtua: atuaCteClean,
          isCteDivergent: true,
          isComplementary: atuaRec.isComplementary,
          plate: atuaRec.plate,
          clientName: atuaRec.payer || atuaRec.shipper || '---',
          driverName: '---',
          date: atuaRec.emissionDate,
          origin: atuaRec.originCity,
          destination: atuaRec.destinationCity,
          status: 'ORPHAN_ATUA',
          divergenceReasons: [`Consta no relatório do Atua TMS (Placa ${atuaRec.plate} em ${atuaRec.emissionDate || 's/ data'}), mas nenhum embarque com mesma placa e data foi localizado no Transcunha no período`],
          isWeightDivergent: true,
          isCompanyFreightDivergent: true,
          isCompanyRateDivergent: false,
          isDriverFreightDivergent: true,
          isDriverRateDivergent: false,
          isTollDivergent: atuaRec.toll > 0,
          isIcmsDivergent: atuaRec.icmsIssqn > 0,
          transcunha: null,
          atua: {
            weight: atuaRec.weight,
            companyFreight: atuaRec.companyFreight,
            companyRatePerTon: atuaCompanyRate,
            driverFreight: atuaRec.driverFreight,
            driverRatePerTon: atuaDriverRate,
            toll: atuaRec.toll,
            freightDifference: atuaRec.companyFreight - atuaRec.driverFreight,
            icms: atuaRec.icmsIssqn,
            federalTax: atuaRec.federalTax,
            otherCosts: atuaRec.otherCosts,
            netProfit: atuaRec.result,
            isCanceled: atuaRec.isCanceled,
            payer: atuaRec.payer,
          },
          delta: {
            weight: -atuaRec.weight,
            companyFreight: -atuaRec.companyFreight,
            companyRatePerTon: -atuaCompanyRate,
            driverFreight: -atuaRec.driverFreight,
            driverRatePerTon: -atuaDriverRate,
            toll: -atuaRec.toll,
            icms: -atuaRec.icmsIssqn,
            federalTax: -atuaRec.federalTax,
            netProfit: -atuaRec.result,
          }
        });
      }
    });

    // Passo 2: Pendentes no Atua (Constam no Transcunha mas placa/data não foi achada no Atua)
    enrichedTranscunhaData.forEach(t => {
      if (!matchedTranscunhaKeys.has(t.key)) {
        results.push({
          id: `transcunha-pending-${t.key}`,
          cteNumber: t.cteNumber,
          cteNumberTrans: t.cteNumber,
          cteNumberAtua: '',
          isCteDivergent: true,
          shipmentId: t.shipment.id,
          shipment: t.shipment,
          cargo: t.cargo,
          isComplementary: t.isComplementary,
          plate: t.plate,
          driverName: t.driverName,
          clientName: t.clientName,
          date: t.date,
          origin: t.origin,
          destination: t.destination,
          status: 'PENDING_ATUA',
          divergenceReasons: [`Embarque cadastrado no Transcunha (Placa ${t.plate} em ${t.date || 's/ data'}), mas não localizado no relatório do Atua TMS com mesma placa e data`],
          isWeightDivergent: true,
          isCompanyFreightDivergent: true,
          isCompanyRateDivergent: false,
          isDriverFreightDivergent: true,
          isDriverRateDivergent: false,
          isTollDivergent: t.toll > 0,
          isIcmsDivergent: t.icms > 0,
          transcunha: {
            weight: t.weight,
            companyFreight: t.companyFreight,
            companyRatePerTon: t.companyRatePerTon,
            driverFreight: t.driverFreight,
            driverRatePerTon: t.driverRatePerTon,
            toll: t.toll,
            freightDifference: t.freightDifference,
            icms: t.icms,
            federalTax: t.federalTax,
            totalExpenses: t.totalExpenses,
            netProfit: t.netProfit,
          },
          atua: null,
          delta: {
            weight: t.weight,
            companyFreight: t.companyFreight,
            companyRatePerTon: t.companyRatePerTon,
            driverFreight: t.driverFreight,
            driverRatePerTon: t.driverRatePerTon,
            toll: t.toll,
            icms: t.icms,
            federalTax: t.federalTax,
            netProfit: t.netProfit,
          }
        });
      }
    });

    // Passo 3: Cruzamento Heurístico Avançado de Semelhança (Órfãos no Atua vs Pendentes no Transcunha)
    // Identifica embarques com forte indício de desacordo comercial de CT-e ou reemissões com novas numerações no Atua TMS
    const orphanItems = results.filter(r => r.status === 'ORPHAN_ATUA');
    const pendingItems = results.filter(r => r.status === 'PENDING_ATUA');

    if (orphanItems.length > 0 && pendingItems.length > 0) {
      const usedPendingIds = new Set<string>();

      orphanItems.forEach(orphan => {
        let bestMatch: {
          pendingItem: ReconciliationItem;
          score: number;
          reasons: string[];
        } | null = null;

        const orphanPlate = normalizePlate(orphan.plate);
        const orphanDateStr = orphan.date || '';
        const orphanWeight = orphan.atua?.weight || 0;
        const orphanDriverFreight = orphan.atua?.driverFreight || 0;
        const orphanCompanyFreight = orphan.atua?.companyFreight || 0;

        pendingItems.forEach(pending => {
          if (usedPendingIds.has(pending.id)) return;

          let score = 0;
          const reasons: string[] = [];

          // 1. Mesma Placa do Cavalo ou Carretas (trailer1Plate, trailer2Plate, trailer3Plate): +40 pontos
          const pendingCavalo = normalizePlate(pending.plate);
          const trailer1 = normalizePlate(pending.shipment?.trailer1Plate || '');
          const trailer2 = normalizePlate(pending.shipment?.trailer2Plate || '');
          const trailer3 = normalizePlate(pending.shipment?.trailer3Plate || '');

          const exactPlateMatch = orphanPlate && (orphanPlate === pendingCavalo);
          const trailerPlateMatch = orphanPlate && (orphanPlate === trailer1 || orphanPlate === trailer2 || orphanPlate === trailer3);

          if (exactPlateMatch) {
            score += 40;
            reasons.push(`Mesma placa do cavalo mecânico (${orphan.plate})`);
          } else if (trailerPlateMatch) {
            score += 40;
            reasons.push(`Placa coincide com carreta do embarque (${orphan.plate})`);
          }

          // 2. Mesmo Frete Motorista (diferença <= R$ 2,00): +25 pontos
          const pendingDriverFreight = pending.transcunha?.driverFreight || 0;
          const diffDriverFreight = Math.abs(orphanDriverFreight - pendingDriverFreight);
          if (orphanDriverFreight > 0 && pendingDriverFreight > 0) {
            if (diffDriverFreight <= 2.0) {
              score += 25;
              reasons.push(`Frete Motorista idêntico: R$ ${orphanDriverFreight.toFixed(2)}`);
            } else if (diffDriverFreight <= 50.0) {
              score += 10;
              reasons.push(`Frete Motorista aproximado (diferença de R$ ${diffDriverFreight.toFixed(2)})`);
            }
          }

          // 3. Mesmo Peso em Toneladas (diferença <= 0,05 t): +20 pontos
          const pendingWeight = pending.transcunha?.weight || 0;
          const diffWeight = Math.abs(orphanWeight - pendingWeight);
          if (orphanWeight > 0 && pendingWeight > 0) {
            if (diffWeight <= 0.05) {
              score += 20;
              reasons.push(`Peso idêntico: ${orphanWeight.toFixed(2)} t`);
            } else if (diffWeight <= 0.5) {
              score += 10;
              reasons.push(`Peso próximo: ${orphanWeight.toFixed(2)} t vs ${pendingWeight.toFixed(2)} t`);
            }
          }

          // 4. Mesmo Frete Empresa (diferença <= R$ 5,00): +15 pontos
          const pendingCompanyFreight = pending.transcunha?.companyFreight || 0;
          const diffCompanyFreight = Math.abs(orphanCompanyFreight - pendingCompanyFreight);
          if (orphanCompanyFreight > 0 && pendingCompanyFreight > 0) {
            if (diffCompanyFreight <= 5.0) {
              score += 15;
              reasons.push(`Frete Empresa idêntico: R$ ${orphanCompanyFreight.toFixed(2)}`);
            } else if (diffCompanyFreight <= 100.0) {
              score += 8;
              reasons.push(`Frete Empresa compatível (diferença de R$ ${diffCompanyFreight.toFixed(2)})`);
            }
          }

          // 5. Janela de Emissão (até 30 dias de diferença): +10 pontos
          if (orphanDateStr && pending.date) {
            try {
              const d1 = new Date(orphanDateStr + 'T00:00:00').getTime();
              const d2 = new Date(pending.date + 'T00:00:00').getTime();
              const diffDays = Math.round(Math.abs(d1 - d2) / (1000 * 60 * 60 * 24));
              if (diffDays <= 30) {
                score += 10;
                if (diffDays === 0) {
                  reasons.push(`Mesma data (${pending.date})`);
                } else {
                  reasons.push(`Janela de emissão em até 30 dias (${diffDays} dias: ${pending.date} vs ${orphanDateStr})`);
                }
              }
            } catch {}
          }

          // 6. Mesma Tarifa Motorista/Empresa: +10 pontos
          const orphanDriverRate = orphan.atua?.driverRatePerTon || 0;
          const pendingDriverRate = pending.transcunha?.driverRatePerTon || 0;
          const orphanCompanyRate = orphan.atua?.companyRatePerTon || 0;
          const pendingCompanyRate = pending.transcunha?.companyRatePerTon || 0;
          const sameDriverRate = orphanDriverRate > 0 && pendingDriverRate > 0 && Math.abs(orphanDriverRate - pendingDriverRate) <= 0.10;
          const sameCompanyRate = orphanCompanyRate > 0 && pendingCompanyRate > 0 && Math.abs(orphanCompanyRate - pendingCompanyRate) <= 0.10;

          if (sameDriverRate || sameCompanyRate) {
            score += 10;
            if (sameDriverRate && sameCompanyRate) {
              reasons.push(`Mesmas tarifas por tonelada: Motorista (R$ ${orphanDriverRate.toFixed(2)}/t) e Empresa (R$ ${orphanCompanyRate.toFixed(2)}/t)`);
            } else if (sameDriverRate) {
              reasons.push(`Mesma tarifa de Motorista por tonelada (R$ ${orphanDriverRate.toFixed(2)}/t)`);
            } else {
              reasons.push(`Mesma tarifa de Empresa por tonelada (R$ ${orphanCompanyRate.toFixed(2)}/t)`);
            }
          }

          const finalScore = Math.min(100, score);

          // Threshold oficial do Passo 2: Score final >= 60%
          const currentBestScore = bestMatch ? (bestMatch as any).score : 0;
          if (finalScore >= 60 && finalScore > currentBestScore) {
            bestMatch = {
              pendingItem: pending,
              score: finalScore,
              reasons
            };
          }
        });

        const chosenMatch: any = bestMatch;
        if (chosenMatch && chosenMatch.score >= 60) {
          const pending: ReconciliationItem = chosenMatch.pendingItem;
          usedPendingIds.add(pending.id);

          orphan.similarMatch = {
            targetId: pending.id,
            targetPlate: pending.plate,
            targetDate: pending.date || '',
            targetCte: pending.cteNumberTrans || pending.cteNumber || '',
            targetWeight: pending.transcunha?.weight || 0,
            targetCompanyFreight: pending.transcunha?.companyFreight || 0,
            targetDriverFreight: pending.transcunha?.driverFreight || 0,
            similarityScore: chosenMatch.score,
            similarityReasons: chosenMatch.reasons,
            isLikelyReissueOrDisagreement: true
          };

          pending.similarMatch = {
            targetId: orphan.id,
            targetPlate: orphan.plate,
            targetDate: orphan.date || '',
            targetCte: orphan.cteNumberAtua || orphan.cteNumber || '',
            targetWeight: orphan.atua?.weight || 0,
            targetCompanyFreight: orphan.atua?.companyFreight || 0,
            targetDriverFreight: orphan.atua?.driverFreight || 0,
            similarityScore: chosenMatch.score,
            similarityReasons: chosenMatch.reasons,
            isLikelyReissueOrDisagreement: true
          };
        }
      });
    }

    return results;
  }, [atuaResult, enrichedTranscunhaData, tolerance, rateTolerance, weightTolerance]);

  // Totais e KPIs da Conciliação
  const kpis = useMemo(() => {
    const total = reconciliationItems.length;
    const conciliated = reconciliationItems.filter(i => i.status === 'CONCILIATED').length;
    const divergent = reconciliationItems.filter(i => i.status === 'DIVERGENT').length;
    const orphanAtua = reconciliationItems.filter(i => i.status === 'ORPHAN_ATUA').length;
    const pendingAtua = reconciliationItems.filter(i => i.status === 'PENDING_ATUA').length;
    const similarCount = reconciliationItems.filter(i => Boolean(i.similarMatch?.isLikelyReissueOrDisagreement)).length;

    // Subtotais de tipos de divergência
    const divergentCte = reconciliationItems.filter(i => i.status === 'DIVERGENT' && i.isCteDivergent).length;
    const divergentCompanyFreight = reconciliationItems.filter(i => i.status === 'DIVERGENT' && (i.isCompanyFreightDivergent || i.isCompanyRateDivergent)).length;
    const divergentDriverFreight = reconciliationItems.filter(i => i.status === 'DIVERGENT' && (i.isDriverFreightDivergent || i.isDriverRateDivergent)).length;
    const divergentWeight = reconciliationItems.filter(i => i.status === 'DIVERGENT' && i.isWeightDivergent).length;
    const divergentToll = reconciliationItems.filter(i => i.status === 'DIVERGENT' && i.isTollDivergent).length;
    const divergentIcms = reconciliationItems.filter(i => i.status === 'DIVERGENT' && i.isIcmsDivergent).length;

    const sumDeltaCompany = reconciliationItems.reduce((acc, i) => acc + (i.delta.companyFreight || 0), 0);
    const sumDeltaDriver = reconciliationItems.reduce((acc, i) => acc + (i.delta.driverFreight || 0), 0);
    const sumDeltaResult = reconciliationItems.reduce((acc, i) => acc + (i.delta.netProfit || 0), 0);
    const sumDeltaToll = reconciliationItems.reduce((acc, i) => acc + (i.delta.toll || 0), 0);

    return {
      total,
      conciliated,
      divergent,
      orphanAtua,
      pendingAtua,
      similarCount,
      conciliatedPercent: total > 0 ? (conciliated / total) * 100 : 0,
      divergentCte,
      divergentCompanyFreight,
      divergentDriverFreight,
      divergentWeight,
      divergentToll,
      divergentIcms,
      sumDeltaCompany,
      sumDeltaDriver,
      sumDeltaResult,
      sumDeltaToll
    };
  }, [reconciliationItems]);

  // Itens Filtrados
  const filteredItems = useMemo(() => {
    return reconciliationItems.filter(item => {
      // Filtro de Status
      if (filterStatus === 'SIMILAR') {
        if (!item.similarMatch?.isLikelyReissueOrDisagreement) return false;
      } else if (filterStatus !== 'ALL' && item.status !== filterStatus) {
        return false;
      }

      // Filtro por tipo de divergência
      if (filterDivergenceType !== 'ALL') {
        if (filterDivergenceType === 'CTE' && !item.isCteDivergent) return false;
        if (filterDivergenceType === 'FREIGHT_COMPANY' && !item.isCompanyFreightDivergent && !item.isCompanyRateDivergent) return false;
        if (filterDivergenceType === 'FREIGHT_DRIVER' && !item.isDriverFreightDivergent && !item.isDriverRateDivergent) return false;
        if (filterDivergenceType === 'WEIGHT' && !item.isWeightDivergent) return false;
        if (filterDivergenceType === 'TOLL' && !item.isTollDivergent) return false;
        if (filterDivergenceType === 'ICMS' && !item.isIcmsDivergent) return false;
        if (filterDivergenceType === 'FEDERAL_TAX' && Math.abs(item.delta.federalTax) <= tolerance) return false;
        if (filterDivergenceType === 'RESULT' && Math.abs(item.delta.netProfit) <= tolerance) return false;
      }

      // Filtro de busca
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const matchesCte = item.cteNumber.toLowerCase().includes(term) || item.cteNumberTrans.toLowerCase().includes(term) || item.cteNumberAtua.toLowerCase().includes(term);
        const matchesPlate = item.plate.toLowerCase().includes(term);
        const matchesShipment = item.shipmentId?.toLowerCase().includes(term);
        const matchesDriver = item.driverName?.toLowerCase().includes(term);
        const matchesClient = item.clientName?.toLowerCase().includes(term);
        if (!matchesCte && !matchesPlate && !matchesShipment && !matchesDriver && !matchesClient) {
          return false;
        }
      }

      return true;
    });
  }, [reconciliationItems, filterStatus, filterDivergenceType, searchTerm, tolerance]);
  // Exportação em PDF com todas as auditorias comparativas
  const handleExportPDF = () => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    addPdfLogo(doc, companyLogo, { align: 'right', y: 5, width: 35, height: 14 });

    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Relatório de Conciliação e Auditoria: Atua TMS vs. Transcunha', 14, 15);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    const periodStr = startDate && endDate ? `${startDate} a ${endDate}` : 'Todos os períodos';
    doc.text(`Período: ${periodStr} | Gerado em: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}`, 14, 21);

    const headRow = [
      'Placa',
      'Data',
      'CT-e Atua',
      'CT-e Trans',
      'Status Auditoria',
      'Frete Empr. (Trans)',
      'Frete Empr. (Atua)',
      'Tarifa Empr. (Trans/Atua)',
      'Frete Mot. (Trans)',
      'Frete Mot. (Atua)',
      'Tarifa Mot. (Trans/Atua)',
      'Peso Trans (t)',
      'Peso Atua (t)',
      'Pedágio (Trans/Atua)',
      'ICMS (Trans/Atua)'
    ];

    const tableData = filteredItems.map(item => {
      let statusText = item.status === 'CONCILIATED' ? '100% OK (Conciliado)' :
                       item.status === 'DIVERGENT' ? 'Divergente' :
                       item.status === 'ORPHAN_ATUA' ? 'Órfão no Atua' : 'Pendente Atua';

      if (item.similarMatch && item.similarMatch.similarityScore >= 60) {
        statusText += ` (Desacordo ${item.similarMatch.similarityScore}%)`;
      }

      const cteAtuaStr = item.cteNumberAtua ? `CT-e ${item.cteNumberAtua}` : '---';
      const cteTransStr = item.cteNumberTrans ? `CT-e ${item.cteNumberTrans}` : 'S/ CT-e';

      const compRateStr = (item.transcunha && item.atua)
        ? `R$ ${item.transcunha.companyRatePerTon.toFixed(2)} / ${item.atua.companyRatePerTon.toFixed(2)}`
        : (item.transcunha ? `R$ ${item.transcunha.companyRatePerTon.toFixed(2)}` : (item.atua ? `R$ ${item.atua.companyRatePerTon.toFixed(2)}` : '---'));

      const drivRateStr = (item.transcunha && item.atua)
        ? `R$ ${item.transcunha.driverRatePerTon.toFixed(2)} / ${item.atua.driverRatePerTon.toFixed(2)}`
        : (item.transcunha ? `R$ ${item.transcunha.driverRatePerTon.toFixed(2)}` : (item.atua ? `R$ ${item.atua.driverRatePerTon.toFixed(2)}` : '---'));

      const tollStr = (item.transcunha && item.atua)
        ? `R$ ${item.transcunha.toll.toFixed(2)} / ${item.atua.toll.toFixed(2)}`
        : (item.transcunha ? `R$ ${item.transcunha.toll.toFixed(2)}` : (item.atua ? `R$ ${item.atua.toll.toFixed(2)}` : '---'));

      const icmsStr = (item.transcunha && item.atua)
        ? `R$ ${item.transcunha.icms.toFixed(2)} / ${item.atua.icms.toFixed(2)}`
        : (item.transcunha ? `R$ ${item.transcunha.icms.toFixed(2)}` : (item.atua ? `R$ ${item.atua.icms.toFixed(2)}` : '---'));

      return [
        item.plate || '---',
        item.date ? new Date(item.date + 'T00:00:00').toLocaleDateString('pt-BR') : '---',
        cteAtuaStr,
        cteTransStr,
        statusText,
        item.transcunha ? `R$ ${item.transcunha.companyFreight.toFixed(2)}` : '---',
        item.atua ? `R$ ${item.atua.companyFreight.toFixed(2)}` : '---',
        compRateStr,
        item.transcunha ? `R$ ${item.transcunha.driverFreight.toFixed(2)}` : '---',
        item.atua ? `R$ ${item.atua.driverFreight.toFixed(2)}` : '---',
        drivRateStr,
        item.transcunha ? `${item.transcunha.weight.toFixed(2)} t` : '---',
        item.atua ? `${item.atua.weight.toFixed(2)} t` : '---',
        tollStr,
        icmsStr
      ];
    });

    autoTable(doc, {
      head: [headRow],
      body: tableData,
      startY: 26,
      margin: { left: 6, right: 6 },
      styles: { fontSize: 5.2, cellPadding: 1.1, halign: 'center', valign: 'middle' },
      headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      didParseCell: (data) => {
        if (data.section === 'body') {
          const rawRow = Array.isArray(data.row.raw) ? data.row.raw : [];
          const statusVal = String(rawRow[4] || '');
          if (statusVal.includes('Divergente')) {
            data.cell.styles.textColor = [185, 28, 28]; // red
          } else if (statusVal.includes('Conciliado') || statusVal.includes('100% OK')) {
            data.cell.styles.textColor = [21, 128, 61]; // green
          } else if (statusVal.includes('Órfão')) {
            data.cell.styles.textColor = [126, 34, 206]; // purple
          } else if (statusVal.includes('Pendente')) {
            data.cell.styles.textColor = [217, 119, 6]; // amber
          }
        }
      }
    });

    doc.save(`auditoria_atua_transcunha_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  // Exportação em CSV / Excel
  const handleExportCSV = () => {
    const headers = [
      'Placa',
      'Data Embarque',
      'CT-e Atua TMS',
      'CT-e Transcunha',
      'Divergencia CT-e',
      'ID Embarque Transcunha',
      'Tipo Conhecimento',
      'Status Auditoria',
      'Cliente',
      'Motorista',
      'Origem',
      'Destino',
      'Peso Transcunha (t)',
      'Peso Atua (t)',
      'Delta Peso (t)',
      'Frete Empresa Transcunha (R$)',
      'Frete Empresa Atua (R$)',
      'Delta Frete Empresa (R$)',
      'Tarifa Empresa/t Transcunha (R$/t)',
      'Tarifa Empresa/t Atua (R$/t)',
      'Delta Tarifa Empresa/t (R$/t)',
      'Frete Motorista Transcunha (R$)',
      'Frete Motorista Atua (R$)',
      'Delta Frete Motorista (R$)',
      'Tarifa Motorista/t Transcunha (R$/t)',
      'Tarifa Motorista/t Atua (R$/t)',
      'Delta Tarifa Motorista/t (R$/t)',
      'Pedagio Transcunha (R$)',
      'Pedagio Atua (R$)',
      'Delta Pedagio (R$)',
      'ICMS Transcunha (R$)',
      'ICMS Atua (R$)',
      'Delta ICMS (R$)',
      'Imposto Federal Transcunha (R$)',
      'Imposto Federal Atua (R$)',
      'Delta Imposto Federal (R$)',
      'Lucro Real Transcunha (R$)',
      'Resultado Atua (R$)',
      'Delta Lucro Real vs Resultado (R$)',
      'Possivel Desacordo / Semelhante',
      'Motivos Divergencia'
    ];

    const rows = filteredItems.map(item => {
      const similarText = (item.similarMatch && item.similarMatch.similarityScore >= 60)
        ? `Sim (Desacordo ${item.similarMatch.similarityScore}% com ${item.similarMatch.targetCte || item.similarMatch.targetPlate} - ${item.similarMatch.similarityReasons.join('; ')})`
        : 'Nao';

      const statusText = item.status === 'CONCILIATED' ? '100% OK (Conciliado)' :
                         item.status === 'DIVERGENT' ? 'Divergente' :
                         item.status === 'ORPHAN_ATUA' ? 'Orfao no Atua' : 'Pendente Atua';

      const row = [
        item.plate,
        item.date || '',
        item.cteNumberAtua || '',
        item.cteNumberTrans || '',
        item.isCteDivergent ? 'SIM' : 'NAO',
        item.shipmentId || '',
        item.isComplementary ? 'Complementar (Estadia)' : 'Original (Normal)',
        statusText,
        `"${(item.clientName || '').replace(/"/g, '""')}"`,
        `"${(item.driverName || '').replace(/"/g, '""')}"`,
        `"${(item.origin || '').replace(/"/g, '""')}"`,
        `"${(item.destination || '').replace(/"/g, '""')}"`,
        (item.transcunha?.weight || 0).toFixed(2),
        (item.atua?.weight || 0).toFixed(2),
        item.delta.weight.toFixed(2),
        (item.transcunha?.companyFreight || 0).toFixed(2),
        (item.atua?.companyFreight || 0).toFixed(2),
        item.delta.companyFreight.toFixed(2),
        (item.transcunha?.companyRatePerTon || 0).toFixed(2),
        (item.atua?.companyRatePerTon || 0).toFixed(2),
        item.delta.companyRatePerTon.toFixed(2),
        (item.transcunha?.driverFreight || 0).toFixed(2),
        (item.atua?.driverFreight || 0).toFixed(2),
        item.delta.driverFreight.toFixed(2),
        (item.transcunha?.driverRatePerTon || 0).toFixed(2),
        (item.atua?.driverRatePerTon || 0).toFixed(2),
        item.delta.driverRatePerTon.toFixed(2),
        (item.transcunha?.toll || 0).toFixed(2),
        (item.atua?.toll || 0).toFixed(2),
        item.delta.toll.toFixed(2),
        (item.transcunha?.icms || 0).toFixed(2),
        (item.atua?.icms || 0).toFixed(2),
        item.delta.icms.toFixed(2),
        (item.transcunha?.federalTax || 0).toFixed(2),
        (item.atua?.federalTax || 0).toFixed(2),
        item.delta.federalTax.toFixed(2),
        (item.transcunha?.netProfit || 0).toFixed(2),
        (item.atua?.netProfit || 0).toFixed(2),
        item.delta.netProfit.toFixed(2),
        `"${similarText.replace(/"/g, '""')}"`,
        `"${item.divergenceReasons.join(' | ').replace(/"/g, '""')}"`
      ];
      return row.join(';');
    });

    const csvContent = '\uFEFF' + [headers.join(';'), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `auditoria_atua_transcunha_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-[1600px] mx-auto min-h-screen text-slate-900 dark:text-slate-100">
      {/* CABEÇALHO */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white shadow-md shadow-indigo-500/20">
              <Scale className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
                Auditoria e Conciliação Atua TMS
                <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                  MaisFrete / CTRC
                </span>
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Confronto automatizado entre o Relatório Detalhado do CTRC (Atua) e o Lucro Real (Transcunha).
              </p>
            </div>
          </div>
        </div>

        {/* Ações Primárias */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md shadow-indigo-600/20 transition-all cursor-pointer"
          >
            <Upload className="w-4 h-4" />
            <span>Importar Arquivo Atua (PDF / Excel)</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.xlsx,.xls,.csv"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileUpload(file);
              e.target.value = '';
            }}
            className="hidden"
          />

          <button
            type="button"
            onClick={() => transcunhaFileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
            title="Importar Relatório de Lucro Real da Transcunha em PDF/Excel (Opcional)"
          >
            <Upload className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>
              {uploadedTranscunhaRecords ? `Lucro Real Carregado (${uploadedTranscunhaRecords.length})` : 'Importar Lucro Real Transcunha (Opcional)'}
            </span>
          </button>
          <input
            ref={transcunhaFileInputRef}
            type="file"
            accept=".pdf,.xlsx,.xls,.csv"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleTranscunhaFileUpload(file);
              e.target.value = '';
            }}
            className="hidden"
          />

          <button
            type="button"
            onClick={() => setIsPasteModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold border border-slate-200 dark:border-slate-700 transition-colors"
            title="Colar texto do relatório do Atua"
          >
            <FileText className="w-4 h-4" />
            <span>Colar Texto</span>
          </button>

          {reconciliationItems.length > 0 && (
            <>
              <button
                type="button"
                onClick={handleExportPDF}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 text-xs font-bold transition-colors"
                title="Exportar auditoria em PDF"
              >
                <Download className="w-4 h-4" />
                <span>PDF</span>
              </button>

              <button
                type="button"
                onClick={handleExportCSV}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-xs font-bold transition-colors"
                title="Exportar planilha Excel (CSV)"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>Excel (CSV)</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* FEEDBACK DE CARREGAMENTO OU ERRO */}
      {isParsing && (
        <div className="p-4 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 flex items-center gap-3 animate-pulse">
          <RefreshCw className="w-5 h-5 animate-spin" />
          <span className="text-sm font-semibold">Processando arquivo e decodificando linhas do CTRC do Atua...</span>
        </div>
      )}

      {parseError && (
        <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span className="text-sm font-medium">{parseError}</span>
          </div>
          <button
            type="button"
            onClick={() => setParseError(null)}
            className="text-rose-500 hover:text-rose-700 p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* STATUS DAS FONTES DE DADOS */}
      {(atuaResult || uploadedTranscunhaRecords) && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {atuaResult && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 font-semibold">
              <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600" />
              <span>Atua TMS: <strong>{uploadedFileName || 'Relatório Detalhado do CTRC'}</strong> ({atuaResult.records.length} CT-es extraídos)</span>
            </span>
          )}
          {uploadedTranscunhaRecords ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 font-semibold">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>Base Transcunha: <strong>{transcunhaFileName}</strong> ({uploadedTranscunhaRecords.length} embarques importados)</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
              <Layers className="w-3.5 h-3.5 text-slate-500" />
              <span>Base Transcunha: Embarques Online ({enrichedTranscunhaData.length} registros no período)</span>
            </span>
          )}
        </div>
      )}

      {/* CARD DE INSTRUÇÃO INICIAL SE NÃO HOUVER DADOS DO ATUA */}
      {!atuaResult && !isParsing && (
        <div className="p-8 rounded-2xl border-2 border-dashed border-indigo-200 dark:border-indigo-900/60 bg-indigo-50/30 dark:bg-indigo-950/10 flex flex-col items-center justify-center text-center">
          <div className="w-14 h-14 rounded-2xl bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mb-3">
            <GitCompare className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200 mb-1">
            Nenhum relatório do Atua importado ainda
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mb-4">
            Envie o arquivo PDF ou Excel do <strong>"Relatório Detalhado do CTRC"</strong> emitido no Atua TMS (MaisFrete) para cruzar automaticamente com os embarques da Transcunha.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md cursor-pointer inline-flex items-center gap-2"
            >
              <Upload className="w-4 h-4" />
              Selecionar Arquivo Atua (.pdf / .xlsx / .csv)
            </button>
            <button
              type="button"
              onClick={() => transcunhaFileInputRef.current?.click()}
              className="px-4 py-2.5 rounded-xl bg-white hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold border border-slate-300 dark:border-slate-700 shadow-sm cursor-pointer inline-flex items-center gap-2"
            >
              <Upload className="w-4 h-4 text-emerald-600" />
              Importar Lucro Real Transcunha (Opcional)
            </button>
            <button
              type="button"
              onClick={() => setIsPasteModalOpen(true)}
              className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold border border-slate-200 dark:border-slate-700"
            >
              <FileText className="w-4 h-4" />
              Colar Texto Manualmente
            </button>
          </div>
        </div>
      )}

      {/* PAINEL DE KPIS DA AUDITORIA */}
      {reconciliationItems.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {/* Total */}
          <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xs">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Analisado</p>
            <p className="text-xl font-black text-slate-900 dark:text-white mt-1">
              {kpis.total}
              <span className="text-[10px] font-normal text-slate-400 ml-1">conhecimentos</span>
            </p>
            <div className="w-full bg-slate-100 dark:bg-slate-700 h-1.5 rounded-full mt-2 overflow-hidden">
              <div className="bg-indigo-600 h-full rounded-full" style={{ width: '100%' }} />
            </div>
          </div>

          {/* Conciliados */}
          <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-800 border border-emerald-200 dark:border-emerald-900/50 shadow-2xs">
            <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> Conciliados (100% OK)
            </p>
            <p className="text-xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
              {kpis.conciliated}
              <span className="text-[10px] font-semibold text-emerald-500/80 ml-1">
                ({kpis.conciliatedPercent.toFixed(1)}%)
              </span>
            </p>
            <div className="w-full bg-emerald-100 dark:bg-emerald-950/60 h-1.5 rounded-full mt-2 overflow-hidden">
              <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${kpis.conciliatedPercent}%` }} />
            </div>
          </div>

          {/* Divergentes */}
          <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-800 border border-rose-200 dark:border-rose-900/50 shadow-2xs">
            <p className="text-[10px] font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> Divergentes
            </p>
            <p className="text-xl font-black text-rose-600 dark:text-rose-400 mt-1">
              {kpis.divergent}
              <span className="text-[10px] font-semibold text-rose-500/80 ml-1">
                ({kpis.total > 0 ? ((kpis.divergent / kpis.total) * 100).toFixed(1) : 0}%)
              </span>
            </p>
            <div className="w-full bg-rose-100 dark:bg-rose-950/60 h-1.5 rounded-full mt-2 overflow-hidden">
              <div className="bg-rose-500 h-full rounded-full" style={{ width: `${kpis.total > 0 ? (kpis.divergent / kpis.total) * 100 : 0}%` }} />
            </div>
          </div>

          {/* Órfãos Atua */}
          <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-800 border border-purple-200 dark:border-purple-900/50 shadow-2xs">
            <p className="text-[10px] font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400 flex items-center gap-1" title="Consta no relatório do Atua mas não foi achado no Transcunha">
              <AlertCircle className="w-3 h-3" /> Órfãos no Atua
            </p>
            <p className="text-xl font-black text-purple-600 dark:text-purple-400 mt-1">
              {kpis.orphanAtua}
              <span className="text-[10px] font-normal text-slate-400 ml-1">não cadastrados</span>
            </p>
            <p className="text-[9px] text-purple-500 dark:text-purple-400 mt-1 truncate">
              Ausentes no Transcunha
            </p>
          </div>

          {/* Pendentes Atua */}
          <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-800 border border-amber-200 dark:border-amber-900/50 shadow-2xs">
            <p className="text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 flex items-center gap-1" title="Cadastrado no Transcunha mas ausente no Atua">
              <HelpCircle className="w-3 h-3" /> Pendentes Atua
            </p>
            <p className="text-xl font-black text-amber-600 dark:text-amber-400 mt-1">
              {kpis.pendingAtua}
              <span className="text-[10px] font-normal text-slate-400 ml-1">sem retorno</span>
            </p>
            <p className="text-[9px] text-amber-500 dark:text-amber-400 mt-1 truncate">
              Não constam no Atua
            </p>
          </div>

          {/* Impacto Financeiro Líquido */}
          <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-800 border border-indigo-200 dark:border-indigo-900/50 shadow-2xs">
            <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 flex items-center gap-1">
              <DollarSign className="w-3 h-3" /> Δ Lucro / Resultado
            </p>
            <p className={`text-base font-black mt-1 ${
              kpis.sumDeltaResult > 0 ? 'text-emerald-600 dark:text-emerald-400' :
              kpis.sumDeltaResult < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-700 dark:text-slate-300'
            }`}>
              {kpis.sumDeltaResult >= 0 ? '+' : ''}R$ {kpis.sumDeltaResult.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <p className="text-[9px] text-slate-400 mt-1" title="Diferença total de Frete Empresa">
              Δ Frete: R$ {kpis.sumDeltaCompany.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </p>
          </div>
        </div>
      )}

      {/* BARRA DE FILTROS E CONTROLES */}
      <div className="p-4 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Busca Rápida */}
          <div className="relative min-w-[240px] flex-1 max-w-sm">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por Placa, CT-e, Motorista, Cliente ou ID..."
              className="w-full pl-9 pr-3 py-1.5 rounded-xl text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Filtro por Período */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 font-semibold">
              <Calendar className="w-4 h-4 text-indigo-500" />
              <span>Período:</span>
            </div>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-2.5 py-1.5 rounded-xl text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
            />
            <span className="text-xs text-slate-400">até</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-2.5 py-1.5 rounded-xl text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
            />
          </div>

          {/* Tolerâncias Configuráveis */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Tolerância de Valores (R$) */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-500 font-medium">Tol. Valor:</span>
              <div className="relative">
                <span className="absolute left-2.5 top-1.5 text-[10px] text-slate-400 font-bold">R$</span>
                <input
                  type="number"
                  step="0.05"
                  min="0"
                  value={tolerance}
                  onChange={(e) => setTolerance(parseFloat(e.target.value) || 0)}
                  title="Tolerância para valores totais de frete, pedágio e impostos"
                  className="w-18 pl-7 pr-1.5 py-1.5 rounded-xl text-xs font-mono font-bold bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
                />
              </div>
            </div>

            {/* Tolerância de Tarifa (R$/ton) */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-500 font-medium">Tol. Tarifa:</span>
              <div className="relative">
                <span className="absolute left-2 top-1.5 text-[9px] text-slate-400 font-bold">R$/t</span>
                <input
                  type="number"
                  step="0.05"
                  min="0"
                  value={rateTolerance}
                  onChange={(e) => setRateTolerance(parseFloat(e.target.value) || 0)}
                  title="Tolerância para valor do frete por tonelada"
                  className="w-18 pl-7 pr-1.5 py-1.5 rounded-xl text-xs font-mono font-bold bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
                />
              </div>
            </div>

            {/* Tolerância de Peso (t) */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-500 font-medium">Tol. Peso:</span>
              <div className="relative">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={weightTolerance}
                  onChange={(e) => setWeightTolerance(parseFloat(e.target.value) || 0)}
                  title="Tolerância para peso carregado em toneladas"
                  className="w-16 px-2 py-1.5 rounded-xl text-xs font-mono font-bold bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-center"
                />
                <span className="text-[10px] text-slate-400 font-bold ml-1">t</span>
              </div>
            </div>
          </div>

          {/* Alternador de Modo de Visualização */}
          <div className="flex items-center rounded-xl bg-slate-100 dark:bg-slate-900 p-0.5 border border-slate-200 dark:border-slate-700 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setViewMode('side-by-side')}
              className={`px-3 py-1 rounded-lg transition-colors cursor-pointer ${
                viewMode === 'side-by-side'
                  ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-2xs font-bold'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              Lado a Lado
            </button>
            <button
              type="button"
              onClick={() => setViewMode('compact')}
              className={`px-3 py-1 rounded-lg transition-colors cursor-pointer ${
                viewMode === 'compact'
                  ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-2xs font-bold'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              Diferenças (Δ)
            </button>
          </div>
        </div>

        {/* Linha 2 de Filtros Rápidos de Status */}
        <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100 dark:border-slate-700/60">
          <span className="text-xs text-slate-400 font-bold mr-1">Filtrar por:</span>
          
          <button
            type="button"
            onClick={() => setFilterStatus('ALL')}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
              filterStatus === 'ALL'
                ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                : 'bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
            }`}
          >
            Todos ({reconciliationItems.length})
          </button>

          <button
            type="button"
            onClick={() => setFilterStatus('DIVERGENT')}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
              filterStatus === 'DIVERGENT'
                ? 'bg-rose-600 text-white shadow-xs'
                : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 hover:bg-rose-100 border border-rose-200/50'
            }`}
          >
            <AlertTriangle className="w-3 h-3" />
            Divergentes ({kpis.divergent})
          </button>

          <button
            type="button"
            onClick={() => setFilterStatus('CONCILIATED')}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
              filterStatus === 'CONCILIATED'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 border border-emerald-200/50'
            }`}
          >
            <CheckCircle2 className="w-3 h-3" />
            Conciliados ({kpis.conciliated})
          </button>

          <button
            type="button"
            onClick={() => setFilterStatus('ORPHAN_ATUA')}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
              filterStatus === 'ORPHAN_ATUA'
                ? 'bg-purple-600 text-white shadow-xs'
                : 'bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 hover:bg-purple-100 border border-purple-200/50'
            }`}
          >
            <AlertCircle className="w-3 h-3" />
            Órfãos Atua ({kpis.orphanAtua})
          </button>

          <button
            type="button"
            onClick={() => setFilterStatus('PENDING_ATUA')}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
              filterStatus === 'PENDING_ATUA'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 hover:bg-amber-100 border border-amber-200/50'
            }`}
          >
            <HelpCircle className="w-3 h-3" />
            Pendentes Atua ({kpis.pendingAtua})
          </button>

          {kpis.similarCount > 0 && (
            <button
              type="button"
              onClick={() => setFilterStatus(filterStatus === 'SIMILAR' ? 'ALL' : 'SIMILAR')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                filterStatus === 'SIMILAR'
                  ? 'bg-cyan-600 text-white shadow-xs'
                  : 'bg-cyan-50 dark:bg-cyan-950/40 text-cyan-700 dark:text-cyan-300 hover:bg-cyan-100 border border-cyan-200/50'
              }`}
              title="Embarques órfãos no Atua e pendentes na Transcunha com forte probabilidade de desacordo de CT-e ou reemissão"
            >
              <RefreshCw className="w-3 h-3 text-cyan-600 dark:text-cyan-400" />
              Possível Desacordo ({kpis.similarCount})
            </button>
          )}

          {/* Filtro por Tipo de Divergência específica */}
          {kpis.divergent > 0 && (
            <div className="ml-auto flex items-center gap-1.5">
              <span className="text-[11px] text-slate-400 font-medium">Motivo de Divergência:</span>
              <select
                value={filterDivergenceType}
                onChange={(e) => setFilterDivergenceType(e.target.value)}
                className="px-2 py-1 rounded-lg text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-medium"
              >
                <option value="ALL">Todas as Divergências</option>
                <option value="CTE">Divergência Número de CT-e ({kpis.divergentCte})</option>
                <option value="FREIGHT_COMPANY">Divergência Frete Empresa ({kpis.divergentCompanyFreight})</option>
                <option value="FREIGHT_DRIVER">Divergência Frete Motorista ({kpis.divergentDriverFreight})</option>
                <option value="WEIGHT">Divergência Peso Toneladas ({kpis.divergentWeight})</option>
                <option value="TOLL">Divergência Pedágio ({kpis.divergentToll})</option>
                <option value="ICMS">Divergência ICMS ({kpis.divergentIcms})</option>
              </select>
            </div>
          )}
        </div>
      </div>

      {/* TABELA DE AUDITORIA COMPARATIVA */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden w-full">
        <div className="overflow-x-auto w-full">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-900/70 text-slate-600 dark:text-slate-400 font-bold border-b dark:border-slate-700 uppercase tracking-wider text-[10px]">
              <tr>
                <th className="py-2.5 px-3">Placa / Data</th>
                <th className="py-2.5 px-2">CT-e (Atua vs Trans)</th>
                <th className="py-2.5 px-2">Cliente / Trajeto</th>
                <th className="py-2.5 px-2 text-center">Status</th>
                <th className="py-2.5 px-2 text-right font-bold">Peso Carregado (t)</th>
                <th className="py-2.5 px-2 text-right">Frete Empr. (Tot & R$/t)</th>
                <th className="py-2.5 px-2 text-right">Frete Mot. (Tot & R$/t)</th>
                <th className="py-2.5 px-2 text-right">Pedágio</th>
                <th className="py-2.5 px-2 text-right">ICMS</th>
                <th className="py-2.5 px-3 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {filteredItems.length > 0 ? (
                filteredItems.map(item => {
                  const isExpanded = expandedItemId === item.id;

                  return (
                    <React.Fragment key={item.id}>
                      <tr className={`transition-colors ${
                        item.status === 'DIVERGENT' ? 'bg-rose-50/20 dark:bg-rose-950/10 hover:bg-rose-50/40 dark:hover:bg-rose-950/20' :
                        item.status === 'CONCILIATED' ? 'hover:bg-slate-50/60 dark:hover:bg-slate-700/30' :
                        item.status === 'ORPHAN_ATUA' ? 'bg-purple-50/30 dark:bg-purple-950/15 hover:bg-purple-50/50' :
                        'bg-amber-50/30 dark:bg-amber-950/15 hover:bg-amber-50/50'
                      }`}>
                        {/* 1. Placa / Data */}
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <span className="font-mono font-bold text-slate-900 dark:text-white text-xs">
                            {item.plate || '---'}
                          </span>
                          <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium mt-0.5">
                            {item.date ? new Date(item.date + 'T00:00:00').toLocaleDateString('pt-BR') : '---'}
                          </p>
                          {item.shipmentId && (
                            <p className="text-[9px] font-mono text-indigo-600 dark:text-indigo-400 mt-0.5">
                              ID: {item.shipmentId}
                            </p>
                          )}
                        </td>

                        {/* 2. CT-e (Atua vs Transcunha) */}
                        <td className="py-2.5 px-2 whitespace-nowrap">
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[9px] font-bold text-slate-400">Atua:</span>
                              <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                                {item.cteNumberAtua ? `CT-e ${item.cteNumberAtua}` : '---'}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-[9px] font-bold text-slate-400">Trans:</span>
                              <span className={`font-mono font-bold ${
                                item.isCteDivergent ? 'text-rose-600 dark:text-rose-400' : 'text-slate-700 dark:text-slate-300'
                              }`}>
                                {item.cteNumberTrans ? `CT-e ${item.cteNumberTrans}` : 'S/ CT-e'}
                              </span>
                            </div>
                            {item.isCteDivergent && item.status !== 'ORPHAN_ATUA' && item.status !== 'PENDING_ATUA' && (
                              <span className="inline-block text-[8px] font-extrabold px-1.5 py-0.2 rounded bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-300">
                                CT-e Divergente
                              </span>
                            )}
                          </div>
                        </td>

                        {/* 3. Cliente / Trajeto */}
                        <td className="py-2.5 px-2 max-w-[130px] xl:max-w-[180px]">
                          <p className="font-semibold text-slate-900 dark:text-white truncate" title={item.clientName}>
                            {item.clientName || '---'}
                          </p>
                          <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate" title={`${item.origin} → ${item.destination}`}>
                            {item.origin || '---'} → {item.destination || '---'}
                          </p>
                        </td>

                        {/* 4. Status */}
                        <td className="py-2.5 px-2 text-center whitespace-nowrap">
                          {item.status === 'CONCILIATED' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                              <CheckCircle2 className="w-2.5 h-2.5" /> 100% OK (Conciliado)
                            </span>
                          ) : item.status === 'DIVERGENT' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                              <AlertTriangle className="w-2.5 h-2.5" /> Divergente
                            </span>
                          ) : item.status === 'ORPHAN_ATUA' ? (
                            <div className="flex flex-col items-center gap-1">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300 border border-purple-200 dark:border-purple-800" title="Consta no Atua mas placa/data não foi encontrada no Transcunha">
                                <AlertCircle className="w-2.5 h-2.5" /> Órfão Atua
                              </span>
                              {item.similarMatch && item.similarMatch.similarityScore >= 60 && (
                                <button
                                  type="button"
                                  onClick={() => setExpandedItemId(item.id)}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[8.5px] font-black bg-cyan-100 text-cyan-800 dark:bg-cyan-950/60 dark:text-cyan-300 border border-cyan-300 hover:bg-cyan-200 transition-colors cursor-pointer shadow-xs"
                                  title={item.similarMatch.similarityReasons.join(' • ')}
                                >
                                  <span>🔄 Desacordo? ({item.similarMatch.similarityScore}%)</span>
                                </button>
                              )}
                            </div>
                          ) : (
                            <div className="flex flex-col items-center gap-1">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800" title="Cadastrado no Transcunha mas ausente no Atua">
                                <HelpCircle className="w-2.5 h-2.5" /> Pendente Atua
                              </span>
                              {item.similarMatch && item.similarMatch.similarityScore >= 60 && (
                                <button
                                  type="button"
                                  onClick={() => setExpandedItemId(item.id)}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[8.5px] font-black bg-cyan-100 text-cyan-800 dark:bg-cyan-950/60 dark:text-cyan-300 border border-cyan-300 hover:bg-cyan-200 transition-colors cursor-pointer shadow-xs"
                                  title={item.similarMatch.similarityReasons.join(' • ')}
                                >
                                  <span>🔄 Desacordo? ({item.similarMatch.similarityScore}%)</span>
                                </button>
                              )}
                            </div>
                          )}
                        </td>

                        {/* 5. Peso Carregado em Toneladas */}
                        <td className="py-2.5 px-2 text-right font-mono whitespace-nowrap">
                          <div>
                            <span className="font-semibold text-slate-800 dark:text-slate-200">
                              {item.transcunha ? `${item.transcunha.weight.toFixed(2)} t` : '---'}
                            </span>
                            <span className="text-slate-400 mx-1">/</span>
                            <span className="font-semibold text-slate-800 dark:text-slate-200">
                              {item.atua ? `${item.atua.weight.toFixed(2)} t` : '---'}
                            </span>
                          </div>
                          {item.isWeightDivergent && (
                            <p className="text-[9px] font-bold text-rose-600">
                              Δ {item.delta.weight > 0 ? '+' : ''}{item.delta.weight.toFixed(2)} t
                            </p>
                          )}
                        </td>

                        {/* 6. Frete Empresa (Total e R$/ton) */}
                        <td className="py-2.5 px-2 text-right font-mono whitespace-nowrap">
                          {/* Totais */}
                          <div>
                            <span className="text-[9px] text-slate-400 mr-1">Tot:</span>
                            <span className="font-semibold text-slate-800 dark:text-slate-200">
                              R$ {(item.transcunha?.companyFreight ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </span>
                            <span className="text-slate-400 mx-0.5">/</span>
                            <span className="font-semibold text-slate-800 dark:text-slate-200">
                              R$ {(item.atua?.companyFreight ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                          {/* Tarifas */}
                          <div className="text-[10px] text-slate-500">
                            <span className="text-[9px] text-slate-400 mr-1">R$/t:</span>
                            <span>{item.transcunha?.companyRatePerTon ? `R$ ${item.transcunha.companyRatePerTon.toFixed(2)}` : '---'}</span>
                            <span className="text-slate-400 mx-0.5">/</span>
                            <span>{item.atua?.companyRatePerTon ? `R$ ${item.atua.companyRatePerTon.toFixed(2)}` : '---'}</span>
                          </div>
                          {(item.isCompanyFreightDivergent || item.isCompanyRateDivergent) ? (
                            <p className="text-[9px] font-bold text-rose-600">
                              {item.isCompanyFreightDivergent && `Δ Tot: R$ ${item.delta.companyFreight.toFixed(2)} `}
                              {item.isCompanyRateDivergent && `| Δ Tar: R$ ${item.delta.companyRatePerTon.toFixed(2)}/t`}
                            </p>
                          ) : item.isCompanyFreightReconciledByToll ? (
                            <p className="text-[9px] font-medium text-emerald-600 dark:text-emerald-400">
                              ✓ Conciliado c/ Pedágio
                            </p>
                          ) : null}
                        </td>

                        {/* 7. Frete Motorista (Total e R$/ton) */}
                        <td className="py-2.5 px-2 text-right font-mono whitespace-nowrap">
                          {/* Totais */}
                          <div>
                            <span className="text-[9px] text-slate-400 mr-1">Tot:</span>
                            <span className="font-semibold text-slate-800 dark:text-slate-200">
                              R$ {(item.transcunha?.driverFreight ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </span>
                            <span className="text-slate-400 mx-0.5">/</span>
                            <span className="font-semibold text-slate-800 dark:text-slate-200">
                              R$ {(item.atua?.driverFreight ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                          {/* Tarifas */}
                          <div className="text-[10px] text-slate-500">
                            <span className="text-[9px] text-slate-400 mr-1">R$/t:</span>
                            <span>{item.transcunha?.driverRatePerTon ? `R$ ${item.transcunha.driverRatePerTon.toFixed(2)}` : '---'}</span>
                            <span className="text-slate-400 mx-0.5">/</span>
                            <span>{item.atua?.driverRatePerTon ? `R$ ${item.atua.driverRatePerTon.toFixed(2)}` : '---'}</span>
                          </div>
                          {(item.isDriverFreightDivergent || item.isDriverRateDivergent) ? (
                            <p className="text-[9px] font-bold text-rose-600">
                              {item.isDriverFreightDivergent && `Δ Tot: R$ ${item.delta.driverFreight.toFixed(2)} `}
                              {item.isDriverRateDivergent && `| Δ Tar: R$ ${item.delta.driverRatePerTon.toFixed(2)}/t`}
                            </p>
                          ) : item.isDriverFreightReconciledByToll ? (
                            <p className="text-[9px] font-medium text-emerald-600 dark:text-emerald-400">
                              ✓ Conciliado c/ Pedágio
                            </p>
                          ) : null}
                        </td>

                        {/* 8. Pedágio */}
                        <td className="py-2.5 px-2 text-right font-mono whitespace-nowrap">
                          <div>
                            <span className="text-slate-800 dark:text-slate-200">
                              R$ {(item.transcunha?.toll ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </span>
                            <span className="text-slate-400 mx-0.5">/</span>
                            <span className="text-slate-800 dark:text-slate-200">
                              R$ {(item.atua?.toll ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                          {item.isTollDivergent && (
                            <p className="text-[9px] font-bold text-rose-600">
                              Δ R$ {item.delta.toll.toFixed(2)}
                            </p>
                          )}
                        </td>

                        {/* 9. ICMS */}
                        <td className="py-2.5 px-2 text-right font-mono whitespace-nowrap">
                          <div>
                            <span className="text-slate-800 dark:text-slate-200">
                              R$ {(item.transcunha?.icms ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </span>
                            <span className="text-slate-400 mx-0.5">/</span>
                            <span className="text-slate-800 dark:text-slate-200">
                              R$ {(item.atua?.icms ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                          {item.isIcmsDivergent && (
                            <p className="text-[9px] font-bold text-rose-600">
                              Δ R$ {item.delta.icms.toFixed(2)}
                            </p>
                          )}
                        </td>

                        {/* 10. Ações */}
                        <td className="py-2.5 px-3 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={() => setExpandedItemId(isExpanded ? null : item.id)}
                              className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 hover:text-slate-800 transition-colors"
                              title="Expandir auditoria dos 6 pilares"
                            >
                              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </button>

                            {item.shipment && onOpenShipmentDetail && (
                              <button
                                type="button"
                                onClick={() => onOpenShipmentDetail(item.shipment!)}
                                className="p-1 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 transition-colors"
                                title="Abrir dados do embarque no Transcunha"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>

                      {/* LINHA EXPANDIDA COM AUDITORIA DETALHADA DOS 6 PILARES */}
                      {isExpanded && (
                        <tr className="bg-slate-50/90 dark:bg-slate-900/80 text-xs">
                          <td colSpan={10} className="p-4 border-l-4 border-l-indigo-500">
                            <div className="space-y-4">
                              {/* Título e Identificação */}
                              <div className="flex flex-wrap items-center justify-between border-b dark:border-slate-700 pb-2">
                                <div className="flex items-center gap-2">
                                  <FileText className="w-4 h-4 text-indigo-600" />
                                  <span className="font-bold text-slate-800 dark:text-slate-100">
                                    Auditoria Detalhada de Valores: Placa {item.plate} ({item.date || 's/ data'})
                                  </span>
                                </div>
                                <div className="text-[11px] text-slate-500 flex items-center gap-3">
                                  <span>ID Embarque: <strong>{item.shipmentId || '---'}</strong></span>
                                  <span>Motorista: <strong>{item.driverName || '---'}</strong></span>
                                  <span>Cliente: <strong>{item.clientName || '---'}</strong></span>
                                </div>
                              </div>

                              {/* ALERTA DE SEMELHANÇA HEURÍSTICA / POSSÍVEL DESACORDO DE CT-E */}
                              {item.similarMatch && (
                                <div className="p-3.5 rounded-xl bg-cyan-50 dark:bg-cyan-950/30 border border-cyan-200 dark:border-cyan-800">
                                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                                    <div className="flex items-center gap-2">
                                      <RefreshCw className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                                      <span className="font-bold text-xs text-cyan-950 dark:text-cyan-100">
                                        Detecção de Desacordo Comercial / CT-e Reemitido no Atua
                                      </span>
                                    </div>
                                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-cyan-600 text-white shadow-xs">
                                      {item.similarMatch.similarityScore}% de Correspondência
                                    </span>
                                  </div>

                                  <p className="text-[11px] text-cyan-900 dark:text-cyan-200 mb-2 leading-relaxed">
                                    {item.status === 'ORPHAN_ATUA' ? (
                                      <>
                                        Este CT-e <strong>{item.cteNumberAtua}</strong> do Atua possui dados idênticos/semelhantes ao embarque registrado no Transcunha (Placa <strong>{item.similarMatch.targetPlate}</strong>, CT-e anterior: <strong>{item.similarMatch.targetCte || 'S/ CT-e'}</strong>, Data: <strong>{item.similarMatch.targetDate ? new Date(item.similarMatch.targetDate + 'T00:00:00').toLocaleDateString('pt-BR') : 's/ data'}</strong>).
                                        Isso indica que o CT-e original sofreu desacordo comercial ou cancelamento e foi gerado um novo CT-e na plataforma Atua que não foi atualizado no Transcunha.
                                      </>
                                    ) : (
                                      <>
                                        Este embarque na Transcunha (Placa <strong>{item.plate}</strong>, CT-e: <strong>{item.cteNumberTrans || 'S/ CT-e'}</strong>) foi cruzado com o CT-e <strong>{item.similarMatch.targetCte}</strong> constante no relatório do Atua (Placa <strong>{item.similarMatch.targetPlate}</strong>, Data Atua: <strong>{item.similarMatch.targetDate ? new Date(item.similarMatch.targetDate + 'T00:00:00').toLocaleDateString('pt-BR') : 's/ data'}</strong>).
                                        Forte probabilidade de nova numeração gerada no Atua por motivo de desacordo.
                                      </>
                                    )}
                                  </p>

                                  <div className="bg-white/80 dark:bg-slate-900/60 rounded-lg p-2.5 border border-cyan-200/60 dark:border-cyan-800/60">
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-cyan-800 dark:text-cyan-300 mb-1">
                                      Evidências do Cruzamento de Dados:
                                    </p>
                                    <ul className="list-disc list-inside text-[11px] text-slate-700 dark:text-slate-300 space-y-0.5">
                                      {item.similarMatch.similarityReasons.map((reason, idx) => (
                                        <li key={idx} className="font-medium">{reason}</li>
                                      ))}
                                    </ul>
                                  </div>
                                </div>
                              )}

                              {/* Grid dos 6 Pilares de Auditoria */}
                              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5">
                                {/* 1. CT-e */}
                                <div className={`p-2.5 rounded-xl border ${item.isCteDivergent ? 'bg-rose-50/50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'}`}>
                                  <p className="text-[9px] uppercase font-bold text-slate-400">1. CT-e</p>
                                  <p className="text-[11px] font-mono mt-1">
                                    <span className="text-slate-500">Atua:</span> <strong>{item.cteNumberAtua ? `CT-e ${item.cteNumberAtua}` : '---'}</strong>
                                  </p>
                                  <p className="text-[11px] font-mono">
                                    <span className="text-slate-500">Trans:</span> <strong>{item.cteNumberTrans ? `CT-e ${item.cteNumberTrans}` : 'S/ CT-e'}</strong>
                                  </p>
                                  <p className={`text-[10px] font-bold mt-1 ${item.isCteDivergent ? 'text-rose-600' : 'text-emerald-600'}`}>
                                    {item.isCteDivergent ? '⚠️ Divergente' : '✓ Confere'}
                                  </p>
                                </div>

                                {/* 2. Frete Empresa */}
                                <div className={`p-2.5 rounded-xl border ${(item.isCompanyFreightDivergent || item.isCompanyRateDivergent) ? 'bg-rose-50/50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'}`}>
                                  <p className="text-[9px] uppercase font-bold text-slate-400">2. Frete Empresa</p>
                                  <p className="text-[10px] font-mono mt-1">
                                    <span className="text-slate-500">Trans:</span> R$ {item.transcunha?.companyFreight.toFixed(2) || '0.00'}
                                    <br /><span className="text-[9px] text-slate-400 font-sans">({item.transcunha?.companyRatePerTon.toFixed(2) || '0.00'}/t)</span>
                                  </p>
                                  <p className="text-[10px] font-mono mt-0.5">
                                    <span className="text-slate-500">Atua:</span> R$ {item.atua?.companyFreight.toFixed(2) || '0.00'}
                                    <br /><span className="text-[9px] text-slate-400 font-sans">({item.atua?.companyRatePerTon.toFixed(2) || '0.00'}/t)</span>
                                  </p>
                                  <p className={`text-[10px] font-bold mt-1 ${(item.isCompanyFreightDivergent || item.isCompanyRateDivergent) ? 'text-rose-600' : 'text-emerald-600'}`}>
                                    {(item.isCompanyFreightDivergent || item.isCompanyRateDivergent) 
                                      ? `Δ R$ ${item.delta.companyFreight.toFixed(2)}` 
                                      : item.isCompanyFreightReconciledByToll 
                                        ? '✓ Conciliado c/ Pedágio' 
                                        : '✓ Confere'}
                                  </p>
                                </div>

                                {/* 3. Frete Motorista */}
                                <div className={`p-2.5 rounded-xl border ${(item.isDriverFreightDivergent || item.isDriverRateDivergent) ? 'bg-rose-50/50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'}`}>
                                  <p className="text-[9px] uppercase font-bold text-slate-400">3. Frete Motorista</p>
                                  <p className="text-[10px] font-mono mt-1">
                                    <span className="text-slate-500">Trans:</span> R$ {item.transcunha?.driverFreight.toFixed(2) || '0.00'}
                                    <br /><span className="text-[9px] text-slate-400 font-sans">({item.transcunha?.driverRatePerTon.toFixed(2) || '0.00'}/t)</span>
                                  </p>
                                  <p className="text-[10px] font-mono mt-0.5">
                                    <span className="text-slate-500">Atua:</span> R$ {item.atua?.driverFreight.toFixed(2) || '0.00'}
                                    <br /><span className="text-[9px] text-slate-400 font-sans">({item.atua?.driverRatePerTon.toFixed(2) || '0.00'}/t)</span>
                                  </p>
                                  <p className={`text-[10px] font-bold mt-1 ${(item.isDriverFreightDivergent || item.isDriverRateDivergent) ? 'text-rose-600' : 'text-emerald-600'}`}>
                                    {(item.isDriverFreightDivergent || item.isDriverRateDivergent) 
                                      ? `Δ R$ ${item.delta.driverFreight.toFixed(2)}` 
                                      : item.isDriverFreightReconciledByToll 
                                        ? '✓ Conciliado c/ Pedágio' 
                                        : '✓ Confere'}
                                  </p>
                                </div>

                                {/* 4. Peso Toneladas */}
                                <div className={`p-2.5 rounded-xl border ${item.isWeightDivergent ? 'bg-rose-50/50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'}`}>
                                  <p className="text-[9px] uppercase font-bold text-slate-400">4. Peso (t)</p>
                                  <p className="text-[11px] font-mono mt-1">
                                    <span className="text-slate-500">Trans:</span> {item.transcunha?.weight.toFixed(2) || '0.00'} t
                                  </p>
                                  <p className="text-[11px] font-mono">
                                    <span className="text-slate-500">Atua:</span> {item.atua?.weight.toFixed(2) || '0.00'} t
                                  </p>
                                  <p className={`text-[10px] font-bold mt-1 ${item.isWeightDivergent ? 'text-rose-600' : 'text-emerald-600'}`}>
                                    {item.isWeightDivergent ? `Δ ${item.delta.weight.toFixed(2)} t` : '✓ Confere'}
                                  </p>
                                </div>

                                {/* 5. Pedágio */}
                                <div className={`p-2.5 rounded-xl border ${item.isTollDivergent ? 'bg-rose-50/50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'}`}>
                                  <p className="text-[9px] uppercase font-bold text-slate-400">5. Pedágio</p>
                                  <p className="text-[11px] font-mono mt-1">
                                    <span className="text-slate-500">Trans:</span> R$ {item.transcunha?.toll.toFixed(2) || '0.00'}
                                  </p>
                                  <p className="text-[11px] font-mono">
                                    <span className="text-slate-500">Atua:</span> R$ {item.atua?.toll.toFixed(2) || '0.00'}
                                  </p>
                                  <p className={`text-[10px] font-bold mt-1 ${item.isTollDivergent ? 'text-rose-600' : 'text-emerald-600'}`}>
                                    {item.isTollDivergent ? `Δ R$ ${item.delta.toll.toFixed(2)}` : '✓ Confere'}
                                  </p>
                                </div>

                                {/* 6. ICMS */}
                                <div className={`p-2.5 rounded-xl border ${item.isIcmsDivergent ? 'bg-rose-50/50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'}`}>
                                  <p className="text-[9px] uppercase font-bold text-slate-400">6. ICMS</p>
                                  <p className="text-[11px] font-mono mt-1">
                                    <span className="text-slate-500">Trans:</span> R$ {item.transcunha?.icms.toFixed(2) || '0.00'}
                                  </p>
                                  <p className="text-[11px] font-mono">
                                    <span className="text-slate-500">Atua:</span> R$ {item.atua?.icms.toFixed(2) || '0.00'}
                                  </p>
                                  <p className={`text-[10px] font-bold mt-1 ${item.isIcmsDivergent ? 'text-rose-600' : 'text-emerald-600'}`}>
                                    {item.isIcmsDivergent ? `Δ R$ ${item.delta.icms.toFixed(2)}` : '✓ Confere'}
                                  </p>
                                </div>
                              </div>

                              {/* Diagnóstico Geral e Apontamentos */}
                              <div className="p-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                                <p className="font-bold text-slate-800 dark:text-slate-200 text-xs mb-1.5 flex items-center gap-1.5">
                                  <AlertCircle className="w-3.5 h-3.5 text-indigo-500" />
                                  Apontamentos e Diagnóstico da Auditoria
                                </p>
                                {item.divergenceReasons.length > 0 ? (
                                  <ul className="list-disc list-inside text-[11px] text-rose-600 dark:text-rose-400 space-y-1 font-medium">
                                    {item.divergenceReasons.map((reason, rIdx) => (
                                      <li key={rIdx}>{reason}</li>
                                    ))}
                                  </ul>
                                ) : (
                                  <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                                    <Check className="w-3.5 h-3.5" />
                                    Conformidade absoluta: Placa, CT-e, Frete Empresa, Frete Motorista, Peso, Pedágio e ICMS coincidem dentro das tolerâncias.
                                  </p>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-400">
                    <Scale className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    Nenhum registro encontrado para os filtros selecionados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL PARA COLAR TEXTO MANUALMENTE */}
      {isPasteModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 max-w-2xl w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b dark:border-slate-700 pb-3">
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <FileText className="w-5 h-5 text-indigo-600" />
                Colar Texto do Relatório do Atua TMS
              </h3>
              <button
                type="button"
                onClick={() => setIsPasteModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400">
              Copie as linhas do <strong>"Relatório Detalhado do CTRC"</strong> diretamente do leitor de PDF ou página web e cole no campo abaixo. O leitor decodificará automaticamente o número do CT-e, placa, frete empresa, frete motorista, pedágio e impostos.
            </p>

            <textarea
              rows={8}
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder="Cole aqui o texto copiado do relatório..."
              className="w-full p-3 rounded-xl text-xs font-mono bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
            />

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsPasteModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleProcessPaste}
                disabled={!pasteText.trim()}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-md disabled:opacity-50 cursor-pointer"
              >
                Processar Texto
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AtuaReconciliationPage;
