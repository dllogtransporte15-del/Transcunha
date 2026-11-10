import React, { useState, useEffect, useRef } from 'react';
import { Shipment, ShipmentStatus, User, UserProfile, Cargo, RiskQueryType, RISK_QUERY_COST_MAP, Product, Client, ClientBranchCnpj, PaymentMethod, RiskQueryOption, DEFAULT_RISK_QUERY_OPTIONS, RealProfitData, CancelledCteRecord, DriverExtraPayment } from '../types';
import { upsertClient, upsertCargo, uploadShipmentAttachment } from '../lib/db';
import { isDemoUser, isDeveloperUser } from '../auth';
import { PaperclipIcon, ExternalLinkIcon, MapPinIcon, LoaderIcon } from './icons';
import { fetchRouteGeometry, getRouteSuggestions, RouteSuggestion } from '../services/routing';
import { formatWeightPtBr, isCteApplicableForStatus } from '../utils';
import { extractFiscalDocNumbers, extractFiscalDocNumbersFromUrls, extractDetailedDocData, DetailedDocumentData, parseWeightKg, isStrictNotaFiscalCategory, calculateNetCartaFreteFreight, detectDocumentTypeFromFileName, detectAttachmentMismatch, DocMismatchInfo, isCteDocType, isCartaFreteDocType } from '../utils/fiscalDocParser';
import { useToast } from '../hooks/useToast';
import { openDocumentInNewTab, normalizeDocumentUrl, isActualDocumentUrl, isDocumentMetadataKey } from '../utils/documentViewer';
import { X, Package, Box, DollarSign, Scale, User as UserIcon, MapPin, Building, Truck, FileText, CreditCard, Eye, RefreshCw, Sparkles, Layers, ListOrdered, FileCheck, CheckCircle2, ShieldCheck, ShieldAlert, Check, Paperclip, AlertTriangle, Trash2, Edit3, ArrowRightLeft, Lock, RotateCcw, Plus, Coins, Clock, Calendar, UploadCloud, Clipboard } from 'lucide-react';
import { DocumentExtractedDataModal } from './DocumentExtractedDataModal';
import { CteCostAutomationPanel } from './CteCostAutomationPanel';
import { ShipmentStagesTimeline } from './ShipmentStagesTimeline';
import { CancelAndSubstituteCteModal } from './CancelAndSubstituteCteModal';
import { calculateAdvanceAndBalance, calculateTacTaxDeductions, isShipment100PercentAdvance, isShipment0PercentAdvance } from '../utils/freightCalculation';
import { calculateFreightBalance } from '../utils/freightBalanceCalculator';
import { RdoNacionalModal } from './RdoNacionalModal';
import { SigaGrModal } from './SigaGrModal';


interface AttachmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: {
    filesToAttach: { [key: string]: File[] },
    bankDetails?: string,
    loadedTonnage?: number,
    driverFreightValue?: number,
    icmsValue?: number,
    advancePercentage?: number,
    advanceValue?: number,
    tollValue?: number,
    balanceToReceiveValue?: number,
    discountValue?: number,
    isBreakageWaived?: boolean,
    netBalanceValue?: number,
    unloadedTonnage?: number,
    route?: string,
    grStatus?: 'aprovado' | 'reprovado' | 'reprovado_restrito',
    riskReleaseCode?: string,
    riskQueryType?: string,
    riskQueryCost?: number,
    realProfitData?: RealProfitData,
    codigoAtua?: string,
  }) => Promise<void>;
  shipment: Shipment;
  documentName: string;
  currentUser: User;
  cargo?: Cargo;
  canSave?: boolean;
  /** Quando false, libera fluxo simplificado (apenas documento obrigatório no AG. Seguradora). Default: true */
  requiresRiskManagement?: boolean;
  products?: Product[];
  clients?: Client[];
  users?: User[];
  riskQueryOptions?: RiskQueryOption[];
  onUpdateShipmentData?: (shipmentId: string, data: Partial<Shipment>, options?: { silent?: boolean }) => Promise<void> | void;
  onDeleteAttachment?: (shipmentId: string, url: string) => Promise<void>;
}

declare const L: any;

const notaFiscalDocTypes = ['Nota Fiscal'];
const travelDocTypes = ['CT-e', 'MDF-e', 'Carta Frete', 'Outros'];

export const TRAVEL_DOC_CONFIG: Record<string, { labelDisplay: string; subtext: string; isRequired: boolean }> = {
  'CT-e': {
    labelDisplay: 'CT-e * (Obrigatório)',
    subtext: 'Anexe o DACTE (PDF ou Imagem). O sistema valida automaticamente o cabeçalho e chave do CT-e.',
    isRequired: true,
  },
  'MDF-e': {
    labelDisplay: 'MDF-e * (Obrigatório)',
    subtext: 'Anexe o DAMDFE (PDF ou Imagem). O sistema valida a autenticidade do Manifesto Eletrônico.',
    isRequired: true,
  },
  'Carta Frete': {
    labelDisplay: 'Carta Frete * (Obrigatório)',
    subtext: 'Anexe a Carta Frete / Contrato de Transporte contendo valores, pedágio e adiantamento.',
    isRequired: true,
  },
  'Outros': {
    labelDisplay: 'Outros (Opcional)',
    subtext: 'Anexos complementares de apoio à viagem.',
    isRequired: false,
  },
};
const allowedDocsForClient = [
  'Ticket de Carregamento',
  'Nota Fiscal',
  'CT-e',
  'Comprovante de Descarga'
];

export const isDischargeTicketCategory = (categoryOrLabel?: string, currentStatus?: ShipmentStatus): boolean => {
  if (currentStatus === ShipmentStatus.ValidacaoTicket || currentStatus === ShipmentStatus.AguardandoDescarga) {
    return true;
  }
  if (!categoryOrLabel) return false;
  const lower = categoryOrLabel.toLowerCase().trim();
  if (lower.includes('descarga')) return true;
  if (lower.includes('validação de ticket') || lower.includes('validacao de ticket') || lower.includes('valid. de ticket')) return true;
  if (lower.includes('ticket de balança') || lower.includes('ticket de balanca')) return true;
  return false;
};

