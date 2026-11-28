import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import type { 
  FinancialTransaction, 
  FinancialInvoice, 
  BankAccount, 
  User, 
  OfxTransaction, 
  OfxImportLog 
} from '../../types';
import { FinancialTransactionStatus } from '../../types';
import { parseOfxFileContent } from '../../utils/ofxParser';
import { financialInvoiceService } from '../../services/financialInvoiceService';
import { canUnreconcileTransaction, isDemoUser } from '../../auth';
import { 
  UploadCloud, 
  CheckCircle2, 
  AlertCircle, 
  FileText, 
  ArrowUpRight, 
  ArrowDownLeft, 
  RefreshCw, 
  Link2,
  Lock,
  Unlock,
  ShieldCheck,
  ShieldAlert,
  Sparkles,
  Plus,
  Check,
  X,
  Search,
  Filter,
  DollarSign,
  Building2,
  ArrowRight,
  AlertTriangle,
  RotateCcw,
  ExternalLink,
  Layers,
  ChevronRight,
  Info
} from 'lucide-react';

interface OfxReconciliationTabProps {
  transactions: FinancialTransaction[];
  invoices?: FinancialInvoice[];
  bankAccounts?: BankAccount[];
  currentUser?: User | null;
  onUpdateTransaction?: (id: string, updates: Partial<FinancialTransaction>) => void;
  onAddTransaction?: (transaction: Omit<FinancialTransaction, 'id' | 'createdAt'>) => void;
  onReconcileTransaction?: (ofxTrnId: string) => void;
  onRefreshInvoices?: () => void;
}

type ReconciliationViewMode = 'matches' | 'split' | 'bank_only' | 'system_only' | 'reconciled';

const STORAGE_OFX_KEY = 'transcunha_ofx_current_import';

/**
 * Calcula a diferença de dias úteis entre duas datas (YYYY-MM-DD)
 * Desconsidera sábados e domingos
 */
function getBusinessDaysDiff(d1Str: string, d2Str: string): number {
  if (!d1Str || !d2Str) return 999;
  const cleanD1 = d1Str.split('T')[0];
  const cleanD2 = d2Str.split('T')[0];
  const d1 = new Date(cleanD1 + 'T00:00:00');
  const d2 = new Date(cleanD2 + 'T00:00:00');
  if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return 999;

  const start = d1 < d2 ? d1 : d2;
  const end = d1 < d2 ? d2 : d1;
  let count = 0;
  const cur = new Date(start);
  while (cur < end) {
    cur.setDate(cur.getDate() + 1);
    const day = cur.getDay();
    if (day !== 0 && day !== 6) {
      count++;
    }
  }
  return count;
}

function formatBrl(val: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
}

