import React, { useState, useEffect } from 'react';
import { 
  X, Landmark, Calendar, DollarSign, Barcode, FileText, 
  Upload, Trash2, Check, AlertCircle, Loader2, Sparkles, HelpCircle
} from 'lucide-react';
import type { FinancialTransaction, TaxType, User } from '../../types';
import { FinancialCategoryType, FinancialTransactionStatus } from '../../types';
import { uploadInvoiceAttachmentToStorage } from '../../services/financialInvoiceService';

interface TaxManualModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (taxData: Partial<FinancialTransaction>, file?: File) => Promise<void>;
  initialData?: FinancialTransaction | null;
  currentUser?: User | null;
}

interface TaxPreset {
  label: string;
  defaultBeneficiary: string;
  defaultCode: string;
  defaultDescription: string;
  badgeBg: string;
  badgeText: string;
}

const TAX_PRESETS: Record<TaxType, TaxPreset> = {
  PIS_COFINS: {
    label: 'PIS / COFINS (DARF)',
    defaultBeneficiary: 'Receita Federal do Brasil',
    defaultCode: '5856',
    defaultDescription: 'DARF Sicalc PIS / COFINS',
    badgeBg: 'bg-blue-100 dark:bg-blue-950/60',
    badgeText: 'text-blue-700 dark:text-blue-300'
  },
  ICMS: {
    label: 'ICMS Transporte (DARE/GNRE)',
    defaultBeneficiary: 'Secretaria da Fazenda de SP (SEFAZ)',
    defaultCode: '111-9',
    defaultDescription: 'DARE-SP ICMS Frete Transporte',
    badgeBg: 'bg-purple-100 dark:bg-purple-950/60',
    badgeText: 'text-purple-700 dark:text-purple-300'
  },
  CSLL: {
    label: 'CSLL Estimativa (DARF)',
    defaultBeneficiary: 'Receita Federal do Brasil',
    defaultCode: '2484',
    defaultDescription: 'DARF CSLL Estimativa Mensal',
    badgeBg: 'bg-emerald-100 dark:bg-emerald-950/60',
    badgeText: 'text-emerald-700 dark:text-emerald-300'
  },
  IRPJ: {
    label: 'IRPJ Estimativa (DARF)',
    defaultBeneficiary: 'Receita Federal do Brasil',
    defaultCode: '5993',
    defaultDescription: 'DARF IRPJ Estimativa Mensal',
    badgeBg: 'bg-amber-100 dark:bg-amber-950/60',
    badgeText: 'text-amber-700 dark:text-amber-300'
  },
  FGTS: {
    label: 'FGTS Digital',
    defaultBeneficiary: 'Caixa Econômica Federal / FGTS Digital',
    defaultCode: 'FGTS',
    defaultDescription: 'Guia FGTS Digital Mensal',
    badgeBg: 'bg-teal-100 dark:bg-teal-950/60',
    badgeText: 'text-teal-700 dark:text-teal-300'
  },
  INSS: {
    label: 'INSS / DCTFWeb',
    defaultBeneficiary: 'Receita Federal do Brasil / DCTFWeb',
    defaultCode: 'DCTF',
    defaultDescription: 'DARF Previdenciário DCTFWeb INSS',
    badgeBg: 'bg-rose-100 dark:bg-rose-950/60',
    badgeText: 'text-rose-700 dark:text-rose-300'
  },
  OUTROS: {
    label: 'Outro Tributo / Taxa',
    defaultBeneficiary: 'Órgão Arrecadador / Fisco',
    defaultCode: '',
    defaultDescription: 'Guia de Recolhimento Tributário',
    badgeBg: 'bg-slate-100 dark:bg-slate-800',
    badgeText: 'text-slate-700 dark:text-slate-300'
  }
};

