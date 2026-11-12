import React, { useState, useRef } from 'react';
import { 
  X, Upload, FileText, CheckCircle2, AlertCircle, Loader2, 
  Trash2, Copy, Check, Receipt, Calendar, DollarSign, Barcode, Landmark, ShieldCheck
} from 'lucide-react';
import { extractDataFromTaxInvoiceFile, type ExtractedTaxData } from '../../utils/taxInvoiceParser';
import { uploadInvoiceAttachmentToStorage } from '../../services/financialInvoiceService';
import type { TaxType } from '../../types';

export interface TaxImportItem {
  id: string;
  file: File;
  status: 'parsing' | 'ready' | 'error';
  errorMessage?: string;
  taxType: TaxType;
  taxTypeName: string;
  taxCode?: string;
  documentNumber?: string;
  period?: string;
  dueDate?: string;
  principalAmount?: number;
  fineAmount?: number;
  interestAmount?: number;
  totalAmount: number;
  barcode?: string;
  beneficiary?: string;
  description: string;
  notes?: string;
}

interface TaxInvoiceImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportSuccess: (importedItems: TaxImportItem[]) => Promise<void> | void;
}

const TAX_BADGES: Record<TaxType, { label: string; bg: string; text: string; border: string }> = {
  PIS_COFINS: {
    label: 'PIS / COFINS',
    bg: 'bg-blue-500/10 dark:bg-blue-500/20',
    text: 'text-blue-700 dark:text-blue-300',
    border: 'border-blue-300 dark:border-blue-700'
  },
  ICMS: {
    label: 'ICMS Transporte',
    bg: 'bg-purple-500/10 dark:bg-purple-500/20',
    text: 'text-purple-700 dark:text-purple-300',
    border: 'border-purple-300 dark:border-purple-700'
  },
  CSLL: {
    label: 'CSLL Estimativa',
    bg: 'bg-emerald-500/10 dark:bg-emerald-500/20',
    text: 'text-emerald-700 dark:text-emerald-300',
    border: 'border-emerald-300 dark:border-emerald-700'
  },
  IRPJ: {
    label: 'IRPJ Estimativa',
    bg: 'bg-amber-500/10 dark:bg-amber-500/20',
    text: 'text-amber-700 dark:text-amber-300',
    border: 'border-amber-300 dark:border-amber-700'
  },
  FGTS: {
    label: 'Guia de FGTS',
    bg: 'bg-teal-500/10 dark:bg-teal-500/20',
    text: 'text-teal-700 dark:text-teal-300',
    border: 'border-teal-300 dark:border-teal-700'
  },
  INSS: {
    label: 'INSS / DCTFWeb',
    bg: 'bg-rose-500/10 dark:bg-rose-500/20',
    text: 'text-rose-700 dark:text-rose-300',
    border: 'border-rose-300 dark:border-rose-700'
  },
  OUTROS: {
    label: 'Outro Tributo',
    bg: 'bg-slate-500/10 dark:bg-slate-500/20',
    text: 'text-slate-700 dark:text-slate-300',
    border: 'border-slate-300 dark:border-slate-700'
  }
};

