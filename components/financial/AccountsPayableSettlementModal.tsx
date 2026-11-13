import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  Upload, 
  FileText, 
  CheckCircle2, 
  AlertCircle, 
  ExternalLink, 
  Trash2, 
  Receipt, 
  Check, 
  Loader2,
  Calendar,
  DollarSign,
  Copy,
  Eye,
  FileCheck,
  CreditCard,
  Building2,
  Tag,
  RotateCcw,
  Sparkles,
  Landmark,
  Plus,
  Minus,
  Equal,
  Lock
} from 'lucide-react';
import { openDocumentInNewTab } from '../../utils/documentViewer';
import { uploadInvoiceAttachmentToStorage } from '../../services/financialInvoiceService';
import { formatBrl } from '../../utils/financialCalculations';
import { parseReceiptFile, type SicrediReceiptParsedData } from '../../utils/sicrediReceiptParser';
import type { FinancialInvoice, InvoicePaymentStatus } from '../../types';

export interface SettlingAccountItem {
  id: string;
  kind: 'invoice' | 'manual' | 'leader' | 'cte' | 'driver' | 'tax';
  docNumber: string;
  title: string;
  entityName: string;
  entityCpfCnpj?: string;
  categoryOrCenter: string;
  dueDate: string;
  totalAmount: number;
  payableAmount: number;
  currentStatus: 'Pendente' | 'Pago' | 'Atrasado' | InvoicePaymentStatus;
  paymentDate?: string;
  paymentMethod?: FinancialInvoice['paymentMethod'];
  paymentDetails?: string;
  receiptFileUrl?: string;
  receiptFileName?: string;
  receiptFileType?: string;
  receiptFileSize?: number;
  paymentAuthCode?: string;
  interestAmount?: number;
  discountAmount?: number;
  paidAmount?: number;
  bankAccount?: string;
  notes?: string;
  taxPeriod?: string;
  isReconciled?: boolean;
  reconciledAt?: string;
  ofxCheckNum?: string;
  originalItem: any;
}

interface AccountsPayableSettlementModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: SettlingAccountItem | null;
  onConfirm: (data: {
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
  }) => Promise<void>;
  onReopen?: (item: SettlingAccountItem) => Promise<void>;
}

