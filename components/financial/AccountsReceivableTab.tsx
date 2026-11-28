import React, { useState, useMemo } from 'react';
import type { 
  FinancialTransaction, 
  Shipment, 
  Cargo, 
  Client, 
  User 
} from '../../types';
import { FinancialTransactionStatus, ShipmentStatus } from '../../types';
import { isDemoUser } from '../../auth';
import { 
  Plus, 
  Search, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  Building2, 
  Tag, 
  Truck, 
  FileText, 
  ExternalLink, 
  Download, 
  Eye, 
  X, 
  ArrowUpRight,
  TrendingUp,
  RotateCcw,
  Receipt,
  Edit3,
  Trash2,
  Copy,
  Printer,
  Paperclip,
  UploadCloud,
  Check,
  FileSpreadsheet
} from 'lucide-react';
import { getShipmentCteFileUrl, openDocumentInNewTab } from '../../utils/documentViewer';
import { parseBrazilianCurrency, formatBrl } from '../../utils/financialCalculations';

export interface CteInvoice {
  id: string;
  shipmentId?: string;
  cteNumber?: string;
  transactionId?: string;
  invoiceNumber: string; // Ex: FAT-1014
  issueDate: string;    // Data de Lançamento / Emissão (YYYY-MM-DD)
  dueDate: string;      // Data de Vencimento do Boleto (YYYY-MM-DD)
  amount: number;       // Valor da Fatura / Boleto (R$)
  paymentMethod: string;// Boleto Bancário, PIX, etc.
  barcode?: string;     // Linha digitável do boleto
  pixKey?: string;      // Chave Pix
  fileUrl?: string;     // Anexo do boleto / fatura
  fileName?: string;    // Nome do arquivo
  fileType?: string;    // Tipo mime
  notes?: string;       // Observações
  clientName?: string;
  clientCnpj?: string;
  origin?: string;
  destination?: string;
  tonnage?: number;
  driverName?: string;
  horsePlate?: string;
  createdAt: string;
}

interface AccountsReceivableTabProps {
  transactions: FinancialTransaction[];
  onAddTransaction: (t: Omit<FinancialTransaction, 'id' | 'createdAt'>) => void;
  onUpdateStatus: (id: string, status: FinancialTransactionStatus) => void;
  shipments?: Shipment[];
  cargos?: Cargo[];
  clients?: Client[];
  users?: User[];
  currentUser?: User | null;
}

const STORAGE_CTE_RECEIVABLES_STATUS_KEY = 'transcunha_cte_receivables_status_v1';
const STORAGE_CTE_INVOICES_KEY = 'transcunha_cte_invoices_v1';

