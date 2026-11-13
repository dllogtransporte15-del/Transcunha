import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import type {
  FinancialTransaction,
  Shipment,
  Cargo,
  Client,
  User,
  Branch,
  FinancialInvoice,
  InvoicePaymentStatus,
  PayrollSettlementDoc,
  PayrollAdvanceRecord,
  PayrollAdvanceItem,
  PayrollAdvanceInstallment,
  TaxType
} from '../../types';
import { FinancialTransactionStatus, UserProfile, ShipmentStatus, INTERNAL_PROFILES, FinancialCategoryType } from '../../types';
import { isDeveloperUser, isDemoUser } from '../../auth';
import { isShipment100PercentAdvance } from '../../utils/freightCalculation';
import {
  Landmark,
  Truck,
  Plus,
  Search,
  AlertCircle,
  CheckCircle2,
  Clock,
  DollarSign,
  Tag,
  FileText,
  ExternalLink,
  ArrowDownCircle,
  Eye,
  Download,
  X,
  Receipt,
  Award,
  Users,
  Calendar,
  CalendarClock,
  TrendingUp,
  CreditCard,
  Copy,
  Barcode,
  ChevronDown,
  ChevronUp,
  Building2,
  Trash2,
  Check,
  RefreshCw,
  Info,
  ChevronRight,
  Briefcase,
  Wallet,
  SlidersHorizontal,
  Edit3,
  Banknote,
  ShieldAlert,
  Paperclip,
  Upload,
  UploadCloud,
  FileCheck,
  History,
  CheckSquare,
  Layers,
  FolderCheck,
  Archive,
  Sparkles,
  AlertTriangle,
  UserX,
  RotateCcw,
  Loader2,
  Lock,
  Zap
} from 'lucide-react';
import { openDocumentInNewTab } from '../../utils/documentViewer';
import {
  financialInvoiceService,
  subscribeToFinancialInvoices,
  uploadInvoiceAttachmentToStorage
} from '../../services/financialInvoiceService';
import { parseBrazilianCurrency, formatBrl } from '../../utils/financialCalculations';
import { getShipmentCte, getShipmentEffectiveDate, isCteApplicableForStatus, parseDateToYmd, isShipmentEligibleForCommission, isShipmentEligibleByEndOfMonthException, COMMISSION_ELIGIBLE_STATUSES, isShipmentFaturado } from '../../utils';
import { calculateShipmentExpenses } from '../../utils/operationalExpensesCalculator';
import { useToast } from '../../hooks/useToast';
import { PayrollDocsModal } from './PayrollDocsModal';
import { AccountsPayableSettlementModal, type SettlingAccountItem } from './AccountsPayableSettlementModal';
import { InvoicesManagementTab } from './InvoicesManagementTab';
import { calculateBoletoLateFees } from '../../utils/invoiceExtractionService';
import { parseHoleriteFile, type ParsedHoleriteData } from '../../utils/holeriteParser';
import { TaxInvoiceImportModal, type TaxImportItem } from './TaxInvoiceImportModal';
import { TaxManualModal } from './TaxManualModal';
import { taxTransactionService } from '../../services/taxTransactionService';
import { parseReceiptFile } from '../../utils/sicrediReceiptParser';

export const formatMonthKeyToLabel = (monthKey: string): string => {
  if (!monthKey) return '-';
  const parts = monthKey.split('-');
  if (parts.length !== 2) return monthKey;
  const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const mIndex = parseInt(parts[1], 10) - 1;
  return `${months[mIndex] || parts[1]}/${parts[0]}`;
};

export const addMonthsToMonthKey = (monthKey: string, monthsToAdd: number): string => {
  if (!monthKey) return monthKey;
  const parts = monthKey.split('-');
  if (parts.length !== 2) return monthKey;
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10) - 1;
  const d = new Date(y, m + monthsToAdd, 1);
  const newY = d.getFullYear();
  const newM = String(d.getMonth() + 1).padStart(2, '0');
  return `${newY}-${newM}`;
};

export const addMonthsToDateString = (dateStr: string, monthsToAdd: number): string => {
  if (!dateStr || monthsToAdd === 0) return dateStr;
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  const d = new Date(year, month + monthsToAdd, day);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dayStr = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dayStr}`;
};

export const getMonthKeyFromDate = (dateStr?: string): string => {
  const d = dateStr ? new Date(dateStr + 'T00:00:00') : new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
};

export const calculateInstallments = (
  totalAmount: number,
  installmentsCount: number,
  startMonthKey: string
): PayrollAdvanceInstallment[] => {
  const count = Math.max(1, Math.floor(installmentsCount));
  const baseAmount = Math.floor((totalAmount / count) * 100) / 100;
  const remainder = Math.round((totalAmount - (baseAmount * count)) * 100) / 100;

  const result: PayrollAdvanceInstallment[] = [];
  for (let i = 0; i < count; i++) {
    const installmentNumber = i + 1;
    const monthKey = addMonthsToMonthKey(startMonthKey, i);
    const amount = i === 0 ? Number((baseAmount + remainder).toFixed(2)) : baseAmount;
    result.push({
      installmentNumber,
      totalInstallments: count,
      monthKey,
      amount,
      isSettled: false,
    });
  }
  return result;
};

export const TAX_TYPE_CONFIG: Record<TaxType | 'all', {
  label: string;
  shortLabel: string;
  category: string;
  badge: string;
  iconBg: string;
  iconColor: string;
  dotColor: string;
}> = {
  all: {
    label: 'Todos os Tributos',
    shortLabel: 'Todos',
    category: 'Todas as guias',
    badge: 'bg-purple-100 text-purple-900 dark:bg-purple-950/80 dark:text-purple-200 border-purple-300 dark:border-purple-700',
    iconBg: 'bg-purple-100 dark:bg-purple-950/60',
    iconColor: 'text-purple-600 dark:text-purple-400',
    dotColor: 'bg-purple-500'
  },
  PIS_COFINS: {
    label: 'PIS / COFINS (Sicalc)',
    shortLabel: 'PIS / COFINS',
    category: 'Federal • Sicalc',
    badge: 'bg-blue-100 text-blue-900 dark:bg-blue-950/80 dark:text-blue-200 border-blue-300 dark:border-blue-700',
    iconBg: 'bg-blue-100 dark:bg-blue-950/60',
    iconColor: 'text-blue-600 dark:text-blue-400',
    dotColor: 'bg-blue-500'
  },
  ICMS: {
    label: 'ICMS Transporte (DARE/GNRE)',
    shortLabel: 'ICMS Transporte',
    category: 'Estadual • SEFAZ',
    badge: 'bg-purple-100 text-purple-900 dark:bg-purple-950/80 dark:text-purple-200 border-purple-300 dark:border-purple-700',
    iconBg: 'bg-purple-100 dark:bg-purple-950/60',
    iconColor: 'text-purple-600 dark:text-purple-400',
    dotColor: 'bg-purple-500'
  },
  CSLL: {
    label: 'CSLL Estimativa Mensal',
    shortLabel: 'CSLL Estimativa',
    category: 'Federal • Contribuição Social',
    badge: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/80 dark:text-emerald-200 border-emerald-300 dark:border-emerald-700',
    iconBg: 'bg-emerald-100 dark:bg-emerald-950/60',
    iconColor: 'text-emerald-600 dark:text-emerald-400',
    dotColor: 'bg-emerald-500'
  },
  IRPJ: {
    label: 'IRPJ Estimativa Mensal',
    shortLabel: 'IRPJ Estimativa',
    category: 'Federal • Imposto de Renda PJ',
    badge: 'bg-amber-100 text-amber-900 dark:bg-amber-950/80 dark:text-amber-200 border-amber-300 dark:border-amber-700',
    iconBg: 'bg-amber-100 dark:bg-amber-950/60',
    iconColor: 'text-amber-600 dark:text-amber-400',
    dotColor: 'bg-amber-500'
  },
  FGTS: {
    label: 'Guias de FGTS',
    shortLabel: 'FGTS Digital',
    category: 'Trabalhista • Caixa Econômica',
    badge: 'bg-teal-100 text-teal-900 dark:bg-teal-950/80 dark:text-teal-200 border-teal-300 dark:border-teal-700',
    iconBg: 'bg-teal-100 dark:bg-teal-950/60',
    iconColor: 'text-teal-600 dark:text-teal-400',
    dotColor: 'bg-teal-500'
  },
  INSS: {
    label: 'Guia de INSS (DCTFWeb)',
    shortLabel: 'INSS DCTFWeb',
    category: 'Previdenciário • DCTFWeb / RFB',
    badge: 'bg-indigo-100 text-indigo-900 dark:bg-indigo-950/80 dark:text-indigo-200 border-indigo-300 dark:border-indigo-700',
    iconBg: 'bg-indigo-100 dark:bg-indigo-950/60',
    iconColor: 'text-indigo-600 dark:text-indigo-400',
    dotColor: 'bg-indigo-500'
  },
  OUTROS: {
    label: 'Outros Tributos',
    shortLabel: 'Outros',
    category: 'Taxas e Contribuições Diversas',
    badge: 'bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-200 border-slate-300 dark:border-slate-600',
    iconBg: 'bg-slate-100 dark:bg-slate-800',
    iconColor: 'text-slate-600 dark:text-slate-400',
    dotColor: 'bg-slate-500'
  }
};

// ==========================================================
// Vales / Adiantamentos Salariais lançados via "Lançamentos Avulsos"
// O lançamento nasce como Pendente e só abate na Folha do colaborador
// indicado após a baixa (Pago) + comprovante anexado.
// ==========================================================
export const VALE_FOLHA_TAG_REGEX = /\[VALE FOLHA\s*\|\s*Desconto:\s*(\d{4}-\d{2})\]/i;

export const buildValeFolhaTag = (monthKey: string) => `[VALE FOLHA | Desconto: ${monthKey}]`;

export const isValeTransaction = (t: { category?: string; description?: string; notes?: string }) => {
  const cat = (t.category || '').toLowerCase();
  const desc = (t.description || '').toLowerCase();
  const notes = (t.notes || '').toLowerCase();
  if (VALE_FOLHA_TAG_REGEX.test(t.notes || '')) return true;
  if (cat.includes('adiantamento salarial') || cat.includes('adiantamento') || cat.includes('vale salarial') || cat.includes('vale folha')) return true;
  if (notes.includes('adiantamento salarial') || notes.includes('vale folha') || notes.includes('folha de desconto:')) return true;
  if (desc.startsWith('vale') || desc.includes('vale / adiantamento') || desc.includes('adiantamento salarial')) return true;
  return false;
};

// Mês da folha em que o vale deve ser descontado (tag gravada no lançamento ou, na falta, mês do pagamento/vencimento)
export const getValeDiscountMonthKey = (t: { notes?: string; paymentDate?: string; dueDate?: string }) => {
  const match = (t.notes || '').match(VALE_FOLHA_TAG_REGEX);
  if (match && match[1]) return match[1];
  return (t.paymentDate || t.dueDate || '').slice(0, 7);
};

// ==========================================================
// Apuração Inteligente de Juros e Multas Destacadas nas Contas
// ==========================================================
export interface ItemLateFeesBreakdown {
  interest: number;
  fine: number;
  total: number;
  overdueDays: number;
  source: 'explicit' | 'difference' | 'boleto_engine' | 'none';
}

export const getItemLateFees = (
  item: any,
  todayStr: string = new Date().toISOString().split('T')[0]
): ItemLateFeesBreakdown => {
  const orig = item?.originalItem || item || {};

  const totalAmount = Number(item?.totalAmount || orig.totalAmount || 0);
  const payableAmount = Number(item?.payableAmount || orig.payableAmount || 0);
  const dueDate = item?.dueDate || orig.dueDate || '';

  // 1. Valores explicitamente gravados no item (interestAmount, fineAmount)
  const explicitInterest = Number(orig.interestAmount || 0);
  const explicitFine = Number(orig.fineAmount || 0);

  if (explicitInterest > 0 || explicitFine > 0) {
    let fine = explicitFine;
    let interest = explicitInterest;
    if (fine === 0 && orig.finePercent && totalAmount > 0) {
      fine = Number(((totalAmount * orig.finePercent) / 100).toFixed(2));
      interest = Math.max(0, Number((explicitInterest - fine).toFixed(2)));
    }
    const total = Number((fine + interest).toFixed(2));
    return { interest, fine, total, overdueDays: orig.overdueDays || 0, source: 'explicit' };
  }

  // 2. Diferença explícita entre valor a pagar e valor total nominal
  if (payableAmount > totalAmount && totalAmount > 0) {
    const diff = Number((payableAmount - totalAmount).toFixed(2));
    return { interest: diff, fine: 0, total: diff, overdueDays: orig.overdueDays || 0, source: 'difference' };
  }

  // 3. Se houver overdueTotalAmount gravado
  if (orig.overdueTotalAmount && orig.overdueTotalAmount > totalAmount && totalAmount > 0) {
    const diff = Number((orig.overdueTotalAmount - totalAmount).toFixed(2));
    const fine = orig.fineAmount ? Number(orig.fineAmount) : 0;
    const interest = Math.max(0, Number((diff - fine).toFixed(2)));
    return { interest, fine, total: diff, overdueDays: orig.overdueDays || 0, source: 'explicit' };
  }

  // 4. Se a conta estiver em atraso (vencimento ultrapassado) e não paga
  const isPaid = item?.status === 'Pago' || orig.status === 'Pago';
  const isOverdue = !isPaid && (item?.status === 'Atrasado' || orig.status === 'Atrasado' || (dueDate && dueDate < todayStr));

  if (isOverdue && (totalAmount > 0 || payableAmount > 0)) {
    const nominal = totalAmount > 0 ? totalAmount : payableAmount;

    const late = calculateBoletoLateFees({
      nominalAmount: nominal,
      dueDateStr: dueDate,
      referenceDateStr: todayStr,
      finePercent: orig.finePercent,
      fineAmount: orig.fineAmount,
      monthlyInterestPercent: orig.monthlyInterestPercent,
      dailyInterestPercent: orig.dailyInterestPercent,
      dailyInterestAmount: orig.dailyInterestAmount,
    });

    if (late.isOverdue && late.totalLateFees > 0) {
      return {
        interest: late.interestAmount,
        fine: late.fineAmount,
        total: late.totalLateFees,
        overdueDays: late.overdueDays,
        source: 'boleto_engine',
      };
    }
  }

  return { interest: 0, fine: 0, total: 0, overdueDays: 0, source: 'none' };
};

export interface PayrollSettlementItem {
  id: string; // `${user.id}_${monthKey}`
  userId: string;
  user: User;
  leader: User;
  regime: 'CLT' | 'PJ' | 'Gestor AG';
  monthKey: string;
  monthLabel: string;
  isPreviousMonth: boolean;
  branchName: string;
  profileLabel: string;
  teamCount: number;
  shipmentsCount: number;
  totalFreightRevenue: number;
  totalNetProfit: number;
  commissionPct: number;
  commissionEarned: number;
  commercialFixedSalary: number;
  fixedSalary: number;
  taxesClt: number;
  customAdvance: number;
  totalAdvances: number;
  totalDeductions: number;
  grossTotal: number;
  netDue: number;
  totalDue: number;
  totalPaid: number;
  totalPlannedPending: number;
  balancePending: number;
  status: 'liquidado' | 'pendente' | 'sem_movimento';

  // Documentos
  invoiceNumber?: string;
  invoiceIssueDate?: string;
  invoiceFileUrl?: string;
  invoiceFileName?: string;
  receiptFileUrl?: string;
  receiptFileName?: string;
  paymentDate?: string;
  paymentAuthCode?: string;

  hasInvoice: boolean;
  hasReceipt: boolean;
  isCompleted: boolean;
  isDocumentPending: boolean;
  missingDocsText: string;

  // Detalhamento do Adiantamento com Data e Comprovante de Transferência
  advanceDate?: string;
  advanceReceiptUrl?: string;
  advanceReceiptFileName?: string;
  activeValesCount?: number;
  // Vales lançados em "Lançamentos Avulsos" ainda pendentes (sem baixa ou sem comprovante)
  pendingValesAmount?: number;
  pendingValesCount?: number;

  expectedCommission?: number;
  expectedShipmentsCount?: number;
  shipments: Array<{
    id: string;
    cte: string;
    date: string;
    clientName: string;
    origin: string;
    destination: string;
    driverName: string;
    plate: string;
    companyFreight: number;
    totalExpenses: number;
    netProfit: number;
    commissionPct: number;
    commissionVal: number;
    status: string;
    isEligible?: boolean;
    isEndOfMonthException?: boolean;
  }>;
}

interface AccountsPayableTabProps {
  transactions: FinancialTransaction[];
  onAddTransaction: (t: Omit<FinancialTransaction, 'id' | 'createdAt'>) => void;
  onUpdateStatus: (id: string, status: FinancialTransactionStatus) => void;
  onUpdateTransaction?: (id: string, updates: Partial<FinancialTransaction>) => void;
  onDeleteTransaction?: (id: string) => void;
  shipments?: Shipment[];
  cargos?: Cargo[];
  clients?: Client[];
  users?: User[];
  branches?: Branch[];
  currentUser?: User | null;
  onNavigateToInvoices?: () => void;
  initialSection?: 'all' | 'invoices' | 'cte' | 'manual' | 'leaders';
}

export const AccountsPayableTab: React.FC<AccountsPayableTabProps> = ({
  transactions = [],
  onAddTransaction,
  onUpdateStatus,
  onUpdateTransaction,
  onDeleteTransaction,
  shipments = [],
  cargos = [],
  clients = [],
  users = [],
  branches = [],
  currentUser,
  onNavigateToInvoices: _onNavigateToInvoices,
  initialSection = 'all',
}) => {
  // Sub-abas do Contas a Pagar (Empresa, Motoristas/Fretes, Avulsos, Folha e Impostos)
  const [activeSection, setActiveSection] = useState<'all' | 'invoices' | 'cte' | 'manual' | 'leaders' | 'taxes'>(initialSection);

  useEffect(() => {
    if (initialSection) {
      setActiveSection(initialSection);
    }
  }, [initialSection]);

  // Filtros Gerais
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedLeaderFilter, setSelectedLeaderFilter] = useState<string>('all');
  const [selectedTaxTypeFilter, setSelectedTaxTypeFilter] = useState<'all' | TaxType>('all');
  const [selectedCompetenceFilter, setSelectedCompetenceFilter] = useState<string>('all');
  const [isTaxImportModalOpen, setIsTaxImportModalOpen] = useState(false);
  const [isTaxManualModalOpen, setIsTaxManualModalOpen] = useState(false);
  const [editingTaxTransaction, setEditingTaxTransaction] = useState<FinancialTransaction | null>(null);
  const [isTaxDeleteModalOpen, setIsTaxDeleteModalOpen] = useState(false);
  const [taxToDelete, setTaxToDelete] = useState<any | null>(null);
  const [isDeletingTax, setIsDeletingTax] = useState(false);
  const [isSyncingTaxes, setIsSyncingTaxes] = useState(false);
  const [isTaxTypeDropdownOpen, setIsTaxTypeDropdownOpen] = useState(false);
  const taxTypeDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (taxTypeDropdownRef.current && !taxTypeDropdownRef.current.contains(event.target as Node)) {
        setIsTaxTypeDropdownOpen(false);
      }
    };
    if (isTaxTypeDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isTaxTypeDropdownOpen]);

  // Filtro de Período (Presets OPZ rápidos)
  const [periodPreset, setPeriodPreset] = useState<'all' | 'today_onwards' | 'today' | 'next_7_days' | 'current_month' | 'last_month' | 'custom'>('all');
  const [showBankingSummary, setShowBankingSummary] = useState(false);
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  // Modal de Baixa de Pagamento e Anexação de Comprovante
  const [settlingItem, setSettlingItem] = useState<SettlingAccountItem | null>(null);
  const [isSettlementModalOpen, setIsSettlementModalOpen] = useState(false);

  // Estado das Notas Fiscais
  const [invoices, setInvoices] = useState<FinancialInvoice[]>([]);
  const [loadingInvoices, setLoadingInvoices] = useState(false);

  // Modal de Lançamento Manual Avulso Geral
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState(new Date().toISOString().split('T')[0]);
  const [category, setCategory] = useState('Custos com Motoristas / Terceiros');
  const [supplierName, setSupplierName] = useState('');
  const [costCenter, setCostCenter] = useState('Operacional');
  const [notes, setNotes] = useState('');
  // Tipo do Lançamento Avulso: despesa comum ou Vale / Adiantamento Salarial de colaborador da Folha
  const [manualEntryType, setManualEntryType] = useState<'despesa' | 'vale' | 'folha'>('despesa');
  const [holeriteFile, setHoleriteFile] = useState<File | null>(null);
  const [isReadingHolerite, setIsReadingHolerite] = useState<boolean>(false);
  const [parsedHolerite, setParsedHolerite] = useState<ParsedHoleriteData | null>(null);
  const [holeriteFileUrl, setHoleriteFileUrl] = useState<string>('');
  const [manualValeUserId, setManualValeUserId] = useState('');
  const [manualValeMonthKey, setManualValeMonthKey] = useState('');
  const [manualInstallmentsCount, setManualInstallmentsCount] = useState<number>(1);

  // Modal de Planejamento de Pagamento para Agenciador Líder
  const [isPlanLeaderModalOpen, setIsPlanLeaderModalOpen] = useState(false);
  const [planLeaderId, setPlanLeaderId] = useState('');
  const [planMonthKey, setPlanMonthKey] = useState<string>('');
  const [planPaymentType, setPlanPaymentType] = useState('Comissão de Agenciamento');
  const [planAmount, setPlanAmount] = useState('');
  const [planDueDate, setPlanDueDate] = useState(new Date().toISOString().split('T')[0]);
  const [planPaymentMethod, setPlanPaymentMethod] = useState('PIX');
  const [planPixKey, setPlanPixKey] = useState('');
  const [planNotes, setPlanNotes] = useState('');
  const [planInitialStatus, setPlanInitialStatus] = useState<FinancialTransactionStatus>(FinancialTransactionStatus.Pendente);

  // Modal de Auditoria de Fretes da Agência do Líder / Gestor AG
  const [auditingLeaderId, setAuditingLeaderId] = useState<string | null>(null);

  // Feedback de Cópia de PIX
  const [copiedPixId, setCopiedPixId] = useState<string | null>(null);
  const { showToast } = useToast();

  // Sub-Aba da Folha de Pagamento: 'pending' (Contas em Aberto / Tela Inicial) ou 'completed' (Pagamento Feito - Histórico)
  const [payrollSubTab, setPayrollSubTab] = useState<'pending' | 'completed'>('pending');

  // Mês Selecionado para Filtro e Visualização da Folha ('current' | 'last' | 'all')
  const [payrollSelectedMonth, setPayrollSelectedMonth] = useState<string>('current');

  // Documentos de Liquidação da Folha (Nota Fiscal e Comprovante de Pagamento)
  const [payrollDocs, setPayrollDocs] = useState<Record<string, PayrollSettlementDoc>>(() => {
    try {
      const raw = localStorage.getItem('transcunha_payroll_docs_v2');
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });

  // Modal de Lançamento de Documentos da Folha
  const [selectedSettlementForDocs, setSelectedSettlementForDocs] = useState<PayrollSettlementItem | null>(null);

  const savePayrollDoc = (key: string, doc: Partial<PayrollSettlementDoc>) => {
    setPayrollDocs(prev => {
      const existing = prev[key] || {
        userId: doc.userId || '',
        monthKey: doc.monthKey || '',
        monthLabel: doc.monthLabel || '',
        regime: doc.regime || 'CLT',
      };
      const nextDoc: PayrollSettlementDoc = {
        ...existing,
        ...doc,
        updatedAt: new Date().toISOString()
      };
      const next = { ...prev, [key]: nextDoc };
      try { localStorage.setItem('transcunha_payroll_docs_v2', JSON.stringify(next)); } catch { }
      return next;
    });
  };

  // Filtro de Regime da Folha de Pagamento
  const [selectedRegimeFilter, setSelectedRegimeFilter] = useState<'all' | 'CLT' | 'PJ' | 'Gestor AG'>('all');

  // Estado de Regimes, Salários Fixos, Tributos CLT e Adiantamentos (Persistidos localmente)
  const [userRegimes, setUserRegimes] = useState<Record<string, 'CLT' | 'PJ' | 'Gestor AG'>>(() => {
    try {
      const raw = localStorage.getItem('transcunha_payroll_regimes');
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });

  const [userSalaries, setUserSalaries] = useState<Record<string, number>>(() => {
    try {
      const raw = localStorage.getItem('transcunha_payroll_salaries');
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });

  const [userTaxes, setUserTaxes] = useState<Record<string, number>>(() => {
    try {
      const raw = localStorage.getItem('transcunha_payroll_taxes');
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });

  const [userCustomAdvances, setUserCustomAdvances] = useState<Record<string, number>>(() => {
    try {
      const raw = localStorage.getItem('transcunha_payroll_advances');
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });

  const [userCustomCommissions, setUserCustomCommissions] = useState<Record<string, number>>(() => {
    try {
      const raw = localStorage.getItem('transcunha_payroll_commissions');
      const parsed = raw ? JSON.parse(raw) : {};
      // Se houver resíduo do cálculo incorreto antigo (1272.96 para Maurício), descartar e limpar
      if (parsed['USR-294'] === 1272.96 || parsed['USR-294'] === 1272.95) {
        delete parsed['USR-294'];
        try { localStorage.setItem('transcunha_payroll_commissions', JSON.stringify(parsed)); } catch { }
      }
      return parsed;
    } catch {
      return {};
    }
  });

  // Adiantamentos Estruturados com Data e Comprovante de Transferência (por userId_monthKey - legado)
  const [payrollAdvances, setPayrollAdvances] = useState<Record<string, PayrollAdvanceRecord>>(() => {
    try {
      const raw = localStorage.getItem('transcunha_payroll_advances_v2');
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });

  // Adiantamentos / Vales Múltiplos e Parcelados
  const [payrollAdvanceItems, setPayrollAdvanceItems] = useState<PayrollAdvanceItem[]>(() => {
    try {
      const raw = localStorage.getItem('transcunha_payroll_advance_items_v1');
      if (raw) return JSON.parse(raw);

      // Migração inicial transparente de transcunha_payroll_advances_v2
      const legacyRaw = localStorage.getItem('transcunha_payroll_advances_v2');
      if (legacyRaw) {
        const legacy = JSON.parse(legacyRaw) as Record<string, PayrollAdvanceRecord>;
        const list: PayrollAdvanceItem[] = [];
        Object.entries(legacy).forEach(([key, rec]) => {
          if (rec && rec.amount > 0) {
            list.push({
              id: `legacy_${key}`,
              userId: rec.userId,
              description: rec.notes || 'Adiantamento concedido',
              amount: rec.amount,
              issueDate: rec.date || new Date().toISOString().split('T')[0],
              receiptFileUrl: rec.receiptFileUrl,
              receiptFileName: rec.receiptFileName,
              installmentsCount: 1,
              startMonthKey: rec.monthKey,
              installments: [{
                installmentNumber: 1,
                totalInstallments: 1,
                monthKey: rec.monthKey,
                amount: rec.amount,
                isSettled: false,
              }],
              createdAt: rec.updatedAt || new Date().toISOString(),
              updatedAt: rec.updatedAt,
            });
          }
        });
        return list;
      }
      return [];
    } catch {
      return [];
    }
  });

  const savePayrollAdvanceItems = (updater: (prev: PayrollAdvanceItem[]) => PayrollAdvanceItem[]) => {
    setPayrollAdvanceItems(prev => {
      const next = updater(prev);
      try {
        localStorage.setItem('transcunha_payroll_advance_items_v1', JSON.stringify(next));
      } catch (err) {
        console.error('Erro ao salvar vales no localStorage:', err);
      }
      return next;
    });
  };

  // Modal de Configuração de Valores do Colaborador (Salário, Tributos, Comissão, Regime)
  const [editingUserForValues, setEditingUserForValues] = useState<User | null>(null);
  const [editingMonthKey, setEditingMonthKey] = useState<string>('');
  const [editingSettlementItem, setEditingSettlementItem] = useState<PayrollSettlementItem | null>(null);
  const [editRegime, setEditRegime] = useState<'CLT' | 'PJ' | 'Gestor AG'>('CLT');
  const [editSalary, setEditSalary] = useState('');
  const [editCommission, setEditCommission] = useState('');
  const [editTaxes, setEditTaxes] = useState('');
  const [editAdvance, setEditAdvance] = useState('');
  const [editAdvanceDate, setEditAdvanceDate] = useState(new Date().toISOString().split('T')[0]);
  const [editAdvanceReceiptUrl, setEditAdvanceReceiptUrl] = useState('');
  const [editAdvanceReceiptName, setEditAdvanceReceiptName] = useState('');
  const [isUploadingAdvanceReceipt, setIsUploadingAdvanceReceipt] = useState(false);
  const advanceFileInputRef = useRef<HTMLInputElement>(null);
  const [editPixKey, setEditPixKey] = useState('');

  // Formulário para registrar e conceder novo vale
  const [newValeAmount, setNewValeAmount] = useState('');
  const [newValeDate, setNewValeDate] = useState(new Date().toISOString().split('T')[0]);
  const [newValeInstallmentsCount, setNewValeInstallmentsCount] = useState<number>(1);
  const [newValeStartMonth, setNewValeStartMonth] = useState('');
  const [newValeDescription, setNewValeDescription] = useState('');
  const [newValeReceiptUrl, setNewValeReceiptUrl] = useState('');
  const [newValeReceiptName, setNewValeReceiptName] = useState('');
  const [isUploadingValeReceipt, setIsUploadingValeReceipt] = useState(false);
  const valeFileInputRef = useRef<HTMLInputElement>(null);

  // Upload do Comprovante do Vale
  const handleValeFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingValeReceipt(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const dataUrl = reader.result as string;
        try {
          const uploadedUrl = await uploadInvoiceAttachmentToStorage(
            dataUrl,
            `vale_${editingUserForValues?.id || 'temp'}_${Date.now()}`,
            'comprovante_transferencia',
            file.name,
            file.type
          );
          setNewValeReceiptUrl(uploadedUrl || dataUrl);
          setNewValeReceiptName(file.name);
          showToast('Comprovante de transferência do vale anexado!', 'success');
        } catch (err) {
          console.warn('Erro ao enviar comprovante do vale:', err);
          setNewValeReceiptUrl(dataUrl);
          setNewValeReceiptName(file.name);
          showToast('Comprovante anexado.', 'info');
        } finally {
          setIsUploadingValeReceipt(false);
        }
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error('Erro ao processar arquivo do vale:', err);
      setIsUploadingValeReceipt(false);
      showToast('Falha ao processar arquivo.', 'error');
    }
  };

  // Salvar Vale e Parcelamento
  const handleAddNewVale = () => {
    if (!editingUserForValues) return;
    const parsedAmount = parseBrazilianCurrency(newValeAmount);
    if (!parsedAmount || parsedAmount <= 0) {
      showToast('Informe um valor válido maior que zero para o vale.', 'warning');
      return;
    }
    const issueDate = newValeDate || new Date().toISOString().split('T')[0];
    const targetMonth = editingMonthKey || currentMonthPrefix;
    const startMonth = newValeStartMonth || targetMonth || getMonthKeyFromDate(issueDate);
    const count = Math.max(1, newValeInstallmentsCount || 1);

    const installments = calculateInstallments(parsedAmount, count, startMonth);

    const newValeItem: PayrollAdvanceItem = {
      id: `vale_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      userId: editingUserForValues.id,
      description: newValeDescription.trim() || (count > 1 ? `Vale parcelado em ${count}x` : 'Vale adiantamento'),
      amount: parsedAmount,
      issueDate,
      receiptFileUrl: newValeReceiptUrl || undefined,
      receiptFileName: newValeReceiptName || undefined,
      installmentsCount: count,
      startMonthKey: startMonth,
      installments,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    savePayrollAdvanceItems(prev => [newValeItem, ...prev]);

    showToast(
      count > 1
        ? `Vale de ${formatBrl(parsedAmount)} gravado em ${count}x (primeira parcela em ${formatMonthKeyToLabel(startMonth)})!`
        : `Vale de ${formatBrl(parsedAmount)} gravado para ${formatMonthKeyToLabel(startMonth)} com sucesso!`,
      'success'
    );

    // Resetar campos para permitir criar outro vale imediatamente mantendo o mês de referência
    setNewValeAmount('');
    setNewValeReceiptUrl('');
    setNewValeReceiptName('');
    setNewValeDescription('');
    setNewValeInstallmentsCount(1);
    setNewValeStartMonth(targetMonth);
    if (valeFileInputRef.current) {
      valeFileInputRef.current.value = '';
    }
  };

  // Alterar mês de início/desconto de um vale já cadastrado
  const handleChangeValeMonth = (valeId: string, newStartMonth: string) => {
    savePayrollAdvanceItems(prev => prev.map(v => {
      if (v.id !== valeId) return v;
      const count = Math.max(1, v.installmentsCount || v.installments?.length || 1);
      const newInstallments = calculateInstallments(v.amount, count, newStartMonth);
      return {
        ...v,
        startMonthKey: newStartMonth,
        installments: newInstallments,
        updatedAt: new Date().toISOString(),
      };
    }));
    showToast(`Mês de desconto do vale atualizado para ${formatMonthKeyToLabel(newStartMonth)}!`, 'success');
  };

  // Excluir Vale
  const handleDeleteVale = (valeId: string, valeAmount: number) => {
    if (!confirm(`Tem certeza que deseja excluir este vale de ${formatBrl(valeAmount)}? As parcelas serão removidas das folhas correspondentes.`)) {
      return;
    }
    savePayrollAdvanceItems(prev => prev.filter(v => v.id !== valeId));
    showToast('Vale excluído com sucesso.', 'info');
  };

  // Upload do Comprovante de Transferência do Adiantamento (legado)
  const handleAdvanceFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingAdvanceReceipt(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const dataUrl = reader.result as string;
        try {
          const uploadedUrl = await uploadInvoiceAttachmentToStorage(
            dataUrl,
            `adv_${editingUserForValues?.id || 'temp'}_${Date.now()}`,
            'comprovante_transferencia',
            file.name,
            file.type
          );
          setEditAdvanceReceiptUrl(uploadedUrl || dataUrl);
          setEditAdvanceReceiptName(file.name);
          showToast('Comprovante de transferência anexado com sucesso!', 'success');
        } catch (err) {
          console.warn('Erro ao enviar comprovante:', err);
          setEditAdvanceReceiptUrl(dataUrl);
          setEditAdvanceReceiptName(file.name);
          showToast('Comprovante anexado.', 'info');
        } finally {
          setIsUploadingAdvanceReceipt(false);
        }
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error('Erro ao ler arquivo:', err);
      setIsUploadingAdvanceReceipt(false);
      showToast('Falha ao processar arquivo.', 'error');
    }
  };

  // Atualizar Regime de um Colaborador
  const handleUpdateUserRegime = (userId: string, regime: 'CLT' | 'PJ' | 'Gestor AG') => {
    setUserRegimes(prev => {
      const next = { ...prev, [userId]: regime };
      try { localStorage.setItem('transcunha_payroll_regimes', JSON.stringify(next)); } catch { }
      return next;
    });
  };

  // Lista de IDs de Colaboradores Excluídos da Folha de Pagamento (Persistidos localmente)
  const [excludedPayrollUserIds, setExcludedPayrollUserIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem('transcunha_payroll_excluded_users');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  const [isExcludedUsersModalOpen, setIsExcludedUsersModalOpen] = useState(false);

  // Excluir Colaborador da Folha de Pagamento
  const handleExcludeUserFromPayroll = (targetUser: User) => {
    const confirmed = window.confirm(
      `Deseja realmente excluir "${targetUser.name}" da tela de Folha de Pagamento?\n\nEle não aparecerá mais nesta apuração da folha. Você poderá restaurá-lo a qualquer momento.`
    );
    if (!confirmed) return;

    setExcludedPayrollUserIds(prev => {
      if (prev.includes(targetUser.id)) return prev;
      const next = [...prev, targetUser.id];
      try {
        localStorage.setItem('transcunha_payroll_excluded_users', JSON.stringify(next));
      } catch { }
      return next;
    });

    showToast(`"${targetUser.name}" foi excluído da tela de Folha de Pagamento.`, 'info');
  };

  // Restaurar Colaborador para a Folha de Pagamento
  const handleRestoreUserToPayroll = (userId: string) => {
    setExcludedPayrollUserIds(prev => {
      const next = prev.filter(id => id !== userId);
      try {
        localStorage.setItem('transcunha_payroll_excluded_users', JSON.stringify(next));
      } catch { }
      return next;
    });

    const restoredUser = (users || []).find(u => u.id === userId);
    showToast(`"${restoredUser?.name || 'Colaborador'}" foi restaurado para a Folha de Pagamento.`, 'success');
  };

  // Restaurar Todos os Colaboradores
  const handleRestoreAllUsersToPayroll = () => {
    setExcludedPayrollUserIds([]);
    try {
      localStorage.removeItem('transcunha_payroll_excluded_users');
    } catch { }
    showToast('Todos os colaboradores foram restaurados para a Folha de Pagamento.', 'success');
    setIsExcludedUsersModalOpen(false);
  };

  // Carregar Notas Fiscais
  const loadInvoices = async () => {
    setLoadingInvoices(true);
    try {
      const data = await financialInvoiceService.getInvoices(users);
      setInvoices(data);
    } catch (err) {
      console.error('Erro ao carregar notas fiscais em Contas a Pagar:', err);
    } finally {
      setLoadingInvoices(false);
    }
  };

  useEffect(() => {
    loadInvoices();

    // Sincronização em tempo real (WebSockets Supabase + Postgres + Local)
    const unsubscribe = subscribeToFinancialInvoices(() => {
      loadInvoices();
    });

    return () => {
      unsubscribe();
    };
  }, [users]);

  // Data atual para cálculo de vencimento
  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);

  // Datas para períodos pré-definidos
  const { currentMonthPrefix, lastMonthPrefix } = useMemo(() => {
    const now = new Date();
    const curYear = now.getFullYear();
    const curMonth = String(now.getMonth() + 1).padStart(2, '0');
    const curPrefix = `${curYear}-${curMonth}`;

    const prevMonthDate = new Date(curYear, now.getMonth() - 1, 1);
    const lastYear = prevMonthDate.getFullYear();
    const lastMonth = String(prevMonthDate.getMonth() + 1).padStart(2, '0');
    const lastPrefix = `${lastYear}-${lastMonth}`;

    return { currentMonthPrefix: curPrefix, lastMonthPrefix: lastPrefix };
  }, []);

  // 1. Identificação dos Colaboradores da Folha de Pagamento (Usuários Internos, menos o Agenciador Embarque e Excluídos)
  const payrollUsers = useMemo(() => {
    const list: User[] = [];
    const idSet = new Set<string>();
    const excludedSet = new Set(excludedPayrollUserIds);

    (users || []).forEach(u => {
      // Ocultar sempre o Desenvolvedor e o usuário de Demonstração na folha de pagamento
      if (isDeveloperUser(u) || isDemoUser(u)) return;

      // Ignorar se o usuário foi excluído da folha de pagamento
      if (excludedSet.has(u.id)) return;

      const prof = u.profile as string;
      // Excluir motoristas e clientes (usuários externos)
      if (prof === UserProfile.Motorista || prof === 'Motorista') return;
      if (prof === UserProfile.Cliente || prof === 'Cliente') return;

      // Excluir expressamente o "Agenciador Embarque" (esse é pago diretamente pelo "Agenciador Líder" dele)
      if (u.agencyRole === 'embarque') return;

      // Considerar todos os perfis internos do sistema Transcunha
      const isInternal = INTERNAL_PROFILES.includes(u.profile as UserProfile) ||
        ['Admin', 'Administrador do Sistema', 'Diretor', 'Supervisor', 'Gerente Comercial', 'Comercial', 'Financeiro', 'Fiscal', 'Gerenciadora de Risco', 'Embarcador', 'Agenciador', 'Demonstração'].includes(prof);

      if (isInternal) {
        if (!idSet.has(u.id)) {
          idSet.add(u.id);
          list.push(u);
        }
      }
    });

    return list;
  }, [users, excludedPayrollUserIds]);

  // Alias para manter compatibilidade total
  const leaderUsers = payrollUsers;

  // Helper para obter o regime de contratação do colaborador (CLT, PJ ou Gestor AG)
  const getUserRegime = (u: User): 'CLT' | 'PJ' | 'Gestor AG' => {
    if (userRegimes[u.id]) return userRegimes[u.id];

    const isAgenciador = u.profile === UserProfile.Agenciador || (u.profile as string) === 'Agenciador';
    const isExplicitLeader = u.agencyRole === 'lider' || (isAgenciador && u.agencyRole !== 'embarque');
    const isReferencedAsLeader = (users || []).some(other => other.agencyLeaderId === u.id);
    const isKnownAgencyLeader =
      u.name?.toLowerCase().includes('maurício') ||
      u.name?.toLowerCase().includes('mauricio') ||
      u.name?.toLowerCase().includes('rafael pinheiro') ||
      u.name?.toLowerCase().includes('rafael tarantelli') ||
      Boolean(u.commercialIsAgencyMode);

    if (isExplicitLeader || isReferencedAsLeader || isKnownAgencyLeader || (isAgenciador && !u.agencyRole)) {
      return 'Gestor AG';
    }

    return 'CLT';
  };

  // Abrir Modal de Edição de Salário, Tributos, Comissão e Valores do Colaborador
  const handleOpenEditUserValues = (u: User, targetMonthKey?: string, settlementItem?: PayrollSettlementItem) => {
    setEditingUserForValues(u);
    const activeMonthKey = targetMonthKey || settlementItem?.monthKey || currentMonthPrefix;
    setEditingMonthKey(activeMonthKey);
    setEditingSettlementItem(settlementItem || null);

    const regime = settlementItem?.regime || getUserRegime(u);
    setEditRegime(regime);

    const sal = settlementItem?.fixedSalary !== undefined
      ? settlementItem.fixedSalary
      : (userSalaries[u.id] !== undefined
        ? userSalaries[u.id]
        : (u.commercialFixedSalary ? Number(u.commercialFixedSalary) : 0));
    setEditSalary(sal > 0 ? sal.toFixed(2).replace('.', ',') : '');

    const hasManualComm = userCustomCommissions[u.id] !== undefined && userCustomCommissions[u.id] !== 1272.96;
    const comm = hasManualComm && userCustomCommissions[u.id] > 0
      ? userCustomCommissions[u.id]
      : (settlementItem?.commissionEarned || 0);
    setEditCommission(comm > 0 ? comm.toFixed(2).replace('.', ',') : '');

    const tax = settlementItem?.taxesClt !== undefined
      ? settlementItem.taxesClt
      : (userTaxes[u.id] !== undefined ? userTaxes[u.id] : 0);
    setEditTaxes(tax > 0 ? tax.toFixed(2).replace('.', ',') : '');

    const userVales = (payrollAdvanceItems || []).filter(v => v.userId === u.id);
    const activeValesInMonth = userVales.flatMap(v => v.installments || []).filter(i => i.monthKey === activeMonthKey);
    const valesSum = activeValesInMonth.reduce((s, i) => s + i.amount, 0);

    const docKey = `${u.id}_${activeMonthKey}`;
    const advRecord = payrollAdvances[docKey];
    const adv = userVales.length > 0
      ? valesSum
      : (advRecord !== undefined
        ? advRecord.amount
        : (userCustomAdvances[u.id] !== undefined ? userCustomAdvances[u.id] : 0));
    setEditAdvance(adv > 0 ? adv.toFixed(2).replace('.', ',') : '');
    setEditAdvanceDate(advRecord?.date || new Date().toISOString().split('T')[0]);
    setEditAdvanceReceiptUrl(advRecord?.receiptFileUrl || '');
    setEditAdvanceReceiptName(advRecord?.receiptFileName || '');

    // Resetar campos de novo vale: DEFAULT É O MÊS DA FOLHA ATIVA!
    setNewValeAmount('');
    setNewValeDate(todayStr);
    setNewValeInstallmentsCount(1);
    setNewValeStartMonth(activeMonthKey);
    setNewValeDescription('');
    setNewValeReceiptUrl('');
    setNewValeReceiptName('');

    setEditPixKey(u.phone || u.corporateEmail || u.email || '');
  };

  // Salvar Configuração de Valores do Colaborador
  const handleSaveUserValues = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUserForValues) return;
    const uid = editingUserForValues.id;
    const targetMonth = editingMonthKey || currentMonthPrefix;
    const parsedSal = parseBrazilianCurrency(editSalary);
    const parsedComm = parseBrazilianCurrency(editCommission);
    const parsedTax = parseBrazilianCurrency(editTaxes);
    const parsedAdv = parseBrazilianCurrency(editAdvance);
    const docKey = `${uid}_${targetMonth}`;

    setUserRegimes(prev => {
      const next = { ...prev, [uid]: editRegime };
      try { localStorage.setItem('transcunha_payroll_regimes', JSON.stringify(next)); } catch { }
      return next;
    });

    setUserSalaries(prev => {
      const next = { ...prev, [uid]: parsedSal };
      try { localStorage.setItem('transcunha_payroll_salaries', JSON.stringify(next)); } catch { }
      return next;
    });

    setUserCustomCommissions(prev => {
      const next = { ...prev };
      if (!editCommission || editCommission.trim() === '' || parsedComm <= 0) {
        delete next[uid];
      } else {
        next[uid] = parsedComm;
      }
      try { localStorage.setItem('transcunha_payroll_commissions', JSON.stringify(next)); } catch { }
      return next;
    });

    setUserTaxes(prev => {
      const next = { ...prev, [uid]: parsedTax };
      try { localStorage.setItem('transcunha_payroll_taxes', JSON.stringify(next)); } catch { }
      return next;
    });

    // Salvar Adiantamento com Data e Comprovante de Transferência
    setPayrollAdvances(prev => {
      const next = {
        ...prev,
        [docKey]: {
          userId: uid,
          monthKey: targetMonth,
          amount: parsedAdv,
          date: editAdvanceDate || todayStr,
          receiptFileUrl: editAdvanceReceiptUrl || undefined,
          receiptFileName: editAdvanceReceiptName || undefined,
          updatedAt: new Date().toISOString(),
        }
      };
      try { localStorage.setItem('transcunha_payroll_advances_v2', JSON.stringify(next)); } catch { }
      return next;
    });

    setUserCustomAdvances(prev => {
      const next = { ...prev, [uid]: parsedAdv };
      try { localStorage.setItem('transcunha_payroll_advances', JSON.stringify(next)); } catch { }
      return next;
    });

    showToast(`Configurações de "${editingUserForValues.name}" gravadas com sucesso!`, 'success');
    setEditingUserForValues(null);
    setEditingMonthKey('');
    setEditingSettlementItem(null);
  };

  // Helper para verificar se uma transação pertence à Folha de Pagamento
  const isLeaderTx = (t: FinancialTransaction) => {
    if (t.type !== 'payable') return false;
    // Vales / Adiantamentos Salariais pertencem a Lançamentos Avulsos e são abatidos na Folha pelo colaborador indicado
    if (isValeTransaction(t)) return false;
    const cat = t.category?.toLowerCase() || '';
    const notesStr = t.notes?.toLowerCase() || '';
    const desc = t.description?.toLowerCase() || '';
    const costCenterStr = t.costCenter?.toLowerCase() || '';
    const supp = t.supplierOrClientName?.toLowerCase() || '';

    return (
      cat.includes('folha de pagamento') ||
      cat.includes('salário') ||
      cat.includes('salario') ||
      cat.includes('adiantamento salarial') ||
      cat.includes('pró-labore') ||
      cat.includes('pro-labore') ||
      cat.includes('agenciador líder') ||
      cat.includes('agenciador lider') ||
      cat.includes('comissão de agenciador') ||
      cat.includes('comissao de agenciador') ||
      cat.includes('comissão agência') ||
      cat.includes('comissao agencia') ||
      costCenterStr.includes('folha') ||
      costCenterStr.includes('agenciamento') ||
      costCenterStr.includes('agenciadores líder') ||
      notesStr.includes('folha de pagamento') ||
      notesStr.includes('agenciador líder') ||
      notesStr.includes('agenciador lider') ||
      notesStr.includes('[planejamento folha') ||
      notesStr.includes('[planejamento agenciador líder]') ||
      desc.includes('folha') ||
      desc.includes('salário') ||
      desc.includes('salario') ||
      desc.includes('adiantamento salarial') ||
      desc.includes('agenciador líder') ||
      desc.includes('agenciador lider') ||
      Boolean(t.ownerId && payrollUsers.some(l => l.id === t.ownerId)) ||
      Boolean(supp && payrollUsers.some(l => l.name?.toLowerCase() === supp))
    );
  };

  // 2. Processar Notas Fiscais a Pagar
  const invoicePayables = useMemo(() => {
    return (invoices || [])
      .filter(inv => inv.status !== 'Cancelado' && inv.status !== 'Somente Volume')
      .map(inv => {
        const isOverdue = inv.status === 'Atrasado' || (inv.status === 'Pendente' && inv.dueDate < todayStr);
        const displayStatus: 'Pendente' | 'Pago' | 'Atrasado' = inv.status === 'Pago' ? 'Pago' : isOverdue ? 'Atrasado' : 'Pendente';

        return {
          id: inv.id,
          documentType: inv.documentType || 'Nota Fiscal',
          invoiceNumber: inv.invoiceNumber,
          series: inv.series,
          supplierName: inv.supplierName,
          supplierCnpjCpf: inv.supplierCnpjCpf,
          totalAmount: inv.totalAmount,
          payableAmount: inv.payableAmount !== undefined && inv.payableAmount > 0 ? inv.payableAmount : inv.totalAmount,
          issueDate: inv.issueDate,
          dueDate: inv.dueDate,
          paymentDate: inv.paymentDate,
          status: displayStatus,
          rawStatus: inv.status,
          costCenterName: inv.costCenterName,
          costTypeName: inv.costTypeName,
          costNature: inv.costNature,
          responsibleUserName: inv.responsibleUserName,
          fileUrl: inv.fileUrl,
          fileName: inv.fileName,
          fileType: inv.fileType,
          boletoFileUrl: inv.boletoFileUrl,
          boletoFileName: inv.boletoFileName,
          boletoFileType: inv.boletoFileType,
          paymentMethod: inv.paymentMethod,
          paymentDetails: inv.paymentDetails,
          description: inv.description,
          receiptFileUrl: inv.receiptFileUrl,
          receiptFileName: inv.receiptFileName,
          receiptFileType: inv.receiptFileType,
          receiptFileSize: inv.receiptFileSize,
          paymentAuthCode: inv.paymentAuthCode,
          notes: inv.notes,
          bankAccount: inv.bankAccount,
          isReconciled: inv.isReconciled,
          reconciledAt: inv.reconciledAt,
          createdAt: inv.createdAt,
          originalItem: inv,
        };
      }).sort((a, b) => new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime());
  }, [invoices, todayStr]);

  // 3. Processar Lançamentos de Agenciadores Líder
  const leaderPayables = useMemo(() => {
    return (transactions || [])
      .filter(t => isLeaderTx(t))
      .map(t => {
        const isOverdue = t.status === FinancialTransactionStatus.Atrasado || (t.status === FinancialTransactionStatus.Pendente && t.dueDate < todayStr);
        const displayStatus: 'Pendente' | 'Pago' | 'Atrasado' = t.status === FinancialTransactionStatus.Pago ? 'Pago' : isOverdue ? 'Atrasado' : 'Pendente';

        // Extrair chave PIX ou dados de pagamento das notes se houver
        let parsedPixKey = '';
        if (t.notes && t.notes.includes('PIX:')) {
          const match = t.notes.match(/PIX:\s*([^|]+)/i);
          if (match && match[1]) parsedPixKey = match[1].trim();
        }

        return {
          id: t.id,
          description: t.description,
          supplierName: t.supplierOrClientName || 'Agenciador Líder',
          category: t.category,
          costCenter: t.costCenter || 'Operacional',
          totalAmount: t.amount,
          payableAmount: t.amount,
          dueDate: t.dueDate,
          paymentDate: t.paymentDate,
          status: displayStatus,
          rawStatus: t.status,
          ownerId: t.ownerId,
          notes: t.notes,
          pixKey: parsedPixKey,
          documentNumber: t.documentNumber,
          receiptFileUrl: t.receiptFileUrl,
          receiptFileName: t.receiptFileName,
          receiptFileType: t.receiptFileType,
          receiptFileSize: t.receiptFileSize,
          paymentAuthCode: t.paymentAuthCode,
          bankAccount: t.bankAccount,
          isReconciled: t.isReconciled,
          reconciledAt: t.reconciledAt,
          createdAt: t.createdAt,
          originalItem: t,
        };
      })
      .sort((a, b) => new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime());
  }, [transactions, todayStr, leaderUsers]);

  // Helper para verificar se uma transação pertence a Fretes / Doc CT-e
  const isCteTx = (t: FinancialTransaction): boolean => {
    if (t.type !== 'payable') return false;
    if (isLeaderTx(t)) return false;
    const doc = (t.documentNumber || '').toUpperCase();
    const desc = (t.description || '').toUpperCase();
    const cat = (t.category || '').toUpperCase();
    return (
      doc.includes('CTE') ||
      doc.includes('CT-E') ||
      desc.includes('CTE') ||
      desc.includes('CT-E') ||
      Boolean(t.shipmentId) ||
      cat.includes('MOTORISTA') ||
      cat.includes('FRETE')
    );
  };

  // 3. Processar Fretes / Doc CT-e (contas a pagar de fretes vinculados ESTRITAMENTE a embarques já faturados)
  const ctePayables = useMemo(() => {
    const list: any[] = [];
    const processedShipmentIds = new Set<string>();

    // 1. Processar transações existentes que pertençam a CT-e e verificar se o embarque está faturado
    (transactions || [])
      .filter(t => isCteTx(t))
      .forEach(t => {
        let linkedShipment = t.shipmentId 
          ? shipments?.find(s => s.id === t.shipmentId || String((s as any).sequenceId) === String(t.shipmentId)) 
          : null;

        if (!linkedShipment && t.description) {
          const match = t.description.match(/Embarque\s+([A-Za-z0-9\-]+)/i);
          if (match && match[1]) {
            const shipCode = match[1].trim();
            linkedShipment = shipments?.find(s => s.id === shipCode || String((s as any).sequenceId) === shipCode) || null;
          }
        }

        // Regra Estrita: Se houver embarque vinculado, deve estar OBRIGATORIAMENTE já faturado com CT-e emitido
        if (linkedShipment && !isShipmentFaturado(linkedShipment)) {
          return; // Embarque ainda não faturado (ex: Ag. Cadastro, Ag. Carregamento, Ag. Nota ou Cancelado) não entra no Contas a Pagar
        }

        if (linkedShipment) {
          processedShipmentIds.add(linkedShipment.id);
        }

        const isOverdue = t.status === FinancialTransactionStatus.Atrasado || (t.status === FinancialTransactionStatus.Pendente && t.dueDate < todayStr);
        const displayStatus: 'Pendente' | 'Pago' | 'Atrasado' = t.status === FinancialTransactionStatus.Pago ? 'Pago' : isOverdue ? 'Atrasado' : 'Pendente';

        const docs: any = linkedShipment?.documents || {};
        const cteDocUrl = docs['CT-e']?.[0] || docs['CTE']?.[0] || docs['Conhecimento de Transporte']?.[0] || null;
        const contractDocUrl = docs['Contrato de Transporte']?.[0] || docs['Carta Frete']?.[0] || docs['Contrato']?.[0] || null;

        const driverName = t.supplierOrClientName || linkedShipment?.driverName || 'Motorista Terceiro';
        const horsePlate = linkedShipment?.horsePlate ? ` • Placa ${linkedShipment.horsePlate}` : '';
        const shipInfo = t.shipmentId ? ` • Embarque ${t.shipmentId}` : (linkedShipment ? ` • Embarque ${linkedShipment.id}` : '');

        list.push({
          id: t.id,
          description: t.description || `Frete Motorista ${driverName}${horsePlate}`,
          supplierName: driverName,
          category: t.category || 'Custos com Motoristas / Terceiros',
          costCenter: t.costCenter || 'Operacional',
          totalAmount: t.amount,
          payableAmount: (t as any).paidAmount !== undefined && displayStatus === 'Pago'
            ? (t as any).paidAmount
            : (t as any).payableAmount !== undefined
              ? (t as any).payableAmount
              : t.amount,
          dueDate: t.dueDate,
          paymentDate: t.paymentDate,
          status: displayStatus,
          rawStatus: t.status,
          shipmentId: t.shipmentId || linkedShipment?.id,
          documentNumber: t.documentNumber || (linkedShipment ? `CTE-${getShipmentCte(linkedShipment)}` : 'Doc CT-e'),
          documentUrl: cteDocUrl,
          contractUrl: contractDocUrl,
          receiptFileUrl: t.receiptFileUrl,
          receiptFileName: t.receiptFileName,
          receiptFileType: t.receiptFileType,
          receiptFileSize: t.receiptFileSize,
          paymentAuthCode: t.paymentAuthCode,
          bankAccount: t.bankAccount || 'Sicredi',
          isReconciled: t.isReconciled,
          reconciledAt: t.reconciledAt,
          createdAt: t.createdAt,
          pixKey: linkedShipment?.pixKey,
          details: `${t.description || 'Frete'}${horsePlate}${shipInfo}`,
          originalItem: t,
          linkedShipment,
        });
      });

    // 2. Além disso, garante que QUALQUER embarque já faturado da base que tenha frete a pagar conste na aba Fretes / Doc CT-e
    (shipments || []).forEach(s => {
      if (!isShipmentFaturado(s)) return;
      if (processedShipmentIds.has(s.id)) return;

      const driverVal = s.driverFreightValue || 0;
      if (driverVal <= 0) return;

      const docs: any = s.documents || {};
      const cteDocUrl = docs['CT-e']?.[0] || docs['CTE']?.[0] || docs['Conhecimento de Transporte']?.[0] || null;
      const contractDocUrl = docs['Contrato de Transporte']?.[0] || docs['Carta Frete']?.[0] || docs['Contrato']?.[0] || null;

      const driverName = s.driverName || 'Motorista Terceiro';
      const horsePlate = s.horsePlate ? ` • Placa ${s.horsePlate}` : '';
      const shipInfo = ` • Embarque ${s.id}`;
      const cteNum = getShipmentCte(s);
      const effectiveDate = getShipmentEffectiveDate(s) || s.scheduledDate || todayStr;

      const is100PctAdvPaid = isShipment100PercentAdvance(s) && (Boolean(docs['Comprovante de Adiantamento']) || Boolean(docs.comprovante_adiantamento) || (s.advanceValue !== undefined && s.advanceValue > 0));
      const isPaid = s.status === ShipmentStatus.Finalizado || Boolean((s as any).balancePaymentReceiptUrl) || is100PctAdvPaid;
      const displayStatus: 'Pendente' | 'Pago' | 'Atrasado' = isPaid ? 'Pago' : (effectiveDate < todayStr ? 'Atrasado' : 'Pendente');

      list.push({
        id: `ship_pay_${s.id}`,
        description: `Frete Motorista Embarque ${s.id} - ${driverName}${horsePlate}`,
        supplierName: driverName,
        category: 'Custos com Motoristas / Terceiros',
        costCenter: 'Operacional',
        totalAmount: driverVal,
        payableAmount: driverVal,
        dueDate: effectiveDate,
        paymentDate: isPaid ? effectiveDate : undefined,
        status: displayStatus,
        rawStatus: isPaid ? FinancialTransactionStatus.Pago : FinancialTransactionStatus.Pendente,
        shipmentId: s.id,
        documentNumber: cteNum && cteNum !== '-' ? (cteNum.startsWith('CTE') ? cteNum : `CTE-${cteNum}`) : 'Doc CT-e',
        documentUrl: cteDocUrl,
        contractUrl: contractDocUrl,
        receiptFileUrl: (s as any).balancePaymentReceiptUrl || null,
        receiptFileName: (s as any).balancePaymentReceiptUrl ? 'Comprovante_Saldo.pdf' : undefined,
        bankAccount: 'Sicredi',
        isReconciled: false,
        createdAt: s.createdAt,
        pixKey: s.pixKey,
        details: `Frete Motorista${horsePlate}${shipInfo}`,
        originalItem: {
          id: `ship_pay_${s.id}`,
          type: 'payable',
          amount: driverVal,
          dueDate: effectiveDate,
          supplierOrClientName: driverName,
          documentNumber: cteNum && cteNum !== '-' ? `CTE-${cteNum}` : 'Doc CT-e',
          shipmentId: s.id,
          category: 'Custos com Motoristas / Terceiros',
          costCenter: 'Operacional',
          status: isPaid ? FinancialTransactionStatus.Pago : FinancialTransactionStatus.Pendente
        },
        linkedShipment: s,
      });
    });

    return list.sort((a, b) => new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime());
  }, [transactions, todayStr, shipments]);

  // Helper para verificar se a transação é uma Guia de Imposto / Tributo
  const isTaxTx = useCallback((t: FinancialTransaction): boolean => {
    if (t.taxType) return true;
    const cat = (t.category || '').toLowerCase();
    const desc = (t.description || '').toLowerCase();
    const notes = (t.notes || '').toLowerCase();
    return (
      cat.includes('imposto') ||
      cat.includes('tributo') ||
      cat === 'custoimposto' ||
      desc.includes('dare') ||
      desc.includes('darf') ||
      desc.includes('dctfweb') ||
      desc.includes('pis / cofins') ||
      desc.includes('pis/cofins') ||
      desc.includes('fgts digital') ||
      desc.includes('icms transporte') ||
      notes.includes('[imposto]')
    );
  }, []);

  // 4. Processar Lançamentos Manuais Avulsos Gerais (não-líderes, NÃO-CTE e NÃO-IMPOSTOS)
  const manualPayables = useMemo(() => {
    return (transactions || [])
      .filter(t => t.type === 'payable' && !isLeaderTx(t) && !isCteTx(t) && !isTaxTx(t))
      .map(t => {
        const isOverdue = t.status === FinancialTransactionStatus.Atrasado || (t.status === FinancialTransactionStatus.Pendente && t.dueDate < todayStr);
        const displayStatus: 'Pendente' | 'Pago' | 'Atrasado' = t.status === FinancialTransactionStatus.Pago ? 'Pago' : isOverdue ? 'Atrasado' : 'Pendente';

        return {
          id: t.id,
          description: t.description,
          supplierName: t.supplierOrClientName || 'Despesa Geral',
          category: t.category,
          costCenter: t.costCenter || 'Operacional',
          totalAmount: t.amount,
          payableAmount: t.amount,
          dueDate: t.dueDate,
          paymentDate: t.paymentDate,
          status: displayStatus,
          rawStatus: t.status,
          shipmentId: t.shipmentId,
          documentNumber: t.documentNumber,
          notes: t.notes,
          ownerId: t.ownerId,
          receiptFileUrl: t.receiptFileUrl,
          receiptFileName: t.receiptFileName,
          receiptFileType: t.receiptFileType,
          receiptFileSize: t.receiptFileSize,
          paymentAuthCode: t.paymentAuthCode,
          bankAccount: t.bankAccount,
          isReconciled: t.isReconciled,
          reconciledAt: t.reconciledAt,
          createdAt: t.createdAt,
          originalItem: t,
        };
      })
      .sort((a, b) => new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime());
  }, [transactions, todayStr, leaderUsers, payrollUsers, isTaxTx]);

  // 5. Processar Guias de Impostos e Tributos
  const taxPayables = useMemo(() => {
    return (transactions || [])
      .filter(t => t.type === 'payable' && isTaxTx(t))
      .map(t => {
        const isOverdue = t.status === FinancialTransactionStatus.Atrasado || (t.status === FinancialTransactionStatus.Pendente && t.dueDate < todayStr);
        const displayStatus: 'Pendente' | 'Pago' | 'Atrasado' = t.status === FinancialTransactionStatus.Pago ? 'Pago' : isOverdue ? 'Atrasado' : 'Pendente';

        let detectedTaxType: TaxType = t.taxType || 'OUTROS';
        let detectedTaxTypeName = 'Guia Tributária';
        const upper = `${t.description} ${t.category} ${t.notes || ''}`.toUpperCase();

        if (t.taxType) {
          detectedTaxType = t.taxType;
          if (t.taxType === 'PIS_COFINS') detectedTaxTypeName = 'PIS / COFINS';
          else if (t.taxType === 'ICMS') detectedTaxTypeName = 'ICMS Transporte';
          else if (t.taxType === 'CSLL') detectedTaxTypeName = 'CSLL Estimativa';
          else if (t.taxType === 'IRPJ') detectedTaxTypeName = 'IRPJ Estimativa';
          else if (t.taxType === 'FGTS') detectedTaxTypeName = 'Guia de FGTS';
          else if (t.taxType === 'INSS') detectedTaxTypeName = 'INSS / DCTFWeb';
        } else {
          if (upper.includes('COFINS') || upper.includes('5856') || upper.includes('6912') || upper.includes('PIS')) {
            detectedTaxType = 'PIS_COFINS';
            detectedTaxTypeName = 'PIS / COFINS';
          } else if (upper.includes('ICMS') || upper.includes('DARE') || upper.includes('GNRE') || upper.includes('111-9')) {
            detectedTaxType = 'ICMS';
            detectedTaxTypeName = 'ICMS Transporte';
          } else if (upper.includes('CSLL') || upper.includes('2484')) {
            detectedTaxType = 'CSLL';
            detectedTaxTypeName = 'CSLL Estimativa';
          } else if (upper.includes('IRPJ') || upper.includes('5993')) {
            detectedTaxType = 'IRPJ';
            detectedTaxTypeName = 'IRPJ Estimativa';
          } else if (upper.includes('FGTS')) {
            detectedTaxType = 'FGTS';
            detectedTaxTypeName = 'Guia de FGTS';
          } else if (upper.includes('INSS') || upper.includes('DCTFWEB') || upper.includes('PREVIDENCI')) {
            detectedTaxType = 'INSS';
            detectedTaxTypeName = 'INSS / DCTFWeb';
          }
        }

        let resolvedTaxPeriod = (t.taxPeriod || '').trim();
        if (!resolvedTaxPeriod) {
          const matchRef = (t.description || '').match(/Ref:?\s*(\d{2}\/\d{4})/i) ||
                           (t.notes || '').match(/PA:?\s*(\d{2}\/\d{4})/i) ||
                           (t.notes || '').match(/Ref:?\s*(\d{2}\/\d{4})/i) ||
                           (t.description || '').match(/(\d{2}\/\d{4})/);
          if (matchRef) {
            resolvedTaxPeriod = matchRef[1];
          }
        }

        return {
          id: t.id,
          description: t.description,
          beneficiaryName: t.supplierOrClientName || 'Órgão Arrecadador / Fisco',
          category: t.category || 'Impostos e Tributos',
          costCenter: t.costCenter || 'Fiscal / Tributário',
          totalAmount: t.amount,
          payableAmount: t.amount,
          dueDate: t.dueDate,
          paymentDate: t.paymentDate,
          status: displayStatus,
          rawStatus: t.status,
          documentNumber: t.documentNumber,
          taxType: detectedTaxType,
          taxTypeName: detectedTaxTypeName,
          taxCode: t.taxCode,
          taxPeriod: resolvedTaxPeriod,
          taxPrincipalAmount: t.taxPrincipalAmount,
          taxFineAmount: t.taxFineAmount,
          taxInterestAmount: t.taxInterestAmount,
          barcode: t.barcode,
          attachmentUrl: t.attachmentUrl,
          attachmentName: t.attachmentName,
          receiptFileUrl: t.receiptFileUrl,
          receiptFileName: t.receiptFileName,
          receiptFileType: t.receiptFileType,
          receiptFileSize: t.receiptFileSize,
          paymentAuthCode: t.paymentAuthCode,
          paidAmount: t.paidAmount,
          bankAccount: t.bankAccount,
          notes: t.notes,
          createdAt: t.createdAt,
          originalItem: t,
        };
      })
      .sort((a, b) => new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime());
  }, [transactions, todayStr, isTaxTx]);

  // Alternar status de Nota Fiscal (Dar Baixa rápida ou Reabrir)
  const handleToggleInvoiceStatus = async (invoiceId: string, currentStatus: string) => {
    const targetInvoice = invoices.find(inv => inv.id === invoiceId);
    if (targetInvoice && currentStatus !== 'Pago') {
      handleOpenSettlementModal({
        id: targetInvoice.id,
        kind: 'invoice',
        docNumber: targetInvoice.documentType === 'Fatura' ? `Fatura nº ${targetInvoice.invoiceNumber}` : `NF nº ${targetInvoice.invoiceNumber}`,
        title: `NF-e ${targetInvoice.supplierName}`,
        entityName: targetInvoice.supplierName,
        categoryOrCenter: `${targetInvoice.costCenterName} • ${targetInvoice.costTypeName}`,
        dueDate: targetInvoice.dueDate,
        totalAmount: targetInvoice.totalAmount,
        payableAmount: targetInvoice.payableAmount || targetInvoice.totalAmount,
        status: targetInvoice.status,
        receiptUrl: targetInvoice.receiptFileUrl,
        receiptName: targetInvoice.receiptFileName,
        originalItem: targetInvoice
      });
      return;
    }

    if (targetInvoice && currentStatus === 'Pago' && targetInvoice.isReconciled) {
      alert('🔒 Título Conciliado e Fechado: Este lançamento já foi conciliado com o extrato bancário. Não é possível reabrir diretamente. Para alterar o status, desconcilie no módulo de Conciliação Bancária (requer autorização de Administrador ou Diretoria).');
      return;
    }

    const newStatus: InvoicePaymentStatus = currentStatus === 'Pago' ? 'Pendente' : 'Pago';
    try {
      await financialInvoiceService.updateInvoiceStatus(
        invoiceId,
        newStatus,
        newStatus === 'Pago' ? todayStr : undefined
      );
      setInvoices(prev => prev.map(inv => inv.id === invoiceId ? {
        ...inv,
        status: newStatus,
        paymentDate: newStatus === 'Pago' ? todayStr : undefined
      } : inv));
    } catch (err) {
      console.error('Erro ao alternar status da nota fiscal:', err);
    }
  };
  // Abertura da Modal de Baixa / Anexação de Comprovante
  const handleOpenSettlementModal = (item: {
    id: string;
    kind: SettlingAccountItem['kind'] | 'driver' | 'invoice' | 'cte' | 'manual' | 'leader';
    docNumber: string;
    title: string;
    entityName: string;
    categoryOrCenter: string;
    dueDate: string;
    totalAmount: number;
    payableAmount: number;
    status: 'Pendente' | 'Pago' | 'Atrasado' | InvoicePaymentStatus;
    paymentDate?: string;
    paymentMethod?: FinancialInvoice['paymentMethod'];
    paymentDetails?: string;
    receiptUrl?: string | null;
    receiptName?: string | null;
    originalItem: any;
  }) => {
    const orig = item.originalItem;
    setSettlingItem({
      id: orig.id,
      kind: item.kind,
      docNumber: item.docNumber,
      title: item.title,
      entityName: item.entityName,
      entityCpfCnpj: orig.supplierCnpjCpf || orig.supplierOrClientCpfCnpj,
      categoryOrCenter: item.categoryOrCenter,
      dueDate: item.dueDate,
      totalAmount: item.totalAmount,
      payableAmount: item.payableAmount,
      currentStatus: item.status,
      paymentDate: orig.paymentDate || (item.status === 'Pago' ? todayStr : undefined),
      paymentMethod: orig.paymentMethod || 'Boleto',
      paymentDetails: orig.paymentDetails || orig.pixKey,
      receiptFileUrl: item.receiptUrl || orig.receiptFileUrl,
      receiptFileName: item.receiptName || orig.receiptFileName,
      receiptFileType: orig.receiptFileType,
      receiptFileSize: orig.receiptFileSize,
      paymentAuthCode: orig.paymentAuthCode,
      interestAmount: orig.interestAmount,
      discountAmount: orig.discountAmount,
      paidAmount: orig.paidAmount || (orig.payableAmount || orig.amount || orig.totalAmount),
      bankAccount: orig.bankAccount || 'Sicredi',
      notes: orig.notes,
      taxPeriod: (item as any).taxPeriod || orig.taxPeriod,
      originalItem: orig,
    });
    setIsSettlementModalOpen(true);
  };

  // Abrir modal a partir da tabela de Líderes
  const handleOpenSettlementModalForLeader = (leaderItem: any) => {
    setSettlingItem({
      id: leaderItem.id,
      kind: 'leader',
      docNumber: leaderItem.documentNumber ? `Doc ${leaderItem.documentNumber}` : 'Planejamento Líder',
      title: leaderItem.description,
      entityName: leaderItem.supplierName,
      entityCpfCnpj: leaderItem.supplierOrClientCpfCnpj,
      categoryOrCenter: `${leaderItem.category} • ${leaderItem.costCenter}`,
      dueDate: leaderItem.dueDate,
      totalAmount: leaderItem.totalAmount,
      payableAmount: leaderItem.payableAmount,
      currentStatus: leaderItem.status,
      paymentDate: leaderItem.paymentDate || (leaderItem.status === 'Pago' ? todayStr : undefined),
      paymentMethod: 'Pix',
      paymentDetails: leaderItem.pixKey,
      receiptFileUrl: leaderItem.receiptFileUrl,
      receiptFileName: leaderItem.receiptFileName,
      receiptFileType: leaderItem.receiptFileType,
      receiptFileSize: leaderItem.receiptFileSize,
      paymentAuthCode: leaderItem.paymentAuthCode,
      notes: leaderItem.notes,
      originalItem: leaderItem.originalItem || leaderItem,
    });
    setIsSettlementModalOpen(true);
  };

  // Confirmação da Baixa e Salvamento do Comprovante (com Juros, Abatimento e Valor Real)
  const handleConfirmSettlement = async (data: {
    status: 'Pago';
    paymentDate: string;
    paymentMethod?: FinancialInvoice['paymentMethod'];
    paymentAuthCode?: string;
    interestAmount?: number;
    discountAmount?: number;
    paidAmount?: number;
    bankAccount?: string;
    notes?: string;
    receiptFile?: File | null;
    receiptFileUrl?: string | null;
    receiptFileName?: string | null;
    receiptFileType?: string | null;
    receiptFileSize?: number | null;
  }) => {
    if (!settlingItem) return;

    try {
      if (settlingItem.kind === 'invoice') {
        await financialInvoiceService.updateInvoicePayment(settlingItem.id, {
          status: 'Pago',
          paymentDate: data.paymentDate,
          paymentMethod: data.paymentMethod,
          paymentAuthCode: data.paymentAuthCode,
          interestAmount: data.interestAmount,
          discountAmount: data.discountAmount,
          paidAmount: data.paidAmount,
          bankAccount: data.bankAccount,
          receiptFileUrl: data.receiptFileUrl,
          receiptFileName: data.receiptFileName,
          receiptFileType: data.receiptFileType,
          receiptFileSize: data.receiptFileSize,
          notes: data.notes
        });

        setInvoices(prev => prev.map(inv => inv.id === settlingItem.id ? {
          ...inv,
          status: 'Pago',
          paymentDate: data.paymentDate,
          paymentMethod: data.paymentMethod || inv.paymentMethod,
          paymentAuthCode: data.paymentAuthCode || inv.paymentAuthCode,
          interestAmount: data.interestAmount !== undefined ? data.interestAmount : inv.interestAmount,
          discountAmount: data.discountAmount !== undefined ? data.discountAmount : inv.discountAmount,
          paidAmount: data.paidAmount !== undefined ? data.paidAmount : inv.paidAmount,
          payableAmount: data.paidAmount !== undefined ? data.paidAmount : inv.payableAmount,
          bankAccount: data.bankAccount || inv.bankAccount,
          receiptFileUrl: data.receiptFileUrl || undefined,
          receiptFileName: data.receiptFileName || undefined,
          receiptFileType: data.receiptFileType || undefined,
          receiptFileSize: data.receiptFileSize || undefined,
          notes: data.notes || inv.notes
        } : inv));

        showToast('Baixa confirmada com sucesso! Status atualizado para Pago.', 'success');
      } else {
        // Lançamentos Manuais, Líderes e Motoristas
        if (settlingItem.id.startsWith('ship_pay_')) {
          const s = settlingItem.originalItem?.linkedShipment || settlingItem.originalItem;
          const targetShipId = (settlingItem as any).shipmentId || settlingItem.originalItem?.shipmentId || s?.id;
          if (onAddTransaction) {
            onAddTransaction({
              type: 'payable',
              description: settlingItem.title || (settlingItem as any).description || `Frete Motorista Embarque ${targetShipId || ''}`,
              amount: data.paidAmount !== undefined ? data.paidAmount : (settlingItem.payableAmount || settlingItem.totalAmount),
              dueDate: settlingItem.dueDate || todayStr,
              paymentDate: data.paymentDate,
              status: FinancialTransactionStatus.Pago,
              category: 'Custos com Motoristas / Terceiros',
              costCenter: 'Operacional',
              supplierOrClientName: settlingItem.entityName,
              supplierOrClientCpfCnpj: settlingItem.entityCpfCnpj,
              shipmentId: targetShipId,
              documentNumber: settlingItem.docNumber,
              receiptFileUrl: data.receiptFileUrl || undefined,
              receiptFileName: data.receiptFileName || undefined,
              receiptFileType: data.receiptFileType || undefined,
              receiptFileSize: data.receiptFileSize || undefined,
              paymentAuthCode: data.paymentAuthCode || undefined,
              interestAmount: data.interestAmount,
              discountAmount: data.discountAmount,
              paidAmount: data.paidAmount,
              bankAccount: data.bankAccount,
              notes: data.notes || undefined
            });
          }
        } else if (onUpdateTransaction) {
          // Preservar a marcação do Vale da Folha (mês de desconto) mesmo que as observações sejam editadas na baixa
          const origNotes: string = settlingItem.originalItem?.notes || '';
          const valeTagMatch = origNotes.match(VALE_FOLHA_TAG_REGEX);
          let finalNotes: string | undefined = data.notes || undefined;
          if (valeTagMatch && !(finalNotes || '').match(VALE_FOLHA_TAG_REGEX)) {
            finalNotes = finalNotes ? `${valeTagMatch[0]} | ${finalNotes}` : origNotes;
          }
          onUpdateTransaction(settlingItem.id, {
            status: FinancialTransactionStatus.Pago,
            paymentDate: data.paymentDate,
            receiptFileUrl: data.receiptFileUrl || undefined,
            receiptFileName: data.receiptFileName || undefined,
            receiptFileType: data.receiptFileType || undefined,
            receiptFileSize: data.receiptFileSize || undefined,
            paymentAuthCode: data.paymentAuthCode || undefined,
            interestAmount: data.interestAmount,
            discountAmount: data.discountAmount,
            paidAmount: data.paidAmount,
            bankAccount: data.bankAccount,
            notes: finalNotes
          });
        } else {
          onUpdateStatus(settlingItem.id, FinancialTransactionStatus.Pago);
        }
        showToast('Baixa confirmada com sucesso! Status atualizado para Pago.', 'success');
      }

      setIsSettlementModalOpen(false);
      setSettlingItem(null);
    } catch (err) {
      console.error('Erro ao confirmar baixa de pagamento:', err);
      showToast('Erro ao confirmar baixa de pagamento.', 'error');
    }
  };

  // Reabrir conta para Pendente
  const handleReopenItem = async (target: SettlingAccountItem | any) => {
    const origId = target.id || target.originalItem?.id;
    const isReconciled = Boolean(target.isReconciled || target.originalItem?.isReconciled);
    if (isReconciled) {
      alert('🔒 Título Conciliado e Fechado: Este lançamento já foi auditado e conciliado com o extrato bancário. Não é possível reabrir diretamente. Desconcilie primeiro no módulo de Conciliação Bancária (requer Administrador ou Diretoria).');
      return;
    }
    const kind = target.kind;
    try {
      if (kind === 'invoice') {
        await financialInvoiceService.updateInvoicePayment(origId, {
          status: 'Pendente',
          paymentDate: undefined
        });
        setInvoices(prev => prev.map(inv => inv.id === origId ? {
          ...inv,
          status: 'Pendente',
          paymentDate: undefined
        } : inv));
        showToast('Lançamento reaberto para Pendente.', 'info');
      } else {
        if (onUpdateTransaction) {
          onUpdateTransaction(origId, {
            status: FinancialTransactionStatus.Pendente,
            paymentDate: undefined
          });
        } else {
          onUpdateStatus(origId, FinancialTransactionStatus.Pendente);
        }
        showToast('Lançamento reaberto para Pendente.', 'info');
      }
      setIsSettlementModalOpen(false);
      setSettlingItem(null);
    } catch (err) {
      console.error('Erro ao reabrir conta:', err);
      showToast('Erro ao reabrir conta.', 'error');
    }
  };


  // Filtro de Período (Presets OPZ)
  const matchesPeriod = (dateStr: string) => {
    if (!dateStr) return true;
    if (periodPreset === 'all') return true;
    if (periodPreset === 'today_onwards') {
      return dateStr >= todayStr;
    }
    if (periodPreset === 'today') {
      return dateStr === todayStr;
    }
    if (periodPreset === 'next_7_days') {
      const d = new Date();
      d.setDate(d.getDate() + 7);
      const in7Days = d.toISOString().split('T')[0];
      return dateStr >= todayStr && dateStr <= in7Days;
    }
    if (periodPreset === 'current_month') {
      return dateStr.startsWith(currentMonthPrefix);
    }
    if (periodPreset === 'last_month') {
      return dateStr.startsWith(lastMonthPrefix);
    }
    if (periodPreset === 'custom') {
      if (customStartDate && dateStr < customStartDate) return false;
      if (customEndDate && dateStr > customEndDate) return false;
      return true;
    }
    return true;
  };

  // Filtragem: Notas Fiscais
  const filteredInvoices = useMemo(() => {
    return invoicePayables.filter(item => {
      if (searchTerm) {
        const s = searchTerm.toLowerCase();
        const match =
          item.invoiceNumber.toLowerCase().includes(s) ||
          item.supplierName.toLowerCase().includes(s) ||
          (item.supplierCnpjCpf && item.supplierCnpjCpf.toLowerCase().includes(s)) ||
          item.costCenterName.toLowerCase().includes(s) ||
          (item.description && item.description.toLowerCase().includes(s));
        if (!match) return false;
      }

      if (statusFilter !== 'all' && item.status !== statusFilter) {
        return false;
      }

      if (!matchesPeriod(item.dueDate) && !matchesPeriod(item.issueDate)) {
        return false;
      }

      return true;
    });
  }, [invoicePayables, searchTerm, statusFilter, periodPreset, customStartDate, customEndDate, currentMonthPrefix, lastMonthPrefix]);

  // Filtragem: Fretes / Doc CT-e
  const filteredCtePayables = useMemo(() => {
    return ctePayables.filter(item => {
      if (searchTerm) {
        const s = searchTerm.toLowerCase();
        const match =
          item.description.toLowerCase().includes(s) ||
          item.supplierName.toLowerCase().includes(s) ||
          item.category.toLowerCase().includes(s) ||
          (item.documentNumber && item.documentNumber.toLowerCase().includes(s)) ||
          (item.shipmentId && item.shipmentId.toLowerCase().includes(s)) ||
          (item.linkedShipment?.horsePlate && item.linkedShipment.horsePlate.toLowerCase().includes(s)) ||
          (item.linkedShipment?.driverName && item.linkedShipment.driverName.toLowerCase().includes(s));
        if (!match) return false;
      }

      if (statusFilter !== 'all' && item.status !== statusFilter) {
        return false;
      }

      if (!matchesPeriod(item.dueDate)) {
        return false;
      }

      return true;
    });
  }, [ctePayables, searchTerm, statusFilter, periodPreset, customStartDate, customEndDate, currentMonthPrefix, lastMonthPrefix]);

  // Filtragem: Manuais Avulsos
  const filteredManuals = useMemo(() => {
    return manualPayables.filter(item => {
      if (searchTerm) {
        const s = searchTerm.toLowerCase();
        const match =
          item.description.toLowerCase().includes(s) ||
          item.supplierName.toLowerCase().includes(s) ||
          item.category.toLowerCase().includes(s) ||
          (item.documentNumber && item.documentNumber.toLowerCase().includes(s));
        if (!match) return false;
      }

      if (statusFilter !== 'all' && item.status !== statusFilter) {
        return false;
      }

      if (!matchesPeriod(item.dueDate)) {
        return false;
      }

      return true;
    });
  }, [manualPayables, searchTerm, statusFilter, periodPreset, customStartDate, customEndDate, currentMonthPrefix, lastMonthPrefix]);

  // Filtragem: Agenciadores Líder
  const filteredLeaderPayables = useMemo(() => {
    return leaderPayables.filter(item => {
      if (selectedLeaderFilter !== 'all') {
        const targetLeader = leaderUsers.find(l => l.id === selectedLeaderFilter);
        const matchLeader = (item.ownerId && item.ownerId === selectedLeaderFilter) ||
          (targetLeader && item.supplierName.toLowerCase().includes(targetLeader.name.toLowerCase()));
        if (!matchLeader) return false;
      }

      if (searchTerm) {
        const s = searchTerm.toLowerCase();
        const match =
          item.description.toLowerCase().includes(s) ||
          item.supplierName.toLowerCase().includes(s) ||
          item.category.toLowerCase().includes(s) ||
          (item.notes && item.notes.toLowerCase().includes(s)) ||
          (item.documentNumber && item.documentNumber.toLowerCase().includes(s));
        if (!match) return false;
      }

      if (statusFilter !== 'all' && item.status !== statusFilter) {
        return false;
      }

      if (!matchesPeriod(item.dueDate) && !(item.paymentDate && matchesPeriod(item.paymentDate))) {
        return false;
      }

      return true;
    });
  }, [leaderPayables, selectedLeaderFilter, searchTerm, statusFilter, periodPreset, customStartDate, customEndDate, currentMonthPrefix, lastMonthPrefix, leaderUsers]);

  // Competências disponíveis para filtro em Guias de Impostos
  const availableCompetencePeriods = useMemo(() => {
    const set = new Set<string>();
    taxPayables.forEach(t => {
      const p = t.taxPeriod?.trim();
      if (p) set.add(p);
    });
    return Array.from(set).sort((a, b) => {
      const [mA, yA] = a.split('/').map(Number);
      const [mB, yB] = b.split('/').map(Number);
      if (yA && yB && yA !== yB) return yB - yA;
      if (mA && mB) return mB - mA;
      return b.localeCompare(a);
    });
  }, [taxPayables]);

  // Filtragem: Guias de Impostos e Tributos
  const filteredTaxes = useMemo(() => {
    return taxPayables.filter(item => {
      if (selectedTaxTypeFilter !== 'all' && item.taxType !== selectedTaxTypeFilter) {
        return false;
      }

      if (selectedCompetenceFilter !== 'all' && (item.taxPeriod || '').trim() !== selectedCompetenceFilter) {
        return false;
      }

      if (searchTerm) {
        const s = searchTerm.toLowerCase();
        const match =
          item.description.toLowerCase().includes(s) ||
          item.beneficiaryName.toLowerCase().includes(s) ||
          item.category.toLowerCase().includes(s) ||
          (item.documentNumber && item.documentNumber.toLowerCase().includes(s)) ||
          (item.taxCode && item.taxCode.toLowerCase().includes(s)) ||
          (item.taxPeriod && item.taxPeriod.toLowerCase().includes(s)) ||
          (item.barcode && item.barcode.toLowerCase().includes(s)) ||
          (item.notes && item.notes.toLowerCase().includes(s));
        if (!match) return false;
      }

      if (statusFilter !== 'all' && item.status !== statusFilter) {
        return false;
      }

      if (!matchesPeriod(item.dueDate) && !(item.paymentDate && matchesPeriod(item.paymentDate))) {
        return false;
      }

      return true;
    });
  }, [taxPayables, selectedTaxTypeFilter, selectedCompetenceFilter, searchTerm, statusFilter, periodPreset, customStartDate, customEndDate, currentMonthPrefix, lastMonthPrefix]);

  // Mapeamento de Cargas e Filiais para Apuração das Comissões
  const cargoMap = useMemo(() => {
    const map = new Map<string, Cargo>();
    (cargos || []).forEach(c => map.set(c.id, c));
    return map;
  }, [cargos]);

  const branchMap = useMemo(() => {
    const map = new Map<string, Branch>();
    (branches || []).forEach(b => map.set(b.id, b));
    return map;
  }, [branches]);

  const userMap = useMemo(() => {
    const map = new Map<string, User>();
    (users || []).forEach(u => map.set(u.id, u));
    return map;
  }, [users]);

  // Helper canônico de resolução de liderança de agência (ex: operador Murilo -> líder Maurício)
  const getLeaderIdForUser = useCallback((userId?: string): string | undefined => {
    if (!userId) return undefined;
    const user = userMap.get(userId);
    if (!user) {
      const userByName = (users || []).find(u =>
        u.name.toLowerCase() === userId.toLowerCase() ||
        u.email?.toLowerCase() === userId.toLowerCase()
      );
      if (userByName) {
        if (userByName.agencyRole === 'embarque' && userByName.agencyLeaderId) {
          return userByName.agencyLeaderId;
        }
        if (userByName.agencyLeaderId) {
          return userByName.agencyLeaderId;
        }
        return userByName.id;
      }
      return undefined;
    }
    if (user.agencyRole === 'embarque' && user.agencyLeaderId) {
      return user.agencyLeaderId;
    }
    if (user.agencyLeaderId) {
      return user.agencyLeaderId;
    }
    return user.id;
  }, [userMap, users]);

  // 5. APURAÇÃO CONSOLIDADA DA FOLHA DE PAGAMENTO (CLT, PJ E GESTORES AG)
  // 5. APURAÇÃO CONSOLIDADA DA FOLHA DE PAGAMENTO (CLT, PJ E GESTORES AG) COM CONTROLE DE VIRADA DE MÊS E DOCUMENTOS
  const { allPayrollSettlements, pendingPayrollItems, completedPayrollItems } = useMemo(() => {
    const buildSettlementForMonth = (user: User, monthKey: string, isPrevious: boolean): PayrollSettlementItem => {
      const regime = getUserRegime(user);
      const branch = (user.branchId && branchMap.get(user.branchId)) ||
        (user.filialId && branchMap.get(user.filialId));
      const branchName = branch ? branch.name : (user.branchId || 'Matriz');
      const profileLabel = user.profile === UserProfile.Agenciador && regime === 'Gestor AG' ? 'Gestor AG' : String(user.profile);

      const teamMembers = (users || []).filter(u => u.agencyLeaderId === user.id);
      const teamCount = teamMembers.length;
      const commissionPct = user.agencyCommissionPercentage ?? 30;

      // Salário Fixo / Base
      const fixedSalary = userSalaries[user.id] !== undefined
        ? userSalaries[user.id]
        : (user.commercialFixedSalary ? Number(user.commercialFixedSalary) : 0);

      // Tributos CLT (INSS, IRRF, descontos)
      const taxesClt = (regime === 'CLT')
        ? (userTaxes[user.id] !== undefined ? userTaxes[user.id] : 0)
        : 0;

      // Identificar vales múltiplos e parcelados do colaborador
      const userVales = (payrollAdvanceItems || []).filter(v => v.userId === user.id);
      const activeValesInMonth: Array<{
        vale: PayrollAdvanceItem;
        installment: PayrollAdvanceInstallment;
      }> = [];

      userVales.forEach(v => {
        const insts = v.installments || [];
        if (insts.length > 0) {
          insts.forEach(inst => {
            if (inst.monthKey === monthKey) {
              activeValesInMonth.push({ vale: v, installment: inst });
            }
          });
        } else if (v.startMonthKey === monthKey || (!v.startMonthKey && v.issueDate && v.issueDate.startsWith(monthKey))) {
          // Fallback se não houver parcelas geradas
          activeValesInMonth.push({
            vale: v,
            installment: {
              installmentNumber: 1,
              totalInstallments: 1,
              monthKey,
              amount: v.amount
            }
          });
        }
      });

      const valesInstallmentsTotal = activeValesInMonth.reduce((sum, item) => sum + item.installment.amount, 0);

      // Adiantamento manual registrado (com data e comprovante)
      const advKey = `${user.id}_${monthKey}`;
      const advRecord = payrollAdvances[advKey];

      // Se houver vales estruturados cadastrados para o colaborador, utiliza a apuração exata das parcelas do mês
      const customAdvance = userVales.length > 0
        ? valesInstallmentsTotal
        : (advRecord !== undefined
          ? advRecord.amount
          : (userCustomAdvances[user.id] !== undefined ? userCustomAdvances[user.id] : 0));

      let shipmentsCount = 0;
      let totalFreightRevenue = 0;
      let totalNetProfit = 0;
      let commissionEarned = 0;
      const shipmentDetails: Array<{
        id: string;
        cte: string;
        date: string;
        clientName: string;
        origin: string;
        destination: string;
        driverName: string;
        plate: string;
        companyFreight: number;
        totalExpenses: number;
        netProfit: number;
        commissionPct: number;
        commissionVal: number;
        status: string;
        isEligible?: boolean;
        isEndOfMonthException?: boolean;
      }> = [];

      // Perfil de Agenciamento (Gestor AG / Agenciador Líder)
      const isAgencyProfile =
        regime === 'Gestor AG' ||
        user.profile === UserProfile.Agenciador ||
        user.agencyRole === 'lider';

      // Perfil Comercial (Representante / Gerente Comercial) - exclusivo para quem NÃO é Gestor AG
      const isCommercialProfile = !isAgencyProfile && (
        user.profile === UserProfile.Comercial ||
        user.profile === UserProfile.GerenteComercial ||
        String(user.profile).toLowerCase().includes('comercial') ||
        user.hasCommercialCommission === true
      );

      // Taxas comerciais padrão (ou configuradas no cadastro do usuário)
      const commMatrizRate = user.commercialMatrizRate !== undefined ? Number(user.commercialMatrizRate) : 0.20; // 0,20%
      const commFiliaisRate = user.commercialFiliaisRate !== undefined ? Number(user.commercialFiliaisRate) : 0.10; // 0,10%

      // Apuração dos fretes do mês para usuários com comissão (Comercial ou Gestores AG Líderes)
      let expectedCommissionEarned = 0;
      let expectedShipmentsCount = 0;

      if (isAgencyProfile || isCommercialProfile) {
        (shipments || []).forEach(s => {
          if (s.status === ShipmentStatus.Cancelado || !isCteApplicableForStatus(s.status)) return;
          const cteVal = getShipmentCte(s);
          if (!cteVal || cteVal === '-') return;

          const sDate = getShipmentEffectiveDate(s) || (s.scheduledDate ? parseDateToYmd(s.scheduledDate) : null) || (s.createdAt ? s.createdAt.split('T')[0] : null);
          if (!sDate || !sDate.startsWith(monthKey)) return;

          const cargo = cargoMap.get(s.cargoId);
          const exp = calculateShipmentExpenses(s, cargo);
          const opProfit = exp.netProfit;

          let isMatch = false;
          let matchCommVal = 0;
          let pct = 0;

          if (isAgencyProfile) {
            // 1. Identificar o Agenciador Líder / Agência responsável por este frete (direto ou via operador vinculado)
            let targetLeaderId = getLeaderIdForUser(s.embarcadorId) ||
              getLeaderIdForUser(s.createdById) ||
              (cargo?.createdById ? getLeaderIdForUser(cargo.createdById) : undefined);

            // 2. Identificação por nome de agência gravado no embarque
            if (!targetLeaderId && s.agencyCommissionAgencyName) {
              const matchedUser = (users || []).find(u =>
                u.name.toLowerCase() === s.agencyCommissionAgencyName?.toLowerCase() ||
                s.agencyCommissionAgencyName?.toLowerCase().includes(u.name.toLowerCase()) ||
                u.email?.toLowerCase() === s.agencyCommissionAgencyName?.toLowerCase()
              );
              if (matchedUser) {
                targetLeaderId = getLeaderIdForUser(matchedUser.id);
              }
            }

            // 3. Fallback por filial exclusiva de agência (apenas se for líder daquela filial)
            if (!targetLeaderId && s.branchId) {
              const matchedLeaderByBranch = (users || []).find(u =>
                u.profile === UserProfile.Agenciador &&
                u.agencyRole !== 'embarque' &&
                u.branchId === s.branchId
              );
              if (matchedLeaderByBranch) {
                targetLeaderId = matchedLeaderByBranch.id;
              }
            }

            // Se o frete pertence à agência deste Gestor AG:
            if (targetLeaderId === user.id) {
              isMatch = true;
              const isAgencyEnabled = s.agencyCommissionEnabled !== false && (s.agencyCommissionEnabled === true || Boolean(user.profile === UserProfile.Agenciador));
              pct = s.agencyCommissionPercentage !== undefined
                ? Number(s.agencyCommissionPercentage)
                : commissionPct;
              matchCommVal = (isAgencyEnabled && opProfit > 0) ? Number((opProfit * (pct / 100)).toFixed(2)) : 0;
            }
          } else if (isCommercialProfile) {
            // Vínculo Comercial: usuário comercial com fretes da Matriz / Filiais
            const effectiveBranchId = s.branchId || (s.createdById ? userMap.get(s.createdById)?.branchId : undefined) || cargo?.branchId;
            const branchObj = effectiveBranchId ? branchMap.get(effectiveBranchId) : null;
            const isMatriz = branchObj
              ? branchObj.name.toLowerCase().includes('matriz')
              : (!effectiveBranchId || effectiveBranchId === 'matriz' || effectiveBranchId === user.branchId);

            if (isMatriz) {
              isMatch = true;
              pct = commMatrizRate;
              const calcBase = (user.commercialCalculationMode === 'liquido') ? opProfit : exp.companyFreight;
              matchCommVal = (s.commercialCommission !== undefined && s.commercialCommission > 0)
                ? s.commercialCommission
                : (exp.comissaoComercial > 0 ? exp.comissaoComercial : Number((calcBase * (pct / 100)).toFixed(2)));
            } else {
              const selectedBranchIds = user.commercialSelectedBranchIds;
              if (!selectedBranchIds || (effectiveBranchId && selectedBranchIds.includes(effectiveBranchId))) {
                isMatch = true;
                pct = commFiliaisRate;
                const calcBase = (user.commercialCalculationMode === 'liquido') ? opProfit : exp.companyFreight;
                matchCommVal = (s.commercialCommission !== undefined && s.commercialCommission > 0)
                  ? s.commercialCommission
                  : (exp.comissaoComercial > 0 ? exp.comissaoComercial : Number((calcBase * (pct / 100)).toFixed(2)));
              }
            }
          }

          if (!isMatch) return;

          const client = clients.find(c => c.id === (cargo?.clientId || s.embarcadorId));
          const clientName = client?.nomeFantasia || client?.razaoSocial || 'Cliente';

          const isEligible = isShipmentEligibleForCommission(s, monthKey);
          const isEndOfMonthException = isShipmentEligibleByEndOfMonthException(s);

          if (isEligible) {
            shipmentsCount += 1;
            totalFreightRevenue += exp.companyFreight;
            totalNetProfit += opProfit;
            commissionEarned += matchCommVal;
          } else {
            expectedShipmentsCount += 1;
            expectedCommissionEarned += matchCommVal;
          }

          shipmentDetails.push({
            id: s.id,
            cte: cteVal,
            date: sDate ? new Date(sDate + 'T00:00:00').toLocaleDateString('pt-BR') : '-',
            clientName,
            origin: cargo?.origin || s.route || 'Origem',
            destination: cargo?.destination || 'Destino',
            driverName: s.driverName || 'Motorista',
            plate: (s as any).vehiclePlate || (s as any).plate || (s.documents as any)?.plate || '-',
            companyFreight: exp.companyFreight,
            totalExpenses: exp.totalExpenses,
            netProfit: opProfit,
            commissionPct: pct,
            commissionVal: matchCommVal,
            status: s.status,
            isEligible,
            isEndOfMonthException
          });
        });
      }

      // Se houver valor de comissão customizado/manual salvo para o colaborador, respeitar o override (exceto resíduo de bug 1272.96)
      if (userCustomCommissions[user.id] !== undefined && userCustomCommissions[user.id] !== 1272.96) {
        commissionEarned = userCustomCommissions[user.id];
      }

      // Vales lançados em "Lançamentos Avulsos" vinculados a este colaborador (pesquisados diretamente em transactions)
      const userValeTxs = (transactions || []).filter(t =>
        t.type === 'payable' &&
        isValeTransaction(t) &&
        t.status !== FinancialTransactionStatus.Cancelado &&
        (
          (t.ownerId && t.ownerId === user.id) ||
          (!t.ownerId && t.supplierOrClientName && t.supplierOrClientName.toLowerCase().includes(user.name.toLowerCase()))
        )
      );

      // Identificar adiantamentos / vales vinculados (descontados no mês de referência indicado no lançamento)
      const advanceTxs = userValeTxs.filter(t => getValeDiscountMonthKey(t) === monthKey);

      // Regra estrita: o vale só soma na Folha após BAIXA (Pago) + COMPROVANTE anexado
      const advanceTxsConfirmed = advanceTxs.filter(t =>
        t.status === FinancialTransactionStatus.Pago && Boolean(t.receiptFileUrl)
      );
      const advanceTxsAwaiting = advanceTxs.filter(t => !advanceTxsConfirmed.includes(t));

      const advanceTxsPaid = advanceTxsConfirmed.reduce((sum, t) => sum + (t.amount || 0), 0);
      const pendingValesAmount = advanceTxsAwaiting.reduce((sum, t) => sum + (t.amount || 0), 0);

      // Demais transações da Folha (salários / comissões planejadas)
      const userLinkedLeaderTxs = leaderPayables.filter(t =>
        (t.ownerId && t.ownerId === user.id) ||
        (!t.ownerId && t.supplierName && t.supplierName.toLowerCase().includes(user.name.toLowerCase()))
      );

      const relatedTxs = userLinkedLeaderTxs
        .filter(t => !isValeTransaction(t))
        .filter(t => (t.dueDate && t.dueDate.startsWith(monthKey)) || (t.paymentDate && t.paymentDate.startsWith(monthKey)));

      const totalAdvances = advanceTxsPaid + customAdvance;

      // Demais pagamentos (salários / comissões) já liquidados
      const regularPaidTxs = relatedTxs
        .filter(t => t.rawStatus === FinancialTransactionStatus.Pago)
        .reduce((sum, t) => sum + t.payableAmount, 0);

      // Total Já Quitado / Total Já Pago: soma de todos os vales e adiantamentos concedidos no mês + demais baixas realizadas
      let totalPaid = totalAdvances + regularPaidTxs;

      const totalPlannedPending = relatedTxs
        .filter(t => t.rawStatus !== FinancialTransactionStatus.Pago && t.rawStatus !== FinancialTransactionStatus.Cancelado)
        .reduce((sum, t) => sum + t.payableAmount, 0);

      // Total Bruto e Total Devido (Fixo + Comissão em qualquer regime)
      const grossTotal = fixedSalary + commissionEarned;

      const totalDeductions = taxesClt + totalAdvances;
      const netDue = Math.max(0, grossTotal - taxesClt - totalAdvances);

      // Documentos anexados e dados salvos
      const docKey = `${user.id}_${monthKey}`;
      const savedDoc = payrollDocs[docKey];

      // Regra de início de uso: os acertos do mês de Setembro (2026-09) já foram realizados e quitados
      const isSeptemberInitial = (monthKey === '2026-09');

      if (savedDoc?.isPaid || (isSeptemberInitial && savedDoc?.isPaid !== false)) {
        totalPaid = Math.max(totalPaid, Math.max(0, grossTotal - taxesClt));
      }

      // Saldo Pendente de Pagamento: Bruto - Tributos - Total Já Quitado (Vales + Baixas)
      // Equivale exatamente a Líquido Devido (netDue) - regularPaidTxs
      const balancePending = (isSeptemberInitial && savedDoc?.isPaid !== false)
        ? 0
        : Math.max(0, Math.max(0, grossTotal - taxesClt) - totalPaid);

      const totalDue = grossTotal;

      const invoiceNumber = savedDoc?.invoiceNumber;
      const invoiceIssueDate = savedDoc?.invoiceIssueDate;
      const invoiceFileUrl = savedDoc?.invoiceFileUrl;
      const invoiceFileName = savedDoc?.invoiceFileName;

      const receiptFileUrl = savedDoc?.receiptFileUrl;
      const receiptFileName = savedDoc?.receiptFileName;
      const paymentDate = savedDoc?.paymentDate || (totalPaid > 0 ? (isSeptemberInitial ? '2026-09-30' : todayStr) : undefined);
      const paymentAuthCode = savedDoc?.paymentAuthCode;

      const hasInvoice = Boolean(invoiceFileUrl);
      const hasReceipt = Boolean(receiptFileUrl);

      // Verificação de pendências documentais por regime:
      // Se for Setembro/2026 (já quitado na implantação), não bloqueia pendência documental
      let isAllDocsAttached = false;
      let isDocumentPending = false;
      let missingDocsText = '';

      if (isSeptemberInitial) {
        isAllDocsAttached = true;
        isDocumentPending = false;
        missingDocsText = '';
      } else if (regime === 'CLT') {
        isAllDocsAttached = hasReceipt;
        isDocumentPending = !hasReceipt;
        missingDocsText = !hasReceipt ? 'Falta Comprovante' : '';
      } else {
        isAllDocsAttached = hasInvoice && hasReceipt;
        isDocumentPending = !hasInvoice || !hasReceipt;
        if (!hasInvoice && !hasReceipt) {
          missingDocsText = 'Falta NF e Comprovante';
        } else if (!hasInvoice) {
          missingDocsText = 'Falta Nota Fiscal';
        } else if (!hasReceipt) {
          missingDocsText = 'Falta Comprovante';
        }
      }

      const isBalanceCleared = (balancePending <= 0 && (grossTotal > 0 || totalPaid > 0)) || Boolean(savedDoc?.isPaid) || isSeptemberInitial;
      const isCompleted = isSeptemberInitial ? true : (Boolean(savedDoc?.isCompleted) || (isBalanceCleared && isAllDocsAttached));

      return {
        id: docKey,
        userId: user.id,
        user,
        leader: user,
        regime,
        monthKey,
        monthLabel: formatMonthKeyToLabel(monthKey),
        isPreviousMonth: isPrevious,
        branchName,
        profileLabel,
        teamCount,
        shipmentsCount,
        totalFreightRevenue,
        totalNetProfit,
        commissionPct,
        commissionEarned,
        commercialFixedSalary: fixedSalary,
        fixedSalary,
        taxesClt,
        customAdvance,
        totalAdvances,
        totalDeductions,
        grossTotal,
        netDue,
        totalDue,
        totalPaid,
        totalPlannedPending,
        balancePending,
        status: isCompleted ? 'liquidado' : (balancePending > 0 ? 'pendente' : 'sem_movimento'),

        invoiceNumber,
        invoiceIssueDate,
        invoiceFileUrl,
        invoiceFileName,
        receiptFileUrl,
        receiptFileName,
        paymentDate,
        paymentAuthCode,
        hasInvoice,
        hasReceipt,
        isCompleted,
        isDocumentPending,
        missingDocsText,

        // Detalhes do Adiantamento / Vales Concedidos
        advanceDate: activeValesInMonth[0]?.vale.issueDate || advanceTxsConfirmed[0]?.paymentDate || advRecord?.date || advanceTxsConfirmed[0]?.dueDate,
        advanceReceiptUrl: activeValesInMonth.find(it => it.vale.receiptFileUrl)?.vale.receiptFileUrl || advanceTxsConfirmed.find(t => t.receiptFileUrl)?.receiptFileUrl || advRecord?.receiptFileUrl,
        advanceReceiptFileName: activeValesInMonth.find(it => it.vale.receiptFileName)?.vale.receiptFileName || advanceTxsConfirmed.find(t => t.receiptFileUrl)?.receiptFileName || advRecord?.receiptFileName,
        activeValesCount: activeValesInMonth.length + advanceTxsConfirmed.length,
        pendingValesAmount,
        pendingValesCount: advanceTxsAwaiting.length,
        expectedCommission: expectedCommissionEarned,
        expectedShipmentsCount,

        shipments: shipmentDetails,
      };
    };

    const allItems: PayrollSettlementItem[] = [];
    const pendingItems: PayrollSettlementItem[] = [];
    const completedItems: PayrollSettlementItem[] = [];

    payrollUsers.forEach(user => {
      // 1. Mês Anterior (verificar se virou o mês e ainda tem pendência financeira ou documental)
      const prev = buildSettlementForMonth(user, lastMonthPrefix, true);
      allItems.push(prev);
      if (prev.isCompleted) {
        completedItems.push(prev);
      } else {
        // PERMANECE na tela inicial se o acerto do mês anterior ainda não foi concluído!
        pendingItems.push(prev);
      }

      // 2. Mês Atual (nova apuração de cada um a cada mês)
      const curr = buildSettlementForMonth(user, currentMonthPrefix, false);
      allItems.push(curr);
      if (curr.isCompleted) {
        completedItems.push(curr);
      } else {
        pendingItems.push(curr);
      }
    });

    // Ordenar pendentes: meses anteriores pendentes no topo com prioridade, seguidos do mês atual
    pendingItems.sort((a, b) => {
      if (a.isPreviousMonth && !b.isPreviousMonth) return -1;
      if (!a.isPreviousMonth && b.isPreviousMonth) return 1;
      return a.user.name.localeCompare(b.user.name);
    });

    completedItems.sort((a, b) => (b.paymentDate || '').localeCompare(a.paymentDate || ''));

    return {
      allPayrollSettlements: allItems,
      pendingPayrollItems: pendingItems,
      completedPayrollItems: completedItems
    };
  }, [transactions, payrollUsers, leaderPayables, shipments, cargos, clients, users, branchMap, cargoMap, userMap, getLeaderIdForUser, currentMonthPrefix, lastMonthPrefix, userRegimes, userSalaries, userCustomCommissions, userTaxes, userCustomAdvances, payrollAdvances, payrollAdvanceItems, payrollDocs, todayStr]);

  // Totais consolidados e separados por Mês da Folha de Pagamento
  const payrollMonthTotals = useMemo(() => {
    const calcTotals = (items: PayrollSettlementItem[]) => {
      return items.reduce((acc, it) => {
        acc.gross += (it.grossTotal || it.totalDue);
        acc.taxes += (it.taxesClt || 0);
        acc.advances += (it.totalAdvances || 0);
        acc.netDue += (it.netDue || 0);
        acc.paid += it.totalPaid;
        acc.pending += it.balancePending;
        acc.count += 1;
        return acc;
      }, { gross: 0, taxes: 0, advances: 0, netDue: 0, paid: 0, pending: 0, count: 0 });
    };

    const currentItems = allPayrollSettlements.filter(it => it.monthKey === currentMonthPrefix);
    const lastItems = allPayrollSettlements.filter(it => it.monthKey === lastMonthPrefix);

    return {
      current: {
        ...calcTotals(currentItems),
        label: formatMonthKeyToLabel(currentMonthPrefix)
      },
      last: {
        ...calcTotals(lastItems),
        label: formatMonthKeyToLabel(lastMonthPrefix)
      },
      all: {
        ...calcTotals(allPayrollSettlements),
        label: 'Todos os Meses'
      }
    };
  }, [allPayrollSettlements, currentMonthPrefix, lastMonthPrefix]);

  // leadersSummary para compatibilidade com KPIs e telas existentes (baseado na sub-aba ativa e filtro de mês)
  const leadersSummary = useMemo(() => {
    let list = payrollSubTab === 'completed' ? completedPayrollItems : pendingPayrollItems;
    if (payrollSelectedMonth === 'current') {
      list = list.filter(item => item.monthKey === currentMonthPrefix);
    } else if (payrollSelectedMonth === 'last') {
      list = list.filter(item => item.monthKey === lastMonthPrefix);
    }
    return list;
  }, [payrollSubTab, completedPayrollItems, pendingPayrollItems, payrollSelectedMonth, currentMonthPrefix, lastMonthPrefix]);

  // Handler para Salvar Documentos e Concluir Acerto de Pagamento
  const handleSavePayrollDocs = async (docKey: string, data: {
    invoiceNumber?: string;
    invoiceIssueDate?: string;
    invoiceFileUrl?: string;
    invoiceFileName?: string;
    receiptFileUrl?: string;
    receiptFileName?: string;
    paymentDate?: string;
    paymentAuthCode?: string;
    markAsPaid?: boolean;
    notes?: string;
  }) => {
    const settlement = allPayrollSettlements.find(s => s.id === docKey);
    const regime = settlement?.regime || 'CLT';
    const hasInv = Boolean(data.invoiceFileUrl);
    const hasRec = Boolean(data.receiptFileUrl);
    const isPaid = Boolean(data.markAsPaid) || (settlement ? settlement.balancePending <= 0 : false);

    const isAllDocsAttached = (regime === 'CLT') ? hasRec : (hasInv && hasRec);
    const willComplete = isPaid && isAllDocsAttached;

    savePayrollDoc(docKey, {
      ...data,
      isPaid,
      isCompleted: willComplete,
      completedAt: willComplete ? new Date().toISOString() : undefined
    });

    if (data.markAsPaid && settlement && settlement.balancePending > 0) {
      onAddTransaction({
        type: 'payable',
        description: `Quitação Folha - ${settlement.user.name} (${settlement.monthLabel})`,
        amount: settlement.balancePending,
        dueDate: data.paymentDate || todayStr,
        paymentDate: data.paymentDate || todayStr,
        status: FinancialTransactionStatus.Pago,
        category: regime === 'Gestor AG' ? 'Comissão de Agenciador Líder' : 'Folha de Pagamento',
        costCenter: regime === 'Gestor AG' ? 'Operacional' : 'Administrativo',
        supplierOrClientName: settlement.user.name,
        notes: `[Quitação Folha de Pagamento] ${settlement.monthLabel} | Regime: ${regime}${data.invoiceNumber ? ` | NF: ${data.invoiceNumber}` : ''}${data.paymentAuthCode ? ` | Aut: ${data.paymentAuthCode}` : ''}`,
        ownerId: settlement.userId
      });
    }

    if (willComplete) {
      showToast(`🎉 Pagamento de ${settlement?.user.name} (${settlement?.monthLabel}) concluído com sucesso! Documentos validados e movido para o histórico de "Pagamento Feito".`, 'success');
    } else {
      const missing: string[] = [];
      if (regime === 'CLT') {
        if (!hasRec) missing.push('Comprovante de Pagamento');
      } else {
        if (!hasInv) missing.push('Nota Fiscal');
        if (!hasRec) missing.push('Comprovante de Pagamento');
      }
      if (!isPaid) missing.push('Quitação do saldo');
      showToast(`Documentos salvos! Ainda pendente: ${missing.join(', ')}. O acerto permanece na tela inicial.`, 'info');
    }
  };

  // Lista Consolidada Unificada para exibição em "Todas as Contas a Pagar"
  const consolidatedList = useMemo(() => {
    const list: Array<{
      id: string;
      kind: 'invoice' | 'manual' | 'leader' | 'driver' | 'cte' | 'tax';
      docNumber: string;
      title: string;
      entityName: string;
      categoryOrCenter: string;
      dueDate: string;
      entryDate?: string;
      totalAmount: number;
      payableAmount: number;
      status: 'Pendente' | 'Pago' | 'Atrasado' | InvoicePaymentStatus;
      documentUrl?: string | null;
      boletoUrl?: string | null;
      contractUrl?: string | null;
      receiptUrl?: string | null;
      receiptName?: string | null;
      details?: string;
      pixKey?: string;
      bankAccount?: string;
      isReconciled?: boolean;
      reconciledAt?: string;
      originalItem: any;
    }> = [];

    // 1. Notas Fiscais e Faturas
    if (activeSection === 'all' || activeSection === 'invoices') {
      filteredInvoices.forEach(inv => {
        const isFatura = inv.documentType === 'Fatura';
        list.push({
          id: `inv_${inv.id}`,
          kind: 'invoice',
          docNumber: isFatura ? `Fatura nº ${inv.invoiceNumber}` : `NF nº ${inv.invoiceNumber}`,
          title: isFatura ? `Fatura ${inv.supplierName}` : `NF-e ${inv.supplierName}`,
          entityName: inv.supplierName,
          categoryOrCenter: `${inv.costCenterName} • ${inv.costTypeName}`,
          dueDate: inv.dueDate,
          entryDate: inv.createdAt ? inv.createdAt.split('T')[0] : inv.issueDate,
          totalAmount: inv.totalAmount,
          payableAmount: inv.payableAmount !== undefined ? inv.payableAmount : inv.totalAmount,
          status: inv.status,
          documentUrl: inv.fileUrl,
          boletoUrl: inv.boletoFileUrl,
          receiptUrl: inv.receiptFileUrl,
          receiptName: inv.receiptFileName,
          details: inv.description,
          bankAccount: inv.bankAccount,
          isReconciled: Boolean(inv.isReconciled),
          reconciledAt: inv.reconciledAt,
          originalItem: inv,
        });
      });
    }

    // 2. Fretes / Doc CT-e (Exibidos EXCLUSIVAMENTE na aba dedicada "Fretes / Doc CT-e")
    if (activeSection === 'cte') {
      filteredCtePayables.forEach(c => {
        list.push({
          id: `cte_${c.id}`,
          kind: 'cte',
          docNumber: c.documentNumber ? (c.documentNumber.toUpperCase().startsWith('CTE') ? c.documentNumber : `Doc ${c.documentNumber}`) : 'Doc CT-e',
          title: c.description,
          entityName: c.supplierName,
          categoryOrCenter: `${c.category} • ${c.costCenter}`,
          dueDate: c.dueDate,
          entryDate: (c.originalItem?.createdAt ? c.originalItem.createdAt.split('T')[0] : c.dueDate),
          totalAmount: c.totalAmount,
          payableAmount: c.payableAmount,
          status: c.status,
          documentUrl: c.documentUrl || null,
          boletoUrl: null,
          contractUrl: c.contractUrl || null,
          receiptUrl: c.receiptFileUrl,
          receiptName: c.receiptFileName,
          details: c.details,
          pixKey: c.pixKey,
          bankAccount: c.bankAccount,
          isReconciled: Boolean(c.originalItem?.isReconciled),
          reconciledAt: c.originalItem?.reconciledAt,
          originalItem: c.originalItem || c,
        });
      });
    }

    // 3. Lançamentos Manuais Avulsos
    if (activeSection === 'all' || activeSection === 'manual') {
      filteredManuals.forEach(man => {
        const isVale = isValeTransaction(man.originalItem || man);
        const valeMonth = isVale ? getValeDiscountMonthKey(man.originalItem || man) : '';
        const docLabel = man.documentNumber
          ? `Doc ${man.documentNumber}`
          : (isVale ? `Vale Folha • ${valeMonth ? formatMonthKeyToLabel(valeMonth) : ''}`.trim() : 'Avulso');

        list.push({
          id: `man_${man.id}`,
          kind: 'manual',
          docNumber: docLabel,
          title: man.description,
          entityName: man.supplierName,
          categoryOrCenter: `${man.category} • ${man.costCenter}`,
          dueDate: man.dueDate,
          entryDate: man.createdAt ? man.createdAt.split('T')[0] : man.dueDate,
          totalAmount: man.totalAmount,
          payableAmount: man.payableAmount,
          status: man.status,
          documentUrl: null,
          boletoUrl: null,
          receiptUrl: man.receiptFileUrl,
          receiptName: man.receiptFileName,
          details: man.shipmentId ? `Embarque ${man.shipmentId}` : (man.originalItem?.notes || undefined),
          bankAccount: man.bankAccount,
          isReconciled: Boolean(man.originalItem?.isReconciled || (man as any).isReconciled),
          reconciledAt: man.originalItem?.reconciledAt,
          originalItem: man.originalItem || man,
        });
      });
    }

    // 4. Folha de Pagamento e Agenciadores Líderes
    if (activeSection === 'all' || activeSection === 'leaders') {
      filteredLeaderPayables.forEach(lead => {
        list.push({
          id: `lead_${lead.id}`,
          kind: 'leader',
          docNumber: lead.documentNumber ? `Doc ${lead.documentNumber}` : 'Planejamento Líder',
          title: lead.description,
          entityName: lead.supplierName,
          categoryOrCenter: `${lead.category} • ${lead.costCenter}`,
          dueDate: lead.dueDate,
          entryDate: lead.createdAt ? lead.createdAt.split('T')[0] : lead.dueDate,
          totalAmount: lead.totalAmount,
          payableAmount: lead.payableAmount,
          status: lead.status,
          documentUrl: null,
          boletoUrl: null,
          receiptUrl: lead.receiptFileUrl,
          receiptName: lead.receiptFileName,
          details: lead.notes,
          pixKey: lead.pixKey,
          bankAccount: lead.bankAccount,
          isReconciled: Boolean(lead.originalItem?.isReconciled || (lead as any).isReconciled),
          reconciledAt: lead.originalItem?.reconciledAt,
          originalItem: lead.originalItem || lead,
        });
      });
    }

    // 5. Impostos e Guias Tributárias
    if (activeSection === 'all' || activeSection === 'taxes') {
      filteredTaxes.forEach(tax => {
        list.push({
          id: `tax_${tax.id}`,
          kind: 'tax',
          docNumber: tax.documentNumber ? `Guia ${tax.documentNumber}` : tax.taxTypeName,
          title: tax.description || tax.taxTypeName,
          entityName: tax.beneficiaryName,
          categoryOrCenter: `${tax.category} • ${tax.costCenter}`,
          dueDate: tax.dueDate,
          entryDate: tax.createdAt ? tax.createdAt.split('T')[0] : tax.dueDate,
          totalAmount: tax.totalAmount,
          payableAmount: tax.payableAmount,
          status: tax.status,
          documentUrl: tax.attachmentUrl || null,
          boletoUrl: null,
          receiptUrl: tax.receiptFileUrl || null,
          receiptName: tax.receiptFileName || null,
          details: tax.taxCode ? `Cód: ${tax.taxCode}${tax.taxPeriod ? ` • PA: ${tax.taxPeriod}` : ''}` : tax.notes,
          pixKey: tax.barcode,
          bankAccount: tax.bankAccount,
          taxPeriod: tax.taxPeriod,
          isReconciled: Boolean(tax.originalItem?.isReconciled),
          reconciledAt: tax.originalItem?.reconciledAt,
          originalItem: tax.originalItem || tax,
        });
      });
    }

    return list.sort((a, b) => new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime());
  }, [activeSection, filteredInvoices, filteredCtePayables, filteredManuals, filteredLeaderPayables, filteredTaxes, todayStr, periodPreset, customStartDate, customEndDate]);

  // Resumo Bancário (OB): Totalizadores por Banco (Sicredi, Itaú, etc.)
  const bankingSummary = useMemo(() => {
    let sicrediPlanned = 0;
    let sicrediPaid = 0;
    let itauPlanned = 0;
    let itauPaid = 0;
    let otherPlanned = 0;
    let otherPaid = 0;

    consolidatedList.forEach(item => {
      const bank = (item.bankAccount || item.originalItem?.bankAccount || (item.originalItem?.paymentMethod === 'Boleto' ? 'Sicredi' : 'Outro')).toLowerCase();
      const isPaid = item.status === 'Pago';
      const val = item.payableAmount;

      if (bank.includes('sicredi')) {
        if (isPaid) sicrediPaid += val;
        else sicrediPlanned += val;
      } else if (bank.includes('itau') || bank.includes('itaú')) {
        if (isPaid) itauPaid += val;
        else itauPlanned += val;
      } else {
        if (isPaid) otherPaid += val;
        else otherPlanned += val;
      }
    });

    return {
      sicredi: { planned: sicrediPlanned, paid: sicrediPaid, total: sicrediPlanned + sicrediPaid },
      itau: { planned: itauPlanned, paid: itauPaid, total: itauPlanned + itauPaid },
      other: { planned: otherPlanned, paid: otherPaid, total: otherPlanned + otherPaid },
    };
  }, [consolidatedList]);

  // Todas as contas mapeadas no período selecionado (independente do statusFilter da tabela para alimentar com precisão os KPIs gerais do período)
  const allPeriodPayables = useMemo(() => {
    const list: Array<{
      id: string;
      kind: 'invoice' | 'cte' | 'manual' | 'leader' | 'tax';
      totalAmount: number;
      payableAmount: number;
      status: string;
      dueDate: string;
      issueDate?: string;
      originalItem: any;
    }> = [];

    invoicePayables.forEach(inv => {
      if (matchesPeriod(inv.dueDate) || matchesPeriod(inv.issueDate)) {
        list.push({
          id: `inv_${inv.id}`,
          kind: 'invoice',
          totalAmount: inv.totalAmount,
          payableAmount: inv.payableAmount !== undefined ? inv.payableAmount : inv.totalAmount,
          status: inv.status,
          dueDate: inv.dueDate,
          issueDate: inv.issueDate,
          originalItem: inv.originalItem || inv,
        });
      }
    });

    ctePayables.forEach(c => {
      if (matchesPeriod(c.dueDate)) {
        list.push({
          id: `cte_${c.id}`,
          kind: 'cte',
          totalAmount: c.totalAmount,
          payableAmount: c.payableAmount !== undefined ? c.payableAmount : c.totalAmount,
          status: c.status,
          dueDate: c.dueDate,
          originalItem: c.originalItem || c,
        });
      }
    });

    manualPayables.forEach(m => {
      if (matchesPeriod(m.dueDate)) {
        list.push({
          id: `man_${m.id}`,
          kind: 'manual',
          totalAmount: m.totalAmount,
          payableAmount: m.payableAmount !== undefined ? m.payableAmount : m.totalAmount,
          status: m.status,
          dueDate: m.dueDate,
          originalItem: m.originalItem || m,
        });
      }
    });

    leaderPayables.forEach(l => {
      if (matchesPeriod(l.dueDate)) {
        list.push({
          id: `lead_${l.id}`,
          kind: 'leader',
          totalAmount: l.totalAmount,
          payableAmount: l.payableAmount !== undefined ? l.payableAmount : l.totalAmount,
          status: l.status,
          dueDate: l.dueDate,
          originalItem: l.originalItem || l,
        });
      }
    });

    taxPayables.forEach(tax => {
      if (matchesPeriod(tax.dueDate) || (tax.paymentDate && matchesPeriod(tax.paymentDate))) {
        list.push({
          id: `tax_${tax.id}`,
          kind: 'tax',
          totalAmount: tax.totalAmount,
          payableAmount: tax.payableAmount !== undefined ? tax.payableAmount : tax.totalAmount,
          status: tax.status,
          dueDate: tax.dueDate,
          issueDate: tax.createdAt ? tax.createdAt.split('T')[0] : tax.dueDate,
          originalItem: tax.originalItem || tax,
        });
      }
    });

    return list;
  }, [invoicePayables, ctePayables, manualPayables, leaderPayables, taxPayables, periodPreset, customStartDate, customEndDate, currentMonthPrefix, lastMonthPrefix]);

  // Contas vencidas / em atraso no período selecionado
  const overduePeriodItems = useMemo(() => {
    return allPeriodPayables.filter(item => {
      const isPaid = item.status === 'Pago';
      if (isPaid) return false;
      return item.status === 'Atrasado' || (item.dueDate && item.dueDate < todayStr);
    });
  }, [allPeriodPayables, todayStr]);

  // Apuração de Juros e Multas nas Contas em Atraso no período selecionado
  const overdueLateFees = useMemo(() => {
    let interest = 0;
    let fine = 0;
    let total = 0;
    let itemsWithFeesCount = 0;

    overduePeriodItems.forEach(item => {
      const fees = getItemLateFees(item, todayStr);
      if (fees.total > 0) {
        itemsWithFeesCount++;
        interest += fees.interest;
        fine += fees.fine;
        total += fees.total;
      }
    });

    return {
      interest: Number(interest.toFixed(2)),
      fine: Number(fine.toFixed(2)),
      total: Number(total.toFixed(2)),
      count: overduePeriodItems.length,
      itemsWithFeesCount,
    };
  }, [overduePeriodItems, todayStr]);

  // Total de Juros e Multas apurados em todas as contas do período (incluindo baixadas com juros)
  const periodAllLateFees = useMemo(() => {
    let total = 0;
    allPeriodPayables.forEach(item => {
      const fees = getItemLateFees(item, todayStr);
      total += fees.total;
    });
    return Number(total.toFixed(2));
  }, [allPeriodPayables, todayStr]);

  // KPIs Gerais
  const kpiPending = useMemo(() => {
    if (statusFilter === 'Pendente') {
      return consolidatedList.reduce((acc, i) => acc + i.payableAmount, 0);
    }
    return allPeriodPayables.filter(i => i.status === 'Pendente' && i.dueDate >= todayStr).reduce((acc, i) => acc + i.payableAmount, 0);
  }, [statusFilter, consolidatedList, allPeriodPayables, todayStr]);

  const kpiPaid = useMemo(() => {
    if (statusFilter === 'Pago') {
      return consolidatedList.reduce((acc, i) => acc + i.payableAmount, 0);
    }
    return allPeriodPayables.filter(i => i.status === 'Pago').reduce((acc, i) => acc + i.payableAmount, 0);
  }, [statusFilter, consolidatedList, allPeriodPayables]);

  const kpiOverdue = useMemo(() => {
    if (statusFilter === 'Atrasado') {
      return consolidatedList.reduce((acc, i) => acc + i.payableAmount, 0);
    }
    return overduePeriodItems.reduce((acc, i) => acc + i.payableAmount, 0);
  }, [statusFilter, consolidatedList, overduePeriodItems]);

  const kpiTotal = useMemo(() => {
    return allPeriodPayables.reduce((acc, i) => acc + i.payableAmount, 0);
  }, [allPeriodPayables]);

  const subtotalInvoices = useMemo(() => filteredInvoices.reduce((acc, i) => acc + i.payableAmount, 0), [filteredInvoices]);
  const subtotalCte = useMemo(() => filteredCtePayables.reduce((acc, i) => acc + i.payableAmount, 0), [filteredCtePayables]);
  const subtotalManuals = useMemo(() => filteredManuals.reduce((acc, i) => acc + i.payableAmount, 0), [filteredManuals]);
  const subtotalLeaders = useMemo(() => filteredLeaderPayables.reduce((acc, i) => acc + i.payableAmount, 0), [filteredLeaderPayables]);
  const subtotalTaxes = useMemo(() => filteredTaxes.reduce((acc, i) => acc + i.payableAmount, 0), [filteredTaxes]);

  // KPIs Específicos da Folha de Pagamento
  const kpiPayrollGross = useMemo(() => leadersSummary.reduce((acc, l) => acc + (l.grossTotal || l.totalDue), 0), [leadersSummary]);
  const kpiPayrollTaxes = useMemo(() => leadersSummary.reduce((acc, l) => acc + (l.taxesClt || 0), 0), [leadersSummary]);
  const kpiPayrollAdvances = useMemo(() => leadersSummary.reduce((acc, l) => acc + (l.totalAdvances || 0), 0), [leadersSummary]);
  const kpiPayrollNetDue = useMemo(() => leadersSummary.reduce((acc, l) => acc + (l.netDue || 0), 0), [leadersSummary]);
  const kpiPayrollPaid = useMemo(() => leadersSummary.reduce((acc, l) => acc + l.totalPaid, 0), [leadersSummary]);
  const kpiPayrollPending = useMemo(() => leadersSummary.reduce((acc, l) => acc + l.balancePending, 0), [leadersSummary]);
  const leaderKpiTotalDue = kpiPayrollGross;
  const leaderKpiTotalPaid = kpiPayrollPaid;
  const leaderKpiBalancePending = kpiPayrollPending;
  const leaderKpiPlannedPending = useMemo(() => filteredLeaderPayables.filter(l => l.status === 'Pendente').reduce((acc, l) => acc + l.payableAmount, 0), [filteredLeaderPayables]);

  // Abrir modal de planejamento de folha para um colaborador (com sugestão de saldo em aberto)
  const handleOpenPlanModal = (targetUserId?: string, suggestedAmount?: number, targetMonthKey?: string) => {
    const userToSelect = targetUserId || payrollUsers[0]?.id || '';
    setPlanLeaderId(userToSelect);
    const activeMonth = targetMonthKey || (payrollSelectedMonth === 'last' ? lastMonthPrefix : currentMonthPrefix);
    setPlanMonthKey(activeMonth);

    const userObj = payrollUsers.find(l => l.id === userToSelect);
    const summary = allPayrollSettlements.find(s => s.user.id === userToSelect && s.monthKey === activeMonth)
      || leadersSummary.find(s => s.user.id === userToSelect)
      || allPayrollSettlements.find(s => s.user.id === userToSelect);

    // Sugerir valor
    const amountVal = suggestedAmount !== undefined
      ? suggestedAmount
      : (summary?.balancePending && summary.balancePending > 0 ? summary.balancePending : 0);

    setPlanAmount(amountVal > 0 ? amountVal.toFixed(2).replace('.', ',') : '');
    setPlanDueDate(new Date().toISOString().split('T')[0]);

    if (userObj) {
      const reg = summary?.regime || getUserRegime(userObj);
      if (reg === 'CLT') {
        setPlanPaymentType('Salário Mensal (Folha)');
      } else if (reg === 'PJ') {
        setPlanPaymentType('Pró-labore / Pagamento PJ');
      } else {
        setPlanPaymentType('Comissão de Gestor AG');
      }
      setPlanPixKey(userObj.phone || userObj.corporateEmail || userObj.email || '');
      setPlanNotes(summary?.commissionEarned ? `Apuração de comissões (${summary.commissionPct}% sobre lucro real) - ${summary.shipmentsCount} embarques.` : '');
    } else {
      setPlanPaymentType('Salário Mensal (Folha)');
      setPlanPixKey('');
      setPlanNotes('');
    }

    setPlanPaymentMethod('PIX');
    setPlanInitialStatus(FinancialTransactionStatus.Pendente);
    setIsPlanLeaderModalOpen(true);
  };

  // Abrir "Lançamento Avulso" (opcionalmente já como Vale para um colaborador / mês de folha)
  const handleOpenManualModal = (opts?: { asVale?: boolean; userId?: string; monthKey?: string; installmentsCount?: number }) => {
    setDescription('');
    setAmount('');
    setSupplierName('');
    setNotes('');
    setHoleriteFile(null);
    setParsedHolerite(null);
    setHoleriteFileUrl('');
    setDueDate(new Date().toISOString().split('T')[0]);
    setManualInstallmentsCount(opts?.installmentsCount || 1);
    if (opts?.asVale) {
      setManualEntryType('vale');
      setManualValeUserId(opts.userId || '');
      setManualValeMonthKey(opts.monthKey || (payrollSelectedMonth === 'last' ? lastMonthPrefix : currentMonthPrefix));
    } else {
      setManualEntryType('despesa');
      setManualValeUserId('');
      setManualValeMonthKey(currentMonthPrefix);
    }
    setIsModalOpen(true);
  };

  // Submit Lançamento Manual Avulso (com suporte a Parcelamento tanto para Vales quanto para Despesas)
  const handleSubmitManual = (e: React.FormEvent) => {
    e.preventDefault();
    const isVale = manualEntryType === 'vale';
    const isFolha = manualEntryType === 'folha';
    if (!amount || !dueDate || (!isVale && !isFolha && !description)) return;

    const parsedAmount = parseBrazilianCurrency(amount);
    if (parsedAmount <= 0) {
      alert('Informe um valor válido.');
      return;
    }

    const count = Math.max(1, manualInstallmentsCount || 1);

    if (isVale) {
      const valeUser = payrollUsers.find(u => u.id === manualValeUserId);
      if (!valeUser) {
        alert('Selecione o colaborador que receberá o vale.');
        return;
      }
      const startDiscountMonth = manualValeMonthKey || currentMonthPrefix;
      const pix = valeUser.phone || valeUser.corporateEmail || valeUser.email || '';
      const baseDesc = description.trim() || 'Vale / Adiantamento Salarial';

      if (count > 1) {
        const installments = calculateInstallments(parsedAmount, count, startDiscountMonth);
        installments.forEach((inst, idx) => {
          const instDueDate = addMonthsToDateString(dueDate, idx);
          const valeNotes = [
            buildValeFolhaTag(inst.monthKey),
            `Colaborador: ${valeUser.name}`,
            `Parcela ${inst.installmentNumber}/${inst.totalInstallments}`,
            `Folha de Desconto: ${formatMonthKeyToLabel(inst.monthKey)}`,
            pix ? `PIX: ${pix}` : '',
            notes ? `Obs: ${notes}` : '',
          ].filter(Boolean).join(' | ');

          onAddTransaction({
            type: 'payable',
            description: `${baseDesc} - Parcela ${inst.installmentNumber}/${inst.totalInstallments} (${valeUser.name})`,
            amount: inst.amount,
            dueDate: instDueDate,
            status: FinancialTransactionStatus.Pendente,
            category: 'Adiantamento Salarial',
            costCenter: 'Administrativo',
            supplierOrClientName: valeUser.name,
            notes: valeNotes,
            ownerId: valeUser.id,
          });
        });

        showToast(
          `Vale de ${formatBrl(parsedAmount)} para ${valeUser.name} parcelado em ${count}x gerado como Pendente! As parcelas serão abatidas nas folhas correspondentes após a baixa com comprovante.`,
          'success'
        );
      } else {
        const valeNotes = [
          buildValeFolhaTag(startDiscountMonth),
          `Colaborador: ${valeUser.name}`,
          `Folha de Desconto: ${formatMonthKeyToLabel(startDiscountMonth)}`,
          pix ? `PIX: ${pix}` : '',
          notes ? `Obs: ${notes}` : '',
        ].filter(Boolean).join(' | ');

        onAddTransaction({
          type: 'payable',
          description: `${baseDesc} - ${valeUser.name}`,
          amount: parsedAmount,
          dueDate,
          status: FinancialTransactionStatus.Pendente,
          category: 'Adiantamento Salarial',
          costCenter: 'Administrativo',
          supplierOrClientName: valeUser.name,
          notes: valeNotes,
          ownerId: valeUser.id,
        });

        showToast(
          `Vale de ${formatBrl(parsedAmount)} para ${valeUser.name} lançado como Pendente. Ele será somado na Folha de ${formatMonthKeyToLabel(startDiscountMonth)} após a baixa com comprovante.`,
          'success'
        );
      }
    } else if (isFolha) {
      const folhaUser = payrollUsers.find(u => u.id === manualValeUserId);
      if (!folhaUser) {
        alert('Selecione o colaborador correspondente à Folha de Pagamento.');
        return;
      }
      const folhaMonth = manualValeMonthKey || currentMonthPrefix;
      const pix = folhaUser.phone || folhaUser.corporateEmail || folhaUser.email || '';
      const baseDesc = description.trim() || `Folha de Pagamento - ${formatMonthKeyToLabel(folhaMonth)}`;

      const folhaNotes = [
        `[FOLHA_DE_PAGAMENTO_${folhaMonth}]`,
        `Colaborador: ${folhaUser.name}`,
        `Competência: ${formatMonthKeyToLabel(folhaMonth)}`,
        pix ? `PIX: ${pix}` : '',
        parsedHolerite?.grossSalary ? `Proventos: ${formatBrl(parsedHolerite.grossSalary)}` : '',
        parsedHolerite?.totalDiscounts ? `Descontos: ${formatBrl(parsedHolerite.totalDiscounts)}` : '',
        notes ? `Obs: ${notes}` : '',
      ].filter(Boolean).join(' | ');

      onAddTransaction({
        type: 'payable',
        description: `${baseDesc} (${folhaUser.name})`,
        amount: parsedAmount,
        dueDate,
        status: FinancialTransactionStatus.Pendente,
        category: 'Folha de Pagamento',
        costCenter: 'Administrativo / RH',
        supplierOrClientName: folhaUser.name,
        notes: folhaNotes,
        ownerId: folhaUser.id,
        attachmentUrl: holeriteFileUrl || undefined,
        holeriteUrl: holeriteFileUrl || undefined,
        holeriteFileName: holeriteFile?.name || undefined,
      });

      showToast(
        `Folha de Pagamento de ${formatBrl(parsedAmount)} para ${folhaUser.name} (${formatMonthKeyToLabel(folhaMonth)}) lançada como Pendente. Ao quitar, anexe o comprovante final para baixa.`,
        'success'
      );
    } else {
      if (count > 1) {
        const baseAmount = Math.floor((parsedAmount / count) * 100) / 100;
        const remainder = Math.round((parsedAmount - (baseAmount * count)) * 100) / 100;

        for (let i = 0; i < count; i++) {
          const installmentNumber = i + 1;
          const instAmount = i === 0 ? Number((baseAmount + remainder).toFixed(2)) : baseAmount;
          const instDueDate = addMonthsToDateString(dueDate, i);

          onAddTransaction({
            type: 'payable',
            description: `${description.trim()} - Parcela ${installmentNumber}/${count}`,
            amount: instAmount,
            dueDate: instDueDate,
            status: FinancialTransactionStatus.Pendente,
            category,
            costCenter,
            supplierOrClientName: supplierName || undefined,
            notes: notes ? `${notes} (Parcela ${installmentNumber}/${count})` : `Parcela ${installmentNumber}/${count}`,
          });
        }

        showToast(
          `Despesa de ${formatBrl(parsedAmount)} parcelada em ${count}x cadastrada com sucesso!`,
          'success'
        );
      } else {
        onAddTransaction({
          type: 'payable',
          description,
          amount: parsedAmount,
          dueDate,
          status: FinancialTransactionStatus.Pendente,
          category,
          costCenter,
          supplierOrClientName: supplierName || undefined,
          notes: notes || undefined,
        });

        showToast(`Lançamento avulso de ${formatBrl(parsedAmount)} cadastrado com sucesso!`, 'success');
      }
    }

    setDescription('');
    setAmount('');
    setSupplierName('');
    setNotes('');
    setManualEntryType('despesa');
    setManualInstallmentsCount(1);
    setManualValeUserId('');
    setIsModalOpen(false);
  };

  // Submit Planejamento de Pagamento da Folha
  const handleSubmitPlanLeader = (e: React.FormEvent) => {
    e.preventDefault();
    if (!planLeaderId || !planAmount || !planDueDate) {
      alert('Preencha os campos obrigatórios.');
      return;
    }

    const parsedAmount = parseBrazilianCurrency(planAmount);
    if (parsedAmount <= 0) {
      alert('Informe um valor válido maior que zero.');
      return;
    }

    const user = payrollUsers.find(l => l.id === planLeaderId);
    if (!user) {
      alert('Selecione um colaborador válido.');
      return;
    }

    const reg = getUserRegime(user);
    const desc = `${planPaymentType} - ${user.name}`;
    const fullNotes = `[Planejamento Folha de Pagamento] Colaborador: ${user.name} | Perfil: ${user.profile} | Regime: ${reg} | Tipo: ${planPaymentType} | Forma: ${planPaymentMethod}${planPixKey ? ` | PIX: ${planPixKey}` : ''}${planNotes ? ` | Detalhes: ${planNotes}` : ''}`;

    const category = planPaymentType.toLowerCase().includes('adiantamento')
      ? 'Adiantamento Salarial'
      : (reg === 'Gestor AG' ? 'Comissão de Agenciador Líder' : 'Folha de Pagamento');

    const costCenter = reg === 'Gestor AG' ? 'Operacional' : 'Administrativo';

    onAddTransaction({
      type: 'payable',
      description: desc,
      amount: parsedAmount,
      dueDate: planDueDate,
      paymentDate: planInitialStatus === FinancialTransactionStatus.Pago ? planDueDate : undefined,
      status: planInitialStatus,
      category,
      costCenter,
      supplierOrClientName: user.name,
      supplierOrClientCpfCnpj: user.phone || user.email || undefined,
      notes: fullNotes,
      ownerId: user.id,
    });

    setIsPlanLeaderModalOpen(false);
  };

  // Exportar CSV
  const handleExportCsv = () => {
    if (activeSection === 'leaders') {
      if (filteredLeaderPayables.length === 0) {
        alert('Nenhum lançamento de Agenciador Líder para exportar.');
        return;
      }
      const headers = ['Líder / Favorecido', 'Descrição', 'Categoria', 'Vencimento / Previsão', 'Data Pagamento', 'Valor (R$)', 'Status', 'PIX / Pagamento', 'Observações'];
      const rows = filteredLeaderPayables.map(item => [
        `"${item.supplierName.replace(/"/g, '""')}"`,
        `"${item.description.replace(/"/g, '""')}"`,
        `"${item.category.replace(/"/g, '""')}"`,
        new Date(item.dueDate + 'T00:00:00').toLocaleDateString('pt-BR'),
        item.paymentDate ? new Date(item.paymentDate + 'T00:00:00').toLocaleDateString('pt-BR') : '-',
        item.payableAmount.toFixed(2).replace('.', ','),
        item.status,
        `"${(item.pixKey || '-').replace(/"/g, '""')}"`,
        `"${(item.notes || '').replace(/"/g, '""')}"`,
      ]);

      const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement('a');
      link.setAttribute('href', encodedUri);
      link.setAttribute('download', `planejamento_agenciadores_lider_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return;
    }

    if (consolidatedList.length === 0) return;

    const headers = ['Tipo', 'Documento', 'Fornecedor / Favorecido', 'Categoria / Centro de Custo', 'Vencimento', 'Valor Original', 'Juros / Multa', 'Valor a Pagar (Real)', 'Status'];
    const rows = consolidatedList.map(item => {
      const fees = getItemLateFees(item, todayStr);
      return [
        item.kind === 'invoice' ? 'Nota Fiscal' : item.kind === 'cte' ? 'Doc CT-e' : item.kind === 'leader' ? 'Folha de Pagamento' : 'Despesa Avulsa',
        item.docNumber,
        `"${item.entityName.replace(/"/g, '""')}"`,
        `"${item.categoryOrCenter.replace(/"/g, '""')}"`,
        new Date(item.dueDate + 'T00:00:00').toLocaleDateString('pt-BR'),
        item.totalAmount.toFixed(2).replace('.', ','),
        fees.total.toFixed(2).replace('.', ','),
        item.payableAmount.toFixed(2).replace('.', ','),
        item.status
      ];
    });

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `contas_a_pagar_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Copiar chave PIX com feedback visual
  const handleCopyPix = (pixKey: string, id: string) => {
    if (!pixKey) return;
    navigator.clipboard.writeText(pixKey);
    setCopiedPixId(id);
    setTimeout(() => setCopiedPixId(null), 2500);
  };

  // Importação e Lançamento de Guias de Impostos no Contas a Pagar
  const handleImportTaxes = async (importedItems: TaxImportItem[]) => {
    try {
      showToast(`Processando ${importedItems.length} guia(s) tributária(s)...`, 'info');

      const newTxs: Array<Omit<FinancialTransaction, 'id' | 'createdAt'>> = [];

      for (const item of importedItems) {
        let uploadedUrl = '';
        try {
          uploadedUrl = await uploadInvoiceAttachmentToStorage(
            item.file,
            item.id,
            'guia_imposto',
            item.file.name,
            item.file.type
          );
        } catch (uploadErr) {
          console.warn('[handleImportTaxes] Erro ao enviar anexo da guia:', uploadErr);
        }

        const newTx: Omit<FinancialTransaction, 'id' | 'createdAt'> = {
          type: 'payable',
          description: item.description,
          amount: item.totalAmount,
          dueDate: item.dueDate || todayStr,
          status: FinancialTransactionStatus.Pendente,
          category: FinancialCategoryType.CustoImposto,
          costCenter: 'Fiscal / Tributário',
          documentNumber: item.documentNumber,
          supplierOrClientName: item.beneficiary || 'Órgão Arrecadador / Fisco',
          attachmentUrl: uploadedUrl || undefined,
          attachmentName: item.file.name,
          taxType: item.taxType,
          taxCode: item.taxCode,
          taxPeriod: item.period,
          taxPrincipalAmount: item.principalAmount,
          taxFineAmount: item.fineAmount,
          taxInterestAmount: item.interestAmount,
          barcode: item.barcode,
          notes: `[Imposto] ${item.taxTypeName}${item.taxCode ? ` | Cód: ${item.taxCode}` : ''}${item.period ? ` | PA: ${item.period}` : ''}${item.notes ? ` | ${item.notes}` : ''}`,
        };

        newTxs.push(newTx);
      }

      // Salva lote completo atomicamente na nuvem Supabase e dispara broadcast em tempo real para todos os operadores
      const savedItems = await taxTransactionService.saveTaxTransactionsBatch(newTxs, currentUser);

      // Atualiza também via callback pai se fornecido
      if (onAddTransaction) {
        savedItems.forEach(saved => {
          onAddTransaction(saved);
        });
      }

      showToast(`${savedItems.length} guia(s) lançada(s) e sincronizada(s) com sucesso na nuvem!`, 'success');
    } catch (err: any) {
      console.error('[handleImportTaxes] Erro ao salvar guias:', err);
      showToast(`Erro ao importar guias: ${err?.message || 'Tente novamente.'}`, 'error');
    }
  };

  // Abertura do Modal de Cadastro / Edição Manual de Guia Tributária
  const handleOpenTaxManualModal = (taxItem?: any) => {
    if (taxItem) {
      const orig = taxItem.originalItem || taxItem;
      setEditingTaxTransaction(orig);
    } else {
      setEditingTaxTransaction(null);
    }
    setIsTaxManualModalOpen(true);
  };

  // Salvar Guia Tributária (Criação ou Edição) com persistência na nuvem e Realtime
  const handleSaveTaxManual = async (taxData: Partial<FinancialTransaction>, file?: File) => {
    try {
      if (editingTaxTransaction && editingTaxTransaction.id) {
        // Edição
        showToast('Atualizando guia tributária na nuvem...', 'info');
        await taxTransactionService.updateTaxTransaction(editingTaxTransaction.id, taxData);
        if (onUpdateTransaction) {
          onUpdateTransaction(editingTaxTransaction.id, taxData);
        }
        showToast('Guia de imposto atualizada com sucesso para todos os usuários!', 'success');
      } else {
        // Criação
        showToast('Salvando nova guia tributária na nuvem...', 'info');
        const saved = await taxTransactionService.saveTaxTransaction(taxData as any, currentUser);
        if (onAddTransaction) {
          onAddTransaction(saved);
        }
        showToast('Guia de imposto lançada com sucesso com sincronização em tempo real!', 'success');
      }
    } catch (err: any) {
      console.error('[handleSaveTaxManual] Erro:', err);
      showToast(`Erro ao salvar guia: ${err?.message || 'Tente novamente.'}`, 'error');
      throw err;
    }
  };

  // Abertura do Modal de Confirmação de Exclusão
  const handleOpenDeleteTaxModal = (item: any) => {
    const isRec = Boolean(item.isReconciled || item.originalItem?.isReconciled);
    if (isRec) {
      showToast('🔒 Esta guia já foi auditada e conciliada com o extrato bancário. Desconcilie primeiro antes de excluir.', 'error');
      return;
    }
    setTaxToDelete(item);
    setIsTaxDeleteModalOpen(true);
  };

  // Confirmação de Exclusão com sincronização em tempo real
  const handleConfirmDeleteTax = async () => {
    if (!taxToDelete) return;
    const targetId = taxToDelete.originalItem?.id || taxToDelete.id;
    setIsDeletingTax(true);
    try {
      showToast('Removendo guia de imposto da nuvem...', 'info');
      await taxTransactionService.deleteTaxTransaction(targetId);
      if (onDeleteTransaction) {
        onDeleteTransaction(targetId);
      }
      showToast('Guia de imposto excluída com sucesso para todos os usuários!', 'success');
      setIsTaxDeleteModalOpen(false);
      setTaxToDelete(null);
    } catch (err: any) {
      console.error('[handleConfirmDeleteTax] Erro:', err);
      showToast(`Erro ao excluir guia: ${err?.message || 'Tente novamente.'}`, 'error');
    } finally {
      setIsDeletingTax(false);
    }
  };

  // Forçar Sincronização Manual de Tributos
  const handleSyncTaxesNow = async () => {
    setIsSyncingTaxes(true);
    try {
      const res = await taxTransactionService.fetchRemoteTaxTransactions();
      if (res.success && Array.isArray(res.transactions)) {
        res.transactions.forEach(t => {
          if (onUpdateTransaction) onUpdateTransaction(t.id, t);
        });
        showToast('Sincronização com a nuvem concluída!', 'success');
      }
    } catch (err) {
      console.warn('Erro ao sincronizar tributos manualmente:', err);
    } finally {
      setIsSyncingTaxes(false);
    }
  };

  // Quitação Automática ao Anexar Comprovante na Guia de Imposto
  const handleAttachReceiptToTax = async (taxId: string, taxTotal: number, file: File) => {
    try {
      showToast('Lendo comprovante Sicredi e registrando quitação...', 'info');
      const parsed = await parseReceiptFile(file);

      const uploadedUrl = await uploadInvoiceAttachmentToStorage(
        file,
        taxId,
        'comprovante',
        file.name,
        file.type
      );

      const paymentDate = parsed.paymentDate || todayStr;
      const paidAmount = parsed.paidAmount && parsed.paidAmount > 0 ? parsed.paidAmount : taxTotal;
      const paymentAuthCode = parsed.authCode || parsed.txId || parsed.controlNumber || parsed.identificador || '';
      const bankAccount = parsed.bankName || 'Sicredi';

      if (onUpdateTransaction) {
        onUpdateTransaction(taxId, {
          status: FinancialTransactionStatus.Pago,
          paymentDate,
          paidAmount,
          paymentAuthCode,
          bankAccount,
          receiptFileUrl: uploadedUrl,
          receiptFileName: file.name,
          receiptFileType: file.type,
          receiptFileSize: file.size
        });
      } else {
        onUpdateStatus(taxId, FinancialTransactionStatus.Pago);
      }

      showToast(`Guia liquidada com sucesso! Status alterado para PAGO automaticamente (${formatBrl(paidAmount)}).`, 'success');
    } catch (err: any) {
      console.error('[handleAttachReceiptToTax] Erro na baixa automática:', err);
      showToast(`Erro ao processar comprovante: ${err?.message || 'Tente novamente.'}`, 'error');
    }
  };

  // Obter líder/colaborador atualmente em auditoria
  const currentAuditingSummary = useMemo(() => {
    if (!auditingLeaderId) return null;
    return leadersSummary.find(s => (s.user?.id === auditingLeaderId || s.leader?.id === auditingLeaderId || s.userId === auditingLeaderId)) ||
      allPayrollSettlements.find(s => (s.user?.id === auditingLeaderId || s.leader?.id === auditingLeaderId || s.userId === auditingLeaderId)) || null;
  }, [auditingLeaderId, leadersSummary, allPayrollSettlements]);

  return (
    <div className="space-y-6">
      {/* 1. SELETOR DE VISÃO (SUB-ABAS) */}
      <div className="flex flex-col xl:flex-row items-stretch xl:items-center justify-between gap-3 bg-white dark:bg-slate-800 p-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 p-0.5 flex-1 min-w-0">
          {/* Aba 1: Todas as Contas a Pagar */}
          <button
            onClick={() => setActiveSection('all')}
            className={`flex items-center gap-2 px-3 sm:px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all whitespace-nowrap cursor-pointer shrink-0 ${activeSection === 'all'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700/60'
              }`}
            title="Visão geral de despesas corporativas a pagar: Notas Fiscais, Faturas, Lançamentos Avulsos, Folha e Impostos"
          >
            <ArrowDownCircle className="w-4 h-4" />
            <span>Todas as Contas a Pagar</span>
            <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-white/20 text-white font-mono">
              {invoicePayables.length + manualPayables.length + leaderPayables.length + taxPayables.length}
            </span>
          </button>

          {/* Aba 2: Notas Fiscais / Faturas a Pagar */}
          <button
            onClick={() => setActiveSection('invoices')}
            className={`flex items-center gap-2 px-3 sm:px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all whitespace-nowrap cursor-pointer shrink-0 ${activeSection === 'invoices'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700/60'
              }`}
          >
            <FileText className="w-4 h-4 text-emerald-400" />
            <span>Notas Fiscais / Faturas a Pagar</span>
            <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-mono">
              {invoicePayables.length}
            </span>
          </button>

          {/* Aba 3: Fretes / Doc CT-e */}
          <button
            onClick={() => setActiveSection('cte')}
            className={`flex items-center gap-2 px-3 sm:px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all whitespace-nowrap cursor-pointer shrink-0 ${activeSection === 'cte'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30 ring-2 ring-indigo-400/30'
                : 'text-slate-600 dark:text-slate-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 hover:text-indigo-700 dark:hover:text-indigo-300'
              }`}
            title="Contas a Pagar de Fretes vinculados a Conhecimentos de Transporte (Doc CT-e)"
          >
            <FileText className="w-4 h-4 text-indigo-400" />
            <span>Fretes / Doc CT-e</span>
            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono ${activeSection === 'cte'
                ? 'bg-white/20 text-white'
                : 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/70 dark:text-indigo-300'
              }`}>
              {ctePayables.length}
            </span>
          </button>

          {/* Aba 4: Lançamentos Avulsos */}
          <button
            onClick={() => setActiveSection('manual')}
            className={`flex items-center gap-2 px-3 sm:px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all whitespace-nowrap cursor-pointer shrink-0 ${activeSection === 'manual'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700/60'
              }`}
          >
            <Tag className="w-4 h-4" />
            <span>Lançamentos Avulsos</span>
            <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-mono">
              {manualPayables.length + leaderPayables.filter(l => isValeTransaction(l)).length}
            </span>
          </button>

          {/* Aba 5: Folha de Pagamento */}
          <button
            onClick={() => setActiveSection('leaders')}
            className={`flex items-center gap-2 px-3 sm:px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all whitespace-nowrap cursor-pointer shrink-0 ${activeSection === 'leaders'
                ? 'bg-amber-600 text-white shadow-md shadow-amber-600/30 ring-2 ring-amber-400/30'
                : 'text-slate-600 dark:text-slate-400 hover:bg-amber-50 dark:hover:bg-amber-950/30 hover:text-amber-700 dark:hover:text-amber-300'
              }`}
            title="Folha de Pagamento: Acompanhar salários, comissões, tributos e planejar pagamentos de usuários internos (CLT, PJ e Gestor AG)"
          >
            <Wallet className="w-4 h-4 text-amber-400" />
            <span>Folha de Pagamento</span>
            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono ${activeSection === 'leaders'
                ? 'bg-white/20 text-white'
                : 'bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300'
              }`}>
              {payrollUsers.length}
            </span>
          </button>

          {/* Aba 6: Impostos & Tributos */}
          <button
            onClick={() => setActiveSection('taxes')}
            className={`flex items-center gap-2 px-3 sm:px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all whitespace-nowrap cursor-pointer shrink-0 ${activeSection === 'taxes'
                ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30 ring-2 ring-purple-400/30'
                : 'text-slate-600 dark:text-slate-400 hover:bg-purple-50 dark:hover:bg-purple-950/30 hover:text-purple-700 dark:hover:text-purple-300'
              }`}
            title="Aba de Impostos & Tributos: PIS/COFINS, ICMS, CSLL, IRPJ, Guias de FGTS e INSS com leitura automática"
          >
            <Landmark className="w-4 h-4 text-purple-400" />
            <span>Impostos & Tributos</span>
            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono ${activeSection === 'taxes'
                ? 'bg-white/20 text-white'
                : 'bg-purple-100 text-purple-800 dark:bg-purple-950/70 dark:text-purple-300'
              }`}>
              {taxPayables.length}
            </span>
          </button>
        </div>

        {/* Botões de Ação no Cabeçalho */}
        <div className="flex items-center gap-2 px-1 pb-1 sm:pb-0 flex-wrap shrink-0">
          {/* Botão de Alternar Resumo Bancário */}
          <button
            type="button"
            onClick={() => setShowBankingSummary(prev => !prev)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap border ${showBankingSummary
                ? 'bg-emerald-600 text-white border-emerald-600 shadow-md shadow-emerald-600/20'
                : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/80'
              }`}
            title="Alternar painel de Resumo Bancário (Sicredi, Itaú, etc.)"
          >
            <Landmark className="w-3.5 h-3.5" />
            <span>Resumo Bancário</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-white/20 font-mono">
              Sicredi
            </span>
          </button>

          {/* Botão de Planejar Pagamento de Folha (apenas na aba de Folha de Pagamento) */}
          {activeSection === 'leaders' && (
            <button
              onClick={() => handleOpenPlanModal()}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-linear-to-r from-amber-600 to-amber-700 hover:from-amber-700 hover:to-amber-800 text-white rounded-xl text-xs font-bold shadow-md shadow-amber-600/25 transition-all cursor-pointer active:scale-95 whitespace-nowrap"
              title="Planejar ou cadastrar pagamento para colaborador da folha"
            >
              <CalendarClock className="w-3.5 h-3.5 text-amber-200" />
              <span>+ Planejar Pagamento</span>
            </button>
          )}

          {/* Botões de Ação na aba de Impostos */}
          {activeSection === 'taxes' && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleOpenTaxManualModal()}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-600/25 transition-all cursor-pointer active:scale-95 whitespace-nowrap"
                title="Cadastrar guia de imposto ou tributo manualmente sem OCR"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Nova Guia Manual</span>
              </button>

              <button
                type="button"
                onClick={() => setIsTaxImportModalOpen(true)}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-linear-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl text-xs font-bold shadow-md shadow-purple-600/25 transition-all cursor-pointer active:scale-95 whitespace-nowrap"
                title="Ler e cadastrar guias de impostos automaticamente via OCR / IA"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>+ Ler Guia Automática (OCR)</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* CONTEÚDO PRINCIPAL: GESTÃO DE NOTAS FISCAIS / FATURAS OU VISÃO PADRÃO / FOLHA */}
      {activeSection === 'invoices' ? (
        <InvoicesManagementTab
          users={users}
          currentUser={currentUser}
          onOpenSettlement={(inv) => {
            handleOpenSettlementModal({
              id: inv.id,
              kind: 'invoice',
              docNumber: inv.invoiceNumber || inv.id,
              title: `${inv.documentType} nº ${inv.invoiceNumber || 'S/N'} - ${inv.supplierName}`,
              entityName: inv.supplierName,
              categoryOrCenter: inv.costCenterName || 'Despesas Gerais',
              dueDate: inv.dueDate,
              totalAmount: inv.totalAmount,
              payableAmount: inv.payableAmount || inv.totalAmount,
              status: inv.status,
              paymentDate: inv.paymentDate,
              paymentMethod: inv.paymentMethod,
              paymentDetails: inv.paymentDetails,
              receiptUrl: inv.receiptFileUrl,
              receiptName: inv.receiptFileName,
              originalItem: inv,
            });
          }}
        />
      ) : (
        <>
          {/* 2. CARDS DE KPIS */}
      {activeSection === 'leaders' ? (
        /* KPIs Especializados para Folha de Pagamento */
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {/* 1. Folha Bruta Total */}
          <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Folha Bruta
              </span>
              <div className="p-1.5 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 rounded-lg">
                <Banknote className="w-4 h-4" />
              </div>
            </div>
            <div className="text-lg font-black text-blue-600 dark:text-blue-400 mt-2 tracking-tight">
              {formatBrl(kpiPayrollGross)}
            </div>
            <span className="text-[10px] text-slate-400 mt-0.5">
              Fixos + Comissões AG
            </span>
          </div>

          {/* 2. Tributos CLT */}
          <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Tributos CLT
              </span>
              <div className="p-1.5 bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 rounded-lg">
                <ShieldAlert className="w-4 h-4" />
              </div>
            </div>
            <div className="text-lg font-black text-rose-600 dark:text-rose-400 mt-2 tracking-tight">
              {formatBrl(kpiPayrollTaxes)}
            </div>
            <span className="text-[10px] text-slate-400 mt-0.5">
              INSS / IRRF Retidos
            </span>
          </div>

          {/* 3. Adiantamentos Concedidos */}
          <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Adiantamentos
              </span>
              <div className="p-1.5 bg-orange-50 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400 rounded-lg">
                <Receipt className="w-4 h-4" />
              </div>
            </div>
            <div className="text-lg font-black text-orange-600 dark:text-orange-400 mt-2 tracking-tight">
              {formatBrl(kpiPayrollAdvances)}
            </div>
            <span className="text-[10px] text-slate-400 mt-0.5">
              Vales & Antecipações
            </span>
          </div>

          {/* 4. Folha Líquida Devida */}
          <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Líquido Devido
              </span>
              <div className="p-1.5 bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 rounded-lg">
                <TrendingUp className="w-4 h-4" />
              </div>
            </div>
            <div className="text-lg font-black text-purple-600 dark:text-purple-400 mt-2 tracking-tight">
              {formatBrl(kpiPayrollNetDue)}
            </div>
            <span className="text-[10px] text-slate-400 mt-0.5">
              Bruto - Descontos
            </span>
          </div>

          {/* 5. Total Já Liquidado */}
          <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Total Já Pago
              </span>
              <div className="p-1.5 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 rounded-lg">
                <CheckCircle2 className="w-4 h-4" />
              </div>
            </div>
            <div className="text-lg font-black text-emerald-600 dark:text-emerald-400 mt-2 tracking-tight">
              {formatBrl(kpiPayrollPaid)}
            </div>
            <span className="text-[10px] text-slate-400 mt-0.5">
              Baixas efetuadas
            </span>
          </div>

          {/* 6. Saldo em Aberto */}
          <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Saldo a Pagar
              </span>
              <div className="p-1.5 bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 rounded-lg">
                <DollarSign className="w-4 h-4" />
              </div>
            </div>
            <div className="text-lg font-black text-amber-600 dark:text-amber-400 mt-2 tracking-tight">
              {formatBrl(kpiPayrollPending)}
            </div>
            <span className="text-[10px] text-slate-400 mt-0.5">
              Pendente de quitação
            </span>
          </div>
        </div>
      ) : activeSection === 'taxes' ? (
        /* KPIs Especializados para Impostos & Tributos */
        <div className="space-y-4">
          {/* Barra de Status da Sincronização em Tempo Real */}
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 rounded-2xl bg-purple-950/20 dark:bg-slate-800/80 border border-purple-200 dark:border-purple-900/50 text-xs shadow-xs">
            <div className="flex items-center gap-2.5">
              <span className="flex h-2.5 w-2.5 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
              <span className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                Sincronização em Tempo Real Ativa
                <span className="text-[10px] font-normal px-1.5 py-0.2 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 font-mono">
                  SUPABASE 890
                </span>
              </span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 hidden md:inline">
                • Lançamentos, edições e exclusões aparecem instantaneamente para todos os usuários com acesso
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSyncTaxesNow}
                disabled={isSyncingTaxes}
                className="flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-semibold bg-white dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-600 transition-colors cursor-pointer disabled:opacity-50"
                title="Forçar atualização da nuvem"
              >
                <RefreshCw className={`w-3 h-3 ${isSyncingTaxes ? 'animate-spin text-purple-600' : ''}`} />
                <span>{isSyncingTaxes ? 'Sincronizando...' : 'Atualizar Nuvem'}</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* 1. Total Impostos A Pagar */}
            <div
              onClick={() => setStatusFilter(prev => prev === 'Pendente' ? 'all' : 'Pendente')}
              className={`p-5 rounded-2xl border transition-all cursor-pointer shadow-sm flex items-center justify-between ${
                statusFilter === 'Pendente'
                  ? 'bg-purple-500/10 dark:bg-purple-950/40 border-purple-400 dark:border-purple-700 ring-2 ring-purple-500/30'
                  : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-purple-300 dark:hover:border-purple-800'
              }`}
              title="Filtrar guias pendentes"
            >
              <div>
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-purple-500" />
                  Impostos a Pagar
                </span>
                <div className="text-2xl font-black text-purple-600 dark:text-purple-400 mt-1.5 tracking-tight">
                  {formatBrl(filteredTaxes.filter(t => t.status === 'Pendente').reduce((acc, t) => acc + t.payableAmount, 0))}
                </div>
                <span className="text-[11px] text-slate-400 mt-0.5 block">
                  {filteredTaxes.filter(t => t.status === 'Pendente').length} guias a recolher
                </span>
              </div>
              <div className="p-3.5 bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 rounded-2xl">
                <Landmark className="w-6 h-6" />
              </div>
            </div>

            {/* 2. Total Impostos Já Pagos */}
            <div
              onClick={() => setStatusFilter(prev => prev === 'Pago' ? 'all' : 'Pago')}
              className={`p-5 rounded-2xl border transition-all cursor-pointer shadow-sm flex items-center justify-between ${
                statusFilter === 'Pago'
                  ? 'bg-emerald-50/90 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-700 ring-2 ring-emerald-500/30'
                  : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-emerald-300 dark:hover:border-emerald-800'
              }`}
              title="Filtrar guias pagas"
            >
              <div>
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  Tributos Já Pagos
                </span>
                <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1.5 tracking-tight">
                  {formatBrl(filteredTaxes.filter(t => t.status === 'Pago').reduce((acc, t) => acc + (t.paidAmount || t.payableAmount), 0))}
                </div>
                <span className="text-[11px] text-slate-400 mt-0.5 block">
                  {filteredTaxes.filter(t => t.status === 'Pago').length} guias com comprovante
                </span>
              </div>
              <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 rounded-2xl">
                <CheckCircle2 className="w-6 h-6" />
              </div>
            </div>

            {/* 3. Total Impostos Vencidos */}
            <div
              onClick={() => setStatusFilter(prev => prev === 'Atrasado' ? 'all' : 'Atrasado')}
              className={`p-5 rounded-2xl border transition-all cursor-pointer shadow-sm flex items-center justify-between ${
                statusFilter === 'Atrasado'
                  ? 'bg-rose-50/90 dark:bg-rose-950/40 border-rose-300 dark:border-rose-700 ring-2 ring-rose-500/30'
                  : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-rose-300 dark:hover:border-rose-800'
              }`}
              title="Filtrar guias em atraso"
            >
              <div>
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 text-rose-500" />
                  Guias em Atraso
                </span>
                <div className="text-2xl font-black text-rose-600 dark:text-rose-400 mt-1.5 tracking-tight">
                  {formatBrl(filteredTaxes.filter(t => t.status === 'Atrasado').reduce((acc, t) => acc + t.payableAmount, 0))}
                </div>
                <span className="text-[11px] text-slate-400 mt-0.5 block">
                  {filteredTaxes.filter(t => t.status === 'Atrasado').length} guias vencidas
                </span>
              </div>
              <div className="p-3.5 bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 rounded-2xl">
                <AlertCircle className="w-6 h-6" />
              </div>
            </div>

            {/* 4. Subdivisão por Tipo de Imposto */}
            <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700/60 pb-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Resumo Tributário
                </span>
                <span className="text-xs font-black text-purple-600 dark:text-purple-400">
                  {formatBrl(filteredTaxes.reduce((acc, t) => acc + t.payableAmount, 0))}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-x-2 gap-y-1.5 text-[11px] pt-2">
                <div className="flex items-center justify-between">
                  <span className="text-slate-600 dark:text-slate-400 flex items-center gap-1 font-medium">
                    <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                    PIS/COFINS:
                  </span>
                  <strong className="text-blue-600 dark:text-blue-400 font-mono font-bold">{formatBrl(filteredTaxes.filter(t => t.taxType === 'PIS_COFINS').reduce((acc, t) => acc + t.payableAmount, 0))}</strong>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-600 dark:text-slate-400 flex items-center gap-1 font-medium">
                    <span className="w-2 h-2 rounded-full bg-purple-500 shrink-0" />
                    ICMS:
                  </span>
                  <strong className="text-purple-600 dark:text-purple-400 font-mono font-bold">{formatBrl(filteredTaxes.filter(t => t.taxType === 'ICMS').reduce((acc, t) => acc + t.payableAmount, 0))}</strong>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-600 dark:text-slate-400 flex items-center gap-1 font-medium">
                    <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                    CSLL/IRPJ:
                  </span>
                  <strong className="text-amber-600 dark:text-amber-400 font-mono font-bold">{formatBrl(filteredTaxes.filter(t => t.taxType === 'CSLL' || t.taxType === 'IRPJ').reduce((acc, t) => acc + t.payableAmount, 0))}</strong>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-600 dark:text-slate-400 flex items-center gap-1 font-medium">
                    <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
                    INSS/FGTS:
                  </span>
                  <strong className="text-rose-600 dark:text-rose-400 font-mono font-bold">{formatBrl(filteredTaxes.filter(t => t.taxType === 'INSS' || t.taxType === 'FGTS').reduce((acc, t) => acc + t.payableAmount, 0))}</strong>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* KPIs Padrão de Contas a Pagar */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Total a Pagar Pendente */}
          <div
            onClick={() => setStatusFilter(prev => prev === 'Pendente' ? 'all' : 'Pendente')}
            className={`p-5 rounded-2xl border transition-all cursor-pointer shadow-sm flex items-center justify-between ${
              statusFilter === 'Pendente'
                ? 'bg-amber-50/90 dark:bg-amber-950/40 border-amber-300 dark:border-amber-700 ring-2 ring-amber-500/30'
                : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-amber-300 dark:hover:border-amber-800'
            }`}
            title="Clique para filtrar apenas Contas Pendentes"
          >
            <div>
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-amber-500" />
                A Pagar (Pendente)
              </span>
              <div className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-1.5 tracking-tight">
                {formatBrl(kpiPending)}
              </div>
              <span className="text-[11px] text-slate-400 mt-0.5 block">
                Obrigações em aberto
              </span>
            </div>
            <div className="p-3.5 bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 rounded-2xl">
              <Clock className="w-6 h-6" />
            </div>
          </div>

          {/* Total Pago */}
          <div
            onClick={() => setStatusFilter(prev => prev === 'Pago' ? 'all' : 'Pago')}
            className={`p-5 rounded-2xl border transition-all cursor-pointer shadow-sm flex items-center justify-between ${
              statusFilter === 'Pago'
                ? 'bg-emerald-50/90 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-700 ring-2 ring-emerald-500/30'
                : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-emerald-300 dark:hover:border-emerald-800'
            }`}
            title="Clique para filtrar apenas Contas Pagas (Liquidadas)"
          >
            <div>
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                Total Liquidado (Pago)
              </span>
              <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1.5 tracking-tight">
                {formatBrl(kpiPaid)}
              </div>
              <span className="text-[11px] text-slate-400 mt-0.5 block">
                Baixas realizadas no período
              </span>
            </div>
            <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 rounded-2xl">
              <CheckCircle2 className="w-6 h-6" />
            </div>
          </div>

          {/* Total Vencido / Contas em Atraso */}
          <div
            onClick={() => setStatusFilter(prev => prev === 'Atrasado' ? 'all' : 'Atrasado')}
            className={`p-5 rounded-2xl border transition-all cursor-pointer shadow-sm flex flex-col justify-between relative group ${
              statusFilter === 'Atrasado'
                ? 'bg-rose-50/90 dark:bg-rose-950/40 border-rose-300 dark:border-rose-700 ring-2 ring-rose-500/30'
                : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-rose-300 dark:hover:border-rose-800'
            }`}
            title="Clique para filtrar a tabela apenas pelas Contas em Atraso"
          >
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 text-rose-500" />
                  Contas em Atraso
                </span>
                <div className="flex items-center gap-1.5">
                  {statusFilter === 'Atrasado' && (
                    <span className="text-[10px] bg-rose-200/80 dark:bg-rose-900/70 text-rose-800 dark:text-rose-200 px-2 py-0.5 rounded-full font-bold">
                      Filtro Ativo
                    </span>
                  )}
                  <div className="p-2.5 bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 rounded-xl">
                    <AlertCircle className="w-5 h-5" />
                  </div>
                </div>
              </div>

              <div className="text-2xl font-black text-rose-600 dark:text-rose-400 mt-1.5 tracking-tight flex items-baseline gap-2">
                <span>{formatBrl(kpiOverdue)}</span>
                {overdueLateFees.count > 0 && (
                  <span className="text-xs font-semibold text-slate-400">
                    ({overdueLateFees.count} {overdueLateFees.count === 1 ? 'título' : 'títulos'})
                  </span>
                )}
              </div>
              <span className="text-[11px] text-slate-400 mt-0.5 block">
                Vencimento ultrapassado no período
              </span>
            </div>

            {/* DESTAQUE DE JUROS / MULTAS */}
            <div className="mt-3.5 pt-2.5 border-t border-rose-100 dark:border-rose-900/40 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                  <TrendingUp className="w-3.5 h-3.5 text-rose-500" />
                  Juros / Multas Destacados:
                </span>
                <span className="text-xs font-black text-rose-600 dark:text-rose-400 font-mono bg-rose-100/80 dark:bg-rose-950/80 px-2 py-0.5 rounded-md border border-rose-200 dark:border-rose-800 shadow-2xs">
                  +{formatBrl(overdueLateFees.total)}
                </span>
              </div>

              <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 flex-wrap gap-x-2">
                <span>
                  Multas: <strong className="text-rose-600 dark:text-rose-400 font-bold">{formatBrl(overdueLateFees.fine)}</strong>
                </span>
                <span>
                  Juros Mora: <strong className="text-rose-600 dark:text-rose-400 font-bold">{formatBrl(overdueLateFees.interest)}</strong>
                </span>
              </div>
            </div>
          </div>

          {/* Composição das Contas */}
          <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Composição Atual
              </span>
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                {formatBrl(subtotalInvoices + subtotalCte + subtotalManuals + subtotalLeaders + subtotalTaxes)}
              </span>
            </div>
            <div className="mt-2 space-y-1.5 text-[11px]">
              <div
                onClick={() => setActiveSection('invoices')}
                className="flex items-center justify-between text-slate-600 dark:text-slate-300 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-slate-100/60 dark:hover:bg-slate-700/40 px-1 py-0.5 rounded cursor-pointer transition-colors"
                title="Filtrar por Notas Fiscais / Faturas a Pagar"
              >
                <span className="flex items-center gap-1">
                  <FileText className="w-3 h-3 text-emerald-500" />
                  Notas Fiscais:
                </span>
                <span className="font-bold">{formatBrl(subtotalInvoices)}</span>
              </div>
              <div
                onClick={() => setActiveSection('cte')}
                className="flex items-center justify-between text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50/60 dark:hover:bg-indigo-950/40 px-1 py-0.5 rounded cursor-pointer transition-colors"
                title="Abrir janela Fretes / Doc CT-e (Embarques com CT-e)"
              >
                <span className="flex items-center gap-1">
                  <FileText className="w-3 h-3 text-indigo-500" />
                  Fretes / Doc CT-e:
                </span>
                <span className="font-bold text-indigo-600 dark:text-indigo-400">{formatBrl(subtotalCte)}</span>
              </div>
              <div
                onClick={() => setActiveSection('manual')}
                className="flex items-center justify-between text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-100/60 dark:hover:bg-slate-700/40 px-1 py-0.5 rounded cursor-pointer transition-colors"
                title="Filtrar por Lançamentos Avulsos"
              >
                <span className="flex items-center gap-1">
                  <Tag className="w-3 h-3 text-blue-500" />
                  Lançamentos Avulsos:
                </span>
                <span className="font-bold">{formatBrl(subtotalManuals)}</span>
              </div>
              <div
                onClick={() => setActiveSection('leaders')}
                className="flex items-center justify-between text-slate-600 dark:text-slate-300 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-slate-100/60 dark:hover:bg-slate-700/40 px-1 py-0.5 rounded cursor-pointer transition-colors"
                title="Abrir Folha de Pagamento"
              >
                <span className="flex items-center gap-1">
                  <Wallet className="w-3 h-3 text-amber-500" />
                  Folha de Pagamento:
                </span>
                <span className="font-bold">{formatBrl(subtotalLeaders)}</span>
              </div>
              <div
                onClick={() => setActiveSection('taxes')}
                className="flex items-center justify-between text-slate-600 dark:text-slate-300 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-purple-50/60 dark:hover:bg-purple-950/40 px-1 py-0.5 rounded cursor-pointer transition-colors"
                title="Abrir Impostos & Tributos"
              >
                <span className="flex items-center gap-1">
                  <Landmark className="w-3 h-3 text-purple-500" />
                  Impostos & Tributos:
                </span>
                <span className="font-bold text-purple-600 dark:text-purple-400">{formatBrl(subtotalTaxes)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CARD DE RESUMO BANCÁRIO (OB) */}
      {showBankingSummary && (
        <div className="bg-gradient-to-r from-emerald-900/10 via-slate-50 to-blue-900/10 dark:from-emerald-950/40 dark:via-slate-800 dark:to-blue-950/40 p-4 rounded-2xl border border-emerald-200 dark:border-emerald-800/60 shadow-sm space-y-3 animate-fadeIn">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-emerald-600 text-white shadow-xs">
                <Landmark className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-100">
                  Resumo Bancário de Saídas & Quitações
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Totalizadores de saídas pagas e programadas por instituição bancária
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowBankingSummary(false)}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg"
              title="Fechar Resumo"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Banco Sicredi */}
            <div className="bg-white dark:bg-slate-800/90 p-3 rounded-xl border border-emerald-300 dark:border-emerald-700/80 shadow-xs">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-black uppercase tracking-wider text-emerald-800 dark:text-emerald-300 flex items-center gap-1">
                  🟢 Sicredi (Conta Matriz)
                </span>
                <span className="text-[10px] font-bold text-slate-400">Total: {formatBrl(bankingSummary.sicredi.total)}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-slate-100 dark:border-slate-700/60">
                <div>
                  <span className="text-[10px] text-amber-600 dark:text-amber-400 block font-bold">A Pagar</span>
                  <strong className="text-xs font-black text-amber-600 dark:text-amber-400">{formatBrl(bankingSummary.sicredi.planned)}</strong>
                </div>
                <div>
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 block font-bold">Pago (Liquidado)</span>
                  <strong className="text-xs font-black text-emerald-600 dark:text-emerald-400">{formatBrl(bankingSummary.sicredi.paid)}</strong>
                </div>
              </div>
            </div>

            {/* Banco Itaú */}
            <div className="bg-white dark:bg-slate-800/90 p-3 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xs">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-black uppercase tracking-wider text-orange-700 dark:text-orange-300">
                  Itaú Unibanco
                </span>
                <span className="text-[10px] font-bold text-slate-400">Total: {formatBrl(bankingSummary.itau.total)}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-slate-100 dark:border-slate-700/60">
                <div>
                  <span className="text-[10px] text-amber-600 dark:text-amber-400 block font-bold">A Pagar</span>
                  <strong className="text-xs font-black text-amber-600 dark:text-amber-400">{formatBrl(bankingSummary.itau.planned)}</strong>
                </div>
                <div>
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 block font-bold">Pago (Liquidado)</span>
                  <strong className="text-xs font-black text-emerald-600 dark:text-emerald-400">{formatBrl(bankingSummary.itau.paid)}</strong>
                </div>
              </div>
            </div>

            {/* Outros Bancos */}
            <div className="bg-white dark:bg-slate-800/90 p-3 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xs">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-600 dark:text-slate-300">
                  Outras Contas / Caixas
                </span>
                <span className="text-[10px] font-bold text-slate-400">Total: {formatBrl(bankingSummary.other.total)}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-slate-100 dark:border-slate-700/60">
                <div>
                  <span className="text-[10px] text-amber-600 dark:text-amber-400 block font-bold">A Pagar</span>
                  <strong className="text-xs font-black text-amber-600 dark:text-amber-400">{formatBrl(bankingSummary.other.planned)}</strong>
                </div>
                <div>
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 block font-bold">Pago (Liquidado)</span>
                  <strong className="text-xs font-black text-emerald-600 dark:text-emerald-400">{formatBrl(bankingSummary.other.paid)}</strong>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. BARRA DE FILTROS AVANÇADOS COM PRESETS RÁPIDOS OPZ */}
      <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-3">
        {/* Presets Rápidos de Período OPZ em 1 clique */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 shrink-0 mr-1 flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            <span>Período OPZ:</span>
          </span>
          <button
            type="button"
            onClick={() => setPeriodPreset('all')}
            className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${periodPreset === 'all'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-slate-100 dark:bg-slate-700/60 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
              }`}
          >
            Todo o Período
          </button>
          <button
            type="button"
            onClick={() => setPeriodPreset('today_onwards')}
            className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${periodPreset === 'today_onwards'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-slate-100 dark:bg-slate-700/60 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
              }`}
            title="Filtrar todas as contas com vencimento de hoje em diante"
          >
            ⏩ De Hoje em Diante
          </button>
          <button
            type="button"
            onClick={() => setPeriodPreset('today')}
            className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${periodPreset === 'today'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-slate-100 dark:bg-slate-700/60 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
              }`}
          >
            Hoje
          </button>
          <button
            type="button"
            onClick={() => setPeriodPreset('next_7_days')}
            className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${periodPreset === 'next_7_days'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-slate-100 dark:bg-slate-700/60 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
              }`}
          >
            Próximos 7 Dias
          </button>
          <button
            type="button"
            onClick={() => setPeriodPreset('current_month')}
            className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${periodPreset === 'current_month'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-slate-100 dark:bg-slate-700/60 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
              }`}
          >
            Mês Atual
          </button>
          <button
            type="button"
            onClick={() => setPeriodPreset('last_month')}
            className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${periodPreset === 'last_month'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-slate-100 dark:bg-slate-700/60 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
              }`}
          >
            Mês Anterior
          </button>
          <button
            type="button"
            onClick={() => setPeriodPreset('custom')}
            className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${periodPreset === 'custom'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-slate-100 dark:bg-slate-700/60 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
              }`}
          >
            Personalizado...
          </button>
        </div>
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          {/* Busca por texto */}
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder={activeSection === 'leaders' ? "Buscar por líder, agência, observação, forma de pagamento..." : activeSection === 'cte' ? "Buscar por Doc CT-e, motorista, placa, embarque..." : activeSection === 'taxes' ? "Buscar por tributo (PIS, COFINS, ICMS, CSLL, IRPJ, FGTS, INSS), número do DARF/DARE, período..." : "Buscar por descrição, fornecedor, centro de custo, número da NF..."}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-xl text-xs sm:text-sm border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Filtro por Tipo de Tributo (na aba de Impostos & Tributos) com paleta rica de cores e alto contraste */}
            {activeSection === 'taxes' && (
              <div className="relative" ref={taxTypeDropdownRef}>
                <button
                  type="button"
                  onClick={() => setIsTaxTypeDropdownOpen(prev => !prev)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all border cursor-pointer shadow-xs ${
                    selectedTaxTypeFilter === 'all'
                      ? 'bg-purple-50 hover:bg-purple-100 text-purple-900 dark:bg-purple-950/40 dark:hover:bg-purple-900/60 dark:text-purple-200 border-purple-300 dark:border-purple-700'
                      : TAX_TYPE_CONFIG[selectedTaxTypeFilter]?.badge || 'bg-slate-100 text-slate-800 border-slate-300'
                  }`}
                  title="Filtrar por tipo de tributo"
                >
                  <span className={`w-2.5 h-2.5 rounded-full ${TAX_TYPE_CONFIG[selectedTaxTypeFilter]?.dotColor || 'bg-purple-500'} shrink-0`} />
                  <span className="font-bold">
                    {TAX_TYPE_CONFIG[selectedTaxTypeFilter]?.label || 'Todos os Tributos'}
                  </span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/10 dark:bg-white/20 font-mono">
                    {selectedTaxTypeFilter === 'all'
                      ? filteredTaxes.length
                      : filteredTaxes.filter(t => t.taxType === selectedTaxTypeFilter).length}
                  </span>
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isTaxTypeDropdownOpen ? 'rotate-180' : ''}`} />
                </button>

                {isTaxTypeDropdownOpen && (
                  <div className="absolute left-0 mt-1.5 w-72 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl p-1.5 z-50 animate-in fade-in zoom-in-95 duration-100">
                    <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Selecione a Categoria de Tributo
                    </div>
                    <div className="space-y-0.5 mt-1 max-h-72 overflow-y-auto">
                      {(['all', 'PIS_COFINS', 'ICMS', 'CSLL', 'IRPJ', 'FGTS', 'INSS', 'OUTROS'] as (TaxType | 'all')[]).map((type) => {
                        const config = TAX_TYPE_CONFIG[type];
                        const isSelected = selectedTaxTypeFilter === type;
                        const count = type === 'all'
                          ? taxPayables.length
                          : taxPayables.filter(t => t.taxType === type).length;
                        const totalAmount = type === 'all'
                          ? taxPayables.reduce((acc, t) => acc + (t.payableAmount || 0), 0)
                          : taxPayables.filter(t => t.taxType === type).reduce((acc, t) => acc + (t.payableAmount || 0), 0);

                        return (
                          <button
                            key={type}
                            type="button"
                            onClick={() => {
                              setSelectedTaxTypeFilter(type);
                              setIsTaxTypeDropdownOpen(false);
                            }}
                            className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-left transition-colors cursor-pointer group ${
                              isSelected
                                ? 'bg-purple-100 dark:bg-purple-950/60 text-purple-900 dark:text-purple-100 font-bold ring-1 ring-purple-400/40'
                                : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span className={`w-3 h-3 rounded-full ${config.dotColor} shrink-0 ring-2 ring-white dark:ring-slate-900`} />
                              <div className="min-w-0">
                                <div className="text-xs font-bold truncate">
                                  {config.label}
                                </div>
                                <div className="text-[10px] text-slate-400 truncate">
                                  {config.category}
                                </div>
                              </div>
                            </div>
                            <div className="text-right shrink-0 ml-2">
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-mono font-bold ${
                                isSelected
                                  ? 'bg-purple-200 dark:bg-purple-900 text-purple-900 dark:text-purple-200'
                                  : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                              }`}>
                                {count} {count === 1 ? 'guia' : 'guias'}
                              </span>
                              {totalAmount > 0 && (
                                <div className="text-[9px] font-mono text-slate-400 mt-0.5">
                                  {formatBrl(totalAmount)}
                                </div>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Filtro por Mês de Competência (na aba de Impostos & Tributos) */}
            {activeSection === 'taxes' && availableCompetencePeriods.length > 0 && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-purple-200 dark:border-purple-800 bg-purple-50/60 dark:bg-purple-950/30 text-purple-900 dark:text-purple-200 shadow-xs">
                <Calendar className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400 shrink-0" />
                <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 shrink-0">Competência:</span>
                <select
                  value={selectedCompetenceFilter}
                  onChange={(e) => setSelectedCompetenceFilter(e.target.value)}
                  className="text-xs font-bold bg-transparent text-purple-950 dark:text-purple-100 outline-none cursor-pointer"
                >
                  <option value="all" className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200">
                    Todas as Competências ({taxPayables.length})
                  </option>
                  {availableCompetencePeriods.map(comp => (
                    <option key={comp} value={comp} className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200">
                      {comp} ({taxPayables.filter(t => t.taxPeriod === comp).length})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Filtro por Líder Específico (na aba de Agenciadores Líder) */}
            {activeSection === 'leaders' && (
              <div className="relative">
                <select
                  value={selectedLeaderFilter}
                  onChange={(e) => setSelectedLeaderFilter(e.target.value)}
                  className="px-3 py-2 rounded-xl text-xs font-semibold border border-amber-300 dark:border-amber-700/80 bg-amber-50/50 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200 outline-none cursor-pointer"
                >
                  <option value="all">👑 Todos os Agenciadores Líder</option>
                  {leaderUsers.map(l => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Filtro por Status */}
            <div className="relative">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-2 rounded-xl text-xs font-semibold border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white outline-none cursor-pointer"
              >
                <option value="all">Todos os Status</option>
                <option value="Pendente">🟡 Pendente</option>
                <option value="Pago">🟢 Pago</option>
                <option value="Atrasado">🔴 Atrasado</option>
              </select>
            </div>

            {/* Filtro por Período Preset */}
            <div className="relative">
              <select
                value={periodPreset}
                onChange={(e) => setPeriodPreset(e.target.value as any)}
                className="px-3 py-2 rounded-xl text-xs font-semibold border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white outline-none cursor-pointer"
              >
                <option value="all">📅 Todo o Período</option>
                <option value="current_month">Mês Atual</option>
                <option value="last_month">Mês Anterior</option>
                <option value="custom">Personalizado...</option>
              </select>
            </div>

            {/* Botão de Exportar */}
            <button
              onClick={handleExportCsv}
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold transition-all cursor-pointer"
              title="Exportar planilha CSV"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Exportar</span>
            </button>

            {/* Botão de Lançamento Avulso (exclusivo para a aba de Lançamentos Avulsos) */}
            {activeSection === 'manual' && (
              <button
                type="button"
                onClick={() => handleOpenManualModal()}
                className="flex items-center gap-1.5 px-3 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-600/30 transition-all cursor-pointer whitespace-nowrap"
                title="Cadastrar nova despesa avulsa ou vale / adiantamento salarial"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Lançamento Avulso</span>
              </button>
            )}

            {/* Botões de Impostos (exclusivo para a aba de Impostos & Tributos) */}
            {activeSection === 'taxes' && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleOpenTaxManualModal()}
                  className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-600/30 transition-all cursor-pointer whitespace-nowrap active:scale-95"
                  title="Cadastrar guia de imposto manualmente sem OCR"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ Nova Guia Manual</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsTaxImportModalOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-2 bg-linear-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl text-xs font-bold shadow-md shadow-purple-600/30 transition-all cursor-pointer whitespace-nowrap active:scale-95"
                  title="Ler guias automaticamente via OCR e importar para o sistema"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>+ Ler Guia Automática (OCR)</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Inputs de Período Personalizado */}
        {periodPreset === 'custom' && (
          <div className="flex items-center gap-3 pt-2 border-t border-slate-100 dark:border-slate-700/60 text-xs">
            <span className="font-semibold text-slate-600 dark:text-slate-400">De:</span>
            <input
              type="date"
              value={customStartDate}
              onChange={(e) => setCustomStartDate(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white outline-none"
            />
            <span className="font-semibold text-slate-600 dark:text-slate-400">Até:</span>
            <input
              type="date"
              value={customEndDate}
              onChange={(e) => setCustomEndDate(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white outline-none"
            />
            {(customStartDate || customEndDate) && (
              <button
                onClick={() => { setCustomStartDate(''); setCustomEndDate(''); }}
                className="text-xs text-rose-500 hover:underline cursor-pointer"
              >
                Limpar datas
              </button>
            )}
          </div>
        )}
      </div>

      {/* 4. CONTEÚDO ESPECÍFICO: FOLHA DE PAGAMENTO */}
      {activeSection === 'leaders' && (
        <div className="space-y-6">
          {/* SEÇÃO 4.1: CARDS DE ACOMPANHAMENTO CONSOLIDADO DA FOLHA */}
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Wallet className="w-5 h-5 text-amber-500" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Apurações de Pagamento
                </h3>
                <span className="text-xs text-slate-400 hidden md:inline">
                  (Folha dos Usuários Internos: CLT, PJ e Gestores AG)
                </span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => handleOpenPlanModal()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-xs transition-all cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Novo Planejamento</span>
                </button>
              </div>
            </div>

            {/* SOMA DOS MESES SEPARADAMENTE: COMPARAÇÃO LADO A LADO (OUTUBRO EM ABERTO vs SETEMBRO QUITADO) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
              {/* Card 1: Mês Atual (Outubro / 2026) */}
              <div
                onClick={() => {
                  setPayrollSelectedMonth('current');
                }}
                className={`relative overflow-hidden rounded-2xl p-4 transition-all cursor-pointer border ${payrollSelectedMonth === 'current'
                    ? 'bg-amber-500/10 dark:bg-amber-950/30 border-amber-500 ring-2 ring-amber-500/30 shadow-md'
                    : 'bg-white dark:bg-slate-800/90 border-slate-200 dark:border-slate-700/80 hover:border-amber-400/60'
                  }`}
              >
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-400 shrink-0">
                      <Calendar className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-sm font-black text-slate-900 dark:text-white">
                          Mês Atual: {payrollMonthTotals.current.label}
                        </h4>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                          Em Andamento
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400">
                        {payrollMonthTotals.current.count} colaboradores em apuração
                      </span>
                    </div>
                  </div>

                  <span className={`text-[11px] font-bold px-2 py-1 rounded-lg shrink-0 ${payrollSelectedMonth === 'current'
                      ? 'bg-amber-600 text-white shadow-xs'
                      : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                    }`}>
                    {payrollSelectedMonth === 'current' ? 'Filtro Ativo' : 'Clique p/ Filtrar'}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2.5 border-t border-slate-200/70 dark:border-slate-700/60 text-xs">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Folha Bruta</span>
                    <strong className="text-xs sm:text-sm font-black text-slate-800 dark:text-slate-100">
                      {formatBrl(payrollMonthTotals.current.gross)}
                    </strong>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">(-) Descontos/Trib.</span>
                    <strong className="text-xs sm:text-sm font-black text-rose-600 dark:text-rose-400">
                      -{formatBrl(payrollMonthTotals.current.taxes + payrollMonthTotals.current.advances)}
                    </strong>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Líquido Devido</span>
                    <strong className="text-xs sm:text-sm font-black text-purple-600 dark:text-purple-400">
                      {formatBrl(payrollMonthTotals.current.netDue)}
                    </strong>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-amber-600 dark:text-amber-400 block">Saldo a Pagar</span>
                    <strong className="text-xs sm:text-sm font-black text-amber-600 dark:text-amber-400">
                      {formatBrl(payrollMonthTotals.current.pending)}
                    </strong>
                  </div>
                </div>
              </div>

              {/* Card 2: Mês Anterior (Setembro / 2026 - Quitado) */}
              <div
                onClick={() => {
                  setPayrollSelectedMonth('last');
                }}
                className={`relative overflow-hidden rounded-2xl p-4 transition-all cursor-pointer border ${payrollSelectedMonth === 'last'
                    ? 'bg-emerald-500/10 dark:bg-emerald-950/30 border-emerald-500 ring-2 ring-emerald-500/30 shadow-md'
                    : 'bg-white dark:bg-slate-800/90 border-slate-200 dark:border-slate-700/80 hover:border-emerald-400/60'
                  }`}
              >
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 shrink-0">
                      <CheckCircle2 className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-sm font-black text-slate-900 dark:text-white">
                          Mês Anterior: {payrollMonthTotals.last.label}
                        </h4>
                        {payrollMonthTotals.last.pending <= 0 ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                            100% Quitado / Feito
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                            {formatBrl(payrollMonthTotals.last.pending)} Pendente
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold">
                        {payrollMonthTotals.last.pending <= 0
                          ? `Acertos de ${payrollMonthTotals.last.label} já foram concluídos`
                          : `Acertos de ${payrollMonthTotals.last.label} em acompanhamento e quitação`}
                      </span>
                    </div>
                  </div>

                  <span className={`text-[11px] font-bold px-2 py-1 rounded-lg shrink-0 ${payrollSelectedMonth === 'last'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                    }`}>
                    {payrollSelectedMonth === 'last' ? 'Filtro Ativo' : 'Clique p/ Filtrar'}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2.5 border-t border-slate-200/70 dark:border-slate-700/60 text-xs">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Folha Bruta</span>
                    <strong className="text-xs sm:text-sm font-black text-slate-800 dark:text-slate-100">
                      {formatBrl(payrollMonthTotals.last.gross)}
                    </strong>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Total Quitado (Pago)</span>
                    <strong className="text-xs sm:text-sm font-black text-emerald-600 dark:text-emerald-400">
                      {formatBrl(payrollMonthTotals.last.paid)}
                    </strong>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Líquido Liquidado</span>
                    <strong className="text-xs sm:text-sm font-black text-purple-600 dark:text-purple-400">
                      {formatBrl(payrollMonthTotals.last.netDue)}
                    </strong>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-amber-600 dark:text-amber-400 block">Saldo Pendente</span>
                    <strong className={`text-xs sm:text-sm font-black ${payrollMonthTotals.last.pending > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                      {payrollMonthTotals.last.pending > 0 ? formatBrl(payrollMonthTotals.last.pending) : 'R$ 0,00 (Quitado)'}
                    </strong>
                  </div>
                </div>
              </div>
            </div>

            {/* Seletor de Sub-Aba: Contas em Aberto / Pendências (Tela Inicial) vs Pagamento Feito (Histórico) */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 p-2 bg-slate-100 dark:bg-slate-900/80 rounded-2xl border border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2 overflow-x-auto">
                <button
                  type="button"
                  onClick={() => setPayrollSubTab('pending')}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer whitespace-nowrap ${payrollSubTab === 'pending'
                      ? 'bg-amber-600 text-white shadow-md shadow-amber-600/30'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-white/60 dark:hover:bg-slate-800'
                    }`}
                >
                  <Clock className="w-4 h-4 text-amber-200" />
                  <span>Contas em Aberto & Pendências (Tela Inicial)</span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${payrollSubTab === 'pending' ? 'bg-amber-800 text-amber-100' : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                    }`}>
                    {pendingPayrollItems.length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setPayrollSubTab('completed')}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer whitespace-nowrap ${payrollSubTab === 'completed'
                      ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-white/60 dark:hover:bg-slate-800'
                    }`}
                >
                  <CheckCircle2 className="w-4 h-4 text-emerald-200" />
                  <span>Pagamento Feito (Histórico)</span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${payrollSubTab === 'completed' ? 'bg-emerald-800 text-emerald-100' : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                    }`}>
                    {completedPayrollItems.length}
                  </span>
                </button>
              </div>

              <div className="text-[11px] text-slate-500 dark:text-slate-400 px-2 flex items-center gap-1.5">
                {payrollSubTab === 'pending' ? (
                  <span className="flex items-center gap-1 text-amber-700 dark:text-amber-400 font-semibold">
                    <AlertCircle className="w-3.5 h-3.5" />
                    Contas com saldo pendente ou aguardando anexação de NF / Comprovante
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-semibold">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Histórico de acertos quitados com documentos arquivados
                  </span>
                )}
              </div>
            </div>

            {/* Barra de Filtro de Mês e Regime da Folha */}
            <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-2.5 bg-slate-50 dark:bg-slate-900/60 p-2.5 rounded-xl border border-slate-200/80 dark:border-slate-700/60 text-xs">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mr-1">Mês:</span>
                {[
                  { id: 'current', label: `Mês Atual (${payrollMonthTotals.current.label})` },
                  { id: 'last', label: `Mês Anterior (${payrollMonthTotals.last.label}${payrollMonthTotals.last.pending <= 0 ? ' - Quitado' : ''})` },
                  { id: 'all', label: 'Todos os Meses' },
                ].map(m => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setPayrollSelectedMonth(m.id)}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${payrollSelectedMonth === m.id
                        ? 'bg-amber-600 text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'
                      }`}
                  >
                    {m.label}
                  </button>
                ))}

                <span className="text-slate-300 dark:text-slate-700 mx-1">|</span>

                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mr-1">Regime:</span>
                {[
                  { id: 'all', label: 'Todos', count: leadersSummary.length },
                  { id: 'CLT', label: 'CLT', count: leadersSummary.filter(l => l.regime === 'CLT').length },
                  { id: 'PJ', label: 'PJ', count: leadersSummary.filter(l => l.regime === 'PJ').length },
                  { id: 'Gestor AG', label: 'Gestor AG (Líderes)', count: leadersSummary.filter(l => l.regime === 'Gestor AG').length },
                ].map(tab => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setSelectedRegimeFilter(tab.id as any)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${selectedRegimeFilter === tab.id
                        ? 'bg-slate-800 text-white dark:bg-white dark:text-slate-900 shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'
                      }`}
                  >
                    {tab.label} ({tab.count})
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2.5 flex-wrap text-[11px] text-slate-500 dark:text-slate-400">
                {payrollSubTab === 'pending' ? (
                  <span>Apurações em aberto: <strong className="text-slate-800 dark:text-slate-200">{leadersSummary.length}</strong></span>
                ) : (
                  <span>Contas quitadas e arquivadas: <strong className="text-emerald-700 dark:text-emerald-300 font-bold">{leadersSummary.length}</strong></span>
                )}

                {excludedPayrollUserIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setIsExcludedUsersModalOpen(true)}
                    className="inline-flex items-center gap-1 font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-100/70 dark:hover:bg-rose-950/70 cursor-pointer bg-rose-50 dark:bg-rose-950/40 px-2 py-0.5 rounded-md border border-rose-200 dark:border-rose-800 transition-colors"
                    title="Visualizar e gerenciar colaboradores excluídos da folha de pagamento"
                  >
                    <UserX className="w-3 h-3 text-rose-500" />
                    <span>{excludedPayrollUserIds.length} excluído{excludedPayrollUserIds.length > 1 ? 's' : ''} (Gerenciar)</span>
                  </button>
                )}
              </div>
            </div>

            {leadersSummary.length === 0 ? (
              <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-8 text-center text-slate-400">
                {payrollSelectedMonth === 'last' && payrollSubTab === 'pending' ? (
                  <div className="max-w-md mx-auto py-2">
                    <CheckCircle2 className="w-12 h-12 mx-auto mb-3 text-emerald-500" />
                    <h4 className="font-bold text-base text-slate-800 dark:text-slate-200">
                      Acertos de Setembro já foram concluídos!
                    </h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 mb-4 leading-relaxed">
                      Como estamos iniciando as operações agora, todos os acertos do mês de Setembro já foram integralmente realizados e quitados. Eles estão arquivados com segurança no histórico.
                    </p>
                    <button
                      type="button"
                      onClick={() => setPayrollSubTab('completed')}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer"
                    >
                      <FolderCheck className="w-4 h-4" />
                      <span>Ver Acertos de Setembro em "Pagamento Feito"</span>
                    </button>
                  </div>
                ) : payrollSubTab === 'completed' ? (
                  <>
                    <FolderCheck className="w-10 h-10 mx-auto mb-2 opacity-40 text-emerald-500" />
                    <p className="font-semibold text-sm text-slate-700 dark:text-slate-300">
                      Nenhum acerto arquivado em "Pagamento Feito" para este filtro
                    </p>
                    <p className="text-xs text-slate-400 mt-1 max-w-lg mx-auto">
                      Assim que você anexar todos os documentos pendentes de cada colaborador (Comprovante para CLT; NF e Comprovante para PJ/Gestor AG) e liquidar o acerto, a conta sairá da tela inicial e aparecerá aqui no histórico.
                    </p>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-10 h-10 mx-auto mb-2 opacity-40 text-emerald-500" />
                    <p className="font-semibold text-sm text-slate-700 dark:text-slate-300">
                      Tudo em dia! Nenhuma conta com pendência em aberto
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      Todos os colaboradores do período já tiveram seus documentos anexados e saldos liquidados.
                    </p>
                  </>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {leadersSummary
                  .filter(item => {
                    if (selectedLeaderFilter !== 'all' && item.user.id !== selectedLeaderFilter) return false;
                    if (selectedRegimeFilter !== 'all' && item.regime !== selectedRegimeFilter) return false;
                    if (searchTerm) {
                      const s = searchTerm.toLowerCase();
                      const matchName = item.user.name.toLowerCase().includes(s);
                      const matchProf = (item.profileLabel || '').toLowerCase().includes(s) || (String(item.user.profile) || '').toLowerCase().includes(s);
                      const matchBranch = (item.branchName || '').toLowerCase().includes(s);
                      if (!matchName && !matchProf && !matchBranch) return false;
                    }
                    return true;
                  })
                  .map(item => {
                    const hasPendingBalance = item.balancePending > 0;
                    const isFullyPaid = item.balancePending <= 0 && (item.grossTotal > 0 || item.totalPaid > 0);
                    const userPix = item.user.phone || item.user.corporateEmail || item.user.email || '';

                    const avatarGradient = item.regime === 'Gestor AG'
                      ? 'from-amber-500 to-amber-700'
                      : item.regime === 'PJ'
                        ? 'from-purple-600 to-violet-800'
                        : 'from-blue-600 to-indigo-700';

                    return (
                      <div
                        key={item.id}
                        className={`rounded-2xl border p-5 shadow-xs hover:shadow-md transition-all flex flex-col justify-between ${item.isPreviousMonth && !item.isCompleted
                            ? 'bg-rose-50/20 dark:bg-rose-950/10 border-rose-200/90 dark:border-rose-900/60'
                            : item.isCompleted
                              ? 'bg-white dark:bg-slate-800 border-emerald-200/80 dark:border-emerald-800/60'
                              : 'bg-white dark:bg-slate-800 border-slate-200/90 dark:border-slate-700'
                          }`}
                      >
                        {/* Topo do Card */}
                        <div>
                          <div className="flex items-start justify-between gap-2 mb-3">
                            <div className="flex items-center gap-3">
                              <div className={`w-11 h-11 rounded-2xl bg-linear-to-br ${avatarGradient} text-white flex items-center justify-center font-black text-sm shadow-sm shrink-0`}>
                                {item.user.name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()}
                              </div>
                              <div>
                                <h4 className="font-bold text-sm text-slate-900 dark:text-white leading-tight">
                                  {item.user.name}
                                </h4>
                                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded-full border border-slate-200 dark:border-slate-600">
                                    <Briefcase className="w-3 h-3 text-slate-400" />
                                    {item.profileLabel}
                                  </span>
                                  {item.branchName && (
                                    <span className="text-[10px] text-slate-400 font-medium">
                                      • {item.branchName}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Status da Quitação */}
                            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border shrink-0 ${item.isCompleted
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800'
                                : isFullyPaid
                                  ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 border-blue-300 dark:border-blue-800'
                                  : hasPendingBalance
                                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-300 dark:border-amber-800'
                                    : 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-600'
                              }`}>
                              {item.isCompleted ? '✓ Pagamento Feito' : isFullyPaid ? 'Saldo Pago (Falta Docs)' : hasPendingBalance ? 'Pendente' : 'Sem Movimento'}
                            </span>
                          </div>

                          {/* Destaque do Mês de Referência (Mês Anterior Pendente vs Mês Atual vs Mês Quitado) */}
                          <div className="flex items-center justify-between mb-3 flex-wrap gap-1.5">
                            {item.isPreviousMonth && !item.isCompleted ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-black text-rose-700 dark:text-rose-300 bg-rose-100 dark:bg-rose-950/80 px-2.5 py-0.5 rounded-full border border-rose-300 dark:border-rose-800 animate-pulse">
                                <AlertTriangle className="w-3 h-3 text-rose-600 dark:text-rose-400 shrink-0" />
                                ⚠️ Mês Anterior Pendente ({item.monthLabel})
                              </span>
                            ) : item.isPreviousMonth && item.isCompleted ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/80 px-2.5 py-0.5 rounded-full border border-emerald-300 dark:border-emerald-800">
                                <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                                Mês Anterior Quitado ({item.monthLabel})
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 rounded-full border border-slate-200 dark:border-slate-700">
                                <Calendar className="w-3 h-3 text-slate-400" />
                                Mês de Referência: <strong className="text-slate-900 dark:text-white ml-0.5">{item.monthLabel}</strong>
                              </span>
                            )}

                            {item.paymentDate && (
                              <span className="text-[10px] text-slate-400">
                                Pago em: <strong className="text-slate-700 dark:text-slate-300">{new Date(item.paymentDate + 'T00:00:00').toLocaleDateString('pt-BR')}</strong>
                              </span>
                            )}
                          </div>

                          {/* Seletor Rápido de Regime (CLT | PJ | Gestor AG) e Opção de Excluir da Folha */}
                          <div className="flex items-center justify-between mb-3 bg-slate-50 dark:bg-slate-900/60 p-1.5 rounded-xl border border-slate-100 dark:border-slate-800 gap-1.5">
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1 whitespace-nowrap">
                              Classificação:
                            </span>
                            <div className="inline-flex items-center rounded-lg p-0.5 bg-slate-200/70 dark:bg-slate-800 border border-slate-300/60 dark:border-slate-700">
                              {(['CLT', 'PJ', 'Gestor AG'] as const).map(reg => (
                                <button
                                  key={reg}
                                  type="button"
                                  onClick={() => handleUpdateUserRegime(item.user.id, reg)}
                                  title={`Alterar regime de ${item.user.name} para ${reg}`}
                                  className={`px-2 py-0.5 text-[10px] font-bold rounded-md transition-all cursor-pointer ${item.regime === reg
                                      ? reg === 'Gestor AG'
                                        ? 'bg-amber-600 text-white shadow-xs'
                                        : reg === 'PJ'
                                          ? 'bg-purple-600 text-white shadow-xs'
                                          : 'bg-blue-600 text-white shadow-xs'
                                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                                    }`}
                                >
                                  {reg}
                                </button>
                              ))}

                              {/* Divisor */}
                              <div className="w-px h-3.5 bg-slate-300 dark:bg-slate-600 self-center mx-1" />

                              {/* Botão de Excluir o Usuário da Folha de Pagamento */}
                              <button
                                type="button"
                                onClick={() => handleExcludeUserFromPayroll(item.user)}
                                title={`Excluir ${item.user.name} da tela de Folha de Pagamento`}
                                className="px-2 py-0.5 text-[10px] font-bold rounded-md transition-all cursor-pointer text-rose-600 hover:bg-rose-100 dark:text-rose-400 dark:hover:bg-rose-950/60 flex items-center gap-1 active:scale-95"
                              >
                                <UserX className="w-3 h-3 text-rose-500" />
                                <span>Excluir</span>
                              </button>
                            </div>
                          </div>

                          {/* Memória de Cálculo / Dados Financeiros por Regime */}
                          {item.regime === 'CLT' && (
                            <div className="bg-slate-50 dark:bg-slate-900/60 p-3 rounded-xl border border-slate-100 dark:border-slate-800 text-xs mb-3 space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] text-slate-500 uppercase tracking-wider">Salário Base (Fixo)</span>
                                <button
                                  type="button"
                                  onClick={() => handleOpenEditUserValues(item.user, item.monthKey, item)}
                                  className="font-bold text-slate-800 dark:text-slate-200 hover:text-blue-600 dark:hover:text-blue-400 flex items-center gap-1 cursor-pointer"
                                  title="Clique para editar salário fixo"
                                >
                                  {formatBrl(item.fixedSalary)}
                                  <Edit3 className="w-3 h-3 text-slate-400" />
                                </button>
                              </div>
                              <div className="flex items-center justify-between text-blue-600 dark:text-blue-400">
                                <span className="text-[10px] uppercase tracking-wider flex items-center gap-1 font-semibold">
                                  (+) Comissão {item.shipmentsCount > 0 ? `(${item.shipmentsCount} fretes)` : ''}
                                </span>
                                <div className="flex items-center gap-1.5">
                                  {item.shipmentsCount > 0 && (
                                    <button
                                      type="button"
                                      onClick={() => setAuditingLeaderId(item.user.id)}
                                      className="text-[10px] font-bold text-amber-600 dark:text-amber-400 hover:underline cursor-pointer"
                                      title="Auditar fretes e comissões deste colaborador"
                                    >
                                      Auditar ({item.shipmentsCount})
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => handleOpenEditUserValues(item.user, item.monthKey, item)}
                                    className="font-bold hover:underline flex items-center gap-1 cursor-pointer"
                                    title="Clique para ajustar ou lançar comissão"
                                  >
                                    +{formatBrl(item.commissionEarned)}
                                    <Edit3 className="w-3 h-3 text-slate-400" />
                                  </button>
                                </div>
                              </div>
                              <div className="flex items-center justify-between text-rose-600 dark:text-rose-400">
                                <span className="text-[10px] uppercase tracking-wider">(-) Tributos / INSS (CLT)</span>
                                <button
                                  type="button"
                                  onClick={() => handleOpenEditUserValues(item.user, item.monthKey, item)}
                                  className="font-bold hover:underline flex items-center gap-1 cursor-pointer"
                                  title="Clique para ajustar retenções e tributos CLT"
                                >
                                  -{formatBrl(item.taxesClt)}
                                  <Edit3 className="w-3 h-3 text-slate-400" />
                                </button>
                              </div>
                              <div className="flex items-center justify-between text-orange-600 dark:text-orange-400">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-[10px] uppercase tracking-wider font-semibold">
                                    (-) Adiantamentos / Vales
                                  </span>
                                  {item.activeValesCount !== undefined && item.activeValesCount > 1 && (
                                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-orange-200/80 dark:bg-orange-900/80 text-orange-900 dark:text-orange-200 font-bold font-mono">
                                      {item.activeValesCount} vales
                                    </span>
                                  )}
                                  {item.advanceDate && item.totalAdvances > 0 && (
                                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-orange-100 dark:bg-orange-950/60 text-orange-700 dark:text-orange-300 font-mono font-bold">
                                      {new Date(item.advanceDate + 'T00:00:00').toLocaleDateString('pt-BR')}
                                    </span>
                                  )}
                                  {item.advanceReceiptUrl && (
                                    <button
                                      type="button"
                                      onClick={() => openDocumentInNewTab(item.advanceReceiptUrl!, item.advanceReceiptFileName || 'Comprovante_Transferencia')}
                                      className="inline-flex items-center gap-0.5 text-[9px] font-bold text-blue-600 dark:text-blue-400 hover:underline bg-blue-50 dark:bg-blue-950/40 px-1.5 py-0.5 rounded border border-blue-200 dark:border-blue-800 cursor-pointer"
                                      title="Visualizar Comprovante de Transferência do Adiantamento"
                                    >
                                      <Paperclip className="w-2.5 h-2.5" />
                                      <span>Comprovante</span>
                                      <ExternalLink className="w-2 h-2 opacity-70" />
                                    </button>
                                  )}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleOpenEditUserValues(item.user, item.monthKey, item)}
                                  className="font-bold hover:underline flex items-center gap-1 cursor-pointer"
                                  title="Clique para registrar adiantamentos feitos, data e comprovante"
                                >
                                  -{formatBrl(item.totalAdvances)}
                                  <Edit3 className="w-3 h-3 text-slate-400" />
                                </button>
                              </div>
                              {item.pendingValesCount !== undefined && item.pendingValesCount > 0 && (
                                <div className="flex items-center justify-between text-[10px] text-amber-700 dark:text-amber-300 bg-amber-50/80 dark:bg-amber-950/40 px-2 py-1 rounded-lg border border-amber-200 dark:border-amber-800/60">
                                  <span className="flex items-center gap-1 font-medium">
                                    <Clock className="w-3 h-3 text-amber-500 shrink-0" />
                                    <span>{item.pendingValesCount} {item.pendingValesCount === 1 ? 'vale pendente' : 'vales pendentes'} em Lançamentos Avulsos:</span>
                                  </span>
                                  <span className="font-bold font-mono" title="Aguardando dar baixa (Pago) e anexar comprovante para abater nesta folha">
                                    {formatBrl(item.pendingValesAmount || 0)} (Aguardando Baixa)
                                  </span>
                                </div>
                              )}
                              <div className="pt-1.5 border-t border-slate-200/70 dark:border-slate-800 flex items-center justify-between">
                                <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Folha Líquida Devida</span>
                                <span className="font-black text-purple-600 dark:text-purple-400">{formatBrl(item.netDue)}</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] text-slate-500 uppercase tracking-wider">Total Já Pago</span>
                                <span className="font-bold text-emerald-600 dark:text-emerald-400">{formatBrl(item.totalPaid)}</span>
                              </div>
                            </div>
                          )}

                          {item.regime === 'PJ' && (
                            <div className="bg-slate-50 dark:bg-slate-900/60 p-3 rounded-xl border border-slate-100 dark:border-slate-800 text-xs mb-3 space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] text-slate-500 uppercase tracking-wider">Contrato / Remuneração PJ</span>
                                <button
                                  type="button"
                                  onClick={() => handleOpenEditUserValues(item.user, item.monthKey, item)}
                                  className="font-bold text-slate-800 dark:text-slate-200 hover:text-purple-600 dark:hover:text-purple-400 flex items-center gap-1 cursor-pointer"
                                  title="Clique para editar valor de contrato PJ"
                                >
                                  {formatBrl(item.fixedSalary)}
                                  <Edit3 className="w-3 h-3 text-slate-400" />
                                </button>
                              </div>
                              <div className="flex items-center justify-between text-blue-600 dark:text-blue-400">
                                <span className="text-[10px] uppercase tracking-wider flex items-center gap-1 font-semibold">
                                  (+) Comissão {item.shipmentsCount > 0 ? `(${item.shipmentsCount} fretes)` : ''}
                                </span>
                                <div className="flex items-center gap-1.5">
                                  {item.shipmentsCount > 0 && (
                                    <button
                                      type="button"
                                      onClick={() => setAuditingLeaderId(item.user.id)}
                                      className="text-[10px] font-bold text-amber-600 dark:text-amber-400 hover:underline cursor-pointer"
                                      title="Auditar fretes e comissões deste colaborador"
                                    >
                                      Auditar ({item.shipmentsCount})
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => handleOpenEditUserValues(item.user, item.monthKey, item)}
                                    className="font-bold hover:underline flex items-center gap-1 cursor-pointer"
                                    title="Clique para ajustar ou lançar comissão"
                                  >
                                    +{formatBrl(item.commissionEarned)}
                                    <Edit3 className="w-3 h-3 text-slate-400" />
                                  </button>
                                </div>
                              </div>
                              <div className="flex items-center justify-between text-orange-600 dark:text-orange-400">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-[10px] uppercase tracking-wider font-semibold">
                                    (-) Adiantamentos / Vales
                                  </span>
                                  {item.activeValesCount !== undefined && item.activeValesCount > 1 && (
                                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-orange-200/80 dark:bg-orange-900/80 text-orange-900 dark:text-orange-200 font-bold font-mono">
                                      {item.activeValesCount} vales
                                    </span>
                                  )}
                                  {item.advanceDate && item.totalAdvances > 0 && (
                                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-orange-100 dark:bg-orange-950/60 text-orange-700 dark:text-orange-300 font-mono font-bold">
                                      {new Date(item.advanceDate + 'T00:00:00').toLocaleDateString('pt-BR')}
                                    </span>
                                  )}
                                  {item.advanceReceiptUrl && (
                                    <button
                                      type="button"
                                      onClick={() => openDocumentInNewTab(item.advanceReceiptUrl!, item.advanceReceiptFileName || 'Comprovante_Transferencia')}
                                      className="inline-flex items-center gap-0.5 text-[9px] font-bold text-blue-600 dark:text-blue-400 hover:underline bg-blue-50 dark:bg-blue-950/40 px-1.5 py-0.5 rounded border border-blue-200 dark:border-blue-800 cursor-pointer"
                                      title="Visualizar Comprovante de Transferência do Adiantamento"
                                    >
                                      <Paperclip className="w-2.5 h-2.5" />
                                      <span>Comprovante</span>
                                      <ExternalLink className="w-2 h-2 opacity-70" />
                                    </button>
                                  )}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleOpenEditUserValues(item.user, item.monthKey, item)}
                                  className="font-bold hover:underline flex items-center gap-1 cursor-pointer"
                                  title="Clique para registrar adiantamentos feitos, data e comprovante"
                                >
                                  -{formatBrl(item.totalAdvances)}
                                  <Edit3 className="w-3 h-3 text-slate-400" />
                                </button>
                              </div>
                              {item.pendingValesCount !== undefined && item.pendingValesCount > 0 && (
                                <div className="flex items-center justify-between text-[10px] text-amber-700 dark:text-amber-300 bg-amber-50/80 dark:bg-amber-950/40 px-2 py-1 rounded-lg border border-amber-200 dark:border-amber-800/60">
                                  <span className="flex items-center gap-1 font-medium">
                                    <Clock className="w-3 h-3 text-amber-500 shrink-0" />
                                    <span>{item.pendingValesCount} {item.pendingValesCount === 1 ? 'vale pendente' : 'vales pendentes'} em Lançamentos Avulsos:</span>
                                  </span>
                                  <span className="font-bold font-mono" title="Aguardando dar baixa (Pago) e anexar comprovante para abater nesta folha">
                                    {formatBrl(item.pendingValesAmount || 0)} (Aguardando Baixa)
                                  </span>
                                </div>
                              )}
                              <div className="pt-1.5 border-t border-slate-200/70 dark:border-slate-800 flex items-center justify-between">
                                <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Líquido Devido</span>
                                <span className="font-black text-purple-600 dark:text-purple-400">{formatBrl(item.netDue)}</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] text-slate-500 uppercase tracking-wider">Total Já Pago</span>
                                <span className="font-bold text-emerald-600 dark:text-emerald-400">{formatBrl(item.totalPaid)}</span>
                              </div>
                            </div>
                          )}

                          {item.regime === 'Gestor AG' && (
                            <div className="bg-slate-50 dark:bg-slate-900/60 p-3 rounded-xl border border-slate-100 dark:border-slate-800 text-xs mb-3 space-y-1.5">
                              <div className="grid grid-cols-2 gap-2 pb-1.5 border-b border-slate-200/70 dark:border-slate-800">
                                <div>
                                  <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Embarques CT-e</span>
                                  <span className="font-bold text-slate-800 dark:text-slate-200">{item.shipmentsCount} fretes</span>
                                </div>
                                <div>
                                  <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Lucro Real Agência</span>
                                  <span className="font-bold text-slate-800 dark:text-slate-200">{formatBrl(item.totalNetProfit)}</span>
                                </div>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] text-slate-400 uppercase tracking-wider">Comissão ({item.commissionPct}%)</span>
                                <button
                                  type="button"
                                  onClick={() => handleOpenEditUserValues(item.user, item.monthKey, item)}
                                  className="font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 cursor-pointer"
                                  title="Clique para ajustar comissão"
                                >
                                  {formatBrl(item.commissionEarned)}
                                  <Edit3 className="w-3 h-3 text-slate-400" />
                                </button>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] text-slate-400 uppercase tracking-wider">(+) Salário Fixo Adicional</span>
                                <button
                                  type="button"
                                  onClick={() => handleOpenEditUserValues(item.user, item.monthKey, item)}
                                  className="font-bold text-slate-700 dark:text-slate-300 hover:text-amber-600 flex items-center gap-1 cursor-pointer"
                                  title="Clique para editar salário fixo adicional"
                                >
                                  {formatBrl(item.fixedSalary)}
                                  <Edit3 className="w-3 h-3 text-slate-400" />
                                </button>
                              </div>
                              <div className="flex items-center justify-between text-orange-600 dark:text-orange-400">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-[10px] uppercase tracking-wider font-semibold">
                                    (-) Adiantamentos
                                  </span>
                                  {item.activeValesCount !== undefined && item.activeValesCount > 1 && (
                                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-orange-200/80 dark:bg-orange-900/80 text-orange-900 dark:text-orange-200 font-bold font-mono">
                                      {item.activeValesCount} vales
                                    </span>
                                  )}
                                  {item.advanceDate && item.totalAdvances > 0 && (
                                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-orange-100 dark:bg-orange-950/60 text-orange-700 dark:text-orange-300 font-mono font-bold">
                                      {new Date(item.advanceDate + 'T00:00:00').toLocaleDateString('pt-BR')}
                                    </span>
                                  )}
                                  {item.advanceReceiptUrl && (
                                    <button
                                      type="button"
                                      onClick={() => openDocumentInNewTab(item.advanceReceiptUrl!, item.advanceReceiptFileName || 'Comprovante_Transferencia')}
                                      className="inline-flex items-center gap-0.5 text-[9px] font-bold text-blue-600 dark:text-blue-400 hover:underline bg-blue-50 dark:bg-blue-950/40 px-1.5 py-0.5 rounded border border-blue-200 dark:border-blue-800 cursor-pointer"
                                      title="Visualizar Comprovante de Transferência do Adiantamento"
                                    >
                                      <Paperclip className="w-2.5 h-2.5" />
                                      <span>Comprovante</span>
                                      <ExternalLink className="w-2 h-2 opacity-70" />
                                    </button>
                                  )}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleOpenEditUserValues(item.user, item.monthKey, item)}
                                  className="font-bold hover:underline flex items-center gap-1 cursor-pointer"
                                  title="Clique para registrar adiantamentos feitos, data e comprovante"
                                >
                                  -{formatBrl(item.totalAdvances)}
                                  <Edit3 className="w-3 h-3 text-slate-400" />
                                </button>
                              </div>
                              {item.pendingValesCount !== undefined && item.pendingValesCount > 0 && (
                                <div className="flex items-center justify-between text-[10px] text-amber-700 dark:text-amber-300 bg-amber-50/80 dark:bg-amber-950/40 px-2 py-1 rounded-lg border border-amber-200 dark:border-amber-800/60">
                                  <span className="flex items-center gap-1 font-medium">
                                    <Clock className="w-3 h-3 text-amber-500 shrink-0" />
                                    <span>{item.pendingValesCount} {item.pendingValesCount === 1 ? 'vale pendente' : 'vales pendentes'} em Lançamentos Avulsos:</span>
                                  </span>
                                  <span className="font-bold font-mono" title="Aguardando dar baixa (Pago) e anexar comprovante para abater nesta folha">
                                    {formatBrl(item.pendingValesAmount || 0)} (Aguardando Baixa)
                                  </span>
                                </div>
                              )}
                              <div className="pt-1.5 border-t border-slate-200/70 dark:border-slate-800 flex items-center justify-between">
                                <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Líquido Devido</span>
                                <span className="font-black text-purple-600 dark:text-purple-400">{formatBrl(item.netDue)}</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Total Já Liquidado</span>
                                <span className="font-bold text-emerald-600 dark:text-emerald-400" title="Soma dos vales concedidos no período + baixas já realizadas">{formatBrl(item.totalPaid)}</span>
                              </div>
                            </div>
                          )}

                          {/* Seção de Documentos Obrigatórios por Regime */}
                          <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700/80 text-xs mb-3 space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                                <FileCheck className="w-3.5 h-3.5 text-slate-400" />
                                Documentos ({item.regime}):
                              </span>
                              {item.isCompleted ? (
                                <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                                  <CheckCircle2 className="w-3 h-3" />
                                  Arquivado
                                </span>
                              ) : item.isDocumentPending ? (
                                <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1">
                                  <AlertCircle className="w-3 h-3" />
                                  {item.missingDocsText || 'Pendente'}
                                </span>
                              ) : (
                                <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                                  Anexados ✓
                                </span>
                              )}
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                              {/* Nota Fiscal (Obrigatória para PJ e Gestor AG) */}
                              {(item.regime === 'PJ' || item.regime === 'Gestor AG') && (
                                <div className={`flex items-center justify-between p-1.5 rounded-lg text-[11px] font-medium border ${item.hasInvoice
                                    ? 'bg-purple-50 dark:bg-purple-950/40 border-purple-200 dark:border-purple-800 text-purple-900 dark:text-purple-300'
                                    : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300'
                                  }`}>
                                  <span className="flex items-center gap-1 truncate">
                                    <FileText className="w-3 h-3 shrink-0" />
                                    <span className="truncate">NF: {item.invoiceNumber || (item.hasInvoice ? 'Anexada ✓' : 'Falta NF ⚠️')}</span>
                                  </span>
                                  {item.invoiceFileUrl && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        openDocumentInNewTab(item.invoiceFileUrl!, item.invoiceFileName || 'Nota Fiscal');
                                      }}
                                      className="p-1 hover:bg-purple-200/50 dark:hover:bg-purple-900/50 rounded text-purple-700 dark:text-purple-300 cursor-pointer"
                                      title="Abrir Nota Fiscal em nova aba"
                                    >
                                      <ExternalLink className="w-3 h-3" />
                                    </button>
                                  )}
                                </div>
                              )}

                              {/* Comprovante de Pagamento (Obrigatório para CLT, PJ e Gestor AG) */}
                              <div className={`flex items-center justify-between p-1.5 rounded-lg text-[11px] font-medium border ${item.hasReceipt
                                  ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800 text-blue-900 dark:text-blue-300'
                                  : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300'
                                } ${item.regime === 'CLT' ? 'sm:col-span-2' : ''}`}>
                                <span className="flex items-center gap-1 truncate">
                                  <Receipt className="w-3 h-3 shrink-0" />
                                  <span className="truncate">Comprovante: {item.hasReceipt ? (item.paymentAuthCode ? `Aut ${item.paymentAuthCode.slice(0, 8)}...` : 'Anexado ✓') : 'Falta Comprovante ⚠️'}</span>
                                </span>
                                {item.receiptFileUrl && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openDocumentInNewTab(item.receiptFileUrl!, item.receiptFileName || 'Comprovante');
                                    }}
                                    className="p-1 hover:bg-blue-200/50 dark:hover:bg-blue-900/50 rounded text-blue-700 dark:text-blue-300 cursor-pointer"
                                    title="Abrir Comprovante em nova aba"
                                  >
                                    <ExternalLink className="w-3 h-3" />
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Saldo Restante / A Pagar em Destaque */}
                          <div className={`p-3.5 rounded-xl border mb-3 flex items-center justify-between ${hasPendingBalance
                              ? 'bg-amber-50/70 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/80 text-amber-900 dark:text-amber-200'
                              : 'bg-emerald-50/60 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/60 text-emerald-900 dark:text-emerald-200'
                            }`}>
                            <div>
                              <span className="text-[10px] font-bold uppercase tracking-wider opacity-80 block">
                                {hasPendingBalance ? 'Saldo Pendente de Pagamento' : 'Situação Contábil'}
                              </span>
                              <div className="text-lg font-black tracking-tight mt-0.5">
                                {hasPendingBalance ? formatBrl(item.balancePending) : '100% Em Dia'}
                              </div>
                            </div>

                            {/* Chave PIX Rápida */}
                            {userPix && (
                              <button
                                type="button"
                                onClick={() => handleCopyPix(userPix, item.user.id)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-white dark:bg-slate-800 rounded-lg text-[10px] font-bold border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer shadow-2xs"
                                title="Copiar Chave PIX cadastrada do Colaborador"
                              >
                                {copiedPixId === item.user.id ? (
                                  <>
                                    <Check className="w-3 h-3 text-emerald-600" />
                                    <span className="text-emerald-600 font-bold">Copiado!</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy className="w-3 h-3 text-slate-400" />
                                    <span>Copiar PIX</span>
                                  </>
                                )}
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Ações do Card */}
                        <div className="flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-700/60 flex-wrap sm:flex-nowrap">
                          {/* Botão de Lançar NF / Comprovante */}
                          <button
                            type="button"
                            onClick={() => setSelectedSettlementForDocs(item)}
                            className={`py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-xs flex-1 ${item.isCompleted
                                ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                                : item.isDocumentPending
                                  ? 'bg-purple-600 hover:bg-purple-700 text-white'
                                  : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                              }`}
                            title="Lançar Nota Fiscal e Comprovante de Pagamento"
                          >
                            <Paperclip className="w-3.5 h-3.5" />
                            <span>
                              {item.isCompleted
                                ? 'Ver Documentos'
                                : item.regime === 'CLT'
                                  ? 'Lançar Comprovante'
                                  : 'Lançar NF / Recibo'}
                            </span>
                          </button>

                          {/* Auditoria de Fretes (se houver fretes vinculados, comissão ou Gestor AG) */}
                          {(item.shipmentsCount > 0 || item.commissionEarned > 0 || item.regime === 'Gestor AG') && (
                            <button
                              type="button"
                              onClick={() => setAuditingLeaderId(item.user.id)}
                              className="py-2 px-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600 dark:text-slate-200 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1"
                              title="Auditar fretes e comissões deste colaborador"
                            >
                              <Eye className="w-3.5 h-3.5 text-slate-500" />
                              <span>Auditar{item.shipmentsCount > 0 ? ` (${item.shipmentsCount})` : ''}</span>
                            </button>
                          )}

                          {/* Configurar Regime, Salário e Encargos */}
                          <button
                            type="button"
                            onClick={() => handleOpenEditUserValues(item.user, item.monthKey, item)}
                            className="py-2 px-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600 dark:text-slate-200 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1"
                            title="Configurar regime, salário fixo, tributos CLT e adiantamentos"
                          >
                            <SlidersHorizontal className="w-3.5 h-3.5 text-slate-500" />
                          </button>

                          {/* Botão de Planejar Pagamento */}
                          <button
                            type="button"
                            onClick={() => handleOpenPlanModal(item.user.id, item.balancePending, item.monthKey)}
                            className="py-2 px-3 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer flex items-center justify-center gap-1.5 active:scale-95"
                            title="Planejar ou quitar pagamento para este colaborador"
                          >
                            <CalendarClock className="w-3.5 h-3.5 text-amber-200" />
                            <span>Planejar</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>

          {/* SEÇÃO 4.2: CRONOGRAMA & TABELA DE PAGAMENTOS PLANEJADOS DA FOLHA */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100 dark:border-slate-700/60 flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <CalendarClock className="w-4 h-4 text-amber-500" />
                <h4 className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white">
                  Cronograma & Histórico de Pagamentos da Folha de Pagamento
                </h4>
                <span className="text-[11px] text-slate-400">
                  ({filteredLeaderPayables.length} lançamentos encontrados)
                </span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50 dark:bg-slate-900/60 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="py-3.5 px-4">Colaborador Favorecido</th>
                    <th className="py-3.5 px-4">Tipo / Finalidade</th>
                    <th className="py-3.5 px-4">Dados de Pagamento (PIX)</th>
                    <th className="py-3.5 px-4">Data Prevista / Vencimento</th>
                    <th className="py-3.5 px-4 text-right">Valor Planejado</th>
                    <th className="py-3.5 px-4 text-center">Status</th>
                    <th className="py-3.5 px-4 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
                  {filteredLeaderPayables.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-400">
                        <CalendarClock className="w-10 h-10 mx-auto mb-2 opacity-30 text-amber-500" />
                        <p className="font-semibold text-sm text-slate-600 dark:text-slate-300">
                          Nenhum pagamento programado para colaboradores da folha
                        </p>
                        <p className="text-xs text-slate-400 mt-1">
                          Clique em "+ Planejar Pagamento" para registrar um vencimento, salário ou acerto de comissões.
                        </p>
                      </td>
                    </tr>
                  ) : (
                    filteredLeaderPayables.map(item => {
                      const isPaid = item.status === 'Pago';
                      const isOverdue = item.status === 'Atrasado';

                      return (
                        <tr
                          key={item.id}
                          className="hover:bg-slate-50/80 dark:hover:bg-slate-700/30 transition-colors"
                        >
                          {/* 1. Líder Favorecido */}
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-xl bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 flex items-center justify-center font-black text-xs shrink-0 border border-amber-200 dark:border-amber-800">
                                <Award className="w-4 h-4" />
                              </div>
                              <div>
                                <span className="font-bold text-slate-900 dark:text-white block line-clamp-1">
                                  {item.supplierName}
                                </span>
                                <span className="text-[10px] text-slate-400 block line-clamp-1 max-w-[200px]" title={item.description}>
                                  {item.description}
                                </span>
                              </div>
                            </div>
                          </td>

                          {/* 2. Tipo / Finalidade */}
                          <td className="py-3 px-4">
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 px-2.5 py-0.5 rounded-lg border border-amber-200 dark:border-amber-800">
                              <Briefcase className="w-3 h-3 text-amber-500" />
                              {item.category}
                            </span>
                            {item.notes && (
                              <span className="text-[10px] text-slate-400 block line-clamp-1 max-w-[200px] mt-0.5" title={item.notes}>
                                {item.notes}
                              </span>
                            )}
                          </td>

                          {/* 3. Dados de Pagamento (PIX) */}
                          <td className="py-3 px-4">
                            {item.pixKey ? (
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono text-[11px] text-emerald-700 dark:text-emerald-300 font-bold bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800 max-w-[150px] truncate" title={item.pixKey}>
                                  {item.pixKey}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleCopyPix(item.pixKey, item.id)}
                                  className="text-[10px] font-bold text-blue-600 dark:text-blue-400 hover:underline shrink-0 cursor-pointer"
                                  title="Copiar Chave PIX"
                                >
                                  {copiedPixId === item.id ? 'Copiado!' : 'Copiar'}
                                </button>
                              </div>
                            ) : (
                              <span className="text-[11px] text-slate-400 italic">PIX não informado</span>
                            )}
                          </td>

                          {/* 4. Data Prevista / Vencimento */}
                          <td className="py-3 px-4 whitespace-nowrap">
                            <span className={`font-semibold ${isOverdue ? 'text-rose-600 dark:text-rose-400 font-bold' : 'text-slate-700 dark:text-slate-300'}`}>
                              {new Date(item.dueDate + 'T00:00:00').toLocaleDateString('pt-BR')}
                            </span>
                            {isPaid && item.paymentDate && (
                              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 block">
                                Baixa: {new Date(item.paymentDate + 'T00:00:00').toLocaleDateString('pt-BR')}
                              </span>
                            )}
                          </td>

                          {/* 5. Valor Planejado */}
                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            <span className="font-black text-sm text-emerald-600 dark:text-emerald-400 tracking-tight">
                              {formatBrl(item.payableAmount)}
                            </span>
                          </td>

                          {/* 6. Status */}
                          <td className="py-3 px-4 text-center whitespace-nowrap">
                            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${isPaid
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800'
                                : isOverdue
                                  ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border-rose-300 dark:border-rose-800'
                                  : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-300 dark:border-amber-800'
                              }`}>
                              {isPaid && <CheckCircle2 className="w-3 h-3" />}
                              {isOverdue && <AlertCircle className="w-3 h-3" />}
                              {!isPaid && !isOverdue && <Clock className="w-3 h-3" />}
                              <span>{item.status}</span>
                            </span>
                          </td>

                          {/* 7. Ações */}
                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1.5">
                              {isPaid ? (
                                <>
                                  {item.receiptFileUrl && (
                                    <button
                                      type="button"
                                      onClick={() => openDocumentInNewTab(item.receiptFileUrl!, `Comprovante_${item.supplierName}`)}
                                      className="p-1.5 rounded-lg bg-purple-50 hover:bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300 transition-colors cursor-pointer border border-purple-200 dark:border-purple-800"
                                      title="Visualizar Comprovante de Pagamento"
                                    >
                                      <Receipt className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => handleOpenSettlementModalForLeader(item)}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600 dark:text-slate-200 transition-all cursor-pointer"
                                    title="Editar comprovante ou dados da baixa"
                                  >
                                    <Edit3 className="w-3 h-3" />
                                    <span>Editar Baixa</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => onUpdateStatus(
                                      item.id,
                                      FinancialTransactionStatus.Pendente
                                    )}
                                    className="px-2 py-1 rounded-lg text-[11px] font-medium text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                                    title="Reabrir lançamento para Pendente"
                                  >
                                    Reabrir
                                  </button>
                                </>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleOpenSettlementModalForLeader(item)}
                                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-[11px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-all cursor-pointer"
                                  title="Confirmar quitação deste pagamento e anexar comprovante"
                                >
                                  <Check className="w-3 h-3" />
                                  <span>Dar Baixa</span>
                                </button>
                              )}

                              {/* Botão de Excluir Lançamento Planejado */}
                              {onDeleteTransaction && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (confirm(`Deseja realmente remover este lançamento de ${formatBrl(item.payableAmount)} para ${item.supplierName}?`)) {
                                      onDeleteTransaction(item.id);
                                    }
                                  }}
                                  className="p-1 rounded-lg hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                                  title="Remover planejamento"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Banner de Contas em Atraso Ativo */}
      {statusFilter === 'Atrasado' && (
        <div className="p-4 rounded-2xl bg-rose-50/90 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/80 flex items-center justify-between flex-wrap gap-3 shadow-xs">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-rose-100 dark:bg-rose-900/60 text-rose-600 dark:text-rose-300 rounded-xl">
              <AlertCircle className="w-5 h-5" />
            </div>
            <div>
              <span className="font-bold text-sm text-rose-900 dark:text-rose-200 block">
                Contas em Atraso • Período Selecionado
              </span>
              <span className="text-xs text-rose-700 dark:text-rose-300">
                Total de <strong>{overdueLateFees.count}</strong> {overdueLateFees.count === 1 ? 'título vencido' : 'títulos vencidos'} • Total a Pagar: <strong>{formatBrl(kpiOverdue)}</strong>
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-white dark:bg-slate-900 px-3 py-1.5 rounded-xl border border-rose-200 dark:border-rose-800/80 shadow-2xs">
              <TrendingUp className="w-4 h-4 text-rose-500" />
              <div className="text-right">
                <span className="text-[10px] text-slate-400 block leading-tight font-medium">Juros & Multas Destacados</span>
                <span className="text-xs font-black text-rose-600 dark:text-rose-400 font-mono">
                  +{formatBrl(overdueLateFees.total)}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setStatusFilter('all')}
              className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-xs active:scale-95"
            >
              Limpar Filtro
            </button>
          </div>
        </div>
      )}

      {/* 5. TABELA PADRÃO DE CONTAS A PAGAR (TODAS, NOTAS FISCAIS OU AVULSOS) */}
      {activeSection !== 'leaders' && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50 dark:bg-slate-900/60 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="py-3.5 px-4">Tipo / Documento</th>
                  {activeSection === 'taxes' && (
                    <th className="py-3.5 px-4 text-center whitespace-nowrap">Mês de Competência</th>
                  )}
                  <th className="py-3.5 px-4">{activeSection === 'taxes' ? 'Órgão Arrecadador / Favorecido' : 'Fornecedor / Favorecido'}</th>
                  <th className="py-3.5 px-4">Classificação / Centro de Custo</th>
                  <th className="py-3.5 px-4">Vencimento & Entrada</th>
                  <th className="py-3.5 px-4 text-right">Valor Original</th>
                  <th className="py-3.5 px-4 text-right">Valor a Pagar (Real)</th>
                  <th className="py-3.5 px-4 text-center">Status</th>
                  <th className="py-3.5 px-4 text-center">{activeSection === 'taxes' ? 'Documentos (Guia • Barra • Comprovante)' : 'Tríade Documental (NF • Boleto • Comprovante)'}</th>
                  <th className="py-3.5 px-4 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
                {consolidatedList.length === 0 ? (
                  <tr>
                    <td colSpan={activeSection === 'taxes' ? 10 : 9} className="py-12 text-center text-slate-400">
                      <ArrowDownCircle className="w-10 h-10 mx-auto mb-2 opacity-30" />
                      <p className="font-semibold text-sm text-slate-600 dark:text-slate-300">Nenhuma conta a pagar encontrada</p>
                      <p className="text-xs text-slate-400 mt-1">Ajuste os filtros ou cadastre um novo lançamento.</p>
                    </td>
                  </tr>
                ) : (
                  consolidatedList.map((item) => {
                    const isPaid = item.status === 'Pago';
                    const isOverdue = item.status === 'Atrasado';

                    return (
                      <tr
                        key={item.id}
                        className="hover:bg-slate-50/80 dark:hover:bg-slate-700/30 transition-colors"
                      >
                        {/* 1. Tipo / Documento */}
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2.5">
                            {item.kind === 'invoice' ? (
                              item.boletoUrl ? (
                                <div className="p-2 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 rounded-xl shrink-0 border border-emerald-300 dark:border-emerald-800" title="Boleto Bancário vinculado à Nota Fiscal">
                                  <Receipt className="w-4 h-4" />
                                </div>
                              ) : (
                                <div className="p-2 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 rounded-xl shrink-0" title="Nota Fiscal de Entrada">
                                  <FileText className="w-4 h-4" />
                                </div>
                              )
                            ) : item.kind === 'cte' ? (
                              <div className="p-2 bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 rounded-xl shrink-0 border border-indigo-200 dark:border-indigo-800" title="Conhecimento de Transporte (Doc CT-e)">
                                <Truck className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                              </div>
                            ) : item.kind === 'leader' ? (
                              <div className="p-2 bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 rounded-xl shrink-0 border border-amber-200 dark:border-amber-800" title="Pagamento / Planejamento de Agenciador Líder">
                                <Award className="w-4 h-4" />
                              </div>
                            ) : item.kind === 'tax' ? (
                              <div className={`p-2 rounded-xl shrink-0 border ${TAX_TYPE_CONFIG[item.originalItem?.taxType as TaxType]?.iconBg || 'bg-purple-100 dark:bg-purple-950/60'} border-purple-200 dark:border-purple-800`} title="Guia de Imposto / Tributo">
                                <Landmark className={`w-4 h-4 ${TAX_TYPE_CONFIG[item.originalItem?.taxType as TaxType]?.iconColor || 'text-purple-600 dark:text-purple-400'}`} />
                              </div>
                            ) : (
                              isValeTransaction(item.originalItem || item) ? (
                                <div className="p-2 bg-orange-100 dark:bg-orange-950/60 text-orange-700 dark:text-orange-300 rounded-xl shrink-0 border border-orange-200 dark:border-orange-800" title="Vale / Adiantamento Salarial">
                                  <Wallet className="w-4 h-4" />
                                </div>
                              ) : (
                                <div className="p-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-xl shrink-0" title="Lançamento Avulso">
                                  <Tag className="w-4 h-4" />
                                </div>
                              )
                            )}
                            <div>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {item.kind === 'invoice' && item.originalItem?.id && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-300 font-mono font-bold border border-blue-200 dark:border-blue-800 shrink-0">
                                    {item.originalItem.id}
                                  </span>
                                )}
                                {item.kind === 'invoice' && (
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold border shrink-0 ${item.originalItem?.documentType === 'Fatura'
                                      ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/60 dark:text-purple-300 border-purple-200 dark:border-purple-800'
                                      : 'bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-300 border-blue-200 dark:border-blue-800'
                                    }`}>
                                    {item.originalItem?.documentType === 'Fatura' ? 'Fatura' : 'NF'}
                                  </span>
                                )}
                                {item.kind === 'cte' && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded font-bold border bg-indigo-100 text-indigo-800 dark:bg-indigo-950/80 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800 shrink-0">
                                    Doc CT-e
                                  </span>
                                )}
                                {item.kind === 'leader' && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded font-bold border bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 border-amber-200 dark:border-amber-800 shrink-0">
                                    Agenciador Líder
                                  </span>
                                )}
                                {item.kind === 'tax' && (
                                  <span className={`text-[10px] px-2 py-0.5 rounded font-bold border shrink-0 ${TAX_TYPE_CONFIG[item.originalItem?.taxType as TaxType]?.badge || 'bg-purple-100 text-purple-800 dark:bg-purple-950/80 dark:text-purple-300 border-purple-200 dark:border-purple-800'}`}>
                                    {item.originalItem?.taxTypeName || TAX_TYPE_CONFIG[item.originalItem?.taxType as TaxType]?.label || 'Guia Tributária'}
                                  </span>
                                )}
                                {(item.taxPeriod || item.originalItem?.taxPeriod) && (
                                  <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded font-bold border bg-indigo-50 text-indigo-700 dark:bg-indigo-950/80 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800 shrink-0 font-mono" title={`Mês de Competência: ${item.taxPeriod || item.originalItem?.taxPeriod}`}>
                                    <Calendar className="w-3 h-3 text-indigo-500" />
                                    <span>Comp: {item.taxPeriod || item.originalItem?.taxPeriod}</span>
                                  </span>
                                )}
                                {item.kind === 'manual' && isValeTransaction(item.originalItem || item) && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded font-bold border bg-orange-100 text-orange-800 dark:bg-orange-950/80 dark:text-orange-300 border-orange-200 dark:border-orange-800 shrink-0">
                                    Vale / Adiantamento Salarial
                                  </span>
                                )}
                                <span className="font-bold text-slate-900 dark:text-white block">
                                  {item.docNumber}
                                </span>
                                {item.boletoUrl && (
                                  <span className="inline-flex items-center gap-0.5 text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                                    Boleto Vinculado
                                  </span>
                                )}
                              </div>
                              <span className="text-[10px] text-slate-400 block line-clamp-1 max-w-[170px]">
                                {item.boletoUrl ? `Boleto • ${item.title}` : item.title}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* 1.1 Mês de Competência (visível na aba de Impostos & Tributos) */}
                        {activeSection === 'taxes' && (
                          <td className="py-3 px-4 text-center whitespace-nowrap">
                            {(item.taxPeriod || item.originalItem?.taxPeriod) ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 font-mono shadow-2xs">
                                <Calendar className="w-3.5 h-3.5 text-indigo-500" />
                                <span>{item.taxPeriod || item.originalItem?.taxPeriod}</span>
                              </span>
                            ) : (
                              <span className="text-slate-400 text-xs font-mono">-</span>
                            )}
                          </td>
                        )}

                        {/* 2. Fornecedor / Favorecido */}
                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-800 dark:text-slate-100 line-clamp-1 max-w-[200px]" title={item.entityName}>
                            {item.entityName}
                          </div>
                          {item.kind === 'invoice' && item.originalItem.supplierCnpjCpf && (
                            <span className="text-[10px] text-slate-400 font-mono block">
                              {item.originalItem.supplierCnpjCpf}
                            </span>
                          )}
                          {item.kind === 'leader' && item.pixKey && (
                            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono block">
                              PIX: {item.pixKey}
                            </span>
                          )}
                          {item.kind === 'cte' && item.pixKey && (
                            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono block">
                              PIX: {item.pixKey}
                            </span>
                          )}
                          {item.kind === 'cte' && item.details && (
                            <span className="text-[10px] text-slate-400 block line-clamp-1" title={item.details}>
                              {item.details}
                            </span>
                          )}
                        </td>

                        {/* 3. Classificação & Linha Digitável */}
                        <td className="py-3 px-4">
                          <span className="text-slate-700 dark:text-slate-300 font-medium line-clamp-1 max-w-[200px]" title={item.categoryOrCenter}>
                            {item.categoryOrCenter}
                          </span>
                          {item.originalItem?.paymentDetails ? (
                            <div className="flex items-center gap-1 mt-0.5 max-w-[200px]">
                              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono truncate" title={item.originalItem.paymentDetails}>
                                {item.originalItem.paymentDetails}
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  navigator.clipboard.writeText(item.originalItem.paymentDetails);
                                  alert('Linha digitável / código copiado para a área de transferência!');
                                }}
                                className="text-[9px] font-bold text-blue-600 dark:text-blue-400 hover:underline shrink-0 cursor-pointer"
                                title="Copiar linha digitável / código de barras"
                              >
                                Copiar
                              </button>
                            </div>
                          ) : item.details ? (
                            <span className="text-[10px] text-slate-400 block line-clamp-1 max-w-[200px]" title={item.details}>
                              {item.details}
                            </span>
                          ) : null}
                        </td>

                        {/* 4. Vencimento com visto verde & Data de Digitação / Entrada */}
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            {isPaid ? (
                              <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-bold" title="Conta liquidada no prazo">
                                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                                <span>{new Date(item.dueDate + 'T00:00:00').toLocaleDateString('pt-BR')}</span>
                              </span>
                            ) : isOverdue ? (
                              <span className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400 font-black" title="Conta em atraso de vencimento">
                                <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 animate-pulse" />
                                <span>{new Date(item.dueDate + 'T00:00:00').toLocaleDateString('pt-BR')}</span>
                                <span className="text-[9px] px-1.5 py-0.2 rounded font-black bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200">
                                  Atrasado
                                </span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-slate-700 dark:text-slate-200 font-semibold">
                                <Clock className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                                <span>{new Date(item.dueDate + 'T00:00:00').toLocaleDateString('pt-BR')}</span>
                              </span>
                            )}
                          </div>
                          {item.entryDate && (
                            <span className="text-[10px] text-slate-400 block mt-0.5">
                              ✍️ Digitado: {new Date(item.entryDate + 'T00:00:00').toLocaleDateString('pt-BR')}
                            </span>
                          )}
                        </td>

                        {/* 5. Valor Total */}
                        <td className="py-3 px-4 text-right whitespace-nowrap text-slate-500 dark:text-slate-400">
                          {formatBrl(item.totalAmount)}
                        </td>

                        {/* 6. Valor a Pagar (Real com Juros / Abatimento) */}
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          {(() => {
                            const itemFees = getItemLateFees(item, todayStr);
                            return (
                              <>
                                <span className="font-black text-sm text-emerald-600 dark:text-emerald-400 tracking-tight block">
                                  {formatBrl(item.payableAmount)}
                                </span>
                                {itemFees.total > 0 && (
                                  <span
                                    className="text-[9px] text-rose-600 dark:text-rose-400 font-bold block"
                                    title={`Multa: ${formatBrl(itemFees.fine)} | Juros Mora: ${formatBrl(itemFees.interest)} (${itemFees.overdueDays} dias em atraso)`}
                                  >
                                    +{formatBrl(itemFees.total)} juros/multa
                                  </span>
                                )}
                                {item.originalItem?.discountAmount > 0 && (
                                  <span className="text-[9px] text-emerald-600 font-bold block">
                                    -{formatBrl(item.originalItem.discountAmount)} abat.
                                  </span>
                                )}
                                {item.payableAmount !== item.totalAmount && itemFees.total === 0 && !item.originalItem?.discountAmount && (
                                  <span className="text-[9px] text-slate-400 block line-through">
                                    Original: {formatBrl(item.totalAmount)}
                                  </span>
                                )}
                              </>
                            );
                          })()}
                        </td>

                        {/* 7. Status */}
                        <td className="py-3 px-4 text-center whitespace-nowrap">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${isPaid
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800'
                              : isOverdue
                                ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border-rose-300 dark:border-rose-800'
                                : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-300 dark:border-amber-800'
                            }`}>
                            {isPaid && <CheckCircle2 className="w-3 h-3" />}
                            {isOverdue && <AlertCircle className="w-3 h-3" />}
                            {!isPaid && !isOverdue && <Clock className="w-3 h-3" />}
                            <span>{item.status}</span>
                          </span>
                          {item.isReconciled && (
                            <div className="mt-1 flex items-center justify-center">
                              <span
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-blue-50 text-blue-700 dark:bg-blue-950/70 dark:text-blue-300 border border-blue-200 dark:border-blue-800 shadow-2xs"
                                title="🔒 Auditado e Fechado com Extrato Bancário"
                              >
                                <Lock className="w-2.5 h-2.5 text-blue-600 dark:text-blue-400" />
                                <span>Auditado OFX</span>
                              </span>
                            </div>
                          )}
                        </td>

                        {/* 8. Tríade de Conformidade Documental: NF = [OK] Boleto = [OK] Comprovad pag */}
                        <td className="py-3 px-4 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1.5 flex-wrap max-w-[280px] mx-auto">
                            {/* Chip 1: NF, CT-e ou Guia Tributária */}
                            {item.kind === 'tax' ? (
                              item.documentUrl ? (
                                <button
                                  type="button"
                                  onClick={() => openDocumentInNewTab(item.documentUrl!, item.docNumber)}
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border transition-colors cursor-pointer ${TAX_TYPE_CONFIG[item.originalItem?.taxType as TaxType]?.badge || 'bg-purple-100 text-purple-800 dark:bg-purple-900/60 dark:text-purple-300 border-purple-200 dark:border-purple-800'}`}
                                  title="Visualizar Guia de Imposto (PDF)"
                                >
                                  <Landmark className="w-3 h-3" />
                                  <span>Guia: OK</span>
                                  <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                                </button>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500 border border-slate-200 dark:border-slate-700" title="Guia não anexada">
                                  <Landmark className="w-3 h-3 opacity-40" />
                                  <span>Guia: -</span>
                                </span>
                              )
                            ) : item.documentUrl ? (
                              <button
                                type="button"
                                onClick={() => openDocumentInNewTab(item.documentUrl!, item.docNumber)}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 hover:bg-blue-200 text-blue-800 dark:bg-blue-900/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800 transition-colors cursor-pointer"
                                title={item.kind === 'cte' ? "Visualizar Conhecimento de Transporte (CT-e)" : "Visualizar Nota Fiscal"}
                              >
                                <FileText className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                                <span>{item.kind === 'cte' ? 'CT-e: OK' : 'NF: OK'}</span>
                                <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                              </button>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500 border border-slate-200 dark:border-slate-700" title={item.kind === 'cte' ? "CT-e não anexado" : "Nota Fiscal não anexada"}>
                                <FileText className="w-3 h-3 opacity-40" />
                                <span>{item.kind === 'cte' ? 'CT-e: -' : 'NF: -'}</span>
                              </span>
                            )}

                            {/* Chip 2: Boleto, Contrato de Frete ou Código de Barras */}
                            {item.kind === 'tax' ? (
                              item.pixKey ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    navigator.clipboard.writeText(item.pixKey!.replace(/[\s.-]/g, ''));
                                    showToast('Código de barras copiado para a área de transferência!', 'success');
                                  }}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/80 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 transition-colors cursor-pointer"
                                  title={`Copiar código de barras da guia: ${item.pixKey}`}
                                >
                                  <Barcode className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
                                  <span>Barra: OK</span>
                                  <Copy className="w-2.5 h-2.5 opacity-60" />
                                </button>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500 border border-slate-200 dark:border-slate-700">
                                  <span>Barra: -</span>
                                </span>
                              )
                            ) : item.kind === 'cte' ? (
                              item.contractUrl ? (
                                <button
                                  type="button"
                                  onClick={() => openDocumentInNewTab(item.contractUrl!, `Contrato_${item.docNumber}`)}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-100 hover:bg-indigo-200 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-800 transition-colors cursor-pointer"
                                  title="Visualizar Contrato / Carta Frete"
                                >
                                  <FileText className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
                                  <span>Contrato: OK</span>
                                  <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                                </button>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500 border border-slate-200 dark:border-slate-700" title="Contrato / Carta Frete não anexado">
                                  <FileText className="w-3 h-3 opacity-40" />
                                  <span>Contrato: -</span>
                                </span>
                              )
                            ) : item.boletoUrl ? (
                              <button
                                type="button"
                                onClick={() => openDocumentInNewTab(item.boletoUrl!, `Boleto_${item.docNumber}`)}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 hover:bg-emerald-200 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 transition-colors cursor-pointer"
                                title="Visualizar Boleto Bancário"
                              >
                                <Receipt className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                                <span>Boleto: OK</span>
                                <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                              </button>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500 border border-slate-200 dark:border-slate-700" title="Boleto não anexado">
                                <Receipt className="w-3 h-3 opacity-40" />
                                <span>Boleto: -</span>
                              </span>
                            )}

                            {/* Chip 3: Comprovante de Pagamento (Com Baixa Automática para Impostos) */}
                            {item.receiptUrl ? (
                              <button
                                type="button"
                                onClick={() => openDocumentInNewTab(item.receiptUrl!, `Comprovante_${item.docNumber}`)}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 hover:bg-emerald-200 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 transition-colors cursor-pointer shadow-xs"
                                title="Visualizar Comprovante de Quitação"
                              >
                                <FileCheck className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                                <span>Comprov: OK</span>
                                <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                              </button>
                            ) : item.kind === 'tax' ? (
                              <label
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-amber-500 hover:bg-amber-600 text-white dark:bg-amber-600 dark:hover:bg-amber-500 border border-amber-600 transition-all cursor-pointer shadow-xs active:scale-95"
                                title="Anexe o comprovante Sicredi/Banco: o sistema lerá e mudará para PAGO automaticamente!"
                              >
                                <Upload className="w-3 h-3 text-white" />
                                <span>Anexar Comprovante (Baixa Auto)</span>
                                <input
                                  type="file"
                                  accept="application/pdf,image/*"
                                  className="hidden"
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) handleAttachReceiptToTax(item.originalItem.id, item.payableAmount, file);
                                  }}
                                />
                              </label>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleOpenSettlementModal(item)}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 hover:bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-300 dark:border-amber-700/80 transition-colors cursor-pointer"
                                title="Clique para anexar comprovante Sicredi e registrar baixa"
                              >
                                <Clock className="w-3 h-3 text-amber-500" />
                                <span>Comprov: Pendente</span>
                              </button>
                            )}
                          </div>
                        </td>

                        {/* 9. Ações: Dar Baixa / Editar Comprovante / Reabrir */}
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            {isPaid ? (
                              <>
                                {/* Se já está pago e possui comprovante anexado, atalho rápido para ver */}
                                {item.receiptUrl && (
                                  <button
                                    type="button"
                                    onClick={() => openDocumentInNewTab(item.receiptUrl!, `Comprovante_${item.docNumber}`)}
                                    className="p-1.5 rounded-lg bg-purple-50 hover:bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:hover:bg-purple-900/60 dark:text-purple-300 transition-colors cursor-pointer border border-purple-200 dark:border-purple-800/60"
                                    title="Visualizar Comprovante de Pagamento"
                                  >
                                    <Receipt className="w-3.5 h-3.5" />
                                  </button>
                                )}

                                {/* Editar Baixa / Comprovante */}
                                <button
                                  type="button"
                                  onClick={() => handleOpenSettlementModal(item)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600 dark:text-slate-200 transition-all cursor-pointer"
                                  title="Editar data de pagamento, dados da baixa ou comprovante anexado"
                                >
                                  <Edit3 className="w-3 h-3" />
                                  <span>Editar Baixa</span>
                                </button>

                                {/* Reabrir lançamento para Pendente ou Bloqueio por Conciliação */}
                                {item.isReconciled ? (
                                  <span
                                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 cursor-not-allowed border border-slate-200 dark:border-slate-700 select-none"
                                    title="🔒 Título Conciliado e Fechado: Este lançamento já foi auditado e conciliado com o extrato bancário. Desconcilie primeiro no módulo de Conciliação Bancária para liberar a reabertura."
                                  >
                                    <Lock className="w-3 h-3 text-amber-500" />
                                    <span>Conciliado</span>
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => handleReopenItem(item)}
                                    className="px-2 py-1 rounded-lg text-[11px] font-medium text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-all cursor-pointer"
                                    title="Reabrir lançamento para Pendente"
                                  >
                                    Reabrir
                                  </button>
                                )}
                              </>
                            ) : (
                              /* Botão principal de Dar Baixa com opção de anexar comprovante */
                              <button
                                type="button"
                                onClick={() => handleOpenSettlementModal(item)}
                                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-[11px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-all cursor-pointer"
                                title="Dar Baixa e anexar comprovante de pagamento"
                              >
                                <Check className="w-3 h-3" />
                                <span>Dar Baixa</span>
                              </button>
                            )}

                            {/* Botão de Editar Guia de Imposto */}
                            {item.kind === 'tax' && (
                              <button
                                type="button"
                                onClick={() => handleOpenTaxManualModal(item)}
                                className="p-1.5 rounded-lg bg-purple-50 hover:bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:hover:bg-purple-900/60 dark:text-purple-300 transition-colors cursor-pointer border border-purple-200 dark:border-purple-800"
                                title="Editar dados da Guia de Imposto"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                            )}

                            {/* Botão de Excluir Lançamento (Impostos ou Avulsos) */}
                            {item.kind === 'tax' && (
                              <button
                                type="button"
                                onClick={() => handleOpenDeleteTaxModal(item)}
                                className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 dark:bg-rose-950/40 dark:hover:bg-rose-900/60 dark:text-rose-400 transition-colors cursor-pointer border border-rose-200 dark:border-rose-800"
                                title="Excluir Lançamento da Guia Tributária"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}

                            {item.kind === 'manual' && !item.isReconciled && (
                              <button
                                type="button"
                                onClick={() => handleOpenDeleteTaxModal(item)}
                                className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 dark:bg-rose-950/40 dark:hover:bg-rose-900/60 dark:text-rose-400 transition-colors cursor-pointer border border-rose-200 dark:border-rose-800"
                                title="Excluir Lançamento Avulso"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
        </>
      )}

      {/* 6. MODAL DE NOVO LANÇAMENTO MANUAL AVULSO GERAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-700 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between mb-4 border-b border-slate-100 dark:border-slate-700 pb-3">
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Plus className="w-5 h-5 text-blue-600" />
                {manualEntryType === 'vale' ? 'Novo Lançamento Avulso - Vale / Adiantamento' : manualEntryType === 'folha' ? 'Novo Lançamento Avulso - Folha de Pagamento / Holerite' : 'Novo Lançamento Avulso - Contas a Pagar'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitManual} className="space-y-4">
              {/* Tipo de Lançamento Avulso */}
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">Tipo de Lançamento *</label>
                <div className="grid grid-cols-3 gap-2 p-1 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                  <button
                    type="button"
                    onClick={() => setManualEntryType('despesa')}
                    className={`py-2 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${manualEntryType === 'despesa'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'}`}
                  >
                    <Receipt className="w-3.5 h-3.5" />
                    <span>Despesa Avulsa</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setManualEntryType('vale');
                      if (!manualValeMonthKey) {
                        setManualValeMonthKey(payrollSelectedMonth === 'last' ? lastMonthPrefix : currentMonthPrefix);
                      }
                    }}
                    className={`py-2 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${manualEntryType === 'vale'
                      ? 'bg-orange-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'}`}
                  >
                    <Wallet className="w-3.5 h-3.5" />
                    <span>Vale / Adiantamento</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setManualEntryType('folha');
                      if (!manualValeMonthKey) {
                        setManualValeMonthKey(payrollSelectedMonth === 'last' ? lastMonthPrefix : currentMonthPrefix);
                      }
                    }}
                    className={`py-2 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${manualEntryType === 'folha'
                      ? 'bg-purple-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'}`}
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>Folha / Holerite</span>
                  </button>
                </div>
              </div>

              {manualEntryType === 'vale' && (() => {
                const selValeUser = payrollUsers.find(u => u.id === manualValeUserId);
                const valePix = selValeUser ? (selValeUser.phone || selValeUser.corporateEmail || selValeUser.email || '') : '';
                const monthOptions = Array.from(new Set([
                  lastMonthPrefix,
                  currentMonthPrefix,
                  addMonthsToMonthKey(currentMonthPrefix, 1),
                  addMonthsToMonthKey(currentMonthPrefix, 2),
                  ...(manualValeMonthKey ? [manualValeMonthKey] : []),
                ])).sort();

                const parsedValePreview = parseBrazilianCurrency(amount);

                return (
                  <div className="p-3 rounded-xl bg-orange-50/70 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800/60 space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Colaborador (Folha) *</label>
                        <select
                          required
                          value={manualValeUserId}
                          onChange={(e) => setManualValeUserId(e.target.value)}
                          className="w-full px-2.5 py-2 rounded-xl text-xs border border-orange-300 dark:border-orange-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white outline-none cursor-pointer focus:ring-2 focus:ring-orange-500 font-medium"
                        >
                          <option value="">Selecione...</option>
                          {payrollUsers.map(u => (
                            <option key={u.id} value={u.id}>
                              {u.name} ({getUserRegime(u)})
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Descontar a Partir de *</label>
                        <select
                          required
                          value={manualValeMonthKey || currentMonthPrefix}
                          onChange={(e) => setManualValeMonthKey(e.target.value)}
                          className="w-full px-2.5 py-2 rounded-xl text-xs border border-orange-300 dark:border-orange-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white outline-none cursor-pointer focus:ring-2 focus:ring-orange-500 font-medium"
                        >
                          {monthOptions.map(mk => (
                            <option key={mk} value={mk}>
                              {formatMonthKeyToLabel(mk)}
                              {mk === currentMonthPrefix ? ' (Mês Atual)' : mk === lastMonthPrefix ? ' (Mês Anterior)' : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Parcelamento *</label>
                        <select
                          value={manualInstallmentsCount}
                          onChange={(e) => setManualInstallmentsCount(parseInt(e.target.value, 10))}
                          className="w-full px-2.5 py-2 rounded-xl text-xs border border-orange-300 dark:border-orange-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white outline-none cursor-pointer focus:ring-2 focus:ring-orange-500 font-bold"
                        >
                          <option value={1}>1x (À vista na folha)</option>
                          <option value={2}>2x parcelado</option>
                          <option value={3}>3x parcelado</option>
                          <option value={4}>4x parcelado</option>
                          <option value={5}>5x parcelado</option>
                          <option value={6}>6x parcelado</option>
                          <option value={8}>8x parcelado</option>
                          <option value={10}>10x parcelado</option>
                          <option value={12}>12x parcelado</option>
                        </select>
                      </div>
                    </div>

                    {manualInstallmentsCount > 1 && parsedValePreview > 0 && (
                      <div className="p-2.5 rounded-xl bg-orange-100/90 dark:bg-orange-950/80 border border-orange-300 dark:border-orange-800 text-[11px] space-y-1.5">
                        <div className="flex items-center justify-between font-bold text-orange-900 dark:text-orange-200">
                          <span className="flex items-center gap-1">
                            <Layers className="w-3.5 h-3.5 text-orange-600 shrink-0" />
                            <span>Cronograma das {manualInstallmentsCount} Parcelas nas Folhas:</span>
                          </span>
                          <span className="font-mono text-xs">{formatBrl(parsedValePreview)}</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-36 overflow-y-auto pr-1">
                          {calculateInstallments(parsedValePreview, manualInstallmentsCount, manualValeMonthKey || currentMonthPrefix).map((inst, idx) => (
                            <div key={idx} className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-orange-200/80 dark:border-orange-700/80 text-[11px]">
                              <span className="text-slate-600 dark:text-slate-400 font-medium">
                                Parcela {inst.installmentNumber}/{inst.totalInstallments}
                              </span>
                              <span className="font-bold text-orange-700 dark:text-orange-300 font-mono">
                                {formatBrl(inst.amount)} • {formatMonthKeyToLabel(inst.monthKey)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {valePix && (
                      <div className="text-[11px] text-slate-600 dark:text-slate-400">
                        Chave PIX cadastrada: <strong className="text-slate-800 dark:text-slate-200 font-mono">{valePix}</strong>
                      </div>
                    )}
                    <div className="flex items-start gap-1.5 text-[11px] text-orange-800 dark:text-orange-300 leading-snug">
                      <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <span>
                        {manualInstallmentsCount > 1
                          ? `Serão geradas ${manualInstallmentsCount} parcelas como Pendentes. Cada parcela só abaterá na folha do respectivo mês após Dar Baixa (Pago) com comprovante anexado.`
                          : 'O vale fica Pendente em Contas a Pagar. Somente após Dar Baixa (Pago) e anexar o comprovante ele será somado em (-) Adiantamentos na Folha.'}
                      </span>
                    </div>
                  </div>
                );
              })()}

              {manualEntryType === 'folha' && (() => {
                const selFolhaUser = payrollUsers.find(u => u.id === manualValeUserId);
                const folhaPix = selFolhaUser ? (selFolhaUser.phone || selFolhaUser.corporateEmail || selFolhaUser.email || '') : '';
                const monthOptions = Array.from(new Set([
                  lastMonthPrefix,
                  currentMonthPrefix,
                  addMonthsToMonthKey(currentMonthPrefix, 1),
                  addMonthsToMonthKey(currentMonthPrefix, 2),
                  ...(manualValeMonthKey ? [manualValeMonthKey] : []),
                ])).sort();

                const compMonth = manualValeMonthKey || currentMonthPrefix;
                const userValesInMonth = (transactions || []).filter(t =>
                  t.type === 'payable' &&
                  isValeTransaction(t) &&
                  t.status !== FinancialTransactionStatus.Cancelado &&
                  getValeDiscountMonthKey(t) === compMonth &&
                  (
                    (t.ownerId && t.ownerId === manualValeUserId) ||
                    (!t.ownerId && selFolhaUser && t.supplierOrClientName?.toLowerCase().includes(selFolhaUser.name.toLowerCase()))
                  )
                );

                const totalValesInMonth = userValesInMonth.reduce((acc, t) => acc + (t.amount || 0), 0);
                const grossOrNetParsed = parseBrazilianCurrency(amount);
                const liquidBalance = Math.max(0, grossOrNetParsed - totalValesInMonth);

                const handleHoleriteUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
                  const file = e.target.files?.[0];
                  if (!file) return;

                  setHoleriteFile(file);
                  setIsReadingHolerite(true);

                  try {
                    const parsed = await parseHoleriteFile(file, payrollUsers);
                    setParsedHolerite(parsed);

                    if (parsed.matchedUserId) {
                      setManualValeUserId(parsed.matchedUserId);
                    }
                    if (parsed.referenceMonth) {
                      setManualValeMonthKey(parsed.referenceMonth);
                    }
                    if (parsed.netSalary && parsed.netSalary > 0) {
                      setAmount(parsed.netSalary.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
                    }
                    if (parsed.paymentDate) {
                      setDueDate(parsed.paymentDate);
                    }

                    try {
                      const uploaded = await uploadInvoiceAttachmentToStorage(
                        file,
                        `holerite_${Date.now()}`,
                        'comprovante',
                        file.name,
                        file.type
                      );
                      if (uploaded) {
                        setHoleriteFileUrl(uploaded);
                      }
                    } catch (uploadErr) {
                      console.warn('Fallback upload holerite:', uploadErr);
                    }

                    showToast(`Holerite lido com sucesso! ${parsed.employeeName ? `Colaborador: ${parsed.employeeName}` : ''} ${parsed.netSalary ? `| Líquido: ${formatBrl(parsed.netSalary)}` : ''}`, 'success');
                  } catch (err: any) {
                    console.error('Erro na leitura do holerite:', err);
                    showToast('Não foi possível ler todos os dados do holerite automaticamente. Preencha manualmente se necessário.', 'warning');
                  } finally {
                    setIsReadingHolerite(false);
                  }
                };

                return (
                  <div className="p-3.5 rounded-xl bg-purple-50/70 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800/60 space-y-3">
                    {/* Upload Box do Holerite */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                        Anexar Holerite / Contracheque (PDF ou Imagem)
                      </label>
                      <div className="relative border-2 border-dashed border-purple-300 dark:border-purple-700 hover:border-purple-500 rounded-xl p-3 bg-white/70 dark:bg-slate-900/60 text-center transition-all cursor-pointer">
                        <input
                          type="file"
                          accept=".pdf,image/*"
                          onChange={handleHoleriteUpload}
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        />
                        {isReadingHolerite ? (
                          <div className="flex items-center justify-center gap-2 py-2 text-purple-600 dark:text-purple-400 font-bold text-xs">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>Lendo e extraindo dados do holerite...</span>
                          </div>
                        ) : holeriteFile ? (
                          <div className="flex items-center justify-between px-2 py-1">
                            <div className="flex items-center gap-2 text-left">
                              <FileCheck className="w-5 h-5 text-emerald-600" />
                              <div>
                                <p className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate max-w-xs">{holeriteFile.name}</p>
                                <p className="text-[10px] text-emerald-600 font-semibold">Holerite anexado e analisado</p>
                              </div>
                            </div>
                            <span className="text-[10px] font-bold text-purple-600 hover:underline">Trocar</span>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center justify-center py-1">
                            <UploadCloud className="w-6 h-6 text-purple-500 mb-1" />
                            <p className="text-xs font-bold text-slate-700 dark:text-slate-200">
                              Clique ou arraste o arquivo do Holerite aqui
                            </p>
                            <p className="text-[10px] text-slate-400 mt-0.5">Leitura automática de colaborador, competência e valor líquido</p>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Colaborador Responsável *</label>
                        <select
                          required
                          value={manualValeUserId}
                          onChange={(e) => setManualValeUserId(e.target.value)}
                          className="w-full px-2.5 py-2 rounded-xl text-xs border border-purple-300 dark:border-purple-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white outline-none cursor-pointer focus:ring-2 focus:ring-purple-500 font-medium"
                        >
                          <option value="">Selecione o colaborador...</option>
                          {payrollUsers.map(u => (
                            <option key={u.id} value={u.id}>
                              {u.name} ({getUserRegime(u)})
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Mês de Competência *</label>
                        <select
                          required
                          value={manualValeMonthKey || currentMonthPrefix}
                          onChange={(e) => setManualValeMonthKey(e.target.value)}
                          className="w-full px-2.5 py-2 rounded-xl text-xs border border-purple-300 dark:border-purple-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white outline-none cursor-pointer focus:ring-2 focus:ring-purple-500 font-medium"
                        >
                          {monthOptions.map(mk => (
                            <option key={mk} value={mk}>
                              {formatMonthKeyToLabel(mk)}
                              {mk === currentMonthPrefix ? ' (Mês Atual)' : mk === lastMonthPrefix ? ' (Mês Anterior)' : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Resumo de Vales Concedidos & Saldo a Pagar */}
                    {manualValeUserId && (
                      <div className="p-2.5 rounded-xl bg-purple-100/90 dark:bg-purple-950/80 border border-purple-300 dark:border-purple-800 text-[11px] space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-600 dark:text-slate-400">Total Líquido Holerite:</span>
                          <span className="font-bold font-mono text-slate-900 dark:text-white">{formatBrl(grossOrNetParsed)}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-amber-700 dark:text-amber-400 font-semibold">
                            (-) Vales / Adiantamentos no Mês ({userValesInMonth.length}):
                          </span>
                          <span className="font-bold font-mono text-amber-700 dark:text-amber-400">- {formatBrl(totalValesInMonth)}</span>
                        </div>
                        <div className="flex items-center justify-between pt-1 border-t border-purple-200 dark:border-purple-800 text-xs font-black text-purple-900 dark:text-purple-200">
                          <span>Saldo Restante a Pagar na Folha:</span>
                          <span className="font-mono text-emerald-600 dark:text-emerald-400">{formatBrl(liquidBalance)}</span>
                        </div>
                      </div>
                    )}

                    {folhaPix && (
                      <div className="text-[11px] text-slate-600 dark:text-slate-400">
                        Chave PIX cadastrada: <strong className="text-slate-800 dark:text-slate-200 font-mono">{folhaPix}</strong>
                      </div>
                    )}

                    <div className="flex items-start gap-1.5 text-[11px] text-purple-800 dark:text-purple-300 leading-snug">
                      <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <span>
                        O lançamento da folha ficará como <strong>Pendente</strong> em Contas a Pagar. Ao efetuar o pagamento final, anexe o comprovante bancário/PIX para dar baixa e finalizar o fechamento do mês.
                      </span>
                    </div>
                  </div>
                );
              })()}

              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                  Descrição {manualEntryType === 'vale' ? '(Opcional)' : '*'}
                </label>
                <input
                  type="text"
                  required={manualEntryType !== 'vale'}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={manualEntryType === 'vale' ? 'Ex: Vale emergencial / Adiantamento quinzenal' : 'Ex: Fornecedor de Pneus / Manutenção de Pátio'}
                  className="w-full px-3 py-2 rounded-xl text-xs sm:text-sm border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                    {manualInstallmentsCount > 1 ? 'Valor Total (R$) *' : 'Valor a Pagar (R$) *'}
                  </label>
                  <input
                    type="text"
                    required
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0,00"
                    className="w-full px-3 py-2 rounded-xl text-xs sm:text-sm border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white font-bold text-emerald-600 dark:text-emerald-400 outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                    {manualEntryType === 'vale'
                      ? (manualInstallmentsCount > 1 ? 'Data 1º Pagamento *' : 'Data Prevista Pagamento *')
                      : (manualInstallmentsCount > 1 ? 'Data 1º Vencimento *' : 'Data de Vencimento *')}
                  </label>
                  <input
                    type="date"
                    required
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl text-xs sm:text-sm border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                {manualEntryType !== 'vale' && (
                  <div>
                    <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">Parcelamento</label>
                    <select
                      value={manualInstallmentsCount}
                      onChange={(e) => setManualInstallmentsCount(parseInt(e.target.value, 10))}
                      className="w-full px-3 py-2 rounded-xl text-xs border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white outline-none cursor-pointer focus:ring-2 focus:ring-blue-500 font-bold"
                    >
                      <option value={1}>1x (À vista)</option>
                      <option value={2}>2x parcelado</option>
                      <option value={3}>3x parcelado</option>
                      <option value={4}>4x parcelado</option>
                      <option value={5}>5x parcelado</option>
                      <option value={6}>6x parcelado</option>
                      <option value={8}>8x parcelado</option>
                      <option value={10}>10x parcelado</option>
                      <option value={12}>12x parcelado</option>
                    </select>
                  </div>
                )}
              </div>

              {manualEntryType !== 'vale' && manualInstallmentsCount > 1 && parseBrazilianCurrency(amount) > 0 && (
                <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 text-[11px] text-blue-800 dark:text-blue-300 flex items-center justify-between">
                  <span>Serão gerados {manualInstallmentsCount} lançamentos mensais consecutivos:</span>
                  <span className="font-bold font-mono">
                    {manualInstallmentsCount}x de ~{formatBrl(parseBrazilianCurrency(amount) / manualInstallmentsCount)}
                  </span>
                </div>
              )}

              {manualEntryType !== 'vale' && (
              <>
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">Fornecedor / Favorecido</label>
                <input
                  type="text"
                  value={supplierName}
                  onChange={(e) => setSupplierName(e.target.value)}
                  placeholder="Razão Social ou Nome Fantasia"
                  className="w-full px-3 py-2 rounded-xl text-xs sm:text-sm border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">Categoria</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl text-xs border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white outline-none cursor-pointer"
                  >
                    <option value="Custos com Motoristas / Terceiros">Custos com Motoristas</option>
                    <option value="Pedágios">Pedágios</option>
                    <option value="Impostos e Tributos">Impostos e Tributos</option>
                    <option value="Despesas Operacionais">Despesas Operacionais</option>
                    <option value="Pessoal e Encargos">Pessoal e Encargos</option>
                    <option value="Despesas Administrativas">Despesas Administrativas</option>
                    <option value="Despesas Financeiras / Tarifas">Despesas Financeiras</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">Centro de Custo</label>
                  <select
                    value={costCenter}
                    onChange={(e) => setCostCenter(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl text-xs border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white outline-none cursor-pointer"
                  >
                    <option value="Operacional">Operacional</option>
                    <option value="Administrativo">Administrativo</option>
                    <option value="Comercial">Comercial</option>
                    <option value="Frota">Frota</option>
                  </select>
                </div>
              </div>
              </>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">Observações</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder="Informações adicionais..."
                  className="w-full px-3 py-2 rounded-xl text-xs sm:text-sm border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-600/20 cursor-pointer"
                >
                  Salvar Lançamento
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 7. MODAL DE PLANEJAMENTO DE PAGAMENTO - FOLHA DE PAGAMENTO */}
      {isPlanLeaderModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-700 animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4 border-b border-slate-100 dark:border-slate-700 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 rounded-xl">
                  <Wallet className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Planejar Pagamento • Folha de Pagamento
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Programe quitações de salários, comissões de Gestor AG, adiantamentos ou pró-labore
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsPlanLeaderModalOpen(false)}
                className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitPlanLeader} className="space-y-4">
              {/* Seleção do Colaborador */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Colaborador Favorecido *
                </label>
                <select
                  required
                  value={planLeaderId}
                  onChange={(e) => {
                    const newId = e.target.value;
                    setPlanLeaderId(newId);
                    const userObj = payrollUsers.find(l => l.id === newId);
                    const targetKey = planMonthKey || (payrollSelectedMonth === 'last' ? lastMonthPrefix : currentMonthPrefix);
                    const sum = allPayrollSettlements.find(s => s.user.id === newId && s.monthKey === targetKey)
                      || leadersSummary.find(s => s.user.id === newId)
                      || allPayrollSettlements.find(s => s.user.id === newId);
                    if (userObj) {
                      const reg = sum?.regime || getUserRegime(userObj);
                      if (reg === 'CLT') {
                        setPlanPaymentType('Salário Mensal (Folha)');
                      } else if (reg === 'PJ') {
                        setPlanPaymentType('Pró-labore / Pagamento PJ');
                      } else {
                        setPlanPaymentType('Comissão de Gestor AG');
                      }
                      setPlanPixKey(userObj.phone || userObj.corporateEmail || userObj.email || '');
                    }
                    if (sum && sum.balancePending > 0) {
                      setPlanAmount(sum.balancePending.toFixed(2).replace('.', ','));
                    }
                  }}
                  className="w-full px-3 py-2 rounded-xl text-xs sm:text-sm border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white outline-none cursor-pointer focus:ring-2 focus:ring-amber-500"
                >
                  <option value="">Selecione o Colaborador...</option>
                  {payrollUsers.map(u => {
                    const targetKey = planMonthKey || (payrollSelectedMonth === 'last' ? lastMonthPrefix : currentMonthPrefix);
                    const sum = allPayrollSettlements.find(s => s.user.id === u.id && s.monthKey === targetKey)
                      || leadersSummary.find(s => s.user.id === u.id)
                      || allPayrollSettlements.find(s => s.user.id === u.id);
                    const reg = sum?.regime || getUserRegime(u);
                    return (
                      <option key={u.id} value={u.id}>
                        {u.name} ({reg} - {u.profile}) - Saldo a Pagar: {formatBrl(sum?.balancePending || 0)}
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Card Contextual do Colaborador Selecionado */}
              {planLeaderId && (() => {
                const targetKey = planMonthKey || (payrollSelectedMonth === 'last' ? lastMonthPrefix : currentMonthPrefix);
                const selSummary = allPayrollSettlements.find(s => s.user.id === planLeaderId && s.monthKey === targetKey)
                  || leadersSummary.find(s => s.user.id === planLeaderId)
                  || allPayrollSettlements.find(s => s.user.id === planLeaderId);
                if (!selSummary) return null;

                return (
                  <div className="bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/80 rounded-xl p-3 text-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-amber-900 dark:text-amber-200">
                        {selSummary.user.name} • {selSummary.branchName}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-200/70 dark:bg-amber-900/60 text-amber-900 dark:text-amber-200 font-mono">
                          Folha: {selSummary.monthLabel}
                        </span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-200/70 dark:bg-slate-800 text-slate-800 dark:text-slate-200">
                          {selSummary.regime}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 pt-1 border-t border-amber-200/60 dark:border-amber-800/60 text-[11px]">
                      <div>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 block">
                          {selSummary.regime === 'Gestor AG' ? 'Comissão + Fixo:' : 'Salário / Contrato:'}
                        </span>
                        <span className="font-bold text-blue-600 dark:text-blue-400">
                          {formatBrl(selSummary.grossTotal)}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 block" title="Soma de todos os vales concedidos no período + baixas já realizadas">
                          Total Já Quitado:
                        </span>
                        <span className="font-bold text-emerald-600 dark:text-emerald-400">
                          {formatBrl(selSummary.totalPaid)}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 block">Saldo Pendente:</span>
                        <span className="font-bold text-amber-700 dark:text-amber-300">
                          {formatBrl(selSummary.balancePending)}
                        </span>
                      </div>
                    </div>

                    <div className="text-[10px] text-slate-600 dark:text-slate-300 flex items-center justify-between border-t border-amber-200/40 dark:border-amber-800/40 pt-1 flex-wrap gap-1">
                      {selSummary.taxesClt > 0 && (
                        <span>Retenções Tributos: <strong className="text-rose-600">-{formatBrl(selSummary.taxesClt)}</strong></span>
                      )}
                      <span>(-) Adiantamentos / Vales: <strong className="text-orange-600 font-mono">-{formatBrl(selSummary.totalAdvances)}</strong></span>
                      <span>Líquido Devido: <strong className="text-purple-600 font-bold font-mono">{formatBrl(selSummary.netDue)}</strong></span>
                    </div>

                    {selSummary.balancePending > 0 && (
                      <button
                        type="button"
                        onClick={() => setPlanAmount(selSummary.balancePending.toFixed(2).replace('.', ','))}
                        className="w-full mt-1 py-1 px-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-[10px] font-bold transition-all cursor-pointer shadow-2xs"
                      >
                        ⚡ Preencher Saldo Pendente ({formatBrl(selSummary.balancePending)})
                      </button>
                    )}
                  </div>
                );
              })()}

              {/* Tipo de Pagamento */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                    Tipo de Pagamento *
                  </label>
                  <select
                    value={planPaymentType}
                    onChange={(e) => setPlanPaymentType(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl text-xs border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white outline-none cursor-pointer"
                  >
                    <option value="Salário Mensal (Folha)">Salário Mensal (Folha)</option>
                    <option value="Adiantamento Salarial (Vale)">Adiantamento Salarial (Vale)</option>
                    <option value="Comissão de Gestor AG">Comissão de Gestor AG</option>
                    <option value="Pró-labore / Pagamento PJ">Pró-labore / Pagamento PJ</option>
                    <option value="13º Salário / Férias">13º Salário / Férias</option>
                    <option value="Premiação / Bônus">Premiação / Bônus</option>
                    <option value="Acerto Operacional">Acerto Operacional</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                    Forma de Pagamento *
                  </label>
                  <select
                    value={planPaymentMethod}
                    onChange={(e) => setPlanPaymentMethod(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl text-xs border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white outline-none cursor-pointer"
                  >
                    <option value="PIX">PIX</option>
                    <option value="Transferência / TED">Transferência / TED</option>
                    <option value="Depósito em Conta">Depósito em Conta</option>
                    <option value="Dinheiro">Dinheiro</option>
                  </select>
                </div>
              </div>

              {/* Valor e Data de Vencimento */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                    Valor Planejado (R$) *
                  </label>
                  <input
                    type="text"
                    required
                    value={planAmount}
                    onChange={(e) => setPlanAmount(e.target.value)}
                    placeholder="0,00"
                    className="w-full px-3 py-2 rounded-xl text-xs sm:text-sm border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white font-bold text-emerald-600 dark:text-emerald-400 outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                    Data Prevista / Vencimento *
                  </label>
                  <input
                    type="date"
                    required
                    value={planDueDate}
                    onChange={(e) => setPlanDueDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl text-xs sm:text-sm border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              {/* Chave PIX e Status Inicial */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                    Chave PIX / Favorecido
                  </label>
                  <input
                    type="text"
                    value={planPixKey}
                    onChange={(e) => setPlanPixKey(e.target.value)}
                    placeholder="CPF, Telefone, Email ou Chave Aleatória"
                    className="w-full px-3 py-2 rounded-xl text-xs sm:text-sm border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                    Status Inicial
                  </label>
                  <select
                    value={planInitialStatus}
                    onChange={(e) => setPlanInitialStatus(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl text-xs border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white outline-none cursor-pointer"
                  >
                    <option value={FinancialTransactionStatus.Pendente}>🟡 Pendente (Planejado / A Pagar)</option>
                    <option value={FinancialTransactionStatus.Pago}>🟢 Pago (Já Liquidado Hoje)</option>
                  </select>
                </div>
              </div>

              {/* Observações */}
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                  Observações / Memória de Cálculo
                </label>
                <textarea
                  value={planNotes}
                  onChange={(e) => setPlanNotes(e.target.value)}
                  rows={2}
                  placeholder="Informações adicionais do acerto de contas..."
                  className="w-full px-3 py-2 rounded-xl text-xs sm:text-sm border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              {/* Botões do Modal */}
              <div className="flex justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => setIsPlanLeaderModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-md shadow-amber-600/25 cursor-pointer active:scale-95"
                >
                  Salvar Planejamento
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 8. MODAL DE CONFIGURAÇÃO DE FOLHA DO COLABORADOR (REGIME, SALÁRIO, TRIBUTOS, ADIANTAMENTO) */}
      {editingUserForValues && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-700 animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4 border-b border-slate-100 dark:border-slate-700 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 rounded-xl">
                  <SlidersHorizontal className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Configurar Folha • {editingUserForValues.name}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Perfil: {editingUserForValues.profile} • {editingUserForValues.branchId || 'Matriz'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setEditingUserForValues(null)}
                className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveUserValues} className="space-y-4">
              {/* Regime de Contratação */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Regime de Contratação / Classificação *
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['CLT', 'PJ', 'Gestor AG'] as const).map(reg => (
                    <button
                      key={reg}
                      type="button"
                      onClick={() => setEditRegime(reg)}
                      className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all text-center cursor-pointer ${editRegime === reg
                          ? reg === 'Gestor AG'
                            ? 'bg-amber-600 border-amber-600 text-white shadow-xs'
                            : reg === 'PJ'
                              ? 'bg-purple-600 border-purple-600 text-white shadow-xs'
                              : 'bg-blue-600 border-blue-600 text-white shadow-xs'
                          : 'border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
                        }`}
                    >
                      {reg}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  {editRegime === 'CLT' && 'Colaborador com registro CLT, sujeito a tributos/retenções (INSS/IRRF).'}
                  {editRegime === 'PJ' && 'Prestador PJ com valor de remuneração contratual fixa/negociada.'}
                  {editRegime === 'Gestor AG' && 'Agenciador Líder: apuração automática por lucro real dos fretes + fixo opcional.'}
                </p>
              </div>

              {/* Salário Fixo / Remuneração Base */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {editRegime === 'PJ' ? 'Remuneração Contratual (R$)' : editRegime === 'Gestor AG' ? 'Salário Fixo Adicional (R$)' : 'Salário Fixo Mensal (R$)'}
                </label>
                <input
                  type="text"
                  value={editSalary}
                  onChange={(e) => setEditSalary(e.target.value)}
                  placeholder="0,00"
                  className="w-full px-3 py-2 rounded-xl text-xs sm:text-sm border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white font-bold outline-none focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-[10px] text-slate-400 mt-0.5 block">
                  Salário informado para apuração regular no sistema
                </span>
              </div>

              {/* Comissão / Ajuste de Comissão */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-blue-600 dark:text-blue-400">
                    Comissão / Ajuste de Comissão (R$)
                  </label>
                  {editCommission.trim() !== '' && (
                    <button
                      type="button"
                      onClick={() => setEditCommission('')}
                      className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline cursor-pointer font-semibold"
                      title="Limpar ajuste manual e restaurar apuração automática dos fretes"
                    >
                      Usar Apuração Automática dos Fretes
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  value={editCommission}
                  onChange={(e) => setEditCommission(e.target.value)}
                  placeholder="Automático (calculado pelos fretes CT-e)"
                  className="w-full px-3 py-2 rounded-xl text-xs sm:text-sm border border-blue-300 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20 text-blue-900 dark:text-blue-200 font-bold outline-none focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-[10px] text-slate-400 mt-0.5 block">
                  {editCommission.trim() === '' ? 'Deixe em branco para usar o cálculo automático apurado dos fretes.' : 'Valor manual informado. Para restaurar o cálculo automático, clique em "Usar Apuração Automática dos Fretes" acima.'}
                </span>
              </div>

              {/* Tributos / Retenções CLT */}
              {editRegime === 'CLT' && (
                <div>
                  <label className="block text-xs font-bold text-rose-600 dark:text-rose-400 mb-1">
                    Tributos & Descontos CLT (INSS, IRRF, Encargos) (R$)
                  </label>
                  <input
                    type="text"
                    value={editTaxes}
                    onChange={(e) => setEditTaxes(e.target.value)}
                    placeholder="0,00"
                    className="w-full px-3 py-2 rounded-xl text-xs sm:text-sm border border-rose-300 dark:border-rose-800 bg-rose-50/50 dark:bg-rose-950/20 text-rose-900 dark:text-rose-200 font-bold outline-none focus:ring-2 focus:ring-rose-500"
                  />
                  <span className="text-[10px] text-slate-400 mt-0.5 block">
                    Valor total de tributos e retenções descontados do salário bruto
                  </span>
                </div>
              )}

              {/* Adiantamento Salarial / Vales Concedidos Múltiplos e Parcelados */}
              {(() => {
                const activeModalMonthKey = editingMonthKey || currentMonthPrefix;
                const userExistingVales = (payrollAdvanceItems || []).filter(v => v.userId === editingUserForValues.id);
                const userAvulsoVales = (transactions || []).filter(t =>
                  t.type === 'payable' &&
                  (t.ownerId === editingUserForValues.id || (!t.ownerId && t.supplierOrClientName && t.supplierOrClientName.toLowerCase().includes(editingUserForValues.name.toLowerCase()))) &&
                  isValeTransaction(t) &&
                  t.status !== FinancialTransactionStatus.Cancelado
                );

                const currentMonthStructuredDiscount = userExistingVales
                  .flatMap(v => v.installments || [])
                  .filter(i => i.monthKey === activeModalMonthKey)
                  .reduce((s, i) => s + i.amount, 0);

                const currentMonthAvulsoConfirmed = userAvulsoVales
                  .filter(t => t.status === FinancialTransactionStatus.Pago && Boolean(t.receiptFileUrl) && getValeDiscountMonthKey(t) === activeModalMonthKey)
                  .reduce((s, t) => s + (t.amount || 0), 0);

                const currentMonthValesDiscount = currentMonthStructuredDiscount + currentMonthAvulsoConfirmed;

                const currentMonthAvulsoPending = userAvulsoVales
                  .filter(t => (t.status !== FinancialTransactionStatus.Pago || !t.receiptFileUrl) && getValeDiscountMonthKey(t) === activeModalMonthKey)
                  .reduce((s, t) => s + (t.amount || 0), 0);

                const futureValesDiscount = userExistingVales
                  .flatMap(v => v.installments || [])
                  .filter(i => i.monthKey !== activeModalMonthKey)
                  .reduce((s, i) => s + i.amount, 0);

                const parsedValeAmount = parseBrazilianCurrency(newValeAmount);
                const previewTotal = parsedValeAmount > 0 ? parsedValeAmount : 0;
                const previewCount = Math.max(1, newValeInstallmentsCount || 1);
                const sameMonthOfVale = getMonthKeyFromDate(newValeDate || todayStr);
                const effectiveStartMonth = newValeStartMonth || activeModalMonthKey;
                const previewInstallments = previewTotal > 0 ? calculateInstallments(previewTotal, previewCount, effectiveStartMonth) : [];

                // Lista de opções de mês inicial de desconto
                const availableStartMonths: Array<{ key: string; label: string }> = [
                  {
                    key: activeModalMonthKey,
                    label: `Folha Desta Aba (${formatMonthKeyToLabel(activeModalMonthKey)}) - Padrão / Imediato`
                  }
                ];

                if (sameMonthOfVale !== activeModalMonthKey) {
                  availableStartMonths.push({
                    key: sameMonthOfVale,
                    label: `Mês da Concessão (${formatMonthKeyToLabel(sameMonthOfVale)})`
                  });
                }

                const nextMonth = addMonthsToMonthKey(activeModalMonthKey, 1);
                if (!availableStartMonths.some(m => m.key === nextMonth)) {
                  availableStartMonths.push({
                    key: nextMonth,
                    label: `Mês Subsequente (${formatMonthKeyToLabel(nextMonth)})`
                  });
                }

                [2, 3, 4, 5, 6].forEach(offset => {
                  const futMonth = addMonthsToMonthKey(activeModalMonthKey, offset);
                  if (!availableStartMonths.some(m => m.key === futMonth)) {
                    availableStartMonths.push({
                      key: futMonth,
                      label: formatMonthKeyToLabel(futMonth)
                    });
                  }
                });

                return (
                  <div className="p-3.5 rounded-2xl bg-orange-50/70 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800/60 space-y-3.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-orange-700 dark:text-orange-400 flex items-center gap-1.5">
                        <Wallet className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                        <span>Adiantamentos / Vales Concedidos</span>
                      </label>
                      <div className="flex items-center gap-1.5">
                        {(userExistingVales.length > 0 || userAvulsoVales.length > 0) && (
                          <span className="text-[10px] font-bold text-orange-700 dark:text-orange-300 bg-orange-200/80 dark:bg-orange-900/80 px-2 py-0.5 rounded-md border border-orange-300 dark:border-orange-800 font-mono">
                            {userExistingVales.length + userAvulsoVales.length} {userExistingVales.length + userAvulsoVales.length === 1 ? 'vale' : 'vales'}
                          </span>
                        )}
                        <span className="text-[10px] font-bold text-orange-700 dark:text-orange-300 bg-orange-200/60 dark:bg-orange-900/60 px-2 py-0.5 rounded-md border border-orange-300 dark:border-orange-800">
                          Múltiplos Vales & Parcelamento
                        </span>
                      </div>
                    </div>

                    {/* Botão de Atalho para Lançar Vale em Lançamentos Avulsos */}
                    <button
                      type="button"
                      onClick={() => {
                        handleOpenManualModal({
                          asVale: true,
                          userId: editingUserForValues.id,
                          monthKey: activeModalMonthKey
                        });
                        setEditingUserForValues(null);
                      }}
                      className="w-full py-2.5 px-3 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-700 hover:to-amber-700 text-white rounded-xl text-xs font-bold shadow-md shadow-orange-600/25 transition-all cursor-pointer flex items-center justify-center gap-2 active:scale-95"
                    >
                      <Plus className="w-4 h-4" />
                      <span>+ Lançar Vale em "Lançamentos Avulsos" (Fica Pendente)</span>
                    </button>

                    {/* Vales em Lançamentos Avulsos deste Colaborador */}
                    {userAvulsoVales.length > 0 && (
                      <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-orange-200/80 dark:border-orange-800/80 space-y-2">
                        <div className="flex items-center justify-between text-[11px] font-bold text-slate-700 dark:text-slate-300">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5 text-amber-500" />
                            <span>Vales em Lançamentos Avulsos ({userAvulsoVales.length})</span>
                          </span>
                          {currentMonthAvulsoPending > 0 && (
                            <span className="text-[10px] text-amber-600 dark:text-amber-400 font-bold">
                              {formatBrl(currentMonthAvulsoPending)} aguardando baixa
                            </span>
                          )}
                        </div>
                        <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                          {userAvulsoVales.map(v => {
                            const isPaid = v.status === FinancialTransactionStatus.Pago;
                            const hasRec = Boolean(v.receiptFileUrl);
                            const discountM = getValeDiscountMonthKey(v);
                            const valAmount = v.amount || 0;

                            return (
                              <div
                                key={v.id}
                                className={`p-2 rounded-lg border text-[11px] flex items-center justify-between gap-2 ${
                                  isPaid && hasRec
                                    ? 'bg-emerald-50/70 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
                                    : 'bg-amber-50/70 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200'
                                }`}
                              >
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <strong className="font-mono">{formatBrl(valAmount)}</strong>
                                    <span className="text-[9px] px-1 py-0.2 rounded font-bold border border-current">
                                      Folha: {formatMonthKeyToLabel(discountM)}
                                    </span>
                                    {isPaid && hasRec ? (
                                      <span className="text-[9px] text-emerald-700 dark:text-emerald-300 font-bold">
                                        ✓ Quitado (Somado na Folha)
                                      </span>
                                    ) : (
                                      <span className="text-[9px] text-amber-700 dark:text-amber-300 font-bold">
                                        🟡 Pendente (Aguardando Baixa + Comprovante)
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[10px] opacity-75 truncate mt-0.5">
                                    Venc: {v.dueDate ? new Date(v.dueDate + 'T00:00:00').toLocaleDateString('pt-BR') : '-'}
                                    {v.description ? ` • ${v.description}` : ''}
                                  </div>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                  {hasRec && (
                                    <button
                                      type="button"
                                      onClick={() => openDocumentInNewTab(v.receiptFileUrl!, v.receiptFileName || 'Comprovante')}
                                      className="p-1 text-blue-600 hover:bg-blue-100 dark:hover:bg-blue-900/40 rounded cursor-pointer"
                                      title="Ver Comprovante"
                                    >
                                      <Eye className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                  {(!isPaid || !hasRec) && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingUserForValues(null);
                                        const orig = v;
                                        handleOpenSettlementModal({
                                          id: orig.id,
                                          kind: 'manual',
                                          docNumber: orig.documentNumber ? `Doc ${orig.documentNumber}` : `Vale Folha • ${formatMonthKeyToLabel(discountM)}`,
                                          title: orig.description,
                                          entityName: orig.supplierOrClientName || editingUserForValues.name,
                                          categoryOrCenter: `${orig.category || 'Adiantamento Salarial'} • ${orig.costCenter || 'Administrativo'}`,
                                          dueDate: orig.dueDate,
                                          totalAmount: valAmount,
                                          payableAmount: valAmount,
                                          status: isPaid ? 'Pago' : 'Pendente',
                                          receiptUrl: orig.receiptFileUrl,
                                          receiptName: orig.receiptFileName,
                                          originalItem: orig,
                                        });
                                      }}
                                      className="px-2 py-0.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[10px] font-bold cursor-pointer"
                                      title="Dar baixa e anexar comprovante para somar na folha"
                                    >
                                      Dar Baixa
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Resumo do Impacto da Folha Atual vs Outros Meses */}
                    {(userExistingVales.length > 0 || userAvulsoVales.length > 0) && (
                      <div className="p-2.5 rounded-xl bg-white/90 dark:bg-slate-900/90 border border-orange-200 dark:border-orange-800/70 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 shadow-2xs">
                        <div>
                          <span className="text-[10px] uppercase tracking-wider text-slate-500 font-bold block">
                            Desconto Nesta Folha ({formatMonthKeyToLabel(activeModalMonthKey)})
                          </span>
                          <span className="text-sm font-black text-orange-600 dark:text-orange-400 font-mono">
                            {formatBrl(currentMonthValesDiscount)}
                          </span>
                        </div>
                        {futureValesDiscount > 0 && (
                          <div className="sm:text-right border-t sm:border-t-0 pt-1.5 sm:pt-0 border-slate-100 dark:border-slate-800">
                            <span className="text-[10px] uppercase tracking-wider text-slate-500 font-bold block">
                              Parcelas em Outros Meses
                            </span>
                            <span className="text-xs font-bold text-slate-700 dark:text-slate-300 font-mono">
                              {formatBrl(futureValesDiscount)}
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Lista de Vales Legados Cadastrados para este Colaborador (se houver) */}
                    {userExistingVales.length > 0 && (
                      <div className="space-y-2 pt-1 border-t border-orange-100 dark:border-orange-900/40">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                            <History className="w-3.5 h-3.5 text-slate-500" />
                            <span>Vales Cadastrados (Histórico - {userExistingVales.length})</span>
                          </span>
                          <span className="text-[10px] text-slate-400">
                            Total: {formatBrl(userExistingVales.reduce((acc, v) => acc + v.amount, 0))}
                          </span>
                        </div>

                        <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                          {userExistingVales.map((vale) => {
                            const totalInst = vale.installments?.length || vale.installmentsCount || 1;
                            const hasReceipt = Boolean(vale.receiptFileUrl);

                            return (
                              <div
                                key={vale.id}
                                className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-orange-200/70 dark:border-orange-800/70 space-y-1.5 shadow-2xs"
                              >
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-mono font-bold text-xs text-orange-700 dark:text-orange-400">
                                      {formatBrl(vale.amount)}
                                    </span>
                                    <span className="text-[10px] px-2 py-0.5 rounded-md bg-orange-100 dark:bg-orange-950/80 text-orange-800 dark:text-orange-300 font-bold border border-orange-200 dark:border-orange-800">
                                      {totalInst > 1 ? `${totalInst}x parcelado` : 'À vista'}
                                    </span>
                                    {vale.issueDate && (
                                      <span className="text-[10px] text-slate-500 font-medium">
                                        Concedido em: {new Date(vale.issueDate + 'T00:00:00').toLocaleDateString('pt-BR')}
                                      </span>
                                    )}
                                  </div>

                                  <div className="flex items-center gap-1.5 shrink-0">
                                    {hasReceipt && (
                                      <button
                                        type="button"
                                        onClick={() => openDocumentInNewTab(vale.receiptFileUrl!, vale.receiptFileName || 'Comprovante_Transferencia')}
                                        className="px-2 py-1 text-[10px] font-bold bg-blue-50 hover:bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:hover:bg-blue-900/60 dark:text-blue-300 rounded-lg border border-blue-200 dark:border-blue-800 flex items-center gap-1 cursor-pointer transition-colors"
                                        title="Visualizar Comprovante do Vale"
                                      >
                                        <Eye className="w-3 h-3" />
                                        <span>Ver Comprovante</span>
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteVale(vale.id, vale.amount)}
                                      className="p-1 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-lg transition-colors cursor-pointer"
                                      title="Excluir este vale e suas parcelas"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>

                                {vale.description && (
                                  <p className="text-[11px] text-slate-600 dark:text-slate-400 italic">
                                    {vale.description}
                                  </p>
                                )}

                                {/* Cronograma de Parcelas deste Vale */}
                                {(() => {
                                  const valeInsts = (vale.installments && vale.installments.length > 0)
                                    ? vale.installments
                                    : calculateInstallments(vale.amount, vale.installmentsCount || 1, vale.startMonthKey || activeModalMonthKey);
                                  const isDiscountingInCurrent = valeInsts.some(i => i.monthKey === activeModalMonthKey);

                                  return (
                                    <div className="flex flex-wrap items-center justify-between gap-1.5 pt-1 border-t border-slate-100 dark:border-slate-800/80">
                                      <div className="flex flex-wrap gap-1">
                                        {valeInsts.map((inst, iIdx) => {
                                          const isCurrent = inst.monthKey === activeModalMonthKey;
                                          return (
                                            <span
                                              key={iIdx}
                                              className={`text-[9px] px-1.5 py-0.5 rounded font-mono font-medium border ${isCurrent
                                                ? 'bg-amber-100 dark:bg-amber-950/80 text-amber-900 dark:text-amber-200 border-amber-300 dark:border-amber-700 font-bold ring-1 ring-amber-400/40'
                                                : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                                              }`}
                                              title={isCurrent ? 'Descontando na folha desta aba' : `Programado para ${formatMonthKeyToLabel(inst.monthKey)}`}
                                            >
                                              {inst.installmentNumber}/{inst.totalInstallments}: {formatBrl(inst.amount)} ({formatMonthKeyToLabel(inst.monthKey)})
                                              {isCurrent && ' • Desconta Nesta Folha ✓'}
                                            </span>
                                          );
                                        })}
                                      </div>

                                      {/* Troca Rápida de Mês de Início deste Vale */}
                                      <div className="flex items-center gap-1.5 shrink-0 text-[10px]">
                                        {!isDiscountingInCurrent && (
                                          <button
                                            type="button"
                                            onClick={() => handleChangeValeMonth(vale.id, activeModalMonthKey)}
                                            className="px-2 py-0.5 bg-orange-600 hover:bg-orange-700 text-white rounded text-[9px] font-bold shadow-2xs cursor-pointer active:scale-95 transition-all flex items-center gap-1"
                                            title={`Transferir o desconto deste vale para a folha desta aba (${formatMonthKeyToLabel(activeModalMonthKey)})`}
                                          >
                                            <Zap className="w-2.5 h-2.5" />
                                            <span>Descontar Nesta Folha</span>
                                          </button>
                                        )}

                                        <span className="text-slate-400 text-[9px]">Mudar mês:</span>
                                        <select
                                          value={vale.startMonthKey || valeInsts[0]?.monthKey || activeModalMonthKey}
                                          onChange={(e) => handleChangeValeMonth(vale.id, e.target.value)}
                                          className="text-[9px] font-bold py-0.5 px-1 rounded bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 cursor-pointer"
                                          title="Alterar o mês em que este vale começa a ser descontado"
                                        >
                                          <option value={activeModalMonthKey}>Folha Desta Aba ({formatMonthKeyToLabel(activeModalMonthKey)})</option>
                                          {lastMonthPrefix !== activeModalMonthKey && (
                                            <option value={lastMonthPrefix}>Mês Anterior ({formatMonthKeyToLabel(lastMonthPrefix)})</option>
                                          )}
                                          {currentMonthPrefix !== activeModalMonthKey && (
                                            <option value={currentMonthPrefix}>Mês Atual ({formatMonthKeyToLabel(currentMonthPrefix)})</option>
                                          )}
                                          <option value={addMonthsToMonthKey(activeModalMonthKey, 1)}>Mês Subsequente ({formatMonthKeyToLabel(addMonthsToMonthKey(activeModalMonthKey, 1))})</option>
                                          <option value={addMonthsToMonthKey(activeModalMonthKey, 2)}>{formatMonthKeyToLabel(addMonthsToMonthKey(activeModalMonthKey, 2))}</option>
                                        </select>
                                      </div>
                                    </div>
                                  );
                                })()}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <span className="text-[10px] text-slate-400 block leading-tight">
                      Cada vale concedido tem suas parcelas descontadas automaticamente nas folhas dos meses programados.
                    </span>
                  </div>
                );
              })()}

              {/* Chave PIX */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Chave PIX Cadastrada
                </label>
                <input
                  type="text"
                  value={editPixKey}
                  onChange={(e) => setEditPixKey(e.target.value)}
                  placeholder="CPF, Telefone, Email ou Chave Aleatória"
                  className="w-full px-3 py-2 rounded-xl text-xs sm:text-sm border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Memória Prévia do Líquido */}
              {(() => {
                const s = parseBrazilianCurrency(editSalary);
                const manualC = parseBrazilianCurrency(editCommission);
                const effectiveC = (editCommission && manualC > 0)
                  ? manualC
                  : (editingSettlementItem?.commissionEarned || 0);

                const t = editRegime === 'CLT' ? parseBrazilianCurrency(editTaxes) : 0;
                const activeModalMonthKey = editingMonthKey || currentMonthPrefix;
                const uVales = (payrollAdvanceItems || []).filter(v => v.userId === editingUserForValues.id);
                const uMonthDiscount = uVales
                  .flatMap(v => v.installments || [])
                  .filter(i => i.monthKey === activeModalMonthKey)
                  .reduce((sum, i) => sum + i.amount, 0);

                const uAvulsoConfirmed = (transactions || [])
                  .filter(t =>
                    t.type === 'payable' &&
                    (t.ownerId === editingUserForValues.id || (!t.ownerId && t.supplierOrClientName && t.supplierOrClientName.toLowerCase().includes(editingUserForValues.name.toLowerCase()))) &&
                    isValeTransaction(t) &&
                    t.status === FinancialTransactionStatus.Pago &&
                    Boolean(t.receiptFileUrl) &&
                    getValeDiscountMonthKey(t) === activeModalMonthKey
                  )
                  .reduce((sum, t) => sum + (t.amount || 0), 0);

                const a = (uVales.length > 0 || uAvulsoConfirmed > 0)
                  ? (uMonthDiscount + uAvulsoConfirmed)
                  : parseBrazilianCurrency(editAdvance);
                const gross = s + effectiveC;
                const net = Math.max(0, gross - t - a);

                return (
                  <div className="bg-slate-100 dark:bg-slate-900/80 p-3 rounded-xl border border-slate-200 dark:border-slate-700 text-xs space-y-1">
                    <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                      <span>Fixo / Base Informado:</span>
                      <span className="font-bold">{formatBrl(s)}</span>
                    </div>
                    {effectiveC > 0 && (
                      <div className="flex items-center justify-between text-blue-600 dark:text-blue-400">
                        <span>(+) Comissão {editCommission ? 'Informada' : 'Apurada nos Fretes'}:</span>
                        <span className="font-bold">+{formatBrl(effectiveC)}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between text-slate-700 dark:text-slate-300 font-semibold pt-0.5 border-t border-slate-200/50 dark:border-slate-700/50">
                      <span>Total Bruto:</span>
                      <span className="font-bold">{formatBrl(gross)}</span>
                    </div>
                    {t > 0 && (
                      <div className="flex items-center justify-between text-rose-600 dark:text-rose-400">
                        <span>(-) Tributos CLT:</span>
                        <span className="font-bold">-{formatBrl(t)}</span>
                      </div>
                    )}
                    {a > 0 && (
                      <div className="flex items-center justify-between text-orange-600 dark:text-orange-400">
                        <span>(-) Adiantamentos / Vales Deste Mês:</span>
                        <span className="font-bold font-mono">-{formatBrl(a)}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400 pt-0.5 border-t border-slate-200/50 dark:border-slate-700/50 font-semibold">
                      <span>Total Já Quitado (Vales):</span>
                      <span className="font-bold font-mono">{formatBrl(a)}</span>
                    </div>
                    <div className="pt-1 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between font-bold text-slate-900 dark:text-white">
                      <span>Líquido Previsto / Devido:</span>
                      <span className="text-purple-600 dark:text-purple-400 font-black text-sm">{formatBrl(net)}</span>
                    </div>
                  </div>
                );
              })()}

              {/* Botões do Modal */}
              <div className="flex items-center justify-between gap-3 pt-3 border-t border-slate-200 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => {
                    const u = editingUserForValues;
                    setEditingUserForValues(null);
                    handleExcludeUserFromPayroll(u);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-rose-200 dark:border-rose-800 transition-colors cursor-pointer"
                  title="Excluir este colaborador da tela de folha de pagamento"
                >
                  <UserX className="w-3.5 h-3.5" />
                  <span>Excluir da Folha</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingUserForValues(null)}
                    className="px-4 py-2 rounded-xl text-xs font-bold border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-600/20 cursor-pointer"
                  >
                    Salvar Configuração
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 8. MODAL DE AUDITORIA DE FRETES DA AGÊNCIA DO LÍDER */}
      {auditingLeaderId && currentAuditingSummary && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl max-w-4xl w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-700 animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-700">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 rounded-xl">
                  <Award className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Auditoria de Fretes • {currentAuditingSummary.user?.name || currentAuditingSummary.leader?.name}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    {currentAuditingSummary.branchName} • {
                      currentAuditingSummary.regime === 'Gestor AG'
                        ? `Taxa de Comissão: ${currentAuditingSummary.commissionPct}% sobre Lucro Real Líquido`
                        : `Apuração Comercial • ${currentAuditingSummary.shipmentsCount} fretes vinculados no período`
                    }
                  </p>
                </div>
              </div>
              <button
                onClick={() => setAuditingLeaderId(null)}
                className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Banner com Totais Consolidados */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 my-4 bg-slate-50 dark:bg-slate-900/60 p-3.5 rounded-xl border border-slate-100 dark:border-slate-800 text-xs">
              <div>
                <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Embarques Descarregados</span>
                <span className="text-sm font-bold text-slate-900 dark:text-white">{currentAuditingSummary.shipmentsCount} fretes</span>
                {Boolean(currentAuditingSummary.expectedShipmentsCount && currentAuditingSummary.expectedShipmentsCount > 0) && (
                  <span className="text-[10px] text-amber-500 font-bold block">+{currentAuditingSummary.expectedShipmentsCount} em trânsito</span>
                )}
              </div>
              <div>
                <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Faturamento Empresa</span>
                <span className="text-sm font-bold text-slate-900 dark:text-white">{formatBrl(currentAuditingSummary.totalFreightRevenue)}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Lucro Real Líquido</span>
                <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">{formatBrl(currentAuditingSummary.totalNetProfit)}</span>
              </div>
              <div>
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 uppercase tracking-wider font-bold block">
                  Comissão Liberada (Pós-Descarga / Virada Mês)
                </span>
                <span className="text-sm font-black text-emerald-600 dark:text-emerald-400">{formatBrl(currentAuditingSummary.commissionEarned)}</span>
                <span className="text-[9px] text-slate-400 block">≥ Valid. Ticket ou Virada Mês</span>
              </div>
              <div>
                <span className="text-[10px] text-amber-600 dark:text-amber-400 uppercase tracking-wider font-bold block">
                  Comissão Prevista (Em Trânsito)
                </span>
                <span className="text-sm font-black text-amber-600 dark:text-amber-400">{formatBrl(currentAuditingSummary.expectedCommission || 0)}</span>
                <span className="text-[9px] text-slate-400 block">Aguardando descarga</span>
              </div>
            </div>

            {/* Tabela de Embarques */}
            <div className="flex-1 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-xl">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-100 dark:bg-slate-900/80 text-slate-600 dark:text-slate-300 font-bold uppercase tracking-wider sticky top-0 border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="py-2.5 px-3">CT-e / Data</th>
                    <th className="py-2.5 px-3">Tomador / Cliente</th>
                    <th className="py-2.5 px-3">Rota (Origem → Destino)</th>
                    <th className="py-2.5 px-3">Motorista / Placa</th>
                    <th className="py-2.5 px-3 text-right">Frete Bruto</th>
                    <th className="py-2.5 px-3 text-right">Lucro Real</th>
                    <th className="py-2.5 px-3 text-right cursor-help" title="As comissões são contabilizadas na folha de pagamento após a confirmação da descarga do veículo (a partir de Valid. de Ticket) ou na virada de mês para embarques efetivados no final do mês.">
                      {currentAuditingSummary.regime === 'Gestor AG' ? `Comissão (${currentAuditingSummary.commissionPct}%)` : 'Comissão (R$)'} ℹ️
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
                  {currentAuditingSummary.shipments.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-400">
                        Nenhum embarque faturado com CT-e encontrado no período selecionado.
                      </td>
                    </tr>
                  ) : (
                    currentAuditingSummary.shipments.map(s => (
                      <tr key={s.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                        <td className="py-2 px-3 whitespace-nowrap">
                          <span className="font-bold text-slate-900 dark:text-white block">{s.cte}</span>
                          <span className="text-[10px] text-slate-400 block">{s.date}</span>
                          {s.isEligible ? (
                            s.isEndOfMonthException ? (
                              <span 
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-100 text-purple-800 dark:bg-purple-950/70 dark:text-purple-300 border border-purple-300 dark:border-purple-800"
                                title="Exceção de Virada de Mês: Carregamento efetivado no final do mês (dia ≥ 20). Comissão liberada na competência de carregamento."
                              >
                                🟣 Liberada (Virada de Mês • {s.status})
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                                🟢 Liberada ({s.status})
                              </span>
                            )
                          ) : (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300 border border-amber-300 dark:border-amber-800" title="Aguardando confirmação de descarga">
                              🟡 Prevista ({s.status})
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3 max-w-[150px] truncate" title={s.clientName}>
                          {s.clientName}
                        </td>
                        <td className="py-2 px-3 text-[11px] text-slate-600 dark:text-slate-300 max-w-[170px] truncate" title={`${s.origin} → ${s.destination}`}>
                          {s.origin} → {s.destination}
                        </td>
                        <td className="py-2 px-3 whitespace-nowrap text-[11px]">
                          <span className="text-slate-700 dark:text-slate-300 block line-clamp-1">{s.driverName}</span>
                          <span className="text-[10px] text-slate-400 font-mono">{s.plate}</span>
                        </td>
                        <td className="py-2 px-3 text-right font-medium text-slate-600 dark:text-slate-300 whitespace-nowrap">
                          {formatBrl(s.companyFreight)}
                        </td>
                        <td className="py-2 px-3 text-right font-bold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                          {formatBrl(s.netProfit)}
                        </td>
                        <td className="py-2 px-3 text-right font-black text-amber-600 dark:text-amber-400 whitespace-nowrap">
                          {formatBrl(s.commissionVal)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Rodapé do Modal */}
            <div className="flex items-center justify-between pt-3 mt-3 border-t border-slate-100 dark:border-slate-700">
              <span className="text-xs text-slate-400">
                Auditoria gerada com base nos registros do Módulo Fiscal & Operacional
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setAuditingLeaderId(null)}
                  className="px-4 py-2 rounded-xl text-xs font-bold border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
                >
                  Fechar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const lId = currentAuditingSummary.leader.id;
                    const bal = currentAuditingSummary.balancePending;
                    setAuditingLeaderId(null);
                    handleOpenPlanModal(lId, bal);
                  }}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer"
                >
                  Planejar Pagamento deste Saldo
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE BAIXA DE PAGAMENTO E ANEXAÇÃO DE COMPROVANTE */}
      <AccountsPayableSettlementModal
        isOpen={isSettlementModalOpen}
        onClose={() => {
          setIsSettlementModalOpen(false);
          setSettlingItem(null);
        }}
        item={settlingItem}
        onConfirm={handleConfirmSettlement}
        onReopen={handleReopenItem}
      />

      {/* 8. MODAL DE LANÇAMENTO DE DOCUMENTOS DA FOLHA (NF E COMPROVANTE) */}
      <PayrollDocsModal
        isOpen={Boolean(selectedSettlementForDocs)}
        onClose={() => setSelectedSettlementForDocs(null)}
        settlement={selectedSettlementForDocs}
        onSave={handleSavePayrollDocs}
      />

      {/* 9. MODAL DE GERENCIAMENTO DE COLABORADORES EXCLUÍDOS DA FOLHA */}
      {isExcludedUsersModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-xs animate-fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-slate-900/60">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                  <UserX className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Colaboradores Excluídos da Folha
                  </h3>
                  <p className="text-xs text-slate-400">
                    Estes usuários não são exibidos nas apurações mensais da folha
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsExcludedUsersModalOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 sm:p-5 space-y-2.5 overflow-y-auto flex-1">
              {excludedPayrollUserIds.length === 0 ? (
                <div className="text-center py-8 text-slate-400">
                  <UserX className="w-8 h-8 mx-auto mb-2 opacity-30 text-slate-500" />
                  <p className="text-xs font-semibold">Nenhum colaborador excluído no momento.</p>
                </div>
              ) : (
                excludedPayrollUserIds.map(uid => {
                  const u = (users || []).find(usr => usr.id === uid);
                  if (!u) return null;
                  return (
                    <div
                      key={u.id}
                      className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs"
                    >
                      <div className="truncate mr-2">
                        <span className="font-bold text-slate-900 dark:text-white block truncate">
                          {u.name}
                        </span>
                        <span className="text-[10px] text-slate-400 truncate block">
                          Perfil: {u.profile} {u.branchId ? `• Filial: ${u.branchId}` : ''}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRestoreUserToPayroll(u.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition-all cursor-pointer shrink-0 active:scale-95"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Restaurar</span>
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-slate-900/60">
              {excludedPayrollUserIds.length > 0 ? (
                <button
                  type="button"
                  onClick={handleRestoreAllUsersToPayroll}
                  className="text-xs text-rose-600 dark:text-rose-400 hover:underline font-bold cursor-pointer"
                >
                  Restaurar Todos
                </button>
              ) : <div />}
              <button
                type="button"
                onClick={() => setIsExcludedUsersModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 10. MODAL DE IMPORTAÇÃO E LEITURA AUTOMÁTICA DE GUIAS DE IMPOSTOS */}
      <TaxInvoiceImportModal
        isOpen={isTaxImportModalOpen}
        onClose={() => setIsTaxImportModalOpen(false)}
        onImportSuccess={handleImportTaxes}
      />

      {/* 11. MODAL DE CADASTRO E EDIÇÃO MANUAL DE GUIAS DE IMPOSTOS */}
      <TaxManualModal
        isOpen={isTaxManualModalOpen}
        onClose={() => {
          setIsTaxManualModalOpen(false);
          setEditingTaxTransaction(null);
        }}
        onSave={handleSaveTaxManual}
        initialData={editingTaxTransaction}
        currentUser={currentUser}
      />

      {/* 12. MODAL DE CONFIRMAÇÃO DE EXCLUSÃO DE GUIA OU LANÇAMENTO */}
      {isTaxDeleteModalOpen && taxToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-md p-6 overflow-hidden">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 rounded-2xl shrink-0">
                <Trash2 className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Excluir Lançamento
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Tem certeza que deseja excluir este lançamento? Esta ação removerá a guia da nuvem para todos os usuários com acesso.
                </p>

                <div className="mt-4 p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 space-y-1.5 text-xs">
                  <div className="font-bold text-slate-900 dark:text-white truncate">
                    {taxToDelete.title || taxToDelete.originalItem?.description}
                  </div>
                  <div className="text-slate-500 dark:text-slate-400">
                    Favorecido: <span className="font-medium text-slate-700 dark:text-slate-300">{taxToDelete.entityName || taxToDelete.originalItem?.supplierOrClientName}</span>
                  </div>
                  <div className="flex items-center justify-between pt-1 border-t border-slate-200 dark:border-slate-700 text-xs">
                    <span className="text-slate-500">Valor a Pagar:</span>
                    <strong className="text-purple-600 dark:text-purple-400 font-mono font-bold">
                      {formatBrl(taxToDelete.payableAmount || taxToDelete.totalAmount)}
                    </strong>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 mt-6">
                  <button
                    type="button"
                    disabled={isDeletingTax}
                    onClick={() => {
                      setIsTaxDeleteModalOpen(false);
                      setTaxToDelete(null);
                    }}
                    className="px-4 py-2 rounded-xl text-xs font-bold border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    disabled={isDeletingTax}
                    onClick={handleConfirmDeleteTax}
                    className="flex items-center gap-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-md shadow-rose-600/30 cursor-pointer disabled:opacity-50 active:scale-95"
                  >
                    {isDeletingTax ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Excluindo...</span>
                      </>
                    ) : (
                      <>
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Sim, Excluir</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