export const TaxManualModal: React.FC<TaxManualModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialData,
  currentUser
}) => {
  const isEditing = Boolean(initialData && initialData.id);

  const [taxType, setTaxType] = useState<TaxType>('PIS_COFINS');
  const [description, setDescription] = useState('');
  const [beneficiary, setBeneficiary] = useState('');
  const [documentNumber, setDocumentNumber] = useState('');
  const [taxCode, setTaxCode] = useState('');
  const [taxPeriod, setTaxPeriod] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [principalAmount, setPrincipalAmount] = useState<string>('');
  const [fineAmount, setFineAmount] = useState<string>('');
  const [interestAmount, setInterestAmount] = useState<string>('');
  const [totalAmount, setTotalAmount] = useState<string>('');
  const [barcode, setBarcode] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<FinancialTransactionStatus>(FinancialTransactionStatus.Pendente);
  const [paymentDate, setPaymentDate] = useState('');

  // Arquivo anexo
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [existingAttachmentUrl, setExistingAttachmentUrl] = useState<string | undefined>(undefined);
  const [existingAttachmentName, setExistingAttachmentName] = useState<string | undefined>(undefined);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Inicializa dados quando o modal abre ou initialData muda
  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        setTaxType(initialData.taxType || 'OUTROS');
        setDescription(initialData.description || '');
        setBeneficiary(initialData.supplierOrClientName || '');
        setDocumentNumber(initialData.documentNumber || '');
        setTaxCode(initialData.taxCode || '');
        setTaxPeriod(initialData.taxPeriod || '');
        setDueDate(initialData.dueDate || new Date().toISOString().split('T')[0]);
        setPrincipalAmount(initialData.taxPrincipalAmount ? String(initialData.taxPrincipalAmount) : '');
        setFineAmount(initialData.taxFineAmount ? String(initialData.taxFineAmount) : '');
        setInterestAmount(initialData.taxInterestAmount ? String(initialData.taxInterestAmount) : '');
        setTotalAmount(initialData.amount ? String(initialData.amount) : '');
        setBarcode(initialData.barcode || '');
        setNotes(initialData.notes || '');
        setStatus(initialData.status || FinancialTransactionStatus.Pendente);
        setPaymentDate(initialData.paymentDate || '');
        setExistingAttachmentUrl(initialData.attachmentUrl);
        setExistingAttachmentName(initialData.attachmentName);
        setSelectedFile(null);
      } else {
        const todayStr = new Date().toISOString().split('T')[0];
        setTaxType('PIS_COFINS');
        setDescription(TAX_PRESETS.PIS_COFINS.defaultDescription);
        setBeneficiary(TAX_PRESETS.PIS_COFINS.defaultBeneficiary);
        setDocumentNumber('');
        setTaxCode(TAX_PRESETS.PIS_COFINS.defaultCode);
        setTaxPeriod('');
        setDueDate(todayStr);
        setPrincipalAmount('');
        setFineAmount('');
        setInterestAmount('');
        setTotalAmount('');
        setBarcode('');
        setNotes('');
        setStatus(FinancialTransactionStatus.Pendente);
        setPaymentDate('');
        setExistingAttachmentUrl(undefined);
        setExistingAttachmentName(undefined);
        setSelectedFile(null);
      }
      setErrorMsg(null);
    }
  }, [isOpen, initialData]);

  if (!isOpen) return null;

  // Troca de tipo de tributo: auto-preenche padrões se campos estiverem vazios ou forem os padrões anteriores
  const handleTaxTypeChange = (newType: TaxType) => {
    setTaxType(newType);
    const preset = TAX_PRESETS[newType];
    if (!description || Object.values(TAX_PRESETS).some(p => p.defaultDescription === description)) {
      setDescription(preset.defaultDescription);
    }
    if (!beneficiary || Object.values(TAX_PRESETS).some(p => p.defaultBeneficiary === beneficiary)) {
      setBeneficiary(preset.defaultBeneficiary);
    }
    if (!taxCode || Object.values(TAX_PRESETS).some(p => p.defaultCode === taxCode)) {
      setTaxCode(preset.defaultCode);
    }
  };

  // Recalcula o valor total automaticamente quando o usuário altera principal, multa ou juros
  const handlePrincipalChange = (val: string) => {
    setPrincipalAmount(val);
    recalcTotal(val, fineAmount, interestAmount);
  };

  const handleFineChange = (val: string) => {
    setFineAmount(val);
    recalcTotal(principalAmount, val, interestAmount);
  };

  const handleInterestChange = (val: string) => {
    setInterestAmount(val);
    recalcTotal(principalAmount, fineAmount, val);
  };

  const recalcTotal = (pStr: string, fStr: string, iStr: string) => {
    const p = parseFloat(pStr.replace(',', '.')) || 0;
    const f = parseFloat(fStr.replace(',', '.')) || 0;
    const i = parseFloat(iStr.replace(',', '.')) || 0;
    const sum = p + f + i;
    if (sum > 0) {
      setTotalAmount(sum.toFixed(2));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const numTotal = parseFloat(totalAmount.replace(',', '.'));
    if (!numTotal || numTotal <= 0) {
      setErrorMsg('Informe um valor total a pagar válido maior que zero.');
      return;
    }

    if (!dueDate) {
      setErrorMsg('A data de vencimento da guia é obrigatória.');
      return;
    }

    if (!description.trim()) {
      setErrorMsg('Informe a descrição ou nome da guia.');
      return;
    }

    setIsSubmitting(true);
    try {
      let finalAttachmentUrl = existingAttachmentUrl;
      let finalAttachmentName = existingAttachmentName;

      // Upload do arquivo se houver novo
      if (selectedFile) {
        try {
          const fakeId = initialData?.id || `tax_${Date.now()}`;
          finalAttachmentUrl = await uploadInvoiceAttachmentToStorage(
            selectedFile,
            fakeId,
            'guia_imposto',
            selectedFile.name,
            selectedFile.type
          );
          finalAttachmentName = selectedFile.name;
        } catch (uploadErr: any) {
          console.warn('[TaxManualModal] Erro ao enviar anexo:', uploadErr);
        }
      }

      const pVal = parseFloat(principalAmount.replace(',', '.')) || undefined;
      const fVal = parseFloat(fineAmount.replace(',', '.')) || undefined;
      const iVal = parseFloat(interestAmount.replace(',', '.')) || undefined;

      const payload: Partial<FinancialTransaction> = {
        type: 'payable',
        description: description.trim(),
        amount: numTotal,
        dueDate,
        status,
        paymentDate: status === FinancialTransactionStatus.Pago ? (paymentDate || dueDate) : undefined,
        category: FinancialCategoryType.CustoImposto,
        costCenter: 'Fiscal / Tributário',
        documentNumber: documentNumber.trim() || undefined,
        supplierOrClientName: beneficiary.trim() || TAX_PRESETS[taxType].defaultBeneficiary,
        taxType,
        taxCode: taxCode.trim() || undefined,
        taxPeriod: taxPeriod.trim() || undefined,
        taxPrincipalAmount: pVal,
        taxFineAmount: fVal,
        taxInterestAmount: iVal,
        barcode: barcode.trim() || undefined,
        notes: notes.trim() || `[Imposto] ${TAX_PRESETS[taxType].label}`,
        attachmentUrl: finalAttachmentUrl,
        attachmentName: finalAttachmentName
      };

      await onSave(payload, selectedFile || undefined);
      onClose();
    } catch (err: any) {
      console.error('[TaxManualModal] Erro ao salvar guia:', err);
      setErrorMsg(err?.message || 'Erro ao salvar guia de imposto. Tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Cabeçalho */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-purple-600/10 text-purple-600 dark:bg-purple-500/20 dark:text-purple-400">
              <Landmark className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                {isEditing ? 'Editar Guia de Imposto / Tributo' : 'Novo Lançamento de Imposto / Tributo'}
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${TAX_PRESETS[taxType].badgeBg} ${TAX_PRESETS[taxType].badgeText}`}>
                  {TAX_PRESETS[taxType].label}
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {isEditing 
                  ? 'Atualize os valores, código de barras ou anexo da guia tributária.' 
                  : 'Cadastre guias fiscais e tributárias com sincronização em tempo real na nuvem.'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            type="button"
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Formulário */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Seleção do Tipo de Tributo */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              Tipo de Tributo / Guia Fiscal *
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(Object.keys(TAX_PRESETS) as TaxType[]).map((type) => {
                const isSelected = taxType === type;
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => handleTaxTypeChange(type)}
                    className={`px-2.5 py-2 rounded-xl text-xs font-bold transition-all text-left border cursor-pointer ${
                      isSelected
                        ? 'bg-purple-600 text-white border-purple-600 shadow-md shadow-purple-600/25 ring-2 ring-purple-500/20'
                        : 'bg-slate-50 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-purple-300'
                    }`}
                  >
                    <div className="truncate">{TAX_PRESETS[type].label.split(' ')[0]}</div>
                    <div className={`text-[10px] truncate ${isSelected ? 'text-purple-100' : 'text-slate-400'}`}>
                      {TAX_PRESETS[type].defaultCode ? `Cód: ${TAX_PRESETS[type].defaultCode}` : 'Geral'}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Linha 1: Descrição e Órgão Favorecido */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Descrição da Guia *
              </label>
              <input
                type="text"
                required
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Ex: DARF Sicalc PIS/COFINS 02/2026"
                className="w-full px-3 py-2 rounded-xl text-xs border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Órgão Favorecido / Beneficiário *
              </label>
              <input
                type="text"
                required
                value={beneficiary}
                onChange={(e) => setBeneficiary(e.target.value)}
                placeholder="Ex: Receita Federal do Brasil"
                className="w-full px-3 py-2 rounded-xl text-xs border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
          </div>

          {/* Linha 2: Vencimento, Código do Tributo, Período de Apuração e Nº Documento */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-purple-500" />
                Vencimento *
              </label>
              <input
                type="date"
                required
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl text-xs border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-purple-500 font-bold"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Cód. Receita
              </label>
              <input
                type="text"
                value={taxCode}
                onChange={(e) => setTaxCode(e.target.value)}
                placeholder="Ex: 5856"
                className="w-full px-3 py-2 rounded-xl text-xs border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-purple-500 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Período Apuração (PA)
              </label>
              <input
                type="text"
                value={taxPeriod}
                onChange={(e) => setTaxPeriod(e.target.value)}
                placeholder="Ex: 02/2026"
                className="w-full px-3 py-2 rounded-xl text-xs border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Nº Guia / Documento
              </label>
              <input
                type="text"
                value={documentNumber}
                onChange={(e) => setDocumentNumber(e.target.value)}
                placeholder="Ex: DARF-9812"
                className="w-full px-3 py-2 rounded-xl text-xs border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-purple-500 font-mono"
              />
            </div>
          </div>

          {/* Linha 3: Composição de Valores (Principal, Multa, Juros e Total) */}
          <div className="p-3.5 rounded-2xl bg-purple-50/50 dark:bg-purple-950/20 border border-purple-100 dark:border-purple-900/50 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-purple-900 dark:text-purple-200 flex items-center gap-1.5">
                <DollarSign className="w-3.5 h-3.5 text-purple-600" />
                Composição do Valor da Guia
              </span>
              <span className="text-[11px] text-purple-600 dark:text-purple-400 font-medium">
                Auto-soma ativada
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Valor Principal (R$)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={principalAmount}
                  onChange={(e) => handlePrincipalChange(e.target.value)}
                  placeholder="0,00"
                  className="w-full px-3 py-2 rounded-xl text-xs border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-purple-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Multa (R$)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={fineAmount}
                  onChange={(e) => handleFineChange(e.target.value)}
                  placeholder="0,00"
                  className="w-full px-3 py-2 rounded-xl text-xs border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-purple-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Juros / Encargos (R$)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={interestAmount}
                  onChange={(e) => handleInterestChange(e.target.value)}
                  placeholder="0,00"
                  className="w-full px-3 py-2 rounded-xl text-xs border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-purple-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-purple-700 dark:text-purple-300 mb-1">
                  Total a Pagar (R$) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={totalAmount}
                  onChange={(e) => setTotalAmount(e.target.value)}
                  placeholder="0,00"
                  className="w-full px-3 py-2 rounded-xl text-xs border-2 border-purple-500 bg-white dark:bg-slate-800 text-purple-700 dark:text-purple-300 outline-none font-mono font-black shadow-xs"
                />
              </div>
            </div>
          </div>

          {/* Linha 4: Código de Barras / Linha Digitável */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center justify-between">
              <span className="flex items-center gap-1">
                <Barcode className="w-3.5 h-3.5 text-purple-500" />
                Linha Digitável / Código de Barras de Arrecadação
              </span>
              <span className="text-[10px] text-slate-400">
                Geralmente começa com o dígito 8
              </span>
            </label>
            <input
              type="text"
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              placeholder="85880000000-0 00000000000-0 00000000000-0 00000000000-0"
              className="w-full px-3 py-2 rounded-xl text-xs border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-purple-500 font-mono tracking-wider"
            />
          </div>

          {/* Linha 5: Anexo do Arquivo da Guia */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
              <FileText className="w-3.5 h-3.5 text-purple-500" />
              Documento / Arquivo da Guia (PDF ou Imagem)
            </label>

            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-600 cursor-pointer transition-colors shrink-0">
                <Upload className="w-4 h-4 text-purple-600" />
                <span>{selectedFile ? 'Substituir Arquivo' : existingAttachmentUrl ? 'Trocar Anexo' : 'Anexar Guia'}</span>
                <input
                  type="file"
                  accept="application/pdf,image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) setSelectedFile(file);
                  }}
                />
              </label>

              {selectedFile ? (
                <div className="text-xs text-purple-600 dark:text-purple-400 font-semibold truncate flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5" />
                  <span>Novo arquivo: {selectedFile.name} ({(selectedFile.size / 1024).toFixed(0)} KB)</span>
                </div>
              ) : existingAttachmentUrl ? (
                <div className="text-xs text-slate-600 dark:text-slate-400 truncate flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span>Guia anexada: {existingAttachmentName || 'Documento Tributário'}</span>
                </div>
              ) : (
                <span className="text-xs text-slate-400 italic">Nenhum arquivo anexado</span>
              )}
            </div>
          </div>

          {/* Linha 6: Status da Guia e Observações */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Status de Quitação
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as FinancialTransactionStatus)}
                className="w-full px-3 py-2 rounded-xl text-xs border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none cursor-pointer"
              >
                <option value={FinancialTransactionStatus.Pendente}>Pendente (A recolher)</option>
                <option value={FinancialTransactionStatus.Pago}>Pago (Já quitado)</option>
                <option value={FinancialTransactionStatus.Atrasado}>Atrasado (Vencido)</option>
              </select>
            </div>

            {status === FinancialTransactionStatus.Pago && (
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Data do Pagamento
                </label>
                <input
                  type="date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl text-xs border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none font-bold"
                />
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              Observações Adicionais
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Ex: Guia referente à competência 02/2026. Recolhimento via conta Sicredi..."
              className="w-full px-3 py-2 rounded-xl text-xs border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          {/* Botões de Ação */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-bold border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-1.5 px-5 py-2.5 bg-linear-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl text-xs font-bold shadow-lg shadow-purple-600/30 transition-all cursor-pointer disabled:opacity-50 active:scale-95"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Salvando na nuvem...</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>{isEditing ? 'Salvar Alterações' : 'Salvar Guia'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
