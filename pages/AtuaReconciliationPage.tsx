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
  ChevronUp,
  FileWarning,
  Ban,
  Trash2,
  Building2,
  Truck
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Shipment, Cargo, Client, Driver, Vehicle, User, Branch } from '../types';
import { UserProfile, FreightCalculationType } from '../types';
import { 
  getShipmentCte, 
  getShipmentEffectiveDate, 
  getShipmentCteEmissionDate as getUtilsCteEmissionDate,
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
  arePlatesMatching,
  normalizeDate 
} from '../utils/atuaReportParser';

// Tabela oficial do IBGE para os 2 primeiros dígitos da Chave de Acesso do CT-e
const IBGE_UF_MAP: Record<string, string> = {
  '11': 'RO', '12': 'AC', '13': 'AM', '14': 'RR', '15': 'PA', '16': 'AP', '17': 'TO',
  '21': 'MA', '22': 'PI', '23': 'CE', '24': 'RN', '25': 'PB', '26': 'PE', '27': 'AL', '28': 'SE', '29': 'BA',
  '31': 'MG', '32': 'ES', '33': 'RJ', '35': 'SP',
  '41': 'PR', '42': 'SC', '43': 'RS',
  '50': 'MS', '51': 'MT', '52': 'GO', '53': 'DF'
};

const VALID_BRAZILIAN_UFS = new Set([
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 
  'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 
  'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'
]);

const detectUfFromLocation = (text: string): string => {
  if (!text) return '';
  const clean = text.trim();
  const match = clean.match(/(?:-|\/|\s|,)\s*([A-Za-z]{2})\s*$/i);
  if (match) {
    const uf = match[1].toUpperCase();
    if (VALID_BRAZILIAN_UFS.has(uf)) {
      return uf;
    }
  }
  const upper = clean.toUpperCase();
  if (upper.includes('LUZIANIA') || upper.includes('CRISTALINA') || upper.includes('FORMOSA') || upper.includes('RIO VERDE') || upper.includes('GOIANIA') || upper.includes('ANAPOLIS') || upper.includes('JATAI') || upper.includes('ITUMBIARA') || upper.includes('CATALAO') || upper.includes('MINEIROS')) {
    return 'GO';
  }
  if (upper.includes('CASTILHO') || upper.includes('PONTES GESTAL') || upper.includes('SAO PAULO') || upper.includes('SANTOS') || upper.includes('BARRETOS') || upper.includes('CAMPINAS') || upper.includes('ORLANDIA')) {
    return 'SP';
  }
  if (upper.includes('UBERLANDIA') || upper.includes('UBERABA') || upper.includes('PRATAPOLIS') || upper.includes('CONTAGEM') || upper.includes('ARAGUARI') || upper.includes('PATOS DE MINAS') || upper.includes('NOVA PONTE') || upper.includes('SANTA LUZIA') || upper.includes('MONTE BELO') || upper.includes('ITUIUTABA')) {
    return 'MG';
  }
  if (upper.includes('GURUPI') || upper.includes('PEDRO AFONSO') || upper.includes('PALMAS') || upper.includes('ARAGUAINA')) {
    return 'TO';
  }
  if (upper.includes('RONDONOPOLIS') || upper.includes('CUIABA') || upper.includes('SINOP') || upper.includes('SORRISO') || upper.includes('NOVA MUTUM') || upper.includes('ARUANA')) {
    return 'MT';
  }
  if (upper.includes('PARANAGUA') || upper.includes('CURITIBA') || upper.includes('MARINGA') || upper.includes('LONDRINA')) {
    return 'PR';
  }
  return '';
};

// Helper para detectar a UF e Filial da emissão fiscal do embarque no Transcunha
const detectShipmentUf = (
  shipment: Shipment,
  cargo?: Cargo,
  branchMap?: Map<string, Branch>
): { uf: string; branchName: string } => {
  // 1. Chave de acesso do CT-e (44 dígitos - os 2 primeiros são o código IBGE do estado emissor)
  const docs = shipment.documents || {};
  const accessKey = String(
    docs.cte_access_key || 
    docs.accessKey || 
    docs.chave_acesso || 
    docs.chaveCte || 
    docs.cteKey || 
    docs.chaveAcesso || 
    (shipment as any).cteAccessKey || 
    ''
  ).replace(/[^0-9]/g, '');

  if (accessKey.length >= 2) {
    const ibgePrefix = accessKey.slice(0, 2);
    if (IBGE_UF_MAP[ibgePrefix]) {
      return { uf: IBGE_UF_MAP[ibgePrefix], branchName: '' };
    }
  }

  // 2. Origem do Embarque ou da Carga (Regra Tributária Oficial: local de início da prestação define a UF de emissão do CT-e)
  const originText = (cargo?.origin || (shipment as any).origin || '').trim();
  if (originText) {
    const ufFromOrigin = detectUfFromLocation(originText);
    if (ufFromOrigin) {
      return { uf: ufFromOrigin, branchName: originText };
    }
  }

  // 3. Destino do Embarque ou Carga
  const destText = (cargo?.destination || (shipment as any).destination || '').trim();
  if (destText) {
    const ufFromDest = detectUfFromLocation(destText);
    if (ufFromDest) {
      return { uf: ufFromDest, branchName: destText };
    }
  }

  // 4. Filial vinculada ao embarque ou à carga (branchId)
  const branchId = shipment.branchId || (shipment as any).filialId || cargo?.branchId;
  if (branchId && branchMap?.has(branchId)) {
    const branch = branchMap.get(branchId);
    if (branch) {
      const st = (branch.state || '').trim().toUpperCase();
      if (VALID_BRAZILIAN_UFS.has(st)) {
        return { uf: st, branchName: branch.name || '' };
      }
    }
  }

  // 5. Mapeamento por correspondência de nome ou cidade da filial
  if (branchMap && branchMap.size > 0 && originText) {
    const lowerOrigin = originText.toLowerCase();
    for (const b of branchMap.values()) {
      const bName = (b.name || '').toLowerCase();
      const bCity = (b.city || '').toLowerCase();
      if ((bName && lowerOrigin.includes(bName)) || (bCity && lowerOrigin.includes(bCity))) {
        const st = (b.state || '').trim().toUpperCase();
        if (VALID_BRAZILIAN_UFS.has(st)) {
          return { uf: st, branchName: b.name };
        }
      }
    }
  }

  return { uf: '', branchName: '' };
};

// Helper para detectar a UF e Filial do registro no relatório Atua TMS
const detectAtuaRecordUf = (
  rec: AtuaCteRecord
): { uf: string; branchName: string; originUf: string } => {
  let originUf = detectUfFromLocation(rec.originCity || '');
  let destUf = detectUfFromLocation(rec.destinationCity || '');
  const routeUf = originUf || destUf || '';

  // 1. Extração prioritária pelo campo de filial emissora do Atua (rec.branch)
  const branchText = (rec.branch || '').trim();
  if (branchText && branchText.toUpperCase() !== 'TRANSCUNHA') {
    // Procura sigla de UF isolada no texto da filial (ex: "FILIAL MG", "UBERLANDIA-MG")
    const matchUf = branchText.match(/\b([A-Za-z]{2})\b/);
    if (matchUf && VALID_BRAZILIAN_UFS.has(matchUf[1].toUpperCase())) {
      return { uf: matchUf[1].toUpperCase(), branchName: branchText, originUf: routeUf };
    }
    
    // Mapeamento por cidades conhecidas
    const upper = branchText.toUpperCase();
    if (upper.includes('UBERLANDIA') || upper.includes('UBERABA') || upper.includes('CONTAGEM') || upper.includes('MINAS') || upper.includes('ARAGUARI') || upper.includes('PATOS')) {
      return { uf: 'MG', branchName: branchText, originUf: routeUf };
    }
    if (upper.includes('GOIANIA') || upper.includes('RIO VERDE') || upper.includes('ANAPOLIS') || upper.includes('JATAI') || upper.includes('ITUMBIARA') || upper.includes('FORMOSA') || upper.includes('CRISTALINA')) {
      return { uf: 'GO', branchName: branchText, originUf: routeUf };
    }
    if (upper.includes('SAO PAULO') || upper.includes('SANTOS') || upper.includes('CAMPINAS') || upper.includes('BARRETOS') || upper.includes('CASTILHO')) {
      return { uf: 'SP', branchName: branchText, originUf: routeUf };
    }
    if (upper.includes('RONDONOPOLIS') || upper.includes('CUIABA') || upper.includes('SINOP') || upper.includes('SORRISO') || upper.includes('MUTUM')) {
      return { uf: 'MT', branchName: branchText, originUf: routeUf };
    }
    if (upper.includes('CURITIBA') || upper.includes('PARANAGUA') || upper.includes('MARINGA') || upper.includes('LONDRINA')) {
      return { uf: 'PR', branchName: branchText, originUf: routeUf };
    }
  }

  // 2. Extração pela rota do CTRC (Origem/Destino)
  if (routeUf) {
    return { uf: routeUf, branchName: branchText || '', originUf: routeUf };
  }

  // 3. Fallback: pesquisa no texto bruto da linha (rawLine)
  if (rec.rawLine) {
    const ufFromRaw = detectUfFromLocation(rec.rawLine);
    if (ufFromRaw) {
      return { uf: ufFromRaw, branchName: branchText || '', originUf: ufFromRaw };
    }
  }

  return { uf: '', branchName: branchText || '', originUf: '' };
};

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

export interface InformedDisagreement {
  cteNumber: string;
  plate?: string;
  date?: string;
  reason: string;
  substituteCte?: string;
  notes?: string;
  informedAt: string;
  informedBy?: string;
}

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
  allCteNumbers?: string[];
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

  // Informação de desacordo comercial formalizado
  informedDisagreement?: InformedDisagreement;
  isInformedDisagreement?: boolean;

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