const FileInput: React.FC<{
  label: string;
  displayLabel?: string;
  subtext?: string;
  isRequired?: boolean;
  onFileChange: (files: FileList | File[] | null) => void;
  files: File[];
  allowPaste?: boolean;
  onInspectFile?: (file: File, docType: string) => void;
  onMoveFile?: (file: File, fromDocType: string, toDocType: string) => void;
  onRemoveFile?: (file: File, docType: string) => void;
  detectedTypesMap?: Record<string, string>;
  availableTargetCategories?: string[];
  checkDuplicateFile?: (file: File, targetCategory: string) => { isDuplicate: boolean; foundLocation: string; originalName?: string } | null;
  bypassDuplicateCheck?: boolean;
}> = ({
  label,
  displayLabel,
  subtext,
  isRequired,
  onFileChange,
  files,
  allowPaste = true,
  onInspectFile,
  onMoveFile,
  onRemoveFile,
  detectedTypesMap,
  availableTargetCategories,
  checkDuplicateFile,
  bypassDuplicateCheck,
}) => {
  const id = `file-upload-${label.replace(/\s/g, '-')}`;
  const [isDragging, setIsDragging] = useState(false);
  const [pasteSuccess, setPasteSuccess] = useState(false);
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFilesSelected = (selectedFiles: FileList | File[] | null) => {
    if (!selectedFiles) {
      onFileChange(null);
      return;
    }
    const fileArray = Array.from(selectedFiles);
    const validFiles: File[] = [];

    for (const f of fileArray) {
      const isDischargeTicket = bypassDuplicateCheck || isDischargeTicketCategory(label);

      // 1. Checagem contra duplicidade no próprio campo atual (ignorado para ticket de descarga)
      if (!isDischargeTicket) {
        const isAlreadyInField = files.some(
          existing => existing !== f && existing.name.trim().toLowerCase() === f.name.trim().toLowerCase()
        );
        if (isAlreadyInField) {
          showToast(
            `⛔ Arquivo Duplicado Bloqueado: O arquivo "${f.name}" já foi selecionado no campo "${label}".`,
            'error',
            8000
          );
          continue;
        }
      }

      // 2. Checagem contra duplicidade global (demais campos e documentos já salvos no embarque, ignorado para ticket de descarga)
      if (!isDischargeTicket && checkDuplicateFile) {
        const dupCheck = checkDuplicateFile(f, label);
        if (dupCheck?.isDuplicate) {
          showToast(
            `⛔ Arquivo Duplicado Bloqueado: O documento "${f.name}" já está ${dupCheck.foundLocation}. Não é permitido anexar o mesmo documento duplicado.`,
            'error',
            8000
          );
          continue;
        }
      }

      // 3. Validação de mismatch de tipo de documento
      const mismatch = detectAttachmentMismatch(f, label, detectedTypesMap?.[f.name]);
      if (mismatch) {
        let errorMsg = mismatch.message;
        if (label === 'CT-e') {
          errorMsg = `Documento inválido no campo CT-e: O arquivo anexado foi identificado como ${mismatch.detectedType}. Por favor, anexe o DACTE correspondente.`;
        } else if (label === 'MDF-e') {
          errorMsg = `Documento inválido no campo MDF-e: O arquivo anexado não é um Manifesto (MDF-e/DAMDFE) válido.`;
        } else if (label === 'Carta Frete') {
          errorMsg = `Documento inválido no campo Carta Frete: O arquivo anexado não corresponde a uma Carta Frete / Contrato de Transporte.`;
        } else {
          errorMsg = `⚠️ Atenção: O arquivo "${f.name}" foi detectado como ${mismatch.detectedType}, mas está sendo anexado no campo "${label}". Você pode movê-lo para "${mismatch.suggestedCategory}" com 1 clique.`;
        }
        showToast(errorMsg, 'error', 9000);
      }

      validFiles.push(f);
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }

    if (validFiles.length === 0 && fileArray.length > 0) {
      // Trava: se todos os arquivos selecionados eram duplicados, não altera os arquivos válidos
      return;
    }

    onFileChange(validFiles);
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const pastedFiles: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          const ext = file.type.split('/')[1] || 'png';
          const namedFile = new File([file], `imagem_colada_${Date.now()}.${ext}`, { type: file.type });
          pastedFiles.push(namedFile);
        }
      }
    }
    if (pastedFiles.length > 0) {
      e.preventDefault();
      handleFilesSelected(pastedFiles);
      setPasteSuccess(true);
      setTimeout(() => setPasteSuccess(false), 3000);
    }
  };

  const handleClipboardButtonClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      if (navigator.clipboard && navigator.clipboard.read) {
        const clipboardItems = await navigator.clipboard.read();
        const pastedFiles: File[] = [];
        for (const item of clipboardItems) {
          const imageType = item.types.find(t => t.startsWith('image/'));
          if (imageType) {
            const blob = await item.getType(imageType);
            const ext = imageType.split('/')[1] || 'png';
            const namedFile = new File([blob], `imagem_colada_${Date.now()}.${ext}`, { type: imageType });
            pastedFiles.push(namedFile);
          }
        }
        if (pastedFiles.length > 0) {
          handleFilesSelected(pastedFiles);
          setPasteSuccess(true);
          setTimeout(() => setPasteSuccess(false), 3000);
          return;
        }
      }
      alert('Dica: Para colar, você também pode pressionar Ctrl+V no teclado!');
    } catch {
      alert('Pressione Ctrl+V no teclado para colar a imagem copiada.');
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFilesSelected(e.dataTransfer.files);
    }
  };

  return (
    <div
      className="mb-4"
      onPaste={allowPaste ? handlePaste : undefined}
    >
      <div className="flex items-start justify-between mb-1.5 gap-2">
        <div>
          <label className="block text-sm font-bold text-gray-800 dark:text-gray-200">
            {displayLabel || label}
          </label>
          {subtext && (
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 leading-snug">
              {subtext}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={handleClipboardButtonClick}
          className="inline-flex items-center gap-1 text-[11px] font-extrabold text-indigo-700 dark:text-indigo-300 hover:text-indigo-900 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/80 px-2.5 py-1 rounded-lg border border-indigo-200 dark:border-indigo-800 transition-all shadow-xs cursor-pointer"
          title="Colar imagem copiada da área de transferência (ou aperte Ctrl+V)"
        >
          <span>📋 Colar Imagem (Ctrl+V)</span>
        </button>
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`relative border-2 border-dashed rounded-xl p-3 transition-all ${isDragging
            ? 'border-indigo-500 bg-indigo-50/60 dark:bg-indigo-950/40 scale-[1.01]'
            : files.some(f => detectAttachmentMismatch(f, label, detectedTypesMap?.[f.name])?.isMismatch)
              ? 'border-rose-400 dark:border-rose-600 bg-rose-50/40 dark:bg-rose-950/20'
              : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700/60 hover:border-indigo-400'
          }`}
      >
        <label
          htmlFor={id}
          className="flex items-center justify-between w-full text-sm text-gray-600 dark:text-gray-300 cursor-pointer"
        >
          <div className="flex items-center gap-2 truncate">
            <PaperclipIcon className="w-4 h-4 text-indigo-500 shrink-0" />
            <span className="truncate font-medium">
              {files.length > 0 ? `${files.length} arquivo(s) selecionado(s)` : `Clique para selecionar, arraste ou aperte Ctrl+V`}
            </span>
          </div>
          <span className="text-[10px] font-black uppercase tracking-wider text-indigo-600 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-900/50 px-2.5 py-1 rounded-md shrink-0 ml-2 border border-indigo-100 dark:border-indigo-800">
            Procurar
          </span>
        </label>
        <input
          id={id}
          ref={fileInputRef}
          type="file"
          className="hidden"
          multiple
          onChange={(e) => {
            handleFilesSelected(e.target.files);
            if (e.target) e.target.value = '';
          }}
          accept=".pdf,.png,.jpg,.jpeg,.gif,.xml"
        />
      </div>

      {pasteSuccess && (
        <p className="mt-1.5 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1 animate-in fade-in">
          ✓ Imagem colada da área de transferência com sucesso!
        </p>
      )}

      {files.length > 0 && (
        <ul className="mt-2 text-xs text-gray-500 dark:text-gray-400 space-y-2">
          {files.map((file, idx) => {
            const mismatch = detectAttachmentMismatch(file, label, detectedTypesMap?.[file.name]);
            const isMismatch = !!mismatch;

            return (
              <li
                key={`${file.name}-${idx}`}
                className={`flex flex-col p-2.5 rounded-xl transition-all border ${
                  isMismatch
                    ? 'bg-rose-50/90 dark:bg-rose-950/40 border-rose-300 dark:border-rose-700/80 shadow-xs'
                    : 'bg-gray-50 dark:bg-gray-800/60 border-gray-200 dark:border-gray-700'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {isMismatch ? (
                      <span className="flex h-2.5 w-2.5 relative shrink-0">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500"></span>
                      </span>
                    ) : (
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                    )}
                    <span
                      className={`truncate max-w-[280px] sm:max-w-[340px] font-medium ${
                        isMismatch ? 'text-rose-900 dark:text-rose-200 font-bold' : 'text-gray-700 dark:text-gray-200'
                      }`}
                      title={file.name}
                    >
                      {file.name}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {onInspectFile && (
                      <button
                        type="button"
                        onClick={() => onInspectFile(file, label)}
                        className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 text-indigo-700 dark:text-indigo-300 rounded border border-indigo-200 dark:border-indigo-800 text-[10px] font-bold cursor-pointer shrink-0"
                        title="Ver todos os dados e campos lidos deste arquivo"
                      >
                        <Eye className="w-3 h-3" />
                        <span>Ver Dados</span>
                      </button>
                    )}

                    {onRemoveFile && (
                      <button
                        type="button"
                        onClick={() => onRemoveFile(file, label)}
                        className="p-1 hover:bg-rose-100 dark:hover:bg-rose-900/50 text-gray-400 hover:text-rose-600 dark:text-gray-400 rounded cursor-pointer transition-colors"
                        title="Remover este arquivo deste campo"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Banner de Erro com Ação de Correção em 1 Clique */}
                {isMismatch && (
                  <div className="mt-2 pt-2 border-t border-rose-200 dark:border-rose-800/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2 animate-in fade-in">
                    <div className="flex items-start gap-1.5 text-[11px] text-rose-800 dark:text-rose-300">
                      <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-extrabold text-rose-700 dark:text-rose-200">
                          Documento Incorreto:
                        </span>
                        <span className="ml-1 font-medium">
                          {label === 'CT-e'
                            ? `O arquivo anexado foi identificado como ${mismatch.detectedType}. Por favor, anexe o DACTE correspondente.`
                            : label === 'MDF-e'
                              ? 'O arquivo anexado não é um Manifesto (MDF-e/DAMDFE) válido.'
                              : label === 'Carta Frete'
                                ? 'O arquivo anexado não corresponde a uma Carta Frete / Contrato de Transporte.'
                                : `Este arquivo é um ${mismatch.detectedType}, mas foi anexado no campo ${label}.`}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                      {mismatch.suggestedCategory && onMoveFile && (
                        <button
                          type="button"
                          onClick={() => onMoveFile(file, label, mismatch.suggestedCategory)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-[11px] rounded-lg shadow-sm transition-all cursor-pointer"
                          title={`Mover este arquivo diretamente para o campo "${mismatch.suggestedCategory}"`}
                        >
                          <ArrowRightLeft className="w-3.5 h-3.5" />
                          <span>Mover para {mismatch.suggestedCategory}</span>
                        </button>
                      )}
                      {onRemoveFile && (
                        <button
                          type="button"
                          onClick={() => onRemoveFile(file, label)}
                          className="px-2 py-1 bg-rose-100 dark:bg-rose-900/40 hover:bg-rose-200 text-rose-800 dark:text-rose-200 font-semibold text-[11px] rounded-lg border border-rose-300 dark:border-rose-700 transition-colors cursor-pointer"
                          title="Remover anexo incorreto"
                        >
                          Remover
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};


const AttachmentModal: React.FC<AttachmentModalProps> = ({
  isOpen,
  onClose,
  onSave,
  shipment,
  documentName,
  currentUser,
  cargo,
  canSave = true,
  requiresRiskManagement = true,
  products = [],
  clients = [],
  users = [],
  riskQueryOptions: propRiskQueryOptions,
  onUpdateShipmentData,
  onDeleteAttachment,
}) => {
  const isDemo = isDemoUser(currentUser);
  const isEmbarcador = currentUser?.profile === UserProfile.Embarcador || (currentUser?.profile as string) === 'Embarcador';
  const canValidateTicket = !isEmbarcador && currentUser?.profile !== UserProfile.Cliente && currentUser?.profile !== UserProfile.Motorista;
  const riskQueryOptions = React.useMemo<RiskQueryOption[]>(() => {
    if (propRiskQueryOptions && propRiskQueryOptions.length > 0) {
      return propRiskQueryOptions;
    }
    try {
      const saved = localStorage.getItem('transcunha_risk_query_options');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch { }
    return DEFAULT_RISK_QUERY_OPTIONS;
  }, [propRiskQueryOptions]);

  const [singleFiles, setSingleFiles] = useState<File[]>([]);
  const [multiFiles, setMultiFiles] = useState<{ [key: string]: File[] }>({});
  const [detectedDocTypes, setDetectedDocTypes] = useState<Record<string, string>>({});
  const [bankDetails, setBankDetails] = useState('');
  const [loadedTonnage, setLoadedTonnage] = useState<number | ''>('');
  const [advancePercentage, setAdvancePercentage] = useState<number | ''>('');
  const [advanceValue, setAdvanceValue] = useState<number | ''>('');
  const [tollValue, setTollValue] = useState<number | ''>('');
  const [balanceToReceiveValue, setBalanceToReceiveValue] = useState<number | ''>('');
  const [discountValue, setDiscountValue] = useState<number | ''>('');
  const [isBreakageWaived, setIsBreakageWaived] = useState<boolean>(false);
  const [netBalanceValue, setNetBalanceValue] = useState<number | ''>('');
  const [unloadedTonnage, setUnloadedTonnage] = useState<number | ''>('');
  const [isTicketValidated, setIsTicketValidated] = useState<boolean>(false);
  const [route, setRoute] = useState('');
  const [riskReleaseCode, setRiskReleaseCode] = useState('');
  const [riskQueryType, setRiskQueryType] = useState<string>('');
  const [isRdoModalOpen, setIsRdoModalOpen] = useState(false);
  const [isSigaModalOpen, setIsSigaModalOpen] = useState(false);

  const [grStatus, setGrStatus] = useState<'aprovado' | 'reprovado' | 'reprovado_restrito'>('aprovado');
  const [codigoAtua, setCodigoAtua] = useState<string>('');
  const [suggestions, setSuggestions] = useState<RouteSuggestion[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'timeline' | 'documents'>(currentUser?.profile === UserProfile.Cliente ? 'documents' : 'timeline');
  const [selectedDocForDetails, setSelectedDocForDetails] = useState<{
    fileOrUrl: File | string;
    docType: string;
    docName: string;
  } | null>(null);
  const [cteToCancel, setCteToCancel] = useState<{
    cteNumber: string;
    fileUrl?: string;
    fileName?: string;
  } | null>(null);

  // Estados para armazenar valores extraídos de documentos fiscais
  const [cteExtractedWeightKg, setCteExtractedWeightKg] = useState<number | undefined>(undefined);
  const [isEditingCteWeight, setIsEditingCteWeight] = useState(false);
  const [manualCteWeightInput, setManualCteWeightInput] = useState('');
  const [cartaFreteExtractedFreight, setCartaFreteExtractedFreight] = useState<number | undefined>(undefined);
  const [cartaFreteExtractedAdvance, setCartaFreteExtractedAdvance] = useState<number | undefined>(undefined);
  const [cteExtractedIcms, setCteExtractedIcms] = useState<number | undefined>(undefined);
  const [cteExtractedServiceTotal, setCteExtractedServiceTotal] = useState<number | undefined>(undefined);
  const [cteExtractedTomadorNome, setCteExtractedTomadorNome] = useState<string | undefined>(undefined);
  const [cteExtractedTomadorCnpj, setCteExtractedTomadorCnpj] = useState<string | undefined>(undefined);
  const [isResolvingTomador, setIsResolvingTomador] = useState(false);

  // Decisões de resolução de divergências fiscais na etapa Aguardando Fiscal
  const [weightDecision, setWeightDecision] = useState<'unresolved' | 'use_cte' | 'keep_system'>('unresolved');
  const [freightDecision, setFreightDecision] = useState<'unresolved' | 'use_carta_frete' | 'keep_system'>('unresolved');
  const [advanceDecision, setAdvanceDecision] = useState<'unresolved' | 'resolved'>('unresolved');
  const [companyFreightDecision, setCompanyFreightDecision] = useState<'unresolved' | 'use_cte' | 'keep_system'>('unresolved');
  const [icmsDecision, setIcmsDecision] = useState<'unresolved' | 'use_cte' | 'keep_system'>('unresolved');
  const [docExtractedToll, setDocExtractedToll] = useState<number | undefined>(undefined);
  const [tollDecision, setTollDecision] = useState<'unresolved' | 'use_doc' | 'keep_system'>('unresolved');
  const [tomadorDecision, setTomadorDecision] = useState<'unresolved' | 'adjust_to_cte' | 'link_branch' | 'keep_system'>('unresolved');

  // Acréscimos Avulsos ao Motorista (Diárias, Estadia, Bônus, Ajuda de Custo)
  const [driverExtraPayments, setDriverExtraPayments] = useState<DriverExtraPayment[]>(() => {
    return shipment.driverExtraPayments || (shipment.documents as any)?.driver_extra_payments || [];
  });
  const [isAddingExtraPayment, setIsAddingExtraPayment] = useState(false);
  const [extraAmount, setExtraAmount] = useState('');
  const [extraReason, setExtraReason] = useState<string>('Diária / Estadia');
  const [extraDescription, setExtraDescription] = useState('');
  const [extraPaymentMethod, setExtraPaymentMethod] = useState<string>('PIX');
  const [extraPaidAt, setExtraPaidAt] = useState<string>(() => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    return now.toISOString().slice(0, 16);
  });
  const [extraReceiptFile, setExtraReceiptFile] = useState<File | null>(null);
  const [extraReceiptPreview, setExtraReceiptPreview] = useState<string | null>(null);
  const [isSavingExtra, setIsSavingExtra] = useState(false);

  useEffect(() => {
    if (shipment) {
      setDriverExtraPayments(shipment.driverExtraPayments || (shipment.documents as any)?.driver_extra_payments || []);
    }
  }, [shipment.id, shipment.driverExtraPayments, shipment.documents]);

  const isEligibleForDriverExtra = [
    ShipmentStatus.AguardandoDescarga,
    ShipmentStatus.ValidacaoTicket,
    ShipmentStatus.AguardandoPagamentoSaldo,
    ShipmentStatus.Finalizado,
    'Ag. Descarga',
    'Aguardando Descarga',
    'Valid. de Ticket',
    'Validação de Ticket',
    'Ag. Saldo',
    'Aguardando Pagamento de Saldo',
    'Finalizado'
  ].includes(shipment.status as any);

  const totalDriverExtraPayments = React.useMemo(() => {
    return Number(driverExtraPayments.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0).toFixed(2));
  }, [driverExtraPayments]);

  const handlePasteExtraReceipt = (e: React.ClipboardEvent | ClipboardEvent) => {
    const items = (e as any).clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.indexOf('image') !== -1) {
        const file = item.getAsFile();
        if (file) {
          setExtraReceiptFile(file);
          const reader = new FileReader();
          reader.onload = (ev) => {
            setExtraReceiptPreview(ev.target?.result as string);
          };
          reader.readAsDataURL(file);
          showToast('Comprovante colado da área de transferência!', 'success');
        }
      }
    }
  };

  const handleExtraReceiptFileSelect = (file: File | null) => {
    if (!file) {
      setExtraReceiptFile(null);
      setExtraReceiptPreview(null);
      return;
    }
    setExtraReceiptFile(file);
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setExtraReceiptPreview(ev.target?.result as string);
      };
      reader.readAsDataURL(file);
    } else {
      setExtraReceiptPreview(file.name);
    }
  };

  const handleSaveExtraPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    const rawVal = extraAmount.replace(/\./g, '').replace(',', '.');
    const parsedAmt = parseFloat(rawVal);
    if (isNaN(parsedAmt) || parsedAmt <= 0) {
      showToast('Informe um valor válido para o acréscimo.', 'warning');
      return;
    }

    setIsSavingExtra(true);
    try {
      let receiptUrl: string | undefined = undefined;
      let receiptFileName: string | undefined = undefined;

      if (extraReceiptFile) {
        receiptFileName = extraReceiptFile.name;
        try {
          receiptUrl = await uploadShipmentAttachment(shipment.id, 'Comprovante_Acrescimo_Motorista', extraReceiptFile);
        } catch (upErr) {
          console.warn('Fallback para conversão dataUrl local do comprovante:', upErr);
          receiptUrl = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = (ev) => resolve(ev.target?.result as string || '');
            reader.readAsDataURL(extraReceiptFile);
          });
        }
      }

      const nowIso = new Date().toISOString();
      const newPayment: DriverExtraPayment = {
        id: `dep_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        amount: Number(parsedAmt.toFixed(2)),
        reason: extraReason,
        description: extraDescription.trim() || undefined,
        receiptUrl,
        receiptFileName,
        paymentMethod: extraPaymentMethod,
        paidAt: extraPaidAt || nowIso,
        createdAt: nowIso,
        createdByName: currentUser.name || 'Usuário',
        createdByUserId: currentUser.id,
        createdByRole: currentUser.profile,
      };

      const updatedList = [...driverExtraPayments, newPayment];
      const newTotal = Number(updatedList.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0).toFixed(2));

      if (onUpdateShipmentData) {
        await onUpdateShipmentData(shipment.id, {
          driverExtraPayments: updatedList,
          driverExtraPaymentsTotal: newTotal,
          realProfitData: {
            ...(shipment.realProfitData || {}),
            driverSurcharge: newTotal,
          } as any,
        });
      }

      setDriverExtraPayments(updatedList);
      setIsAddingExtraPayment(false);
      setExtraAmount('');
      setExtraDescription('');
      setExtraReceiptFile(null);
      setExtraReceiptPreview(null);
      showToast(`Acréscimo de R$ ${parsedAmt.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} registrado e abatido do lucro com sucesso!`, 'success');
    } catch (err: any) {
      console.error('Erro ao salvar acréscimo:', err);
      showToast('Ocorreu um erro ao salvar o acréscimo avulso.', 'error');
    } finally {
      setIsSavingExtra(false);
    }
  };

  const handleDeleteExtraPayment = async (paymentId: string) => {
    const payment = driverExtraPayments.find(p => p.id === paymentId);
    if (!payment) return;

    if (!window.confirm(`Deseja remover o lançamento de acréscimo de R$ ${payment.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (${payment.reason})?`)) {
      return;
    }

    const updatedList = driverExtraPayments.filter(p => p.id !== paymentId);
    const newTotal = Number(updatedList.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0).toFixed(2));

    if (onUpdateShipmentData) {
      await onUpdateShipmentData(shipment.id, {
        driverExtraPayments: updatedList,
        driverExtraPaymentsTotal: newTotal,
        realProfitData: {
          ...(shipment.realProfitData || {}),
          driverSurcharge: newTotal,
        } as any,
      });
    }

    setDriverExtraPayments(updatedList);
    showToast('Acréscimo removido com sucesso.', 'info');
  };

  const ticketFiles: string[] = React.useMemo(() => {
    if (!shipment.documents) return [];
    const files: string[] = [];
    const keysToCheck = [
      'Comprovante de Descarga',
      'comprovante de descarga',
      'Ticket de Descarga',
      'Ticket de Balança',
      'Ticket de Balanca',
      'Validação de Ticket e Peso',
      'ticket',
      'Ticket',
      'Descarga'
    ];
    for (const key of Object.keys(shipment.documents)) {
      if (keysToCheck.some(k => k.toLowerCase() === key.toLowerCase()) || key.toLowerCase().includes('descarga') || key.toLowerCase().includes('ticket')) {
        const val = shipment.documents[key];
        if (Array.isArray(val)) {
          val.forEach(item => {
            const normalized = normalizeDocumentUrl(item) || (typeof item === 'string' ? item : '');
            if (normalized) files.push(normalized);
          });
        } else if (typeof val === 'string' && (val.startsWith('http') || val.startsWith('data:') || val.startsWith('blob:'))) {
          files.push(val);
        } else if (val && typeof val === 'object') {
          const normalized = normalizeDocumentUrl(val);
          if (normalized) files.push(normalized);
        }
      }
    }
    return Array.from(new Set(files));
  }, [shipment.documents]);

  const { showToast } = useToast();

  const handleApplyExtractedData = (extracted: DetailedDocumentData) => {
    // 1. Atualiza estados locais do modal/etapa
    if (extracted.financeiro?.valorPedagio !== undefined) {
      setTollValue(extracted.financeiro.valorPedagio);
      setDocExtractedToll(extracted.financeiro.valorPedagio);
    }
    if (extracted.financeiro?.valorAdiantamento !== undefined) {
      setAdvanceValue(extracted.financeiro.valorAdiantamento);
    }
    if (extracted.financeiro?.porcentagemAdiantamento !== undefined) {
      setAdvancePercentage(extracted.financeiro.porcentagemAdiantamento);
    }
    if (extracted.financeiro?.chavePix) {
      setBankDetails(prev => prev ? `${prev} | PIX: ${extracted.financeiro?.chavePix}` : (extracted.financeiro?.chavePix || ''));
    }
    const selDocType = selectedDocForDetails?.docType || '';
    const isSelCte = isCteDocType(selDocType);
    const isSelCartaFrete = isCartaFreteDocType(selDocType);

    const isCartaFreteDoc = (isSelCartaFrete || extracted.documentType === 'Carta Frete') && !isSelCte && extracted.documentType !== 'CT-e' && extracted.documentType !== 'MDF-e';
    const isCteDocData = (isSelCte || extracted.documentType === 'CT-e') && !isSelCartaFrete && extracted.documentType !== 'Carta Frete' && extracted.documentType !== 'MDF-e';

    if (isCartaFreteDoc) {
      const rawCfFreight = extracted.financeiro?.valorTotalFrete !== undefined ? extracted.financeiro.valorTotalFrete : extracted.financeiro?.valorLiquido;
      const toll = extracted.financeiro?.valorPedagio !== undefined ? extracted.financeiro.valorPedagio : (Number(tollValue) || Number(shipment.tollValue) || 0);
      const adv = extracted.financeiro?.valorAdiantamento !== undefined ? extracted.financeiro.valorAdiantamento : (Number(advanceValue) || Number(shipment.advanceValue) || 0);
      const advPct = extracted.financeiro?.porcentagemAdiantamento !== undefined ? extracted.financeiro.porcentagemAdiantamento : (Number(advancePercentage) || Number(shipment.advancePercentage) || 0);
      const sld = extracted.financeiro?.valorSaldo || extracted.calculoSaldoFrete?.saldoOriginal || extracted.calculoSaldoFrete?.subtotal || 0;

      const cfFreightWithoutToll = calculateNetCartaFreteFreight({
        rawFreight: rawCfFreight,
        toll,
        advance: adv,
        advancePercentage: advPct,
        saldo: sld,
        systemFreightNetOfToll: systemDriverFreight,
      });

      if (cfFreightWithoutToll !== undefined && cfFreightWithoutToll > 0) {
        setCartaFreteExtractedFreight(cfFreightWithoutToll);
      }
      if (adv !== undefined && adv > 0) {
        setCartaFreteExtractedAdvance(adv);
        setAdvanceValue(adv);
      }
    } else if (isCteDocData) {
      const cteServ = extracted.financeiro?.valorTotalServico !== undefined ? extracted.financeiro.valorTotalServico : extracted.financeiro?.valorTotalFrete;
      if (cteServ !== undefined && cteServ > 0) {
        setCteExtractedServiceTotal(cteServ);
      }
    }
    if (extracted.financeiro?.valorIcms !== undefined && extracted.financeiro.valorIcms > 0) {
      setCteExtractedIcms(extracted.financeiro.valorIcms);
    }
    if (extracted.carga?.pesoBrutoKg || extracted.carga?.pesoLiquidoKg) {
      const wKg = extracted.carga.pesoBrutoKg || extracted.carga.pesoLiquidoKg;
      if (wKg) {
        setCteExtractedWeightKg(wKg);
        if (shipment.status === ShipmentStatus.AguardandoCarregamento) {
          const ton = wKg >= 1000 ? Number((wKg / 1000).toFixed(3)) : wKg;
          setLoadedTonnage(ton);
        }
      }
    }

    // 2. Persistência direta no Embarque via onUpdateShipmentData (garante que não perca os dados)
    const patch: Partial<Shipment> = {};
    const updatedDocs: Record<string, any> = { ...(shipment.documents || {}) };
    const updatedRealProfit: Record<string, any> = { ...(shipment.realProfitData || {}) };
    let hasShipmentChanges = false;

    // Valor da NF-e / Mercadoria: apenas quando o documento for estritamente do campo "Nota Fiscal"
    const isDocStrictNotaFiscal = selectedDocForDetails?.docType ? isStrictNotaFiscalCategory(selectedDocForDetails.docType) : false;
    const detectedNfeValue = extracted.financeiro?.valorTotalNfe || extracted.carga?.valorMercadoria;
    if (detectedNfeValue !== undefined && detectedNfeValue > 0 && isDocStrictNotaFiscal) {
      patch.nfeValue = detectedNfeValue;
      updatedRealProfit.invoiceValue = detectedNfeValue;
      updatedRealProfit.isInvoiceValueManual = true; // Trava contra sobrescrita por outros anexos
      updatedDocs.nfe_value = detectedNfeValue;
      updatedDocs.valor_mercadoria = detectedNfeValue;
      hasShipmentChanges = true;
    }

    // Número da NF-e
    const detectedNfeNumber = isDocStrictNotaFiscal
      ? (extracted.docNumber || extracted.notasFiscais?.[0]?.numero)
      : (extracted.documentType === 'CT-e' || extracted.documentType === 'MDF-e' ? extracted.notasFiscais?.[0]?.numero : undefined);
    if (detectedNfeNumber) {
      patch.nfeNumber = String(detectedNfeNumber);
      updatedDocs.nfe_number = String(detectedNfeNumber);
      hasShipmentChanges = true;
    }

    // CT-e
    const isCteDoc = extracted.documentType === 'CT-e' || selectedDocForDetails?.docType?.toLowerCase().includes('ct-e') || selectedDocForDetails?.docType?.toLowerCase().includes('cte');
    if (isCteDoc) {
      if (extracted.docNumber) {
        patch.cteNumber = extracted.docNumber;
        updatedDocs.cte_number = extracted.docNumber;
        hasShipmentChanges = true;
      }
      if (extracted.emissionDate) {
        patch.cteEmissionDate = extracted.emissionDate;
        updatedDocs.cte_emission_date = extracted.emissionDate;
        hasShipmentChanges = true;
      }
      if (extracted.ciot) {
        patch.ciotNumber = extracted.ciot;
        patch.ciot = extracted.ciot;
        updatedDocs.ciot = extracted.ciot;
        updatedDocs.ciot_number = extracted.ciot;
        hasShipmentChanges = true;
      }
    }

    // MDF-e
    const isMdfeDoc = extracted.documentType === 'MDF-e' || selectedDocForDetails?.docType?.toLowerCase().includes('mdf-e') || selectedDocForDetails?.docType?.toLowerCase().includes('mdfe');
    if (isMdfeDoc) {
      if (extracted.docNumber) {
        patch.mdfeNumber = extracted.docNumber;
        updatedDocs.mdfe_number = extracted.docNumber;
        hasShipmentChanges = true;
      }
      if (extracted.ciot) {
        patch.ciotNumber = extracted.ciot;
        patch.ciot = extracted.ciot;
        updatedDocs.ciot = extracted.ciot;
        updatedDocs.ciot_number = extracted.ciot;
        hasShipmentChanges = true;
      }
    }

    // Pedágio
    if (extracted.financeiro?.valorPedagio !== undefined && extracted.financeiro.valorPedagio >= 0) {
      patch.tollValue = extracted.financeiro.valorPedagio;
      updatedDocs.toll_value = extracted.financeiro.valorPedagio;
      updatedDocs.valor_pedagio = extracted.financeiro.valorPedagio;
      updatedRealProfit.toll = extracted.financeiro.valorPedagio;
      hasShipmentChanges = true;
    }

    // Chave PIX
    if (extracted.financeiro?.chavePix) {
      patch.pixKey = extracted.financeiro.chavePix;
      updatedDocs.pix_key = extracted.financeiro.chavePix;
      hasShipmentChanges = true;
    }

    if (hasShipmentChanges && onUpdateShipmentData) {
      patch.documents = updatedDocs;
      patch.realProfitData = updatedRealProfit as any;
      onUpdateShipmentData(shipment.id, patch);
    }

    showToast('Dados lidos do documento aplicados e salvos no embarque!', 'success');
  };

  const mapRef = useRef<any>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const routeLayerRef = useRef<any>(null);

  // Cálculo e Validação de Divergência de Peso (Ticket de Carregamento vs CT-e)
  const ticketLoadedWeightTon = React.useMemo(() => {
    let raw = shipment.shipmentTonnage;
    if (!raw && (shipment.documents as any)?.loaded_tonnage) {
      raw = Number((shipment.documents as any).loaded_tonnage);
    }
    if (!raw && loadedTonnage !== '' && Number(loadedTonnage) > 0) {
      raw = Number(loadedTonnage);
    }
    if (!raw && cargo?.totalVolume) {
      raw = Number(cargo.totalVolume);
    }
    if (!raw) return 0;
    const num = Number(raw);
    return num > 500 ? num / 1000 : num; // Normaliza para Toneladas
  }, [shipment.shipmentTonnage, shipment.documents, loadedTonnage, cargo?.totalVolume]);

  const cteWeightTon = React.useMemo(() => {
    if (!cteExtractedWeightKg || cteExtractedWeightKg <= 0) return 0;
    return cteExtractedWeightKg > 500 ? cteExtractedWeightKg / 1000 : cteExtractedWeightKg;
  }, [cteExtractedWeightKg]);

  const weightDivergenceInfo = React.useMemo(() => {
    if (ticketLoadedWeightTon <= 0 || cteWeightTon <= 0) return null;
    const ticketKg = Math.round(ticketLoadedWeightTon * 1000);
    const cteKg = Math.round(cteWeightTon * 1000);
    const diffKg = Math.abs(ticketKg - cteKg);
    const diffTon = Math.abs(ticketLoadedWeightTon - cteWeightTon);

    // Considera divergência relevante se a diferença for maior que 10 kg
    if (diffKg > 10) {
      return {
        ticketTon: ticketLoadedWeightTon,
        ticketKg,
        ticketWeightTon: ticketLoadedWeightTon,
        cteTon: cteWeightTon,
        cteKg,
        cteWeightTon,
        diffKg,
        diffTon,
        diffFormatted: `${diffTon.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} ton`,
        diffKgFormatted: `${diffKg.toLocaleString('pt-BR')} kg`,
      };
    }
    return null;
  }, [ticketLoadedWeightTon, cteWeightTon]);

  // Frete Motorista no Sistema: considerar frete total motorista sem o valor do pedágio
  const systemDriverFreight = React.useMemo(() => {
    const currentToll = (docExtractedToll !== undefined && docExtractedToll > 0)
      ? docExtractedToll
      : (Number(tollValue) || Number(shipment.tollValue) || Number((shipment.documents as any)?.valor_pedagio) || Number((shipment.documents as any)?.toll_value) || 0);
    const rate = shipment.driverFreightRateSnapshot || cargo?.driverFreightValuePerTon || 0;
    const ton = Number(shipment.shipmentTonnage) || 0;
    const calculatedFreight = (rate > 0 && ton > 0) ? Number((rate * ton).toFixed(2)) : 0;
    const totalFreight = (calculatedFreight > 0 && shipment.driverFreightValue && Math.abs(Number(shipment.driverFreightValue) - calculatedFreight) > 5.00 && shipment.driverFreightRateSnapshot)
      ? calculatedFreight
      : (Number(shipment.driverFreightValue) || calculatedFreight);
    return Number(Math.max(0, totalFreight - currentToll).toFixed(2));
  }, [shipment.driverFreightValue, shipment.driverFreightRateSnapshot, cargo?.driverFreightValuePerTon, shipment.shipmentTonnage, tollValue, shipment.tollValue, shipment.documents, docExtractedToll]);

  const freightDivergenceInfo = React.useMemo(() => {
    if (!cartaFreteExtractedFreight || cartaFreteExtractedFreight <= 0 || systemDriverFreight <= 0) return null;

    // Carta Frete Anexada: considerar frete total motorista sem o valor do pedágio
    const currentToll = (docExtractedToll !== undefined && docExtractedToll > 0)
      ? docExtractedToll
      : (Number(tollValue) || Number(shipment.tollValue) || Number((shipment.documents as any)?.valor_pedagio) || Number((shipment.documents as any)?.toll_value) || 0);
    const netCartaFreteFreight = calculateNetCartaFreteFreight({
      rawFreight: cartaFreteExtractedFreight,
      toll: currentToll,
      advance: Number(advanceValue) || Number(shipment.advanceValue) || 0,
      advancePercentage: Number(advancePercentage) || Number(shipment.advancePercentage) || 0,
      systemFreightNetOfToll: systemDriverFreight,
      systemFreightWithToll: Number(shipment.driverFreightValue) || 0,
    }) || cartaFreteExtractedFreight;

    const diff = Math.abs(netCartaFreteFreight - systemDriverFreight);
    if (diff > 1.00) {
      return {
        systemFreight: systemDriverFreight,
        cartaFreteFreight: netCartaFreteFreight,
        diff,
        diffFormatted: `R$ ${diff.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      };
    }
    return null;
  }, [cartaFreteExtractedFreight, systemDriverFreight, tollValue, advanceValue, advancePercentage, shipment.tollValue, shipment.advanceValue, shipment.advancePercentage, shipment.driverFreightValue, shipment.documents, docExtractedToll]);

  // Frete Empresa: Comparação entre Sistema e CT-e (VALOR TOTAL DO SERVIÇO - CTE vs Total Frete Emp)
  const systemCompanyFreight = React.useMemo(() => {
    const companyRate = shipment.companyFreightRateSnapshot || cargo?.companyFreightValuePerTon || 0;
    const ton = ticketLoadedWeightTon || Number(loadedTonnage) || Number(shipment.shipmentTonnage) || Number(cargo?.totalVolume) || 0;
    if (companyRate > 0 && ton > 0) {
      return Number((companyRate * ton).toFixed(2));
    }
    if (shipment.realProfitData?.companyFreight !== undefined && shipment.realProfitData.companyFreight > 0) {
      return Number(shipment.realProfitData.companyFreight);
    }
    return 0;
  }, [shipment.companyFreightRateSnapshot, cargo?.companyFreightValuePerTon, ticketLoadedWeightTon, loadedTonnage, shipment.shipmentTonnage, cargo?.totalVolume, shipment.realProfitData?.companyFreight]);

  const companyFreightDivergenceInfo = React.useMemo(() => {
    if (!cteExtractedServiceTotal || cteExtractedServiceTotal <= 0 || systemCompanyFreight <= 0) return null;
    const diff = Math.abs(cteExtractedServiceTotal - systemCompanyFreight);
    if (diff > 1.00) {
      return {
        systemCompanyFreight,
        cteServiceTotal: cteExtractedServiceTotal,
        diff,
        diffFormatted: `R$ ${diff.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      };
    }
    return null;
  }, [cteExtractedServiceTotal, systemCompanyFreight]);

  // ICMS: Comparação entre Sistema e CT-e
  const isCargoWithoutIcms = Boolean(
    cargo &&
    !cargo.hasIcms &&
    !(cargo.icmsPercentage && Number(cargo.icmsPercentage) > 0) &&
    !(cargo.freightLegs && cargo.freightLegs[0]?.hasIcms === true) &&
    !(cargo.freightLegs && Number(cargo.freightLegs[0]?.icmsPercentage) > 0) &&
    (cargo as any).freightCalculationType !== 'per_ton_plus_icms' &&
    !(cargo.freightLegs && (cargo.freightLegs[0] as any)?.freightCalculationType === 'per_ton_plus_icms') &&
    !(shipment as any)?.hasIcms
  );

  const systemIcms = React.useMemo(() => {
    if (
      isCargoWithoutIcms ||
      shipment.isIcmsExempt ||
      (shipment.documents as any)?.is_icms_exempt ||
      (shipment.documents as any)?.isIcmsExempt ||
      shipment.realProfitData?.isIcmsExempt ||
      shipment.icmsValue === 0 ||
      (shipment.documents as any)?.icms_value === 0 ||
      (shipment.documents as any)?.icms_value === '0' ||
      (shipment.documents as any)?.valor_icms === 0 ||
      shipment.realProfitData?.icmsDifference === 0
    ) {
      return 0;
    }
    if (shipment.icmsValue !== undefined && shipment.icmsValue > 0) return shipment.icmsValue;
    if ((shipment.documents as any)?.icms_value) return Number((shipment.documents as any).icms_value);
    if (shipment.realProfitData?.icmsDifference !== undefined && shipment.realProfitData.icmsDifference > 0) {
      return shipment.realProfitData.icmsDifference;
    }
    if (cargo?.hasIcms && cargo?.icmsPercentage) {
      const companyFreight = (cargo.companyFreightValuePerTon || 0) * (shipment.shipmentTonnage || 0);
      return (companyFreight * cargo.icmsPercentage) / 100;
    }
    return 0;
  }, [shipment.isIcmsExempt, shipment.icmsValue, shipment.documents, shipment.realProfitData, shipment.shipmentTonnage, cargo, isCargoWithoutIcms]);

  const icmsDivergenceInfo = React.useMemo(() => {
    if (isCargoWithoutIcms) return null; // Nunca cria divergência de ICMS se a carga não tem ICMS
    if (cteExtractedIcms === undefined) return null;
    const diff = Math.abs((systemIcms || 0) - cteExtractedIcms);
    if (diff > 1.00) {
      return {
        systemIcms: systemIcms || 0,
        cteIcms: cteExtractedIcms,
        diff,
        diffFormatted: `R$ ${diff.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      };
    }
    return null;
  }, [cteExtractedIcms, systemIcms, isCargoWithoutIcms]);

  // Vale-Pedágio: Comparação entre Sistema e Documento Fiscal (CT-e / Carta Frete)
  const systemToll = React.useMemo(() => {
    return Number(tollValue) || Number(shipment.tollValue) || Number((shipment.documents as any)?.valor_pedagio) || Number((shipment.documents as any)?.toll_value) || 0;
  }, [tollValue, shipment.tollValue, shipment.documents]);

  const tollDivergenceInfo = React.useMemo(() => {
    if (docExtractedToll === undefined) return null;
    const diff = Math.abs(systemToll - docExtractedToll);
    if (diff > 1.00) {
      return {
        systemToll,
        docToll: docExtractedToll,
        diff,
        diffFormatted: `R$ ${diff.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      };
    }
    return null;
  }, [docExtractedToll, systemToll]);

  // Tomador (Pagador): Validação entre Cadastro da Carga (Sistema) e Tomador do CT-e
  const currentClient = React.useMemo(() => {
    if (!cargo?.clientId || !clients) return null;
    return clients.find(c => c.id === cargo.clientId) || null;
  }, [cargo?.clientId, clients]);

  const currentClientCnpj = React.useMemo(() => {
    return (cargo?.clientCnpj || currentClient?.cnpj || '').trim();
  }, [cargo?.clientCnpj, currentClient]);

  const cleanSystemCnpj = React.useMemo(() => {
    return currentClientCnpj.replace(/\D/g, '');
  }, [currentClientCnpj]);

  const cleanCteTomadorCnpj = React.useMemo(() => {
    return (cteExtractedTomadorCnpj || '').replace(/\D/g, '');
  }, [cteExtractedTomadorCnpj]);

  const tomadorDivergenceInfo = React.useMemo(() => {
    if (!cleanCteTomadorCnpj || cleanCteTomadorCnpj.length < 11) return null;
    if (!cleanSystemCnpj && !currentClient) return null;

    // Se bater com o CNPJ principal do cliente/carga, não há divergência
    if (cleanSystemCnpj && cleanSystemCnpj === cleanCteTomadorCnpj) return null;

    // Se já constar cadastrado em secondaryCnpjs (filiais) do cliente, não há divergência
    if (currentClient?.secondaryCnpjs?.some(b => (b.cnpj || '').replace(/\D/g, '') === cleanCteTomadorCnpj)) {
      return null;
    }

    return {
      systemClientName: currentClient?.razaoSocial || currentClient?.nomeFantasia || 'Tomador da Carga',
      systemCnpj: currentClientCnpj || 'Não informado',
      systemCleanCnpj: cleanSystemCnpj,
      cteTomadorNome: cteExtractedTomadorNome || 'Tomador no CT-e',
      cteTomadorCnpj: cteExtractedTomadorCnpj || '',
      cteCleanCnpj: cleanCteTomadorCnpj,
    };
  }, [cleanCteTomadorCnpj, cleanSystemCnpj, currentClient, currentClientCnpj, cteExtractedTomadorNome, cteExtractedTomadorCnpj]);

  // Adiantamento: Validação do Cálculo do Sistema vs Adiantamento de Viagem da Carta Frete
  const systemCalculatedAdvance = React.useMemo(() => {
    const loadedTonnageValue = Number(loadedTonnage) || Number(shipment.shipmentTonnage) || 0;
    const driverFreightRate = shipment.driverFreightRateSnapshot || cargo?.driverFreightValuePerTon || 0;
    const totalFreight = shipment.driverFreightValue || (driverFreightRate * loadedTonnageValue);
    const advPercent = advancePercentage !== '' && advancePercentage !== undefined ? Number(advancePercentage) : 70;
    const tagVal = Number(tollValue || 0);
    const isPf = shipment.driverFreightType === 'PF' || shipment.anttModality === 'TAC';

    const calc = calculateAdvanceAndBalance({
      driverFreightValue: totalFreight,
      driverFreightRate: driverFreightRate,
      tonnage: loadedTonnageValue,
      tollValue: tagVal,
      advancePercentage: advPercent,
      driverFreightType: isPf ? 'PF' : 'PJ',
    });
    return calc.advanceInAccountValue > 0 ? calc.advanceInAccountValue : (Number(advanceValue) || 0);
  }, [loadedTonnage, shipment.shipmentTonnage, shipment.driverFreightRateSnapshot, cargo?.driverFreightValuePerTon, shipment.driverFreightValue, advancePercentage, tollValue, shipment.driverFreightType, shipment.anttModality, advanceValue]);

  const isAguardandoFiscal = shipment.status === ShipmentStatus.AguardandoFiscal;
  const isAguardandoAdiantamento = shipment.status === ShipmentStatus.AguardandoAdiantamento;

  const advanceDivergenceInfo = React.useMemo(() => {
    if (!isAguardandoAdiantamento) return null;
    if (!cartaFreteExtractedAdvance || cartaFreteExtractedAdvance <= 0) return null;
    const currentAdv = Number(advanceValue) || 0;
    const diffCurrent = Math.abs(currentAdv - cartaFreteExtractedAdvance);

    // Se o valor de Adiantamento PG no sistema for diferente do Adiantamento de viagem da Carta Frete (> R$ 1,00)
    if (diffCurrent > 1.00) {
      return {
        systemAdvance: currentAdv,
        systemCalculatedAdvance,
        cartaFreteAdvance: cartaFreteExtractedAdvance,
        diff: diffCurrent,
        diffFormatted: `R$ ${diffCurrent.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      };
    }
    return null;
  }, [isAguardandoAdiantamento, cartaFreteExtractedAdvance, advanceValue, systemCalculatedAdvance]);

  const hasUnresolvedWeightDivergence = isAguardandoFiscal && !!weightDivergenceInfo && weightDecision === 'unresolved';
  const hasUnresolvedFreightDivergence = isAguardandoFiscal && !!freightDivergenceInfo && freightDecision === 'unresolved';
  const hasUnresolvedCompanyFreightDivergence = isAguardandoFiscal && !!companyFreightDivergenceInfo && companyFreightDecision === 'unresolved';
  const hasUnresolvedIcmsDivergence = isAguardandoFiscal && !!icmsDivergenceInfo && icmsDecision === 'unresolved';
  const hasUnresolvedTollDivergence = isAguardandoFiscal && !!tollDivergenceInfo && tollDecision === 'unresolved';
  const hasUnresolvedTomadorDivergence = !!tomadorDivergenceInfo && tomadorDecision === 'unresolved';
  const hasUnresolvedAdvanceDivergence = isAguardandoAdiantamento && !!advanceDivergenceInfo && Math.abs((Number(advanceValue) || 0) - (cartaFreteExtractedAdvance || 0)) > 1.00;
  const hasUnresolvedFiscalDivergence = hasUnresolvedWeightDivergence || hasUnresolvedFreightDivergence || hasUnresolvedCompanyFreightDivergence || hasUnresolvedIcmsDivergence || hasUnresolvedTollDivergence || hasUnresolvedTomadorDivergence;

  const existingAdiantamentoDocs = shipment.documents?.['Comprovante de Adiantamento'];
  const hasExistingAdiantamentoReceipt = (Array.isArray(existingAdiantamentoDocs) && existingAdiantamentoDocs.length > 0) || (typeof existingAdiantamentoDocs === 'string' && isActualDocumentUrl(existingAdiantamentoDocs)) || Boolean((shipment.documents as any)?.comprovante_adiantamento);
  const hasAttachedAdiantamentoReceipt = singleFiles.length > 0;
  const hasAgAdiantamentoReceipt = hasAttachedAdiantamentoReceipt || hasExistingAdiantamentoReceipt;
  const isMissingAdiantamentoReceipt = isAguardandoAdiantamento && !hasAgAdiantamentoReceipt;

  const hasDocForCategory = React.useCallback((catName: 'CT-e' | 'MDF-e' | 'Carta Frete'): boolean => {
    const newFiles = multiFiles[catName];
    if (Array.isArray(newFiles) && newFiles.length > 0) return true;
    if (catName === 'CT-e' && (multiFiles['DACTE']?.length > 0 || multiFiles['Conhecimento de Transporte']?.length > 0)) return true;
    if (catName === 'MDF-e' && (multiFiles['DAMDFE']?.length > 0 || multiFiles['Manifesto']?.length > 0)) return true;
    if (catName === 'Carta Frete' && (multiFiles['Contrato de Transporte']?.length > 0 || multiFiles['Carta de Frete']?.length > 0)) return true;

    if (shipment.documents && typeof shipment.documents === 'object') {
      for (const [key, val] of Object.entries(shipment.documents)) {
        if (!val || isDocumentMetadataKey(key)) continue;
        const keyLower = key.toLowerCase().trim();
        const hasUrl = Array.isArray(val) ? val.some(isActualDocumentUrl) : isActualDocumentUrl(val);
        if (!hasUrl) continue;
        if (catName === 'CT-e' && (keyLower === 'ct-e' || keyLower === 'cte' || keyLower === 'dacte' || keyLower.includes('conhecimento'))) return true;
        if (catName === 'MDF-e' && (keyLower === 'mdf-e' || keyLower === 'mdfe' || keyLower === 'damdfe' || keyLower.includes('manifesto'))) return true;
        if (catName === 'Carta Frete' && (keyLower === 'carta frete' || keyLower === 'carta de frete' || keyLower === 'contrato de transporte' || keyLower.includes('carta frete'))) return true;
      }
    }
    return false;
  }, [multiFiles, shipment.documents]);

  const hasValidDocForCategory = React.useCallback((catName: 'CT-e' | 'MDF-e' | 'Carta Frete'): boolean => {
    const newFiles = multiFiles[catName] || [];
    const hasMismatchInField = newFiles.some(f => {
      const mm = detectAttachmentMismatch(f, catName, detectedDocTypes[f.name]);
      return mm?.isMismatch;
    });
    if (hasMismatchInField) return false;
    if (newFiles.length > 0) return true;
    return hasDocForCategory(catName);
  }, [multiFiles, detectedDocTypes, hasDocForCategory]);

  const isComplementar = Boolean(
    shipment.isComplementar ||
    (shipment.documents as any)?.is_complementar ||
    (shipment.documents as any)?.isComplementar
  );

  const missingFiscalDocs = React.useMemo(() => {
    if (!isAguardandoFiscal) return [];
    const missing: string[] = [];
    if (!hasValidDocForCategory('CT-e')) missing.push('CT-e');
    if (!isComplementar) {
      if (!hasValidDocForCategory('MDF-e')) missing.push('MDF-e');
      if (!hasValidDocForCategory('Carta Frete')) missing.push('Carta Frete');
    }
    return missing;
  }, [isAguardandoFiscal, hasValidDocForCategory, isComplementar]);

  const hasMissingFiscalDocs = isAguardandoFiscal && missingFiscalDocs.length > 0;

  const fiscalAttachmentMismatches = React.useMemo(() => {
    if (!isAguardandoFiscal) return [];
    const errors: { field: string; fileName: string; detectedType: string; message: string }[] = [];
    (isComplementar ? (['CT-e'] as ('CT-e' | 'MDF-e' | 'Carta Frete')[]) : (['CT-e', 'MDF-e', 'Carta Frete'] as ('CT-e' | 'MDF-e' | 'Carta Frete')[])).forEach(cat => {
      const files = multiFiles[cat] || [];
      files.forEach(f => {
        const mismatch = detectAttachmentMismatch(f, cat, detectedDocTypes[f.name]);
        if (mismatch?.isMismatch) {
          let msg = mismatch.message;
          if (cat === 'CT-e') {
            msg = `Documento inválido no campo CT-e: O arquivo anexado foi identificado como ${mismatch.detectedType}. Por favor, anexe o DACTE correspondente.`;
          } else if (cat === 'MDF-e') {
            msg = `Documento inválido no campo MDF-e: O arquivo anexado não é um Manifesto (MDF-e/DAMDFE) válido.`;
          } else if (cat === 'Carta Frete') {
            msg = `Documento inválido no campo Carta Frete: O arquivo anexado não corresponde a uma Carta Frete / Contrato de Transporte.`;
          }
          errors.push({ field: cat, fileName: f.name, detectedType: mismatch.detectedType, message: msg });
        }
      });
    });
    return errors;
  }, [isAguardandoFiscal, multiFiles, detectedDocTypes]);

  const hasAttachmentMismatch = React.useMemo(() => {
    for (const [cat, list] of Object.entries(multiFiles)) {
      if (!Array.isArray(list)) continue;
      for (const file of list) {
        const mismatch = detectAttachmentMismatch(file, cat, detectedDocTypes[file.name]);
        if (mismatch?.isMismatch) return true;
      }
    }
    return false;
  }, [multiFiles, detectedDocTypes]);

  // Alertas em tempo real quando houver divergências no Aguardando Fiscal
  useEffect(() => {
    if (!isOpen || !isAguardandoFiscal) return;

    if (hasAttachmentMismatch) {
      showToast(
        '⚠️ Documento anexado em campo incorreto detectado (ex: MDF-e em Carta Frete). Utilize o botão "Mover para ..." no arquivo para corrigir.',
        'error',
        8000
      );
    }

    if (weightDivergenceInfo && weightDecision === 'unresolved') {
      showToast(
        `⚠️ Divergência de Peso: Ticket (${weightDivergenceInfo.ticketTon.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}t) vs CT-e (${weightDivergenceInfo.cteTon.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}t). Diferença: ${weightDivergenceInfo.diffKgFormatted}. Confirme qual valor é o correto.`,
        'warning',
        7000
      );
    }
    if (freightDivergenceInfo && freightDecision === 'unresolved') {
      showToast(
        `⚠️ Divergência de Frete Motorista: Sistema (R$ ${freightDivergenceInfo.systemFreight.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}) vs Carta Frete (R$ ${freightDivergenceInfo.cartaFreteFreight.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} sem pedágio). Diferença: ${freightDivergenceInfo.diffFormatted}. Confirme qual valor é o correto.`,
        'warning',
        7000
      );
    }
    if (companyFreightDivergenceInfo && companyFreightDecision === 'unresolved') {
      showToast(
        `⚠️ Divergência de Frete Empresa: CT-e (${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(companyFreightDivergenceInfo.cteServiceTotal)}) vs Sistema (${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(companyFreightDivergenceInfo.systemCompanyFreight)}). Regra: VALOR TOTAL DO SERVIÇO - CTE precisa ser igual ao Total Frete Emp do sistema.`,
        'warning',
        7000
      );
    }
    if (icmsDivergenceInfo && icmsDecision === 'unresolved') {
      showToast(
        `⚠️ Divergência de ICMS: Sistema (R$ ${icmsDivergenceInfo.systemIcms.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}) vs CT-e (R$ ${icmsDivergenceInfo.cteIcms.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}). Diferença: ${icmsDivergenceInfo.diffFormatted}. Confirme qual valor é o correto.`,
        'warning',
        7000
      );
    }
    if (tollDivergenceInfo && tollDecision === 'unresolved') {
      showToast(
        `⚠️ Divergência de Vale-Pedágio: Sistema (R$ ${tollDivergenceInfo.systemToll.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}) vs Documento (R$ ${tollDivergenceInfo.docToll.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}). Diferença: ${tollDivergenceInfo.diffFormatted}. Confirme qual valor é o correto.`,
        'warning',
        7000
      );
    }
    if (tomadorDivergenceInfo && tomadorDecision === 'unresolved') {
      showToast(
        `⚠️ Divergência de Tomador: Carga (${tomadorDivergenceInfo.systemCnpj}) vs CT-e (${tomadorDivergenceInfo.cteTomadorCnpj}). Confirme se deseja ajustar para o Tomador do CT-e ou vincular como Filial.`,
        'warning',
        7000
      );
    }
  }, [isOpen, isAguardandoFiscal, !!weightDivergenceInfo, !!freightDivergenceInfo, !!companyFreightDivergenceInfo, !!icmsDivergenceInfo, !!tollDivergenceInfo, !!tomadorDivergenceInfo]);

  // Alerta em tempo real quando houver divergência no Aguardando Adiantamento
  useEffect(() => {
    if (!isOpen || !isAguardandoAdiantamento) return;
    if (advanceDivergenceInfo) {
      showToast(
        `⚠️ Divergência no Adiantamento: "Adiantamento PG" (${formatCurrency(advanceDivergenceInfo.systemAdvance)}) difere do referente Adiantamento de viagem da Carta Frete (${formatCurrency(advanceDivergenceInfo.cartaFreteAdvance)}). Corrija para liberar o avanço.`,
        'warning',
        7000
      );
    }
  }, [isOpen, isAguardandoAdiantamento, !!advanceDivergenceInfo]);

  useEffect(() => {
    if (isOpen) {
      setError('');
      setActiveTab(currentUser.profile === UserProfile.Cliente ? 'documents' : 'timeline');
      setSingleFiles([]);
      setMultiFiles({});
      setBankDetails(shipment.bankDetails || '');
      setLoadedTonnage(shipment.shipmentTonnage || '');
      setCteExtractedWeightKg(undefined);
      setCartaFreteExtractedFreight(undefined);
      setCartaFreteExtractedAdvance(undefined);
      setCteExtractedServiceTotal(undefined);
      setCteExtractedIcms(undefined);
      setWeightDecision('unresolved');
      setFreightDecision('unresolved');
      setAdvanceDecision('unresolved');
      setCompanyFreightDecision('unresolved');
      setIcmsDecision('unresolved');
      setTomadorDecision('unresolved');
      setCteExtractedTomadorNome(
        (shipment.documents as any)?.cte_tomador || 
        (shipment.documents as any)?.cteTomadorNome || 
        (shipment.documents as any)?.tomador_nome || 
        undefined
      );
      setCteExtractedTomadorCnpj(
        (shipment.documents as any)?.cte_tomador_cnpj || 
        (shipment.documents as any)?.cteTomadorCnpj || 
        (shipment.documents as any)?.tomador_cnpj || 
        undefined
      );

      const initialAdvPct = shipment.advancePercentage !== undefined ? shipment.advancePercentage : 70;
      const initialToll = shipment.tollValue || 0;
      const rate = shipment.driverFreightRateSnapshot || cargo?.driverFreightValuePerTon || 0;
      const tVal = shipment.shipmentTonnage || 0;
      const totFrete = shipment.driverFreightValue || (rate * tVal);
      const isPfInit = shipment.driverFreightType === 'PF' || shipment.anttModality === 'TAC';

      const calcInit = calculateAdvanceAndBalance({
        driverFreightValue: totFrete,
        driverFreightRate: rate,
        tonnage: tVal,
        tollValue: initialToll,
        advancePercentage: initialAdvPct,
        driverFreightType: isPfInit ? 'PF' : 'PJ',
      });

      setAdvancePercentage(initialAdvPct);
      setTollValue(shipment.tollValue !== undefined ? shipment.tollValue : '');
      setAdvanceValue(shipment.advanceValue !== undefined && shipment.advanceValue > 0 ? shipment.advanceValue : (calcInit.advanceInAccountValue > 0 ? calcInit.advanceInAccountValue : ''));
      setBalanceToReceiveValue(shipment.balanceToReceiveValue !== undefined && shipment.balanceToReceiveValue > 0 ? shipment.balanceToReceiveValue : (calcInit.balanceToReceiveValue > 0 ? calcInit.balanceToReceiveValue : ''));
      setDiscountValue(shipment.discountValue || '');
      const hasQuebra = shipment.unloadedTonnage !== undefined && shipment.shipmentTonnage !== undefined && (shipment.unloadedTonnage - shipment.shipmentTonnage) < -0.001;
      const isWaived = shipment.isBreakageWaived ?? (shipment.discountValue === 0 && hasQuebra);
      setIsBreakageWaived(Boolean(isWaived));
      setNetBalanceValue(shipment.netBalanceValue || '');
      setUnloadedTonnage(shipment.unloadedTonnage || '');

      setRoute(shipment.route || '');
      setRiskReleaseCode(shipment.riskReleaseCode || '');
      setRiskQueryType((shipment.riskQueryType as RiskQueryType) || '');
      setGrStatus('aprovado');
      setCodigoAtua(
        shipment.codigoAtua || 
        (shipment.documents as any)?.codigo_atua || 
        (shipment.documents as any)?.codg_atua || 
        (shipment.documents as any)?.codigoAtua || 
        ''
      );

      // Se o pedágio ou adiantamento ou peso do CT-e não estiverem preenchidos, verifica os documentos já anexados
      if (shipment.documents) {
        const urlMap: { [key: string]: string[] } = {};
        for (const [k, v] of Object.entries(shipment.documents)) {
          if (Array.isArray(v) && v.length > 0) urlMap[k] = v;
          else if (typeof v === 'string' && v.trim() !== '') urlMap[k] = [v];
        }
        if (Object.keys(urlMap).length > 0) {
          extractFiscalDocNumbersFromUrls(urlMap).then(extracted => {
            if (extracted.tollValue !== undefined) {
              setDocExtractedToll(extracted.tollValue);
              if (extracted.tollValue > 0 && (shipment.tollValue === undefined || shipment.tollValue === null)) {
                setTollValue(extracted.tollValue);
              }
            }
            if (extracted.advanceValue !== undefined && extracted.advanceValue > 0) {
              setCartaFreteExtractedAdvance(extracted.advanceValue);
              setAdvanceValue(extracted.advanceValue);
            }
            if (extracted.advancePercentage !== undefined && extracted.advancePercentage > 0 && !shipment.advancePercentage) {
              setAdvancePercentage(extracted.advancePercentage);
            }
            if (extracted.cteWeightKg !== undefined && extracted.cteWeightKg > 0) {
              setCteExtractedWeightKg(extracted.cteWeightKg);
            }
            if (extracted.driverFreightValue !== undefined && extracted.driverFreightValue > 0) {
              setCartaFreteExtractedFreight(extracted.driverFreightValue);
            }
            if (extracted.cteTotalServiceValue !== undefined && extracted.cteTotalServiceValue > 0) {
              setCteExtractedServiceTotal(extracted.cteTotalServiceValue);
            }
            if (extracted.icmsValue !== undefined && extracted.icmsValue > 0) {
              setCteExtractedIcms(extracted.icmsValue);
            }
            if (extracted.cteTomadorCnpj) {
              setCteExtractedTomadorCnpj(extracted.cteTomadorCnpj);
            }
            if (extracted.cteTomadorNome) {
              setCteExtractedTomadorNome(extracted.cteTomadorNome);
            }
            if (extracted.ciotNumber && (!shipment.ciotNumber || shipment.ciotNumber === '-' || shipment.ciotNumber === shipment.id) && onUpdateShipmentData) {
              onUpdateShipmentData(shipment.id, {
                ciot: extracted.ciotNumber,
                ciotNumber: extracted.ciotNumber,
                documents: {
                  ...shipment.documents,
                  ciot_number: extracted.ciotNumber,
                  ciot: extracted.ciotNumber
                }
              }, { silent: true });
            }
            if (extracted.ordemCarregamentoNumero && !shipment.documents?.ordem_carregamento_numero && onUpdateShipmentData) {
              onUpdateShipmentData(shipment.id, {
                documents: {
                  ...shipment.documents,
                  ordem_carregamento_numero: extracted.ordemCarregamentoNumero,
                  oc_number: extracted.ordemCarregamentoNumero
                }
              }, { silent: true });
            }
          }).catch(err => console.warn('[AttachmentModal] Auto extract from URLs error:', err));
        }
      }
    }
  }, [isOpen, shipment]);

  // Captura global de colagem de imagem (Ctrl+V) dentro do modal
  useEffect(() => {
    if (!isOpen) return;

    const handleGlobalPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') && (target as HTMLInputElement).type === 'text') {
        return;
      }

      const items = e.clipboardData?.items;
      if (!items) return;

      const pastedFiles: File[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            const ext = file.type.split('/')[1] || 'png';
            const namedFile = new File([file], `comprovante_colado_${Date.now()}.${ext}`, { type: file.type });
            pastedFiles.push(namedFile);
          }
        }
      }

      if (pastedFiles.length > 0) {
        e.preventDefault();
        setSingleFiles(pastedFiles);
        showToast('Imagem colada da área de transferência com sucesso!', 'success');
      }
    };

    window.addEventListener('paste', handleGlobalPaste);
    return () => {
      window.removeEventListener('paste', handleGlobalPaste);
    };
  }, [isOpen]);

  // AUTO-PARSING: Extração de informações do Contrato de Frete (Pedágio, Adiantamento, % Adiantamento) e CT-e (Peso)
  useEffect(() => {
    const autoParseFreightDoc = async () => {
      const filesToProcess: { [key: string]: File[] } = {};
      if (Object.keys(multiFiles).length > 0) {
        Object.assign(filesToProcess, multiFiles);
      }
      if (singleFiles.length > 0) {
        filesToProcess[documentName || 'Documento'] = singleFiles;
      }
      if (Object.keys(filesToProcess).length > 0) {
        try {
          const parsed = await extractFiscalDocNumbers(filesToProcess);
          let extractedAny = false;
          if (parsed.tollValue !== undefined) {
            setTollValue(parsed.tollValue);
            setDocExtractedToll(parsed.tollValue);
            extractedAny = true;
          }
          if (parsed.advanceValue !== undefined && parsed.advanceValue > 0) {
            setCartaFreteExtractedAdvance(parsed.advanceValue);
            setAdvanceValue(parsed.advanceValue);
            extractedAny = true;
          }
          if (parsed.advancePercentage !== undefined) {
            setAdvancePercentage(parsed.advancePercentage);
            extractedAny = true;
          }
          if (parsed.cteWeightKg !== undefined && parsed.cteWeightKg > 0) {
            setCteExtractedWeightKg(parsed.cteWeightKg);
          }
          if (parsed.driverFreightValue !== undefined && parsed.driverFreightValue > 0) {
            setCartaFreteExtractedFreight(parsed.driverFreightValue);
            extractedAny = true;
          }
          if (parsed.cteTotalServiceValue !== undefined && parsed.cteTotalServiceValue > 0) {
            setCteExtractedServiceTotal(parsed.cteTotalServiceValue);
            extractedAny = true;
          }
          if (parsed.icmsValue !== undefined && parsed.icmsValue > 0) {
            setCteExtractedIcms(parsed.icmsValue);
            extractedAny = true;
          }
          if (parsed.cteTomadorCnpj) {
            setCteExtractedTomadorCnpj(parsed.cteTomadorCnpj);
            extractedAny = true;
          }
          if (parsed.cteTomadorNome) {
            setCteExtractedTomadorNome(parsed.cteTomadorNome);
            extractedAny = true;
          }
          if (parsed.loadedTonnage !== undefined && parsed.loadedTonnage > 0 && (typeof loadedTonnage !== 'number' || loadedTonnage <= 0)) {
            setLoadedTonnage(parsed.loadedTonnage);
            extractedAny = true;
          }
          if (parsed.subtotalSaldoValue !== undefined && parsed.subtotalSaldoValue > 0 && (typeof balanceToReceiveValue !== 'number' || balanceToReceiveValue <= 0)) {
            setBalanceToReceiveValue(parsed.subtotalSaldoValue);
            extractedAny = true;
          }
          if (parsed.pixKey && !bankDetails) {
            setBankDetails(parsed.pixKey);
            extractedAny = true;
          }
          if (extractedAny) {
            showToast('Informações de frete extraídas do documento com sucesso!', 'success');
          }
        } catch (err) {
          console.warn('[AttachmentModal] Erro ao extrair dados do contrato:', err);
        }
      }
    };
    autoParseFreightDoc();
  }, [singleFiles, multiFiles, documentName]);

  // Sniffing e detecção contínua do tipo real dos arquivos anexados (por nome e conteúdo)
  useEffect(() => {
    const filesToSniff: { file: File; currentCat: string }[] = [];
    Object.entries(multiFiles).forEach(([cat, list]) => {
      if (Array.isArray(list)) {
        list.forEach(f => filesToSniff.push({ file: f, currentCat: cat }));
      }
    });
    if (singleFiles.length > 0) {
      singleFiles.forEach(f => filesToSniff.push({ file: f, currentCat: documentName || 'Documento' }));
    }

    filesToSniff.forEach(({ file, currentCat }) => {
      const byName = detectDocumentTypeFromFileName(file.name);
      if (byName && !detectedDocTypes[file.name]) {
        setDetectedDocTypes(prev => ({ ...prev, [file.name]: byName }));
      }
      extractDetailedDocData(file, currentCat).then(detailed => {
        if (detailed?.documentType && detailed.documentType !== 'Outro') {
          setDetectedDocTypes(prev => {
            if (prev[file.name] !== detailed.documentType) {
              return { ...prev, [file.name]: detailed.documentType };
            }
            return prev;
          });
        }
      }).catch(err => console.debug('[AttachmentModal] Doc type sniff error:', err));
    });
  }, [multiFiles, singleFiles, documentName]);

  // Validador universal de documentos duplicados para travar tentativas de anexo repetido
  const checkDuplicateFile = React.useCallback((file: File, targetCategory: string): { isDuplicate: boolean; foundLocation: string; originalName?: string } | null => {
    // REGRA ESPECÍFICA: Não bloqueia arquivos duplicados para o ticket de descarga (permite substituição e novos tickets)
    if (isDischargeTicketCategory(targetCategory, shipment?.status)) {
      return null;
    }

    const normNewName = file.name.trim().toLowerCase();
    const cleanNormNewName = normNewName.replace(/[^a-z0-9]/g, '');

    // 1. Checa contra documentos já anexados e persistidos no embarque (shipment.documents)
    if (shipment.documents) {
      for (const [category, val] of Object.entries(shipment.documents)) {
        if (!isValidDocumentEntry(category, val)) continue;
        const list = Array.isArray(val) ? val : (typeof val === 'string' ? [val] : []);
        for (const item of list) {
          if (typeof item === 'string' && isActualDocumentUrl(item)) {
            const rawFileName = decodeURIComponent(item.split('/').pop()?.split('?')[0] || '').trim().toLowerCase();
            const cleanFileName = rawFileName.includes('_')
              ? rawFileName.split('_').slice(2).join('_') || rawFileName
              : rawFileName;

            const cleanRawNorm = rawFileName.replace(/[^a-z0-9]/g, '');
            const cleanNorm = cleanFileName.replace(/[^a-z0-9]/g, '');

            const isSameName = (
              rawFileName === normNewName ||
              cleanFileName === normNewName ||
              rawFileName.endsWith(normNewName) ||
              (cleanNormNewName.length > 5 && (cleanNorm === cleanNormNewName || cleanRawNorm.endsWith(cleanNormNewName)))
            );

            if (isSameName) {
              return {
                isDuplicate: true,
                foundLocation: `já gravado no campo "${category}" deste embarque`,
                originalName: cleanFileName || rawFileName
              };
            }
          }
        }
      }
    }

    // 2. Checa contra arquivos já adicionados nesta sessão no estado multiFiles
    for (const [category, fileList] of Object.entries(multiFiles)) {
      for (const existingFile of (fileList || [])) {
        if (existingFile === file) continue;
        const existingNorm = existingFile.name.trim().toLowerCase();
        const existingCleanNorm = existingNorm.replace(/[^a-z0-9]/g, '');

        if (existingNorm === normNewName || 
            (existingCleanNorm.length > 5 && existingCleanNorm === cleanNormNewName) ||
            (existingFile.size === file.size && existingFile.size > 0 && Math.abs(existingFile.lastModified - file.lastModified) < 5000)) {
          return {
            isDuplicate: true,
            foundLocation: `já selecionado no campo "${category}"`,
            originalName: existingFile.name
          };
        }
      }
    }

    // 3. Checa contra arquivos já adicionados nesta sessão no estado singleFiles
    for (const existingFile of singleFiles) {
      if (existingFile === file) continue;
      const existingNorm = existingFile.name.trim().toLowerCase();
      const existingCleanNorm = existingNorm.replace(/[^a-z0-9]/g, '');

      if (existingNorm === normNewName || 
          (existingCleanNorm.length > 5 && existingCleanNorm === cleanNormNewName) ||
          (existingFile.size === file.size && existingFile.size > 0 && Math.abs(existingFile.lastModified - file.lastModified) < 5000)) {
        return {
          isDuplicate: true,
          foundLocation: `já selecionado no campo "${documentName || 'Documentos'}"`,
          originalName: existingFile.name
        };
      }
    }

    return null;
  }, [shipment.documents, multiFiles, singleFiles, documentName]);

  const handleMoveFile = (file: File, fromDocType: string, toDocType: string) => {
    setMultiFiles(prev => {
      const sourceFiles = (prev[fromDocType] || []).filter(f => f !== file && f.name !== file.name);
      const existingTarget = (prev[toDocType] || []).filter(f => f.name !== file.name);
      return {
        ...prev,
        [fromDocType]: sourceFiles,
        [toDocType]: [...existingTarget, file],
      };
    });
    showToast(`✓ Arquivo "${file.name}" transferido com sucesso para o campo "${toDocType}"!`, 'success');
  };

  const handleRemoveFile = (file: File, docType: string) => {
    setMultiFiles(prev => ({
      ...prev,
      [docType]: (prev[docType] || []).filter(f => f !== file && f.name !== file.name),
    }));
    showToast(`Arquivo "${file.name}" removido do campo "${docType}".`, 'info');
  };

  const handleMultiFileChange = (docType: string, f: FileList | File[] | null) => {
    if (!f) {
      setMultiFiles((prev: { [key: string]: File[] }) => ({
        ...prev,
        [docType]: [],
      }));
      return;
    }
    const fileArray = Array.from(f);
    const validFiles = fileArray.filter(file => {
      const dup = checkDuplicateFile(file, docType);
      if (dup?.isDuplicate) {
        showToast(`⛔ Arquivo Duplicado Bloqueado: O documento "${file.name}" já está ${dup.foundLocation}. Não é permitido anexar o mesmo documento duplicado.`, 'error', 8000);
        return false;
      }
      return true;
    });

    setMultiFiles((prev: { [key: string]: File[] }) => ({
      ...prev,
      [docType]: validFiles,
    }));
  };

  const handleSingleFilesChange = (f: FileList | File[] | null, targetCategory?: string) => {
    if (!f) {
      setSingleFiles([]);
      return;
    }
    const fileArray = Array.from(f);
    const cat = targetCategory || documentName || 'Documento';
    const isDischarge = isDischargeTicketCategory(cat, shipment?.status);
    const validFiles = fileArray.filter(file => {
      if (isDischarge) return true;
      const dup = checkDuplicateFile(file, cat);
      if (dup?.isDuplicate) {
        showToast(`⛔ Arquivo Duplicado Bloqueado: O documento "${file.name}" já está ${dup.foundLocation}. Não é permitido anexar o mesmo documento duplicado.`, 'error', 8000);
        return false;
      }
      return true;
    });
    setSingleFiles(validFiles);
  };

  const [isSyncingFederalTaxes, setIsSyncingFederalTaxes] = useState(false);

  const handleSyncFederalTaxes = async () => {
    setIsSyncingFederalTaxes(true);
    try {
      const filesToProcess: { [key: string]: File[] } = {};
      if (Object.keys(multiFiles).length > 0) {
        Object.assign(filesToProcess, multiFiles);
      }
      if (singleFiles.length > 0) {
        filesToProcess[documentName || 'Documento'] = singleFiles;
      }

      let parsedPis: number | undefined;
      let parsedCofins: number | undefined;
      let parsedFederalTax: number | undefined;
      let parsedNfeValue: number | undefined;
      let parsedToll: number | undefined;
      let parsedSuspensionPercent: number | undefined;

      const isExcludedDocCategory = (cat: string) => {
        const lower = (cat || '').toLowerCase();
        return (
          lower.includes('cadastro') ||
          lower.includes('cnh') ||
          lower.includes('adiantamento') ||
          lower.includes('agendamento') ||
          lower.includes('descarga') ||
          lower.includes('saldo') ||
          lower.includes('seguradora') ||
          lower.includes('liberação') ||
          lower.includes('liberacao') ||
          lower.includes('ordem') ||
          lower.includes('veículo') ||
          lower.includes('veiculo')
        );
      };

      let sumNfeValues = 0;
      let nfeFilesCount = 0;
      let transportCargoValue: number | undefined;
      const detectedNfeNumbersList: string[] = [];
      const countedNfeKeysInBatch = new Set<string>();

      for (const [docType, files] of Object.entries(filesToProcess)) {
        if (!Array.isArray(files) || isExcludedDocCategory(docType)) continue;
        for (const file of files) {
          try {
            const ext = await extractDetailedDocData(file, docType);
            const isTransport = 
              ext.documentType === 'Carta Frete' || 
              ext.documentType === 'CT-e' || 
              ext.documentType === 'MDF-e' ||
              docType.toLowerCase().includes('carta') ||
              docType.toLowerCase().includes('frete') ||
              docType.toLowerCase().includes('contrato') ||
              docType.toLowerCase().includes('cte') ||
              docType.toLowerCase().includes('ct-e') ||
              docType.toLowerCase().includes('mdfe');

            // Se for CT-e de outro número que não do embarque, não usar
            if (ext.documentType === 'CT-e' && shipment.cteNumber && ext.docNumber && String(ext.docNumber) !== String(shipment.cteNumber)) {
              continue;
            }

            if (ext.financeiro?.valorPisCofinsFederal) parsedFederalTax = ext.financeiro.valorPisCofinsFederal;
            if (ext.financeiro?.valorPis) parsedPis = ext.financeiro.valorPis;
            if (ext.financeiro?.valorCofins) parsedCofins = ext.financeiro.valorCofins;

            const isNotaFiscalCategory = isStrictNotaFiscalCategory(docType);
            const docNfeVal = ext.financeiro?.valorTotalNfe || ext.carga?.valorMercadoria;

            if (isNotaFiscalCategory) {
              const nfeUniqueKey = ext.accessKey || (ext.docNumber ? String(ext.docNumber) : file.name);
              if (!countedNfeKeysInBatch.has(nfeUniqueKey)) {
                countedNfeKeysInBatch.add(nfeUniqueKey);
                if (docNfeVal && docNfeVal > 0) {
                  sumNfeValues = Number((sumNfeValues + docNfeVal).toFixed(2));
                  nfeFilesCount++;
                }
              }
              const num = ext.docNumber || ext.notasFiscais?.[0]?.numero || ext.documentosVinculados?.find(d => d.tipo.toLowerCase().includes('nfe') || d.tipo.toLowerCase().includes('nota'))?.numero;
              if (num && !detectedNfeNumbersList.includes(String(num))) {
                detectedNfeNumbersList.push(String(num));
              }
            } else if (ext.documentType === 'CT-e' || ext.documentType === 'MDF-e') {
              if (docNfeVal && docNfeVal > 0 && !transportCargoValue) {
                transportCargoValue = docNfeVal;
              }
            }

            if (isTransport && ext.financeiro?.valorPedagio) parsedToll = ext.financeiro.valorPedagio;
          } catch {
            // ignore
          }
        }
      }

      if (shipment.documents) {
        for (const [key, val] of Object.entries(shipment.documents)) {
          if (isExcludedDocCategory(key)) continue;
          const urls = Array.isArray(val) ? val : [val];
          for (const u of urls) {
            if (typeof u === 'string' && (u.startsWith('http') || u.startsWith('/'))) {
              try {
                const ext = await extractDetailedDocData(u, key);
                const isTransport = 
                  ext.documentType === 'Carta Frete' || 
                  ext.documentType === 'CT-e' || 
                  ext.documentType === 'MDF-e' ||
                  key.toLowerCase().includes('carta') ||
                  key.toLowerCase().includes('frete') ||
                  key.toLowerCase().includes('contrato') ||
                  key.toLowerCase().includes('cte') ||
                  key.toLowerCase().includes('ct-e') ||
                  key.toLowerCase().includes('mdfe');

                // Se for CT-e de outro número que não do embarque, ignorar
                if (ext.documentType === 'CT-e' && shipment.cteNumber && ext.docNumber && String(ext.docNumber) !== String(shipment.cteNumber)) {
                  continue;
                }

                if (!parsedFederalTax && ext.financeiro?.valorPisCofinsFederal) parsedFederalTax = ext.financeiro.valorPisCofinsFederal;
                if (!parsedPis && ext.financeiro?.valorPis) parsedPis = ext.financeiro.valorPis;
                if (!parsedCofins && ext.financeiro?.valorCofins) parsedCofins = ext.financeiro.valorCofins;

                const isNotaFiscalCategory = isStrictNotaFiscalCategory(key);
                const docNfeVal = ext.financeiro?.valorTotalNfe || ext.carga?.valorMercadoria;

                if (isNotaFiscalCategory) {
                  const nfeUniqueKey = ext.accessKey || (ext.docNumber ? String(ext.docNumber) : u);
                  if (!countedNfeKeysInBatch.has(nfeUniqueKey)) {
                    countedNfeKeysInBatch.add(nfeUniqueKey);
                    if (docNfeVal && docNfeVal > 0) {
                      sumNfeValues = Number((sumNfeValues + docNfeVal).toFixed(2));
                      nfeFilesCount++;
                    }
                  }
                  const num = ext.docNumber || ext.notasFiscais?.[0]?.numero || ext.documentosVinculados?.find(d => d.tipo.toLowerCase().includes('nfe') || d.tipo.toLowerCase().includes('nota'))?.numero;
                  if (num && !detectedNfeNumbersList.includes(String(num))) {
                    detectedNfeNumbersList.push(String(num));
                  }
                } else if (ext.documentType === 'CT-e' || ext.documentType === 'MDF-e') {
                  if (docNfeVal && docNfeVal > 0 && !transportCargoValue) {
                    transportCargoValue = docNfeVal;
                  }
                }

                if (isTransport && ext.financeiro?.valorPedagio) parsedToll = ext.financeiro.valorPedagio;
                if (ext.suspensaoPercentual && ext.suspensaoPercentual > 0) parsedSuspensionPercent = ext.suspensaoPercentual;
              } catch {
                // ignore
              }
            }
          }
        }
      }

      if (nfeFilesCount > 0 && sumNfeValues > 0) {
        parsedNfeValue = nfeFilesCount > 1 
          ? sumNfeValues 
          : Math.max(sumNfeValues, transportCargoValue || 0);
      } else if (transportCargoValue) {
        parsedNfeValue = transportCargoValue;
      }

      const companyRate = shipment.companyFreightRateSnapshot || cargo?.companyFreightValuePerTon || 0;
      const tonnageVal = Number(loadedTonnage || shipment.shipmentTonnage || cargo?.totalVolume || 0);
      const cteGrossFreight = (companyRate * tonnageVal) > 0 ? (companyRate * tonnageVal) : (shipment.driverFreightValue || 0);

      const driverRate = shipment.driverFreightRateSnapshot || cargo?.driverFreightValuePerTon || 0;
      const driverFreight = (driverRate * tonnageVal) > 0 ? (driverRate * tonnageVal) : (shipment.driverFreightValue || 0);

      // Identificação de PF (Autônomo/TAC) vs PJ (Empresa/ETC)
      const isExplicitPj = shipment.driverFreightType === 'PJ' || 
        shipment.anttModality === 'ETC' || 
        (shipment as any)?.selectedRegime === 'PJ' || 
        (shipment as any)?.selectedRegime === 'ETC' || 
        (shipment as any)?.selectedRegime === 'Lucro Real / Presumido' || 
        (shipment as any)?.selectedRegime === 'Lucro Real' || 
        (shipment as any)?.selectedRegime === 'Lucro Presumido' || 
        (shipment as any)?.selectedRegime === 'Simples Nacional' || 
        (shipment as any)?.selectedRegime === 'MEI';

      const isShipmentPf = !isExplicitPj && (
        shipment.driverFreightType === 'PF' || 
        shipment.anttModality === 'TAC' || 
        (shipment as any)?.selectedRegime === 'PF' || 
        (shipment as any)?.selectedRegime === 'TAC'
      );
      const isSimplesNacional = Boolean(
        shipment.etcTaxRegime === 'Simples Nacional' ||
        shipment.etcTaxRegime === 'MEI' ||
        (shipment as any)?.selectedRegime === 'Simples Nacional' ||
        (shipment as any)?.selectedRegime === 'MEI' ||
        (shipment as any)?.isSimplesNacional ||
        (cargo as any)?.isSimplesNacional ||
        (shipment.documents as any)?.etc_tax_regime === 'Simples Nacional' ||
        (shipment.documents as any)?.etc_tax_regime === 'MEI' ||
        (shipment.documents as any)?.crt === '1' ||
        (shipment.documents as any)?.crt === '2'
      );

      // Regra de Frete Exportação:
      // - PF (TAC/Autônomo): 6,52834% sobre BC Serviço (Manutenção de Crédito: ICMS 12% * 54,39%)
      // - PJ (Lucro Real / Presumido / Simples Nacional / MEI): 6,5136% sobre BC Crédito (Manutenção de Crédito: ICMS 12% * 54,28%)
      const creditRate = isShipmentPf 
        ? 0.0652834 
        : 0.065136;
      const creditRateLabel = isShipmentPf 
        ? 'PF (6,52834% • Manutenção Crédito)' 
        : 'PJ (6,5136% • Manut. ICMS Exportação)';

      // Exportação (Destino Porto, Terminal Retroportuário, EADI, Armazém Alfandegado, CFOP 6353, CST 40)
      const isExportCargo = cargo?.isExport !== undefined
        ? cargo.isExport
        : ((shipment as any)?.isExport !== undefined
            ? (shipment as any).isExport
            : Boolean(
                (cargo?.observations && /export|cfop\s*6353|cst\s*40/i.test(cargo.observations)) ||
                (cargo?.destination && /(porto|terminal|retroportu[aá]rio|eadi|alfandeg|armaz[eé]m|embarque portu[aá]rio|santos|paranagu[aá]|itaqui|rio grande|barcarena|suape|vit[oó]ria)/i.test(cargo.destination)) ||
                ((shipment as any)?.observations && /export|cfop\s*6353|cst\s*40/i.test((shipment as any).observations)) ||
                ((shipment as any)?.destination && /(porto|terminal|retroportu[aá]rio|eadi|alfandeg|armaz[eé]m|embarque portu[aá]rio|santos|paranagu[aá]|itaqui|rio grande|barcarena|suape|vit[oó]ria)/i.test((shipment as any).destination)) ||
                ((shipment.documents as any)?.cfop === '6353' || (shipment.documents as any)?.cst === '40')
              ));

      if (parsedToll !== undefined && parsedToll > 0) setTollValue(parsedToll);

      const effectiveToll = parsedToll !== undefined && parsedToll > 0 ? parsedToll : Number(tollValue || shipment.tollValue || 0);
      const baseFreteEmpresa = Math.max(0, cteGrossFreight - effectiveToll);
      const baseFreteMotorista = Math.max(0, driverFreight - effectiveToll);

      // Exclusão do ICMS da base do PIS/COFINS
      const icmsPercentage = cargo?.icmsPercentage || (cargo?.hasIcms ? 7 : 0);
      const icmsRate = (cargo?.hasIcms && icmsPercentage > 0) ? (icmsPercentage / 100) : 0;
      const baseFreteEmpresaLiqIcms = Math.max(0, baseFreteEmpresa * (1 - icmsRate));
      const baseFreteMotoristaLiqIcms = Math.max(0, baseFreteMotorista * (1 - icmsRate));
      const spreadLiquidoIcms = Math.max(0, (baseFreteEmpresa - baseFreteMotorista) * (1 - icmsRate));

      const isSuspendedRoute = Boolean(
        /CEL[-_ ]?(337|338|\d+)/i.test(shipment.id || '') ||
        /CEL[-_ ]?(337|338|\d+)/i.test((shipment as any)?.cargoNumber || '')
      );

      const suspMatch = String(cargo?.observations || (shipment as any)?.observations || (shipment as any)?.cargoObservations || (shipment as any)?.cteFiscalInfo || '').match(/(?:impostos?\s+suspensos?|suspens[aã]o(?:\s+tribut[aá]ria)?)\s*:\s*(\d+(?:[.,]\d+)?)\s*%/i);
      const suspensionPercentage = isExportCargo ? 100 : (parsedSuspensionPercent || (suspMatch ? parseFloat(suspMatch[1].replace(',', '.')) : (isSuspendedRoute ? 30 : 0)));
      const tributavelRatio = isExportCargo ? 0 : Math.max(0, (100 - suspensionPercentage) / 100);

      const effectiveDebito = isExportCargo
        ? 0
        : ((parsedFederalTax && parsedFederalTax > 0)
          ? parsedFederalTax
          : ((parsedPis || parsedCofins)
            ? ((parsedPis || 0) + (parsedCofins || 0))
            : Number((baseFreteEmpresaLiqIcms * (suspensionPercentage > 0 ? tributavelRatio : 1) * 0.0925).toFixed(2))));

      // Crédito Gerado apurado sobre o Frete Tributável da Empresa (BC Serviço) em operações de exportação
      const effectiveCredit = isExportCargo
        ? Number((baseFreteEmpresa * creditRate).toFixed(2))
        : 0;

      // Passo 1, 2 & 3: Frete Líquido e Imposto Federal para Mercado Interno
      const icmsBruto = (cargo?.hasIcms && icmsPercentage > 0)
        ? Number((cteGrossFreight * (icmsPercentage / 100)).toFixed(2))
        : 0;
      const freteLiquidoIcms = Math.max(0, cteGrossFreight - icmsBruto);
      const diferencaFreteReais = Math.max(0, freteLiquidoIcms - (shipment.realProfitData?.driverFreight || shipment.driverFreightValue || baseFreteMotorista));

      // Simples Nacional: 3,40% s/ Frete Empresa Bruto | PF: 3,655% s/ Frete Líquido | PJ: 9,25% s/ Spread

      const impostoFederalSimples = Number((cteGrossFreight * 0.0340).toFixed(2));
      const impostoFederalPf = Number((freteLiquidoIcms * 0.03655).toFixed(2));
      const impostoFederalPjSpread = Number((diferencaFreteReais * 0.0925).toFixed(2));

      let impostoFederalMercadoInterno = 0;
      if (isSimplesNacional) {
        impostoFederalMercadoInterno = impostoFederalSimples;
      } else if (isShipmentPf) {
        impostoFederalMercadoInterno = impostoFederalPf;
      } else {
        impostoFederalMercadoInterno = impostoFederalPjSpread;
      }

      const effectiveFederalTax = isExportCargo
        ? 0
        : ((parsedFederalTax && parsedFederalTax > 0)
            ? parsedFederalTax
            : impostoFederalMercadoInterno);

      const federalTaxDesc = isExportCargo
        ? `(Exportação - Crédito ${creditRateLabel}: ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(effectiveCredit)})`
        : isSimplesNacional
          ? '(Simples Nacional: 3,40% s/ Frete Bruto)'
          : isShipmentPf
            ? '(PF: 3,655% s/ Frete Líquido)'
            : `(PJ: 9,25% s/ Spread ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(diferencaFreteReais)})`;

      showToast(`Impostos Federais sincronizados! Imposto Federal Líquido: ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(effectiveFederalTax)} ${federalTaxDesc}`, 'success');
    } catch (err: any) {
      showToast('Erro ao sincronizar impostos federais.', 'error');
    } finally {
      setIsSyncingFederalTaxes(false);
    }
  };

  // AUTO-CALCULATION:
  // Base do Frete = Total Frete Motorista - Valor pago no Tag (Pedágio)
  // Valor pago na Conta = Base do Frete * (% Adiantamento / 100)
  // Valor do Saldo Original = Base do Frete * ((100 - % Adiantamento) / 100)
  useEffect(() => {
    if (shipment.status === ShipmentStatus.AguardandoAdiantamento) {
      const driverFreightRate = shipment.driverFreightRateSnapshot || cargo?.driverFreightValuePerTon || 0;
      const loadedTonnageValue = shipment.shipmentTonnage || 0;
      const totalFreight = shipment.driverFreightValue || (driverFreightRate * loadedTonnageValue);

      const advPercent = advancePercentage !== '' && advancePercentage !== undefined ? Number(advancePercentage) : 70;
      const tagVal = Number(tollValue || 0);
      const isPf = shipment.driverFreightType === 'PF' || shipment.anttModality === 'TAC';

      const calc = calculateAdvanceAndBalance({
        driverFreightValue: totalFreight,
        driverFreightRate: driverFreightRate,
        tonnage: loadedTonnageValue,
        tollValue: tagVal,
        advancePercentage: advPercent,
        driverFreightType: isPf ? 'PF' : 'PJ',
      });

      // Atualiza Valor Pago na Conta (Adiantamento PG segue a Carta Frete quando disponível)
      if (cartaFreteExtractedAdvance !== undefined && cartaFreteExtractedAdvance > 0) {
        if (advanceValue === '' || advanceValue === undefined) {
          setAdvanceValue(cartaFreteExtractedAdvance);
        }
      } else if (Math.abs(calc.advanceInAccountValue - Number(advanceValue || 0)) > 0.001) {
        setAdvanceValue(calc.advanceInAccountValue > 0 ? calc.advanceInAccountValue : 0);
      }
      // Atualiza Saldo
      if (Math.abs(calc.balanceToReceiveValue - Number(balanceToReceiveValue || 0)) > 0.001) {
        setBalanceToReceiveValue(calc.balanceToReceiveValue !== undefined ? calc.balanceToReceiveValue : 0);
      }
    }
  }, [advancePercentage, tollValue, shipment.status, shipment.driverFreightRateSnapshot, shipment.shipmentTonnage, shipment.driverFreightValue, shipment.driverFreightType, shipment.anttModality, cargo?.driverFreightValuePerTon]);

  // AUTO-CALCULATION: Valor Liquido de Saldo = Valor de Saldo a Receber - Valor a Descontar
  useEffect(() => {
    if (shipment.status === ShipmentStatus.AguardandoPagamentoSaldo) {
      const balance = Number(balanceToReceiveValue || 0);
      const discount = isBreakageWaived ? 0 : Number(discountValue || 0);
      const calculatedNet = balance - discount;

      if (Math.abs(Number(calculatedNet.toFixed(2)) - Number(netBalanceValue)) > 0.001) {
        setNetBalanceValue(calculatedNet > 0 ? Number(calculatedNet.toFixed(2)) : 0);
      }
    }
  }, [balanceToReceiveValue, discountValue, isBreakageWaived, shipment.status]);

  const showRouteField = shipment.status === ShipmentStatus.AguardandoCarregamento;
  const isReadOnlyRoute = [
    ShipmentStatus.AguardandoNota,
    ShipmentStatus.AguardandoFiscal,
    ShipmentStatus.AguardandoAdiantamento,
    ShipmentStatus.AguardandoAgendamento,
    ShipmentStatus.AguardandoDescarga,
    ShipmentStatus.ValidacaoTicket,
    ShipmentStatus.AguardandoPagamentoSaldo,
    ShipmentStatus.Finalizado
  ].includes(shipment.status);

  const isAtLeastFiscal = [
    ShipmentStatus.AguardandoFiscal,
    ShipmentStatus.AguardandoAdiantamento,
    ShipmentStatus.AguardandoAgendamento,
    ShipmentStatus.AguardandoDescarga,
    ShipmentStatus.ValidacaoTicket,
    ShipmentStatus.AguardandoPagamentoSaldo,
    ShipmentStatus.Finalizado
  ].includes(shipment.status);

  const handleFetchSuggestions = async () => {
    if (!cargo?.originCoords || !cargo?.destinationCoords) {
      setError('Não foi possível carregar as coordenadas para sugestão.');
      return;
    }

    setIsLoadingSuggestions(true);
    setSuggestions([]);

    try {
      const results = await getRouteSuggestions(cargo.originCoords, cargo.destinationCoords);
      setSuggestions(results);
    } catch (err) {
      console.error('Error fetching suggestions:', err);
      setError('Falha ao obter sugestões. Tente informar manualmente.');
    } finally {
      setIsLoadingSuggestions(false);
    }
  };

  const drawRouteOnMap = async () => {
    if (!mapRef.current || !cargo?.originCoords || !cargo?.destinationCoords) {
      console.warn('Map or coordinates missing for drawing route');
      return;
    }

    const map = mapRef.current;

    // Clear existing markers/layers to avoid duplicates
    map.eachLayer((layer: any) => {
      if (layer instanceof L.Marker || layer instanceof L.Polyline) {
        map.removeLayer(layer);
      }
    });

    const origin: [number, number] = [cargo.originCoords.lat, cargo.originCoords.lng];
    const dest: [number, number] = [cargo.destinationCoords.lat, cargo.destinationCoords.lng];

    const originIcon = L.divIcon({
      html: `<div class="w-8 h-8 flex items-center justify-center bg-emerald-500 rounded-full border-2 border-white shadow-xl text-white transform -translate-y-1 transition-transform hover:scale-110">
                 <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
               </div>`,
      className: 'custom-div-icon',
      iconSize: [32, 32],
      iconAnchor: [16, 32]
    });

    const destIcon = L.divIcon({
      html: `<div class="w-8 h-8 flex items-center justify-center bg-red-500 rounded-full border-2 border-white shadow-xl text-white transform -translate-y-1 transition-transform hover:scale-110">
                 <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
               </div>`,
      className: 'custom-div-icon',
      iconSize: [32, 32],
      iconAnchor: [16, 32]
    });

    L.marker(origin, { icon: originIcon }).addTo(map).bindPopup(`<b>Origem:</b> ${cargo.origin}`);
    L.marker(dest, { icon: destIcon }).addTo(map).bindPopup(`<b>Destino:</b> ${cargo.destination}`);

    // Add a temporary dashed line immediately for instant feedback
    const tempLine = L.polyline([origin, dest], {
      color: '#94a3b8',
      weight: 2,
      opacity: 0.5,
      dashArray: '5, 10'
    }).addTo(map);

    // Initial fit bounds so user sees both markers
    map.fitBounds(tempLine.getBounds(), { padding: [40, 40] });

    try {
      const roadGeometry = await fetchRouteGeometry(cargo.originCoords, cargo.destinationCoords);

      // Remove temp line if it exists
      if (map.hasLayer(tempLine)) map.removeLayer(tempLine);

      if (roadGeometry && roadGeometry.coordinates.length > 0) {
        if (routeLayerRef.current) map.removeLayer(routeLayerRef.current);

        routeLayerRef.current = L.polyline(roadGeometry.coordinates, {
          color: '#2563EB',
          weight: 6,
          opacity: 0.8,
          lineJoin: 'round'
        }).addTo(map);

        map.fitBounds(routeLayerRef.current.getBounds(), { padding: [40, 40] });
      } else {
        // If OSRM fails, keep the dashed line but make it more prominent
        tempLine.setStyle({ color: '#2563EB', weight: 4, opacity: 0.6, dashArray: '10, 10' }).addTo(map);
        console.log('Falling back to straight dashed line');
      }
    } catch (err) {
      console.error('Error in drawRouteOnMap:', err);
      // Fallback already handled by keeping/restyling tempLine
    }
  };

  useEffect(() => {
    if (isOpen && (showRouteField || isReadOnlyRoute) && mapContainerRef.current && !mapRef.current) {
      const map = L.map(mapContainerRef.current, { zoomControl: false }).setView([-15.78, -47.92], 4);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OSM'
      }).addTo(map);
      L.control.zoom({ position: 'topright' }).addTo(map);
      mapRef.current = map;

      drawRouteOnMap();

      setTimeout(() => { map.invalidateSize(); }, 350);
    }

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [isOpen, showRouteField, isReadOnlyRoute, cargo]);

  const handleTraceRoute = async () => {
    if (!cargo?.originCoords || !cargo?.destinationCoords) {
      showToast("Coordenadas de origem ou destino não disponíveis.", 'warning');
      return;
    }
    drawRouteOnMap();
  };

  const handleLinkBranchToCurrentClient = async () => {
    if (!tomadorDivergenceInfo || !currentClient) return;
    setIsResolvingTomador(true);
    try {
      const newBranch: ClientBranchCnpj = {
        id: 'br_' + Date.now(),
        cnpj: tomadorDivergenceInfo.cteTomadorCnpj,
        razaoSocial: tomadorDivergenceInfo.cteTomadorNome || currentClient.razaoSocial,
        nomeFantasia: tomadorDivergenceInfo.cteTomadorNome || currentClient.nomeFantasia,
      };
      const updatedClient: Client = {
        ...currentClient,
        secondaryCnpjs: [...(currentClient.secondaryCnpjs || []), newBranch],
      };
      await upsertClient(updatedClient);
      if (cargo) {
        const updatedCargo: Cargo = {
          ...cargo,
          clientBranchId: newBranch.id,
          clientCnpj: tomadorDivergenceInfo.cteTomadorCnpj,
        };
        await upsertCargo(updatedCargo);
      }
      setTomadorDecision('link_branch');
      showToast(`✓ CNPJ ${tomadorDivergenceInfo.cteTomadorCnpj} vinculado com sucesso como filial de ${currentClient.razaoSocial}!`, 'success');
    } catch (err: any) {
      console.error('[AttachmentModal] Erro ao vincular filial:', err);
      showToast('Erro ao vincular CNPJ como filial: ' + (err?.message || 'Falha ao salvar'), 'error');
    } finally {
      setIsResolvingTomador(false);
    }
  };

  const handleAdjustToCteTomador = async () => {
    if (!tomadorDivergenceInfo || !cargo) return;
    setIsResolvingTomador(true);
    try {
      const cleanCte = tomadorDivergenceInfo.cteCleanCnpj;
      let targetClient = clients?.find(c => (c.cnpj || '').replace(/\D/g, '') === cleanCte);
      let targetBranchId: string | undefined = undefined;

      if (!targetClient) {
        for (const cl of (clients || [])) {
          const br = cl.secondaryCnpjs?.find(b => (b.cnpj || '').replace(/\D/g, '') === cleanCte);
          if (br) {
            targetClient = cl;
            targetBranchId = br.id;
            break;
          }
        }
      }

      if (targetClient) {
        const updatedCargo: Cargo = {
          ...cargo,
          clientId: targetClient.id,
          clientCnpj: tomadorDivergenceInfo.cteTomadorCnpj,
          clientBranchId: targetBranchId,
        };
        await upsertCargo(updatedCargo);
        showToast(`✓ Tomador da carga ajustado para ${targetClient.razaoSocial || targetClient.nomeFantasia}!`, 'success');
      } else {
        const newClient: Client = {
          id: 'cli_' + Date.now(),
          razaoSocial: tomadorDivergenceInfo.cteTomadorNome || 'Tomador CT-e',
          nomeFantasia: tomadorDivergenceInfo.cteTomadorNome || 'Tomador CT-e',
          cnpj: tomadorDivergenceInfo.cteTomadorCnpj,
          phone: '',
          email: '',
          address: '',
          city: '',
          state: '',
          paymentMethod: currentClient?.paymentMethod || PaymentMethod.Boleto,
          paymentTerm: currentClient?.paymentTerm || 30,
          requiresExternalOrder: false,
          requiresScheduling: false,
          secondaryCnpjs: [],
        };
        await upsertClient(newClient);
        const updatedCargo: Cargo = {
          ...cargo,
          clientId: newClient.id,
          clientCnpj: tomadorDivergenceInfo.cteTomadorCnpj,
          clientBranchId: undefined,
        };
        await upsertCargo(updatedCargo);
        showToast(`✓ Novo cliente cadastrado e tomador da carga ajustado para ${newClient.razaoSocial}!`, 'success');
      }
      setTomadorDecision('adjust_to_cte');
    } catch (err: any) {
      console.error('[AttachmentModal] Erro ao ajustar tomador:', err);
      showToast('Erro ao ajustar tomador da carga: ' + (err?.message || 'Falha ao salvar'), 'error');
    } finally {
      setIsResolvingTomador(false);
    }
  };

  const handleCorrectAdvanceToCartaFrete = () => {
    if (!cartaFreteExtractedAdvance) return;
    setAdvanceValue(cartaFreteExtractedAdvance);
    setAdvanceDecision('resolved');
    const loadedTonnageValue = Number(loadedTonnage) || Number(shipment.shipmentTonnage) || 0;
    const driverFreightRate = shipment.driverFreightRateSnapshot || cargo?.driverFreightValuePerTon || 0;
    const totalFreight = shipment.driverFreightValue || (driverFreightRate * loadedTonnageValue);
    const tagVal = Number(tollValue || 0);
    if (totalFreight > 0) {
      const calculatedPct = Number((((cartaFreteExtractedAdvance + tagVal) / totalFreight) * 100).toFixed(2));
      if (calculatedPct > 0 && calculatedPct <= 100) {
        setAdvancePercentage(calculatedPct);
      }
    }
    showToast(`✓ Adiantamento PG corrigido para R$ ${cartaFreteExtractedAdvance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} conforme Carta Frete! Salvar e Avançar liberado.`, 'success');
  };

  const handleSave = async () => {
    if (isDemo) {
      showToast('Usuário em modo demonstração possui acesso apenas de visualização.', 'warning');
      return;
    }
    if (isAguardandoAdiantamento && hasUnresolvedAdvanceDivergence) {
      showToast(`⚠️ Divergência no Adiantamento: "Adiantamento PG" (${formatCurrency(Number(advanceValue) || 0)}) deve ser igual ao "referente Adiantamento de viagem" da Carta Frete (${formatCurrency(cartaFreteExtractedAdvance || 0)}). Corrija o valor para liberar o avanço.`, 'warning');
      setError('Adiantamento PG deve ser igual ao referente Adiantamento de viagem da carta frete antes de salvar e avançar.');
      return;
    }
    let filesToAttach: { [key: string]: File[] } = {};
    if (shipment.status === ShipmentStatus.AguardandoNota || shipment.status === ShipmentStatus.AguardandoFiscal) {
      const someFiles = Object.values(multiFiles).some(arr => Array.isArray(arr) && arr.length > 0);
      if (!someFiles) {
        setError('Anexe pelo menos um documento para avançar.');
        return;
      }
      if (shipment.status === ShipmentStatus.AguardandoNota && !shipment.bankDetails && !bankDetails) {
        setError('Dados bancários são obrigatórios.');
        return;
      }
      if (hasAttachmentMismatch) {
        showToast('⚠️ Corrija os arquivos anexados em campos incorretos (ex: MDF-e em Carta Frete) antes de salvar.', 'error');
        setError('Existem documentos anexados no campo incorreto. Corrija-os clicando em "Mover para ..." ou removendo o anexo.');
        return;
      }
      if (isAguardandoFiscal) {
        if (hasMissingFiscalDocs) {
          const msg = isComplementar
            ? 'Para avançar o embarque complementar, anexe obrigatoriamente o CT-e complementar no campo correspondente.'
            : `Para avançar, anexe obrigatoriamente o CT-e, o MDF-e e a Carta Frete corretos em seus respectivos campos. Documentos pendentes: ${missingFiscalDocs.join(', ')}.`;
          showToast(`⛔ ${msg}`, 'error', 9000);
          setError(msg);
          return;
        }
        if (fiscalAttachmentMismatches.length > 0) {
          const firstErr = fiscalAttachmentMismatches[0];
          showToast(`⛔ ${firstErr.message}`, 'error', 9000);
          setError(firstErr.message);
          return;
        }
        if (hasUnresolvedWeightDivergence) {
          showToast(`⚠️ Divergência de Peso pendente: Confirme se o peso correto é o do Ticket (${weightDivergenceInfo?.ticketTon.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}t) ou do CT-e (${weightDivergenceInfo?.cteTon.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}t) antes de avançar.`, 'warning');
          setError('É obrigatório confirmar qual valor de Toneladas é o correto antes de avançar.');
          return;
        }
        if (hasUnresolvedFreightDivergence) {
          showToast(`⚠️ Divergência de Frete Motorista pendente: Confirme se o valor correto é o do Sistema ou o da Carta Frete antes de avançar.`, 'warning');
          setError('É obrigatório confirmar qual valor de Frete Motorista é o correto antes de avançar.');
          return;
        }
        if (hasUnresolvedCompanyFreightDivergence) {
          showToast(`⚠️ Divergência de Frete Empresa pendente: VALOR TOTAL DO SERVIÇO - CTE (${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(companyFreightDivergenceInfo?.cteServiceTotal || 0)}) precisa ser igual ao Total Frete Emp do sistema (${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(companyFreightDivergenceInfo?.systemCompanyFreight || 0)}). Confirme qual valor deve prevalecer antes de avançar.`, 'warning');
          setError('É obrigatório confirmar qual valor de Frete Empresa é o correto antes de avançar.');
          return;
        }
        if (hasUnresolvedIcmsDivergence) {
          showToast(`⚠️ Divergência de ICMS pendente: Confirme se o valor correto é o do Sistema ou o do CT-e antes de avançar.`, 'warning');
          setError('É obrigatório confirmar qual valor de ICMS é o correto antes de avançar.');
          return;
        }
        if (hasUnresolvedTomadorDivergence) {
          showToast(`⚠️ Divergência de Tomador (Pagador) pendente: Confirme se deseja Ajustar para o Tomador do CT-e (${tomadorDivergenceInfo?.cteTomadorCnpj}) ou Vincular como Filial antes de avançar.`, 'warning');
          setError('É obrigatório confirmar a resolução da divergência de Tomador do CT-e antes de avançar.');
          return;
        }
      } else if (weightDivergenceInfo) {
        const confirmMsg = `⚠️ ATENÇÃO: DIVERGÊNCIA DE PESO DETECTADA!\n\n` +
          `• Peso no Ticket de Carregamento: ${weightDivergenceInfo.ticketWeightTon.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} ton (${(weightDivergenceInfo.ticketWeightTon * 1000).toLocaleString('pt-BR')} kg)\n` +
          `• Peso no CT-e: ${weightDivergenceInfo.cteWeightTon.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} ton (${(weightDivergenceInfo.cteWeightTon * 1000).toLocaleString('pt-BR')} kg)\n` +
          `• Diferença: ${weightDivergenceInfo.diffFormatted} (${weightDivergenceInfo.diffKgFormatted})\n\n` +
          `Deseja prosseguir e salvar mesmo com a divergência de peso informada?`;
        if (!window.confirm(confirmMsg)) {
          return;
        }
      }
      filesToAttach = multiFiles;
    } else {
      const existingDocs = shipment.documents?.[documentName];
      const hasExistingDoc = (Array.isArray(existingDocs) && existingDocs.length > 0) || (typeof existingDocs === 'string' && isActualDocumentUrl(existingDocs));
      const isRiskModal = shipment.status === ShipmentStatus.AguardandoSeguradora;
      const isReprovedGr = isRiskModal && grStatus !== 'aprovado';
      const is100PctSaldo = shipment.status === ShipmentStatus.AguardandoPagamentoSaldo && isShipment100PercentAdvance(shipment);

      if (shipment.status === ShipmentStatus.Finalizado) {
        filesToAttach = singleFiles.length > 0 ? { [documentName || 'Comprovante de Pagamento de Saldo']: singleFiles } : {};
      } else {
        const hasExtraAttached = (multiFiles['CIOT'] && multiFiles['CIOT'].length > 0) || (multiFiles['Ciot'] && multiFiles['Ciot'].length > 0) || (multiFiles['XML do CT-e'] && multiFiles['XML do CT-e'].length > 0);
        
        // Bloqueio rigoroso em Aguardando Adiantamento: obriga anexar ou possuir comprovante
        if (shipment.status === ShipmentStatus.AguardandoAdiantamento) {
          const hasAdvReceipt = singleFiles.length > 0 || hasExistingDoc || Boolean((shipment.documents as any)?.comprovante_adiantamento);
          if (!hasAdvReceipt) {
            setError('Para avançar de Aguardando Adiantamento, anexe obrigatoriamente o Comprovante de Pagamento do Adiantamento.');
            return;
          }
        }

        if (!isReprovedGr && !is100PctSaldo && singleFiles.length === 0 && !hasExistingDoc && !hasExtraAttached) {
          setError('Selecione ao menos um arquivo para anexar.');
          return;
        }
        if (shipment.status === ShipmentStatus.AguardandoCarregamento) {
          if (!route.trim()) {
            setError('A rota do motorista é obrigatória para avançar.');
            return;
          }
          if (!loadedTonnage || Number(loadedTonnage) <= 0) {
            setError('O peso carregado é obrigatório para avançar.');
            return;
          }
          if (!window.confirm(`Confirma o peso carregado de ${loadedTonnage} ton (${formatWeightPtBr(Number(loadedTonnage))}) para este embarque?`)) {
            return;
          }
        }
        if (isRiskModal && requiresRiskManagement && grStatus === 'aprovado') {
          if (!riskReleaseCode.trim()) {
            setError('O Código de Liberação da Seguradora / Gerenciadora é obrigatório para avançar.');
            return;
          }
          if (!riskQueryType) {
            setError('A Modalidade / Tipo de Consulta Realizada é obrigatória para avançar.');
            return;
          }
        }
        if (isRiskModal && (grStatus === 'reprovado' || grStatus === 'reprovado_restrito')) {
          if (!riskQueryType) {
            setError('A Modalidade de Consulta Realizada é obrigatória para registrar os custos da consulta na gerenciadora.');
            return;
          }
        }
        filesToAttach = isReprovedGr ? {} : (singleFiles.length > 0 ? { [documentName]: singleFiles } : {});
      }

      if (multiFiles['CIOT'] && multiFiles['CIOT'].length > 0) {
        filesToAttach['CIOT'] = multiFiles['CIOT'];
      } else if (multiFiles['Ciot'] && multiFiles['Ciot'].length > 0) {
        filesToAttach['Ciot'] = multiFiles['Ciot'];
      } else if (multiFiles['XML do CT-e'] && multiFiles['XML do CT-e'].length > 0) {
        filesToAttach['XML do CT-e'] = multiFiles['XML do CT-e'];
      }
    }

    if (shipment.status === ShipmentStatus.PreCadastro && (!codigoAtua || !codigoAtua.trim())) {
      showToast('O campo CODG. ATUA (Código de Atualização Cadastral) é obrigatório para salvar e avançar o cadastro.', 'warning');
      return;
    }

    if (shipment.status === ShipmentStatus.AguardandoDescarga) {
      if (isComplementar && (!unloadedTonnage || Number(unloadedTonnage) <= 0)) {
        // Herda peso carregado do complementar automaticamente se não alterado
        const defaultWeight = Number(shipment.shipmentTonnage) || Number(loadedTonnage) || 0;
        if (defaultWeight > 0) {
          setUnloadedTonnage(defaultWeight);
        }
      } else if (!unloadedTonnage || Number(unloadedTonnage) <= 0) {
        showToast('O peso descarregado é obrigatório para informar a entrega.', 'warning');
        return;
      }
    }

    if (shipment.status === ShipmentStatus.ValidacaoTicket) {
      if (!canValidateTicket) {
        showToast('A validação de ticket é restrita à equipe interna (Fiscal, Supervisor, Financeiro, Diretor ou Admin).', 'error');
        return;
      }
      if (!isTicketValidated) {
        showToast('É obrigatório validar o ticket e conferir o peso descarregado para prosseguir.', 'warning');
        return;
      }
      if (!unloadedTonnage || Number(unloadedTonnage) <= 0) {
        showToast('O peso descarregado precisa ser informado para validar a descarga.', 'warning');
        return;
      }
    }

    if (shipment.status === ShipmentStatus.AguardandoPagamentoSaldo) {
      const hasQuebra = shipment.unloadedTonnage !== undefined && shipment.shipmentTonnage !== undefined && (shipment.unloadedTonnage - shipment.shipmentTonnage) < -0.001;
      if (hasQuebra && !isBreakageWaived && (!discountValue || Number(discountValue) <= 0)) {
        showToast('Atenção: Quebra de carga detectada. É obrigatório informar o valor do desconto ou marcar a opção de Abonar a Quebra para prosseguir.', 'warning');
        return;
      }
    }

    const matchedOption = riskQueryOptions.find(o => o.name === riskQueryType || o.name.toLowerCase().trim() === riskQueryType?.toLowerCase().trim());
    const calculatedRiskCost = matchedOption ? matchedOption.cost : (riskQueryType ? (RISK_QUERY_COST_MAP[riskQueryType] ?? RISK_QUERY_COST_MAP[riskQueryType.toLowerCase().trim()] ?? 31.50) : undefined);
    const isRiskModal = shipment.status === ShipmentStatus.AguardandoSeguradora;

    if (isAguardandoFiscal && companyFreightDecision === 'use_cte' && companyFreightDivergenceInfo && onUpdateShipmentData) {
      const ton = ticketLoadedWeightTon || Number(loadedTonnage) || Number(shipment.shipmentTonnage) || Number(cargo?.totalVolume) || 1;
      const newCompanyRate = ton > 0 ? Number((companyFreightDivergenceInfo.cteServiceTotal / ton).toFixed(2)) : undefined;
      onUpdateShipmentData(shipment.id, {
        companyFreightRateSnapshot: newCompanyRate,
        realProfitData: {
          ...(shipment.realProfitData || {}),
          companyFreight: companyFreightDivergenceInfo.cteServiceTotal,
        } as any
      }, { silent: true });
    }

    // Validação final de bloqueio caso haja qualquer arquivo duplicado em filesToAttach (ignorado para ticket de descarga)
    for (const [docCategory, files] of Object.entries(filesToAttach)) {
      if (isDischargeTicketCategory(docCategory, shipment?.status)) {
        continue;
      }
      for (const file of files) {
        const dup = checkDuplicateFile(file, docCategory);
        if (dup?.isDuplicate) {
          showToast(`⛔ Bloqueio de Salvamento: O documento "${file.name}" já está ${dup.foundLocation}. Remova o documento duplicado antes de avançar.`, 'error', 8000);
          setError(`Arquivo duplicado detectado: "${file.name}" ${dup.foundLocation}.`);
          return;
        }
      }
    }

    const finalTollToSave = (isAguardandoFiscal && tollDecision === 'use_doc' && tollDivergenceInfo) 
      ? tollDivergenceInfo.docToll 
      : ((docExtractedToll !== undefined && docExtractedToll > 0) ? docExtractedToll : (shipment.status === ShipmentStatus.AguardandoAdiantamento ? Number(tollValue || 0) : effectiveToll));

    const tonToUse = (isAguardandoFiscal && weightDecision === 'use_cte' && weightDivergenceInfo)
      ? weightDivergenceInfo.cteTon
      : (ticketLoadedWeightTon || Number(loadedTonnage) || Number(shipment.shipmentTonnage) || 0);
    const rateToUse = shipment.driverFreightRateSnapshot || cargo?.driverFreightValuePerTon || 0;
    const contractualGrossFreight = (rateToUse > 0 && tonToUse > 0) ? Number((rateToUse * tonToUse).toFixed(2)) : 0;
    const resolvedFreightWithToll = freightDivergenceInfo ? Number((freightDivergenceInfo.cartaFreteFreight + (finalTollToSave || 0)).toFixed(2)) : 0;
    const finalDriverFreightToSave = (isAguardandoFiscal && freightDecision === 'use_carta_frete' && freightDivergenceInfo)
      ? ((contractualGrossFreight > 0 && Math.abs(resolvedFreightWithToll - contractualGrossFreight) <= 2.00)
          ? contractualGrossFreight
          : resolvedFreightWithToll)
      : undefined;

    const resolvedCteCompanyFreight = (isAguardandoFiscal && companyFreightDecision === 'use_cte' && companyFreightDivergenceInfo) 
      ? companyFreightDivergenceInfo.cteServiceTotal 
      : (cteExtractedServiceTotal && cteExtractedServiceTotal > 0 ? cteExtractedServiceTotal : undefined);

    setError('');
    setIsSaving(true);
    try {
      await onSave({
        filesToAttach,
        bankDetails: bankDetails || undefined,
        loadedTonnage: shipment.status === ShipmentStatus.AguardandoCarregamento 
          ? Number(loadedTonnage) 
          : (isAguardandoFiscal && weightDecision === 'use_cte' && weightDivergenceInfo ? weightDivergenceInfo.cteTon : undefined),
        driverFreightValue: finalDriverFreightToSave,
        icmsValue: isCargoWithoutIcms
          ? 0
          : ((isAguardandoFiscal && icmsDecision === 'use_cte' && icmsDivergenceInfo) 
              ? icmsDivergenceInfo.cteIcms 
              : (isAguardandoFiscal && cteExtractedIcms !== undefined && !icmsDivergenceInfo ? cteExtractedIcms : undefined)),
        realProfitData: (resolvedCteCompanyFreight !== undefined) 
          ? ({
              ...(shipment.realProfitData || {}),
              companyFreight: resolvedCteCompanyFreight,
              ...(isCargoWithoutIcms ? { isIcmsExempt: true, icmsDifference: 0 } : (icmsDecision === 'use_cte' && icmsDivergenceInfo ? { icmsDifference: icmsDivergenceInfo.cteIcms } : {})),
            } as any)
          : (isCargoWithoutIcms
              ? ({ ...(shipment.realProfitData || {}), isIcmsExempt: true, icmsDifference: 0 } as any)
              : (icmsDecision === 'use_cte' && icmsDivergenceInfo ? ({ ...(shipment.realProfitData || {}), icmsDifference: icmsDivergenceInfo.cteIcms } as any) : undefined)),
        advancePercentage: (shipment.status === ShipmentStatus.AguardandoAdiantamento || shipment.status === ShipmentStatus.AguardandoFiscal) && advancePercentage !== '' && advancePercentage !== undefined ? Number(advancePercentage) : undefined,
        advanceValue: (shipment.status === ShipmentStatus.AguardandoAdiantamento || shipment.status === ShipmentStatus.AguardandoFiscal) && advanceValue !== '' && advanceValue !== undefined ? Number(advanceValue) : undefined,
        tollValue: (isAguardandoFiscal && tollDecision === 'use_doc' && tollDivergenceInfo) 
          ? tollDivergenceInfo.docToll 
          : (shipment.status === ShipmentStatus.AguardandoAdiantamento ? Number(tollValue || 0) : undefined),
        balanceToReceiveValue: shipment.status === ShipmentStatus.AguardandoPagamentoSaldo ? Number(balanceToReceiveValue) : undefined,
        discountValue: shipment.status === ShipmentStatus.AguardandoPagamentoSaldo ? (isBreakageWaived ? 0 : (discountValue === '' ? undefined : Number(discountValue))) : undefined,
        isBreakageWaived: shipment.status === ShipmentStatus.AguardandoPagamentoSaldo ? isBreakageWaived : undefined,
        netBalanceValue: shipment.status === ShipmentStatus.AguardandoPagamentoSaldo ? Number(netBalanceValue) : undefined,
        unloadedTonnage: (shipment.status === ShipmentStatus.AguardandoDescarga || shipment.status === ShipmentStatus.ValidacaoTicket) ? Number(unloadedTonnage) : undefined,
        route: route ? route : undefined,
        grStatus: isRiskModal ? grStatus : undefined,
        riskReleaseCode: (isRiskModal && grStatus === 'aprovado') ? riskReleaseCode : undefined,
        riskQueryType: isRiskModal ? (riskQueryType || undefined) : undefined,
        riskQueryCost: isRiskModal ? (calculatedRiskCost !== undefined ? calculatedRiskCost : (riskQueryType ? 31.50 : undefined)) : undefined,
        codigoAtua: codigoAtua ? codigoAtua.trim() : undefined,
      });
    } catch (err: any) {
      console.error('Error in handleSave:', err);
      setError(err?.message || 'Ocorreu um erro ao salvar o embarque. Verifique os dados e tente novamente.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleClose = () => { onClose(); }

  if (!isOpen) return null;

  const isClientUser = currentUser.profile === UserProfile.Cliente;

  const isValidDocumentEntry = (key: string, value: any): boolean => {
    if (!key || isDocumentMetadataKey(key)) return false;
    if (Array.isArray(value)) {
      return value.length > 0 && value.some(v => isActualDocumentUrl(v));
    }
    if (typeof value === 'string') {
      return isActualDocumentUrl(value);
    }
    return false;
  };

  const rawDocEntries = Object.entries(shipment.documents || {}).filter(([key, val]) => isValidDocumentEntry(key, val));

  const documentsToShow = isClientUser
    ? rawDocEntries.filter(([docType]) => 
        allowedDocsForClient.includes(docType) && 
        docType.toLowerCase().trim() !== 'carta frete' && 
        !docType.toLowerCase().includes('carta frete')
      )
    : rawDocEntries;

  const requiresBankDetails = shipment.status === ShipmentStatus.AguardandoNota && !shipment.bankDetails;
  const creationDocuments = documentsToShow.filter(([docType]) => docType === 'Arquivos Iniciais');
  const statusDocuments = documentsToShow.filter(([docType]) => docType !== 'Arquivos Iniciais');

  const renderDocumentList = (docs: [string, any][]) => {
    const validDocs = docs.filter(([key, files]) => {
      if (!isValidDocumentEntry(key, files)) return false;
      const fileList = Array.isArray(files) ? files : (typeof files === 'string' ? [files] : []);
      return fileList.some(f => isActualDocumentUrl(f));
    });

    if (validDocs.length === 0) {
      return (
        <p className="text-xs text-gray-400 dark:text-gray-500 italic py-1">Nenhum documento anexado nesta seção.</p>
      );
    }

    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {validDocs.map(([docType, files]) => {
          const rawList = (Array.isArray(files) ? files : (typeof files === 'string' ? [files] : [])).filter(f => isActualDocumentUrl(f));
          const fileList = Array.from(new Set(rawList));
          if (fileList.length === 0) return null;

          return (
            <div key={docType} className="p-3 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200/90 dark:border-slate-700/80 flex flex-col justify-between gap-2 shadow-2xs hover:border-indigo-300 dark:hover:border-indigo-700/60 transition-all">
              <div className="flex items-center justify-between gap-1.5 min-w-0">
                <div className="flex items-center gap-1.5 min-w-0 truncate">
                  <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0"></span>
                  <span className="font-bold text-xs text-slate-700 dark:text-slate-200 truncate" title={docType}>
                    {docType}:
                  </span>
                </div>
                {fileList.length > 1 && (
                  <span className="text-[10px] font-bold px-1.5 py-0.2 bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 rounded border border-blue-200 dark:border-blue-800 shrink-0">
                    {fileList.length} arquivos
                  </span>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                {fileList.map((file, index) => {
                  const fileName = typeof file === 'string' ? (file.split('/').pop()?.split('?')[0] || '') : '';
                  const rawDecoded = decodeURIComponent(fileName);
                  const cleanFileName = rawDecoded.includes('_') ? rawDecoded.split('_').slice(2).join('_') || rawDecoded : (rawDecoded || `Anexo ${index + 1}`);

                  const extMatch = cleanFileName.match(/\.([a-zA-Z0-9]+)$/i) || fileName.match(/\.([a-zA-Z0-9]+)$/i);
                  const ext = extMatch ? extMatch[1].toUpperCase() : '';

                  let badgeColor = 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300 border-gray-300';
                  if (ext === 'XML') badgeColor = 'bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300 border-amber-300 dark:border-amber-700';
                  else if (ext === 'PDF') badgeColor = 'bg-rose-100 text-rose-800 dark:bg-rose-950/70 dark:text-rose-300 border-rose-300 dark:border-rose-700';
                  else if (['PNG', 'JPG', 'JPEG', 'WEBP'].includes(ext)) badgeColor = 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700';

                  const isCteDoc = isCteDocType(docType);
                  const cancelledList: CancelledCteRecord[] = Array.isArray(shipment.documents?.cancelled_ctes)
                    ? shipment.documents.cancelled_ctes
                    : [];

                  const cancelledRecord = isCteDoc ? cancelledList.find(c => {
                    if (!c) return false;
                    if (c.fileUrl && (c.fileUrl === file || file.includes(c.fileUrl) || c.fileUrl.includes(file))) return true;
                    if (c.fileName && fileName && (c.fileName === fileName || fileName.includes(c.fileName))) return true;
                    if (c.cteNumber && cleanFileName && cleanFileName.includes(c.cteNumber)) return true;
                    return false;
                  }) : undefined;

                  const isCancelled = Boolean(cancelledRecord);

                  return (
                    <div
                      key={index}
                      className={`inline-flex items-center gap-1.5 p-1 rounded-lg border shadow-2xs transition-all w-full justify-between ${
                        isCancelled
                          ? 'bg-rose-50/70 dark:bg-rose-950/20 border-rose-300 dark:border-rose-800/80 hover:border-rose-400'
                          : 'bg-white dark:bg-slate-800 border-indigo-200/80 dark:border-indigo-800/60 hover:border-indigo-300 dark:hover:border-indigo-600'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => openDocumentInNewTab(file, `${docType} - ${cleanFileName}`)}
                        className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-semibold transition-colors cursor-pointer truncate min-w-0 flex-1 ${
                          isCancelled
                            ? 'text-rose-800 dark:text-rose-300 hover:text-rose-950 dark:hover:text-rose-100 line-through opacity-80'
                            : 'text-indigo-700 dark:text-indigo-300 hover:text-indigo-900 dark:hover:text-indigo-100'
                        }`}
                        title={
                          isCancelled
                            ? `[CT-e Cancelado] Motivo: ${cancelledRecord?.reason || 'Substituição'} (Substituído por CT-e ${cancelledRecord?.substituteCteNumber || 'novo'})`
                            : `Visualizar ${cleanFileName} (com opções de Baixar e Imprimir)`
                        }
                      >
                        <PaperclipIcon className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">{cleanFileName || 'Visualizar Anexo'}</span>
                        {ext && (
                          <span className={`text-[9px] font-black px-1.5 py-0.5 rounded border uppercase shrink-0 ${badgeColor}`}>
                            {ext}
                          </span>
                        )}
                        {isCancelled ? (
                          <span 
                            className="text-[9px] font-black px-1.5 py-0.5 rounded border uppercase shrink-0 bg-rose-600 text-white border-rose-700 shadow-2xs"
                            title={`Cancelado em ${cancelledRecord?.cancelledAt ? new Date(cancelledRecord.cancelledAt).toLocaleDateString() : ''} por ${cancelledRecord?.cancelledBy || 'Usuário'}`}
                          >
                            CANCELADO
                          </span>
                        ) : (
                          isCteDoc && cancelledList.length > 0 && (
                            <span 
                              className="text-[9px] font-black px-1.5 py-0.5 rounded border uppercase shrink-0 bg-emerald-600 text-white border-emerald-700 shadow-2xs"
                              title="CT-e Ativo em substituição"
                            >
                              ATIVO
                            </span>
                          )
                        )}
                      </button>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => setSelectedDocForDetails({
                            fileOrUrl: file,
                            docType,
                            docName: cleanFileName
                          })}
                          className="inline-flex items-center gap-1 px-2 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-md text-[10px] font-bold transition-all shadow-xs cursor-pointer shrink-0"
                          title="Ver todos os campos e dados extraídos deste documento"
                        >
                          <Eye className="w-3 h-3" />
                          <span>Ver Dados</span>
                        </button>

                        {/* Botão de Cancelar e Adicionar Substituto (Apenas para CT-e ativo) */}
                        {isCteDoc && !isCancelled && !isDemo && (
                          <button
                            type="button"
                            onClick={() => {
                              const cleanCte = String(shipment.cteNumber || '').split('/').pop()?.trim() || cleanFileName;
                              setCteToCancel({
                                cteNumber: cleanCte,
                                fileUrl: file,
                                fileName: cleanFileName
                              });
                            }}
                            className="inline-flex items-center gap-1 px-2 py-1 bg-amber-500 hover:bg-amber-600 active:scale-95 text-white rounded-md text-[10px] font-extrabold transition-all shadow-xs cursor-pointer shrink-0"
                            title="Cancelar este CT-e e vincular um novo CT-e em substituição (mantendo histórico 2211/2233)"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>Substituir</span>
                          </button>
                        )}

                        {/* CT-e cancelado NÃO pode ser excluído do sistema (regra explícita) */}
                        {!isCancelled && onDeleteAttachment && !isDemo && (
                          isDeveloperUser(currentUser) ||
                          currentUser?.profile === UserProfile.Desenvolvedor ||
                          currentUser?.profile === UserProfile.Admin ||
                          currentUser?.profile === UserProfile.Diretor ||
                          currentUser?.profile === UserProfile.Supervisor ||
                          currentUser?.profile === UserProfile.Fiscal ||
                          currentUser?.profile === UserProfile.Embarcador
                        ) && (
                          <button
                            type="button"
                            onClick={async () => {
                              if (window.confirm(`Tem certeza que deseja excluir o anexo "${cleanFileName}" (${docType})?`)) {
                                await onDeleteAttachment(shipment.id, file);
                              }
                            }}
                            className="inline-flex items-center p-1 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/40 rounded transition-colors cursor-pointer shrink-0"
                            title="Excluir Anexo"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);

  const productName = products?.find(p => p.id === cargo?.productId)?.name || cargo?.productId || 'Não especificado';
  const clientName = clients?.find(c => c.id === cargo?.clientId)?.razaoSocial || clients?.find(c => c.id === cargo?.clientId)?.nomeFantasia || cargo?.clientId || 'Não especificado';
  const embarcadorUser = users?.find(u => u.id === shipment.embarcadorId);
  const embarcadorName = embarcadorUser?.name || shipment.embarcadorId || 'Não especificado';

  const canViewCompanyFreight = currentUser.profile !== UserProfile.Motorista && currentUser.profile !== UserProfile.Embarcador;
  const driverRate = shipment.driverFreightRateSnapshot || cargo?.driverFreightValuePerTon || 0;
  const companyRate = shipment.companyFreightRateSnapshot || cargo?.companyFreightValuePerTon || 0;
  const effectiveToll = tollValue !== '' && tollValue !== undefined
    ? Number(tollValue)
    : (shipment.tollValue || Number((shipment.documents as any)?.valor_pedagio || (shipment.documents as any)?.toll_value || 0));

  const ton = Number(shipment.shipmentTonnage) || 0;
  const calculatedDriverFreight = (driverRate > 0 && ton > 0) ? Number((driverRate * ton).toFixed(2)) : 0;
  const totalDriverFreight = (calculatedDriverFreight > 0 && shipment.driverFreightValue && Math.abs(Number(shipment.driverFreightValue) - calculatedDriverFreight) > 5.00 && shipment.driverFreightRateSnapshot)
    ? calculatedDriverFreight
    : (Number(shipment.driverFreightValue) || calculatedDriverFreight);
  const driverFreightNetOfToll = Math.max(0, totalDriverFreight - effectiveToll);
  const calculatedCompanyFreight = (companyRate > 0 && ton > 0) ? Number((companyRate * ton).toFixed(2)) : 0;
  const totalCompanyFreight = (calculatedCompanyFreight > 0 && shipment.realProfitData?.companyFreight && Math.abs(shipment.realProfitData.companyFreight - calculatedCompanyFreight) > 5.00 && (shipment.companyFreightRateSnapshot || cargo?.companyFreightValuePerTon))
    ? calculatedCompanyFreight
    : (shipment.realProfitData?.companyFreight !== undefined && shipment.realProfitData.companyFreight > 0
        ? shipment.realProfitData.companyFreight
        : calculatedCompanyFreight);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-6 sm:p-8 max-w-7xl w-full max-h-[95vh] overflow-y-auto text-gray-800 dark:text-gray-200 relative border border-gray-100 dark:border-gray-700">
        <button
          onClick={onClose}
          className="absolute top-6 right-6 p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors z-10"
          title="Fechar"
        >
          <X className="w-6 h-6" />
        </button>

        {/* Dashboard de Informações Otimizadas do Embarque */}
        <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white rounded-2xl p-5 shadow-xl mb-6 border border-slate-700/80 relative overflow-hidden">
          {/* Cabecalho Principal */}
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 mb-4 border-b border-slate-700/80">
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <div className="p-2 bg-blue-500/20 rounded-xl border border-blue-400/30 text-blue-400">
                <Package className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-xl font-extrabold text-white tracking-tight flex items-center gap-2">
                  Gerenciar Anexos
                </h2>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <span className="font-mono text-xs font-bold text-blue-400 bg-blue-950/60 px-2 py-0.5 rounded border border-blue-800/50">
                    {shipment.id}
                  </span>
                  {cargo?.sequenceId && (
                    <span className="text-xs font-bold text-slate-300 bg-slate-800 px-2 py-0.5 rounded border border-slate-700">
                      Carga #{cargo.sequenceId}
                    </span>
                  )}
                  {cargo?.tmsLoteNumber && (
                    <span className="text-xs font-bold text-emerald-300 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-700/60 flex items-center gap-1" title={`Lote TMS: ${cargo.tmsLoteNumber}`}>
                      <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded bg-emerald-600 text-white font-bold text-[9px]">✓</span>
                      Lote TMS: {cargo.tmsLoteNumber}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 pr-8">
              <span className="text-xs text-slate-400 font-medium">Status:</span>
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shadow-sm">
                {shipment.status}
              </span>
            </div>
          </div>

          {/* Grid de Informacoes Chave */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5 text-xs">
            {/* Produto */}
            <div className="bg-slate-800/90 p-2.5 rounded-xl border border-slate-700/70">
              <div className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1 mb-1">
                <Box className="w-3.5 h-3.5 text-amber-400" /> Produto
              </div>
              <div className="font-bold text-white text-xs truncate" title={productName}>
                {productName}
              </div>
            </div>

            {/* Frete Motorista / ton */}
            {!isClientUser && (
              <div className="bg-slate-800/90 p-2.5 rounded-xl border border-slate-700/70">
                <div className="text-[10px] uppercase font-bold text-slate-400 flex items-center justify-between gap-1 mb-1">
                  <span className="flex items-center gap-1">
                    <DollarSign className="w-3.5 h-3.5 text-emerald-400" /> Frete Mtr / ton
                  </span>
                  <span className={`px-1.5 py-0.2 rounded text-[9px] font-extrabold uppercase ${shipment.driverFreightType === 'PF'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                      : 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40'
                    }`}>
                    {shipment.driverFreightType || 'PJ'}
                  </span>
                </div>
                <div className="font-black text-emerald-400 text-xs flex items-baseline gap-1.5">
                  <span>{formatCurrency(driverRate)}</span>
                  <span className={`text-[10px] font-bold ${shipment.driverFreightType === 'PF' ? 'text-amber-400' : 'text-indigo-300'
                    }`}>
                    ({shipment.driverFreightType || 'PJ'})
                  </span>
                </div>
              </div>
            )}

            {/* Total Frete Motorista (Abatendo Pedágio) */}
            {!isClientUser && (
              <div className="bg-slate-800/90 p-2.5 rounded-xl border border-slate-700/70">
                <div className="text-[10px] uppercase font-bold text-slate-400 flex items-center justify-between gap-1 mb-1">
                  <span className="flex items-center gap-1">
                    <DollarSign className="w-3.5 h-3.5 text-emerald-400" /> Total Frete Mtr
                  </span>
                  {effectiveToll > 0 && (
                    <span className="text-[9px] font-bold text-amber-300 bg-amber-500/20 px-1 py-0.2 rounded border border-amber-500/40" title={`Pedágio abatido: ${formatCurrency(effectiveToll)}`}>
                      - Pedágio
                    </span>
                  )}
                </div>
                <div className="font-black text-white text-xs">
                  {formatCurrency(driverFreightNetOfToll)}
                </div>
                {effectiveToll > 0 && (
                  <div className="text-[10px] text-slate-400 mt-0.5 truncate" title={`Bruto: ${formatCurrency(totalDriverFreight)} | Pedágio Abatido: ${formatCurrency(effectiveToll)}`}>
                    <span className="text-slate-500 line-through mr-1">{formatCurrency(totalDriverFreight)}</span>
                    <span className="text-amber-400/90 font-medium">(-{formatCurrency(effectiveToll)})</span>
                  </div>
                )}
              </div>
            )}

            {/* Frete Empresa / ton */}
            {canViewCompanyFreight && (
              <div className="bg-slate-800/90 p-2.5 rounded-xl border border-slate-700/70">
                <div className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1 mb-1">
                  <DollarSign className="w-3.5 h-3.5 text-blue-400" /> Frete Emp / ton
                </div>
                <div className="font-bold text-blue-300 text-xs">
                  {formatCurrency(companyRate)}
                </div>
              </div>
            )}

            {/* Tonelagem */}
            <div className="bg-slate-800/90 p-2.5 rounded-xl border border-slate-700/70">
              <div className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1 mb-1">
                <Scale className="w-3.5 h-3.5 text-cyan-400" /> Peso (Ton)
              </div>
              <div className="font-bold text-white text-xs">
                {shipment.shipmentTonnage ? `${shipment.shipmentTonnage} t` : 'Aguardando'}
                {shipment.unloadedTonnage ? ` (${shipment.unloadedTonnage} t desc.)` : ''}
              </div>
            </div>

            {/* Motorista & Placa */}
            <div className="bg-slate-800/90 p-2.5 rounded-xl border border-slate-700/70 col-span-2 sm:col-span-1">
              <div className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1 mb-1">
                <UserIcon className="w-3.5 h-3.5 text-purple-400" /> Motorista / Placa
              </div>
              <div className="font-bold text-white text-xs truncate" title={shipment.driverName}>
                {shipment.driverName}
              </div>
              <div className="text-[11px] font-mono text-slate-400">
                {shipment.horsePlate}
              </div>
            </div>

            {/* Rota (Origem → Destino) */}
            <div className={`bg-slate-800/90 p-2.5 rounded-xl border border-slate-700/70 col-span-2 sm:col-span-3 ${canViewCompanyFreight ? 'lg:col-span-2' : 'lg:col-span-3'}`}>
              <div className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1 mb-1">
                <MapPin className="w-3.5 h-3.5 text-rose-400" /> Rota (Origem → Destino)
              </div>
              <div className="font-medium text-white text-xs truncate" title={`${cargo?.origin || 'N/I'} → ${cargo?.destination || 'N/I'}`}>
                <span className="font-bold text-slate-200">{cargo?.origin || 'N/I'}</span>
                <span className="mx-1.5 text-slate-500">→</span>
                <span className="font-bold text-slate-200">{cargo?.destination || 'N/I'}</span>
              </div>
            </div>

            {/* Solicitante / Cliente */}
            <div className={`bg-slate-800/90 p-2.5 rounded-xl border border-slate-700/70 col-span-2 sm:col-span-3 ${canViewCompanyFreight ? 'lg:col-span-2' : 'lg:col-span-3'}`}>
              <div className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1 mb-1">
                <Building className="w-3.5 h-3.5 text-indigo-400" /> Solicitante / Cliente
              </div>
              <div className="font-bold text-white text-xs truncate" title={`Sol.: ${embarcadorName} | Cliente: ${clientName}`}>
                <span className="text-slate-300">Sol.:</span> {embarcadorName} | <span className="text-slate-300">Cli.:</span> {clientName}
              </div>
            </div>

            {/* Total Frete Empresa */}
            {canViewCompanyFreight && (
              <div className="bg-slate-800/90 p-2.5 rounded-xl border border-slate-700/70 col-span-2 sm:col-span-3 lg:col-span-2">
                <div className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1 mb-1">
                  <DollarSign className="w-3.5 h-3.5 text-blue-400" /> Total Frete Emp
                </div>
                <div className="font-black text-white text-xs">
                  {formatCurrency(totalCompanyFreight)}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Card de Informações Financeiras & Pagamento */}
        {!isClientUser && (
          <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-900/50 rounded-xl border border-gray-200 dark:border-gray-700 grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div>
              <span className="text-gray-500 dark:text-gray-400 font-medium block mb-0.5">Forma de Pagamento:</span>
              <span className="font-bold text-gray-800 dark:text-gray-200 text-sm">
                {shipment.paymentMethod || 'PIX - E-FRETE'}
              </span>
            </div>
            <div>
              <span className="text-gray-500 dark:text-gray-400 font-medium block mb-0.5">Porcentagem de Adiantamento:</span>
              <span className="font-bold text-emerald-600 dark:text-emerald-400 text-sm">
                {shipment.advancePercentage !== undefined ? shipment.advancePercentage : 70}%
              </span>
            </div>
            <div>
              <span className="text-gray-500 dark:text-gray-400 font-medium block mb-0.5">
                {shipment.paymentMethod === 'DEPOSITO EM CONTA' ? 'Dados Bancários:' : 'Chave Pix / Dados:'}
              </span>
              <span className="font-semibold text-gray-800 dark:text-gray-200 truncate block">
                {shipment.paymentMethod === 'DEPOSITO EM CONTA' ? (shipment.bankDetails || 'Não informados') : (shipment.pixKey || shipment.bankDetails || 'Não informada')}
              </span>
            </div>
          </div>
        )}

        {/* Linha do Tempo das Etapas do Embarque no Topo da Janela (Oculto para Cliente) */}
        {!isClientUser && (
          <div className="mb-6">
            <ShipmentStagesTimeline
              shipment={shipment}
              cargo={cargo}
              users={users}
              products={products}
              clients={clients}
              riskQueryOptions={riskQueryOptions}
              currentUser={currentUser}
              onInspectFile={(fileOrUrl, docType, docName) => setSelectedDocForDetails({ fileOrUrl, docType, docName })}
            />
          </div>
        )}

        {/* Alerta de Divergência de Tomador fora da etapa Aguardando Fiscal */}
        {!isAguardandoFiscal && !isClientUser && tomadorDivergenceInfo && (
          <div className={`mb-6 p-4 rounded-xl border-2 transition-all ${
            tomadorDecision === 'unresolved'
              ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-400 dark:border-amber-600 shadow-sm'
              : 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-400 dark:border-emerald-600'
          }`}>
            <div className="flex items-start gap-3">
              <div className={`p-2 rounded-lg shrink-0 ${
                tomadorDecision === 'unresolved'
                  ? 'bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300'
                  : 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300'
              }`}>
                {tomadorDecision === 'unresolved' ? <AlertTriangle className="w-5 h-5" /> : <CheckCircle2 className="w-5 h-5" />}
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <h4 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
                    🏢 Validação de Tomador (Pagador): Carga vs CT-e
                  </h4>
                  <span className="text-xs px-2.5 py-0.5 bg-amber-200 dark:bg-amber-900 text-amber-900 dark:text-amber-100 rounded-full font-bold">
                    CNPJ Divergente
                  </span>
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">
                  O CPF ou CNPJ do Tomador (Pagador) da carga não confere com o Tomador informado no CT-e do embarque:
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3 text-xs">
                  <div className="bg-white dark:bg-gray-800 p-2.5 rounded-lg border border-gray-200 dark:border-gray-700">
                    <span className="text-gray-500 dark:text-gray-400 block font-medium">Tomador no Cadastro da Carga:</span>
                    <div className="font-bold text-gray-900 dark:text-white mt-0.5 truncate">
                      {tomadorDivergenceInfo.systemClientName}
                    </div>
                    <div className="text-xs font-mono text-gray-600 dark:text-gray-300 mt-0.5">
                      CNPJ/CPF: {tomadorDivergenceInfo.systemCnpj}
                    </div>
                  </div>
                  <div className="bg-white dark:bg-gray-800 p-2.5 rounded-lg border border-gray-200 dark:border-gray-700">
                    <span className="text-gray-500 dark:text-gray-400 block font-medium">Tomador Lido no CT-e:</span>
                    <div className="font-bold text-indigo-700 dark:text-indigo-400 mt-0.5 truncate">
                      {tomadorDivergenceInfo.cteTomadorNome}
                    </div>
                    <div className="text-xs font-mono text-indigo-600 dark:text-indigo-300 mt-0.5">
                      CNPJ/CPF: {tomadorDivergenceInfo.cteTomadorCnpj}
                    </div>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={isResolvingTomador}
                    onClick={handleAdjustToCteTomador}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 ${
                      tomadorDecision === 'adjust_to_cte'
                        ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30 ring-2 ring-emerald-500'
                        : 'bg-white dark:bg-gray-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700'
                    }`}
                  >
                    <Check className="w-4 h-4" />
                    <span>{isResolvingTomador ? 'Ajustando...' : '✓ Ajustar para Tomador do CT-e'}</span>
                  </button>
                  <button
                    type="button"
                    disabled={isResolvingTomador}
                    onClick={handleLinkBranchToCurrentClient}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 ${
                      tomadorDecision === 'link_branch'
                        ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30 ring-2 ring-blue-500'
                        : 'bg-white dark:bg-gray-800 hover:bg-blue-50 dark:hover:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-300 dark:border-blue-700'
                    }`}
                  >
                    <Building className="w-4 h-4" />
                    <span>{isResolvingTomador ? 'Vinculando...' : '✓ Vincular como Filial do Tomador'}</span>
                  </button>
                  <button
                    type="button"
                    disabled={isResolvingTomador}
                    onClick={() => {
                      setTomadorDecision('keep_system');
                      showToast(`✓ Confirmado: Mantido o tomador do cadastro da carga (${tomadorDivergenceInfo.systemClientName}).`, 'info');
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 ${
                      tomadorDecision === 'keep_system'
                        ? 'bg-gray-700 text-white shadow-md ring-2 ring-gray-600'
                        : 'bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-600'
                    }`}
                  >
                    <span>Manter Tomador da Carga</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Documentos Consolidados & Painel de Automação de Custos */}
        <>
            {/* Bloco 1: Documentos Anexados (Linha Horizontal) */}
            <div className="mb-6 border rounded-xl dark:border-gray-600 overflow-hidden bg-white dark:bg-gray-800 shadow-sm">
              <div className="bg-gray-100 dark:bg-gray-700 px-4 py-3 border-b dark:border-gray-600 font-bold text-gray-800 dark:text-gray-100 flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-blue-500" />
                  Documentos Anexados
                </span>
                <span className="text-xs font-normal text-gray-500 dark:text-gray-400">
                  {documentsToShow.length} {documentsToShow.length === 1 ? 'categoria' : 'categorias'}
                </span>
              </div>
              <div className="p-4 space-y-4">
                {creationDocuments.length > 0 && (
                  <div>
                    <h4 className="font-semibold text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 border-b pb-1">
                      Arquivos Iniciais
                    </h4>
                    {renderDocumentList(creationDocuments)}
                  </div>
                )}
                <div>
                  <h4 className="font-semibold text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 border-b pb-1">
                    Troca de Status
                  </h4>
                  {statusDocuments.length > 0 ? renderDocumentList(statusDocuments) : <p className="text-sm italic text-gray-400">Nenhum documento anexado.</p>}
                </div>
              </div>
            </div>

            {/* Bloco 2: Automatização do CT-e Custos & Margem (Embaixo) - Oculto para Embarcador, Agenciador e Cliente */}
            {currentUser?.profile !== UserProfile.Embarcador && 
             currentUser?.profile !== UserProfile.Agenciador && 
             currentUser?.profile !== UserProfile.Cliente &&
             (currentUser?.profile as string) !== 'Embarcador' && 
             (currentUser?.profile as string) !== 'Agenciador' && 
             (currentUser?.profile as string) !== 'Cliente' && (
              <div className="mb-6">
                <CteCostAutomationPanel
                  shipment={shipment}
                  cargo={cargo}
                  tollValue={tollValue}
                  loadedTonnage={loadedTonnage}
                  riskQueryType={riskQueryType}
                  riskReleaseCode={riskReleaseCode}
                  users={users}
                  clients={clients}
                  currentUser={currentUser}
                  onUpdateShipmentData={onUpdateShipmentData}
                />
              </div>
            )}

            {/* Números de Documentos Fiscais Extraídos */}
            {(shipment.cteNumber || shipment.nfeNumber || shipment.mdfeNumber) && (
              <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-xl">
                <p className="text-xs font-bold text-blue-700 dark:text-blue-300 uppercase tracking-wide mb-2">📄 Números de Documentos Fiscais</p>
                <div className="flex flex-wrap gap-2">
                  {(shipment.cteNumber && isCteApplicableForStatus(shipment.status)) && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-100 dark:bg-blue-900/50 border border-blue-300 dark:border-blue-700 text-blue-800 dark:text-blue-200 rounded-full text-xs font-semibold">
                      <span className="w-2 h-2 rounded-full bg-blue-500 inline-block"></span>
                      CT-e nº {shipment.cteNumber} {shipment.cteEmissionDate ? `(${shipment.cteEmissionDate})` : ''}
                    </span>
                  )}
                  {shipment.nfeNumber && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-100 dark:bg-emerald-900/50 border border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-200 rounded-full text-xs font-semibold">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>
                      NF-e nº {shipment.nfeNumber}
                    </span>
                  )}
                  {shipment.mdfeNumber && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-violet-100 dark:bg-violet-900/50 border border-violet-300 dark:border-violet-700 text-violet-800 dark:text-violet-200 rounded-full text-xs font-semibold">
                      <span className="w-2 h-2 rounded-full bg-violet-500 inline-block"></span>
                      MDF-e nº {shipment.mdfeNumber}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Alerta de Divergência de Peso (Ticket vs CT-e) */}
            {weightDivergenceInfo && (
              <div className="mb-4 p-4 bg-amber-50 dark:bg-amber-950/40 border-2 border-amber-400 dark:border-amber-600 rounded-xl shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-amber-100 dark:bg-amber-900/60 rounded-lg text-amber-600 dark:text-amber-400 shrink-0">
                    <AlertTriangle className="w-6 h-6" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <h4 className="text-sm font-bold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                        ⚠️ Atenção: Divergência de Peso Detectada!
                      </h4>
                      <span className="text-xs px-2.5 py-0.5 bg-amber-200 dark:bg-amber-900 text-amber-900 dark:text-amber-100 rounded-full font-bold">
                        Diferença: {weightDivergenceInfo.diffFormatted} ({weightDivergenceInfo.diffKgFormatted})
                      </span>
                    </div>
                    <p className="text-xs text-amber-800 dark:text-amber-300 mt-1">
                      O peso registrado no <strong>Passo: Ticket de Carregamento</strong> difere do peso constante no <strong>CT-e</strong>:
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2.5 text-xs">
                      <div className="bg-white/90 dark:bg-gray-800/90 p-2.5 rounded-lg border border-amber-200 dark:border-amber-800">
                        <span className="text-gray-500 dark:text-gray-400 block font-medium">Ticket de Carregamento:</span>
                        <span className="text-base font-bold text-gray-900 dark:text-white">
                          {weightDivergenceInfo.ticketWeightTon.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} ton{' '}
                          <span className="text-xs font-normal text-gray-500 dark:text-gray-400">
                            ({(weightDivergenceInfo.ticketWeightTon * 1000).toLocaleString('pt-BR')} kg)
                          </span>
                        </span>
                      </div>
                      <div className="bg-white/90 dark:bg-gray-800/90 p-2.5 rounded-lg border border-amber-200 dark:border-amber-800">
                        <span className="text-gray-500 dark:text-gray-400 block font-medium">CT-e Emitido:</span>
                        <span className="text-base font-bold text-amber-700 dark:text-amber-400">
                          {weightDivergenceInfo.cteWeightTon.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} ton{' '}
                          <span className="text-xs font-normal text-amber-600 dark:text-amber-400">
                            ({(weightDivergenceInfo.cteWeightTon * 1000).toLocaleString('pt-BR')} kg)
                          </span>
                        </span>
                      </div>
                    </div>
                    <div className="mt-2.5 pt-2 border-t border-amber-200/80 dark:border-amber-800/60 flex items-center justify-between flex-wrap gap-2">
                      <p className="text-[11px] text-amber-700 dark:text-amber-400 italic">
                        * O peso no sistema é exibido com 3 casas decimais ({weightDivergenceInfo.ticketWeightTon.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} ton). Se o peso do CT-e foi lido incorretamente, ajuste ao lado.
                      </p>
                      {!isEditingCteWeight ? (
                        <button
                          type="button"
                          onClick={() => {
                            setManualCteWeightInput(weightDivergenceInfo.cteWeightTon.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 }));
                            setIsEditingCteWeight(true);
                          }}
                          className="px-2.5 py-1 text-xs font-bold bg-amber-200 hover:bg-amber-300 dark:bg-amber-800 dark:hover:bg-amber-700 text-amber-900 dark:text-amber-100 rounded-lg flex items-center gap-1 transition-colors"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>Corrigir Peso do CT-e</span>
                        </button>
                      ) : (
                        <div className="flex items-center gap-1.5 animate-fade-in">
                          <input
                            type="text"
                            value={manualCteWeightInput}
                            onChange={(e) => setManualCteWeightInput(e.target.value)}
                            placeholder="ex: 45,960"
                            className="px-2 py-1 text-xs border border-amber-400 dark:border-amber-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white w-24 font-bold"
                          />
                          <span className="text-[10px] text-amber-800 dark:text-amber-200 font-semibold">ton</span>
                          <button
                            type="button"
                            onClick={() => {
                              const num = parseWeightKg(manualCteWeightInput);
                              if (num && num > 0) {
                                setCteExtractedWeightKg(num);
                                setIsEditingCteWeight(false);
                                showToast(`Peso do CT-e atualizado para ${(num / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} ton!`, 'success');
                              } else {
                                showToast('Informe um peso válido.', 'warning');
                              }
                            }}
                            className="px-2 py-1 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded transition-colors"
                          >
                            Salvar
                          </button>
                          <button
                            type="button"
                            onClick={() => setIsEditingCteWeight(false)}
                            className="px-2 py-1 text-xs text-gray-600 dark:text-gray-400 hover:underline"
                          >
                            Cancelar
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>

        {!isClientUser && !isDemo ? (
          <div className="border-t dark:border-gray-700 pt-4">
            <h3 className="text-lg font-semibold mb-4 text-primary">
              {shipment.status === ShipmentStatus.Finalizado ? 'Demonstrativo Financeiro / Lucro Real da Operação' : `Próximo Passo: ${documentName}`}
            </h3>
            {shipment.status === ShipmentStatus.AguardandoNota ? (
              <div className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
                  {notaFiscalDocTypes.map(docType => (
                    <FileInput
                      key={docType}
                      label={docType}
                      files={multiFiles[docType] || []}
                      onFileChange={(f) => handleMultiFileChange(docType, f)}
                      onInspectFile={(file, type) => setSelectedDocForDetails({ fileOrUrl: file, docType: type, docName: file.name })}
                      onMoveFile={handleMoveFile}
                      onRemoveFile={handleRemoveFile}
                      detectedTypesMap={detectedDocTypes}
                      availableTargetCategories={notaFiscalDocTypes}
                      checkDuplicateFile={checkDuplicateFile}
                    />
                  ))}
                </div>
              </div>
            ) : shipment.status === ShipmentStatus.AguardandoFiscal ? (
              <div className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
                  {travelDocTypes.map(docType => {
                    const config = TRAVEL_DOC_CONFIG[docType];
                    return (
                      <FileInput
                        key={docType}
                        label={docType}
                        displayLabel={config?.labelDisplay || docType}
                        subtext={config?.subtext}
                        isRequired={config?.isRequired}
                        files={multiFiles[docType] || []}
                        onFileChange={(f) => handleMultiFileChange(docType, f)}
                        onInspectFile={(file, type) => setSelectedDocForDetails({ fileOrUrl: file, docType: type, docName: file.name })}
                        onMoveFile={handleMoveFile}
                        onRemoveFile={handleRemoveFile}
                        detectedTypesMap={detectedDocTypes}
                        availableTargetCategories={travelDocTypes}
                        checkDuplicateFile={checkDuplicateFile}
                      />
                    );
                  })}
                </div>

                {/* Banner de Obrigatoriedade dos 3 Documentos Fiscais */}
                <div className={`p-4 rounded-xl border-2 transition-all ${
                  hasMissingFiscalDocs || fiscalAttachmentMismatches.length > 0
                    ? 'bg-amber-50/80 dark:bg-amber-950/30 border-amber-300 dark:border-amber-700 shadow-xs'
                    : 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-400 dark:border-emerald-600 shadow-xs'
                }`}>
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-lg shrink-0 ${
                      hasMissingFiscalDocs || fiscalAttachmentMismatches.length > 0
                        ? 'bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300'
                        : 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300'
                    }`}>
                      {hasMissingFiscalDocs || fiscalAttachmentMismatches.length > 0 ? (
                        <AlertTriangle className="w-5 h-5" />
                      ) : (
                        <CheckCircle2 className="w-5 h-5" />
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <h4 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
                          <span>Obrigatoriedade dos Documentos Fiscais de Viagem</span>
                          {hasMissingFiscalDocs || fiscalAttachmentMismatches.length > 0 ? (
                            <span className="text-[11px] font-extrabold px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-900/50 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-800">
                              Avanço Bloqueado
                            </span>
                          ) : (
                            <span className="text-[11px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                              Documentos Validados ✓
                            </span>
                          )}
                        </h4>
                      </div>
                      <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">
                        Para avançar para o status <strong>"Aguardando Adiantamento"</strong>, é estritamente obrigatório anexar e validar os 3 documentos:
                      </p>
                      <div className="mt-2.5 flex flex-wrap gap-2 text-xs">
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg font-bold border transition-all ${
                          !hasValidDocForCategory('CT-e')
                            ? 'bg-rose-50 text-rose-700 border-rose-300 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800 shadow-xs'
                            : 'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
                        }`}>
                          {hasValidDocForCategory('CT-e') ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />} 1. CT-e (DACTE)
                        </span>
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg font-bold border transition-all ${
                          !hasValidDocForCategory('MDF-e')
                            ? 'bg-rose-50 text-rose-700 border-rose-300 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800 shadow-xs'
                            : 'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
                        }`}>
                          {hasValidDocForCategory('MDF-e') ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />} 2. MDF-e (DAMDFE)
                        </span>
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg font-bold border transition-all ${
                          !hasValidDocForCategory('Carta Frete')
                            ? 'bg-rose-50 text-rose-700 border-rose-300 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800 shadow-xs'
                            : 'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
                        }`}>
                          {hasValidDocForCategory('Carta Frete') ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />} 3. Carta Frete
                        </span>
                      </div>
                      {fiscalAttachmentMismatches.length > 0 && (
                        <div className="mt-2.5 p-2.5 rounded-lg bg-rose-100 dark:bg-rose-900/60 border border-rose-300 dark:border-rose-700 text-rose-900 dark:text-rose-100 text-xs flex items-start gap-2">
                          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                          <div>
                            <strong>⛔ Incompatibilidade detectada:</strong> {fiscalAttachmentMismatches[0].message}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Banner de Erro caso haja documento anexado na categoria errada (ex: MDF-e em Carta Frete) */}
                {hasAttachmentMismatch && (
                  <div className="p-4 rounded-xl border-2 bg-rose-50 dark:bg-rose-950/40 border-rose-400 dark:border-rose-600 shadow-sm animate-in fade-in">
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-lg bg-rose-100 dark:bg-rose-900/60 text-rose-700 dark:text-rose-300 shrink-0">
                        <AlertTriangle className="w-5 h-5" />
                      </div>
                      <div className="flex-1">
                        <h4 className="text-sm font-bold text-rose-900 dark:text-rose-100 flex items-center gap-1.5">
                          ⛔ Documento Anexado no Campo Incorreto
                        </h4>
                        <p className="text-xs text-rose-700 dark:text-rose-300 mt-1">
                          Foi identificado arquivo anexado no campo errado (por exemplo, MDF-e anexado em Carta Frete).
                          Clique no botão <strong>"Mover para ..."</strong> presente no arquivo acima para transferi-lo imediatamente ao campo correto e liberar o avanço.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Painel de Validação e Conciliação Fiscal (CT-e e Carta Frete) */}
                <div className="mt-4 space-y-3">
                  {/* Divergência 1: Peso / Toneladas Efetivadas (Ticket vs CT-e) */}
                  {weightDivergenceInfo && (
                    <div className={`p-4 rounded-xl border-2 transition-all ${
                      weightDecision === 'unresolved'
                        ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-400 dark:border-amber-600 shadow-sm'
                        : 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-400 dark:border-emerald-600'
                    }`}>
                      <div className="flex items-start gap-3">
                        <div className={`p-2 rounded-lg shrink-0 ${
                          weightDecision === 'unresolved'
                            ? 'bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300'
                            : 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300'
                        }`}>
                          {weightDecision === 'unresolved' ? <AlertTriangle className="w-5 h-5" /> : <CheckCircle2 className="w-5 h-5" />}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between flex-wrap gap-2">
                            <h4 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
                              ⚖️ Validação de Peso: Ticket de Carregamento vs CT-e
                            </h4>
                            <span className="text-xs px-2.5 py-0.5 bg-amber-200 dark:bg-amber-900 text-amber-900 dark:text-amber-100 rounded-full font-bold">
                              Diferença: {weightDivergenceInfo.diffFormatted} ({weightDivergenceInfo.diffKgFormatted})
                            </span>
                          </div>
                          <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">
                            O peso cadastrado no sistema difere do peso lido no CT-e emitido. Escolha qual valor deve ser considerado para a efetivação das toneladas:
                          </p>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3 text-xs">
                            <div className="bg-white dark:bg-gray-800 p-2.5 rounded-lg border border-gray-200 dark:border-gray-700">
                              <span className="text-gray-500 dark:text-gray-400 block font-medium">Ticket de Carregamento (Sistema):</span>
                              <span className="text-base font-bold text-gray-900 dark:text-white">
                                {weightDivergenceInfo.ticketWeightTon.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} ton{' '}
                                <span className="text-xs font-normal text-gray-500 dark:text-gray-400">
                                  ({(weightDivergenceInfo.ticketWeightTon * 1000).toLocaleString('pt-BR')} kg)
                                </span>
                              </span>
                            </div>
                            <div className="bg-white dark:bg-gray-800 p-2.5 rounded-lg border border-gray-200 dark:border-gray-700">
                              <span className="text-gray-500 dark:text-gray-400 block font-medium">CT-e Emitido (Documento):</span>
                              <span className="text-base font-bold text-indigo-700 dark:text-indigo-400">
                                {weightDivergenceInfo.cteWeightTon.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} ton{' '}
                                <span className="text-xs font-normal text-indigo-500 dark:text-indigo-300">
                                  ({(weightDivergenceInfo.cteWeightTon * 1000).toLocaleString('pt-BR')} kg)
                                </span>
                              </span>
                            </div>
                          </div>

                          {/* Botões de Ação para o Operador Confirmar */}
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setWeightDecision('use_cte');
                                showToast(`✓ Confirmado: Peso das toneladas efetivadas corrigido para ${weightDivergenceInfo.cteWeightTon.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} ton (CT-e).`, 'success');
                              }}
                              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                                weightDecision === 'use_cte'
                                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30 ring-2 ring-emerald-500'
                                  : 'bg-white dark:bg-gray-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700'
                              }`}
                            >
                              <Check className="w-4 h-4" />
                              <span>✓ Corrigir para Peso do CT-e ({weightDivergenceInfo.cteWeightTon.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}t)</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setWeightDecision('keep_system');
                                showToast(`✓ Confirmado: Mantido o peso do Ticket de Carregamento (${weightDivergenceInfo.ticketWeightTon.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} ton).`, 'info');
                              }}
                              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                                weightDecision === 'keep_system'
                                  ? 'bg-gray-700 text-white shadow-md ring-2 ring-gray-600'
                                  : 'bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-600'
                              }`}
                            >
                              <span>Manter Peso do Ticket ({weightDivergenceInfo.ticketWeightTon.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}t)</span>
                            </button>
                          </div>

                          {weightDecision === 'use_cte' && (
                            <p className="mt-2 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                              ✓ O peso efetivado será atualizado automaticamente para {weightDivergenceInfo.cteWeightTon.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} ton ao salvar.
                            </p>
                          )}
                          {weightDecision === 'keep_system' && (
                            <p className="mt-2 text-[11px] font-semibold text-gray-600 dark:text-gray-300">
                              ✓ O peso original do sistema ({weightDivergenceInfo.ticketWeightTon.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} ton) será preservado.
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Divergência 2: Frete Motorista (Sistema vs Carta Frete) */}
                  {freightDivergenceInfo && (
                    <div className={`p-4 rounded-xl border-2 transition-all ${
                      freightDecision === 'unresolved'
                        ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-400 dark:border-amber-600 shadow-sm'
                        : 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-400 dark:border-emerald-600'
                    }`}>
                      <div className="flex items-start gap-3">
                        <div className={`p-2 rounded-lg shrink-0 ${
                          freightDecision === 'unresolved'
                            ? 'bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300'
                            : 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300'
                        }`}>
                          {freightDecision === 'unresolved' ? <AlertTriangle className="w-5 h-5" /> : <CheckCircle2 className="w-5 h-5" />}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between flex-wrap gap-2">
                            <h4 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
                              🚚 Validação de Frete Motorista: Sistema vs Carta Frete
                            </h4>
                            <span className="text-xs px-2.5 py-0.5 bg-amber-200 dark:bg-amber-900 text-amber-900 dark:text-amber-100 rounded-full font-bold">
                              Diferença: {freightDivergenceInfo.diffFormatted}
                            </span>
                          </div>
                          <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">
                            O valor de frete motorista cadastrado no sistema difere do valor lido na Carta Frete anexada. Escolha qual valor deve ser considerado:
                          </p>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3 text-xs">
                            <div className="bg-white dark:bg-gray-800 p-2.5 rounded-lg border border-gray-200 dark:border-gray-700">
                              <span className="text-gray-500 dark:text-gray-400 block font-medium">Frete Motorista no Sistema (Sem Pedágio):</span>
                              <span className="text-base font-bold text-gray-900 dark:text-white">
                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(freightDivergenceInfo.systemFreight)}
                              </span>
                            </div>
                            <div className="bg-white dark:bg-gray-800 p-2.5 rounded-lg border border-gray-200 dark:border-gray-700">
                              <span className="text-gray-500 dark:text-gray-400 block font-medium">Carta Frete Anexada (Sem Pedágio):</span>
                              <span className="text-base font-bold text-indigo-700 dark:text-indigo-400">
                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(freightDivergenceInfo.cartaFreteFreight)}
                              </span>
                            </div>
                          </div>

                          {/* Botões de Ação para o Operador Confirmar */}
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setFreightDecision('use_carta_frete');
                                showToast(`✓ Confirmado: Frete motorista corrigido para ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(freightDivergenceInfo.cartaFreteFreight)} (Carta Frete sem pedágio).`, 'success');
                              }}
                              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                                freightDecision === 'use_carta_frete'
                                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30 ring-2 ring-emerald-500'
                                  : 'bg-white dark:bg-gray-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700'
                              }`}
                            >
                              <Check className="w-4 h-4" />
                              <span>✓ Atualizar para Frete da Carta Frete ({new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(freightDivergenceInfo.cartaFreteFreight)} sem pedágio)</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setFreightDecision('keep_system');
                                showToast(`✓ Confirmado: Mantido o frete motorista do sistema (${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(freightDivergenceInfo.systemFreight)} sem pedágio).`, 'info');
                              }}
                              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                                freightDecision === 'keep_system'
                                  ? 'bg-gray-700 text-white shadow-md ring-2 ring-gray-600'
                                  : 'bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-600'
                              }`}
                            >
                              <span>Manter Frete do Sistema ({new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(freightDivergenceInfo.systemFreight)} sem pedágio)</span>
                            </button>
                          </div>

                          {freightDecision === 'use_carta_frete' && (
                            <p className="mt-2 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                              ✓ O frete motorista será atualizado automaticamente ao salvar.
                            </p>
                          )}
                          {freightDecision === 'keep_system' && (
                            <p className="mt-2 text-[11px] font-semibold text-gray-600 dark:text-gray-300">
                              ✓ O valor de frete motorista do sistema será mantido.
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Divergência 3: Frete Empresa (Sistema vs CT-e) */}
                  {companyFreightDivergenceInfo && (
                    <div className={`p-4 rounded-xl border-2 transition-all ${
                      companyFreightDecision === 'unresolved'
                        ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-400 dark:border-amber-600 shadow-sm'
                        : 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-400 dark:border-emerald-600'
                    }`}>
                      <div className="flex items-start gap-3">
                        <div className={`p-2 rounded-lg shrink-0 ${
                          companyFreightDecision === 'unresolved'
                            ? 'bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300'
                            : 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300'
                        }`}>
                          {companyFreightDecision === 'unresolved' ? <AlertTriangle className="w-5 h-5" /> : <CheckCircle2 className="w-5 h-5" />}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between flex-wrap gap-2">
                            <h4 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
                              🏢 Validação de Frete Empresa: Sistema vs CT-e
                            </h4>
                            <span className="text-xs px-2.5 py-0.5 bg-amber-200 dark:bg-amber-900 text-amber-900 dark:text-amber-100 rounded-full font-bold">
                              Diferença: {companyFreightDivergenceInfo.diffFormatted}
                            </span>
                          </div>
                          <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">
                            Regra fiscal: <strong>VALOR TOTAL DO SERVIÇO - CTE</strong> precisa ser igual ao <strong>Total Frete Emp do sistema</strong>. Escolha qual valor deve ser considerado:
                          </p>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3 text-xs">
                            <div className="bg-white dark:bg-gray-800 p-2.5 rounded-lg border border-gray-200 dark:border-gray-700">
                              <span className="text-gray-500 dark:text-gray-400 block font-medium">Total Frete Emp no Sistema:</span>
                              <span className="text-base font-bold text-gray-900 dark:text-white">
                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(companyFreightDivergenceInfo.systemCompanyFreight)}
                              </span>
                            </div>
                            <div className="bg-white dark:bg-gray-800 p-2.5 rounded-lg border border-gray-200 dark:border-gray-700">
                              <span className="text-gray-500 dark:text-gray-400 block font-medium">Valor Total do Serviço (CT-e):</span>
                              <span className="text-base font-bold text-indigo-700 dark:text-indigo-400">
                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(companyFreightDivergenceInfo.cteServiceTotal)}
                              </span>
                            </div>
                          </div>

                          {/* Botões de Ação para o Operador Confirmar */}
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setCompanyFreightDecision('use_cte');
                                showToast(`✓ Confirmado: Frete Empresa atualizado para ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(companyFreightDivergenceInfo.cteServiceTotal)} (CT-e).`, 'success');
                              }}
                              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                                companyFreightDecision === 'use_cte'
                                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30 ring-2 ring-emerald-500'
                                  : 'bg-white dark:bg-gray-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700'
                              }`}
                            >
                              <Check className="w-4 h-4" />
                              <span>✓ Atualizar para Frete Empresa do CT-e ({new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(companyFreightDivergenceInfo.cteServiceTotal)})</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setCompanyFreightDecision('keep_system');
                                showToast(`✓ Confirmado: Mantido o Frete Empresa do sistema (${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(companyFreightDivergenceInfo.systemCompanyFreight)}).`, 'info');
                              }}
                              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                                companyFreightDecision === 'keep_system'
                                  ? 'bg-gray-700 text-white shadow-md ring-2 ring-gray-600'
                                  : 'bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-600'
                              }`}
                            >
                              <span>Manter Frete Empresa do Sistema ({new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(companyFreightDivergenceInfo.systemCompanyFreight)})</span>
                            </button>
                          </div>

                          {companyFreightDecision === 'use_cte' && (
                            <p className="mt-2 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                              ✓ O Frete Empresa será atualizado automaticamente ao salvar.
                            </p>
                          )}
                          {companyFreightDecision === 'keep_system' && (
                            <p className="mt-2 text-[11px] font-semibold text-gray-600 dark:text-gray-300">
                              ✓ O valor de Frete Empresa do sistema será mantido.
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Divergência 3: ICMS (Sistema vs CT-e) */}
                  {icmsDivergenceInfo && (
                    <div className={`p-4 rounded-xl border-2 transition-all ${
                      icmsDecision === 'unresolved'
                        ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-400 dark:border-amber-600 shadow-sm'
                        : 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-400 dark:border-emerald-600'
                    }`}>
                      <div className="flex items-start gap-3">
                        <div className={`p-2 rounded-lg shrink-0 ${
                          icmsDecision === 'unresolved'
                            ? 'bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300'
                            : 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300'
                        }`}>
                          {icmsDecision === 'unresolved' ? <AlertTriangle className="w-5 h-5" /> : <CheckCircle2 className="w-5 h-5" />}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between flex-wrap gap-2">
                            <h4 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
                              🏛️ Validação de ICMS: Sistema vs CT-e
                            </h4>
                            <span className="text-xs px-2.5 py-0.5 bg-amber-200 dark:bg-amber-900 text-amber-900 dark:text-amber-100 rounded-full font-bold">
                              Diferença: {icmsDivergenceInfo.diffFormatted}
                            </span>
                          </div>
                          <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">
                            O valor de ICMS informado/calculado no sistema difere do valor destacado no CT-e anexado. Escolha qual valor deve ser considerado:
                          </p>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3 text-xs">
                            <div className="bg-white dark:bg-gray-800 p-2.5 rounded-lg border border-gray-200 dark:border-gray-700">
                              <span className="text-gray-500 dark:text-gray-400 block font-medium">ICMS no Sistema:</span>
                              <span className="text-base font-bold text-gray-900 dark:text-white">
                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(icmsDivergenceInfo.systemIcms)}
                              </span>
                            </div>
                            <div className="bg-white dark:bg-gray-800 p-2.5 rounded-lg border border-gray-200 dark:border-gray-700">
                              <span className="text-gray-500 dark:text-gray-400 block font-medium">ICMS Destacado no CT-e:</span>
                              <span className="text-base font-bold text-indigo-700 dark:text-indigo-400">
                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(icmsDivergenceInfo.cteIcms)}
                              </span>
                            </div>
                          </div>

                          {/* Botões de Ação para o Operador Confirmar */}
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setIcmsDecision('use_cte');
                                showToast(`✓ Confirmado: ICMS corrigido para ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(icmsDivergenceInfo.cteIcms)} (CT-e).`, 'success');
                              }}
                              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                                icmsDecision === 'use_cte'
                                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30 ring-2 ring-emerald-500'
                                  : 'bg-white dark:bg-gray-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700'
                              }`}
                            >
                              <Check className="w-4 h-4" />
                              <span>✓ Atualizar para ICMS do CT-e ({new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(icmsDivergenceInfo.cteIcms)})</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setIcmsDecision('keep_system');
                                showToast(`✓ Confirmado: Mantido o ICMS do sistema (${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(icmsDivergenceInfo.systemIcms)}).`, 'info');
                              }}
                              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                                icmsDecision === 'keep_system'
                                  ? 'bg-gray-700 text-white shadow-md ring-2 ring-gray-600'
                                  : 'bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-600'
                              }`}
                            >
                              <span>Manter ICMS do Sistema ({new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(icmsDivergenceInfo.systemIcms)})</span>
                            </button>
                          </div>

                          {icmsDecision === 'use_cte' && (
                            <p className="mt-2 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                              ✓ O ICMS será atualizado automaticamente ao salvar.
                            </p>
                          )}
                          {icmsDecision === 'keep_system' && (
                            <p className="mt-2 text-[11px] font-semibold text-gray-600 dark:text-gray-300">
                              ✓ O valor de ICMS do sistema será mantido.
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Divergência de Vale-Pedágio (Sistema vs Documento Fiscal) */}
                  {tollDivergenceInfo && (
                    <div className={`p-4 rounded-xl border-2 transition-all ${
                      tollDecision === 'unresolved'
                        ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-400 dark:border-amber-600 shadow-sm'
                        : 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-400 dark:border-emerald-600'
                    }`}>
                      <div className="flex items-start gap-3">
                        <div className={`p-2 rounded-lg shrink-0 ${
                          tollDecision === 'unresolved'
                            ? 'bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300'
                            : 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300'
                        }`}>
                          {tollDecision === 'unresolved' ? <AlertTriangle className="w-5 h-5" /> : <CheckCircle2 className="w-5 h-5" />}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between flex-wrap gap-2">
                            <h4 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
                              🛣️ Validação de Vale-Pedágio: Sistema vs Documento Anexado
                            </h4>
                            <span className="text-xs px-2.5 py-0.5 bg-amber-200 dark:bg-amber-900 text-amber-900 dark:text-amber-100 rounded-full font-bold">
                              Diferença: {tollDivergenceInfo.diffFormatted}
                            </span>
                          </div>
                          <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">
                            O valor de vale-pedágio cadastrado no sistema difere do valor lido no documento anexado (CT-e / Carta Frete). Escolha qual valor deve ser considerado:
                          </p>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3 text-xs">
                            <div className="bg-white dark:bg-gray-800 p-2.5 rounded-lg border border-gray-200 dark:border-gray-700">
                              <span className="text-gray-500 dark:text-gray-400 block font-medium">Vale-Pedágio no Sistema:</span>
                              <span className="text-base font-bold text-gray-900 dark:text-white">
                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(tollDivergenceInfo.systemToll)}
                              </span>
                            </div>
                            <div className="bg-white dark:bg-gray-800 p-2.5 rounded-lg border border-gray-200 dark:border-gray-700">
                              <span className="text-gray-500 dark:text-gray-400 block font-medium">Vale-Pedágio no Documento (CT-e / Carta Frete):</span>
                              <span className="text-base font-bold text-indigo-700 dark:text-indigo-400">
                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(tollDivergenceInfo.docToll)}
                              </span>
                            </div>
                          </div>

                          {/* Botões de Ação para o Operador Confirmar */}
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setTollDecision('use_doc');
                                setTollValue(tollDivergenceInfo.docToll);
                                showToast(`✓ Confirmado: Vale-Pedágio atualizado para ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(tollDivergenceInfo.docToll)}.`, 'success');
                              }}
                              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                                tollDecision === 'use_doc'
                                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30 ring-2 ring-emerald-500'
                                  : 'bg-white dark:bg-gray-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700'
                              }`}
                            >
                              <Check className="w-4 h-4" />
                              <span>✓ Atualizar para Pedágio do Documento ({new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(tollDivergenceInfo.docToll)})</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setTollDecision('keep_system');
                                showToast(`✓ Confirmado: Mantido o Vale-Pedágio do sistema (${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(tollDivergenceInfo.systemToll)}).`, 'info');
                              }}
                              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                                tollDecision === 'keep_system'
                                  ? 'bg-gray-700 text-white shadow-md ring-2 ring-gray-600'
                                  : 'bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-600'
                              }`}
                            >
                              <span>Manter Pedágio do Sistema ({new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(tollDivergenceInfo.systemToll)})</span>
                            </button>
                          </div>

                          {tollDecision === 'use_doc' && (
                            <p className="mt-2 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                              ✓ O valor de pedágio será atualizado automaticamente ao salvar.
                            </p>
                          )}
                          {tollDecision === 'keep_system' && (
                            <p className="mt-2 text-[11px] font-semibold text-gray-600 dark:text-gray-300">
                              ✓ O valor de vale-pedágio do sistema será mantido.
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Divergência 4: Tomador / Pagador da Carga vs CT-e */}
                  {tomadorDivergenceInfo && (
                    <div className={`p-4 rounded-xl border-2 transition-all ${
                      tomadorDecision === 'unresolved'
                        ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-400 dark:border-amber-600 shadow-sm'
                        : 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-400 dark:border-emerald-600'
                    }`}>
                      <div className="flex items-start gap-3">
                        <div className={`p-2 rounded-lg shrink-0 ${
                          tomadorDecision === 'unresolved'
                            ? 'bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300'
                            : 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300'
                        }`}>
                          {tomadorDecision === 'unresolved' ? <AlertTriangle className="w-5 h-5" /> : <CheckCircle2 className="w-5 h-5" />}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between flex-wrap gap-2">
                            <h4 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
                              🏢 Validação de Tomador (Pagador): Carga vs CT-e
                            </h4>
                            <span className="text-xs px-2.5 py-0.5 bg-amber-200 dark:bg-amber-900 text-amber-900 dark:text-amber-100 rounded-full font-bold">
                              CNPJ Divergente
                            </span>
                          </div>
                          <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">
                            O CPF ou CNPJ do Tomador (Pagador) cadastrado na carga não confere com o Tomador indicado no CT-e anexado. Escolha como deseja tratar esta divergência:
                          </p>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3 text-xs">
                            <div className="bg-white dark:bg-gray-800 p-2.5 rounded-lg border border-gray-200 dark:border-gray-700">
                              <span className="text-gray-500 dark:text-gray-400 block font-medium">Tomador no Cadastro da Carga:</span>
                              <div className="font-bold text-gray-900 dark:text-white mt-0.5 truncate" title={tomadorDivergenceInfo.systemClientName}>
                                {tomadorDivergenceInfo.systemClientName}
                              </div>
                              <div className="text-xs font-mono text-gray-600 dark:text-gray-300 mt-0.5">
                                CNPJ/CPF: {tomadorDivergenceInfo.systemCnpj}
                              </div>
                            </div>
                            <div className="bg-white dark:bg-gray-800 p-2.5 rounded-lg border border-gray-200 dark:border-gray-700">
                              <span className="text-gray-500 dark:text-gray-400 block font-medium">Tomador Informado no CT-e:</span>
                              <div className="font-bold text-indigo-700 dark:text-indigo-400 mt-0.5 truncate" title={tomadorDivergenceInfo.cteTomadorNome}>
                                {tomadorDivergenceInfo.cteTomadorNome}
                              </div>
                              <div className="text-xs font-mono text-indigo-600 dark:text-indigo-300 mt-0.5">
                                CNPJ/CPF: {tomadorDivergenceInfo.cteTomadorCnpj}
                              </div>
                            </div>
                          </div>

                          {/* Botões de Ação para o Operador Escolher */}
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              disabled={isResolvingTomador}
                              onClick={handleAdjustToCteTomador}
                              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 ${
                                tomadorDecision === 'adjust_to_cte'
                                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30 ring-2 ring-emerald-500'
                                  : 'bg-white dark:bg-gray-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700'
                              }`}
                            >
                              <Check className="w-4 h-4" />
                              <span>{isResolvingTomador ? 'Ajustando...' : '✓ Ajustar para Tomador do CT-e'}</span>
                            </button>
                            <button
                              type="button"
                              disabled={isResolvingTomador}
                              onClick={handleLinkBranchToCurrentClient}
                              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 ${
                                tomadorDecision === 'link_branch'
                                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30 ring-2 ring-blue-500'
                                  : 'bg-white dark:bg-gray-800 hover:bg-blue-50 dark:hover:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-300 dark:border-blue-700'
                              }`}
                            >
                              <Building className="w-4 h-4" />
                              <span>{isResolvingTomador ? 'Vinculando...' : '✓ Vincular como Filial do Tomador'}</span>
                            </button>
                            <button
                              type="button"
                              disabled={isResolvingTomador}
                              onClick={() => {
                                setTomadorDecision('keep_system');
                                showToast(`✓ Confirmado: Mantido o tomador do cadastro da carga (${tomadorDivergenceInfo.systemClientName}).`, 'info');
                              }}
                              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 ${
                                tomadorDecision === 'keep_system'
                                  ? 'bg-gray-700 text-white shadow-md ring-2 ring-gray-600'
                                  : 'bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-600'
                              }`}
                            >
                              <span>Manter Tomador da Carga</span>
                            </button>
                          </div>

                          {tomadorDecision === 'adjust_to_cte' && (
                            <p className="mt-2 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                              ✓ O tomador da carga foi ajustado com sucesso para o tomador indicado no CT-e ({tomadorDivergenceInfo.cteTomadorNome}).
                            </p>
                          )}
                          {tomadorDecision === 'link_branch' && (
                            <p className="mt-2 text-[11px] font-semibold text-blue-700 dark:text-blue-400">
                              ✓ O CNPJ {tomadorDivergenceInfo.cteTomadorCnpj} foi adicionado como filial vinculada a {tomadorDivergenceInfo.systemClientName}.
                            </p>
                          )}
                          {tomadorDecision === 'keep_system' && (
                            <p className="mt-2 text-[11px] font-semibold text-gray-600 dark:text-gray-300">
                              ✓ Tomador original mantido conforme informado na carga.
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Feedback positivo se houver documentos e nenhuma divergência pendente */}
                  {((cteWeightTon > 0 && !weightDivergenceInfo) || (weightDivergenceInfo && weightDecision !== 'unresolved')) &&
                   ((cartaFreteExtractedFreight && !freightDivergenceInfo) || (freightDivergenceInfo && freightDecision !== 'unresolved')) &&
                   ((cteExtractedServiceTotal && !companyFreightDivergenceInfo) || (companyFreightDivergenceInfo && companyFreightDecision !== 'unresolved')) &&
                   ((cteExtractedIcms && !icmsDivergenceInfo) || (icmsDivergenceInfo && icmsDecision !== 'unresolved')) &&
                   ((docExtractedToll && !tollDivergenceInfo) || (tollDivergenceInfo && tollDecision !== 'unresolved')) &&
                   (!tomadorDivergenceInfo || tomadorDecision !== 'unresolved') && (
                    <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-xl flex items-center gap-2.5 text-xs text-emerald-800 dark:text-emerald-300">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span className="font-medium">
                        ✓ Conferência de documentos fiscais concluída: dados validados com sucesso.
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ) : shipment.status === ShipmentStatus.AguardandoCarregamento ? (
              <div className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FileInput
                    label={documentName}
                    files={singleFiles}
                    onFileChange={(f) => handleSingleFilesChange(f, documentName)}
                    onInspectFile={(file, type) => setSelectedDocForDetails({ fileOrUrl: file, docType: type, docName: file.name })}
                    checkDuplicateFile={checkDuplicateFile}
                  />
                  <div>
                    <label className="block text-sm font-medium mb-1">Toneladas Carregadas</label>
                    <input type="number" step="0.01" value={loadedTonnage} onChange={(e) => setLoadedTonnage(e.target.value === '' ? '' : Number(e.target.value))} className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600" />
                  </div>
                </div>
              </div>
            ) : shipment.status === ShipmentStatus.AguardandoSeguradora ? (
              <div className="space-y-4">
                {/* Campo de Status/Resultado da Gerenciadora de Risco */}
                <div className="bg-gray-50 dark:bg-gray-900/50 p-4 rounded-xl border border-gray-200 dark:border-gray-700">
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Resultado da Gerenciadora de Risco (GR) <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={grStatus}
                    onChange={(e) => setGrStatus(e.target.value as 'aprovado' | 'reprovado' | 'reprovado_restrito')}
                    className="p-2.5 w-full border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary/20 font-medium"
                  >
                    <option value="aprovado">🟢 Liberado / Aprovado no GR</option>
                    <option value="reprovado">🔴 Reprovado no GR (Cancelar Embarque)</option>
                    <option value="reprovado_restrito">⛔ Reprovado no GR e Restrito (Cancelar Embarque e Restringir Motorista)</option>
                  </select>
                </div>

                {/* Banner de Integração Direta RDO Nacional */}
                <div className="flex flex-wrap items-center justify-between p-3.5 rounded-xl bg-gradient-to-r from-blue-50/90 via-sky-50/70 to-indigo-50/90 dark:from-blue-950/40 dark:via-gray-900 dark:to-indigo-950/40 border border-blue-200 dark:border-blue-800 shadow-xs gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-xl bg-blue-600 text-white shadow-xs">
                      <ShieldCheck className="w-5 h-5" />
                    </div>
                    <div>
                      <h5 className="text-xs font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
                        Triagem RDO Nacional (MRB Soluções)
                        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300 font-bold">API</span>
                      </h5>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400">
                        Submeta este motorista para análise cadastral na fila de triagem ou consulte o parecer recebido
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsRdoModalOpen(true)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-bold text-xs shadow-sm transition-all cursor-pointer"
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Consultar / Triagem RDO</span>
                  </button>
                </div>

                {/* Banner de Integração Direta SIGA GR */}
                <div className="flex flex-wrap items-center justify-between p-3.5 rounded-xl bg-gradient-to-r from-indigo-50/90 via-purple-50/70 to-blue-50/90 dark:from-indigo-950/40 dark:via-gray-900 dark:to-blue-950/40 border border-indigo-200 dark:border-indigo-800 shadow-xs gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-xl bg-indigo-600 text-white shadow-xs">
                      <ShieldCheck className="w-5 h-5" />
                    </div>
                    <div>
                      <h5 className="text-xs font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
                        SIGA GR (Gerenciadora de Risco)
                        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300 font-bold">REST+JSON v1</span>
                      </h5>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400">
                        Crie ou acompanhe a análise no SIGA GR com envio de CNH, CRLV e validação de perfil de risco
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsSigaModalOpen(true)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-bold text-xs shadow-sm transition-all cursor-pointer"
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Consultar / Enviar ao SIGA GR</span>
                  </button>
                </div>


                {grStatus === 'aprovado' ? (
                  <>
                    <FileInput
                      label={documentName}
                      files={singleFiles}
                      onFileChange={(f) => handleSingleFilesChange(f, documentName)}
                      onInspectFile={(file, type) => setSelectedDocForDetails({ fileOrUrl: file, docType: type, docName: file.name })}
                      checkDuplicateFile={checkDuplicateFile}
                    />

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-gray-50 dark:bg-gray-900/50 p-4 rounded-xl border border-gray-200 dark:border-gray-700">
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                          Código de Liberação da Seguradora <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={riskReleaseCode}
                          onChange={(e) => setRiskReleaseCode(e.target.value)}
                          placeholder="Ex: LIB-984721"
                          className="p-2.5 w-full border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary/20"
                          required
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                          Modalidade de Consulta Realizada <span className="text-red-500">*</span>
                        </label>
                        <select
                          value={riskQueryType}
                          onChange={(e) => setRiskQueryType(e.target.value)}
                          className="p-2.5 w-full border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary/20"
                          required
                        >
                          <option value="" disabled>Selecione a modalidade de consulta...</option>
                          {riskQueryOptions
                            .filter(opt => opt.active || opt.name === riskQueryType)
                            .sort((a, b) => (a.orderIndex ?? 999) - (b.orderIndex ?? 999))
                            .map((opt, idx) => (
                              <option key={opt.id || idx} value={opt.name}>
                                {(opt.orderIndex ?? (idx + 1))} - {opt.name} (Valor: R$ {opt.cost.toFixed(2).replace('.', ',')})
                              </option>
                            ))}
                        </select>
                      </div>
                    </div>

                    {riskQueryType && (
                      <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl flex items-center justify-between">
                        <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300 uppercase tracking-wide">Custo Registrado de Gerenciamento de Risco:</span>
                        <span className="text-sm font-black text-emerald-950 dark:text-emerald-100 bg-white dark:bg-emerald-900 px-3 py-1 rounded-lg border border-emerald-200 dark:border-emerald-700 shadow-sm">
                          R$ {(riskQueryOptions.find(o => o.name === riskQueryType || o.name.toLowerCase().trim() === riskQueryType?.toLowerCase().trim())?.cost ?? (RISK_QUERY_COST_MAP[riskQueryType] ?? RISK_QUERY_COST_MAP[riskQueryType.toLowerCase().trim()] ?? 0)).toFixed(2).replace('.', ',')}
                        </span>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div className={grStatus === 'reprovado' ? "p-4 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-xl text-amber-900 dark:text-amber-200 space-y-1" : "p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl text-red-900 dark:text-red-200 space-y-1"}>
                      <div className="font-bold flex items-center gap-2 text-sm text-amber-800 dark:text-amber-300">
                        {grStatus === 'reprovado' ? '⚠️ Ação ao clicar em "Salvar e Avançar":' : '⛔ Ação ao clicar em "Salvar e Avançar":'}
                      </div>
                      <p className="text-xs">
                        {grStatus === 'reprovado' ? (
                          <>Ao salvar com a opção <strong>Reprovado no GR</strong>, este embarque será automaticamente <strong>cancelado</strong> no sistema com o motivo <em>"Reprovado no GR"</em>.</>
                        ) : (
                          <>Ao salvar com a opção <strong>Reprovado no GR e Restrito</strong>, este embarque será <strong>cancelado</strong> e o motorista <strong>{shipment.driverName}</strong> terá seu cadastro alterado para o status <strong>RESTRITO</strong> (impedindo novos agendamentos).</>
                        )}
                      </p>
                    </div>

                    <div className="bg-gray-50 dark:bg-gray-900/50 p-4 rounded-xl border border-gray-200 dark:border-gray-700">
                      <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                        Modalidade de Consulta Realizada (Tarifada na GR) <span className="text-red-500">*</span>
                      </label>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                        Selecione a consulta que foi executada na seguradora/gerenciadora para correta contabilização do custo de desperdício.
                      </p>
                      <select
                        value={riskQueryType}
                        onChange={(e) => setRiskQueryType(e.target.value)}
                        className="p-2.5 w-full border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary/20 font-medium"
                      >
                        <option value="">Selecione a modalidade tarifada...</option>
                        {riskQueryOptions
                          .filter(opt => opt.active || opt.name === riskQueryType)
                          .sort((a, b) => (a.orderIndex ?? 999) - (b.orderIndex ?? 999))
                          .map((opt, idx) => (
                            <option key={opt.id || idx} value={opt.name}>
                              {(opt.orderIndex ?? (idx + 1))} - {opt.name} (Valor: R$ {opt.cost.toFixed(2).replace('.', ',')})
                            </option>
                          ))}
                      </select>
                    </div>

                    {riskQueryType && (
                      <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl flex items-center justify-between">
                        <span className="text-xs font-bold text-red-800 dark:text-red-300 uppercase tracking-wide">Custo de Desperdício (GR):</span>
                        <span className="text-sm font-black text-red-950 dark:text-red-100 bg-white dark:bg-red-900 px-3 py-1 rounded-lg border border-red-200 dark:border-red-700 shadow-sm">
                          R$ {(riskQueryOptions.find(o => o.name === riskQueryType || o.name.toLowerCase().trim() === riskQueryType?.toLowerCase().trim())?.cost ?? (RISK_QUERY_COST_MAP[riskQueryType] ?? RISK_QUERY_COST_MAP[riskQueryType.toLowerCase().trim()] ?? 0)).toFixed(2).replace('.', ',')}
                        </span>
                      </div>
                    )}
                  </>
                )}
              </div>
            ) : shipment.status === ShipmentStatus.AguardandoAdiantamento ? (
              <div className="space-y-4">
                <FileInput
                  label={documentName}
                  files={singleFiles}
                  onFileChange={(f) => handleSingleFilesChange(f, documentName)}
                  onInspectFile={(file, type) => setSelectedDocForDetails({ fileOrUrl: file, docType: type, docName: file.name })}
                  checkDuplicateFile={checkDuplicateFile}
                />

                {/* Financial calculation & summary box */}
                {(() => {
                  const isAgAdiantamento = shipment.status === ShipmentStatus.AguardandoAdiantamento;
                  const isPfShipment = shipment.driverFreightType === 'PF' || shipment.anttModality === 'TAC';
                  const tagNum = Number(tollValue) || 0;
                  const tacDeductions = isPfShipment ? calculateTacTaxDeductions(totalDriverFreight, tagNum) : null;
                  const baseFrete = Math.max(0, totalDriverFreight - tagNum);
                  const advPctNum = advancePercentage !== '' && advancePercentage !== undefined ? Number(advancePercentage) : 70;
                  const is100Pct = advPctNum >= 100;
                  const adiantamentoBruto = Number((baseFrete * (advPctNum / 100)).toFixed(2));
                  const totalRetencoes = tacDeductions ? Number((tacDeductions.inss + tacDeductions.sestSenat + tacDeductions.irrf).toFixed(2)) : 0;
                  const valorContaCalculado = (isPfShipment && is100Pct) ? Math.max(0, Number((adiantamentoBruto - totalRetencoes).toFixed(2))) : adiantamentoBruto;
                  const saldoOriginalContratual = is100Pct ? 0 : Number((baseFrete * ((100 - advPctNum) / 100)).toFixed(2));
                  const totalRetencoesSaldo = is100Pct ? 0 : totalRetencoes;
                  const saldoLiquidoPreDescarga = is100Pct ? 0 : (isPfShipment ? Math.max(0, Number((saldoOriginalContratual - totalRetencoesSaldo).toFixed(2))) : saldoOriginalContratual);

                  return (
                    <div className="bg-gray-50 dark:bg-gray-900/40 p-4 rounded-xl border border-gray-200 dark:border-gray-700/80 space-y-3">
                      <div className="flex items-center justify-between text-xs font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                        <div className="flex items-center gap-2">
                          <span>Detalhamento de Pagamento do Frete</span>
                          <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                            isPfShipment
                              ? 'bg-orange-100 text-orange-800 dark:bg-orange-950/60 dark:text-orange-300 border border-orange-200 dark:border-orange-800'
                              : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                          }`}>
                            {isPfShipment ? 'TAC (Pessoa Física)' : 'ETC (Pessoa Jurídica)'}
                          </span>
                        </div>
                        <span className="text-gray-500 dark:text-gray-400 font-medium normal-case">
                          Frete Total (Bruto): <strong className="text-gray-900 dark:text-white font-bold">{formatCurrency(totalDriverFreight)}</strong>
                        </span>
                      </div>

                      {/* Alerta de Divergência no Adiantamento PG */}
                      {advanceDivergenceInfo && (
                        <div className="p-3 bg-amber-100/90 dark:bg-amber-950/70 border-2 border-amber-500 dark:border-amber-500/80 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
                          <div className="flex items-start sm:items-center gap-2.5">
                            <AlertTriangle className="w-5 h-5 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5 sm:mt-0" />
                            <div>
                              <p className="text-xs font-bold text-amber-950 dark:text-amber-200">
                                Divergência no Adiantamento: Sistema ({formatCurrency(advanceDivergenceInfo.systemAdvance)}) ≠ Carta Frete ({formatCurrency(advanceDivergenceInfo.cartaFreteAdvance)})
                              </p>
                              <p className="text-[11px] text-amber-800 dark:text-amber-300">
                                "Adiantamento PG" deve ser igual ao referente Adiantamento de viagem da Carta Frete. Salvar e Avançar travado até corrigir.
                              </p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={handleCorrectAdvanceToCartaFrete}
                            className="shrink-0 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow transition-all flex items-center gap-1.5 cursor-pointer"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Corrigir para {formatCurrency(advanceDivergenceInfo.cartaFreteAdvance)}</span>
                          </button>
                        </div>
                      )}

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className={`block text-xs font-semibold ${isAgAdiantamento ? 'text-gray-500 dark:text-gray-400 flex items-center gap-1' : 'text-gray-600 dark:text-gray-300'}`}>
                              {isAgAdiantamento && <Lock className="w-3 h-3 text-gray-400" />}
                              <span>Valor pago no Tag</span>
                            </label>
                            {isAgAdiantamento && (
                              <span className="text-[9px] font-bold text-gray-500 dark:text-gray-400 bg-gray-200/80 dark:bg-gray-800 px-1.5 py-0.5 rounded">
                                Fixo
                              </span>
                            )}
                          </div>
                          <div className="relative">
                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-medium">R$</span>
                            <input
                              type="number"
                              value={tollValue}
                              onChange={(e) => !isAgAdiantamento && setTollValue(e.target.value === '' ? '' : Number(e.target.value))}
                              readOnly={isAgAdiantamento}
                              className={`w-full pl-8 pr-8 py-2 border rounded-lg text-sm dark:border-gray-600 ${
                                isAgAdiantamento || !canSave
                                  ? 'bg-gray-100 dark:bg-gray-800/80 cursor-not-allowed select-none text-gray-600 dark:text-gray-300'
                                  : 'bg-white dark:bg-gray-700'
                              }`}
                              disabled={!canSave || isAgAdiantamento}
                              placeholder="0,00"
                              title={isAgAdiantamento ? "Valor do pedágio definido na emissão da Carta Frete. Bloqueado para edição no status Ag. Adiantamento." : undefined}
                            />
                            {isAgAdiantamento && (
                              <Lock className="w-3.5 h-3.5 text-gray-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                            )}
                          </div>
                        </div>

                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className={`block text-xs font-semibold ${isAgAdiantamento ? 'text-gray-500 dark:text-gray-400 flex items-center gap-1' : 'text-gray-600 dark:text-gray-300'}`}>
                              {isAgAdiantamento && <Lock className="w-3 h-3 text-gray-400" />}
                              <span>% Adiantamento</span>
                            </label>
                            {isAgAdiantamento && (
                              <span className="text-[9px] font-bold text-gray-500 dark:text-gray-400 bg-gray-200/80 dark:bg-gray-800 px-1.5 py-0.5 rounded">
                                Fixo
                              </span>
                            )}
                          </div>
                          <div className="relative">
                            <input
                              type="number"
                              value={advancePercentage}
                              onChange={(e) => !isAgAdiantamento && setAdvancePercentage(e.target.value === '' ? '' : Number(e.target.value))}
                              readOnly={isAgAdiantamento}
                              className={`w-full pl-3 pr-10 py-2 border rounded-lg text-sm dark:border-gray-600 ${
                                isAgAdiantamento || !canSave
                                  ? 'bg-gray-100 dark:bg-gray-800/80 cursor-not-allowed select-none text-gray-600 dark:text-gray-300'
                                  : 'bg-white dark:bg-gray-700'
                              }`}
                              disabled={!canSave || isAgAdiantamento}
                              placeholder="Ex: 80"
                              title={isAgAdiantamento ? "% de adiantamento fixado na emissão da Carta Frete. Bloqueado para edição no status Ag. Adiantamento." : undefined}
                            />
                            <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1 pointer-events-none">
                              {isAgAdiantamento && <Lock className="w-3 h-3 text-gray-400" />}
                              <span className="text-xs text-gray-400 font-bold">%</span>
                            </div>
                          </div>
                        </div>

                        <div className={
                          isAgAdiantamento
                            ? "bg-blue-50/90 dark:bg-blue-950/40 p-2.5 rounded-xl border-2 border-blue-500 dark:border-blue-400 flex flex-col justify-between shadow-xs ring-2 ring-blue-500/20"
                            : ""
                        }>
                          <div className="flex items-center justify-between mb-1">
                            <label className={`flex items-center gap-1 text-xs font-semibold ${isAgAdiantamento ? 'text-blue-900 dark:text-blue-100 font-bold uppercase tracking-tight text-[11px]' : 'text-gray-600 dark:text-gray-300'}`}>
                              <Lock className="w-3 h-3 text-gray-500 dark:text-gray-400" />
                              <span>Adiantamento PG</span>
                            </label>
                            <div className="flex items-center gap-1">
                              <span className="text-[9px] font-bold text-gray-500 dark:text-gray-400 bg-gray-200/80 dark:bg-gray-800 px-1.5 py-0.5 rounded flex items-center gap-0.5" title="Campo bloqueado para edição manual. Preenchido com o Adiantamento de viagem da Carta Frete.">
                                Bloqueado
                              </span>
                              {isAgAdiantamento && (
                                <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-blue-600 text-white shadow-xs">
                                  A Pagar
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="relative">
                            <span className={`absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-medium ${isAgAdiantamento ? 'text-blue-600 dark:text-blue-400 font-bold' : 'text-gray-400'}`}>R$</span>
                            <input
                              type="number"
                              value={advanceValue}
                              readOnly={true}
                              tabIndex={-1}
                              className={`w-full pl-8 pr-8 py-2 border rounded-lg text-sm cursor-not-allowed select-none bg-gray-100 dark:bg-gray-800/80 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-600 ${
                                isAgAdiantamento
                                  ? 'border-blue-400 dark:border-blue-500 font-bold text-blue-950 dark:text-white shadow-xs'
                                  : ''
                              }`}
                              title="Campo bloqueado para edição manual. O valor é preenchido automaticamente com o referente Adiantamento de viagem extraído da Carta Frete."
                              placeholder="0,00"
                            />
                            <Lock className="w-3.5 h-3.5 text-gray-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                          </div>
                          <div className="mt-1 flex items-center justify-between text-[11px] px-0.5 text-gray-500 dark:text-gray-400 font-medium">
                            <span>Total Adiantamento:</span>
                            <span className={`font-bold ${isAgAdiantamento ? 'text-blue-700 dark:text-blue-300 font-extrabold' : 'text-blue-600 dark:text-blue-400'}`}>
                              {formatCurrency((Number(tollValue) || 0) + (Number(advanceValue) || 0))}
                            </span>
                          </div>
                        </div>

                        <div className="bg-emerald-50/80 dark:bg-emerald-950/40 p-2.5 rounded-xl border border-emerald-200 dark:border-emerald-800 flex flex-col justify-between shadow-2xs">
                          <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300 uppercase tracking-tight">
                            {isPfShipment ? (is100Pct ? 'Saldo Restante' : 'Saldo Restante Líquido') : 'Valor do Saldo'}
                          </span>
                          <span className={`text-base font-black mt-1 ${saldoLiquidoPreDescarga < 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-900 dark:text-emerald-100'}`}>
                            {formatCurrency(saldoLiquidoPreDescarga)}
                          </span>
                          {is100Pct && (
                            <span className="text-[9px] text-emerald-600 dark:text-emerald-400 font-semibold block mt-0.5">
                              100% no Adiantamento
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Memória de Cálculo TAC (Pessoa Física) */}
                      {isPfShipment && tacDeductions && (
                        <div className="pt-2 border-t border-orange-200/80 dark:border-orange-900/50 space-y-2">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-bold text-orange-900 dark:text-orange-200 flex items-center gap-1.5">
                              <span>📋</span> Retenções Fiscais e Previdenciárias do Autônomo (PF)
                            </span>
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-orange-100 dark:bg-orange-950/60 text-orange-800 dark:text-orange-300 border border-orange-200 dark:border-orange-900" title="Base calculada sobre 20% do frete líquido de pedágio">
                              Base Fiscal (20% s/ Líq. Pedágio): <strong>{formatCurrency(tacDeductions.fiscalBase)}</strong>
                            </span>
                          </div>

                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                            <div className="p-2 bg-white dark:bg-gray-800 rounded-lg border border-orange-200 dark:border-gray-700">
                              <span className="text-[10px] text-gray-500 dark:text-gray-400 block font-semibold">INSS Autônomo (11%)</span>
                              <span className="font-bold text-red-600 dark:text-red-400">- {formatCurrency(tacDeductions.inss)}</span>
                              <span className="text-[9px] text-emerald-600 dark:text-emerald-400 font-semibold block mt-0.5">
                                {is100Pct ? 'Deduz no Adiantamento' : 'Deduz no Saldo'}
                              </span>
                            </div>
                            <div className="p-2 bg-white dark:bg-gray-800 rounded-lg border border-orange-200 dark:border-gray-700">
                              <span className="text-[10px] text-gray-500 dark:text-gray-400 block font-semibold">SEST/SENAT (2,5%)</span>
                              <span className="font-bold text-red-600 dark:text-red-400">- {formatCurrency(tacDeductions.sestSenat)}</span>
                              <span className="text-[9px] text-emerald-600 dark:text-emerald-400 font-semibold block mt-0.5">
                                {is100Pct ? 'Deduz no Adiantamento' : 'Deduz no Saldo'}
                              </span>
                            </div>
                            <div className="p-2 bg-white dark:bg-gray-800 rounded-lg border border-orange-200 dark:border-gray-700">
                              <span className="text-[10px] text-gray-500 dark:text-gray-400 block font-semibold">IRRF (Prog.)</span>
                              <span className="font-bold text-red-600 dark:text-red-400">
                                {tacDeductions.irrf > 0 ? `- ${formatCurrency(tacDeductions.irrf)}` : 'Isento (R$ 0,00)'}
                              </span>
                              <span className="text-[9px] text-emerald-600 dark:text-emerald-400 font-semibold block mt-0.5">
                                {is100Pct ? 'Deduz no Adiantamento' : 'Deduz no Saldo'}
                              </span>
                            </div>
                            <div className="p-2 bg-white dark:bg-gray-800 rounded-lg border border-orange-200 dark:border-gray-700">
                              <span className="text-[10px] text-gray-500 dark:text-gray-400 block font-semibold">Total Retenções</span>
                              <span className="font-black text-red-700 dark:text-red-300">- {formatCurrency(tacDeductions.totalDeductions)}</span>
                              <span className="text-[9px] text-gray-500 dark:text-gray-400 block mt-0.5">INSS + SEST + IRRF</span>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center justify-between text-[11px] text-gray-600 dark:text-gray-400 bg-white/60 dark:bg-gray-800/60 p-2 rounded-lg border border-gray-200 dark:border-gray-700/60">
                            {is100Pct ? (
                              <>
                                <span>Adiant. Bruto (100%): <strong>{formatCurrency(adiantamentoBruto)}</strong></span>
                                <span>Total Retenções: <strong className="text-red-600 dark:text-red-400">- {formatCurrency(tacDeductions.totalDeductions)}</strong></span>
                                <span>Valor Líquido na Conta: <strong className="text-blue-700 dark:text-blue-300">{formatCurrency(valorContaCalculado)}</strong></span>
                                <span>Saldo Restante: <strong className="text-emerald-700 dark:text-emerald-400">R$ 0,00 (Finaliza na Descarga)</strong></span>
                              </>
                            ) : (
                              <>
                                <span>Adiant. na Conta ({advPctNum}%): <strong>{formatCurrency(valorContaCalculado)}</strong></span>
                                <span>Total Retenções no Saldo: <strong className="text-red-600 dark:text-red-400">- {formatCurrency(totalRetencoesSaldo)}</strong></span>
                                <span>Saldo Original: <strong>{formatCurrency(saldoOriginalContratual)}</strong></span>
                                <span>Saldo Restante Líquido: <strong className="text-emerald-700 dark:text-emerald-400">{formatCurrency(saldoLiquidoPreDescarga)}</strong></span>
                              </>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            ) : shipment.status === ShipmentStatus.AguardandoDescarga ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FileInput
                  label={documentName}
                  files={singleFiles}
                  onFileChange={(f) => handleSingleFilesChange(f, documentName)}
                  onInspectFile={(file, type) => setSelectedDocForDetails({ fileOrUrl: file, docType: type, docName: file.name })}
                  checkDuplicateFile={checkDuplicateFile}
                  bypassDuplicateCheck={true}
                />
                <div>
                  <label className="block text-sm font-medium mb-1">Peso Descarregado (Ton)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={unloadedTonnage}
                    onChange={(e) => setUnloadedTonnage(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600"
                    placeholder="Informe o peso conforme ticket"
                  />
                </div>
              </div>
            ) : shipment.status === ShipmentStatus.ValidacaoTicket ? (
              <div className="space-y-5">
                {/* Header Banner Informativo */}
                <div className="p-4 bg-blue-50/80 dark:bg-blue-950/40 rounded-2xl border border-blue-200 dark:border-blue-800 flex items-start gap-3">
                  <div className="p-2 bg-blue-500/10 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 rounded-xl shrink-0">
                    <FileCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-blue-900 dark:text-blue-200">
                      Conferência do Ticket e Validação do Peso Descarregado
                    </h4>
                    <p className="text-xs text-blue-700/80 dark:text-blue-300/80 mt-0.5 leading-relaxed">
                      Verifique o comprovante / ticket de balança anexado na descarga. Confirme se o peso descarregado está correto e clique em <strong>"Validar Ticket e Peso"</strong> para liberar o botão <strong>"Salvar e Avançar"</strong> para a quitação de saldo.
                    </p>
                  </div>
                </div>

                {/* Seção 1: Visualização do Ticket Anexado */}
                <div className="p-4 bg-gray-50/80 dark:bg-gray-900/40 rounded-2xl border dark:border-gray-700 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                      <Paperclip className="w-3.5 h-3.5 text-primary" /> Ticket / Comprovante Anexado
                    </span>
                    {ticketFiles.length > 0 && (
                      <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-md">
                        {ticketFiles.length} documento(s) encontrado(s)
                      </span>
                    )}
                  </div>

                  {ticketFiles.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {ticketFiles.map((docUrl, idx) => {
                        const fileName = typeof docUrl === 'string' ? (docUrl.split('/').pop() || `Ticket ${idx + 1}`) : `Ticket ${idx + 1}`;
                        const isPdf = typeof docUrl === 'string' && docUrl.toLowerCase().includes('.pdf');
                        return (
                          <div key={idx} className="p-3 bg-white dark:bg-gray-800 border rounded-xl flex items-center justify-between gap-2 shadow-xs hover:border-blue-400 transition-colors">
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="p-2 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 shrink-0">
                                {isPdf ? <FileText className="w-4 h-4 text-red-500" /> : <Eye className="w-4 h-4 text-blue-500" />}
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs font-semibold text-gray-800 dark:text-gray-200 truncate" title={fileName}>
                                  {fileName}
                                </p>
                                <span className="text-[10px] text-gray-400">Comprovante de Descarga</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => setSelectedDocForDetails({ fileOrUrl: docUrl, docType: 'Comprovante de Descarga', docName: fileName })}
                                className="px-2.5 py-1 text-xs font-bold text-primary bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/40 dark:hover:bg-blue-900/60 rounded-lg flex items-center gap-1 transition-colors"
                              >
                                <Eye className="w-3.5 h-3.5" /> Visualizar
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3 rounded-xl border border-amber-200 dark:border-amber-800">
                      Nenhum comprovante de descarga foi identificado previamente. Você pode anexar o ticket abaixo:
                    </div>
                  )}

                  {/* Upload opcional ou substituição */}
                  <div className="pt-2">
                    <FileInput
                      label="Anexar / Substituir Ticket de Descarga (opcional)"
                      files={singleFiles}
                      onFileChange={(f) => handleSingleFilesChange(f, "Ticket de Descarga")}
                      onInspectFile={(file, type) => setSelectedDocForDetails({ fileOrUrl: file, docType: type, docName: file.name })}
                      checkDuplicateFile={checkDuplicateFile}
                      bypassDuplicateCheck={true}
                    />
                  </div>
                </div>

                {/* Seção 2: Conferência de Pesagem e Apuração de Quebra / Sobra */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="p-3.5 bg-gray-50 dark:bg-gray-900/40 rounded-xl border dark:border-gray-700">
                    <span className="text-[10px] font-bold text-gray-500 uppercase block mb-1">Peso Carregado (Origem)</span>
                    <span className="font-mono font-bold text-base text-gray-900 dark:text-white block">
                      {(Number(shipment.shipmentTonnage) || 0).toLocaleString('pt-BR')} ton
                    </span>
                    <span className="text-[11px] text-gray-400">Peso constante na NF-e</span>
                  </div>

                  <div className="p-3.5 bg-white dark:bg-gray-800 rounded-xl border-2 border-primary/40 dark:border-primary/50 shadow-xs">
                    <label className="block text-[10px] font-bold text-primary uppercase mb-1">
                      Peso Descarregado (Destino - Ton) *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={unloadedTonnage}
                      onChange={(e) => {
                        setUnloadedTonnage(e.target.value === '' ? '' : Number(e.target.value));
                        setIsTicketValidated(false);
                      }}
                      className="w-full p-2 border rounded-lg font-mono font-bold text-base text-gray-900 dark:text-white dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-primary"
                      placeholder="Ex: 45.20"
                    />
                    <span className="text-[11px] text-gray-400 mt-1 block">Ajuste conforme ticket de balança</span>
                  </div>

                  <div className="p-3.5 bg-gray-50 dark:bg-gray-900/40 rounded-xl border dark:border-gray-700">
                    <span className="text-[10px] font-bold text-gray-500 uppercase block mb-1">Diferença de Balança (Destino - Origem)</span>
                    {unloadedTonnage !== '' && shipment.shipmentTonnage ? (
                      (() => {
                        const diffTon = Number(unloadedTonnage) - shipment.shipmentTonnage;
                        const diffKg = diffTon * 1000;
                        const isQuebra = diffTon < -0.001;
                        return (
                          <div>
                            <span className={`font-mono font-black text-base block ${isQuebra ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                              {diffTon > 0 ? `+${diffTon.toFixed(3)}` : diffTon.toFixed(3)} ton ({diffKg > 0 ? `+${diffKg.toFixed(0)}` : diffKg.toFixed(0)} kg)
                            </span>
                            <span className={`text-[11px] font-bold ${isQuebra ? 'text-red-500' : 'text-emerald-600'}`}>
                              {isQuebra ? 'Quebra de carga apurada' : 'Sem quebra / Sobra'}
                            </span>
                          </div>
                        );
                      })()
                    ) : (
                      <span className="text-gray-400 font-mono text-sm block">Informe o peso descarregado</span>
                    )}
                  </div>
                </div>

                {/* Seção 3: Botão / Caixa de Validação Formal */}
                {!canValidateTicket ? (
                  <div className="p-4 rounded-2xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 flex items-start gap-3">
                    <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-700 dark:text-amber-300 shrink-0">
                      <ShieldAlert className="w-6 h-6" />
                    </div>
                    <div>
                      <h5 className="text-sm font-bold text-gray-900 dark:text-white">
                        Validação de Ticket Restrita à Equipe Interna
                      </h5>
                      <p className="text-xs text-gray-600 dark:text-gray-300 mt-0.5 leading-relaxed">
                        O ticket de descarga e o peso descarregado foram registrados. A validação formal do ticket e o avanço para a etapa de liquidação de saldo são restritos aos perfis Fiscal, Supervisor, Financeiro, Diretor ou Administrador (bloqueado para Embarcador).
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className={`p-4 rounded-2xl border transition-all ${
                    isTicketValidated
                      ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-700'
                      : 'bg-amber-50/70 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800'
                  }`}>
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className={`p-2.5 rounded-xl ${
                          isTicketValidated
                            ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/20'
                            : 'bg-amber-500/20 text-amber-700 dark:text-amber-300'
                        }`}>
                          {isTicketValidated ? <CheckCircle2 className="w-6 h-6" /> : <ShieldCheck className="w-6 h-6" />}
                        </div>
                        <div>
                          <h5 className={`text-sm font-bold ${isTicketValidated ? 'text-emerald-900 dark:text-emerald-200' : 'text-gray-900 dark:text-white'}`}>
                            {isTicketValidated ? 'Ticket e Peso Descarregado Validados com Sucesso!' : 'Validação Obrigatória para Prosseguir'}
                          </h5>
                          <p className="text-xs text-gray-600 dark:text-gray-300">
                            {isTicketValidated
                              ? `Validado por ${currentUser?.name || 'Operador'} • Peso confirmado: ${unloadedTonnage} ton. O avanço para Quitação de Saldo está liberado.`
                              : 'Confira o ticket e peso acima e confirme a validação para desbloquear o botão Salvar e Avançar.'}
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          if (!unloadedTonnage || Number(unloadedTonnage) <= 0) {
                            showToast('Informe o peso descarregado antes de validar.', 'warning');
                            return;
                          }
                          const nextVal = !isTicketValidated;
                          setIsTicketValidated(nextVal);
                          if (nextVal) {
                            showToast('Ticket e peso validados com sucesso! Botão "Salvar e Avançar" liberado.', 'success');
                          }
                        }}
                        className={`px-5 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 shadow-sm transition-all whitespace-nowrap active:scale-95 ${
                          isTicketValidated
                            ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                            : 'bg-primary text-white hover:bg-primary-dark shadow-primary/20 hover:shadow-md'
                        }`}
                      >
                        {isTicketValidated ? (
                          <>
                            <Check className="w-4 h-4" /> Validado (Clique para Desmarcar)
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="w-4 h-4" /> Validar Ticket e Peso
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : shipment.status === ShipmentStatus.AguardandoPagamentoSaldo ? (
              <div className="space-y-6">
                {/* Resumo de Pesos para conferência */}
                {(shipment.unloadedTonnage !== undefined || shipment.shipmentTonnage !== undefined) && (
                  <div className="bg-gray-50 dark:bg-gray-900/40 p-4 rounded-xl border dark:border-gray-700 grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="text-center">
                      <p className="text-[10px] text-gray-500 uppercase font-bold mb-1">Peso Carregado (A)</p>
                      <p className="text-sm font-mono font-bold text-gray-800 dark:text-gray-200">{shipment.shipmentTonnage?.toLocaleString('pt-BR')} ton</p>
                    </div>
                    <div className="text-center border-x dark:border-gray-700">
                      <p className="text-[10px] text-gray-500 uppercase font-bold mb-1">Peso Descarregado (B)</p>
                      <p className="text-sm font-mono font-bold text-gray-800 dark:text-gray-200">{shipment.unloadedTonnage?.toLocaleString('pt-BR') || '---'} ton</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] text-gray-500 uppercase font-bold mb-1">Diferença (B - A)</p>
                      {shipment.unloadedTonnage && shipment.shipmentTonnage ? (
                        <p className={`text-sm font-mono font-bold ${(shipment.unloadedTonnage - shipment.shipmentTonnage) < -0.001 ? 'text-red-600' : 'text-emerald-600'}`}>
                          {(shipment.unloadedTonnage - shipment.shipmentTonnage).toLocaleString('pt-BR')} ton
                        </p>
                      ) : <p className="text-sm font-mono font-bold text-gray-400">---</p>}
                    </div>
                  </div>
                )}

                {/* Alerta de Embarque 100% no Adiantamento */}
                {isShipment100PercentAdvance(shipment) && (
                  <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 rounded-xl border border-emerald-300 dark:border-emerald-700/80 flex items-center gap-3">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <div>
                      <p className="text-sm font-bold text-emerald-900 dark:text-emerald-200">
                        Embarque 100% Quitado no Adiantamento (Saldo R$ 0,00)
                      </p>
                      <p className="text-xs text-emerald-700 dark:text-emerald-300">
                        O frete deste motorista foi 100% adiantado na contratação e não restam valores pendentes de saldo. O comprovante de quitação foi dispensado automaticamente. Clique em "Finalizar Embarque" para concluir.
                      </p>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <FileInput
                    label={documentName}
                    files={singleFiles}
                    onFileChange={(f) => handleSingleFilesChange(f, documentName)}
                    onInspectFile={(file, type) => setSelectedDocForDetails({ fileOrUrl: file, docType: type, docName: file.name })}
                    checkDuplicateFile={checkDuplicateFile}
                  />
                  <div>
                    <label className="block text-sm font-medium mb-1">Saldo estimado</label>
                    <input
                      type="number"
                      value={balanceToReceiveValue}
                      onChange={(e) => setBalanceToReceiveValue(e.target.value === '' ? '' : Number(e.target.value))}
                      className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-sm font-medium">Valor a Descontar</label>
                      {(shipment.unloadedTonnage !== undefined && shipment.shipmentTonnage !== undefined && (shipment.unloadedTonnage - shipment.shipmentTonnage) < -0.001) && (
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${isBreakageWaived ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300'}`}>
                          {isBreakageWaived ? 'Abonado' : 'Quebra'}
                        </span>
                      )}
                    </div>
                    <input
                      type="number"
                      value={isBreakageWaived ? 0 : discountValue}
                      disabled={isBreakageWaived}
                      placeholder={isBreakageWaived ? 'R$ 0,00 (Abonado)' : '0,00'}
                      onChange={(e) => setDiscountValue(e.target.value === '' ? '' : Number(e.target.value))}
                      className={`w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600 ${isBreakageWaived ? 'bg-gray-100 dark:bg-gray-800/60 opacity-80 cursor-not-allowed text-emerald-600 dark:text-emerald-400 font-bold' : ((shipment.unloadedTonnage !== undefined && shipment.shipmentTonnage !== undefined && (shipment.unloadedTonnage - shipment.shipmentTonnage) < -0.001 && !discountValue) ? 'border-red-500 bg-red-50 dark:bg-red-900/10' : '')}`}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Valor Líquido de Saldo</label>
                    <input
                      type="number"
                      value={netBalanceValue}
                      onChange={(e) => setNetBalanceValue(e.target.value === '' ? '' : Number(e.target.value))}
                      className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600 font-bold text-primary"
                    />
                  </div>
                </div>

                {/* Detalhamento do Ajuste de Quebra (Passos 5 e 6) */}
                {(() => {
                  const isPfShipment = shipment.driverFreightType === 'PF' || shipment.anttModality === 'TAC';
                  const pesoSaida = shipment.shipmentTonnage || 0;
                  const pesoChegada = shipment.unloadedTonnage || 0;
                  const diferencaKg = (pesoSaida > 0 && pesoChegada > 0 && pesoChegada < pesoSaida) 
                    ? (pesoSaida - pesoChegada) * 1000 
                    : 0;

                  if (diferencaKg <= 0) return null;

                  const rateSnapshot = shipment.driverFreightRateSnapshot || cargo?.driverFreightValuePerTon || 0;
                  const freteUnitarioKg = rateSnapshot > 0 ? (rateSnapshot / 1000) : (totalDriverFreight / (pesoSaida * 1000));
                  const valKgMercadoria = isPfShipment ? 0.1170 : 0.3736;
                  
                  const descMercadoria = Number((diferencaKg * valKgMercadoria).toFixed(2));
                  const descEstornoFrete = Number((diferencaKg * freteUnitarioKg).toFixed(2));
                  const totalQuebraCalculada = Number((descMercadoria + descEstornoFrete).toFixed(2));

                  return (
                    <div className="p-3 bg-red-50/60 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 rounded-xl space-y-2 text-xs">
                      <div className="flex items-center justify-between font-bold text-red-900 dark:text-red-200">
                        <span>⚖️ Memória de Ajuste de Quebra / Falta na Balança de Destino</span>
                        <span className="font-mono">Quebra: {(diferencaKg / 1000).toFixed(2)} t ({diferencaKg.toFixed(0)} kg)</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <div className="p-2 bg-white dark:bg-gray-800 rounded-lg border border-red-100 dark:border-red-900/30">
                          <span className="text-[10px] text-gray-500 dark:text-gray-400 block font-semibold">Desconto 1: Mercadoria Faltante</span>
                          <span className="font-bold text-red-600 dark:text-red-400">- {formatCurrency(descMercadoria)}</span>
                          <span className="text-[10px] text-gray-400 block font-mono">({diferencaKg.toFixed(0)} kg × {formatCurrency(valKgMercadoria)}/kg)</span>
                        </div>
                        <div className="p-2 bg-white dark:bg-gray-800 rounded-lg border border-red-100 dark:border-red-900/30">
                          <span className="text-[10px] text-gray-500 dark:text-gray-400 block font-semibold">Desconto 2: Estorno Frete Não Transportado</span>
                          <span className="font-bold text-red-600 dark:text-red-400">- {formatCurrency(descEstornoFrete)}</span>
                          <span className="text-[10px] text-gray-400 block font-mono">({diferencaKg.toFixed(0)} kg × {formatCurrency(freteUnitarioKg)}/kg)</span>
                        </div>
                        <div className="p-2 bg-white dark:bg-gray-800 rounded-lg border border-red-100 dark:border-red-900/30 flex flex-col justify-between">
                          <span className="text-[10px] text-gray-500 dark:text-gray-400 block font-semibold">Total Desconto Quebra</span>
                          <div className="flex items-center justify-between">
                            <span className="font-black text-red-700 dark:text-red-300">- {formatCurrency(totalQuebraCalculada)}</span>
                            {!isBreakageWaived && (
                              <button
                                type="button"
                                onClick={() => setDiscountValue(totalQuebraCalculada)}
                                className="px-2 py-1 bg-red-100 hover:bg-red-200 dark:bg-red-900/60 dark:hover:bg-red-900 text-red-800 dark:text-red-200 rounded text-[10px] font-bold transition-all"
                              >
                                Preencher
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Alerta de Saldo Negativo / Ressarcimento pelo Motorista */}
                {(Number(balanceToReceiveValue || 0) - Number(isBreakageWaived ? 0 : (discountValue || 0))) < 0 && (
                  <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border-2 border-amber-400 dark:border-amber-700 rounded-xl flex items-center gap-3">
                    <span className="text-xl">⚠️</span>
                    <div>
                      <p className="text-xs font-bold text-amber-900 dark:text-amber-200">
                        Saldo Final Devedor: Valor a ser ressarcido pelo motorista à contratante
                      </p>
                      <p className="text-sm font-black text-red-600 dark:text-red-400">
                        {formatCurrency(Math.abs(Number(balanceToReceiveValue || 0) - Number(isBreakageWaived ? 0 : (discountValue || 0))))} (A Ressarcir)
                      </p>
                    </div>
                  </div>
                )}

                {/* Alerta / Ação de Quebra */}
                {shipment.unloadedTonnage !== undefined && shipment.shipmentTonnage !== undefined && (shipment.unloadedTonnage - shipment.shipmentTonnage) < -0.001 && (
                  !isBreakageWaived ? (
                    <div className="bg-red-50 dark:bg-red-900/10 border-2 border-red-200 dark:border-red-800/60 p-4 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm">
                      <div className="flex items-start gap-3">
                        <div className="text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                        </div>
                        <div>
                          <h5 className="text-sm font-bold text-red-800 dark:text-red-300">Quebra de Carga Detectada</h5>
                          <p className="text-xs text-red-700 dark:text-red-400 mt-0.5">
                            Constatado peso descarregado menor que o peso carregado (Diferença: <strong className="font-mono">{(shipment.unloadedTonnage - shipment.shipmentTonnage).toFixed(2)} ton</strong>).<br />
                            Informe o valor do desconto referente à quebra ou <strong>abone a quebra</strong> para isentar o motorista de desconto.
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setIsBreakageWaived(true);
                          setDiscountValue(0);
                        }}
                        className="flex-shrink-0 inline-flex items-center gap-2 px-3.5 py-2 bg-white dark:bg-gray-800 border-2 border-emerald-500 hover:border-emerald-600 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 rounded-lg text-xs font-bold transition-all shadow-sm"
                      >
                        <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                        Abonar Quebra de Carga
                      </button>
                    </div>
                  ) : (
                    <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 p-3.5 rounded-xl flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs font-bold text-emerald-800 dark:text-emerald-300">
                        <span>✓ Quebra de carga abonada com sucesso (Sem desconto ao motorista).</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setIsBreakageWaived(false)}
                        className="text-xs text-emerald-700 dark:text-emerald-400 underline font-semibold hover:text-emerald-900"
                      >
                        Desfazer abono
                      </button>
                    </div>
                  )
                )}
              </div>
            ) : shipment.status === ShipmentStatus.PreCadastro ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
                  <FileInput
                    label={documentName || "Comprovante de Cadastro"}
                    files={singleFiles}
                    onFileChange={(f) => handleSingleFilesChange(f, documentName || "Comprovante de Cadastro")}
                    onInspectFile={(file, type) => setSelectedDocForDetails({ fileOrUrl: file, docType: type, docName: file.name })}
                    checkDuplicateFile={checkDuplicateFile}
                  />
                  <div className={`p-4 rounded-xl border transition-all ${
                    !codigoAtua.trim()
                      ? 'bg-amber-50/60 dark:bg-amber-950/20 border-amber-300 dark:border-amber-700/60 ring-2 ring-amber-400/20'
                      : 'bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-700/60'
                  }`}>
                    <label className="block text-sm font-bold text-gray-800 dark:text-gray-200 mb-1 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <span>CODG. ATUA</span>
                        <span className="text-xs font-normal text-gray-500 dark:text-gray-400">(Código de Atualização Cadastral)</span>
                      </span>
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${
                        !codigoAtua.trim()
                          ? 'text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/60 border-amber-300 dark:border-amber-700'
                          : 'text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/60 border-emerald-300 dark:border-emerald-700'
                      }`}>
                        {!codigoAtua.trim() ? '* Obrigatório' : '✓ Preenchido'}
                      </span>
                    </label>
                    <input
                      type="text"
                      value={codigoAtua}
                      onChange={(e) => setCodigoAtua(e.target.value)}
                      placeholder="Ex: ATUA-123456 ou Cód. do Cadastro"
                      className={`p-2.5 w-full border rounded-lg font-mono text-sm focus:ring-2 focus:ring-primary/20 transition-all ${
                        !codigoAtua.trim()
                          ? 'border-amber-400 dark:border-amber-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-amber-400/70'
                          : 'border-emerald-500 dark:border-emerald-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white'
                      }`}
                    />
                    <p className={`text-[11px] mt-1.5 font-medium ${
                      !codigoAtua.trim() ? 'text-amber-600 dark:text-amber-400' : 'text-gray-500 dark:text-gray-400'
                    }`}>
                      {!codigoAtua.trim() 
                        ? '⚠️ Campo obrigatório para liberar o salvamento e avanço do cadastro do motorista.' 
                        : 'Código vinculado à coluna CODG. ATUA e ao cadastro permanente do motorista.'}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <FileInput
                label={documentName}
                files={singleFiles}
                onFileChange={(f) => handleSingleFilesChange(f, documentName)}
                onInspectFile={(file, type) => setSelectedDocForDetails({ fileOrUrl: file, docType: type, docName: file.name })}
                checkDuplicateFile={checkDuplicateFile}
              />
            )}

            {/* PAINEL DE ACRÉSCIMOS / PAGAMENTOS AVULSOS AO MOTORISTA (A PARTIR DE AG. DESCARGA EM DIANTE) */}
            {isEligibleForDriverExtra && (
              <div className="mt-6 border-t border-slate-200 dark:border-slate-800 pt-5 space-y-4">
                {/* Cabeçalho do Card */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 rounded-2xl bg-gradient-to-r from-amber-500/10 via-purple-500/10 to-blue-500/10 border border-amber-200 dark:border-amber-900/40">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-400 shrink-0">
                      <Coins className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wide">
                          Acréscimos / Pagamentos Avulsos ao Motorista
                        </h4>
                        <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300 dark:border-amber-700">
                          Custo Adicional • Abatido do Lucro
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                        Lançamento de diárias, estadias, bônus e ajudas de custo com comprovante anexado, registro de hora/usuário e abatimento no resultado final.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
                    {totalDriverExtraPayments > 0 && (
                      <div className="text-right">
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-bold uppercase">Total Acréscimos</span>
                        <span className="text-sm font-black font-mono text-amber-600 dark:text-amber-400">
                          R$ {totalDriverExtraPayments.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => setIsAddingExtraPayment(!isAddingExtraPayment)}
                      className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer ${
                        isAddingExtraPayment
                          ? 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200 hover:bg-slate-300'
                          : 'bg-amber-600 hover:bg-amber-700 text-white shadow-amber-600/20 hover:scale-[1.02]'
                      }`}
                    >
                      {isAddingExtraPayment ? (
                        <>
                          <X className="w-4 h-4" /> Cancelar Lançamento
                        </>
                      ) : (
                        <>
                          <Plus className="w-4 h-4" /> Adicionar Acréscimo
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Formulário de Novo Acréscimo Avulso */}
                {isAddingExtraPayment && (
                  <form onSubmit={handleSaveExtraPayment} className="p-4 rounded-2xl bg-white dark:bg-slate-900 border-2 border-amber-400/50 dark:border-amber-600/50 shadow-lg space-y-4 animate-in fade-in zoom-in-95 duration-150">
                    <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2.5">
                      <span className="text-xs font-black uppercase text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                        <DollarSign className="w-4 h-4 text-amber-500" />
                        Lançar Novo Pagamento Avulso ao Motorista
                      </span>
                      <span className="text-[11px] text-slate-400 font-medium">
                        Registrado por: <strong>{currentUser.name}</strong> ({currentUser.profile})
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      {/* Valor */}
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                          Valor do Pagamento (R$) <span className="text-rose-500">*</span>
                        </label>
                        <div className="relative">
                          <span className="absolute left-3 top-2.5 text-xs font-bold text-slate-400">R$</span>
                          <input
                            type="text"
                            required
                            placeholder="0,00"
                            value={extraAmount}
                            onChange={(e) => setExtraAmount(e.target.value)}
                            className="w-full pl-9 pr-3 py-2 rounded-xl text-sm font-bold font-mono border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-amber-500"
                          />
                        </div>
                      </div>

                      {/* Motivo / Finalidade */}
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                          Motivo / Finalidade <span className="text-rose-500">*</span>
                        </label>
                        <select
                          value={extraReason}
                          onChange={(e) => setExtraReason(e.target.value)}
                          className="w-full px-3 py-2 rounded-xl text-xs sm:text-sm border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-amber-500"
                        >
                          <option value="Diária / Estadia">Diária / Estadia</option>
                          <option value="Ajuda de Custo">Ajuda de Custo</option>
                          <option value="Adicional de Descarga">Adicional de Descarga</option>
                          <option value="Bônus Operacional">Bônus Operacional</option>
                          <option value="Reembolso de Despesas">Reembolso de Despesas</option>
                          <option value="Outro">Outro Acréscimo</option>
                        </select>
                      </div>

                      {/* Data e Hora do Pagamento */}
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                          Data e Hora do Pagamento <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="datetime-local"
                          required
                          value={extraPaidAt}
                          onChange={(e) => setExtraPaidAt(e.target.value)}
                          className="w-full px-3 py-2 rounded-xl text-xs border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-amber-500"
                        />
                      </div>

                      {/* Forma de Pagamento */}
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                          Forma de Pagamento
                        </label>
                        <select
                          value={extraPaymentMethod}
                          onChange={(e) => setExtraPaymentMethod(e.target.value)}
                          className="w-full px-3 py-2 rounded-xl text-xs sm:text-sm border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-amber-500"
                        >
                          <option value="PIX">PIX</option>
                          <option value="Transferência Bancária">Transferência Bancária</option>
                          <option value="Dinheiro em Espécie">Dinheiro em Espécie</option>
                          <option value="Cartão Frete / Abastecimento">Cartão Frete / Abastecimento</option>
                          <option value="Outro">Outro</option>
                        </select>
                      </div>
                    </div>

                    {/* Anexo de Comprovante de Pagamento com Botão Colar Imagem */}
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                        Comprovante de Pagamento / Recibo do Acréscimo
                      </label>
                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                        <label className="flex-1 flex items-center justify-center gap-2 p-2.5 border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-amber-500 rounded-xl cursor-pointer bg-slate-50/50 dark:bg-slate-950/50 transition-colors">
                          <UploadCloud className="w-4 h-4 text-amber-500" />
                          <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                            {extraReceiptFile ? extraReceiptFile.name : 'Clique para procurar comprovante (PDF ou imagem)'}
                          </span>
                          <input
                            type="file"
                            accept=".pdf,image/*"
                            onChange={(e) => handleExtraReceiptFileSelect(e.target.files?.[0] || null)}
                            className="hidden"
                          />
                        </label>

                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              const clipItems = await navigator.clipboard.read();
                              for (const item of clipItems) {
                                const imgType = item.types.find(t => t.startsWith('image/'));
                                if (imgType) {
                                  const blob = await item.getType(imgType);
                                  const file = new File([blob], `comprovante_${Date.now()}.png`, { type: imgType });
                                  handleExtraReceiptFileSelect(file);
                                  showToast('Imagem colada com sucesso!', 'success');
                                  return;
                                }
                              }
                              showToast('Nenhuma imagem encontrada na área de transferência. Use Ctrl+C em uma imagem e clique novamente.', 'info');
                            } catch (err) {
                              showToast('Pressione Ctrl+V em qualquer lugar da tela para colar o comprovante copiado.', 'info');
                            }
                          }}
                          className="px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer shrink-0"
                          title="Colar comprovante copiado da área de transferência"
                        >
                          <Clipboard className="w-4 h-4 text-blue-500" />
                          <span>Colar Imagem (Ctrl+V)</span>
                        </button>

                        {extraReceiptFile && (
                          <button
                            type="button"
                            onClick={() => handleExtraReceiptFileSelect(null)}
                            className="p-2.5 rounded-xl border border-rose-200 dark:border-rose-800 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-600 transition-colors cursor-pointer"
                            title="Remover anexo"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>

                      {extraReceiptPreview && (
                        <div className="mt-2 p-2 bg-slate-100 dark:bg-slate-800/80 rounded-xl flex items-center justify-between text-xs text-slate-700 dark:text-slate-300">
                          <span className="flex items-center gap-2 truncate">
                            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                            <span className="truncate">Comprovante carregado: <strong>{extraReceiptFile?.name || 'Imagem colada'}</strong></span>
                          </span>
                          {extraReceiptPreview.startsWith('data:image/') && (
                            <img src={extraReceiptPreview} alt="Prévia" className="h-8 w-12 object-cover rounded border border-slate-300 dark:border-slate-700 shrink-0" />
                          )}
                        </div>
                      )}
                    </div>

                    {/* Descrição / Justificativa */}
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                        Descrição / Justificativa (Opcional)
                      </label>
                      <textarea
                        rows={2}
                        value={extraDescription}
                        onChange={(e) => setExtraDescription(e.target.value)}
                        placeholder="Ex: Motorista aguardou 2 dias a mais para descarregar conforme combinado com a fazenda..."
                        className="w-full px-3 py-2 rounded-xl text-xs border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-amber-500"
                      />
                    </div>

                    {/* Auditoria e Botões */}
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-amber-500" />
                        O valor será deduzido do resultado e registrado permanentemente com data, hora e usuário.
                      </span>
                      <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                        <button
                          type="button"
                          onClick={() => {
                            setIsAddingExtraPayment(false);
                            setExtraReceiptFile(null);
                            setExtraReceiptPreview(null);
                          }}
                          className="px-4 py-2 rounded-xl text-xs font-bold border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                        >
                          Cancelar
                        </button>
                        <button
                          type="submit"
                          disabled={isSavingExtra}
                          className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-md shadow-amber-600/30 transition-all cursor-pointer disabled:opacity-50"
                        >
                          {isSavingExtra ? (
                            <>
                              <LoaderIcon className="w-4 h-4 animate-spin" /> Salvando...
                            </>
                          ) : (
                            <>
                              <Check className="w-4 h-4" /> Confirmar e Salvar Acréscimo
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </form>
                )}

                {/* Lista de Acréscimos Lançados */}
                {driverExtraPayments.length === 0 ? (
                  <div className="p-3.5 rounded-xl bg-slate-50/70 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 text-center">
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Nenhum valor avulso de acréscimo lançado para este motorista até o momento.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {driverExtraPayments.map((p) => {
                      const reasonColor =
                        p.reason.toLowerCase().includes('diária') || p.reason.toLowerCase().includes('estadia')
                          ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border-blue-200 dark:border-blue-800'
                          : p.reason.toLowerCase().includes('ajuda')
                          ? 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 border-purple-200 dark:border-purple-800'
                          : p.reason.toLowerCase().includes('descarga')
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                          : p.reason.toLowerCase().includes('bônus') || p.reason.toLowerCase().includes('bonus')
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                          : 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200 border-slate-200 dark:border-slate-700';

                      const formattedPaidAt = (() => {
                        try {
                          const d = new Date(p.paidAt);
                          if (!isNaN(d.getTime())) {
                            return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
                          }
                        } catch (e) {}
                        return p.paidAt;
                      })();

                      const formattedCreatedAt = (() => {
                        try {
                          const d = new Date(p.createdAt);
                          if (!isNaN(d.getTime())) {
                            return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
                          }
                        } catch (e) {}
                        return p.createdAt;
                      })();

                      return (
                        <div key={p.id} className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between gap-2.5 hover:border-amber-400 dark:hover:border-amber-600 transition-colors">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${reasonColor}`}>
                                {p.reason}
                              </span>
                              {p.paymentMethod && (
                                <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                                  {p.paymentMethod}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-base font-black font-mono text-amber-600 dark:text-amber-400">
                                R$ {Number(p.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleDeleteExtraPayment(p.id)}
                                className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                                title="Excluir este acréscimo"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          {p.description && (
                            <p className="text-xs text-slate-600 dark:text-slate-300 italic bg-slate-50 dark:bg-slate-950 p-2 rounded-xl">
                              "{p.description}"
                            </p>
                          )}

                          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400 space-y-1">
                            <div className="flex items-center justify-between">
                              <span>🕒 Pago em: <strong className="text-slate-700 dark:text-slate-200">{formattedPaidAt}</strong></span>
                              {p.receiptUrl ? (
                                <button
                                  type="button"
                                  onClick={() => openDocumentInNewTab(p.receiptUrl!)}
                                  className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:text-blue-700 dark:text-blue-400 hover:underline cursor-pointer"
                                >
                                  <Eye className="w-3 h-3" /> Ver Comprovante
                                </button>
                              ) : (
                                <span className="text-[10px] text-slate-400 italic">Sem anexo</span>
                              )}
                            </div>
                            <div className="text-[10px] text-slate-400 flex items-center justify-between">
                              <span>Lançado por: <strong className="text-slate-600 dark:text-slate-300">{p.createdByName}</strong> {p.createdByRole ? `(${p.createdByRole})` : ''}</span>
                              <span>{formattedCreatedAt}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {showRouteField && (
              <div className="mt-6 border-t dark:border-gray-700 pt-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Coluna Esquerda: Inputs */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-bold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                        <span>Rota Obrigatória</span>
                        <span className="text-[10px] text-amber-700 dark:text-amber-300 font-extrabold bg-amber-100 dark:bg-amber-900/60 px-2 py-0.5 rounded-full border border-amber-300 dark:border-amber-700">
                          Passo Obrigatório
                        </span>
                      </label>

                      {!isReadOnlyRoute && (
                        <button
                          type="button"
                          onClick={handleFetchSuggestions}
                          disabled={isLoadingSuggestions}
                          className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:text-primary-dark transition-colors"
                        >
                          <MapPinIcon className="w-3.5 h-3.5" />
                          {isLoadingSuggestions ? 'Sugerindo...' : 'Sugerir Rotas'}
                        </button>
                      )}
                    </div>

                    <textarea
                      rows={4}
                      value={route}
                      onChange={(e) => setRoute(e.target.value)}
                      readOnly={isReadOnlyRoute}
                      placeholder="Ex: Saindo pela BR-163 até Rondonópolis, seguindo pela BR-364..."
                      className={`w-full p-4 border border-gray-200 dark:border-gray-700 rounded-2xl focus:ring-4 focus:ring-primary/10 focus:border-primary dark:bg-gray-800 transition-all font-mono text-sm min-h-[120px] shadow-sm ${isReadOnlyRoute ? 'bg-gray-50/50 dark:bg-gray-900/50 cursor-default shadow-none' : ''}`}
                    />

                    <div className="flex items-center gap-2 text-[11px] text-gray-500 dark:text-gray-400">
                      <div className={`w-2 h-2 ${isReadOnlyRoute ? 'bg-emerald-500' : 'bg-blue-600'} rounded-full`} />
                      {isReadOnlyRoute ? (
                        <span>Trajeto validado via <span className="font-bold">OSRM Engine</span></span>
                      ) : (
                        <span>Baseado na rota: <span className="font-bold text-gray-700 dark:text-gray-300">{cargo?.origin} → {cargo?.destination}</span></span>
                      )}
                    </div>

                    {/* Box de Sugestões Encontradas - Somente modo edição */}
                    {!isReadOnlyRoute && (
                      <div className="bg-blue-50/30 dark:bg-blue-900/5 rounded-2xl border border-blue-100 dark:border-blue-800/50 overflow-hidden">
                        <div className="px-4 py-2 bg-blue-50/50 dark:bg-blue-900/10 border-b border-blue-100 dark:border-blue-800">
                          <h4 className="text-[10px] font-bold text-blue-700 dark:text-blue-400 uppercase tracking-widest">
                            Sugestões Encontradas (Clique para usar)
                          </h4>
                        </div>
                        <div className="p-4 space-y-2">
                          {isLoadingSuggestions ? (
                            <div className="flex items-center justify-center py-4 text-blue-500">
                              <LoaderIcon className="w-5 h-5 animate-spin" />
                              <span className="ml-2 text-xs font-semibold animate-pulse">Buscando...</span>
                            </div>
                          ) : suggestions.length > 0 ? (
                            suggestions.map((s: RouteSuggestion, idx: number) => (
                              <button
                                key={idx}
                                type="button"
                                onClick={() => setRoute(s.formatted)}
                                className="w-full text-left p-3 bg-white dark:bg-gray-800 border border-blue-50 dark:border-blue-900 rounded-xl text-[11px] font-medium text-gray-600 dark:text-gray-300 hover:border-blue-300 dark:hover:border-blue-700 hover:shadow-sm transition-all"
                              >
                                {s.formatted}
                              </button>
                            ))
                          ) : (
                            <p className="text-center py-2 text-[11px] text-gray-400 italic">Clique em Sugerir Rotas para ver sugestões</p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Coluna Direita: Mapa */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-bold text-gray-700 dark:text-gray-300">
                        Visualização do Trajeto
                      </label>
                      <span className="px-3 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-[10px] font-bold rounded-full uppercase tracking-wider">
                        Rodovias Ativas
                      </span>
                    </div>

                    <div className="relative group flex-grow">
                      <div
                        ref={mapContainerRef}
                        className="w-full h-[320px] bg-gray-100 dark:bg-gray-900 rounded-3xl border-2 border-gray-100 dark:border-gray-800 overflow-hidden shadow-xl"
                        id="route-map-modal"
                      />

                      {!isReadOnlyRoute && (
                        <button
                          type="button"
                          onClick={handleTraceRoute}
                          className="absolute bottom-4 right-4 z-[1000] p-3 bg-primary text-white rounded-xl shadow-lg hover:bg-primary-dark transition-all transform hover:scale-105 active:scale-95"
                          title="Atualizar Mapa"
                        >
                          <MapPinIcon className="w-5 h-5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {requiresBankDetails && (
              <div className="mt-6 border-t pt-4">
                <label className="block font-semibold mb-2">Dados Bancários</label>
                <textarea value={bankDetails} onChange={(e) => setBankDetails(e.target.value)} className="w-full p-3 border rounded dark:bg-gray-700 dark:border-gray-600" rows={3} placeholder="Banco, Ag, Conta..." />
              </div>
            )}

            {error && <p className="mt-4 text-sm text-red-500 font-bold">{error}</p>}

            <div className="mt-8 flex justify-between items-center">
              <div>
                {(shipment.status === ShipmentStatus.AguardandoNota || shipment.status === ShipmentStatus.AguardandoFiscal) && (
                  <button onClick={() => window.open('https://transcunha.atua.com.br/adm/fil_ctrc_emissao.php', '_blank')} className="px-4 py-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 flex items-center gap-2 font-bold shadow-md shadow-emerald-200 dark:shadow-none">
                    <ExternalLinkIcon className="w-4 h-4" /> Emitir Documentos
                  </button>
                )}
              </div>
              <div className="flex items-center gap-4">
                <button onClick={onClose} className="px-6 py-2 text-gray-500 hover:text-gray-700 font-bold transition-colors">Cancelar</button>
                <div className="relative group">
                  <button
                    onClick={handleSave}
                    disabled={
                      isSaving || 
                      (shipment.status === ShipmentStatus.AguardandoAdiantamento && (!canSave || isMissingAdiantamentoReceipt)) || 
                      (shipment.status === ShipmentStatus.ValidacaoTicket && (!canValidateTicket || !isTicketValidated)) ||
                      (shipment.status === ShipmentStatus.PreCadastro && (!codigoAtua || !codigoAtua.trim())) ||
                      hasUnresolvedFiscalDivergence ||
                      (isAguardandoAdiantamento && hasUnresolvedAdvanceDivergence) ||
                      hasAttachmentMismatch
                      || hasMissingFiscalDocs
                      || fiscalAttachmentMismatches.length > 0
                    }
                    className={`px-8 py-2 text-white rounded-xl font-bold shadow-lg transition-all active:scale-95 flex items-center gap-2 ${(
                      isSaving || 
                      (shipment.status === ShipmentStatus.AguardandoAdiantamento && (!canSave || isMissingAdiantamentoReceipt)) || 
                      (shipment.status === ShipmentStatus.ValidacaoTicket && (!canValidateTicket || !isTicketValidated)) ||
                      (shipment.status === ShipmentStatus.PreCadastro && (!codigoAtua || !codigoAtua.trim())) ||
                      hasUnresolvedFiscalDivergence ||
                      (isAguardandoAdiantamento && hasUnresolvedAdvanceDivergence) ||
                      hasAttachmentMismatch
                      || hasMissingFiscalDocs
                      || fiscalAttachmentMismatches.length > 0
                    )
                        ? 'bg-gray-400 dark:bg-gray-600 cursor-not-allowed shadow-none'
                        : 'bg-primary hover:bg-primary-dark shadow-primary/20'
                      }`}
                  >
                    {isSaving ? (
                      <>
                        <LoaderIcon className="w-4 h-4 animate-spin" /> Salvando...
                      </>
                    ) : (shipment.status === ShipmentStatus.ValidacaoTicket && isShipment100PercentAdvance(shipment)) ? (
                      'Salvar e Concluir Embarque (100% Adiantamento)'
                    ) : (shipment.status === ShipmentStatus.AguardandoPagamentoSaldo && isShipment100PercentAdvance(shipment)) ? (
                      'Finalizar Embarque (Saldo Quitado)'
                    ) : 'Salvar e Avançar'}
                  </button>
                  {isMissingAdiantamentoReceipt && (
                    <div className="absolute bottom-full right-0 mb-2 hidden group-hover:block bg-rose-950 text-rose-200 border border-rose-700 text-[11px] font-semibold py-1.5 px-3 rounded-lg shadow-xl whitespace-nowrap z-50 pointer-events-none">
                      ⛔ Para avançar, anexe obrigatoriamente o Comprovante de Pagamento do Adiantamento.
                    </div>
                  )}
                  {hasMissingFiscalDocs && (
                    <div className="absolute bottom-full right-0 mb-2 hidden group-hover:block bg-rose-950 text-rose-200 border border-rose-700 text-[11px] font-semibold py-1.5 px-3 rounded-lg shadow-xl whitespace-nowrap z-50 pointer-events-none">
                      ⛔ Para avançar, anexe obrigatoriamente o CT-e, o MDF-e e a Carta Frete corretos em seus respectivos campos. Pendente: {missingFiscalDocs.join(', ')}
                    </div>
                  )}
                  {fiscalAttachmentMismatches.length > 0 && !hasMissingFiscalDocs && (
                    <div className="absolute bottom-full right-0 mb-2 hidden group-hover:block bg-rose-950 text-rose-200 border border-rose-700 text-[11px] font-semibold py-1.5 px-3 rounded-lg shadow-xl whitespace-nowrap z-50 pointer-events-none">
                      ⛔ {fiscalAttachmentMismatches[0].message}
                    </div>
                  )}
                  {hasAttachmentMismatch && (
                    <div className="absolute bottom-full right-0 mb-2 hidden group-hover:block bg-rose-950 text-rose-200 border border-rose-700 text-[11px] font-semibold py-1.5 px-3 rounded-lg shadow-xl whitespace-nowrap z-50 pointer-events-none">
                      ⚠️ Corrija os documentos anexados em campos incorretos (ex: MDF-e em Carta Frete) para liberar o avanço
                    </div>
                  )}
                  {isAguardandoAdiantamento && hasUnresolvedAdvanceDivergence ? (
                    <div className="absolute bottom-full right-0 mb-2 hidden group-hover:block bg-amber-950 text-amber-200 border border-amber-700 text-[11px] font-semibold py-1.5 px-3 rounded-lg shadow-xl whitespace-nowrap z-50 pointer-events-none">
                      ⚠️ O Adiantamento PG precisa ser igual ao referente Adiantamento de viagem da Carta Frete ({formatCurrency(cartaFreteExtractedAdvance || 0)}) para liberar o avanço
                    </div>
                  ) : hasUnresolvedFiscalDivergence ? (
                    <div className="absolute bottom-full right-0 mb-2 hidden group-hover:block bg-amber-950 text-amber-200 border border-amber-700 text-[11px] font-semibold py-1.5 px-3 rounded-lg shadow-xl whitespace-nowrap z-50 pointer-events-none">
                      ⚠️ Confirme e valide as divergências apontadas acima para liberar o avanço
                    </div>
                  ) : null}
                  {shipment.status === ShipmentStatus.PreCadastro && (!codigoAtua || !codigoAtua.trim()) && (
                    <div className="absolute bottom-full right-0 mb-2 hidden group-hover:block bg-amber-950 text-amber-200 border border-amber-700 text-[11px] font-semibold py-1.5 px-3 rounded-lg shadow-xl whitespace-nowrap z-50 pointer-events-none">
                      ⚠️ Preencha o CODG. ATUA para liberar o salvamento e avançar
                    </div>
                  )}
                  {shipment.status === ShipmentStatus.ValidacaoTicket && (!canValidateTicket || !isTicketValidated) && (
                    <div className="absolute bottom-full right-0 mb-2 hidden group-hover:block bg-gray-900 text-white text-[11px] font-semibold py-1 px-3 rounded-lg shadow-xl whitespace-nowrap z-50 pointer-events-none">
                      {!canValidateTicket 
                        ? '⛔ Validação restrita à equipe interna (bloqueado para Embarcador)' 
                        : '⚠️ Valide o ticket e o peso para liberar este botão'}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-8 flex justify-end border-t dark:border-gray-700 pt-4">
            <button onClick={onClose} className="px-8 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-bold hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
              Fechar
            </button>
          </div>
        )}

        {/* Modal de Detalhes da Leitura do Documento */}
        {selectedDocForDetails && (
          <DocumentExtractedDataModal
            isOpen={Boolean(selectedDocForDetails)}
            onClose={() => setSelectedDocForDetails(null)}
            fileOrUrl={selectedDocForDetails.fileOrUrl}
            docType={selectedDocForDetails.docType}
            docName={selectedDocForDetails.docName}
            driverFreightType={shipment.driverFreightType}
            onApplyData={handleApplyExtractedData}
          />
        )}

        {/* Modal de Cancelamento & Substituição de CT-e */}
        {cteToCancel && (
          <CancelAndSubstituteCteModal
            isOpen={Boolean(cteToCancel)}
            onClose={() => setCteToCancel(null)}
            shipment={shipment}
            currentCteNumber={cteToCancel.cteNumber}
            currentFileUrl={cteToCancel.fileUrl}
            currentFileName={cteToCancel.fileName}
            currentUser={currentUser}
            onSuccess={(updatedShipment) => {
              Object.assign(shipment, updatedShipment);
            }}
            onUpdateShipmentData={onUpdateShipmentData}
          />
        )}

        {/* Modal RDO Nacional integrado ao Embarque */}
        {isRdoModalOpen && (
          <RdoNacionalModal
            isOpen={isRdoModalOpen}
            onClose={() => setIsRdoModalOpen(false)}
            currentUser={currentUser}
            initialShipmentId={shipment.id}
            shipments={[shipment]}
            onSelectApprovedCode={(code) => {
              setRiskReleaseCode(code);
              setRiskQueryType('RDO Nacional');
              setGrStatus('aprovado');
            }}
          />
        )}

        {/* Modal SIGA GR integrado ao Embarque */}
        {isSigaModalOpen && (
          <SigaGrModal
            isOpen={isSigaModalOpen}
            onClose={() => setIsSigaModalOpen(false)}
            currentUser={currentUser}
            initialShipmentId={shipment.id}
            onSelectApprovedCode={(code, procNum) => {
              setRiskReleaseCode(code);
              setRiskQueryType('SIGA GR');
              setGrStatus('aprovado');
            }}
          />
        )}
      </div>
    </div>
  );
};

export default AttachmentModal;