export const OfxReconciliationTab: React.FC<OfxReconciliationTabProps> = ({
  transactions = [],
  invoices: initialInvoices,
  bankAccounts = [],
  currentUser,
  onUpdateTransaction,
  onAddTransaction,
  onReconcileTransaction,
  onRefreshInvoices
}) => {
  // Estado do Extrato Importado (com persistência local)
  const [importLog, setImportLog] = useState<OfxImportLog | null>(() => {
    if (isDemoUser(currentUser)) return null;
    try {
      const saved = localStorage.getItem(STORAGE_OFX_KEY);
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.warn('Erro ao carregar extrato salvo:', e);
    }
    return null;
  });

  // Estado de Invoices
  const [invoices, setInvoices] = useState<FinancialInvoice[]>(initialInvoices || []);
  const [isDragging, setIsDragging] = useState(false);
  const [viewMode, setViewMode] = useState<ReconciliationViewMode>('matches');
  const [searchTerm, setSearchTerm] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Estados dos Modais
  const [quickExpenseModalOpen, setQuickExpenseModalOpen] = useState(false);
  const [quickExpenseItem, setQuickExpenseItem] = useState<OfxTransaction | null>(null);
  const [quickExpenseCategory, setQuickExpenseCategory] = useState('Tarifas e Despesas Bancárias');
  const [quickExpenseCostCenter, setQuickExpenseCostCenter] = useState('Administrativo');
  const [quickExpenseNotes, setQuickExpenseNotes] = useState('');

  // Modal de Desconciliação
  const [unreconcileModalOpen, setUnreconcileModalOpen] = useState(false);
  const [unreconcileTarget, setUnreconcileTarget] = useState<{
    ofxTrn?: OfxTransaction;
    systemItem?: any;
  } | null>(null);
  const [unreconcileReason, setUnreconcileReason] = useState('');
  const [permissionDeniedModalOpen, setPermissionDeniedModalOpen] = useState(false);

  // Carrega / Sincroniza Invoices
  const reloadInvoices = useCallback(async () => {
    try {
      const invs = await financialInvoiceService.getInvoices();
      setInvoices(invs);
    } catch (e) {
      console.error('Erro ao carregar invoices:', e);
    }
  }, []);

  useEffect(() => {
    if (!initialInvoices || initialInvoices.length === 0) {
      reloadInvoices();
    } else {
      setInvoices(initialInvoices);
    }
    const unsub = financialInvoiceService.subscribeInvoicesChange(() => {
      reloadInvoices();
      if (onRefreshInvoices) onRefreshInvoices();
    });
    return unsub;
  }, [reloadInvoices, initialInvoices, onRefreshInvoices]);

  // Salva no localStorage sempre que o importLog mudar
  useEffect(() => {
    if (importLog) {
      try {
        localStorage.setItem(STORAGE_OFX_KEY, JSON.stringify(importLog));
      } catch (e) {
        console.warn('Erro ao salvar importLog no localStorage:', e);
      }
    }
  }, [importLog]);

  // Upload e Processamento de OFX
  const handleFileUpload = (file: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      if (!content) return;

      try {
        const parsed = parseOfxFileContent(content);
        const log: OfxImportLog = {
          id: `ofx_log_${Date.now()}`,
          filename: file.name,
          importDate: new Date().toISOString(),
          bankAccountId: parsed.bankId || 'Sicredi',
          accountNumber: parsed.accountNumber || 'Empresarial',
          startDate: parsed.startDate,
          endDate: parsed.endDate,
          totalTransactions: parsed.transactions.length,
          reconciledCount: 0,
          transactions: parsed.transactions,
        };
        setImportLog(log);
        setViewMode('matches');
      } catch (err) {
        console.error('Erro ao ler arquivo OFX:', err);
        alert('Não foi possível processar o arquivo OFX selecionado. Verifique a formatação do extrato bancário.');
      }
    };
    reader.readAsText(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileUpload(file);
  };

  const handleResetImport = () => {
    if (confirm('Deseja realmente carregar outro arquivo de extrato bancário?')) {
      setImportLog(null);
      try {
        localStorage.removeItem(STORAGE_OFX_KEY);
      } catch {}
    }
  };

  // Normalização de Itens do ERP para Comparativo
  const normalizedSystemItems = useMemo(() => {
    const list: Array<{
      id: string;
      kind: 'transaction' | 'invoice';
      docNumber: string;
      entityName: string;
      description: string;
      amount: number;
      effectiveDate: string;
      dueDate: string;
      status: string;
      category: string;
      isReconciled: boolean;
      ofxTransactionId?: string;
      rawItem: any;
    }> = [];

    // 1. Transações Financeiras (Contas Avulsas, Fretes, Recebíveis)
    transactions.forEach(t => {
      list.push({
        id: t.id,
        kind: 'transaction',
        docNumber: t.documentNumber || t.id,
        entityName: t.supplierOrClientName || 'Lançamento do Sistema',
        description: t.description,
        amount: t.type === 'payable' ? -Math.abs(t.paidAmount || t.amount) : Math.abs(t.paidAmount || t.amount),
        effectiveDate: t.paymentDate || t.dueDate,
        dueDate: t.dueDate,
        status: t.status,
        category: t.category,
        isReconciled: Boolean(t.isReconciled),
        ofxTransactionId: t.ofxTransactionId,
        rawItem: t
      });
    });

    // 2. Notas Fiscais e Faturas
    invoices.forEach(inv => {
      const payableVal = inv.paidAmount || inv.payableAmount || inv.totalAmount;
      list.push({
        id: inv.id,
        kind: 'invoice',
        docNumber: inv.documentType === 'Fatura' ? `FAT ${inv.invoiceNumber}` : `NF ${inv.invoiceNumber}`,
        entityName: inv.supplierName,
        description: inv.description || `NF-e ${inv.invoiceNumber} - ${inv.supplierName}`,
        amount: -Math.abs(payableVal),
        effectiveDate: inv.paymentDate || inv.dueDate,
        dueDate: inv.dueDate,
        status: inv.status,
        category: `${inv.costCenterName} • ${inv.costTypeName}`,
        isReconciled: Boolean(inv.isReconciled),
        ofxTransactionId: inv.ofxTransactionId,
        rawItem: inv
      });
    });

    return list;
  }, [transactions, invoices]);

  // Algoritmo de Auto-Match (Regra de até 3 dias úteis)
  const autoMatchResults = useMemo(() => {
    if (!importLog) return { matches: [], bankOnly: [], systemOnly: [], reconciled: [] };

    const matches: Array<{
      ofxTrn: OfxTransaction;
      systemItem: any;
      diffDays: number;
      diffAmount: number;
      isExact: boolean;
    }> = [];

    const bankOnly: OfxTransaction[] = [];
    const reconciled: Array<{ ofxTrn: OfxTransaction; systemItem?: any }> = [];

    const usedSystemIds = new Set<string>();

    // Trata primeiro as transações já conciliadas
    importLog.transactions.forEach(trn => {
      if (trn.reconciled) {
        const sys = normalizedSystemItems.find(s => 
          s.ofxTransactionId === trn.id || 
          s.id === trn.matchedTransactionId ||
          (s.isReconciled && Math.abs(s.amount - trn.amount) < 0.01 && getBusinessDaysDiff(trn.date, s.effectiveDate) <= 3)
        );
        if (sys) usedSystemIds.add(sys.id);
        reconciled.push({ ofxTrn: trn, systemItem: sys });
        return;
      }

      // Procura match no sistema
      const candidate = normalizedSystemItems.find(sys => {
        if (usedSystemIds.has(sys.id)) return false;
        if (sys.isReconciled) return false;

        // Compara valores (mesma polaridade e valor absoluto idêntico com tolerância de centavos)
        const diffAmount = Math.abs(Math.abs(trn.amount) - Math.abs(sys.amount));
        if (diffAmount > 0.05) return false;

        // Polaridade: Débito do banco (negativo) deve casar com saída do ERP (negativo)
        const trnIsDebit = trn.amount < 0 || trn.type === 'DEBIT';
        const sysIsDebit = sys.amount < 0;
        if (trnIsDebit !== sysIsDebit) return false;

        // Tolerância de até 3 dias úteis
        const diffDays = getBusinessDaysDiff(trn.date, sys.effectiveDate);
        return diffDays <= 3;
      });

      if (candidate) {
        usedSystemIds.add(candidate.id);
        const diffDays = getBusinessDaysDiff(trn.date, candidate.effectiveDate);
        const diffAmount = Math.abs(Math.abs(trn.amount) - Math.abs(candidate.amount));
        matches.push({
          ofxTrn: trn,
          systemItem: candidate,
          diffDays,
          diffAmount,
          isExact: diffDays === 0 && diffAmount === 0
        });
      } else {
        bankOnly.push(trn);
      }
    });

    // Lançamentos do ERP não compensados no extrato
    const systemOnly = normalizedSystemItems.filter(sys => {
      if (sys.isReconciled || usedSystemIds.has(sys.id)) return false;
      if (sys.status !== 'Pago') return false;
      return true;
    });

    return { matches, bankOnly, systemOnly, reconciled };
  }, [importLog, normalizedSystemItems]);

  // Efetuar Conciliação de 1 Par
  const handleReconcilePair = async (ofxTrn: OfxTransaction, systemItem: any) => {
    if (!importLog) return;
    const nowIso = new Date().toISOString();
    const userName = currentUser?.name || 'Administrador';
    const userId = currentUser?.id || 'USR-001';

    try {
      if (systemItem.kind === 'invoice') {
        await financialInvoiceService.reconcileInvoice(systemItem.id, {
          ofxTransactionId: ofxTrn.id,
          checkNum: ofxTrn.checkNum,
          userId,
          userName
        });
      } else {
        if (onUpdateTransaction) {
          onUpdateTransaction(systemItem.id, {
            isReconciled: true,
            reconciledAt: nowIso,
            ofxTransactionId: ofxTrn.id,
            ofxCheckNum: ofxTrn.checkNum,
            reconciledByUserId: userId,
            reconciledByUserName: userName,
            status: FinancialTransactionStatus.Pago,
            paymentDate: systemItem.rawItem?.paymentDate || ofxTrn.date
          });
        }
      }

      // Atualiza o estado do extrato
      setImportLog(prev => {
        if (!prev) return null;
        const updated = prev.transactions.map(t => {
          if (t.id === ofxTrn.id) {
            return {
              ...t,
              reconciled: true,
              matchedTransactionId: systemItem.id,
              matchedKind: systemItem.kind,
              reconciledAt: nowIso,
              reconciledByUserName: userName
            };
          }
          return t;
        });
        const reconciledCount = updated.filter(t => t.reconciled).length;
        return { ...prev, transactions: updated, reconciledCount };
      });

      if (onReconcileTransaction) {
        onReconcileTransaction(ofxTrn.id);
      }
    } catch (err) {
      console.error('Erro ao conciliar par:', err);
      alert('Erro ao registrar conciliação.');
    }
  };

  // Conciliar Todos os Matches Automáticos em Lote
  const handleReconcileAllMatches = async () => {
    if (!autoMatchResults.matches.length) return;
    const count = autoMatchResults.matches.length;
    if (!confirm(`Deseja conciliar automaticamente os ${count} lançamentos identificados pelo Auto-Match (tolerância de até 3 dias úteis)?`)) {
      return;
    }

    for (const m of autoMatchResults.matches) {
      await handleReconcilePair(m.ofxTrn, m.systemItem);
    }
    alert(`${count} lançamentos foram conciliados com sucesso e receberam a trava de auditoria!`);
  };

  // Abertura do Modal de Desconciliação com Verificação de Permissão
  const handleOpenUnreconcile = (target: { ofxTrn?: OfxTransaction; systemItem?: any }) => {
    if (!canUnreconcileTransaction(currentUser)) {
      setPermissionDeniedModalOpen(true);
      return;
    }
    setUnreconcileTarget(target);
    setUnreconcileReason('');
    setUnreconcileModalOpen(true);
  };

  // Confirmar Desconciliação com Justificativa Gravada
  const handleConfirmUnreconcile = async () => {
    if (!unreconcileTarget) return;
    if (!unreconcileReason.trim() || unreconcileReason.trim().length < 8) {
      alert('Por favor, informe uma justificativa válida com no mínimo 8 caracteres explicando o motivo da desconciliação contábil.');
      return;
    }

    const userName = currentUser?.name || 'Administrador';
    const userId = currentUser?.id || 'USR-001';
    const sys = unreconcileTarget.systemItem;
    const trn = unreconcileTarget.ofxTrn;

    try {
      if (sys) {
        if (sys.kind === 'invoice') {
          await financialInvoiceService.unreconcileInvoice(sys.id, {
            reason: unreconcileReason.trim(),
            userId,
            userName
          });
        } else if (onUpdateTransaction) {
          onUpdateTransaction(sys.id, {
            isReconciled: false,
            unreconciledReason: unreconcileReason.trim(),
            unreconciledAt: new Date().toISOString(),
            unreconciledByUserName: userName
          });
        }
      }

      if (trn) {
        setImportLog(prev => {
          if (!prev) return null;
          const updated = prev.transactions.map(t => {
            if (t.id === trn.id) {
              return {
                ...t,
                reconciled: false,
                matchedTransactionId: undefined,
                matchedKind: undefined,
                unreconciledReason: unreconcileReason.trim()
              };
            }
            return t;
          });
          const reconciledCount = updated.filter(t => t.reconciled).length;
          return { ...prev, transactions: updated, reconciledCount };
        });
      }

      setUnreconcileModalOpen(false);
      setUnreconcileTarget(null);
      setUnreconcileReason('');
      alert('Lançamento desconciliado com sucesso. A trava contábil foi removida.');
    } catch (err) {
      console.error('Erro ao desconciliar:', err);
      alert('Erro ao processar desconciliação.');
    }
  };

  // Lançamento Rápido no Sistema a partir do Extrato
  const handleOpenQuickExpense = (trn: OfxTransaction) => {
    setQuickExpenseItem(trn);
    setQuickExpenseCategory(
      trn.amount < 0 
        ? (trn.description.toUpperCase().includes('TAR') ? 'Tarifas e Despesas Bancárias' : 'Despesas Operacionais')
        : 'Outras Receitas Operacionais'
    );
    setQuickExpenseCostCenter('Administrativo');
    setQuickExpenseNotes(`Criado via Conciliação OFX: ${trn.description}`);
    setQuickExpenseModalOpen(true);
  };

  const handleSaveQuickExpense = () => {
    if (!quickExpenseItem || !onAddTransaction) return;
    const isDebit = quickExpenseItem.amount < 0;
    const absVal = Math.abs(quickExpenseItem.amount);
    const nowIso = new Date().toISOString();
    const userName = currentUser?.name || 'Administrador';

    const newTxPayload: Omit<FinancialTransaction, 'id' | 'createdAt'> = {
      type: isDebit ? 'payable' : 'receivable',
      description: quickExpenseNotes.trim() || quickExpenseItem.description,
      amount: absVal,
      paidAmount: absVal,
      dueDate: quickExpenseItem.date,
      paymentDate: quickExpenseItem.date,
      status: FinancialTransactionStatus.Pago,
      category: quickExpenseCategory,
      costCenter: quickExpenseCostCenter,
      supplierOrClientName: isDebit ? (importLog?.bankAccountId || 'Banco Sicredi') : 'Recebimento Bancário',
      documentNumber: quickExpenseItem.checkNum || `OFX-${quickExpenseItem.date.replace(/-/g, '')}`,
      bankAccount: importLog?.bankAccountId || 'Sicredi',
      isReconciled: true,
      reconciledAt: nowIso,
      reconciledByUserName: userName,
      ofxTransactionId: quickExpenseItem.id,
      ofxCheckNum: quickExpenseItem.checkNum
    };

    onAddTransaction(newTxPayload);

    // Marca imediatamente no extrato
    setImportLog(prev => {
      if (!prev) return null;
      const updated = prev.transactions.map(t => {
        if (t.id === quickExpenseItem.id) {
          return {
            ...t,
            reconciled: true,
            reconciledAt: nowIso,
            reconciledByUserName: userName
          };
        }
        return t;
      });
      const reconciledCount = updated.filter(t => t.reconciled).length;
      return { ...prev, transactions: updated, reconciledCount };
    });

    setQuickExpenseModalOpen(false);
    setQuickExpenseItem(null);
  };

  // Métricas do Topo
  const totalCredits = (importLog?.transactions || []).filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const totalDebits = (importLog?.transactions || []).filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
  const netExtractBalance = totalCredits - totalDebits;

  const totalReconciledErp = useMemo(() => {
    return autoMatchResults.reconciled.reduce((acc, r) => acc + (r.ofxTrn.amount || 0), 0);
  }, [autoMatchResults.reconciled]);

  const balanceDifference = netExtractBalance - totalReconciledErp;
  const isFullyReconciled = importLog && importLog.totalTransactions > 0 && autoMatchResults.bankOnly.length === 0 && Math.abs(balanceDifference) < 0.01;

  return (
    <div className="space-y-6">
      {/* 1. SELETOR / CAIXA DE UPLOAD DO ARQUIVO OFX */}
      {!importLog ? (
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            const file = e.dataTransfer.files?.[0];
            if (file) handleFileUpload(file);
          }}
          className={`border-2 border-dashed rounded-3xl p-12 text-center transition-all bg-white dark:bg-slate-900 ${
            isDragging 
              ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/20' 
              : 'border-slate-300 dark:border-slate-800 hover:border-blue-400'
          }`}
        >
          <div className="w-16 h-16 mx-auto mb-4 bg-blue-50 dark:bg-blue-950/50 rounded-2xl flex items-center justify-center text-blue-600 dark:text-blue-400 shadow-sm">
            <UploadCloud className="w-8 h-8" />
          </div>
          <h3 className="text-xl font-black text-slate-900 dark:text-white mb-2">
            Importar Extrato Bancário (.OFX)
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 max-w-lg mx-auto mb-6">
            Arraste seu arquivo .OFX emitido pelo Internet Banking da empresa (Sicredi, Itaú, Bradesco) para iniciar a Conciliação Comparativa com trava de auditoria.
          </p>

          <input
            ref={fileInputRef}
            type="file"
            accept=".ofx,.txt"
            onChange={handleFileChange}
            className="hidden"
          />

          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-black shadow-lg shadow-blue-600/25 transition-all cursor-pointer active:scale-95"
          >
            Selecionar Arquivo OFX
          </button>
        </div>
      ) : (
        <>
          {/* 2. CABEÇALHO RESUMO & DADOS DO ARQUIVO */}
          <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="p-3.5 bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 rounded-2xl border border-blue-200/60 dark:border-blue-800/60">
                <FileText className="w-7 h-7" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-lg font-black text-slate-900 dark:text-white">
                    {importLog.filename}
                  </h3>
                  <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-blue-100 text-blue-800 dark:bg-blue-950/80 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                    Conta: {importLog.accountNumber || 'Empresarial'} • {importLog.bankAccountId}
                  </span>
                  {isFullyReconciled && (
                    <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                      100% Conciliado e Auditado
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Período: {importLog.startDate || 'Início'} até {importLog.endDate || 'Fim'} • {importLog.totalTransactions} transações importadas
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handleResetImport}
                className="flex items-center gap-2 px-4 py-2 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Trocar Arquivo
              </button>
            </div>
          </div>

          {/* 3. CARDS MÉTRICOS COMPARATIVOS */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Saldo Líquido do Extrato */}
            <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Saldo Extrato Bancário</span>
              <div className={`text-xl font-black mt-1.5 ${netExtractBalance >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                {formatBrl(netExtractBalance)}
              </div>
              <div className="flex items-center gap-3 mt-2 text-[11px] text-slate-500 dark:text-slate-400 font-semibold">
                <span className="text-emerald-600">+{formatBrl(totalCredits)}</span>
                <span className="text-rose-500">-{formatBrl(totalDebits)}</span>
              </div>
            </div>

            {/* Saldo Conciliado no ERP */}
            <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Saldo ERP Conciliado</span>
              <div className={`text-xl font-black mt-1.5 ${totalReconciledErp >= 0 ? 'text-blue-600 dark:text-blue-400' : 'text-rose-600'}`}>
                {formatBrl(totalReconciledErp)}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-2 font-medium">
                {autoMatchResults.reconciled.length} títulos fechados
              </div>
            </div>

            {/* Diferença Contábil */}
            <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Diferença de Saldo</span>
              <div className={`text-xl font-black mt-1.5 flex items-center gap-2 ${
                Math.abs(balanceDifference) < 0.01 
                  ? 'text-emerald-600 dark:text-emerald-400' 
                  : 'text-amber-600 dark:text-amber-400'
              }`}>
                {formatBrl(balanceDifference)}
                {Math.abs(balanceDifference) < 0.01 && <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />}
              </div>
              <div className="text-[11px] font-semibold mt-2">
                {Math.abs(balanceDifference) < 0.01 ? (
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">Extrato 100% batido com ERP</span>
                ) : (
                  <span className="text-amber-600 dark:text-amber-400">Pendente de conciliação</span>
                )}
              </div>
            </div>

            {/* Progresso de Conciliação */}
            <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Status Geral</span>
              <div className="text-xl font-black text-slate-900 dark:text-white mt-1.5">
                {importLog.reconciledCount} / {importLog.totalTransactions}
                <span className="text-xs text-slate-400 font-normal ml-2">
                  ({Math.round((importLog.reconciledCount / (importLog.totalTransactions || 1)) * 100)}%)
                </span>
              </div>
              <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full mt-3 overflow-hidden">
                <div 
                  className="bg-emerald-500 h-full rounded-full transition-all duration-300" 
                  style={{ width: `${Math.min(100, (importLog.reconciledCount / (importLog.totalTransactions || 1)) * 100)}%` }}
                />
              </div>
            </div>
          </div>

          {/* 4. BARRA DE NAVEGAÇÃO ENTRE VISÕES (ABAS DO MÓDULO) */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                onClick={() => setViewMode('matches')}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  viewMode === 'matches'
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                    : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                <span>Auto-Match Inteligente ({autoMatchResults.matches.length})</span>
              </button>

              <button
                onClick={() => setViewMode('split')}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  viewMode === 'split'
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                    : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Espelho Lado a Lado (Split View)</span>
              </button>

              <button
                onClick={() => setViewMode('bank_only')}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  viewMode === 'bank_only'
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                    : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300'
                }`}
              >
                <AlertCircle className="w-3.5 h-3.5 text-rose-500" />
                <span>No Banco sem ERP ({autoMatchResults.bankOnly.length})</span>
              </button>

              <button
                onClick={() => setViewMode('system_only')}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  viewMode === 'system_only'
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                    : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300'
                }`}
              >
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                <span>No ERP não Compensado ({autoMatchResults.systemOnly.length})</span>
              </button>

              <button
                onClick={() => setViewMode('reconciled')}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  viewMode === 'reconciled'
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                    : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300'
                }`}
              >
                <Lock className="w-3.5 h-3.5 text-emerald-400" />
                <span>Conciliados & Fechados ({autoMatchResults.reconciled.length})</span>
              </button>
            </div>

            {/* Ações em lote e busca rápida */}
            <div className="flex items-center gap-2.5">
              {viewMode === 'matches' && autoMatchResults.matches.length > 0 && (
                <button
                  type="button"
                  onClick={handleReconcileAllMatches}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black shadow-md shadow-emerald-600/25 transition-all cursor-pointer active:scale-95"
                >
                  <Sparkles className="w-4 h-4 text-amber-200" />
                  <span>Conciliar Todos os Matches ({autoMatchResults.matches.length})</span>
                </button>
              )}
            </div>
          </div>

          {/* 5. VISÃO 1: AUTO-MATCH INTELIGENTE (TOLERÂNCIA DE ATÉ 3 DIAS ÚTEIS) */}
          {viewMode === 'matches' && (
            <div className="space-y-4">
              <div className="bg-blue-50/70 dark:bg-blue-950/30 p-4 rounded-2xl border border-blue-200/60 dark:border-blue-800/60 flex items-center justify-between gap-4 text-xs">
                <div className="flex items-center gap-2.5 text-blue-900 dark:text-blue-200">
                  <Info className="w-4 h-4 text-blue-600 shrink-0" />
                  <span>
                    O algoritmo de correspondência cruzou valores e datas com <strong>tolerância de até 3 dias úteis</strong> (D+1, D+2 de compensação bancária e fins de semana).
                  </span>
                </div>
                {autoMatchResults.matches.length > 0 && (
                  <span className="font-bold text-blue-800 dark:text-blue-300 shrink-0">
                    {autoMatchResults.matches.length} sugestões encontradas
                  </span>
                )}
              </div>

              {autoMatchResults.matches.length === 0 ? (
                <div className="bg-white dark:bg-slate-900 rounded-2xl p-12 text-center border border-slate-200 dark:border-slate-800">
                  <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
                  <h4 className="font-black text-slate-800 dark:text-white text-base">Nenhum match pendente no momento</h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Todos os lançamentos compatíveis já foram conciliados ou estão nas abas de itens exclusivos do Banco ou do ERP.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {autoMatchResults.matches.map(({ ofxTrn, systemItem, diffDays, isExact }) => (
                    <div 
                      key={ofxTrn.id}
                      className="bg-white dark:bg-slate-900 rounded-2xl p-4.5 border border-slate-200 dark:border-slate-800 shadow-xs hover:border-blue-400 transition-all flex flex-col lg:flex-row items-center justify-between gap-4"
                    >
                      {/* Lado Esquerdo: Extrato Bancário */}
                      <div className="flex-1 min-w-0 w-full">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 uppercase">
                            Banco ({importLog.bankAccountId})
                          </span>
                          <span className="text-xs text-slate-400 font-mono">
                            {new Date(ofxTrn.date + 'T00:00:00').toLocaleDateString('pt-BR')}
                          </span>
                          {ofxTrn.checkNum && (
                            <span className="text-[10px] font-mono text-slate-400">
                              Doc: {ofxTrn.checkNum}
                            </span>
                          )}
                        </div>
                        <h4 className="font-black text-sm text-slate-900 dark:text-white truncate" title={ofxTrn.description}>
                          {ofxTrn.description}
                        </h4>
                        <div className={`text-base font-black mt-1 ${
                          ofxTrn.amount < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'
                        }`}>
                          {formatBrl(ofxTrn.amount)}
                        </div>
                      </div>

                      {/* Conexão Central com Status do Match */}
                      <div className="flex flex-col items-center justify-center shrink-0 px-3">
                        <div className={`px-3 py-1 rounded-full text-[11px] font-black border flex items-center gap-1.5 ${
                          isExact 
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-950/70 dark:text-emerald-300 dark:border-emerald-800'
                            : 'bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950/70 dark:text-amber-300 dark:border-amber-800'
                        }`}>
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>{isExact ? 'Match Exato (Mesmo Dia)' : `Match D+${diffDays} úteis`}</span>
                        </div>
                        <span className="text-[10px] text-slate-400 mt-1 font-medium">
                          Valores Idênticos
                        </span>
                      </div>

                      {/* Lado Direito: Sistema Transcunha (ERP) */}
                      <div className="flex-1 min-w-0 w-full bg-slate-50/80 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-200/60 dark:border-slate-700/60">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-blue-100 text-blue-800 dark:bg-blue-950/70 dark:text-blue-300 uppercase">
                            ERP • {systemItem.kind === 'invoice' ? 'Nota Fiscal' : 'Contas a Pagar/Receber'}
                          </span>
                          <span className="text-xs text-slate-400 font-mono">
                            {new Date(systemItem.effectiveDate + 'T00:00:00').toLocaleDateString('pt-BR')}
                          </span>
                          <span className="text-xs font-bold text-slate-600 dark:text-slate-300 truncate">
                            {systemItem.docNumber}
                          </span>
                        </div>
                        <h4 className="font-bold text-sm text-slate-900 dark:text-white truncate" title={systemItem.entityName}>
                          {systemItem.entityName}
                        </h4>
                        <div className="flex items-center justify-between mt-1">
                          <span className="text-xs text-slate-500 dark:text-slate-400 truncate">
                            {systemItem.category}
                          </span>
                          <span className={`text-base font-black ${
                            systemItem.amount < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'
                          }`}>
                            {formatBrl(systemItem.amount)}
                          </span>
                        </div>
                      </div>

                      {/* Botão de Ação */}
                      <div className="shrink-0 flex items-center">
                        <button
                          type="button"
                          onClick={() => handleReconcilePair(ofxTrn, systemItem)}
                          className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black shadow-md shadow-blue-600/20 transition-all cursor-pointer active:scale-95"
                          title="Confirmar conciliação e travar lançamento no sistema"
                        >
                          <Check className="w-4 h-4" />
                          <span>Conciliar</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 6. VISÃO 2: ESPELHO COMPARATIVO LADO A LADO (SPLIT VIEW) */}
          {viewMode === 'split' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Coluna Esquerda: Extrato Bancário Real */}
              <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden flex flex-col">
                <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 flex items-center justify-between">
                  <div>
                    <h4 className="font-black text-sm text-slate-900 dark:text-white flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-blue-600" />
                      Extrato Bancário Real ({importLog.bankAccountId})
                    </h4>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {importLog.transactions.length} registros no arquivo OFX
                    </span>
                  </div>
                  <span className="text-xs font-mono font-bold text-slate-700 dark:text-slate-300">
                    Saldo: {formatBrl(netExtractBalance)}
                  </span>
                </div>

                <div className="divide-y divide-slate-100 dark:divide-slate-800 overflow-y-auto max-h-[600px] custom-scrollbar">
                  {importLog.transactions.map((t) => (
                    <div key={t.id} className="p-4 hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 text-xs text-slate-400 font-mono mb-0.5">
                          <span>{new Date(t.date + 'T00:00:00').toLocaleDateString('pt-BR')}</span>
                          {t.checkNum && <span>• Doc: {t.checkNum}</span>}
                        </div>
                        <div className="font-bold text-sm text-slate-900 dark:text-white truncate" title={t.description}>
                          {t.description}
                        </div>
                        <div className={`text-xs font-black mt-1 ${
                          t.amount < 0 ? 'text-rose-600' : 'text-emerald-600'
                        }`}>
                          {formatBrl(t.amount)}
                        </div>
                      </div>

                      <div className="shrink-0 flex items-center gap-2">
                        {t.reconciled ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                            <Lock className="w-3 h-3" />
                            Fechado
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleOpenQuickExpense(t)}
                            className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-blue-50 hover:bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300 border border-blue-200 dark:border-blue-800 transition-colors cursor-pointer"
                          >
                            + Lançar ERP
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Coluna Direita: Lançamentos do ERP */}
              <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden flex flex-col">
                <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 flex items-center justify-between">
                  <div>
                    <h4 className="font-black text-sm text-slate-900 dark:text-white flex items-center gap-2">
                      <FileText className="w-4 h-4 text-emerald-600" />
                      Sistema Transcunha (ERP)
                    </h4>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      Títulos pagos e baixados no período
                    </span>
                  </div>
                  <span className="text-xs font-mono font-bold text-slate-700 dark:text-slate-300">
                    Conciliado: {formatBrl(totalReconciledErp)}
                  </span>
                </div>

                <div className="divide-y divide-slate-100 dark:divide-slate-800 overflow-y-auto max-h-[600px] custom-scrollbar">
                  {normalizedSystemItems.map((sys) => (
                    <div key={sys.id} className="p-4 hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 text-xs text-slate-400 font-mono mb-0.5">
                          <span>{new Date(sys.effectiveDate + 'T00:00:00').toLocaleDateString('pt-BR')}</span>
                          <span>• {sys.docNumber}</span>
                        </div>
                        <div className="font-bold text-sm text-slate-900 dark:text-white truncate" title={sys.entityName}>
                          {sys.entityName}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-slate-500 truncate">{sys.category}</span>
                          <span className={`text-xs font-black ${
                            sys.amount < 0 ? 'text-rose-600' : 'text-emerald-600'
                          }`}>
                            {formatBrl(sys.amount)}
                          </span>
                        </div>
                      </div>

                      <div className="shrink-0">
                        {sys.isReconciled ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 dark:bg-blue-950/70 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                            <Lock className="w-3 h-3" />
                            Conciliado
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                            Pendente Banco
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 7. VISÃO 3: NO BANCO SEM LANÇAMENTO NO ERP (COM AÇÃO 1-CLIQUE) */}
          {viewMode === 'bank_only' && (
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
              <div className="p-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 flex items-center justify-between flex-wrap gap-3">
                <div>
                  <h4 className="font-black text-base text-slate-900 dark:text-white">
                    Movimentações no Banco sem Lançamento no ERP ({autoMatchResults.bankOnly.length})
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Tarifas bancárias, IOF, juros, tarifas de CIOT ou créditos que ainda não constam no sistema.
                  </p>
                </div>
              </div>

              {autoMatchResults.bankOnly.length === 0 ? (
                <div className="p-12 text-center">
                  <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
                  <h4 className="font-black text-slate-800 dark:text-white text-base">Nenhuma pendência bancária exclusiva</h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Todas as transações do extrato já possuem lançamento ou foram conciliadas.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {autoMatchResults.bankOnly.map((t) => (
                    <div key={t.id} className="p-4 hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors flex items-center justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 text-xs text-slate-400 font-mono mb-0.5">
                          <span>{new Date(t.date + 'T00:00:00').toLocaleDateString('pt-BR')}</span>
                          {t.checkNum && <span>• Identificador: {t.checkNum}</span>}
                        </div>
                        <h5 className="font-black text-sm text-slate-900 dark:text-white truncate">
                          {t.description}
                        </h5>
                        <div className={`text-sm font-black mt-1 ${
                          t.amount < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'
                        }`}>
                          {formatBrl(t.amount)}
                        </div>
                      </div>

                      <div className="shrink-0">
                        <button
                          type="button"
                          onClick={() => handleOpenQuickExpense(t)}
                          className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black shadow-md shadow-emerald-600/20 transition-all cursor-pointer active:scale-95"
                          title="Criar lançamento correspondente no sistema já com baixa e conciliação"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Lançar no Sistema com 1 Clique</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 8. VISÃO 4: NO ERP NÃO COMPENSADO */}
          {viewMode === 'system_only' && (
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
              <div className="p-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40">
                <h4 className="font-black text-base text-slate-900 dark:text-white">
                  Títulos no ERP Aguardando Compensação Bancária ({autoMatchResults.systemOnly.length})
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Lançamentos marcados como pagos/liquidados no sistema que ainda não caíram no extrato bancário importado.
                </p>
              </div>

              {autoMatchResults.systemOnly.length === 0 ? (
                <div className="p-12 text-center">
                  <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
                  <h4 className="font-black text-slate-800 dark:text-white text-base">Nenhum título pendente de compensação</h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Todos os pagamentos registrados no sistema foram encontrados no extrato bancário.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {autoMatchResults.systemOnly.map((sys) => (
                    <div key={sys.id} className="p-4 hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors flex items-center justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 text-xs text-slate-400 font-mono mb-0.5">
                          <span>{new Date(sys.effectiveDate + 'T00:00:00').toLocaleDateString('pt-BR')}</span>
                          <span>• {sys.docNumber}</span>
                          <span className="px-2 py-0.2 rounded font-bold uppercase text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                            {sys.kind === 'invoice' ? 'Nota Fiscal' : 'Contas a Pagar'}
                          </span>
                        </div>
                        <h5 className="font-bold text-sm text-slate-900 dark:text-white truncate">
                          {sys.entityName}
                        </h5>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-slate-500">{sys.category}</span>
                          <span className={`text-sm font-black ${
                            sys.amount < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'
                          }`}>
                            {formatBrl(sys.amount)}
                          </span>
                        </div>
                      </div>

                      <div className="shrink-0 text-right">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                          Aguardando Compensação
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 9. VISÃO 5: CONCILIADOS & FECHADOS (COM FLUXO SEGURO DE DESCONCILIAÇÃO) */}
          {viewMode === 'reconciled' && (
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
              <div className="p-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 flex items-center justify-between flex-wrap gap-3">
                <div>
                  <h4 className="font-black text-base text-slate-900 dark:text-white flex items-center gap-2">
                    <Lock className="w-4 h-4 text-emerald-600" />
                    Lançamentos Auditados & Fechados ({autoMatchResults.reconciled.length})
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Estes títulos possuem trava contábil ativa no Contas a Pagar/Receber. Desconciliação permitida apenas para Administradores, Diretoria e Master.
                  </p>
                </div>
              </div>

              {autoMatchResults.reconciled.length === 0 ? (
                <div className="p-12 text-center">
                  <AlertCircle className="w-12 h-12 text-slate-400 mx-auto mb-3" />
                  <h4 className="font-black text-slate-800 dark:text-white text-base">Nenhum lançamento conciliado ainda</h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Utilize a aba de Auto-Match ou Espelho para conciliar os títulos do extrato.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {autoMatchResults.reconciled.map(({ ofxTrn, systemItem }) => (
                    <div key={ofxTrn.id} className="p-4 hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors flex items-center justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 text-xs text-slate-400 font-mono mb-0.5">
                          <span>{new Date(ofxTrn.date + 'T00:00:00').toLocaleDateString('pt-BR')}</span>
                          {ofxTrn.checkNum && <span>• Doc: {ofxTrn.checkNum}</span>}
                          {ofxTrn.reconciledByUserName && (
                            <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                              • Auditado por {ofxTrn.reconciledByUserName}
                            </span>
                          )}
                        </div>
                        <h5 className="font-black text-sm text-slate-900 dark:text-white truncate">
                          {ofxTrn.description}
                        </h5>
                        <div className="flex items-center gap-3 mt-1">
                          <span className={`text-sm font-black ${
                            ofxTrn.amount < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'
                          }`}>
                            {formatBrl(ofxTrn.amount)}
                          </span>
                          {systemItem && (
                            <span className="text-xs text-slate-500 dark:text-slate-400 truncate">
                              ↔ Par ERP: {systemItem.entityName} ({systemItem.docNumber})
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="shrink-0 flex items-center gap-2">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                          <ShieldCheck className="w-3.5 h-3.5" />
                          Fechado & Blindado
                        </span>

                        <button
                          type="button"
                          onClick={() => handleOpenUnreconcile({ ofxTrn, systemItem })}
                          className="flex items-center gap-1.5 px-3 py-1.5 border border-rose-300 dark:border-rose-800/60 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-600 dark:text-rose-400 rounded-xl text-xs font-bold transition-all cursor-pointer"
                          title="Desfazer conciliação (requer permissão de Administrador/Diretoria e justificativa obrigatória)"
                        >
                          <Unlock className="w-3.5 h-3.5" />
                          <span>Desconciliar</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* 10. MODAL: LANÇAMENTO RÁPIDO A PARTIR DO EXTRATO (1-CLIQUE) */}
      {quickExpenseModalOpen && quickExpenseItem && (
        <div className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-black text-lg text-slate-900 dark:text-white flex items-center gap-2">
                <Plus className="w-5 h-5 text-emerald-600" />
                Lançar Despesa / Receita do Banco
              </h3>
              <button
                onClick={() => setQuickExpenseModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-1.5">
                <span className="text-[10px] font-bold uppercase text-slate-400">Origem Extrato OFX</span>
                <div className="font-black text-sm text-slate-900 dark:text-white">{quickExpenseItem.description}</div>
                <div className="flex items-center justify-between text-xs pt-1">
                  <span className="text-slate-500">Data: {new Date(quickExpenseItem.date + 'T00:00:00').toLocaleDateString('pt-BR')}</span>
                  <span className={`font-black ${quickExpenseItem.amount < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                    {formatBrl(Math.abs(quickExpenseItem.amount))}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Categoria Contábil
                </label>
                <select
                  value={quickExpenseCategory}
                  onChange={(e) => setQuickExpenseCategory(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-100 outline-none"
                >
                  <option value="Tarifas e Despesas Bancárias">Tarifas e Despesas Bancárias</option>
                  <option value="Tributos / Impostos / IOF">Tributos / Impostos / IOF</option>
                  <option value="Despesas Operacionais">Despesas Operacionais</option>
                  <option value="Honorários e Serviços">Honorários e Serviços</option>
                  <option value="Juros e Encargos Financeiros">Juros e Encargos Financeiros</option>
                  <option value="Outras Receitas Operacionais">Outras Receitas Operacionais</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Centro de Custo
                </label>
                <select
                  value={quickExpenseCostCenter}
                  onChange={(e) => setQuickExpenseCostCenter(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-100 outline-none"
                >
                  <option value="Administrativo">Administrativo</option>
                  <option value="Operacional">Operacional</option>
                  <option value="Diretoria & Gestão">Diretoria & Gestão</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Descrição / Observação do Lançamento
                </label>
                <input
                  type="text"
                  value={quickExpenseNotes}
                  onChange={(e) => setQuickExpenseNotes(e.target.value)}
                  placeholder="Ex: Tarifa de emissão de boletos Sicredi"
                  className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-100 outline-none"
                />
              </div>

              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 rounded-xl border border-emerald-200 dark:border-emerald-800/60 text-[11px] text-emerald-800 dark:text-emerald-300">
                O título será criado no ERP com status <strong>Pago</strong> e já <strong>Conciliado</strong> com este lançamento do banco.
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setQuickExpenseModalOpen(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveQuickExpense}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black shadow-md shadow-emerald-600/20 cursor-pointer"
              >
                Salvar e Conciliar Imediatamente
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 11. MODAL: DESCONCILIAÇÃO AUDITADA (REQUER JUSTIFICATIVA) */}
      {unreconcileModalOpen && unreconcileTarget && (
        <div className="fixed inset-0 z-[9999] bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 animate-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="p-2.5 bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 rounded-2xl border border-rose-200 dark:border-rose-800">
                <Unlock className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-black text-base text-slate-900 dark:text-white">
                  Confirmar Desconciliação Bancária
                </h3>
                <span className="text-xs text-rose-600 dark:text-rose-400 font-bold">
                  Ação Auditada • Altera o Fechamento Contábil
                </span>
              </div>
            </div>

            <div className="mt-4 space-y-4">
              <div className="p-3.5 bg-amber-50 dark:bg-amber-950/40 rounded-2xl border border-amber-200 dark:border-amber-800/60 text-xs text-amber-800 dark:text-amber-300">
                <strong>Atenção:</strong> Ao desconciliar, o lançamento será destravado no Contas a Pagar/Receber, permitindo que qualquer operador reabra ou edite o valor. A justificativa informada abaixo será gravada permanentemente no log de auditoria.
              </div>

              {unreconcileTarget.ofxTrn && (
                <div className="bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 text-xs space-y-1">
                  <div className="font-bold text-slate-800 dark:text-slate-100">{unreconcileTarget.ofxTrn.description}</div>
                  <div className="text-slate-500">
                    Data: {new Date(unreconcileTarget.ofxTrn.date + 'T00:00:00').toLocaleDateString('pt-BR')} • Valor: {formatBrl(unreconcileTarget.ofxTrn.amount)}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1.5">
                  Motivo / Justificativa da Desconciliação <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={3}
                  value={unreconcileReason}
                  onChange={(e) => setUnreconcileReason(e.target.value)}
                  placeholder="Informe detalhadamente por que este lançamento está sendo desconciliado (ex: Valor baixado incorretamente, juros adicionais não conferidos, etc.)"
                  className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-rose-500"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">
                  Mínimo de 8 caracteres exigido.
                </span>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setUnreconcileModalOpen(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmUnreconcile}
                className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black shadow-md shadow-rose-600/20 cursor-pointer"
              >
                Confirmar Desconciliação
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 12. MODAL: ALERTA DE PERMISSÃO INSUFICIENTE */}
      {permissionDeniedModalOpen && (
        <div className="fixed inset-0 z-[9999] bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-6 shadow-2xl border border-rose-200 dark:border-rose-900/60 animate-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 bg-rose-100 dark:bg-rose-950/80 text-rose-600 dark:text-rose-400 rounded-2xl">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-black text-base text-slate-900 dark:text-white">
                  Acesso Restrito: Permissão Insuficiente
                </h3>
                <span className="text-xs text-rose-600 font-bold">
                  Trava de Auditoria Ativa
                </span>
              </div>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed mb-6">
              A desconciliação bancária altera o fechamento contábil e só pode ser executada por usuários com perfil de <strong>Administrador</strong>, <strong>Diretoria</strong> ou <strong>Master</strong>. Caso precise retificar esta conta, solicite a autorização de um gestor responsável.
            </p>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setPermissionDeniedModalOpen(false)}
                className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-800 dark:hover:bg-slate-700 rounded-xl text-xs font-black transition-all cursor-pointer"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