const findDisagreement = (
  item: ReconciliationItem,
  disagreements: Record<string, InformedDisagreement>
): InformedDisagreement | undefined => {
  if (!disagreements || Object.keys(disagreements).length === 0) return undefined;

  const candidates: string[] = [
    item.cteNumberAtua,
    item.cteNumberTrans,
    item.cteNumber,
    ...(item.allCteNumbers || [])
  ]
    .filter(Boolean)
    .map(c => String(c).trim().replace(/^0+/, ''))
    .filter(c => c && c !== '---' && !c.toLowerCase().includes('s/ ct-e'));

  const normPlate = normalizePlate(item.plate || '');

  for (const c of candidates) {
    if (normPlate && disagreements[`${c}_${normPlate}`]) {
      return disagreements[`${c}_${normPlate}`];
    }
    if (disagreements[c]) {
      return disagreements[c];
    }
  }

  if (normPlate && item.date) {
    const byPlate = Object.values(disagreements).find(d => 
      normalizePlate(d.plate || '') === normPlate && 
      (d.date ? normalizeDate(d.date) === normalizeDate(item.date!) : true)
    );
    if (byPlate) return byPlate;
  }

  return undefined;
};

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
  const [filterStatus, setFilterStatus] = useState<ReconciliationStatus | 'ALL' | 'SIMILAR' | 'DISAGREEMENT'>('ALL');
  const [filterDivergenceType, setFilterDivergenceType] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [viewMode, setViewMode] = useState<'compact' | 'side-by-side'>('side-by-side');
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);

  // Modal e Gestão de Desacordo Comercial
  const [selectedDisagreementItem, setSelectedDisagreementItem] = useState<ReconciliationItem | null>(null);
  const [informedDisagreements, setInformedDisagreements] = useState<Record<string, InformedDisagreement>>(() => {
    try {
      const saved = localStorage.getItem('atua_reconciliation_disagreements');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (err) {
      console.warn('Erro ao ler desacordos do localStorage:', err);
    }
    // Inicializa com o desacordo informado pelo usuário para o CT-e 2089 (Placa TCI2C30, 17/10/2026)
    return {
      '2089': {
        cteNumber: '2089',
        plate: 'TCI2C30',
        date: '2026-10-17',
        reason: 'Prestação de serviço em desacordo (SEFAZ)',
        substituteCte: '',
        notes: 'Desacordo comercial formalizado para o CT-e 2089',
        informedAt: '2026-10-17T12:00:00.000Z',
        informedBy: 'Operacional'
      }
    };
  });

  const handleSaveDisagreement = (data: InformedDisagreement) => {
    const normCte = String(data.cteNumber || '').trim().replace(/^0+/, '');
    if (!normCte) return;

    const key = normCte;
    const updated = {
      ...informedDisagreements,
      [key]: {
        ...data,
        cteNumber: normCte,
        informedAt: data.informedAt || new Date().toISOString(),
        informedBy: currentUser?.name || currentUser?.email || 'Usuário'
      }
    };

    setInformedDisagreements(updated);
    try {
      localStorage.setItem('atua_reconciliation_disagreements', JSON.stringify(updated));
    } catch (err) {
      console.warn('Erro ao salvar desacordo no localStorage:', err);
    }
    setSelectedDisagreementItem(null);
  };

  const handleRemoveDisagreement = (cteNumber: string) => {
    const normCte = String(cteNumber || '').trim().replace(/^0+/, '');
    const updated = { ...informedDisagreements };
    delete updated[normCte];

    Object.keys(updated).forEach(k => {
      if (k === normCte || k.startsWith(`${normCte}_`)) {
        delete updated[k];
      }
    });

    setInformedDisagreements(updated);
    try {
      localStorage.setItem('atua_reconciliation_disagreements', JSON.stringify(updated));
    } catch (err) {
      console.warn('Erro ao remover desacordo do localStorage:', err);
    }
    setSelectedDisagreementItem(null);
  };

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
        if (result.startDate) setStartDate(result.startDate);
        if (result.endDate) setEndDate(result.endDate);

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

      // Auto-preenche o período detectado no arquivo
      if (result.startDate) {
        setStartDate(result.startDate);
      }
      if (result.endDate) {
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

      if (result.startDate) setStartDate(result.startDate);
      if (result.endDate) setEndDate(result.endDate);
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
        if (result.startDate) setStartDate(result.startDate);
        if (result.endDate) setEndDate(result.endDate);
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

      if (result.startDate) setStartDate(result.startDate);
      if (result.endDate) setEndDate(result.endDate);
    } catch (err: any) {
      setParseError(err?.message || 'Falha ao processar texto.');
    } finally {
      setIsParsing(false);
    }
  };

  // Função auxiliar para extração estrita de todos os números de CT-e do embarque
  // NOTA CRÍTICA: Suporta múltiplos CT-es (ex: "2112/2111", bi-trem/múltiplas NFs)
  // e trata com precisão substituições de cancelamento (ex: 36 cancelado substituído pelo ativo 40).
  const extractShipmentCteNumbers = (s: Shipment): { raw: string; list: string[]; activeList: string[]; cancelledList: string[] } => {
    if (!s) return { raw: '', list: [], activeList: [], cancelledList: [] };
    const numbersFound = new Set<string>();
    const cancelledList: string[] = [];

    // Extrai lista de CT-es cancelados e substitutos, se houver
    if (Array.isArray(s.documents?.cancelled_ctes)) {
      for (const c of s.documents.cancelled_ctes) {
        const cNum = String(c?.cteNumber || '').trim().replace(/[^0-9]/g, '');
        if (cNum && !cancelledList.includes(cNum)) {
          cancelledList.push(cNum);
        }
        const subNum = String(c?.substituteCteNumber || '').trim().replace(/[^0-9]/g, '');
        if (subNum) {
          numbersFound.add(subNum);
        }
      }
    }

    const addCandidatesFromText = (txt: string) => {
      if (!txt) return;
      const parts = String(txt).split(/[/,;|\s\n\r-]+/);
      for (const p of parts) {
        const clean = p.replace(/[^0-9]/g, '');
        if (clean && clean !== '0' && clean.length < 10 && !clean.startsWith('178') && !clean.startsWith('179')) {
          numbersFound.add(clean);
        }
      }
    };

    // 1. Número explícito ativo de CT-e (caso de reemissão fiscal após cancelamento)
    const activeDirect = s.documents?.active_cte_number || (s as any)?.activeCteNumber;
    if (activeDirect && String(activeDirect).trim() !== '' && String(activeDirect).trim() !== '-') {
      addCandidatesFromText(activeDirect);
    }

    // 2. Número explícito de CT-e cadastrado no embarque
    const direct = s.cteNumber || s.documents?.cte_number || s.documents?.cteNumber;
    let rawStr = '';
    if (direct !== undefined && direct !== null) {
      const trimmed = String(direct).trim();
      if (trimmed !== '' && trimmed !== '-' && trimmed !== '0') {
        rawStr = trimmed;
        addCandidatesFromText(trimmed);
      }
    }

    // 3. Extração via função oficial getShipmentCte (com tratamento de anexos)
    const helperVal = getShipmentCte(s);
    if (helperVal && helperVal !== '-' && helperVal !== '0') {
      if (!rawStr) rawStr = helperVal.trim();
      addCandidatesFromText(helperVal);
    }

    // 4. Extração de nomes de arquivos anexos
    const cteDocs = s.documents?.['CT-e'] || s.documents?.['CT-E'] || s.documents?.['cte'] || s.documents?.['Cte'] || s.documents?.['DACTE'];
    if (Array.isArray(cteDocs)) {
      for (const item of cteDocs) {
        if (typeof item === 'string') {
          const cleanItem = item.replace(/CT[-_]?e_\d{10,14}_/i, '').replace(/DACTE_\d{10,14}_/i, '');
          const match = cleanItem.match(/DACTE_(\d{1,8})/i) || 
                        cleanItem.match(/(?:^|_)CTE_(\d{1,8})/i) || 
                        cleanItem.match(/_(\d{1,8})\.(?:pdf|xml)/i);
          if (match && match[1]) {
            addCandidatesFromText(match[1]);
          }
        }
      }
    } else if (typeof cteDocs === 'string' && cteDocs.trim() !== '') {
      const cleanItem = cteDocs.replace(/CT[-_]?e_\d{10,14}_/i, '').replace(/DACTE_\d{10,14}_/i, '');
      const match = cleanItem.match(/DACTE_(\d{1,8})/i) || 
                    cleanItem.match(/(?:^|_)CTE_(\d{1,8})/i) || 
                    cleanItem.match(/_(\d{1,8})\.(?:pdf|xml)/i);
      if (match && match[1]) {
        addCandidatesFromText(match[1]);
      }
    }

    // Preserva tanto números ativos quanto históricos/cancelados em 'list' para busca e conciliação perfeita
    cancelledList.forEach(c => numbersFound.add(c));

    const allCandidates = Array.from(numbersFound);
    const preferredActive = allCandidates.filter(n => !cancelledList.includes(n));
    if (!rawStr) {
      rawStr = preferredActive.length > 0 ? preferredActive.join('/') : allCandidates.join('/');
    }

    return {
      raw: rawStr,
      list: allCandidates,
      activeList: preferredActive.length > 0 ? preferredActive : allCandidates,
      cancelledList
    };
  };

  const extractShipmentCteClean = (s: Shipment): string => {
    return extractShipmentCteNumbers(s).raw;
  };

  const getShipmentCteEmissionDate = (s: Shipment): string => {
    return String(
      s.cteEmissionDate ||
      (s as any)?.cte_emission_date ||
      s.documents?.cteEmissionDate ||
      s.documents?.cte_emission_date ||
      s.documents?.emissionDate ||
      getUtilsCteEmissionDate(s) ||
      ''
    );
  };

  // Período ativo da auditoria: prioriza filtro selecionado pelo usuário na tela, ou período detectado do Atua TMS
  const activeStartDate = startDate || atuaResult?.startDate || '';
  const activeEndDate = endDate || atuaResult?.endDate || '';

  // 1. Enriquecimento dos Embarques do Transcunha no Período Selecionado
  const enrichedTranscunhaData = useMemo(() => {
    // Conjunto de CT-es presentes no relatório Atua carregado
    const atuaCteSet = new Set(
      (atuaResult?.records || []).map(r => r.cteNumber.replace(/[^0-9]/g, '')).filter(Boolean)
    );

    // Filtra estritamente embarques EFETIVADOS COM CT-E e que respeitam o período selecionado
    const validShipments = shipments.filter(s => {
      // 1. Ignora embarques cancelados
      if (s.status === 'Cancelado' || (s as any)?.isCancelled || (s as any)?.is_cancelled) return false;

      // 2. REGRA MANDATÓRIA: Deve ser embarque efetivado COM CT-E emitido
      const cteInfo = extractShipmentCteNumbers(s);
      if (cteInfo.list.length === 0) return false;

      const plate = normalizePlate(s.horsePlate || (s as any)?.horse_plate);
      if (!plate) return false;

      // 3. REGRA REFINADA DE PERÍODO: O embarque deve estar dentro do intervalo determinado
      // Prioridade mandatória de confrontamento fiscal:
      // a) Se houver cruzamento direto com CT-e emitido no relatório Atua dentro do período, inclui
      // b) Se o CT-e possui data de emissão explícita (cteEmissionDateStr), ela é a data fiscal mandatória e deve estar no período
      // c) Se não houver data de emissão de CT-e preenchida, utiliza a data contábil/efetiva ou agendamento
      const effectiveDate = getShipmentEffectiveDate(s);
      const dateStr = normalizeDate(effectiveDate || s.scheduledDate || (s as any)?.scheduled_date || '');
      const cteEmissionDateStr = normalizeDate(getShipmentCteEmissionDate(s) || '');

      if (!activeStartDate && !activeEndDate) return true;

      const isDateIn = (d: string) => {
        const norm = normalizeDate(d);
        if (!norm) return false;
        if (activeStartDate && norm < activeStartDate) return false;
        if (activeEndDate && norm > activeEndDate) return false;
        return true;
      };

      // Se o relatório do Atua contiver este CT-e e placa emitido dentro do período selecionado
      const hasAtuaInPeriod = (atuaResult?.records || []).some(r => {
        const atuaCte = r.cteNumber.replace(/[^0-9]/g, '');
        return arePlatesMatching(r.plate, plate) && cteInfo.list.includes(atuaCte) && isDateIn(r.emissionDate || '');
      });
      if (hasAtuaInPeriod) return true;

      // Se o CT-e possui data de emissão explícita no Transcunha, ela é a referência fiscal definitiva
      if (cteEmissionDateStr) {
        return isDateIn(cteEmissionDateStr);
      }

      // Caso não tenha data de emissão de CT-e preenchida, utiliza a data efetiva / agendamento
      return isDateIn(dateStr);
    });

    const items: Array<{
      key: string;
      cteNumber: string;
      displayCte?: string;
      allCteNumbers?: string[];
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
      branchUf: string;
      branchName: string;
    }> = [];

    validShipments.forEach(s => {
      const cargo = s.cargoId ? cargoMap.get(s.cargoId) : undefined;
      const clientName = (cargo?.clientId ? clientMap.get(cargo.clientId) : '') || '---';
      const cteInfo = extractShipmentCteNumbers(s);
      const cte = cteInfo.raw;
      const calculatedExpenses = calculateShipmentExpenses(s, cargo, DEFAULT_EXPENSES_CONFIG, stays);
      const toll = (s.tollValue !== undefined && s.tollValue !== null) ? Number(s.tollValue) || 0 : (s.realProfitData?.toll || 0);

      // Identificação da UF e Filial de Faturamento do Embarque
      const { uf: branchUf, branchName } = detectShipmentUf(s, cargo, branchMap);

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

      // Peso de referência da emissão do CT-e (Coluna Peso Carregado):
      // No confronto fiscal do CT-e com o Atua TMS, o CT-e é emitido com o Peso Carregado (shipmentTonnage).
      // Se não houver peso de carregamento, utiliza a descarga.
      const baseLoadedWeight = normalizeWeightTonnage(s.shipmentTonnage || (s as any).loadedTonnage || (s as any).shipment_tonnage || cargo?.totalVolume || 0);
      const rawUnloadedWeight = normalizeWeightTonnage(s.unloadedTonnage || (s as any).unloaded_tonnage || 0);
      const weight = baseLoadedWeight > 0 ? baseLoadedWeight : rawUnloadedWeight;

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

      const cteEmissionDateStr = normalizeDate(getShipmentCteEmissionDate(s) || '');
      const shipmentEffectiveDate = normalizeDate(cteEmissionDateStr || getShipmentEffectiveDate(s) || s.scheduledDate || '');

      const isShipmentComp = Boolean(
        (s as any)?.isComplementar || 
        (s as any)?.is_complementar || 
        (s as any)?.complementarOriginType ||
        (s as any)?.complementar_origin_type ||
        (s as any)?.id?.endsWith('-COMP') ||
        (weight === 0 && baseCompanyFreight > 0)
      );

      // Linha Principal do Embarque (suporta múltiplos CT-es como 2112/2111)
      if (cteInfo.list.length <= 1) {
        const singleCte = cteInfo.list[0] || (cte ? cte.replace(/[^0-9]/g, '') : '');
        items.push({
          key: `${s.id}-base`,
          cteNumber: singleCte,
          displayCte: cteInfo.raw || singleCte,
          allCteNumbers: cteInfo.list.length > 0 ? cteInfo.list : (singleCte ? [singleCte] : []),
          shipment: s,
          cargo,
          isComplementary: isShipmentComp,
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
          plate: normalizePlate(s.horsePlate || (s as any)?.horse_plate),
          date: shipmentEffectiveDate,
          clientName,
          origin: cargo?.origin || '',
          destination: cargo?.destination || '',
          driverName: s.driverName || '---',
          branchUf: branchUf || '',
          branchName: branchName || ''
        });
      } else {
        // Embarque com múltiplos CT-es (ex: 2112/2111 - carreta/bi-trem/múltiplas NFs)
        // Inteligência: verifica no Atua quais CT-es realmente pertencem a este caminhão (placa).
        // Se apenas 1 CT-e da lista pertencer a este caminhão no Atua (ex: 40 para BWY6A52, onde 36 pertencia a outro caminhão),
        // NÃO desmembra a carga nem gera órfão fantasma!
        const matchingCtesInAtua = atuaResult?.records
          ? cteInfo.list.filter(cteNum => 
              atuaResult.records.some(r => 
                r.cteNumber.replace(/[^0-9]/g, '') === cteNum && 
                arePlatesMatching(r.plate, s.horsePlate || (s as any)?.horse_plate)
              )
            )
          : [];

        const hasExplicitSubCtes = Array.isArray(s.subCtes) && s.subCtes.length > 1;
        const isCancelledReissue = cteInfo.cancelledList.length > 0;

        if (isCancelledReissue || (!hasExplicitSubCtes && matchingCtesInAtua.length <= 1)) {
          const singleCte = matchingCtesInAtua[0] || (cteInfo.activeList && cteInfo.activeList[0]) || cteInfo.list[0];
          items.push({
            key: `${s.id}-base-${singleCte}`,
            cteNumber: singleCte,
            displayCte: cteInfo.raw || singleCte,
            allCteNumbers: cteInfo.list.length > 0 ? cteInfo.list : [singleCte],
            shipment: s,
            cargo,
            isComplementary: isShipmentComp,
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
            plate: normalizePlate(s.horsePlate || (s as any)?.horse_plate),
            date: shipmentEffectiveDate,
            clientName,
            origin: cargo?.origin || '',
            destination: cargo?.destination || '',
            driverName: s.driverName || '---',
            branchUf: branchUf || '',
            branchName: branchName || ''
          });
        } else {
          // Bipartição real (ex: FEL-818 com 2111 e 2112 para BAX6I08)
          cteInfo.list.forEach((cteNum, idx) => {
            const atuaRecForCte = (atuaResult?.records || []).find(r => 
              r.cteNumber.replace(/[^0-9]/g, '') === cteNum &&
              arePlatesMatching(r.plate, s.horsePlate || (s as any)?.horse_plate)
            ) || (atuaResult?.records || []).find(r => r.cteNumber.replace(/[^0-9]/g, '') === cteNum);
          
            let cteWeight = 0;
            if (atuaRecForCte && atuaRecForCte.weight > 0) {
              cteWeight = atuaRecForCte.weight;
            } else if (weight > 0) {
              cteWeight = Number((weight / cteInfo.list.length).toFixed(3));
            }

            let cteCompanyFreight = 0;
            if (companyRatePerTon > 0 && cteWeight > 0) {
              cteCompanyFreight = Number((cteWeight * companyRatePerTon).toFixed(2));
            } else if (weight > 0 && cteWeight > 0) {
              cteCompanyFreight = Number((baseCompanyFreight * (cteWeight / weight)).toFixed(2));
            } else {
              cteCompanyFreight = Number((baseCompanyFreight / cteInfo.list.length).toFixed(2));
            }

            let cteDriverFreight = 0;
            if (driverRatePerTon > 0 && cteWeight > 0) {
              cteDriverFreight = Number((cteWeight * driverRatePerTon).toFixed(2));
            } else if (weight > 0 && cteWeight > 0) {
              cteDriverFreight = Number((baseDriverFreight * (cteWeight / weight)).toFixed(2));
            } else {
              cteDriverFreight = Number((baseDriverFreight / cteInfo.list.length).toFixed(2));
            }

            const cteToll = (weight > 0 && cteWeight > 0)
              ? Number((toll * (cteWeight / weight)).toFixed(2))
              : Number((toll / cteInfo.list.length).toFixed(2));

            const cteIcms = (weight > 0 && cteWeight > 0)
              ? Number((icms * (cteWeight / weight)).toFixed(2))
              : Number((icms / cteInfo.list.length).toFixed(2));

            const cteFederalTax = (weight > 0 && cteWeight > 0)
              ? Number((federalTax * (cteWeight / weight)).toFixed(2))
              : Number((federalTax / cteInfo.list.length).toFixed(2));

            const cteFreightDifference = cteCompanyFreight - cteDriverFreight;
            const cteNetProfit = cteFreightDifference - cteToll - cteIcms - cteFederalTax;

            items.push({
              key: `${s.id}-cte-${cteNum}-${idx}`,
              cteNumber: cteNum,
              displayCte: cteInfo.raw,
              allCteNumbers: cteInfo.list,
              shipment: s,
              cargo,
              isComplementary: isShipmentComp,
              weight: cteWeight,
              companyFreight: cteCompanyFreight,
              companyRatePerTon,
              driverFreight: cteDriverFreight,
              driverRatePerTon,
              toll: cteToll,
              freightDifference: cteFreightDifference,
              icms: cteIcms,
              federalTax: cteFederalTax,
              totalExpenses: Number((calculatedExpenses.totalExpenses / cteInfo.list.length).toFixed(2)),
              netProfit: cteNetProfit,
              plate: normalizePlate(s.horsePlate || (s as any)?.horse_plate),
              date: shipmentEffectiveDate,
              clientName,
              origin: cargo?.origin || '',
              destination: cargo?.destination || '',
              driverName: s.driverName || '---',
              branchUf: branchUf || '',
              branchName: branchName || ''
            });
          });
        }
      }

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
            plate: normalizePlate(s.horsePlate || (s as any)?.horse_plate),
            date: shipmentEffectiveDate,
            clientName,
            origin: cargo?.origin || '',
            destination: cargo?.destination || '',
            driverName: s.driverName || '---',
            branchUf: branchUf || '',
            branchName: branchName || ''
          });
        });
      }
    });

    // Mescla embarques do relatório Lucro Real em arquivo (se fornecido - apenas efetivados com CT-e)
    if (uploadedTranscunhaRecords && uploadedTranscunhaRecords.length > 0) {
      uploadedTranscunhaRecords.forEach((tr, idx) => {
        const rawCte = tr.cteNumber || '';
        const cteParts = String(rawCte).split(/[/,;|\s\n\r-]+/).map(p => p.replace(/[^0-9]/g, '')).filter(p => p && p !== '0' && p.length < 10);
        const cteClean = cteParts[0] || (rawCte ? rawCte.replace(/[^0-9]/g, '') : '');
        if (!cteClean && cteParts.length === 0) return; // Ignora registros sem CT-e emitido

        const plateNorm = normalizePlate(tr.plate);
        const dateNorm = normalizeDate(tr.date);

        // Aplica rigorosamente o filtro de período nas linhas do arquivo
        if (activeStartDate && dateNorm && dateNorm < activeStartDate) return;
        if (activeEndDate && dateNorm && dateNorm > activeEndDate) return;

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
            displayCte: rawCte || cteClean,
            allCteNumbers: cteParts.length > 0 ? cteParts : [cteClean],
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
            driverName: '---',
            branchUf: '',
            branchName: ''
          });
        }
      });
    }

    return items;
  }, [shipments, cargos, cargoMap, clientMap, branchMap, stays, activeStartDate, activeEndDate, uploadedTranscunhaRecords, atuaResult]);

  // 2. Motor de Reconciliação / Auditoria Cruzada baseado em CT-E e PLACA + DATA DO EMBARQUE
  const reconciliationItems: ReconciliationItem[] = useMemo(() => {
    if (!atuaResult && enrichedTranscunhaData.length === 0) return [];

    // Filtra registros do Atua pelo período selecionado caso informado
    const atuaRecords = (atuaResult?.records || []).filter(r => {
      const atuaDateClean = normalizeDate(r.emissionDate || '');
      if (!activeStartDate && !activeEndDate) return true;

      const isDateIn = (d: string) => {
        const norm = normalizeDate(d);
        if (!norm) return false;
        if (activeStartDate && norm < activeStartDate) return false;
        if (activeEndDate && norm > activeEndDate) return false;
        return true;
      };
      if (isDateIn(atuaDateClean)) return true;

      // Tolerância de fronteira: se a emissão do Atua corresponder a um embarque que está no confronto no período
      const atuaCteClean = r.cteNumber.replace(/[^0-9]/g, '');
      const matchingShipmentInPeriod = enrichedTranscunhaData.some(t => {
        const cteMatches = (t.cteNumber && (t.cteNumber === atuaCteClean || parseInt(t.cteNumber, 10) === parseInt(atuaCteClean, 10))) ||
                           (t.allCteNumbers && t.allCteNumbers.some(c => c === atuaCteClean || parseInt(c, 10) === parseInt(atuaCteClean, 10)));
        if (!cteMatches) return false;
        return arePlatesMatching(t.plate, r.plate);
      });

      return matchingShipmentInPeriod;
    });

    const matchedTranscunhaKeys = new Set<string>();
    const matchedAtuaIndexes = new Set<number>();
    const results: ReconciliationItem[] = [];

    // Passo 1: Para cada linha do Atua, buscar o embarque correspondente
    atuaRecords.forEach((atuaRec, atuaIdx) => {
      const atuaCteClean = atuaRec.cteNumber.replace(/[^0-9]/g, '');
      const atuaPlateClean = normalizePlate(atuaRec.plate);
      const atuaDateClean = normalizeDate(atuaRec.emissionDate || '');

      // Detecção da UF e Filial do registro do Atua
      const atuaUfInfo = detectAtuaRecordUf(atuaRec);
      const atuaUf = atuaUfInfo.uf;

      // Taxas por tonelada no Atua
      const atuaWeight = atuaRec.weight || 0;
      const atuaCompanyRate = (atuaRec.companyTariff && atuaRec.companyTariff > 0)
        ? atuaRec.companyTariff
        : (atuaWeight > 0 ? Number((atuaRec.companyFreight / atuaWeight).toFixed(2)) : 0);

      const atuaDriverRate = (atuaRec.driverTariff && atuaRec.driverTariff > 0)
        ? atuaRec.driverTariff
        : (atuaWeight > 0 ? Number((atuaRec.driverFreight / atuaWeight).toFixed(2)) : 0);

      let match: typeof enrichedTranscunhaData[0] | undefined;

      // Fase 1: Pareamento por Número do CT-e
      // NOTA CRÍTICA: Cada estado/filial pode ter sua própria sequência numérica de CT-e.
      // Se houver mais de um CT-e com mesmo número (homônimos de estados distintos),
      // desempatamos obrigatoriamente por Mesma Placa e Mesma UF.
      // Suporta correspondência individual e múltipla (ex: 2112 vs 2112/2111).
      if (atuaCteClean) {
        const cteCandidates = enrichedTranscunhaData.filter(t => 
          !matchedTranscunhaKeys.has(t.key) && 
          (
            (t.cteNumber && (t.cteNumber === atuaCteClean || parseInt(t.cteNumber, 10) === parseInt(atuaCteClean, 10))) ||
            (t.allCteNumbers && t.allCteNumbers.some(c => c === atuaCteClean || parseInt(c, 10) === parseInt(atuaCteClean, 10)))
          )
        );

        if (cteCandidates.length > 0) {
          // 1. Prioridade máxima: Mesma Placa E Mesma UF
          const exactMatches = cteCandidates.filter(t => 
            arePlatesMatching(t.plate, atuaPlateClean) && 
            atuaUf && t.branchUf && atuaUf === t.branchUf
          );

          if (exactMatches.length === 1) {
            match = exactMatches[0];
          } else if (exactMatches.length > 1) {
            match = exactMatches.reduce((best, cur) => {
              const diffBest = Math.abs(best.weight - atuaWeight) + Math.abs(best.companyFreight - atuaRec.companyFreight) / 1000;
              const diffCur = Math.abs(cur.weight - atuaWeight) + Math.abs(cur.companyFreight - atuaRec.companyFreight) / 1000;
              return diffCur < diffBest ? cur : best;
            });
          } else {
            // 2. Mesma Placa (veículo confere com o CT-e com suporte a Mercosul/OCR)
            const samePlateCandidates = cteCandidates.filter(t => 
              arePlatesMatching(t.plate, atuaPlateClean) ||
              arePlatesMatching(t.shipment?.trailer1Plate || (t.shipment as any)?.trailer1_plate, atuaPlateClean) ||
              arePlatesMatching(t.shipment?.trailer2Plate || (t.shipment as any)?.trailer2_plate, atuaPlateClean) ||
              arePlatesMatching(t.shipment?.trailer3Plate || (t.shipment as any)?.trailer3_plate, atuaPlateClean)
            );

            if (samePlateCandidates.length === 1) {
              match = samePlateCandidates[0];
            } else if (samePlateCandidates.length > 1) {
              match = samePlateCandidates.reduce((best, cur) => {
                const diffBest = Math.abs(best.weight - atuaWeight) + Math.abs(best.companyFreight - atuaRec.companyFreight) / 1000;
                const diffCur = Math.abs(cur.weight - atuaWeight) + Math.abs(cur.companyFreight - atuaRec.companyFreight) / 1000;
                return diffCur < diffBest ? cur : best;
              });
            } else if (cteCandidates.length === 1) {
              // Apenas 1 candidato no período com este número de CT-e -> Match direto!
              match = cteCandidates[0];
            } else {
              // Múltiplos candidatos: prioriza filial compatível ou cidade de origem, depois menor delta de valores
              const sameUfCandidates = atuaUf ? cteCandidates.filter(t => t.branchUf === atuaUf) : [];
              const sameOriginCandidates = atuaUfInfo.originUf ? cteCandidates.filter(t => t.branchUf === atuaUfInfo.originUf) : [];
              const pool = sameUfCandidates.length > 0 
                ? sameUfCandidates 
                : (sameOriginCandidates.length > 0 ? sameOriginCandidates : cteCandidates);
              
              match = pool.reduce((best, cur) => {
                const diffBest = Math.abs(best.weight - atuaWeight) + Math.abs(best.companyFreight - atuaRec.companyFreight) / 1000;
                const diffCur = Math.abs(cur.weight - atuaWeight) + Math.abs(cur.companyFreight - atuaRec.companyFreight) / 1000;
                return diffCur < diffBest ? cur : best;
              });
            }
          }
        }
      }

      // Fase 2: Pareamento por Placa Normalizada + Data de Emissão/Embarque (para auditar numeração de CT-e ou ausência de CT-e)
      if (!match && atuaPlateClean) {
        // Busca exata por placa e data (com suporte a placa Mercosul)
        // NOTA DE PROTEÇÃO: Se o CT-e deste embarque no Transcunha existe no relatório do Atua,
        // ele NÃO pode ser roubado na Fase 2 por outro CT-e!
        const exactMatches = enrichedTranscunhaData.filter(t => {
          if (matchedTranscunhaKeys.has(t.key)) return false;
          const cteClean = t.cteNumber ? t.cteNumber.replace(/[^0-9]/g, '') : '';
          if (cteClean && atuaCteClean && cteClean !== atuaCteClean && atuaRecords.some(r => r.cteNumber.replace(/[^0-9]/g, '') === cteClean)) {
            return false;
          }
          if (t.allCteNumbers && atuaCteClean && !t.allCteNumbers.includes(atuaCteClean) && t.allCteNumbers.some(c => atuaRecords.some(r => r.cteNumber.replace(/[^0-9]/g, '') === c))) {
            return false;
          }
          const samePlate = arePlatesMatching(t.plate, atuaPlateClean) ||
            arePlatesMatching(t.shipment?.trailer1Plate || (t.shipment as any)?.trailer1_plate, atuaPlateClean) ||
            arePlatesMatching(t.shipment?.trailer2Plate || (t.shipment as any)?.trailer2_plate, atuaPlateClean) ||
            arePlatesMatching(t.shipment?.trailer3Plate || (t.shipment as any)?.trailer3_plate, atuaPlateClean);
          return samePlate && t.date === atuaDateClean;
        });

        if (exactMatches.length === 1) {
          match = exactMatches[0];
        } else if (exactMatches.length > 1) {
          const cteMatch = exactMatches.find(t => 
            (t.cteNumber && (t.cteNumber === atuaCteClean || parseInt(t.cteNumber, 10) === parseInt(atuaCteClean, 10))) ||
            (t.allCteNumbers && t.allCteNumbers.some(c => c === atuaCteClean || parseInt(c, 10) === parseInt(atuaCteClean, 10)))
          );
          if (cteMatch) {
            match = cteMatch;
          } else {
            const sameUfMatches = atuaUf ? exactMatches.filter(t => t.branchUf === atuaUf) : exactMatches;
            const pool = sameUfMatches.length > 0 ? sameUfMatches : exactMatches;
            match = pool.reduce((best, cur) => {
              const diffBest = Math.abs(best.weight - atuaWeight) + Math.abs(best.companyFreight - atuaRec.companyFreight) / 1000;
              const diffCur = Math.abs(cur.weight - atuaWeight) + Math.abs(cur.companyFreight - atuaRec.companyFreight) / 1000;
              return diffCur < diffBest ? cur : best;
            });
          }
        } else {
          // Tolerância de data (até 3 dias de diferença entre data do agendamento/embarque e emissão do CT-e)
          const nearDateMatches = enrichedTranscunhaData.filter(t => {
            if (matchedTranscunhaKeys.has(t.key)) return false;
            const cteClean = t.cteNumber ? t.cteNumber.replace(/[^0-9]/g, '') : '';
            if (cteClean && atuaCteClean && cteClean !== atuaCteClean && atuaRecords.some(r => r.cteNumber.replace(/[^0-9]/g, '') === cteClean)) {
              return false;
            }
            if (t.allCteNumbers && atuaCteClean && !t.allCteNumbers.includes(atuaCteClean) && t.allCteNumbers.some(c => atuaRecords.some(r => r.cteNumber.replace(/[^0-9]/g, '') === c))) {
              return false;
            }
            const samePlate = arePlatesMatching(t.plate, atuaPlateClean) ||
              arePlatesMatching(t.shipment?.trailer1Plate || (t.shipment as any)?.trailer1_plate, atuaPlateClean) ||
              arePlatesMatching(t.shipment?.trailer2Plate || (t.shipment as any)?.trailer2_plate, atuaPlateClean) ||
              arePlatesMatching(t.shipment?.trailer3Plate || (t.shipment as any)?.trailer3_plate, atuaPlateClean);
            if (!samePlate) return false;
            if (!t.date || !atuaDateClean) return false;
            const diffDays = Math.abs((new Date(t.date).getTime() - new Date(atuaDateClean).getTime()) / (1000 * 60 * 60 * 24));
            return diffDays <= 3;
          });

          if (nearDateMatches.length === 1) {
            match = nearDateMatches[0];
          } else if (nearDateMatches.length > 1) {
            const cteMatch = nearDateMatches.find(t => 
              (t.cteNumber && (t.cteNumber === atuaCteClean || parseInt(t.cteNumber, 10) === parseInt(atuaCteClean, 10))) ||
              (t.allCteNumbers && t.allCteNumbers.some(c => c === atuaCteClean || parseInt(c, 10) === parseInt(atuaCteClean, 10)))
            );
            if (cteMatch) {
              match = cteMatch;
            } else {
              const sameUfMatches = atuaUf ? nearDateMatches.filter(t => t.branchUf === atuaUf) : nearDateMatches;
              const pool = sameUfMatches.length > 0 ? sameUfMatches : nearDateMatches;
              match = pool.reduce((best, cur) => {
                const diffBest = Math.abs(best.weight - atuaWeight) + Math.abs(best.companyFreight - atuaRec.companyFreight) / 1000;
                const diffCur = Math.abs(cur.weight - atuaWeight) + Math.abs(cur.companyFreight - atuaRec.companyFreight) / 1000;
                return diffCur < diffBest ? cur : best;
              });
            }
          }
        }
      }

      // Fase 2.5: Pareamento Heurístico Resiliente para Frotas Gêmeas e Reemissões Fiscais (ex: TCI2C17 vs TCI2C30 com CT-e 2090 vs 2091)
      if (!match) {
        const potentialTwinMatches = enrichedTranscunhaData.filter(t => {
          if (matchedTranscunhaKeys.has(t.key)) return false;
          if (!t.date || !atuaDateClean) return false;

          // Se o CT-e deste embarque no Transcunha já existe no relatório do Atua, ele não deve ser consumido prematuramente na Fase 2.5 por outro CT-e!
          const cteClean = t.cteNumber ? t.cteNumber.replace(/[^0-9]/g, '') : '';
          if (cteClean && atuaRecords.some(r => r.cteNumber.replace(/[^0-9]/g, '') === cteClean)) {
            return false;
          }
          if (t.allCteNumbers && t.allCteNumbers.some(c => atuaRecords.some(r => r.cteNumber.replace(/[^0-9]/g, '') === c))) {
            return false;
          }

          const diffDays = Math.abs((new Date(t.date).getTime() - new Date(atuaDateClean).getTime()) / (1000 * 60 * 60 * 24));
          if (diffDays > 2) return false;

          const sameCompRate = t.companyRatePerTon > 0 && atuaCompanyRate > 0 && Math.abs(t.companyRatePerTon - atuaCompanyRate) <= 0.50;
          const sameDrivRate = t.driverRatePerTon > 0 && atuaDriverRate > 0 && Math.abs(t.driverRatePerTon - atuaDriverRate) <= 0.50;
          if (!sameCompRate && !sameDrivRate) return false;

          const sameToll = (t.toll > 0 && atuaRec.toll > 0 && Math.abs(t.toll - atuaRec.toll) <= 2.0);
          const sameWeight = (t.weight > 0 && atuaWeight > 0 && Math.abs(t.weight - atuaWeight) <= 1.0);
          
          const platePrefix1 = (t.plate || '').slice(0, 4);
          const platePrefix2 = (atuaPlateClean || '').slice(0, 4);
          const samePlatePrefix = platePrefix1.length >= 3 && platePrefix1 === platePrefix2;

          return (sameCompRate && sameDrivRate && (sameToll || sameWeight || samePlatePrefix));
        });

        if (potentialTwinMatches.length === 1) {
          match = potentialTwinMatches[0];
        } else if (potentialTwinMatches.length > 1) {
          // Desempate por proximidade de peso
          match = potentialTwinMatches.reduce((best, cur) => {
            const diffBest = Math.abs(best.weight - atuaWeight);
            const diffCur = Math.abs(cur.weight - atuaWeight);
            return diffCur < diffBest ? cur : best;
          });
        }
      }

      if (match) {
        matchedTranscunhaKeys.add(match.key);
        matchedAtuaIndexes.add(atuaIdx);

        // Identificação refinada de CT-e ou Embarque Complementar
        const isComplementary = Boolean(
          match.isComplementary || 
          atuaRec.isComplementary || 
          (match.shipment as any)?.isComplementar || 
          (match.shipment as any)?.is_complementar ||
          (match.weight === 0 && match.companyFreight > 0) ||
          (atuaRec.weight === 0 && atuaRec.companyFreight > 0) ||
          (atuaRec.docType && String(atuaRec.docType).toUpperCase().includes('COMP')) ||
          (atuaRec.rawLine && (atuaRec.rawLine.toLowerCase().includes('complement') || atuaRec.rawLine.toLowerCase().includes('estadia') || atuaRec.rawLine.toLowerCase().includes('diária')))
        );

        // 1. Auditoria do CT-e
        const transCte = match.displayCte || match.cteNumber;
        const isCteMatch = Boolean(
          (match.cteNumber && (match.cteNumber === atuaCteClean || parseInt(match.cteNumber, 10) === parseInt(atuaCteClean, 10))) ||
          (match.allCteNumbers && match.allCteNumbers.some(c => c === atuaCteClean || parseInt(c, 10) === parseInt(atuaCteClean, 10)))
        );
        const isCteDivergent = !isCteMatch;

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

        // REGRA DE EMBARQUE COMPLEMENTAR: Em complementares, compara APENAS o frete total, NÃO o R$/ton
        const rawDeltaCompanyRate = Number((match.companyRatePerTon - atuaCompanyRate).toFixed(2));
        const directDiffCompanyRate = Math.abs(rawDeltaCompanyRate);
        const diffCompanyRateWithToll = Math.abs(directDiffCompanyRate - tollPerTon);
        const isCompanyRateReconciledByToll = isCompanyFreightReconciledByToll || (tollPerTon > 0 && diffCompanyRateWithToll <= rateTolerance);
        const isCompanyRateDivergent = !isComplementary && (directDiffCompanyRate > rateTolerance && !isCompanyRateReconciledByToll);
        const deltaCompanyRate = (isComplementary || isCompanyRateReconciledByToll) ? 0 : rawDeltaCompanyRate;

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

        // REGRA DE EMBARQUE COMPLEMENTAR: Em complementares, compara APENAS o frete total, NÃO o R$/ton
        const rawDeltaDriverRate = Number((match.driverRatePerTon - atuaDriverRate).toFixed(2));
        const directDiffDriverRate = Math.abs(rawDeltaDriverRate);
        const diffDriverRateWithToll = Math.abs(directDiffDriverRate - tollPerTon);
        const isDriverRateReconciledByToll = isDriverFreightReconciledByToll || (tollPerTon > 0 && diffDriverRateWithToll <= rateTolerance);
        const isDriverRateDivergent = !isComplementary && (directDiffDriverRate > rateTolerance && !isDriverRateReconciledByToll);
        const deltaDriverRate = (isComplementary || isDriverRateReconciledByToll) ? 0 : rawDeltaDriverRate;

        // 4. Auditoria do Peso Carregado
        // Em embarques complementares o peso fiscal é financeiro ou zero, portanto não gera divergência de peso
        const rawDeltaWeight = Number((match.weight - atuaRec.weight).toFixed(2));
        const isWeightDivergent = !isComplementary && (Math.abs(rawDeltaWeight) > weightTolerance);
        const deltaWeight = isComplementary ? 0 : rawDeltaWeight;

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
          allCteNumbers: match.allCteNumbers || [match.cteNumber],
          isCteDivergent,
          shipmentId: match.shipment.id,
          shipment: match.shipment,
          cargo: match.cargo,
          isComplementary,
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

          transUf: match.branchUf || '',
          atuaUf: atuaUf || '',
          transBranch: match.branchName || '',
          atuaBranch: atuaUfInfo.branchName || '',

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
          allCteNumbers: [atuaCteClean],
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
          transUf: '',
          atuaUf: atuaUf || '',
          transBranch: '',
          atuaBranch: atuaUfInfo.branchName || '',
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
        // Garantia de período estrita: se não foi conciliado com o Atua, a data do embarque Transcunha DEVE respeitar o período filtrado
        if (activeStartDate || activeEndDate) {
          const tDate = normalizeDate(t.date || '');
          if (activeStartDate && tDate && tDate < activeStartDate) return;
          if (activeEndDate && tDate && tDate > activeEndDate) return;
        }

        results.push({
          id: `transcunha-pending-${t.key}`,
          cteNumber: t.cteNumber,
          cteNumberTrans: t.displayCte || t.cteNumber,
          cteNumberAtua: '',
          allCteNumbers: t.allCteNumbers || [t.cteNumber],
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
          transUf: t.branchUf || '',
          atuaUf: '',
          transBranch: t.branchName || '',
          atuaBranch: '',
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
          const trailer1 = normalizePlate(pending.shipment?.trailer1Plate || (pending.shipment as any)?.trailer1_plate || '');
          const trailer2 = normalizePlate(pending.shipment?.trailer2Plate || (pending.shipment as any)?.trailer2_plate || '');
          const trailer3 = normalizePlate(pending.shipment?.trailer3Plate || (pending.shipment as any)?.trailer3_plate || '');

          const exactPlateMatch = orphanPlate && arePlatesMatching(orphanPlate, pendingCavalo);
          const trailerPlateMatch = orphanPlate && (
            arePlatesMatching(orphanPlate, trailer1) || 
            arePlatesMatching(orphanPlate, trailer2) || 
            arePlatesMatching(orphanPlate, trailer3)
          );

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

    // Passo 4: Cruzamento com Desacordos Comerciais Informados
    results.forEach(item => {
      const match = findDisagreement(item, informedDisagreements);
      if (match) {
        item.informedDisagreement = match;
        item.isInformedDisagreement = true;
      }
    });

    return results;
  }, [atuaResult, enrichedTranscunhaData, tolerance, rateTolerance, weightTolerance, informedDisagreements, activeStartDate, activeEndDate]);

  // Totais e KPIs da Conciliação
  const kpis = useMemo(() => {
    const total = reconciliationItems.length;
    const disagreementCount = reconciliationItems.filter(i => i.isInformedDisagreement).length;
    const conciliated = reconciliationItems.filter(i => i.status === 'CONCILIATED' && !i.isInformedDisagreement).length;
    const divergent = reconciliationItems.filter(i => i.status === 'DIVERGENT' && !i.isInformedDisagreement).length;
    const orphanAtua = reconciliationItems.filter(i => i.status === 'ORPHAN_ATUA' && !i.isInformedDisagreement).length;
    const pendingAtua = reconciliationItems.filter(i => i.status === 'PENDING_ATUA' && !i.isInformedDisagreement).length;
    const similarCount = reconciliationItems.filter(i => Boolean(i.similarMatch?.isLikelyReissueOrDisagreement) && !i.isInformedDisagreement).length;

    // Subtotais de tipos de divergência (apenas itens ativos sem desacordo informado)
    const divergentCte = reconciliationItems.filter(i => !i.isInformedDisagreement && i.status === 'DIVERGENT' && i.isCteDivergent).length;
    const divergentCompanyFreight = reconciliationItems.filter(i => !i.isInformedDisagreement && i.status === 'DIVERGENT' && (i.isCompanyFreightDivergent || i.isCompanyRateDivergent)).length;
    const divergentDriverFreight = reconciliationItems.filter(i => !i.isInformedDisagreement && i.status === 'DIVERGENT' && (i.isDriverFreightDivergent || i.isDriverRateDivergent)).length;
    const divergentWeight = reconciliationItems.filter(i => !i.isInformedDisagreement && i.status === 'DIVERGENT' && i.isWeightDivergent).length;
    const divergentToll = reconciliationItems.filter(i => !i.isInformedDisagreement && i.status === 'DIVERGENT' && i.isTollDivergent).length;
    const divergentIcms = reconciliationItems.filter(i => !i.isInformedDisagreement && i.status === 'DIVERGENT' && i.isIcmsDivergent).length;

    // Totais Atua x Transcunha desconsiderando desacordos comerciais registrados
    const activeItems = reconciliationItems.filter(i => !i.isInformedDisagreement);

    const totalCompanyFreightAtua = activeItems.reduce((acc, i) => acc + (i.atua?.companyFreight || 0), 0);
    const totalCompanyFreightTrans = activeItems.reduce((acc, i) => acc + (i.transcunha?.companyFreight || 0), 0);
    const sumDeltaCompany = totalCompanyFreightTrans - totalCompanyFreightAtua;

    const totalDriverFreightAtua = activeItems.reduce((acc, i) => acc + (i.atua?.driverFreight || 0), 0);
    const totalDriverFreightTrans = activeItems.reduce((acc, i) => acc + (i.transcunha?.driverFreight || 0), 0);
    const sumDeltaDriver = totalDriverFreightTrans - totalDriverFreightAtua;

    const totalWeightAtua = activeItems.reduce((acc, i) => acc + (i.atua?.weight || 0), 0);
    const totalWeightTrans = activeItems.reduce((acc, i) => acc + (i.transcunha?.weight || 0), 0);
    const sumDeltaWeight = totalWeightTrans - totalWeightAtua;

    const totalNetProfitAtua = activeItems.reduce((acc, i) => acc + (i.atua?.netProfit || 0), 0);
    const totalNetProfitTrans = activeItems.reduce((acc, i) => acc + (i.transcunha?.netProfit || 0), 0);
    const sumDeltaResult = totalNetProfitTrans - totalNetProfitAtua;
    const sumDeltaToll = activeItems.reduce((acc, i) => acc + (i.delta.toll || 0), 0);
    const sumDisagreementFreight = reconciliationItems.filter(i => i.isInformedDisagreement).reduce((acc, i) => acc + (i.atua?.companyFreight || i.transcunha?.companyFreight || 0), 0);

    return {
      total,
      disagreementCount,
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
      totalCompanyFreightAtua,
      totalCompanyFreightTrans,
      sumDeltaCompany,
      totalDriverFreightAtua,
      totalDriverFreightTrans,
      sumDeltaDriver,
      totalWeightAtua,
      totalWeightTrans,
      sumDeltaWeight,
      totalNetProfitAtua,
      totalNetProfitTrans,
      sumDeltaResult,
      sumDeltaToll,
      sumDisagreementFreight
    };
  }, [reconciliationItems]);

  // Itens Filtrados
  const filteredItems = useMemo(() => {
    return reconciliationItems.filter(item => {
      // Filtro de Status
      if (filterStatus === 'DISAGREEMENT') {
        if (!item.isInformedDisagreement) return false;
      } else if (filterStatus === 'SIMILAR') {
        if (!item.similarMatch?.isLikelyReissueOrDisagreement) return false;
      } else if (filterStatus !== 'ALL') {
        if (item.isInformedDisagreement) return false;
        if (item.status !== filterStatus) return false;
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
        const matchesCte = item.cteNumber.toLowerCase().includes(term) || 
                           item.cteNumberTrans.toLowerCase().includes(term) || 
                           item.cteNumberAtua.toLowerCase().includes(term) ||
                           (item.allCteNumbers && item.allCteNumbers.some(c => c.toLowerCase().includes(term)));
        const matchesPlate = item.plate.toLowerCase().includes(term);
        const matchesShipment = item.shipmentId?.toLowerCase().includes(term);
        const matchesDriver = item.driverName?.toLowerCase().includes(term);
        const matchesClient = item.clientName?.toLowerCase().includes(term);
        const matchesDisagreement = item.isInformedDisagreement && (
          item.informedDisagreement?.reason.toLowerCase().includes(term) ||
          item.informedDisagreement?.substituteCte?.toLowerCase().includes(term) ||
          item.informedDisagreement?.notes?.toLowerCase().includes(term)
        );
        if (!matchesCte && !matchesPlate && !matchesShipment && !matchesDriver && !matchesClient && !matchesDisagreement) {
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
    const periodStr = activeStartDate && activeEndDate ? `${activeStartDate} a ${activeEndDate}` : 'Todos os períodos';
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
      let statusText = item.isInformedDisagreement
        ? `Desacordo Comercial${item.informedDisagreement?.substituteCte ? ` (Subst: ${item.informedDisagreement.substituteCte})` : ''}`
        : item.status === 'CONCILIATED' ? '100% OK (Conciliado)' :
          item.status === 'DIVERGENT' ? 'Divergente' :
          item.status === 'ORPHAN_ATUA' ? 'Órfão no Atua' : 'Pendente Atua';

      if (!item.isInformedDisagreement && item.similarMatch && item.similarMatch.similarityScore >= 60) {
        statusText += ` (Desacordo ${item.similarMatch.similarityScore}%)`;
      }

      const cteAtuaStr = item.cteNumberAtua ? `CT-e ${item.cteNumberAtua}${item.atuaUf ? ` [${item.atuaUf}]` : ''}` : '---';
      const cteTransStr = item.cteNumberTrans ? `CT-e ${item.cteNumberTrans}${item.transUf ? ` [${item.transUf}]` : ''}` : 'S/ CT-e';

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

      const row = [
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
      (row as any)._item = item;
      return row;
    });

    autoTable(doc, {
      head: [headRow],
      body: tableData,
      startY: 26,
      margin: { left: 6, right: 6 },
      styles: { fontSize: 5.2, cellPadding: 1.1, halign: 'center', valign: 'middle', textColor: [51, 65, 85] },
      headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      didParseCell: (data) => {
        if (data.section === 'body') {
          const rawRow = Array.isArray(data.row.raw) ? (data.row.raw as any) : [];
          const item: ReconciliationItem | undefined = rawRow?._item || filteredItems[data.row.index];
          const colIdx = data.column.index;
          if (!item) return;

          // Por padrão, texto neutro ardósia/grafite
          data.cell.styles.textColor = [51, 65, 85];
          data.cell.styles.fontStyle = 'normal';

          // 4. Status Auditoria
          if (colIdx === 4) {
            if (item.isInformedDisagreement) {
              data.cell.styles.textColor = [126, 34, 206]; // purple
              data.cell.styles.fontStyle = 'bold';
            } else if (item.status === 'DIVERGENT') {
              data.cell.styles.textColor = [185, 28, 28]; // red
              data.cell.styles.fontStyle = 'bold';
            } else if (item.status === 'CONCILIATED') {
              data.cell.styles.textColor = [21, 128, 61]; // green
              data.cell.styles.fontStyle = 'bold';
            } else if (item.status === 'ORPHAN_ATUA') {
              data.cell.styles.textColor = [126, 34, 206]; // purple
              data.cell.styles.fontStyle = 'bold';
            } else if (item.status === 'PENDING_ATUA') {
              data.cell.styles.textColor = [217, 119, 6]; // amber
              data.cell.styles.fontStyle = 'bold';
            }
            return;
          }

          // Apenas destacar em vermelho as células cujo campo possui divergência real apurada (se não for desacordo formalizado)
          let isCellDivergent = false;
          if (!item.isInformedDisagreement) {
            // 2 e 3: CT-e Atua e CT-e Trans
            if ((colIdx === 2 || colIdx === 3) && item.isCteDivergent) {
              isCellDivergent = true;
            }
            // 5 e 6: Frete Empresa (Trans) e Frete Empresa (Atua)
            else if ((colIdx === 5 || colIdx === 6) && item.isCompanyFreightDivergent) {
              isCellDivergent = true;
            }
            // 7: Tarifa Empresa (Trans/Atua)
            else if (colIdx === 7 && item.isCompanyRateDivergent) {
              isCellDivergent = true;
            }
            // 8 e 9: Frete Motorista (Trans) e Frete Motorista (Atua)
            else if ((colIdx === 8 || colIdx === 9) && item.isDriverFreightDivergent) {
              isCellDivergent = true;
            }
            // 10: Tarifa Motorista (Trans/Atua)
            else if (colIdx === 10 && item.isDriverRateDivergent) {
              isCellDivergent = true;
            }
            // 11 e 12: Peso Trans (t) e Peso Atua (t)
            else if ((colIdx === 11 || colIdx === 12) && item.isWeightDivergent) {
              isCellDivergent = true;
            }
            // 13: Pedágio (Trans/Atua)
            else if (colIdx === 13 && item.isTollDivergent) {
              isCellDivergent = true;
            }
            // 14: ICMS (Trans/Atua)
            else if (colIdx === 14 && item.isIcmsDivergent) {
              isCellDivergent = true;
            }
          }

          if (isCellDivergent) {
            data.cell.styles.textColor = [185, 28, 28]; // red
            data.cell.styles.fontStyle = 'bold';
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
      'UF Atua',
      'CT-e Transcunha',
      'UF Transcunha',
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

      const statusText = item.isInformedDisagreement
        ? `Desacordo Comercial${item.informedDisagreement?.substituteCte ? ` (Subst: ${item.informedDisagreement.substituteCte})` : ''} - ${item.informedDisagreement?.reason || ''}`
        : item.status === 'CONCILIATED' ? '100% OK (Conciliado)' :
          item.status === 'DIVERGENT' ? 'Divergente' :
          item.status === 'ORPHAN_ATUA' ? 'Orfao no Atua' : 'Pendente Atua';

      const row = [
        item.plate,
        item.date || '',
        item.cteNumberAtua ? `CT-e ${item.cteNumberAtua}` : '',
        item.atuaUf || '',
        item.cteNumberTrans ? `CT-e ${item.cteNumberTrans}` : '',
        item.transUf || '',
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

      {/* PAINEL DE KPIS DA AUDITORIA - ATUA X TRANSCUNHA */}
      {reconciliationItems.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Card 1: Faturamento Total Frete Empresa */}
          <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-800 border border-blue-200 dark:border-blue-900/50 shadow-2xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-blue-500" />
                  Frete Empresa
                </p>
                <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-900/50">
                  Atua x Trans
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-2">
                <div className="bg-slate-50 dark:bg-slate-900/50 p-2 rounded-xl">
                  <span className="text-[9px] uppercase font-bold text-slate-400 block">Atua</span>
                  <span className="text-xs sm:text-sm font-black text-slate-900 dark:text-white truncate block">
                    R$ {kpis.totalCompanyFreightAtua.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="bg-slate-50 dark:bg-slate-900/50 p-2 rounded-xl">
                  <span className="text-[9px] uppercase font-bold text-slate-400 block">Transcunha</span>
                  <span className="text-xs sm:text-sm font-black text-slate-900 dark:text-white truncate block">
                    R$ {kpis.totalCompanyFreightTrans.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>
            <div className="pt-2 mt-2 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between text-[11px]">
              <span className="text-slate-400 font-medium">Diferença (Δ):</span>
              <span className={`font-bold ${
                Math.abs(kpis.sumDeltaCompany) < 0.01 ? 'text-emerald-500' :
                kpis.sumDeltaCompany > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
              }`}>
                {kpis.sumDeltaCompany >= 0 ? '+' : ''}R$ {kpis.sumDeltaCompany.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          {/* Card 2: Faturamento Total Frete Motorista */}
          <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-800 border border-amber-200 dark:border-amber-900/50 shadow-2xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                  <Truck className="w-3.5 h-3.5 text-amber-500" />
                  Frete Motorista
                </p>
                <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-900/50">
                  Atua x Trans
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-2">
                <div className="bg-slate-50 dark:bg-slate-900/50 p-2 rounded-xl">
                  <span className="text-[9px] uppercase font-bold text-slate-400 block">Atua</span>
                  <span className="text-xs sm:text-sm font-black text-slate-900 dark:text-white truncate block">
                    R$ {kpis.totalDriverFreightAtua.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="bg-slate-50 dark:bg-slate-900/50 p-2 rounded-xl">
                  <span className="text-[9px] uppercase font-bold text-slate-400 block">Transcunha</span>
                  <span className="text-xs sm:text-sm font-black text-slate-900 dark:text-white truncate block">
                    R$ {kpis.totalDriverFreightTrans.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>
            <div className="pt-2 mt-2 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between text-[11px]">
              <span className="text-slate-400 font-medium">Diferença (Δ):</span>
              <span className={`font-bold ${
                Math.abs(kpis.sumDeltaDriver) < 0.01 ? 'text-emerald-500' :
                kpis.sumDeltaDriver > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
              }`}>
                {kpis.sumDeltaDriver >= 0 ? '+' : ''}R$ {kpis.sumDeltaDriver.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          {/* Card 3: Peso Total Carregado */}
          <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-800 border border-purple-200 dark:border-purple-900/50 shadow-2xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400 flex items-center gap-1.5">
                  <Scale className="w-3.5 h-3.5 text-purple-500" />
                  Peso Carregado
                </p>
                <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 border border-purple-200 dark:border-purple-900/50">
                  Atua x Trans
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-2">
                <div className="bg-slate-50 dark:bg-slate-900/50 p-2 rounded-xl">
                  <span className="text-[9px] uppercase font-bold text-slate-400 block">Atua</span>
                  <span className="text-xs sm:text-sm font-black text-slate-900 dark:text-white truncate block">
                    {kpis.totalWeightAtua.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} t
                  </span>
                </div>
                <div className="bg-slate-50 dark:bg-slate-900/50 p-2 rounded-xl">
                  <span className="text-[9px] uppercase font-bold text-slate-400 block">Transcunha</span>
                  <span className="text-xs sm:text-sm font-black text-slate-900 dark:text-white truncate block">
                    {kpis.totalWeightTrans.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} t
                  </span>
                </div>
              </div>
            </div>
            <div className="pt-2 mt-2 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between text-[11px]">
              <span className="text-slate-400 font-medium">Diferença (Δ):</span>
              <span className={`font-bold ${
                Math.abs(kpis.sumDeltaWeight) < 0.01 ? 'text-emerald-500' :
                kpis.sumDeltaWeight > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
              }`}>
                {kpis.sumDeltaWeight >= 0 ? '+' : ''}{kpis.sumDeltaWeight.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} t
              </span>
            </div>
          </div>

          {/* Card 4: Conciliação Geral */}
          <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-800 border border-emerald-200 dark:border-emerald-900/50 shadow-2xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  Conciliação
                </p>
                <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/50">
                  {kpis.conciliatedPercent.toFixed(1)}% OK
                </span>
              </div>
              <div className="mt-2">
                <div className="flex items-baseline justify-between">
                  <span className="text-lg font-black text-emerald-600 dark:text-emerald-400">
                    {kpis.conciliated}
                    <span className="text-xs font-normal text-slate-400 ml-1">/ {kpis.total} CT-es</span>
                  </span>
                </div>
                <div className="w-full bg-emerald-100 dark:bg-emerald-950/60 h-1.5 rounded-full mt-2 overflow-hidden">
                  <div className="bg-emerald-500 h-full rounded-full transition-all duration-500" style={{ width: `${kpis.conciliatedPercent}%` }} />
                </div>
              </div>
            </div>
            <div className="pt-2 mt-2 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400">
              <span className="text-rose-600 dark:text-rose-400 font-semibold">{kpis.divergent} div.</span>
              <span className="text-purple-600 dark:text-purple-400 font-semibold">{kpis.orphanAtua} órfãos</span>
              <span className="text-amber-600 dark:text-amber-400 font-semibold">{kpis.pendingAtua} pend.</span>
            </div>
          </div>

          {/* Card 5: Δ Lucro / Resultado Líquido */}
          <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-800 border border-indigo-200 dark:border-indigo-900/50 shadow-2xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
                  <DollarSign className="w-3.5 h-3.5 text-indigo-500" />
                  Δ Lucro / Resultado
                </p>
                <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-900/50">
                  Líquido
                </span>
              </div>
              <div className="mt-2">
                <p className={`text-base sm:text-lg font-black truncate ${
                  kpis.sumDeltaResult > 0 ? 'text-emerald-600 dark:text-emerald-400' :
                  kpis.sumDeltaResult < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-700 dark:text-slate-300'
                }`}>
                  {kpis.sumDeltaResult >= 0 ? '+' : ''}R$ {kpis.sumDeltaResult.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>
            </div>
            <div className="pt-2 mt-2 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400">
              <span title="Lucro Real Transcunha">Trans: R$ {kpis.totalNetProfitTrans.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
              <span title="Resultado Atua">Atua: R$ {kpis.totalNetProfitAtua.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
            </div>
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

          {kpis.disagreementCount > 0 && (
            <button
              type="button"
              onClick={() => setFilterStatus(filterStatus === 'DISAGREEMENT' ? 'ALL' : 'DISAGREEMENT')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
                filterStatus === 'DISAGREEMENT'
                  ? 'bg-purple-700 text-white shadow-xs'
                  : 'bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 hover:bg-purple-100 border border-purple-200/50'
              }`}
              title="CT-es com desacordo comercial formalizado"
            >
              <FileWarning className="w-3 h-3 text-purple-600 dark:text-purple-400" />
              Desacordo Comercial ({kpis.disagreementCount})
            </button>
          )}

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
                              {item.atuaUf && (
                                <span className="text-[8px] font-extrabold px-1 py-0.2 rounded bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-600" title={`Filial Atua: ${item.atuaBranch || item.atuaUf}`}>
                                  [{item.atuaUf}]
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-[9px] font-bold text-slate-400">Trans:</span>
                              <span className={`font-mono font-bold ${
                                item.isCteDivergent ? 'text-rose-600 dark:text-rose-400' : 'text-slate-700 dark:text-slate-300'
                              }`}>
                                {item.cteNumberTrans ? `CT-e ${item.cteNumberTrans}` : 'S/ CT-e'}
                              </span>
                              {item.transUf && (
                                <span className="text-[8px] font-extrabold px-1 py-0.2 rounded bg-indigo-100 text-indigo-700 dark:bg-indigo-950/80 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800" title={`Filial Transcunha: ${item.transBranch || item.transUf}`}>
                                  [{item.transUf}]
                                </span>
                              )}
                              {item.isComplementary && (
                                <span className="text-[8px] font-black px-1.5 py-0.2 rounded bg-purple-100 text-purple-800 dark:bg-purple-900/60 dark:text-purple-200 border border-purple-200 dark:border-purple-700" title="CT-e de Complemento de Frete">
                                  Compl.
                                </span>
                              )}
                            </div>
                            {item.isCteDivergent && item.status !== 'ORPHAN_ATUA' && item.status !== 'PENDING_ATUA' && (
                              <span className="inline-block text-[8px] font-extrabold px-1.5 py-0.2 rounded bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-300">
                                CT-e Divergente
                              </span>
                            )}
                          </div>
                        </td>

                        {/* 3. Cliente / Trajeto */}
                        <td className="py-2.5 px-2 max-w-[130px] sm:max-w-[220px] lg:max-w-[320px]">
                          <p className="font-semibold text-slate-900 dark:text-white truncate sm:overflow-visible sm:whitespace-normal" title={item.clientName}>
                            {item.clientName || '---'}
                          </p>
                          <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate sm:overflow-visible sm:whitespace-normal" title={`${item.origin} → ${item.destination}`}>
                            {item.origin || '---'} → {item.destination || '---'}
                          </p>
                        </td>

                        {/* 4. Status */}
                        <td className="py-2.5 px-2 text-center whitespace-nowrap">
                          {item.isInformedDisagreement ? (
                            <div className="flex flex-col items-center gap-1">
                              <button
                                type="button"
                                onClick={() => setSelectedDisagreementItem(item)}
                                className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-black bg-purple-100 text-purple-900 dark:bg-purple-900/60 dark:text-purple-200 border border-purple-300 dark:border-purple-700 hover:bg-purple-200 transition-colors cursor-pointer shadow-xs"
                                title={`Desacordo Comercial Registrado: ${item.informedDisagreement?.reason}. Clique para gerenciar.`}
                              >
                                <FileWarning className="w-2.5 h-2.5 text-amber-500" />
                                Desacordo Comercial
                              </button>
                              {item.informedDisagreement?.substituteCte && (
                                <span className="text-[8.5px] font-bold text-slate-500 dark:text-slate-400">
                                  Subst: CT-e {item.informedDisagreement.substituteCte}
                                </span>
                              )}
                            </div>
                          ) : item.status === 'CONCILIATED' ? (
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
                          {item.isWeightDivergent ? (
                            <p className="text-[9px] font-bold text-rose-600">
                              Δ {item.delta.weight > 0 ? '+' : ''}{item.delta.weight.toFixed(2)} t
                            </p>
                          ) : item.isComplementary ? (
                            <p className="text-[8.5px] font-semibold text-purple-600 dark:text-purple-400">
                              Complementar
                            </p>
                          ) : null}
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
                            {item.isComplementary ? (
                              <span className="text-[8.5px] font-semibold text-purple-600 dark:text-purple-400">
                                Complementar (Valor Fixo)
                              </span>
                            ) : (
                              <>
                                <span className="text-[9px] text-slate-400 mr-1">R$/t:</span>
                                <span>{item.transcunha?.companyRatePerTon ? `R$ ${item.transcunha.companyRatePerTon.toFixed(2)}` : '---'}</span>
                                <span className="text-slate-400 mx-0.5">/</span>
                                <span>{item.atua?.companyRatePerTon ? `R$ ${item.atua.companyRatePerTon.toFixed(2)}` : '---'}</span>
                              </>
                            )}
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
                          ) : item.isComplementary ? (
                            <p className="text-[9px] font-medium text-emerald-600 dark:text-emerald-400">
                              ✓ Frete Total Conciliado
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
                            {item.isComplementary ? (
                              <span className="text-[8.5px] font-semibold text-purple-600 dark:text-purple-400">
                                Complementar (Valor Fixo)
                              </span>
                            ) : (
                              <>
                                <span className="text-[9px] text-slate-400 mr-1">R$/t:</span>
                                <span>{item.transcunha?.driverRatePerTon ? `R$ ${item.transcunha.driverRatePerTon.toFixed(2)}` : '---'}</span>
                                <span className="text-slate-400 mx-0.5">/</span>
                                <span>{item.atua?.driverRatePerTon ? `R$ ${item.atua.driverRatePerTon.toFixed(2)}` : '---'}</span>
                              </>
                            )}
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
                          ) : item.isComplementary ? (
                            <p className="text-[9px] font-medium text-emerald-600 dark:text-emerald-400">
                              ✓ Frete Total Conciliado
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
                              className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
                              title="Expandir auditoria dos 6 pilares"
                            >
                              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </button>

                            {/* Botão Informar / Gerenciar Desacordo Comercial */}
                            <button
                              type="button"
                              onClick={() => setSelectedDisagreementItem(item)}
                              className={`p-1 rounded-lg transition-colors cursor-pointer ${
                                item.isInformedDisagreement
                                  ? 'bg-purple-100 text-purple-900 dark:bg-purple-900/60 dark:text-purple-200 border border-purple-300 dark:border-purple-700 shadow-xs'
                                  : 'bg-slate-100 hover:bg-purple-50 text-slate-500 hover:text-purple-700 dark:bg-slate-700 dark:hover:bg-purple-950/40 dark:hover:text-purple-300'
                              }`}
                              title={
                                item.isInformedDisagreement
                                  ? `Desacordo Comercial informado: ${item.informedDisagreement?.reason}. Clique para gerenciar.`
                                  : 'Informar Desacordo Comercial para este CT-e'
                              }
                            >
                              <FileWarning className="w-4 h-4" />
                            </button>

                            {item.shipment && onOpenShipmentDetail && (
                              <button
                                type="button"
                                onClick={() => onOpenShipmentDetail(item.shipment!)}
                                className="p-1 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 transition-colors cursor-pointer"
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
                              <div className="flex flex-wrap items-center justify-between border-b dark:border-slate-700 pb-2 gap-2">
                                <div className="flex items-center gap-2">
                                  <FileText className="w-4 h-4 text-indigo-600" />
                                  <span className="font-bold text-slate-800 dark:text-slate-100">
                                    Auditoria Detalhada de Valores: Placa {item.plate} ({item.date || 's/ data'})
                                  </span>
                                </div>
                                <div className="flex flex-wrap items-center gap-3">
                                  <button
                                    type="button"
                                    onClick={() => setSelectedDisagreementItem(item)}
                                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer ${
                                      item.isInformedDisagreement
                                        ? 'bg-purple-700 hover:bg-purple-800 text-white'
                                        : 'bg-slate-200 hover:bg-purple-100 text-slate-800 dark:bg-slate-700 dark:hover:bg-purple-900/50 dark:text-slate-100'
                                    }`}
                                  >
                                    <FileWarning className="w-3.5 h-3.5 text-amber-400" />
                                    {item.isInformedDisagreement ? 'Gerenciar Desacordo Comercial' : 'Informar Desacordo Comercial'}
                                  </button>
                                  <div className="text-[11px] text-slate-500 flex items-center gap-3">
                                    <span>ID Embarque: <strong>{item.shipmentId || '---'}</strong></span>
                                    <span>Motorista: <strong>{item.driverName || '---'}</strong></span>
                                    <span>Cliente: <strong>{item.clientName || '---'}</strong></span>
                                  </div>
                                </div>
                              </div>

                              {/* BANNER DE DESACORDO COMERCIAL FORMALIZADO */}
                              {item.isInformedDisagreement && item.informedDisagreement && (
                                <div className="p-3.5 rounded-xl bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800">
                                  <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                                    <div className="flex items-center gap-2">
                                      <FileWarning className="w-4 h-4 text-purple-700 dark:text-purple-300" />
                                      <span className="font-bold text-xs text-purple-950 dark:text-purple-100">
                                        Desacordo Comercial Formalizado no Sistema
                                      </span>
                                    </div>
                                    <span className="text-[10px] text-purple-700 dark:text-purple-300 font-medium">
                                      Informado em {new Date(item.informedDisagreement.informedAt).toLocaleDateString('pt-BR')} por {item.informedDisagreement.informedBy || 'Usuário'}
                                    </span>
                                  </div>
                                  <div className="text-xs text-purple-900 dark:text-purple-200 space-y-1">
                                    <p><strong>Motivo:</strong> {item.informedDisagreement.reason}</p>
                                    {item.informedDisagreement.substituteCte && (
                                      <p><strong>CT-e Substituto / Reemitido:</strong> CT-e {item.informedDisagreement.substituteCte}</p>
                                    )}
                                    {item.informedDisagreement.notes && (
                                      <p><strong>Observações:</strong> {item.informedDisagreement.notes}</p>
                                    )}
                                    <p className="text-[10.5px] text-purple-700 dark:text-purple-400 italic pt-1">
                                      ✓ Este CT-e não gera pendência financeira de frete ou pedágio pois foi contestado comercialmente.
                                    </p>
                                  </div>
                                </div>
                              )}

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
                                    {!item.isComplementary && (
                                      <><br /><span className="text-[9px] text-slate-400 font-sans">({item.transcunha?.companyRatePerTon.toFixed(2) || '0.00'}/t)</span></>
                                    )}
                                  </p>
                                  <p className="text-[10px] font-mono mt-0.5">
                                    <span className="text-slate-500">Atua:</span> R$ {item.atua?.companyFreight.toFixed(2) || '0.00'}
                                    {!item.isComplementary && (
                                      <><br /><span className="text-[9px] text-slate-400 font-sans">({item.atua?.companyRatePerTon.toFixed(2) || '0.00'}/t)</span></>
                                    )}
                                  </p>
                                  <p className={`text-[10px] font-bold mt-1 ${(item.isCompanyFreightDivergent || item.isCompanyRateDivergent) ? 'text-rose-600' : 'text-emerald-600'}`}>
                                    {(item.isCompanyFreightDivergent || item.isCompanyRateDivergent) 
                                      ? `Δ R$ ${item.delta.companyFreight.toFixed(2)}` 
                                      : item.isCompanyFreightReconciledByToll 
                                        ? '✓ Conciliado c/ Pedágio' 
                                        : item.isComplementary
                                          ? '✓ Frete Total Conciliado'
                                          : '✓ Confere'}
                                  </p>
                                </div>

                                {/* 3. Frete Motorista */}
                                <div className={`p-2.5 rounded-xl border ${(item.isDriverFreightDivergent || item.isDriverRateDivergent) ? 'bg-rose-50/50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'}`}>
                                  <p className="text-[9px] uppercase font-bold text-slate-400">3. Frete Motorista</p>
                                  <p className="text-[10px] font-mono mt-1">
                                    <span className="text-slate-500">Trans:</span> R$ {item.transcunha?.driverFreight.toFixed(2) || '0.00'}
                                    {!item.isComplementary && (
                                      <><br /><span className="text-[9px] text-slate-400 font-sans">({item.transcunha?.driverRatePerTon.toFixed(2) || '0.00'}/t)</span></>
                                    )}
                                  </p>
                                  <p className="text-[10px] font-mono mt-0.5">
                                    <span className="text-slate-500">Atua:</span> R$ {item.atua?.driverFreight.toFixed(2) || '0.00'}
                                    {!item.isComplementary && (
                                      <><br /><span className="text-[9px] text-slate-400 font-sans">({item.atua?.driverRatePerTon.toFixed(2) || '0.00'}/t)</span></>
                                    )}
                                  </p>
                                  <p className={`text-[10px] font-bold mt-1 ${(item.isDriverFreightDivergent || item.isDriverRateDivergent) ? 'text-rose-600' : 'text-emerald-600'}`}>
                                    {(item.isDriverFreightDivergent || item.isDriverRateDivergent) 
                                      ? `Δ R$ ${item.delta.driverFreight.toFixed(2)}` 
                                      : item.isDriverFreightReconciledByToll 
                                        ? '✓ Conciliado c/ Pedágio' 
                                        : item.isComplementary
                                          ? '✓ Frete Total Conciliado'
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
                                    {item.isWeightDivergent 
                                      ? `Δ ${item.delta.weight.toFixed(2)} t` 
                                      : item.isComplementary
                                        ? '✓ Complementar'
                                        : '✓ Confere'}
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

      {/* MODAL DE INFORMAR / EDITAR DESACORDO COMERCIAL */}
      {selectedDisagreementItem && (
        <DisagreementModal
          item={selectedDisagreementItem}
          onClose={() => setSelectedDisagreementItem(null)}
          onSave={handleSaveDisagreement}
          onRemove={handleRemoveDisagreement}
          currentUserName={currentUser?.name || currentUser?.email || 'Usuário'}
        />
      )}
    </div>
  );
};

interface DisagreementModalProps {
  item: ReconciliationItem;
  onClose: () => void;
  onSave: (data: InformedDisagreement) => void;
  onRemove: (cteNumber: string) => void;
  currentUserName: string;
}

const DisagreementModal: React.FC<DisagreementModalProps> = ({
  item,
  onClose,
  onSave,
  onRemove,
  currentUserName
}) => {
  const existing = item.informedDisagreement;
  const initialCte = item.cteNumberAtua || item.cteNumberTrans || item.cteNumber;

  const [cteNumber, setCteNumber] = useState(existing?.cteNumber || initialCte || '');
  const [reason, setReason] = useState(existing?.reason || 'Prestação de serviço em desacordo (SEFAZ)');
  const [substituteCte, setSubstituteCte] = useState(existing?.substituteCte || item.similarMatch?.targetCte || '');
  const [notes, setNotes] = useState(existing?.notes || '');
  const [date, setDate] = useState(existing?.date || item.date || new Date().toISOString().split('T')[0]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cteNumber.trim()) return;

    onSave({
      cteNumber: cteNumber.trim(),
      plate: item.plate,
      date: date || item.date,
      reason,
      substituteCte: substituteCte.trim(),
      notes: notes.trim(),
      informedAt: existing?.informedAt || new Date().toISOString(),
      informedBy: existing?.informedBy || currentUserName
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 max-w-lg w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between border-b dark:border-slate-700 pb-3">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300">
              <FileWarning className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {existing ? 'Editar Desacordo Comercial' : 'Informar Desacordo Comercial'}
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Formalize a manifestação de desacordo / recusa fiscal deste CT-e
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Card Resumo do CT-e */}
        <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 text-xs space-y-1.5">
          <div className="flex justify-between items-center">
            <span className="text-slate-500 font-medium">CT-e / Placa:</span>
            <span className="font-mono font-bold text-slate-900 dark:text-white">
              CT-e {initialCte} • Placa {item.plate}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-slate-500 font-medium">Data / Filial:</span>
            <span className="font-medium text-slate-800 dark:text-slate-200">
              {item.date ? new Date(item.date + 'T00:00:00').toLocaleDateString('pt-BR') : 's/ data'} • {item.atuaBranch || item.transBranch || 'Filial'}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-slate-500 font-medium">Trajeto:</span>
            <span className="font-medium text-slate-800 dark:text-slate-200 truncate max-w-[260px]" title={`${item.origin} → ${item.destination}`}>
              {item.origin} → {item.destination}
            </span>
          </div>
          <div className="flex justify-between items-center pt-1 border-t border-slate-200/60 dark:border-slate-700/60">
            <span className="text-slate-500 font-medium">Frete Empresa / Pedágio:</span>
            <span className="font-mono font-bold text-slate-900 dark:text-white">
              R$ {(item.atua?.companyFreight ?? item.transcunha?.companyFreight ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              {Boolean(item.atua?.toll || item.transcunha?.toll) && (
                <span className="text-slate-400 font-normal"> + Pedágio R$ {(item.atua?.toll ?? item.transcunha?.toll ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
              )}
            </span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          {/* CT-e Número */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              Número do CT-e com Desacordo:
            </label>
            <input
              type="text"
              required
              value={cteNumber}
              onChange={(e) => setCteNumber(e.target.value)}
              className="w-full px-3 py-2 rounded-xl text-xs font-mono font-bold bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 focus:outline-hidden focus:ring-2 focus:ring-purple-500"
              placeholder="Ex: 2089"
            />
          </div>

          {/* Motivo do Desacordo */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              Motivo do Desacordo Comercial:
            </label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-medium focus:outline-hidden focus:ring-2 focus:ring-purple-500"
            >
              <option value="Prestação de serviço em desacordo (SEFAZ)">Prestação de serviço em desacordo (SEFAZ)</option>
              <option value="CT-e cancelado fora do prazo fiscal">CT-e cancelado fora do prazo fiscal</option>
              <option value="CT-e substituído por nova numeração">CT-e substituído por nova numeração</option>
              <option value="Erro de emissão / Reemitido no Atua">Erro de emissão / Reemitido no Atua</option>
              <option value="Carga recusada pelo tomador / cliente">Carga recusada pelo tomador / cliente</option>
              <option value="Outro motivo">Outro motivo</option>
            </select>
          </div>

          {/* CT-e Substituto (se houver) */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center justify-between">
              <span>CT-e Substituto / Novo CT-e: <span className="text-[10px] font-normal text-slate-400">(Opcional)</span></span>
            </label>
            <input
              type="text"
              value={substituteCte}
              onChange={(e) => setSubstituteCte(e.target.value)}
              placeholder="Ex: 2091 ou 2092"
              className="w-full px-3 py-2 rounded-xl text-xs font-mono bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 focus:outline-hidden focus:ring-2 focus:ring-purple-500"
            />
            <p className="text-[10px] text-slate-400 mt-0.5">
              Informe o número do novo CT-e emitido para substituir esta operação, se aplicável.
            </p>
          </div>

          {/* Observações */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              Observações / Justificativa: <span className="text-[10px] font-normal text-slate-400">(Opcional)</span>
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex: Manifestação realizada na SEFAZ pelo tomador..."
              className="w-full p-2.5 rounded-xl text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 focus:outline-hidden focus:ring-2 focus:ring-purple-500"
            />
          </div>

          {/* Ações */}
          <div className="flex items-center justify-between pt-3 border-t dark:border-slate-700">
            {existing ? (
              <button
                type="button"
                onClick={() => onRemove(cteNumber)}
                className="px-3 py-2 rounded-xl text-xs font-bold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-rose-200 dark:border-rose-800 flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Remover Desacordo
              </button>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl text-xs font-bold bg-purple-700 hover:bg-purple-800 text-white shadow-md flex items-center gap-1.5 cursor-pointer transition-all"
              >
                <Check className="w-3.5 h-3.5" />
                Salvar Desacordo
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AtuaReconciliationPage;