export const AccountsPayableSettlementModal: React.FC<AccountsPayableSettlementModalProps> = ({
  isOpen,
  onClose,
  item,
  onConfirm,
  onReopen
}) => {
  if (!isOpen || !item) return null;

  const isAlreadyPaid = item.currentStatus === 'Pago';
  const isReconciled = Boolean(item.isReconciled || item.originalItem?.isReconciled);

  // Form states
  const [paymentDate, setPaymentDate] = useState<string>(
    item.paymentDate || new Date().toISOString().split('T')[0]
  );
  const [paymentMethod, setPaymentMethod] = useState<FinancialInvoice['paymentMethod']>(
    item.paymentMethod || 'Boleto'
  );
  const [paymentAuthCode, setPaymentAuthCode] = useState<string>(item.paymentAuthCode || '');
  const [notes, setNotes] = useState<string>(item.notes || '');

  // Ajuste Financeiro da Baixa (OBZ / Recálculo de Juros e Abatimento)
  const baseOriginal = Number(item.payableAmount || item.totalAmount || 0);
  const [originalAmount, setOriginalAmount] = useState<number>(baseOriginal);
  const [interestAmount, setInterestAmount] = useState<number>(item.interestAmount || 0);
  const [discountAmount, setDiscountAmount] = useState<number>(item.discountAmount || 0);
  const [paidAmount, setPaidAmount] = useState<number>(
    item.paidAmount !== undefined 
      ? item.paidAmount 
      : Number((baseOriginal + (item.interestAmount || 0) - (item.discountAmount || 0)).toFixed(2))
  );
  const [bankAccount, setBankAccount] = useState<string>(item.bankAccount || 'Sicredi');

  // File states
  const [existingReceiptUrl, setExistingReceiptUrl] = useState<string | null>(item.receiptFileUrl || null);
  const [existingReceiptName, setExistingReceiptName] = useState<string | null>(item.receiptFileName || null);
  const [newReceiptFile, setNewReceiptFile] = useState<File | null>(null);

  // Leitor Inteligente Sicredi
  const [isAnalyzingFile, setIsAnalyzingFile] = useState<boolean>(false);
  const [sicrediParsedInfo, setSicrediParsedInfo] = useState<SicrediReceiptParsedData | null>(null);

  const [copiedKey, setCopiedKey] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isReopening, setIsReopening] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync when item changes
  useEffect(() => {
    if (item) {
      const orig = Number(item.payableAmount || item.totalAmount || 0);
      const interest = item.interestAmount || 0;
      const discount = item.discountAmount || 0;
      const finalPaid = item.paidAmount !== undefined ? item.paidAmount : Number((orig + interest - discount).toFixed(2));

      setPaymentDate(item.paymentDate || new Date().toISOString().split('T')[0]);
      setPaymentMethod(item.paymentMethod || 'Boleto');
      setPaymentAuthCode(item.paymentAuthCode || '');
      setNotes(item.notes || '');
      setOriginalAmount(orig);
      setInterestAmount(interest);
      setDiscountAmount(discount);
      setPaidAmount(finalPaid);
      setBankAccount(item.bankAccount || 'Sicredi');
      setExistingReceiptUrl(item.receiptFileUrl || null);
      setExistingReceiptName(item.receiptFileName || null);
      setNewReceiptFile(null);
      setSicrediParsedInfo(null);
      setCopiedKey(false);
    }
  }, [item]);

  // Recalcular Valor Real automaticamente quando juros ou abatimento forem ajustados
  const handleInterestChange = (valStr: string) => {
    const val = parseFloat(valStr.replace(',', '.')) || 0;
    setInterestAmount(val);
    const calculated = Number((originalAmount + val - discountAmount).toFixed(2));
    setPaidAmount(Math.max(0, calculated));
  };

  const handleDiscountChange = (valStr: string) => {
    const val = parseFloat(valStr.replace(',', '.')) || 0;
    setDiscountAmount(val);
    const calculated = Number((originalAmount + interestAmount - val).toFixed(2));
    setPaidAmount(Math.max(0, calculated));
  };

  const handleCopyPaymentDetails = () => {
    if (item.paymentDetails) {
      navigator.clipboard.writeText(item.paymentDetails);
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2500);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setNewReceiptFile(file);
    setIsAnalyzingFile(true);

    try {
      // Parser inteligente de comprovante (Sicredi e outros bancos)
      const parsed = await parseReceiptFile(file);
      setSicrediParsedInfo(parsed);

      if (parsed.isSicredi || parsed.paidAmount || parsed.paymentDate) {
        if (parsed.paymentDate) {
          setPaymentDate(parsed.paymentDate);
        }
        if (parsed.authCode) {
          setPaymentAuthCode(parsed.authCode);
        }
        if (parsed.bankName) {
          setBankAccount(parsed.bankName);
        }
        if (parsed.interestAmount !== undefined && parsed.interestAmount > 0) {
          setInterestAmount(parsed.interestAmount);
        }
        if (parsed.discountAmount !== undefined && parsed.discountAmount > 0) {
          setDiscountAmount(parsed.discountAmount);
        }
        if (parsed.paidAmount !== undefined && parsed.paidAmount > 0) {
          setPaidAmount(parsed.paidAmount);
        } else if (parsed.originalAmount) {
          const autoPaid = Number((parsed.originalAmount + (parsed.interestAmount || 0) - (parsed.discountAmount || 0)).toFixed(2));
          setPaidAmount(autoPaid);
        }
        if (parsed.operationType === 'Boleto' || parsed.operationType === 'Pix' || parsed.operationType === 'Transferência') {
          setPaymentMethod(parsed.operationType as any);
        }
      }
    } catch (err) {
      console.warn('[AccountsPayableSettlementModal] Falha na análise do comprovante:', err);
    } finally {
      setIsAnalyzingFile(false);
    }
  };

  const handleRemoveExistingReceipt = () => {
    setExistingReceiptUrl(null);
    setExistingReceiptName(null);
    setNewReceiptFile(null);
    setSicrediParsedInfo(null);
  };

  const handleRemoveNewReceipt = () => {
    setNewReceiptFile(null);
    setSicrediParsedInfo(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      let finalReceiptUrl = existingReceiptUrl;
      let finalReceiptName = existingReceiptName;
      let finalReceiptType = item.receiptFileType;
      let finalReceiptSize = item.receiptFileSize;

      // Se houver um novo arquivo de comprovante selecionado, envia para o Storage
      if (newReceiptFile) {
        finalReceiptUrl = await uploadInvoiceAttachmentToStorage(
          newReceiptFile,
          item.id,
          'comprovante',
          newReceiptFile.name,
          newReceiptFile.type
        );
        finalReceiptName = newReceiptFile.name;
        finalReceiptType = newReceiptFile.type;
        finalReceiptSize = newReceiptFile.size;
      }

      await onConfirm({
        status: 'Pago',
        paymentDate: paymentDate || new Date().toISOString().split('T')[0],
        paymentMethod,
        paymentAuthCode: paymentAuthCode.trim() || undefined,
        interestAmount: interestAmount > 0 ? interestAmount : undefined,
        discountAmount: discountAmount > 0 ? discountAmount : undefined,
        paidAmount: paidAmount > 0 ? paidAmount : originalAmount,
        bankAccount: bankAccount.trim() || 'Sicredi',
        notes: notes.trim() || undefined,
        receiptFile: newReceiptFile,
        receiptFileUrl: finalReceiptUrl,
        receiptFileName: finalReceiptName,
        receiptFileType: finalReceiptType,
        receiptFileSize: finalReceiptSize
      });

      onClose();
    } catch (err) {
      console.error('Erro ao registrar baixa / comprovante:', err);
      alert('Ocorreu um erro ao salvar o comprovante de pagamento. Tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReopen = async () => {
    if (!onReopen) return;
    if (isReconciled) {
      alert('🔒 Demanda Fechada e Auditada: Este título já foi conciliado com o extrato bancário. Não é possível reabrir diretamente. Caso precise ajustar, desconcilie primeiro no módulo de Conciliação Bancária.');
      return;
    }
    if (confirm(`Deseja realmente reabrir esta conta para 'Pendente'? (O comprovante anexado será mantido)`)) {
      setIsReopening(true);
      try {
        await onReopen(item);
        onClose();
      } catch (err) {
        console.error('Erro ao reabrir conta:', err);
      } finally {
        setIsReopening(false);
      }
    }
  };

  const hasReceiptAttached = Boolean(newReceiptFile || existingReceiptUrl);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/75 backdrop-blur-xs overflow-y-auto animate-fadeIn">
      <div 
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl max-w-3xl w-full my-auto max-h-[92vh] flex flex-col overflow-hidden transition-all text-slate-800 dark:text-slate-100"
        role="dialog"
        aria-modal="true"
      >
        {/* Top Header */}
        <div className="flex items-center justify-between px-6 py-4.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/50 shrink-0">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-2xl text-white ${isAlreadyPaid ? 'bg-purple-600 shadow-purple-600/30' : 'bg-emerald-600 shadow-emerald-600/30'} shadow-md`}>
              {isAlreadyPaid ? <Receipt className="w-5 h-5" /> : <CheckCircle2 className="w-5 h-5" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-black text-base sm:text-lg text-slate-900 dark:text-white leading-tight">
                  {isAlreadyPaid ? 'Editar Baixa e Comprovante' : 'Dar Baixa / Registrar Pagamento'}
                </h3>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                  isAlreadyPaid 
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800' 
                    : 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 border-amber-300 dark:border-amber-800'
                }`}>
                  {isAlreadyPaid ? 'Pago' : 'Pendente'}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {isAlreadyPaid 
                  ? 'Substitua o comprovante ou atualize os valores reais, juros e dados da quitação.' 
                  : 'Anexe o comprovante Sicredi, ajuste juros/abatimentos e liquide a conta.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting || isReopening}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            title="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body - Scrollable */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
          <div className="p-6 space-y-4.5 overflow-y-auto flex-1 custom-scrollbar">
            {/* Banner de Auditoria e Trava Contábil */}
            {isReconciled && (
              <div className="p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex items-center gap-3 text-amber-700 dark:text-amber-300">
                <div className="p-2 bg-amber-500/20 rounded-xl text-amber-600 dark:text-amber-400 shrink-0">
                  <Lock className="w-5 h-5" />
                </div>
                <div className="text-xs space-y-0.5">
                  <div className="font-black text-amber-800 dark:text-amber-200">
                    🔒 Demanda Auditada e Fechada (Conciliação Bancária)
                  </div>
                  <p className="text-amber-700/90 dark:text-amber-300/90">
                    Este título já foi conferido e liquidado pelo extrato bancário. Para preservar a integridade contábil, a reabertura e alteração de valores estão travadas. Para ajustes, desconcilie no módulo de Conciliação Bancária.
                  </p>
                </div>
              </div>
            )}

            {/* 1. Card Resumo do Pagamento */}
            <div className="bg-slate-50/90 dark:bg-slate-800/50 p-4.5 rounded-2xl border border-slate-200/90 dark:border-slate-700/80 space-y-3 shadow-xs">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1.5 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs px-2.5 py-0.5 rounded-md font-bold uppercase tracking-wider border ${
                      item.kind === 'cte'
                        ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/80 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800'
                        : item.kind === 'tax'
                        ? 'bg-purple-100 text-purple-800 dark:bg-purple-950/80 dark:text-purple-300 border-purple-200 dark:border-purple-800'
                        : 'bg-blue-100 text-blue-800 dark:bg-blue-950/80 dark:text-blue-300 border-blue-200 dark:border-blue-800'
                    }`}>
                      {item.docNumber}
                    </span>
                    <span className="text-[11px] px-2.5 py-0.5 rounded-md font-bold bg-slate-200/80 dark:bg-slate-700/80 text-slate-700 dark:text-slate-200">
                      {item.categoryOrCenter}
                    </span>
                    {item.taxPeriod && (
                      <span className="inline-flex items-center gap-1 text-[11px] px-2.5 py-0.5 rounded-md font-bold bg-indigo-100 text-indigo-800 dark:bg-indigo-950/80 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 font-mono">
                        <Calendar className="w-3 h-3 text-indigo-500" />
                        <span>Competência: {item.taxPeriod}</span>
                      </span>
                    )}
                  </div>
                  <h4 className="font-black text-base sm:text-lg text-slate-900 dark:text-white truncate" title={item.entityName}>
                    {item.entityName}
                  </h4>
                  {item.entityCpfCnpj && (
                    <p className="text-xs font-mono text-slate-500 dark:text-slate-400">
                      {item.entityCpfCnpj}
                    </p>
                  )}
                </div>

                {/* Valor Original em destaque */}
                <div className="text-right shrink-0">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                    Valor Original
                  </span>
                  <span className="font-black text-2xl text-slate-900 dark:text-white tracking-tight">
                    {formatBrl(originalAmount)}
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center justify-end gap-1 mt-0.5">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    Venc: {new Date(item.dueDate + 'T00:00:00').toLocaleDateString('pt-BR')}
                  </span>
                </div>
              </div>

              {/* Linha Digitável / Chave PIX se disponível */}
              {item.paymentDetails && (
                <div className="pt-2.5 border-t border-slate-200/70 dark:border-slate-700/60 flex items-center justify-between gap-3 text-xs bg-white/70 dark:bg-slate-900/60 p-2.5 rounded-xl border border-slate-200/60 dark:border-slate-700/40">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider shrink-0">
                      Dados Pagamento:
                    </span>
                    <span className="font-mono text-xs text-emerald-700 dark:text-emerald-300 truncate font-bold" title={item.paymentDetails}>
                      {item.paymentDetails}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyPaymentDetails}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 transition-colors cursor-pointer shrink-0"
                  >
                    <Copy className="w-3 h-3" />
                    <span>{copiedKey ? 'Copiado!' : 'Copiar Dados'}</span>
                  </button>
                </div>
              )}
            </div>

            {/* 2. MOTOR DE AJUSTE FINANCEIRO (OBZ): Juros, Abatimento e Valor Real Pago */}
            <div className="p-4.5 bg-gradient-to-br from-purple-500/5 via-slate-50 to-emerald-500/5 dark:from-purple-950/25 dark:via-slate-800/60 dark:to-emerald-950/25 rounded-2xl border border-purple-200/70 dark:border-purple-800/50 space-y-3.5 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span>Ajuste Financeiro (Juros, Abatimento & Valor Real)</span>
                </span>
                {(interestAmount > 0 || discountAmount > 0) && (
                  <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-purple-100 text-purple-800 dark:bg-purple-950/80 dark:text-purple-300 border border-purple-300 dark:border-purple-700">
                    Valores Ajustados
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 items-end">
                {/* (+) Juros / Multa */}
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5 flex items-center gap-1">
                    <Plus className="w-3.5 h-3.5 text-rose-500" />
                    <span>Juros / Mora (R$)</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0,00"
                    value={interestAmount || ''}
                    disabled={isReconciled}
                    onChange={(e) => handleInterestChange(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-sm font-bold text-rose-600 dark:text-rose-400 focus:ring-2 focus:ring-rose-500 outline-none transition-all"
                  />
                </div>

                {/* (-) Abatimento / Desconto */}
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5 flex items-center gap-1">
                    <Minus className="w-3.5 h-3.5 text-emerald-500" />
                    <span>Abatimento (R$)</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0,00"
                    value={discountAmount || ''}
                    disabled={isReconciled}
                    onChange={(e) => handleDiscountChange(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-sm font-bold text-emerald-600 dark:text-emerald-400 focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                  />
                </div>

                {/* (=) Valor Real Pago */}
                <div>
                  <label className="block text-xs font-black text-slate-800 dark:text-slate-100 mb-1.5 flex items-center gap-1">
                    <Equal className="w-3.5 h-3.5 text-purple-500" />
                    <span>Valor Real Pago (R$) *</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={paidAmount || ''}
                    onChange={(e) => setPaidAmount(parseFloat(e.target.value) || 0)}
                    className="w-full px-3.5 py-2.5 bg-purple-50/90 dark:bg-purple-950/50 border-2 border-purple-400 dark:border-purple-600 rounded-xl text-base font-black text-purple-700 dark:text-purple-300 focus:ring-2 focus:ring-purple-500 outline-none transition-all shadow-inner"
                  />
                </div>
              </div>

              {/* Linha explicativa da fórmula */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs text-slate-500 dark:text-slate-400 pt-2 border-t border-purple-200/50 dark:border-purple-900/40 bg-white/60 dark:bg-slate-900/40 px-3 py-2 rounded-xl">
                <span>Fórmula: Original ({formatBrl(originalAmount)}) + Juros ({formatBrl(interestAmount)}) - Abatimento ({formatBrl(discountAmount)})</span>
                <strong className="text-purple-700 dark:text-purple-300 font-black text-sm">{formatBrl(paidAmount)}</strong>
              </div>
            </div>

            {/* 3. Dados da Quitação: Data, Forma de Pagamento e Conta Bancária */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  Data Efetiva *
                </label>
                <input
                  type="date"
                  required
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-medium focus:ring-2 focus:ring-emerald-500 outline-hidden transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
                  <CreditCard className="w-3.5 h-3.5 text-slate-400" />
                  Forma de Pagamento
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as any)}
                  className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-medium focus:ring-2 focus:ring-emerald-500 outline-hidden transition-all"
                >
                  <option value="Boleto">Boleto Bancário</option>
                  <option value="Pix">PIX</option>
                  <option value="Transferência">Transferência (TED/DOC)</option>
                  <option value="Cartão">Cartão de Crédito/Débito</option>
                  <option value="Dinheiro">Dinheiro / Espécie</option>
                  <option value="Outro">Outro</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
                  <Landmark className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  Banco de Saída
                </label>
                <select
                  value={bankAccount}
                  onChange={(e) => setBankAccount(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-bold text-emerald-700 dark:text-emerald-300 focus:ring-2 focus:ring-emerald-500 outline-hidden transition-all"
                >
                  <option value="Sicredi">🟢 Sicredi (Conta Matriz)</option>
                  <option value="Itaú">Itaú Unibanco</option>
                  <option value="Bradesco">Bradesco</option>
                  <option value="Banco do Brasil">Banco do Brasil</option>
                  <option value="Santander">Santander</option>
                  <option value="Caixa">Caixa Econômica</option>
                  <option value="Outro">Outro Banco</option>
                </select>
              </div>
            </div>

            {/* Destaque do Leitor Sicredi (se identificado) */}
            {sicrediParsedInfo && (
              <div className="p-4 bg-emerald-50/90 dark:bg-emerald-950/50 border border-emerald-300 dark:border-emerald-700 rounded-2xl text-xs space-y-2 animate-fadeIn shadow-xs">
                <div className="flex items-center gap-2 font-bold text-emerald-800 dark:text-emerald-200">
                  <Sparkles className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span>
                    {sicrediParsedInfo.isSicredi 
                      ? 'Comprovante Sicredi identificado e extraído com sucesso!' 
                      : `Comprovante bancário (${sicrediParsedInfo.bankName}) lido com sucesso!`}
                  </span>
                </div>
                <div className="flex items-center gap-3.5 text-xs text-emerald-700 dark:text-emerald-300 flex-wrap">
                  {sicrediParsedInfo.paymentDate && <span>📅 Pago em: <strong>{new Date(sicrediParsedInfo.paymentDate + 'T00:00:00').toLocaleDateString('pt-BR')}</strong></span>}
                  {sicrediParsedInfo.interestAmount ? <span>⚠️ Juros/Mora: <strong>+{formatBrl(sicrediParsedInfo.interestAmount)}</strong></span> : null}
                  {sicrediParsedInfo.discountAmount ? <span>✅ Desconto: <strong>-{formatBrl(sicrediParsedInfo.discountAmount)}</strong></span> : null}
                  {sicrediParsedInfo.paidAmount && <span>💰 Débito Real: <strong>{formatBrl(sicrediParsedInfo.paidAmount)}</strong></span>}
                  {sicrediParsedInfo.authCode && <span className="font-mono text-xs">Autenticação: {sicrediParsedInfo.authCode.substring(0, 18)}...</span>}
                </div>
              </div>
            )}

            {/* 4. Área de Anexo do Comprovante de Pagamento */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                  <Receipt className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span>Comprovante de Pagamento (Sicredi / PDF / Imagem)</span>
                </label>
                {isAnalyzingFile ? (
                  <span className="text-xs font-bold text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Lendo dados do comprovante...
                  </span>
                ) : hasReceiptAttached ? (
                  <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Pronto para arquivamento
                  </span>
                ) : null}
              </div>

              {/* Caso 1: Comprovante já existente no banco/storage */}
              {existingReceiptUrl && !newReceiptFile && (
                <div className="p-4 bg-emerald-50/90 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/70 rounded-2xl flex items-center justify-between gap-3 shadow-xs">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2.5 bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 rounded-xl shrink-0">
                      <FileCheck className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-emerald-900 dark:text-emerald-200 truncate">
                        {existingReceiptName || 'Comprovante_de_Pagamento.pdf'}
                      </p>
                      <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-0.5">
                        Comprovante arquivado na nuvem Transcunha
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => openDocumentInNewTab(existingReceiptUrl, existingReceiptName || 'Comprovante_Pagamento')}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 rounded-xl hover:bg-emerald-100/50 transition-colors cursor-pointer shadow-xs"
                      title="Visualizar documento em nova aba"
                    >
                      <Eye className="w-4 h-4" />
                      <span>Ver</span>
                      <ExternalLink className="w-3 h-3 opacity-70" />
                    </button>

                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="px-2.5 py-1.5 text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-emerald-600 hover:bg-white/80 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
                      title="Substituir por outro arquivo"
                    >
                      Trocar
                    </button>

                    <button
                      type="button"
                      onClick={handleRemoveExistingReceipt}
                      className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-100/60 dark:hover:bg-rose-950/60 rounded-xl transition-colors cursor-pointer"
                      title="Remover anexo do comprovante"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* Caso 2: Novo arquivo selecionado para upload */}
              {newReceiptFile && (
                <div className="p-4 bg-blue-50/90 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/70 rounded-2xl flex items-center justify-between gap-3 shadow-xs">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2.5 bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 rounded-xl shrink-0">
                      <Upload className="w-5 h-5 animate-bounce" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-blue-900 dark:text-blue-200 truncate">
                        {newReceiptFile.name}
                      </p>
                      <p className="text-xs text-blue-700 dark:text-blue-400 mt-0.5">
                        {(newReceiptFile.size / 1024).toFixed(1)} KB • Pronto para upload
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="px-3 py-1.5 text-xs font-bold text-blue-700 dark:text-blue-300 hover:bg-blue-100/60 dark:hover:bg-blue-900/40 rounded-xl transition-colors cursor-pointer"
                    >
                      Trocar
                    </button>
                    <button
                      type="button"
                      onClick={handleRemoveNewReceipt}
                      className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-100/60 dark:hover:bg-rose-950/60 rounded-xl transition-colors cursor-pointer"
                      title="Remover seleção"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* Caso 3: Nenhum arquivo selecionado nem existente (Dropzone Amplo) */}
              {!existingReceiptUrl && !newReceiptFile && (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-emerald-500 dark:hover:border-emerald-500 bg-slate-50/60 dark:bg-slate-800/40 hover:bg-emerald-50/30 dark:hover:bg-emerald-950/20 rounded-2xl p-6 text-center cursor-pointer transition-all group shadow-xs"
                >
                  <div className="w-12 h-12 mx-auto mb-2.5 rounded-2xl bg-slate-100 dark:bg-slate-800 group-hover:bg-emerald-100 dark:group-hover:bg-emerald-950 text-slate-500 dark:text-slate-400 group-hover:text-emerald-600 flex items-center justify-center transition-all group-hover:scale-105">
                    <Upload className="w-6 h-6" />
                  </div>
                  <p className="text-sm font-bold text-slate-700 dark:text-slate-200 group-hover:text-emerald-600 transition-colors">
                    Clique ou arraste o comprovante Sicredi aqui (PDF ou Imagem)
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    O sistema lê juros, data e valor real automaticamente ao carregar
                  </p>
                </div>
              )}

              {/* Input file invisível */}
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,image/*"
                onChange={handleFileChange}
                className="hidden"
              />
            </div>

            {/* 5. Autenticação Bancária & Observações */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">
                  Autenticação Bancária / Protocolo
                </label>
                <input
                  type="text"
                  placeholder="Ex: 8.A3B.9C1... ou E00416968..."
                  value={paymentAuthCode}
                  onChange={(e) => setPaymentAuthCode(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-mono focus:ring-2 focus:ring-emerald-500 outline-hidden transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">
                  Observações do Pagamento
                </label>
                <input
                  type="text"
                  placeholder="Ex: Quitação via Sicredi com juros de cartório..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-medium focus:ring-2 focus:ring-emerald-500 outline-hidden transition-all"
                />
              </div>
            </div>
          </div>

          {/* Rodapé e Botões de Ação */}
          <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-800/60 flex items-center justify-between gap-3 flex-wrap shrink-0">
            <div>
              {isAlreadyPaid && onReopen && (
                isReconciled ? (
                  <span
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800 cursor-not-allowed border border-slate-200 dark:border-slate-700 select-none"
                    title="🔒 Demanda fechada: Título conciliado com o extrato bancário. Desconcilie primeiro no módulo de Conciliação Bancária (requer autorização de Administrador/Diretoria)."
                  >
                    <Lock className="w-3.5 h-3.5 text-amber-500" />
                    <span>Reabertura Bloqueada (Conciliado)</span>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={handleReopen}
                    disabled={isSubmitting || isReopening}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                    title="Desfazer baixa e retornar ao status Pendente"
                  >
                    {isReopening ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                    <span>Reabrir para Pendente</span>
                  </button>
                )
              )}
            </div>

            <div className="flex items-center gap-2.5 ml-auto">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting || isReopening}
                className="px-4.5 py-2.5 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
              >
                Cancelar
              </button>

              <button
                type="submit"
                disabled={isSubmitting || isReopening}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs sm:text-sm font-black bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-600/25 hover:shadow-emerald-600/35 transition-all cursor-pointer disabled:opacity-50 active:scale-95"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Salvando...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>
                      {isAlreadyPaid 
                        ? 'Salvar Alterações' 
                        : hasReceiptAttached 
                        ? `Baixar como Pago (${formatBrl(paidAmount)})` 
                        : `Confirmar Baixa (${formatBrl(paidAmount)})`}
                    </span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