export const TaxInvoiceImportModal: React.FC<TaxInvoiceImportModalProps> = ({
  isOpen,
  onClose,
  onImportSuccess
}) => {
  const [items, setItems] = useState<TaxImportItem[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFiles = async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    // Adiciona como 'parsing'
    const newItems: TaxImportItem[] = fileArray.map(file => ({
      id: Math.random().toString(36).substring(2, 9),
      file,
      status: 'parsing',
      taxType: 'OUTROS',
      taxTypeName: 'Lendo...',
      totalAmount: 0,
      description: file.name.replace(/\.[^/.]+$/, '')
    }));

    setItems(prev => [...prev, ...newItems]);

    // Executa extração para cada item
    for (const item of newItems) {
      try {
        const extracted = await extractDataFromTaxInvoiceFile(item.file);
        setItems(current =>
          current.map(c => {
            if (c.id !== item.id) return c;
            return {
              ...c,
              status: 'ready',
              taxType: extracted.taxType,
              taxTypeName: extracted.taxTypeName,
              taxCode: extracted.taxCode,
              documentNumber: extracted.documentNumber,
              period: extracted.period,
              dueDate: extracted.dueDate || new Date().toISOString().split('T')[0],
              principalAmount: extracted.principalAmount,
              fineAmount: extracted.fineAmount,
              interestAmount: extracted.interestAmount,
              totalAmount: extracted.totalAmount || 0,
              barcode: extracted.barcode,
              beneficiary: extracted.beneficiary || 'Governo / Receita',
              description: extracted.description || extracted.taxTypeName,
              notes: extracted.notes
            };
          })
        );
      } catch (err: any) {
        console.error('Erro na extração de imposto:', err);
        setItems(current =>
          current.map(c => (c.id === item.id ? { ...c, status: 'error', errorMessage: err?.message || 'Falha ao ler guia' } : c))
        );
      }
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const handleRemoveItem = (id: string) => {
    setItems(prev => prev.filter(i => i.id !== id));
  };

  const handleUpdateItem = (id: string, updates: Partial<TaxImportItem>) => {
    setItems(prev => prev.map(i => (i.id === id ? { ...i, ...updates } : i)));
  };

  const handleCopyBarcode = (barcode: string, id: string) => {
    navigator.clipboard.writeText(barcode.replace(/[\s.-]/g, ''));
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleConfirmImport = async () => {
    const readyItems = items.filter(i => i.status === 'ready' && i.totalAmount > 0);
    if (readyItems.length === 0) {
      alert('Nenhuma guia pronta com valor válido para importar.');
      return;
    }

    setIsSubmitting(true);
    try {
      await onImportSuccess(readyItems);
      onClose();
    } catch (err: any) {
      console.error('Erro ao importar guias:', err);
      alert(`Erro ao salvar guias: ${err?.message || 'Tente novamente.'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const totalConsolidated = items
    .filter(i => i.status === 'ready')
    .reduce((acc, curr) => acc + (curr.totalAmount || 0), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Cabeçalho */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-indigo-600/10 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400">
              <Landmark className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                Leitor Automático de Guias de Impostos & Tributos
                <span className="text-[10px] px-2 py-0.5 rounded-full font-mono bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 uppercase tracking-wider">
                  OCR & IA
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Lê DARE-SP (ICMS), DARF Sicalc (PIS / COFINS), CSLL, IRPJ, DARF Previdenciário (INSS / DCTFWeb) e FGTS Digital.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Conteúdo Principal */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* Dropzone */}
          <div
            onDragOver={e => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-indigo-300 dark:border-indigo-800 hover:border-indigo-500 dark:hover:border-indigo-600 rounded-3xl p-6 text-center cursor-pointer bg-indigo-50/40 dark:bg-indigo-950/20 hover:bg-indigo-50/70 dark:hover:bg-indigo-950/40 transition-all group"
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={e => e.target.files && handleFiles(e.target.files)}
              multiple
              accept="application/pdf,image/png,image/jpeg,image/webp"
              className="hidden"
            />
            <div className="flex flex-col items-center gap-2.5">
              <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-lg shadow-indigo-600/30 group-hover:scale-110 transition-transform">
                <Upload className="w-6 h-6" />
              </div>
              <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
                Arraste suas guias fiscais em PDF ou Imagem aqui
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Suporta múltiplos arquivos simultâneos. Extração automática de código de barras, vencimento e valores.
              </p>
            </div>
          </div>

          {/* Lista de Guias Processadas */}
          {items.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Guias Identificadas ({items.length})
                </h3>
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                  Total Previsto:{' '}
                  <strong className="text-emerald-600 dark:text-emerald-400 font-mono text-sm">
                    {totalConsolidated.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </strong>
                </span>
              </div>

              <div className="space-y-3">
                {items.map(item => {
                  const badge = TAX_BADGES[item.taxType] || TAX_BADGES.OUTROS;

                  return (
                    <div
                      key={item.id}
                      className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/80 shadow-sm space-y-3"
                    >
                      {/* Topo do Card do Item */}
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-700/60 pb-3">
                        <div className="flex items-center gap-2.5">
                          {item.status === 'parsing' ? (
                            <Loader2 className="w-5 h-5 text-indigo-500 animate-spin" />
                          ) : item.status === 'ready' ? (
                            <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                          ) : (
                            <AlertCircle className="w-5 h-5 text-rose-500" />
                          )}
                          <span className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate max-w-xs">
                            {item.file.name}
                          </span>
                          <span className={`px-2.5 py-0.5 rounded-lg text-[11px] font-bold border ${badge.bg} ${badge.text} ${badge.border}`}>
                            {badge.label}
                          </span>
                          {item.taxCode && (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-mono bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-semibold">
                              Cód: {item.taxCode}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          {item.barcode && (
                            <button
                              type="button"
                              onClick={() => handleCopyBarcode(item.barcode!, item.id)}
                              className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 transition-colors"
                              title="Copiar código de barras para pagamento"
                            >
                              {copiedId === item.id ? (
                                <>
                                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                                  <span className="text-emerald-600 dark:text-emerald-400">Copiado!</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3.5 h-3.5" />
                                  <span>Copiar Barra/Linha</span>
                                </>
                              )}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(item.id)}
                            className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                            title="Remover guia"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Campos Editáveis da Guia */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 pt-1">
                        
                        {/* Tipo de Imposto */}
                        <div className="col-span-1 sm:col-span-2">
                          <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                            Classificação do Tributo
                          </label>
                          <select
                            value={item.taxType}
                            onChange={e => handleUpdateItem(item.id, { taxType: e.target.value as TaxType })}
                            className="w-full text-xs font-medium px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white"
                          >
                            <option value="PIS_COFINS">PIS / COFINS (Sicalc)</option>
                            <option value="ICMS">ICMS Transporte (DARE/GNRE)</option>
                            <option value="CSLL">CSLL Estimativa Mensal</option>
                            <option value="IRPJ">IRPJ Estimativa Mensal</option>
                            <option value="FGTS">Guia de FGTS (Digital/GFD)</option>
                            <option value="INSS">INSS / DCTFWeb Previdenciário</option>
                            <option value="OUTROS">Outro Imposto / Tributo</option>
                          </select>
                        </div>

                        {/* Descrição */}
                        <div className="col-span-1 sm:col-span-2">
                          <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                            Descrição do Lançamento
                          </label>
                          <input
                            type="text"
                            value={item.description}
                            onChange={e => handleUpdateItem(item.id, { description: e.target.value })}
                            className="w-full text-xs font-medium px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white"
                            placeholder="Descrição"
                          />
                        </div>

                        {/* Período de Apuração (PA) */}
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                            Período Apuração (PA)
                          </label>
                          <input
                            type="text"
                            value={item.period || ''}
                            onChange={e => handleUpdateItem(item.id, { period: e.target.value })}
                            className="w-full text-xs font-medium px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white"
                            placeholder="MM/AAAA"
                          />
                        </div>

                        {/* Data de Vencimento */}
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                            Vencimento
                          </label>
                          <input
                            type="date"
                            value={item.dueDate || ''}
                            onChange={e => handleUpdateItem(item.id, { dueDate: e.target.value })}
                            className="w-full text-xs font-medium px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white"
                          />
                        </div>

                        {/* Número da Guia / DARF / DARE */}
                        <div className="col-span-1 sm:col-span-2">
                          <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                            Nº da Guia / Documento
                          </label>
                          <input
                            type="text"
                            value={item.documentNumber || ''}
                            onChange={e => handleUpdateItem(item.id, { documentNumber: e.target.value })}
                            className="w-full text-xs font-mono px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white"
                            placeholder="ex: 07.16.26141..."
                          />
                        </div>

                        {/* Valor Principal */}
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                            Principal (R$)
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            value={item.principalAmount || ''}
                            onChange={e => {
                              const val = parseFloat(e.target.value) || 0;
                              handleUpdateItem(item.id, { 
                                principalAmount: val,
                                totalAmount: Number((val + (item.fineAmount || 0) + (item.interestAmount || 0)).toFixed(2))
                              });
                            }}
                            className="w-full text-xs font-mono px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white"
                          />
                        </div>

                        {/* Multa / Juros */}
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                            Multa/Juros (R$)
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            value={(item.fineAmount || 0) + (item.interestAmount || 0) || ''}
                            onChange={e => {
                              const val = parseFloat(e.target.value) || 0;
                              handleUpdateItem(item.id, { 
                                fineAmount: val,
                                totalAmount: Number(((item.principalAmount || 0) + val).toFixed(2))
                              });
                            }}
                            className="w-full text-xs font-mono px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white"
                          />
                        </div>

                        {/* Valor Total a Pagar */}
                        <div className="col-span-1 sm:col-span-2">
                          <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-200 mb-1">
                            Valor Total a Pagar (R$) *
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            value={item.totalAmount || ''}
                            onChange={e => handleUpdateItem(item.id, { totalAmount: parseFloat(e.target.value) || 0 })}
                            className="w-full text-sm font-bold font-mono px-2.5 py-1 rounded-xl border-2 border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-300"
                          />
                        </div>

                      </div>

                      {/* Linha Digitável */}
                      {item.barcode && (
                        <div className="text-[11px] bg-slate-50 dark:bg-slate-900/60 p-2 rounded-xl flex items-center gap-2 text-slate-600 dark:text-slate-400 font-mono overflow-x-auto">
                          <Barcode className="w-4 h-4 shrink-0 text-slate-400" />
                          <span className="truncate">{item.barcode}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

        </div>

        {/* Rodapé com Ações */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
          >
            Cancelar
          </button>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleConfirmImport}
              disabled={isSubmitting || items.filter(i => i.status === 'ready' && i.totalAmount > 0).length === 0}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-600/30 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Salvando Guias...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>
                    Importar {items.filter(i => i.status === 'ready').length} Guia(s) para Contas a Pagar
                  </span>
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