export const AccountsReceivableTab: React.FC<AccountsReceivableTabProps> = ({
  transactions,
  onAddTransaction,
  onUpdateStatus,
  shipments = [],
  cargos = [],
  clients = [],
  users = [],
  currentUser,
}) => {
  // Sub-abas de Contas a Receber
  const [activeSection, setActiveSection] = useState<'all' | 'cte' | 'manual'>('all');

  // Filtros Gerais
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedClientId, setSelectedClientId] = useState<string>('all');
  const [cteSearchNumber, setCteSearchNumber] = useState('');

  // Filtro de Período
  const [periodPreset, setPeriodPreset] = useState<'all' | 'current_month' | 'last_month' | 'custom'>('all');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  // Status de Baixa de CT-e em cache local
  const [cteStatusOverrides, setCteStatusOverrides] = useState<Record<string, 'Pendente' | 'Recebido' | 'Atrasado'>>(() => {
    if (isDemoUser(currentUser)) return {};
    try {
      const saved = localStorage.getItem(STORAGE_CTE_RECEIVABLES_STATUS_KEY);
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.warn('Erro ao ler status de CT-es a receber do localStorage', e);
    }
    return {};
  });

  // Faturas / Boletos vinculados aos recebíveis
  const [invoicesMap, setInvoicesMap] = useState<Record<string, CteInvoice>>(() => {
    if (isDemoUser(currentUser)) return {};
    try {
      const saved = localStorage.getItem(STORAGE_CTE_INVOICES_KEY);
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.warn('Erro ao ler faturas de CT-e do localStorage', e);
    }
    return {};
  });

  // Modal de Emissão / Vínculo de Fatura
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [invoiceTargetItem, setInvoiceTargetItem] = useState<any>(null);
  const [formInvoiceNumber, setFormInvoiceNumber] = useState('');
  const [formIssueDate, setFormIssueDate] = useState('');
  const [formDueDate, setFormDueDate] = useState('');
  const [formInvoiceAmount, setFormInvoiceAmount] = useState('');
  const [formPaymentMethod, setFormPaymentMethod] = useState('Boleto Bancário');
  const [formBarcode, setFormBarcode] = useState('');
  const [formPixKey, setFormPixKey] = useState('');
  const [formInvoiceFileUrl, setFormInvoiceFileUrl] = useState('');
  const [formInvoiceFileName, setFormInvoiceFileName] = useState('');
  const [formInvoiceFileType, setFormInvoiceFileType] = useState('');
  const [formInvoiceNotes, setFormInvoiceNotes] = useState('');
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Modal de Espelho / Visualização da Fatura
  const [selectedInvoiceToView, setSelectedInvoiceToView] = useState<CteInvoice | null>(null);

  // Modal de Lançamento Manual Avulso
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState(new Date().toISOString().split('T')[0]);
  const [category, setCategory] = useState('Receita de Fretes');
  const [clientName, setClientName] = useState('');
  const [documentNumber, setDocumentNumber] = useState('');
  const [notes, setNotes] = useState('');

  // Data atual
  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);

  // Prefixos de mês
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

  // 1. Processar CT-es como Contas a Receber por Cliente
  const cteReceivables = useMemo(() => {
    if (!shipments || shipments.length === 0) return [];

    const cargosMap = new Map((cargos || []).map(c => [c.id, c]));
    const clientsMap = new Map((clients || []).map(cl => [cl.id, cl]));

    return shipments
      .filter(s => {
        const cteFile = getShipmentCteFileUrl(s);
        return Boolean(s.cteNumber || cteFile);
      })
      .map(s => {
        const cargo = s.cargoId ? cargosMap.get(s.cargoId) : undefined;
        const client = cargo?.clientId ? clientsMap.get(cargo.clientId) : undefined;
        const cteFile = getShipmentCteFileUrl(s);
        const cteNum = s.cteNumber || 'S/N';
        const clientDisplayName = client?.nomeFantasia || client?.razaoSocial || 'Cliente não identificado';
        const clientId = client?.id || cargo?.clientId || '';

        const ton = Number(s.shipmentTonnage) || 0;
        const companyRate = s.companyFreightRateSnapshot ?? cargo?.companyFreightValuePerTon ?? 0;
        const companyFreightTotal = companyRate > 0 
          ? (companyRate * ton) 
          : ((Number(s.driverFreightValue) || 0) * 1.15);

        const dateVal = s.scheduledDate || (s.createdAt ? s.createdAt.split('T')[0] : todayStr);
        const emissionDate = s.cteEmissionDate ? s.cteEmissionDate.split(' ')[0] : dateVal;

        // Status
        const override = cteStatusOverrides[s.id];
        let status: 'Pendente' | 'Recebido' | 'Atrasado' = 'Pendente';

        if (override) {
          status = override;
        } else if (s.status === ShipmentStatus.Finalizado) {
          status = 'Recebido';
        } else if (dateVal < todayStr) {
          status = 'Atrasado';
        }

        return {
          id: `cte_${s.id}`,
          shipmentId: s.id,
          orderId: s.orderId,
          cteNumber: cteNum,
          cteUrl: cteFile,
          emissionDate,
          dueDate: dateVal,
          clientId,
          clientName: clientDisplayName,
          clientCnpj: client?.cnpj,
          driverName: s.driverName || 'Motorista',
          horsePlate: s.horsePlate || '-',
          tonnage: ton,
          receivableAmount: companyFreightTotal,
          status,
          origin: cargo?.origin || 'Origem',
          destination: cargo?.destination || 'Destino',
        };
      })
      .sort((a, b) => new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime());
  }, [shipments, cargos, clients, cteStatusOverrides, todayStr]);

  // 2. Processar Lançamentos Manuais a Receber
  const manualReceivables = useMemo(() => {
    return (transactions || [])
      .filter(t => t.type === 'receivable')
      .map(t => {
        const isReceived = t.status === FinancialTransactionStatus.Recebido || t.status === FinancialTransactionStatus.Pago;
        const isOverdue = t.status === FinancialTransactionStatus.Atrasado || (!isReceived && t.dueDate < todayStr);
        const displayStatus: 'Pendente' | 'Recebido' | 'Atrasado' = isReceived ? 'Recebido' : isOverdue ? 'Atrasado' : 'Pendente';

        return {
          id: t.id,
          description: t.description,
          clientName: t.supplierOrClientName || 'Cliente Geral',
          category: t.category,
          receivableAmount: t.amount,
          dueDate: t.dueDate,
          status: displayStatus,
          documentNumber: t.documentNumber,
        };
      })
      .sort((a, b) => new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime());
  }, [transactions, todayStr]);

  // Alternar status de CT-e (Dar Baixa / Receber)
  const handleToggleCteReceivedStatus = (shipmentId: string, currentStatus: string) => {
    const newStatus: 'Pendente' | 'Recebido' = currentStatus === 'Recebido' ? 'Pendente' : 'Recebido';
    const updated = { ...cteStatusOverrides, [shipmentId]: newStatus };
    setCteStatusOverrides(updated);
    try {
      localStorage.setItem(STORAGE_CTE_RECEIVABLES_STATUS_KEY, JSON.stringify(updated));
    } catch (e) {
      console.error(e);
    }
  };

  // Filtro de Período
  const matchesPeriod = (dateStr: string) => {
    if (periodPreset === 'all') return true;
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

  // Filtragem: CT-e
  const filteredCtes = useMemo(() => {
    return cteReceivables.filter(item => {
      const inv = invoicesMap[item.shipmentId] || invoicesMap[item.id];
      if (searchTerm) {
        const s = searchTerm.toLowerCase();
        const match = 
          item.cteNumber.toLowerCase().includes(s) ||
          item.clientName.toLowerCase().includes(s) ||
          item.driverName.toLowerCase().includes(s) ||
          item.horsePlate.toLowerCase().includes(s) ||
          item.shipmentId.toLowerCase().includes(s) ||
          (inv?.invoiceNumber && inv.invoiceNumber.toLowerCase().includes(s));
        if (!match) return false;
      }

      if (selectedClientId !== 'all' && item.clientId !== selectedClientId) {
        return false;
      }

      if (cteSearchNumber && !item.cteNumber.toLowerCase().includes(cteSearchNumber.toLowerCase())) {
        return false;
      }

      if (statusFilter !== 'all' && item.status !== statusFilter) {
        return false;
      }

      const effectiveDueDate = inv?.dueDate || item.dueDate;
      if (!matchesPeriod(effectiveDueDate) && !matchesPeriod(item.emissionDate)) {
        return false;
      }

      return true;
    });
  }, [cteReceivables, searchTerm, selectedClientId, cteSearchNumber, statusFilter, periodPreset, customStartDate, customEndDate, currentMonthPrefix, lastMonthPrefix, invoicesMap]);

  // Filtragem: Manuais
  const filteredManuals = useMemo(() => {
    return manualReceivables.filter(item => {
      const inv = invoicesMap[item.id];
      if (searchTerm) {
        const s = searchTerm.toLowerCase();
        const match = 
          item.description.toLowerCase().includes(s) ||
          item.clientName.toLowerCase().includes(s) ||
          item.category.toLowerCase().includes(s) ||
          (item.documentNumber && item.documentNumber.toLowerCase().includes(s)) ||
          (inv?.invoiceNumber && inv.invoiceNumber.toLowerCase().includes(s));
        if (!match) return false;
      }

      if (statusFilter !== 'all' && item.status !== statusFilter) {
        return false;
      }

      const effectiveDueDate = inv?.dueDate || item.dueDate;
      if (!matchesPeriod(effectiveDueDate)) {
        return false;
      }

      return true;
    });
  }, [manualReceivables, searchTerm, statusFilter, periodPreset, customStartDate, customEndDate, currentMonthPrefix, lastMonthPrefix, invoicesMap]);

  // Lista Consolidada a Receber
  const consolidatedList = useMemo(() => {
    const list: Array<{
      id: string;
      kind: 'cte' | 'manual';
      docNumber: string;
      title: string;
      clientName: string;
      categoryOrRoute: string;
      dueDate: string;
      receivableAmount: number;
      status: 'Pendente' | 'Recebido' | 'Atrasado';
      documentUrl?: string | null;
      details?: string;
      invoice?: CteInvoice;
      originalItem: any;
    }> = [];

    if (activeSection === 'all' || activeSection === 'cte') {
      filteredCtes.forEach(cte => {
        const inv = invoicesMap[cte.shipmentId] || invoicesMap[cte.id];
        list.push({
          id: cte.id,
          kind: 'cte',
          docNumber: `CT-e nº ${cte.cteNumber}`,
          title: `Embarque ${cte.shipmentId} • ${cte.driverName} (${cte.horsePlate})`,
          clientName: cte.clientName,
          categoryOrRoute: `Frete Empresa • ${cte.origin} → ${cte.destination}`,
          dueDate: inv?.dueDate || cte.dueDate,
          receivableAmount: cte.receivableAmount,
          status: cte.status,
          documentUrl: cte.cteUrl,
          details: `${cte.tonnage.toLocaleString('pt-BR')} ton`,
          invoice: inv,
          originalItem: cte,
        });
      });
    }

    if (activeSection === 'all' || activeSection === 'manual') {
      filteredManuals.forEach(man => {
        const inv = invoicesMap[man.id] || (man.documentNumber?.startsWith('FAT-') ? {
          id: `inv_man_${man.id}`,
          transactionId: man.id,
          invoiceNumber: man.documentNumber,
          issueDate: man.dueDate,
          dueDate: man.dueDate,
          amount: man.receivableAmount,
          paymentMethod: 'Boleto Bancário',
          clientName: man.clientName,
          createdAt: new Date().toISOString()
        } : undefined);

        list.push({
          id: `man_${man.id}`,
          kind: 'manual',
          docNumber: man.documentNumber ? `Doc ${man.documentNumber}` : 'Avulso',
          title: man.description,
          clientName: man.clientName,
          categoryOrRoute: man.category,
          dueDate: inv?.dueDate || man.dueDate,
          receivableAmount: man.receivableAmount,
          status: man.status,
          invoice: invoicesMap[man.id] || inv,
          originalItem: man,
        });
      });
    }

    return list.sort((a, b) => new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime());
  }, [activeSection, filteredCtes, filteredManuals, invoicesMap]);

  // KPIs
  const kpiPending = useMemo(() => {
    return consolidatedList.filter(i => i.status === 'Pendente').reduce((acc, i) => acc + i.receivableAmount, 0);
  }, [consolidatedList]);

  const kpiReceived = useMemo(() => {
    return consolidatedList.filter(i => i.status === 'Recebido').reduce((acc, i) => acc + i.receivableAmount, 0);
  }, [consolidatedList]);

  const kpiOverdue = useMemo(() => {
    return consolidatedList.filter(i => i.status === 'Atrasado').reduce((acc, i) => acc + i.receivableAmount, 0);
  }, [consolidatedList]);

  const kpiTotal = useMemo(() => {
    return consolidatedList.reduce((acc, i) => acc + i.receivableAmount, 0);
  }, [consolidatedList]);

  const subtotalCtes = useMemo(() => filteredCtes.reduce((acc, i) => acc + i.receivableAmount, 0), [filteredCtes]);
  const subtotalManuals = useMemo(() => filteredManuals.reduce((acc, i) => acc + i.receivableAmount, 0), [filteredManuals]);

  // Submit Lançamento Manual
  const handleSubmitManual = (e: React.FormEvent) => {
    e.preventDefault();
    if (!description || !amount || !dueDate) return;

    const parsedAmount = parseBrazilianCurrency(amount);
    if (parsedAmount <= 0) {
      alert('Informe um valor válido.');
      return;
    }

    onAddTransaction({
      type: 'receivable',
      description,
      amount: parsedAmount,
      dueDate,
      status: FinancialTransactionStatus.Pendente,
      category,
      supplierOrClientName: clientName || undefined,
      documentNumber: documentNumber || undefined,
      notes: notes || undefined,
    });

    setDescription('');
    setAmount('');
    setClientName('');
    setDocumentNumber('');
    setNotes('');
    setIsModalOpen(false);
  };

  // Salvar Fatura / Boleto Vinculado
  const handleOpenInvoiceModal = (item: any) => {
    setInvoiceTargetItem(item);
    const existing: CteInvoice | undefined = item.invoice;

    if (existing) {
      setFormInvoiceNumber(existing.invoiceNumber || '');
      setFormIssueDate(existing.issueDate || todayStr);
      setFormDueDate(existing.dueDate || item.dueDate);
      setFormInvoiceAmount(existing.amount ? existing.amount.toFixed(2).replace('.', ',') : (item.receivableAmount ? item.receivableAmount.toFixed(2).replace('.', ',') : ''));
      setFormPaymentMethod(existing.paymentMethod || 'Boleto Bancário');
      setFormBarcode(existing.barcode || '');
      setFormPixKey(existing.pixKey || '');
      setFormInvoiceFileUrl(existing.fileUrl || '');
      setFormInvoiceFileName(existing.fileName || '');
      setFormInvoiceFileType(existing.fileType || '');
      setFormInvoiceNotes(existing.notes || '');
    } else {
      // Sugestão de número da fatura
      const defaultNumber = item.kind === 'cte' && item.originalItem.cteNumber && item.originalItem.cteNumber !== 'S/N'
        ? `FAT-${item.originalItem.cteNumber}`
        : (item.docNumber?.startsWith('FAT-') ? item.docNumber : `FAT-${Math.floor(1000 + Math.random() * 9000)}`);

      setFormInvoiceNumber(defaultNumber);
      // Data de lançamento: data de hoje ou data de emissão do CT-e
      setFormIssueDate(item.originalItem?.emissionDate ? item.originalItem.emissionDate.split(' ')[0] : todayStr);
      // Data de vencimento: PUXA DIRETAMENTE A DATA DE VENCIMENTO DO CT-E / RECEBÍVEL!
      setFormDueDate(item.dueDate || todayStr);
      // Valor do boleto / fatura: PUXA DIRETAMENTE O VALOR A RECEBER!
      setFormInvoiceAmount(item.receivableAmount ? item.receivableAmount.toFixed(2).replace('.', ',') : '');
      setFormPaymentMethod('Boleto Bancário');
      setFormBarcode('');
      setFormPixKey('');
      setFormInvoiceFileUrl('');
      setFormInvoiceFileName('');
      setFormInvoiceFileType('');
      setFormInvoiceNotes('');
    }

    setIsInvoiceModalOpen(true);
  };

  const applyDueDatePreset = (days: number) => {
    const base = formIssueDate ? new Date(formIssueDate + 'T00:00:00') : new Date();
    const newDate = new Date(base.getTime() + days * 86400000);
    setFormDueDate(newDate.toISOString().split('T')[0]);
  };

  const copyToClipboard = (text: string, fieldName: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2500);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 15 * 1024 * 1024) {
      alert('O arquivo selecionado é maior que 15MB. Por favor, escolha um arquivo menor.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      setFormInvoiceFileUrl(base64);
      setFormInvoiceFileName(file.name);
      setFormInvoiceFileType(file.type);
    };
    reader.readAsDataURL(file);
  };

  const handleSaveInvoice = (e: React.FormEvent) => {
    e.preventDefault();
    if (!invoiceTargetItem) return;

    const parsedAmt = parseBrazilianCurrency(formInvoiceAmount) || invoiceTargetItem.receivableAmount;
    const itemKey = invoiceTargetItem.kind === 'cte' 
      ? (invoiceTargetItem.originalItem.shipmentId || invoiceTargetItem.id)
      : (invoiceTargetItem.originalItem.id || invoiceTargetItem.id);

    const newInvoice: CteInvoice = {
      id: invoiceTargetItem.invoice?.id || `inv_${Date.now()}`,
      shipmentId: invoiceTargetItem.kind === 'cte' ? invoiceTargetItem.originalItem.shipmentId : undefined,
      cteNumber: invoiceTargetItem.kind === 'cte' ? invoiceTargetItem.originalItem.cteNumber : undefined,
      transactionId: invoiceTargetItem.kind === 'manual' ? invoiceTargetItem.originalItem.id : undefined,
      invoiceNumber: formInvoiceNumber.trim() || `FAT-${Date.now().toString().slice(-4)}`,
      issueDate: formIssueDate || todayStr,
      dueDate: formDueDate || invoiceTargetItem.dueDate,
      amount: parsedAmt,
      paymentMethod: formPaymentMethod,
      barcode: formBarcode.trim() || undefined,
      pixKey: formPixKey.trim() || undefined,
      fileUrl: formInvoiceFileUrl || undefined,
      fileName: formInvoiceFileName || undefined,
      fileType: formInvoiceFileType || undefined,
      notes: formInvoiceNotes.trim() || undefined,
      clientName: invoiceTargetItem.clientName,
      clientCnpj: invoiceTargetItem.originalItem?.clientCnpj,
      origin: invoiceTargetItem.originalItem?.origin,
      destination: invoiceTargetItem.originalItem?.destination,
      tonnage: invoiceTargetItem.originalItem?.tonnage,
      driverName: invoiceTargetItem.originalItem?.driverName,
      horsePlate: invoiceTargetItem.originalItem?.horsePlate,
      createdAt: invoiceTargetItem.invoice?.createdAt || new Date().toISOString()
    };

    const updated: Record<string, CteInvoice> = { ...invoicesMap, [String(itemKey)]: newInvoice };
    if (invoiceTargetItem.kind === 'cte' && invoiceTargetItem.id) {
      updated[String(invoiceTargetItem.id)] = newInvoice;
    }
    if (invoiceTargetItem.originalItem?.shipmentId) {
      updated[String(invoiceTargetItem.originalItem.shipmentId)] = newInvoice;
    }

    setInvoicesMap(updated);
    try {
      localStorage.setItem(STORAGE_CTE_INVOICES_KEY, JSON.stringify(updated));
    } catch (err) {
      console.error(err);
    }

    setIsInvoiceModalOpen(false);
    setInvoiceTargetItem(null);
  };

  const handleDeleteInvoice = (item: any) => {
    if (!window.confirm(`Deseja remover o vínculo da fatura "${item.invoice?.invoiceNumber}" deste lançamento?`)) return;

    const itemKey = item.kind === 'cte' 
      ? (item.originalItem.shipmentId || item.id)
      : (item.originalItem.id || item.id);

    const updated: Record<string, CteInvoice> = { ...invoicesMap };
    delete updated[String(itemKey)];
    if (item.id) delete updated[String(item.id)];
    if (item.originalItem?.shipmentId) delete updated[String(item.originalItem.shipmentId)];

    setInvoicesMap(updated);
    try {
      localStorage.setItem(STORAGE_CTE_INVOICES_KEY, JSON.stringify(updated));
    } catch (err) {
      console.error(err);
    }
  };

  // Exportar CSV
  const handleExportCsv = () => {
    if (consolidatedList.length === 0) return;

    const headers = ['Tipo', 'Documento', 'Cliente / Tomador', 'Rota / Classificação', 'Vencimento', 'Valor a Receber', 'Status', 'Fatura / Boleto', 'Data Lançamento Fatura'];
    const rows = consolidatedList.map(item => [
      item.kind === 'cte' ? 'CT-e / Frete' : 'Avulso',
      item.docNumber,
      `"${item.clientName.replace(/"/g, '""')}"`,
      `"${item.categoryOrRoute.replace(/"/g, '""')}"`,
      new Date(item.dueDate + 'T00:00:00').toLocaleDateString('pt-BR'),
      item.receivableAmount.toFixed(2).replace('.', ','),
      item.status,
      item.invoice ? `"${item.invoice.invoiceNumber}"` : '""',
      item.invoice ? `"${new Date(item.invoice.issueDate + 'T00:00:00').toLocaleDateString('pt-BR')}"` : '""'
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `contas_a_receber_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* 1. SELETOR DE VISÃO (SUB-ABAS) */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white dark:bg-slate-800 p-2 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
        <div className="flex items-center gap-1.5 overflow-x-auto p-1">
          <button
            onClick={() => setActiveSection('all')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all whitespace-nowrap cursor-pointer ${
              activeSection === 'all'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700/60'
            }`}
          >
            <ArrowUpRight className="w-4 h-4" />
            <span>Todos os Recebíveis</span>
            <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-white/20 text-white font-mono">
              {cteReceivables.length + manualReceivables.length}
            </span>
          </button>

          <button
            onClick={() => setActiveSection('cte')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all whitespace-nowrap cursor-pointer ${
              activeSection === 'cte'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700/60'
            }`}
          >
            <Truck className="w-4 h-4 text-sky-400" />
            <span>CT-e por Cliente</span>
            <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-mono">
              {cteReceivables.length}
            </span>
          </button>

          <button
            onClick={() => setActiveSection('manual')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all whitespace-nowrap cursor-pointer ${
              activeSection === 'manual'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700/60'
            }`}
          >
            <Tag className="w-4 h-4" />
            <span>Recebíveis Avulsos</span>
            <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-mono">
              {manualReceivables.length}
            </span>
          </button>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-600/20 transition-all cursor-pointer active:scale-95 whitespace-nowrap self-end sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Novo Recebível Avulso</span>
        </button>
      </div>

      {/* 2. CARDS DE KPIS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total a Receber */}
        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-sky-500" />
              A Receber (Pendente)
            </span>
            <div className="text-2xl font-black text-sky-600 dark:text-sky-400 mt-1.5 tracking-tight">
              {formatBrl(kpiPending)}
            </div>
            <span className="text-[11px] text-slate-400 mt-0.5 block">
              Faturamentos aguardando recebimento
            </span>
          </div>
          <div className="p-3.5 bg-sky-50 dark:bg-sky-950/40 text-sky-600 dark:text-sky-400 rounded-2xl">
            <Clock className="w-6 h-6" />
          </div>
        </div>

        {/* Total Recebido */}
        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              Total Recebido
            </span>
            <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1.5 tracking-tight">
              {formatBrl(kpiReceived)}
            </div>
            <span className="text-[11px] text-slate-400 mt-0.5 block">
              Faturamento liquidado
            </span>
          </div>
          <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 rounded-2xl">
            <CheckCircle2 className="w-6 h-6" />
          </div>
        </div>

        {/* Vencidos */}
        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 text-rose-500" />
              Vencidos / Atrasados
            </span>
            <div className="text-2xl font-black text-rose-600 dark:text-rose-400 mt-1.5 tracking-tight">
              {formatBrl(kpiOverdue)}
            </div>
            <span className="text-[11px] text-slate-400 mt-0.5 block">
              Cobranças vencidas
            </span>
          </div>
          <div className="p-3.5 bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 rounded-2xl">
            <AlertCircle className="w-6 h-6" />
          </div>
        </div>

        {/* Composição */}
        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Composição da Carteira
            </span>
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
              {formatBrl(kpiTotal)}
            </span>
          </div>
          <div className="mt-2 space-y-1.5 text-[11px]">
            <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
              <span className="flex items-center gap-1">
                <Truck className="w-3 h-3 text-sky-500" />
                CT-e por Cliente:
              </span>
              <span className="font-bold">{formatBrl(subtotalCtes)}</span>
            </div>
            <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
              <span className="flex items-center gap-1">
                <Tag className="w-3 h-3 text-blue-500" />
                Recebíveis Avulsos:
              </span>
              <span className="font-bold">{formatBrl(subtotalManuals)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. BARRA DE FILTROS AVANÇADOS */}
      <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-3">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          {/* Busca por texto */}
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por cliente, nº do CT-e, motorista, placa, embarque..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-xl text-xs sm:text-sm border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Filtro por Cliente */}
            <div className="relative min-w-[180px]">
              <select
                value={selectedClientId}
                onChange={(e) => setSelectedClientId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl text-xs font-semibold border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white outline-none cursor-pointer"
              >
                <option value="all">🏢 Todos os Clientes</option>
                {(clients || []).map(cl => (
                  <option key={cl.id} value={cl.id}>
                    {cl.nomeFantasia || cl.razaoSocial}
                  </option>
                ))}
              </select>
            </div>

            {/* Filtro específico por número de CT-e */}
            {(activeSection === 'all' || activeSection === 'cte') && (
              <div className="relative w-36">
                <input
                  type="text"
                  placeholder="Nº CT-e..."
                  value={cteSearchNumber}
                  onChange={(e) => setCteSearchNumber(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl text-xs border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white outline-none"
                />
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
                <option value="Recebido">🟢 Recebido</option>
                <option value="Atrasado">🔴 Atrasado</option>
              </select>
            </div>

            {/* Filtro por Período */}
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
              title="Exportar planilha CSV de contas a receber"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Exportar</span>
            </button>
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

      {/* 4. TABELA PRINCIPAL DE CONTAS A RECEBER */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-50 dark:bg-slate-900/60 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="py-3.5 px-4">Tipo / Documento</th>
                <th className="py-3.5 px-4">Cliente / Tomador do Frete</th>
                <th className="py-3.5 px-4">Rota / Embarque</th>
                <th className="py-3.5 px-4">Vencimento</th>
                <th className="py-3.5 px-4 text-right">Valor a Receber</th>
                <th className="py-3.5 px-4 text-center">Status</th>
                <th className="py-3.5 px-4 text-center">Fatura / Boleto</th>
                <th className="py-3.5 px-4 text-center">Documento</th>
                <th className="py-3.5 px-4 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
              {consolidatedList.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    <ArrowUpRight className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    <p className="font-semibold text-sm text-slate-600 dark:text-slate-300">Nenhum recebível encontrado</p>
                    <p className="text-xs text-slate-400 mt-1">Ajuste os filtros de busca ou cliente.</p>
                  </td>
                </tr>
              ) : (
                consolidatedList.map((item) => {
                  const isReceived = item.status === 'Recebido';
                  const isOverdue = item.status === 'Atrasado';

                  return (
                    <tr 
                      key={item.id} 
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-700/30 transition-colors"
                    >
                      {/* 1. Tipo / Documento */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          {item.kind === 'cte' ? (
                            <div className="p-1.5 bg-sky-50 dark:bg-sky-950/40 text-sky-600 dark:text-sky-400 rounded-lg shrink-0" title="CT-e por Cliente">
                              <Truck className="w-4 h-4" />
                            </div>
                          ) : (
                            <div className="p-1.5 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 rounded-lg shrink-0" title="Recebível Avulso">
                              <Tag className="w-4 h-4" />
                            </div>
                          )}
                          <div>
                            <span className="font-bold text-slate-900 dark:text-white block">
                              {item.docNumber}
                            </span>
                            <span className="text-[10px] text-slate-400 block line-clamp-1 max-w-[160px]">
                              {item.title}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* 2. Cliente / Tomador */}
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-800 dark:text-slate-100 line-clamp-1 max-w-[200px]" title={item.clientName}>
                          {item.clientName}
                        </div>
                        {item.kind === 'cte' && item.originalItem.clientCnpj && (
                          <span className="text-[10px] text-slate-400 font-mono block">
                            CNPJ: {item.originalItem.clientCnpj}
                          </span>
                        )}
                      </td>

                      {/* 3. Rota / Detalhes */}
                      <td className="py-3 px-4">
                        <span className="text-slate-700 dark:text-slate-300 font-medium line-clamp-1 max-w-[200px]" title={item.categoryOrRoute}>
                          {item.categoryOrRoute}
                        </span>
                        {item.details && (
                          <span className="text-[10px] text-slate-400 block" title={item.details}>
                            {item.details}
                          </span>
                        )}
                      </td>

                      {/* 4. Vencimento */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className={`font-semibold ${isOverdue ? 'text-rose-600 dark:text-rose-400 font-bold' : 'text-slate-700 dark:text-slate-300'}`}>
                          {new Date(item.dueDate + 'T00:00:00').toLocaleDateString('pt-BR')}
                        </span>
                        {item.kind === 'cte' && item.originalItem.emissionDate && (
                          <span className="text-[10px] text-slate-400 block">
                            Emissão: {new Date(item.originalItem.emissionDate + 'T00:00:00').toLocaleDateString('pt-BR')}
                          </span>
                        )}
                      </td>

                      {/* 5. Valor a Receber */}
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <span className="font-black text-sm text-sky-600 dark:text-sky-400 tracking-tight">
                          {formatBrl(item.receivableAmount)}
                        </span>
                      </td>

                      {/* 6. Status */}
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                          isReceived 
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800'
                            : isOverdue
                            ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border-rose-300 dark:border-rose-800'
                            : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-300 dark:border-amber-800'
                        }`}>
                          {isReceived && <CheckCircle2 className="w-3 h-3" />}
                          {isOverdue && <AlertCircle className="w-3 h-3" />}
                          {!isReceived && !isOverdue && <Clock className="w-3 h-3" />}
                          <span>{item.status}</span>
                        </span>
                      </td>

                      {/* 7. Fatura / Boleto (Nova Coluna) */}
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        {item.invoice ? (
                          <div className="flex items-center justify-center gap-1.5 flex-wrap">
                            <button
                              type="button"
                              onClick={() => setSelectedInvoiceToView(item.invoice!)}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/50 dark:hover:bg-purple-900/60 border border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-300 font-bold text-[11px] shadow-2xs transition-all cursor-pointer"
                              title={`Fatura: ${item.invoice.invoiceNumber}\nVencimento: ${new Date(item.invoice.dueDate + 'T00:00:00').toLocaleDateString('pt-BR')}\nValor: ${formatBrl(item.invoice.amount)}\nClique para ver o espelho da fatura`}
                            >
                              <Receipt className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400 shrink-0" />
                              <span className="font-mono">{item.invoice.invoiceNumber}</span>
                            </button>

                            {item.invoice.fileUrl && (
                              <button
                                type="button"
                                onClick={() => openDocumentInNewTab(item.invoice!.fileUrl!, item.invoice!.invoiceNumber)}
                                className="p-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:hover:bg-emerald-900/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 transition-colors cursor-pointer"
                                title="Abrir Boleto Bancário / Anexo em PDF"
                              >
                                <FileText className="w-3.5 h-3.5" />
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => handleOpenInvoiceModal(item)}
                              className="p-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 dark:bg-slate-700 dark:hover:bg-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
                              title="Editar Fatura / Boleto"
                            >
                              <Edit3 className="w-3 h-3" />
                            </button>

                            <button
                              type="button"
                              onClick={() => handleDeleteInvoice(item)}
                              className="p-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 dark:bg-rose-950/40 dark:hover:bg-rose-900/50 dark:text-rose-400 transition-colors cursor-pointer"
                              title="Remover Fatura vinculada"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleOpenInvoiceModal(item)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-50 dark:bg-blue-950/50 hover:bg-blue-100 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 text-xs font-bold transition-all shadow-2xs hover:shadow-xs cursor-pointer group"
                            title="Emitir / vincular fatura correspondente a este CT-e"
                          >
                            <Receipt className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 group-hover:scale-110 transition-transform" />
                            <span>+ Adicionar Fatura</span>
                          </button>
                        )}
                      </td>

                      {/* 8. Documento Anexado */}
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        {item.documentUrl ? (
                          <button
                            type="button"
                            onClick={() => {
                              if (item.documentUrl) {
                                openDocumentInNewTab(item.documentUrl, item.docNumber);
                              }
                            }}
                            className="inline-flex items-center gap-1 px-2 py-1 bg-sky-50 hover:bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:hover:bg-sky-900/60 dark:text-sky-300 rounded-lg text-[11px] font-bold border border-sky-200 dark:border-sky-800/60 transition-colors cursor-pointer"
                            title="Abrir o PDF do Conhecimento de Transporte em nova aba"
                          >
                            <Eye className="w-3 h-3" />
                            <span>Ver CT-e</span>
                            <ExternalLink className="w-2.5 h-2.5 opacity-70" />
                          </button>
                        ) : (
                          <span className="text-slate-400 text-[10px] italic">Sem anexo</span>
                        )}
                      </td>

                      {/* 9. Ação: Dar Baixa / Reabrir */}
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        {item.kind === 'cte' && (
                          <button
                            type="button"
                            onClick={() => handleToggleCteReceivedStatus(item.originalItem.shipmentId, item.status)}
                            className={`px-3 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                              isReceived
                                ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600 dark:text-slate-200'
                                : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs'
                            }`}
                          >
                            {isReceived ? 'Reabrir' : 'Receber'}
                          </button>
                        )}

                        {item.kind === 'manual' && (
                          <button
                            type="button"
                            onClick={() => onUpdateStatus(
                              item.originalItem.id, 
                              isReceived ? FinancialTransactionStatus.Pendente : FinancialTransactionStatus.Pago
                            )}
                            className={`px-3 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                              isReceived
                                ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600 dark:text-slate-200'
                                : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs'
                            }`}
                          >
                            {isReceived ? 'Reabrir' : 'Receber'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 5. MODAL DE EMISSÃO / VÍNCULO DE FATURA DO CT-E */}
      {isInvoiceModalOpen && invoiceTargetItem && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-xl w-full p-5 sm:p-6 shadow-2xl border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in-95 duration-150 my-auto">
            {/* Header */}
            <div className="flex items-center justify-between pb-3.5 mb-4 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-purple-50 dark:bg-purple-950/50 text-purple-600 dark:text-purple-400 rounded-2xl border border-purple-200 dark:border-purple-800">
                  <Receipt className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-white tracking-tight">
                    {invoiceTargetItem.invoice ? 'Editar Fatura / Boleto' : 'Emitir Fatura / Boleto do CT-e'}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Vincule a fatura de cobrança e o boleto correspondente a este frete
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => { setIsInvoiceModalOpen(false); setInvoiceTargetItem(null); }}
                className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Banner com Dados Originais do CT-e / Embarque */}
            <div className="mb-4 p-3 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700/80 text-xs space-y-1.5">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                  <Truck className="w-4 h-4 text-blue-500" />
                  {invoiceTargetItem.docNumber}
                </span>
                <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                  {invoiceTargetItem.title}
                </span>
              </div>
              <div className="text-slate-600 dark:text-slate-400 flex items-center justify-between flex-wrap gap-2">
                <span><strong>Tomador:</strong> {invoiceTargetItem.clientName}</span>
                <span><strong>Valor do Frete:</strong> {formatBrl(invoiceTargetItem.receivableAmount)}</span>
              </div>
            </div>

            <form onSubmit={handleSaveInvoice} className="space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Número da Fatura */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Número da Fatura / Boleto <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formInvoiceNumber}
                    onChange={(e) => setFormInvoiceNumber(e.target.value)}
                    placeholder="Ex: FAT-1014 / 2026-001"
                    className="w-full px-3 py-2 rounded-xl text-xs sm:text-sm font-bold font-mono border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>

                {/* Forma de Cobrança */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Forma de Cobrança
                  </label>
                  <select
                    value={formPaymentMethod}
                    onChange={(e) => setFormPaymentMethod(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl text-xs sm:text-sm border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-purple-500"
                  >
                    <option value="Boleto Bancário">Boleto Bancário</option>
                    <option value="PIX">PIX</option>
                    <option value="Transferência Bancária">Transferência Bancária</option>
                    <option value="Depósito em Conta">Depósito em Conta</option>
                    <option value="Outro">Outro</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Data de Lançamento / Emissão */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Data de Lançamento / Emissão <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={formIssueDate}
                    onChange={(e) => setFormIssueDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl text-xs sm:text-sm border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>

                {/* Data de Vencimento (Puxada do CT-e / Editável) */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Data de Vencimento do Boleto <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={formDueDate}
                    onChange={(e) => setFormDueDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl text-xs sm:text-sm font-bold border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-purple-500"
                  />
                  {/* Presets Rápidos de Vencimento */}
                  <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                    <span className="text-[10px] text-slate-400 font-semibold mr-0.5">Prazo:</span>
                    {[7, 14, 21, 28, 30, 45].map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => applyDueDatePreset(d)}
                        className="px-1.5 py-0.5 rounded bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-[10px] font-bold transition-colors cursor-pointer"
                        title={`Calcular vencimento para +${d} dias`}
                      >
                        +{d}d
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Valor do Boleto (Puxado do Valor a Receber) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Valor da Fatura / Boleto (R$) <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-xs font-bold font-mono text-slate-400">R$</span>
                  <input
                    type="text"
                    required
                    value={formInvoiceAmount}
                    onChange={(e) => setFormInvoiceAmount(e.target.value)}
                    placeholder="0,00"
                    className="w-full pl-9 pr-3 py-2 rounded-xl text-sm font-black font-mono border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-emerald-600 dark:text-emerald-400 outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <span className="text-[10px] text-slate-400 block mt-0.5">
                  Valor preenchido automaticamente a partir do frete a receber do CT-e correspondente.
                </span>
              </div>

              {/* Linha Digitável / Código de Barras */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Código de Barras / Linha Digitável do Boleto (opcional)
                </label>
                <input
                  type="text"
                  value={formBarcode}
                  onChange={(e) => setFormBarcode(e.target.value)}
                  placeholder="00000.00000 00000.000000 00000.000000 0 00000000000000"
                  className="w-full px-3 py-2 rounded-xl text-xs font-mono border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              {/* Chave Pix para Cobrança */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Chave PIX para Recebimento (opcional)
                </label>
                <input
                  type="text"
                  value={formPixKey}
                  onChange={(e) => setFormPixKey(e.target.value)}
                  placeholder="Chave Pix (CNPJ, e-mail, telefone ou aleatória)"
                  className="w-full px-3 py-2 rounded-xl text-xs font-mono border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              {/* Anexo do Boleto / Fatura */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Anexo do Boleto Bancário / Fatura (PDF ou Imagem)
                </label>
                {formInvoiceFileUrl ? (
                  <div className="flex items-center justify-between p-2.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl text-xs">
                    <div className="flex items-center gap-2 truncate">
                      <FileText className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      <span className="font-semibold text-emerald-900 dark:text-emerald-200 truncate">
                        {formInvoiceFileName || 'Boleto_Anexado.pdf'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => openDocumentInNewTab(formInvoiceFileUrl, formInvoiceFileName || 'Boleto')}
                        className="px-2 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] transition-colors cursor-pointer"
                      >
                        Visualizar
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setFormInvoiceFileUrl('');
                          setFormInvoiceFileName('');
                          setFormInvoiceFileType('');
                        }}
                        className="p-1 rounded-lg hover:bg-emerald-200 dark:hover:bg-emerald-900 text-rose-600 transition-colors cursor-pointer"
                        title="Remover anexo"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center p-3 border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-purple-500 dark:hover:border-purple-500 rounded-2xl cursor-pointer bg-slate-50/50 dark:bg-slate-950/50 transition-colors">
                    <UploadCloud className="w-5 h-5 text-purple-500 mb-1" />
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      Clique para anexar o PDF do Boleto / Fatura
                    </span>
                    <span className="text-[10px] text-slate-400 mt-0.5">
                      Arquivos suportados: PDF, JPG, PNG (máx. 15MB)
                    </span>
                    <input
                      type="file"
                      accept=".pdf,image/*"
                      onChange={handleFileSelect}
                      className="hidden"
                    />
                  </label>
                )}
              </div>

              {/* Observações */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Observações / Instruções
                </label>
                <textarea
                  rows={2}
                  value={formInvoiceNotes}
                  onChange={(e) => setFormInvoiceNotes(e.target.value)}
                  placeholder="Instruções de protesto, juros, informações ao cliente ou notas internas..."
                  className="w-full px-3 py-2 rounded-xl text-xs border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              {/* Botões do Modal */}
              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => { setIsInvoiceModalOpen(false); setInvoiceTargetItem(null); }}
                  className="px-4 py-2 rounded-xl text-xs font-bold border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs shadow-md shadow-purple-600/30 transition-all cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>Salvar Fatura / Boleto</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 6. MODAL DE ESPELHO / VISUALIZAÇÃO DA FATURA DE TRANSPORTE */}
      {selectedInvoiceToView && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-2xl w-full p-6 sm:p-7 shadow-2xl border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in-95 duration-150 my-auto">
            {/* Header com Ações */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-purple-600 text-white rounded-2xl shadow-md shadow-purple-600/30">
                  <Receipt className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900 dark:text-white tracking-tight">
                    Fatura de Transporte • {selectedInvoiceToView.invoiceNumber}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Transcunha Transportes e Logística LTDA • CNPJ: 10.638.283/0001-38
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                  title="Imprimir Fatura"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Imprimir</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedInvoiceToView(null)}
                  className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Corpo da Fatura */}
            <div className="py-5 space-y-4 text-xs">
              {/* Box de Resumo da Fatura */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Nº da Fatura</span>
                  <span className="text-sm font-black font-mono text-purple-600 dark:text-purple-400">
                    {selectedInvoiceToView.invoiceNumber}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Data de Emissão</span>
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    {new Date(selectedInvoiceToView.issueDate + 'T00:00:00').toLocaleDateString('pt-BR')}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Data de Vencimento</span>
                  <span className="text-xs font-black text-rose-600 dark:text-rose-400">
                    {new Date(selectedInvoiceToView.dueDate + 'T00:00:00').toLocaleDateString('pt-BR')}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Valor a Pagar</span>
                  <span className="text-sm font-black text-emerald-600 dark:text-emerald-400 font-mono">
                    {formatBrl(selectedInvoiceToView.amount)}
                  </span>
                </div>
              </div>

              {/* Dados do Sacado / Tomador */}
              <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400 block mb-1">
                  Tomador do Serviço / Pagador
                </span>
                <p className="text-sm font-bold text-slate-900 dark:text-white">
                  {selectedInvoiceToView.clientName || 'Cliente não especificado'}
                </p>
                {selectedInvoiceToView.clientCnpj && (
                  <p className="text-xs font-mono text-slate-500 dark:text-slate-400">
                    CNPJ / CPF: {selectedInvoiceToView.clientCnpj}
                  </p>
                )}
              </div>

              {/* Demonstrativo do Frete / CT-e */}
              <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400 block">
                  Demonstrativo do Conhecimento de Transporte (CT-e)
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1 border-t border-slate-100 dark:border-slate-800 text-[11px]">
                  <div>
                    <span className="text-slate-400 block">CT-e:</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">
                      {selectedInvoiceToView.cteNumber ? `Nº ${selectedInvoiceToView.cteNumber}` : 'Avulso'}
                    </span>
                  </div>
                  {selectedInvoiceToView.shipmentId && (
                    <div>
                      <span className="text-slate-400 block">Embarque:</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200">
                        {selectedInvoiceToView.shipmentId}
                      </span>
                    </div>
                  )}
                  {selectedInvoiceToView.tonnage && (
                    <div>
                      <span className="text-slate-400 block">Peso Faturado:</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200">
                        {selectedInvoiceToView.tonnage.toLocaleString('pt-BR')} ton
                      </span>
                    </div>
                  )}
                  {selectedInvoiceToView.origin && selectedInvoiceToView.destination && (
                    <div className="col-span-2">
                      <span className="text-slate-400 block">Rota:</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200">
                        {selectedInvoiceToView.origin} → {selectedInvoiceToView.destination}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Informações de Pagamento (Boleto / Pix) */}
              <div className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Modalidade de Cobrança: <strong>{selectedInvoiceToView.paymentMethod || 'Boleto Bancário'}</strong>
                  </span>
                  {selectedInvoiceToView.fileUrl && (
                    <button
                      type="button"
                      onClick={() => openDocumentInNewTab(selectedInvoiceToView.fileUrl!, selectedInvoiceToView.invoiceNumber)}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs transition-colors cursor-pointer"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>Abrir Boleto PDF</span>
                    </button>
                  )}
                </div>

                {selectedInvoiceToView.barcode && (
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-slate-400 block">Linha Digitável do Boleto:</span>
                    <div className="flex items-center gap-2 p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl">
                      <span className="font-mono text-xs text-slate-800 dark:text-slate-200 break-all select-all flex-1">
                        {selectedInvoiceToView.barcode}
                      </span>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(selectedInvoiceToView.barcode!, 'barcode')}
                        className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-purple-600 transition-colors cursor-pointer shrink-0"
                        title="Copiar linha digitável"
                      >
                        {copiedField === 'barcode' ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                )}

                {selectedInvoiceToView.pixKey && (
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-slate-400 block">Chave PIX para Pagamento:</span>
                    <div className="flex items-center gap-2 p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl">
                      <span className="font-mono text-xs text-slate-800 dark:text-slate-200 break-all select-all flex-1">
                        {selectedInvoiceToView.pixKey}
                      </span>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(selectedInvoiceToView.pixKey!, 'pix')}
                        className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-purple-600 transition-colors cursor-pointer shrink-0"
                        title="Copiar Chave PIX"
                      >
                        {copiedField === 'pix' ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                )}

                {selectedInvoiceToView.notes && (
                  <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
                    <span className="text-[10px] font-bold text-slate-400 block">Instruções / Observações:</span>
                    <p className="text-slate-600 dark:text-slate-300 italic mt-0.5 whitespace-pre-wrap">
                      {selectedInvoiceToView.notes}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setSelectedInvoiceToView(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. MODAL DE NOVO RECEBÍVEL AVULSO */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-700 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between mb-4 border-b border-slate-100 dark:border-slate-700 pb-3">
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Plus className="w-5 h-5 text-blue-600" />
                Novo Recebível Avulso - Contas a Receber
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitManual} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">Descrição *</label>
                <input
                  type="text"
                  required
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Ex: Faturamento de Frete Avulso / Estadia"
                  className="w-full px-3 py-2 rounded-xl text-xs sm:text-sm border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">Valor a Receber (R$) *</label>
                  <input
                    type="text"
                    required
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0,00"
                    className="w-full px-3 py-2 rounded-xl text-xs sm:text-sm border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white font-bold text-sky-600 dark:text-sky-400 outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">Data de Vencimento *</label>
                  <input
                    type="date"
                    required
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl text-xs sm:text-sm border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">Cliente / Pagador</label>
                <input
                  type="text"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="Nome do cliente ou embarcador pagador"
                  className="w-full px-3 py-2 rounded-xl text-xs sm:text-sm border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">Nº do Documento / Fatura</label>
                  <input
                    type="text"
                    value={documentNumber}
                    onChange={(e) => setDocumentNumber(e.target.value)}
                    placeholder="Ex: FAT-1029 / CT-e 4920"
                    className="w-full px-3 py-2 rounded-xl text-xs sm:text-sm border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">Categoria</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl text-xs border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white outline-none cursor-pointer"
                  >
                    <option value="Receita de Fretes">Receita de Fretes</option>
                    <option value="Estadias e Diárias">Estadias e Diárias</option>
                    <option value="Reembolsos">Reembolsos</option>
                    <option value="Serviços Adicionais">Serviços Adicionais</option>
                    <option value="Outras Receitas">Outras Receitas</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">Observações</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder="Informações adicionais do faturamento..."
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
                  Salvar Recebível
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
