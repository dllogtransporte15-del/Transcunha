import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  ShieldCheck, ShieldAlert, AlertTriangle, AlertCircle, CheckCircle2, 
  Calendar, FileText, Search, Plus, Trash2, Edit3, Eye, Download, 
  Upload, X, RefreshCw, Filter, Layers, ExternalLink, Paperclip, 
  Tag, Clock, Sparkles, Building2, Check, ArrowRight, Grid, List, 
  FileSpreadsheet, Loader2, Info, ChevronDown, Pencil, Mail, Send
} from 'lucide-react';
import * as XLSX from 'xlsx';
import type { FiscalDocument, FiscalDocumentType, FiscalAlertLevel, FiscalDocumentAttachment, Branch, User, Client } from '../../types';
import { 
  getFiscalDocuments, 
  saveFiscalDocument, 
  updateFiscalDocumentTitle,
  deleteFiscalDocument, 
  getFiscalDocumentTypes, 
  saveFiscalDocumentType, 
  deleteFiscalDocumentType, 
  calculateExpirationStatus, 
  getFiscalKpisSummary,
  FISCAL_DOCUMENTS_CHANGED_EVENT,
  ExpirationStatusInfo,
  subscribeToFiscalControl,
  syncFiscalDataWithSupabase
} from '../../services/fiscalControlService';
import { extractDataFromInvoiceFile, extractDataFromBoletoFile } from '../../utils/invoiceExtractionService';
import { DocumentPreviewModal } from '../DocumentPreviewModal';
import { FiscalHomologationModal } from './FiscalHomologationModal';
import { useToast } from '../../hooks/useToast';
import { supabase } from '../../supabase';
import { isDemoUser } from '../../auth';

interface ControlFiscalTabProps {
  branches?: Branch[];
  clients?: Client[];
  currentUser?: User | null;
  isModal?: boolean;
  onClose?: () => void;
}

const readFileAsDataUrl = (fileOrBlob: File | Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(fileOrBlob);
  });
};

export const ControlFiscalTab: React.FC<ControlFiscalTabProps> = ({
  branches = [],
  clients = [],
  currentUser,
  isModal = false,
  onClose
}) => {
  const { showToast } = useToast();

  const [documents, setDocuments] = useState<FiscalDocument[]>([]);
  const [documentTypes, setDocumentTypes] = useState<FiscalDocumentType[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [alertFilter, setAlertFilter] = useState<'all' | 'critical' | 'warning' | 'expired' | 'ok'>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [branchFilter, setBranchFilter] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);

  // Clientes internos com fallback para carregar caso prop esteja vazia
  const [internalClients, setInternalClients] = useState<Client[]>(clients);

  useEffect(() => {
    if (isDemoUser(currentUser)) {
      setInternalClients([]);
      return;
    }
    if (clients && clients.length > 0) {
      setInternalClients(clients);
    } else {
      supabase.from('clients').select('*').order('nomeFantasia').then(({ data, error }) => {
        if (!error && Array.isArray(data)) {
          setInternalClients(data);
        }
      });
    }
  }, [clients]);

  // Modais
  const [isDocModalOpen, setIsDocModalOpen] = useState(false);
  const [isTypeModalOpen, setIsTypeModalOpen] = useState(false);
  const [isHomologationModalOpen, setIsHomologationModalOpen] = useState(false);
  const [homologationDocId, setHomologationDocId] = useState<string | null>(null);
  const [editingDoc, setEditingDoc] = useState<FiscalDocument | null>(null);
  const [previewFile, setPreviewFile] = useState<{ url: string; name: string } | null>(null);

  // Opções de Filiais disponíveis (incluindo Matriz, Filial GO, Filial SP, TRANSCUNHA PR FILIAL e filiais cadastradas)
  const branchOptions = useMemo(() => {
    const list: Array<{ id: string; label: string }> = [
      { id: 'Matriz', label: 'Matriz (MG)' },
      { id: 'Filial GO', label: 'Filial GO' },
      { id: 'Filial SP', label: 'Filial SP' },
      { id: 'TRANSCUNHA PR FILIAL', label: 'TRANSCUNHA PR FILIAL' },
    ];

    if (Array.isArray(branches) && branches.length > 0) {
      branches.forEach(b => {
        if (!b?.name) return;
        const exists = list.some(item => 
          item.id.toLowerCase() === b.name.toLowerCase() ||
          (item.id.includes('PR') && b.name.toUpperCase().includes('PR')) ||
          (item.id.includes('GO') && b.name.toUpperCase().includes('GO')) ||
          (item.id.includes('SP') && b.name.toUpperCase().includes('SP')) ||
          (item.id.toLowerCase().includes('matriz') && b.name.toUpperCase().includes('MATRIZ'))
        );
        if (!exists) {
          list.push({ id: b.name, label: `${b.name}${b.state ? ` (${b.state})` : ''}` });
        }
      });
    }

    return list;
  }, [branches]);

  // Form State Documento
  const [formData, setFormData] = useState({
    title: '',
    typeId: '',
    documentNumber: '',
    issuer: '',
    issueDate: '',
    expirationDate: '',
    branchId: 'Matriz',
    notes: '',
  });
  const [existingAttachments, setExistingAttachments] = useState<FiscalDocumentAttachment[]>([]);
  const [selectedNewFiles, setSelectedNewFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isExtractingAttachment, setIsExtractingAttachment] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form State Novo / Edição Tipo
  const [newTypeName, setNewTypeName] = useState('');
  const [newTypeCategory, setNewTypeCategory] = useState<'seguro' | 'certidao' | 'licenca' | 'fiscal' | 'outros'>('certidao');
  const [newTypeDescription, setNewTypeDescription] = useState('');
  const [newTypeColor, setNewTypeColor] = useState('blue');
  const [editingTypeId, setEditingTypeId] = useState<string | null>(null);

  // Edição Rápida de Título (Inline na tabela e cards)
  const [editingTitleDocId, setEditingTitleDocId] = useState<string | null>(null);
  const [inlineTitleValue, setInlineTitleValue] = useState('');
  const [isSavingInlineTitle, setIsSavingInlineTitle] = useState(false);

  const reloadData = () => {
    setDocuments(isDemoUser(currentUser) ? [] : getFiscalDocuments());
    setDocumentTypes(getFiscalDocumentTypes());
  };

  useEffect(() => {
    // 1. Carga inicial rápida a partir do cache local
    reloadData();

    // 2. Sincronização com o Supabase Postgres (row 889) para carregar documentos da Samanta e outros usuários
    setIsSyncing(true);
    syncFiscalDataWithSupabase()
      .then(() => {
        reloadData();
        setLastSyncTime(new Date());
      })
      .catch(err => {
        console.warn('[ControlFiscalTab] Falha na sincronização inicial:', err);
      })
      .finally(() => {
        setIsSyncing(false);
      });

    // 3. Subscrição em Tempo Real Multi-Usuário (WebSockets Supabase + Postgres CDC + BroadcastChannel)
    const unsubscribe = subscribeToFiscalControl((payload) => {
      reloadData();
      setLastSyncTime(new Date());
      if (payload?.action === 'create' && payload?.document?.title) {
        showToast(`Novo documento lançado: "${payload.document.title}"`, 'info');
      } else if (payload?.action === 'update' && payload?.document?.title) {
        showToast(`Documento atualizado: "${payload.document.title}"`, 'info');
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const handleManualSync = async () => {
    setIsSyncing(true);
    try {
      await syncFiscalDataWithSupabase();
      reloadData();
      setLastSyncTime(new Date());
      showToast('Documentos fiscais sincronizados com sucesso!', 'success');
    } catch (err) {
      console.error('[ControlFiscalTab] Erro ao sincronizar manualmente:', err);
      showToast('Erro ao sincronizar com a nuvem.', 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  // KPIs
  const kpis = useMemo(() => {
    return getFiscalKpisSummary(documents);
  }, [documents]);

  // Lista Filtrada
  const filteredDocuments = useMemo(() => {
    return documents.filter(doc => {
      const expStatus = calculateExpirationStatus(doc.expirationDate);

      // Filtro por Nível de Alerta
      if (alertFilter !== 'all') {
        if (alertFilter === 'critical' && expStatus.level !== 'critical') return false;
        if (alertFilter === 'warning' && expStatus.level !== 'warning') return false;
        if (alertFilter === 'expired' && expStatus.level !== 'expired') return false;
        if (alertFilter === 'ok' && expStatus.level !== 'ok') return false;
      }

      // Filtro por Tipo de Documento
      if (typeFilter !== 'all' && doc.typeId !== typeFilter) {
        return false;
      }

      // Filtro por Filial (com suporte resiliente a nomes, IDs e equivalências)
      if (branchFilter !== 'all') {
        const normFilter = branchFilter.toLowerCase().trim();
        const docBranchId = (doc.branchId || '').toLowerCase().trim();
        const docBranchName = (doc.branchName || '').toLowerCase().trim();

        const isGeneral = docBranchId === 'todas' || docBranchName.includes('todas');
        if (branchFilter === 'Todas') {
          if (!isGeneral) return false;
        } else {
          const directMatch = docBranchId === normFilter || docBranchName === normFilter;
          const prMatch = (normFilter.includes('pr') || normFilter.includes('fil-013')) && 
                          (docBranchId.includes('pr') || docBranchName.includes('pr') || docBranchId === 'fil-013');
          const goMatch = (normFilter.includes('go') || normFilter.includes('fil-012')) && 
                          (docBranchId.includes('go') || docBranchName.includes('go') || docBranchId === 'fil-012');
          const spMatch = (normFilter.includes('sp') || normFilter.includes('fil-011')) && 
                          (docBranchId.includes('sp') || docBranchName.includes('sp') || docBranchId === 'fil-011');
          const matrizMatch = (normFilter.includes('matriz') || normFilter.includes('fil-010')) && 
                              (docBranchId.includes('matriz') || docBranchName.includes('matriz') || docBranchId === 'fil-010');

          if (!directMatch && !prMatch && !goMatch && !spMatch && !matrizMatch && !isGeneral) {
            return false;
          }
        }
      }

      // Busca Textual
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const tMatch = doc.title.toLowerCase().includes(q);
        const tpMatch = doc.typeName.toLowerCase().includes(q);
        const iMatch = (doc.issuer || '').toLowerCase().includes(q);
        const nMatch = (doc.documentNumber || '').toLowerCase().includes(q);
        const bMatch = (doc.branchName || doc.branchId || '').toLowerCase().includes(q);
        const obsMatch = (doc.notes || '').toLowerCase().includes(q);
        return tMatch || tpMatch || iMatch || nMatch || bMatch || obsMatch;
      }

      return true;
    }).sort((a, b) => {
      // Ordenação prioritária: Mais urgentes primeiro (Vencidos -> Críticos -> Atenção -> Em Dia)
      const stA = calculateExpirationStatus(a.expirationDate);
      const stB = calculateExpirationStatus(b.expirationDate);
      if (stA.urgencyOrder !== stB.urgencyOrder) {
        return stA.urgencyOrder - stB.urgencyOrder;
      }
      return stA.daysRemaining - stB.daysRemaining;
    });
  }, [documents, alertFilter, typeFilter, branchFilter, searchTerm]);

  // Abertura do Modal de Cadastro / Edição
  const handleOpenDocModal = (docToEdit?: FiscalDocument) => {
    if (docToEdit) {
      setEditingDoc(docToEdit);
      setFormData({
        title: docToEdit.title,
        typeId: docToEdit.typeId,
        documentNumber: docToEdit.documentNumber || '',
        issuer: docToEdit.issuer || '',
        issueDate: docToEdit.issueDate || '',
        expirationDate: docToEdit.expirationDate || '',
        branchId: docToEdit.branchId || 'Matriz',
        notes: docToEdit.notes || '',
      });
      setExistingAttachments(docToEdit.attachments || []);
    } else {
      setEditingDoc(null);
      const defaultType = documentTypes[0]?.id || '';
      setFormData({
        title: '',
        typeId: defaultType,
        documentNumber: '',
        issuer: '',
        issueDate: '',
        expirationDate: '',
        branchId: 'Matriz',
        notes: '',
      });
      setExistingAttachments([]);
    }
    setSelectedNewFiles([]);
    setIsDocModalOpen(true);
  };

  // Ação de Renovação Rápida
  const handleRenewDocument = (doc: FiscalDocument) => {
    setEditingDoc(null); // Cria novo registro derivado
    setFormData({
      title: `${doc.title} (Renovação)`,
      typeId: doc.typeId,
      documentNumber: '',
      issuer: doc.issuer || '',
      issueDate: new Date().toISOString().split('T')[0],
      expirationDate: '',
      branchId: doc.branchId || 'Matriz',
      notes: `Renovação referente ao documento anterior Nº ${doc.documentNumber || doc.title}.`,
    });
    setExistingAttachments([]);
    setSelectedNewFiles([]);
    setIsDocModalOpen(true);
    showToast('Informe a nova data de validade para registrar a renovação.', 'info');
  };

  const handleCloseDocModal = () => {
    setIsDocModalOpen(false);
    setEditingDoc(null);
    setSelectedNewFiles([]);
  };

  // Upload e Seleção de Novos Arquivos
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    const validFiles: File[] = [];
    files.forEach(f => {
      if (f.size > 25 * 1024 * 1024) {
        showToast(`O arquivo ${f.name} excede o limite de 25MB.`, 'warning');
      } else {
        validFiles.push(f);
      }
    });

    setSelectedNewFiles(prev => [...prev, ...validFiles]);
    if (fileInputRef.current) fileInputRef.current.value = '';

    // Extração automática inteligente de Validade/Vencimento e Emissão
    const primaryFile = validFiles[0];
    if (primaryFile) {
      setIsExtractingAttachment(true);
      (async () => {
        try {
          const isBoleto = primaryFile.name.toLowerCase().includes('boleto');
          const extracted = isBoleto
            ? await extractDataFromBoletoFile(primaryFile)
            : await extractDataFromInvoiceFile(primaryFile);

          const newDueDate = extracted.dueDate;
          const newIssueDate = extracted.issueDate;
          const newNumber = (extracted as any).invoiceNumber || (extracted as any).documentNumber;
          const newIssuer = (extracted as any).supplierName || (extracted as any).beneficiaryName;

          setFormData(prev => ({
            ...prev,
            expirationDate: newDueDate || prev.expirationDate,
            issueDate: newIssueDate || prev.issueDate,
            documentNumber: (!prev.documentNumber && newNumber) ? newNumber : prev.documentNumber,
            issuer: (!prev.issuer && newIssuer) ? newIssuer : prev.issuer,
          }));

          const dateInfos: string[] = [];
          if (newDueDate) {
            const [ano, mes, dia] = newDueDate.split('-');
            dateInfos.push(`Vencimento: ${dia}/${mes}/${ano}`);
          }
          if (newIssueDate) {
            const [ano, mes, dia] = newIssueDate.split('-');
            dateInfos.push(`Emissão: ${dia}/${mes}/${ano}`);
          }

          if (dateInfos.length > 0) {
            showToast(`✨ Lidos do anexo: ${dateInfos.join(' • ')}`, 'success');
          }
        } catch (err) {
          console.warn('[ControlFiscalTab] Falha ao extrair dados do anexo:', err);
        } finally {
          setIsExtractingAttachment(false);
        }
      })();
    }
  };

  const handleRemoveExistingAttachment = (index: number) => {
    setExistingAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const handleRemoveNewFile = (index: number) => {
    setSelectedNewFiles(prev => prev.filter((_, i) => i !== index));
  };

  // Salvar Documento
  const handleSaveDocument = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.title.trim()) {
      showToast('Informe o título ou descrição do documento.', 'warning');
      return;
    }
    if (!formData.expirationDate) {
      showToast('A data de validade é obrigatória para o cálculo dos alertas.', 'warning');
      return;
    }

    const matchedType = documentTypes.find(t => t.id === formData.typeId) || documentTypes[0];
    const typeName = matchedType ? matchedType.name : 'Documento';

    const branchName = formData.branchId === 'Todas' 
      ? 'Todas as Filiais' 
      : (branches.find(b => b.id === formData.branchId)?.name || formData.branchId);

    setIsUploading(true);

    try {
      const uploadedAttachments: FiscalDocumentAttachment[] = [...existingAttachments];

      // Upload dos novos arquivos
      for (let i = 0; i < selectedNewFiles.length; i++) {
        const file = selectedNewFiles[i];
        try {
          const fileExt = file.name.split('.').pop() || 'bin';
          const cleanName = file.name.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_');
          const filePath = `fiscal_docs/fdoc_${Date.now()}_${i}_${cleanName}.${fileExt}`;

          const { error: uploadError } = await supabase.storage
            .from('shipment_attachments')
            .upload(filePath, file, { upsert: true });

          let finalUrl = '';
          if (uploadError) {
            finalUrl = await readFileAsDataUrl(file);
          } else {
            const { data } = supabase.storage
              .from('shipment_attachments')
              .getPublicUrl(filePath);
            finalUrl = data.publicUrl;
          }

          uploadedAttachments.push({
            url: finalUrl,
            name: file.name,
            size: file.size,
            type: file.type || undefined
          });
        } catch (err) {
          console.warn('[ControlFiscalTab] Upload fallback para base64:', err);
          const fallbackUrl = await readFileAsDataUrl(file);
          uploadedAttachments.push({
            url: fallbackUrl,
            name: file.name,
            size: file.size,
            type: file.type || undefined
          });
        }
      }

      const docPayload: FiscalDocument = {
        id: editingDoc?.id || `fdoc_${Date.now()}`,
        title: formData.title.trim(),
        typeId: formData.typeId,
        typeName,
        documentNumber: formData.documentNumber.trim() || undefined,
        issuer: formData.issuer.trim() || undefined,
        issueDate: formData.issueDate || undefined,
        expirationDate: formData.expirationDate,
        branchId: formData.branchId,
        branchName,
        notes: formData.notes.trim() || undefined,
        attachments: uploadedAttachments.length > 0 ? uploadedAttachments : undefined,
        status: editingDoc?.status || 'active',
        createdByUserId: editingDoc?.createdByUserId || currentUser?.id,
        createdByName: editingDoc?.createdByName || currentUser?.name || 'Administrador',
        createdAt: editingDoc?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      await saveFiscalDocument(docPayload, { id: currentUser?.id, name: currentUser?.name });
      showToast(editingDoc ? 'Documento fiscal atualizado com sucesso!' : 'Novo documento fiscal registrado com sucesso!', 'success');
      handleCloseDocModal();
      reloadData();
      setLastSyncTime(new Date());
    } catch (err) {
      console.error('[ControlFiscalTab] Erro ao salvar documento:', err);
      showToast('Erro ao salvar documento. Tente novamente.', 'error');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteDoc = async (docId: string, title: string) => {
    if (window.confirm(`Tem certeza que deseja excluir o documento "${title}"?`)) {
      try {
        await deleteFiscalDocument(docId);
        showToast('Documento fiscal excluído com sucesso.', 'info');
        reloadData();
        setLastSyncTime(new Date());
      } catch (err) {
        console.error('[ControlFiscalTab] Erro ao excluir:', err);
        showToast('Erro ao excluir documento.', 'error');
      }
    }
  };

  // Edição Rápida de Título de Documento (Inline)
  const handleStartInlineTitleEdit = (doc: FiscalDocument) => {
    setEditingTitleDocId(doc.id);
    setInlineTitleValue(doc.title);
  };

  const handleCancelInlineTitleEdit = () => {
    setEditingTitleDocId(null);
    setInlineTitleValue('');
  };

  const handleSaveInlineTitle = async (docId: string) => {
    const trimmed = inlineTitleValue.trim();
    if (!trimmed) {
      showToast('O título do documento não pode ficar vazio.', 'warning');
      return;
    }
    setIsSavingInlineTitle(true);
    try {
      await updateFiscalDocumentTitle(docId, trimmed, {
        id: currentUser?.id,
        name: currentUser?.name
      });
      showToast('✓ Título do documento atualizado com sucesso!', 'success');
      setEditingTitleDocId(null);
      reloadData();
      setLastSyncTime(new Date());
    } catch (err: any) {
      console.error('[ControlFiscalTab] Erro ao atualizar título:', err);
      showToast(err.message || 'Erro ao atualizar título do documento.', 'error');
    } finally {
      setIsSavingInlineTitle(false);
    }
  };

  // Gerenciador de Tipos
  const handleStartEditType = (type: FiscalDocumentType) => {
    setEditingTypeId(type.id);
    setNewTypeName(type.name);
    setNewTypeCategory(type.category || 'certidao');
    setNewTypeDescription(type.description || '');
    setNewTypeColor(type.color || 'blue');
  };

  const handleCancelEditType = () => {
    setEditingTypeId(null);
    setNewTypeName('');
    setNewTypeCategory('certidao');
    setNewTypeDescription('');
    setNewTypeColor('blue');
  };

  const handleSaveNewType = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTypeName.trim()) {
      showToast('Informe o nome do tipo de documento.', 'warning');
      return;
    }

    const typeId = editingTypeId || `fdt_${Date.now()}_${newTypeName.trim().toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
    const existingType = documentTypes.find(t => t.id === typeId);

    const typePayload: FiscalDocumentType = {
      id: typeId,
      name: newTypeName.trim(),
      category: newTypeCategory,
      description: newTypeDescription.trim() || undefined,
      color: newTypeColor,
      isDefault: existingType?.isDefault ?? false,
      createdAt: existingType?.createdAt || new Date().toISOString()
    };

    try {
      await saveFiscalDocumentType(typePayload);
      showToast(editingTypeId ? `✓ Tipo "${newTypeName}" atualizado com sucesso!` : `✓ Tipo "${newTypeName}" cadastrado com sucesso!`, 'success');
      setEditingTypeId(null);
      setNewTypeName('');
      setNewTypeDescription('');
      setNewTypeCategory('certidao');
      reloadData();
      setLastSyncTime(new Date());
    } catch (err) {
      console.error('[ControlFiscalTab] Erro ao salvar tipo:', err);
      showToast('Erro ao salvar tipo de documento.', 'error');
    }
  };

  const handleDeleteType = async (typeId: string, typeName: string) => {
    if (window.confirm(`Deseja remover o tipo de documento "${typeName}"?`)) {
      try {
        await deleteFiscalDocumentType(typeId);
        showToast('Tipo de documento removido.', 'info');
        reloadData();
        setLastSyncTime(new Date());
      } catch (err) {
        console.error('[ControlFiscalTab] Erro ao remover tipo:', err);
        showToast('Erro ao remover tipo de documento.', 'error');
      }
    }
  };

  // Download do Anexo
  const handleDownloadAttachment = async (url: string, filename: string) => {
    try {
      showToast('Baixando anexo...', 'info');
      if (url.startsWith('data:') || url.startsWith('blob:')) {
        const a = document.createElement('a');
        a.href = url;
        a.download = filename || 'documento_fiscal';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        return;
      }

      const res = await fetch(url);
      const blob = await res.blob();
      const bUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = bUrl;
      a.download = filename || 'documento_fiscal';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(bUrl), 1000);
    } catch {
      window.open(url, '_blank');
    }
  };

  // Exportar Excel
  const handleExportExcel = () => {
    try {
      const dataRows = filteredDocuments.map(doc => {
        const status = calculateExpirationStatus(doc.expirationDate);
        return {
          'Documento / Título': doc.title,
          'Tipo de Documento': doc.typeName,
          'Nº do Documento': doc.documentNumber || '-',
          'Emissor / Seguradora': doc.issuer || '-',
          'Filial': doc.branchName || doc.branchId || 'Matriz',
          'Data de Emissão': doc.issueDate ? new Date(doc.issueDate + 'T00:00:00').toLocaleDateString('pt-BR') : '-',
          'Data de Validade': new Date(doc.expirationDate + 'T00:00:00').toLocaleDateString('pt-BR'),
          'Dias Restantes': status.daysRemaining,
          'Status do Alerta': status.label,
          'Possui Anexo': (doc.attachments && doc.attachments.length > 0) ? `Sim (${doc.attachments.length})` : 'Não',
          'Observações': doc.notes || '-'
        };
      });

      const worksheet = XLSX.utils.json_to_sheet(dataRows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Controladoria Fiscal');
      XLSX.writeFile(workbook, `CONTROLADORIA_FISCAL_${new Date().toISOString().split('T')[0]}.xlsx`);
      showToast('Planilha de Controladoria Fiscal exportada com sucesso!', 'success');
    } catch (err) {
      console.error('[handleExportExcel] Erro ao exportar:', err);
      showToast('Erro ao exportar planilha Excel.', 'error');
    }
  };

  // Pré-visualização do alerta em tempo real no formulário
  const formPreviewStatus = useMemo(() => {
    if (!formData.expirationDate) return null;
    return calculateExpirationStatus(formData.expirationDate);
  }, [formData.expirationDate]);

  return (
    <div className={`space-y-5 ${isModal ? 'p-1' : ''}`}>
      {/* HEADER DA CONTROLADORIA FISCAL */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-2xl p-5 border border-indigo-900/40 shadow-xl relative overflow-hidden">
        <div className="absolute -top-20 -right-20 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-20 -left-20 w-80 h-80 bg-rose-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-600 via-blue-600 to-sky-500 flex items-center justify-center text-white shadow-lg shadow-indigo-500/30 shrink-0">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white flex items-center gap-2">
                  Controladoria Fiscal
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-500/20 text-indigo-300 border border-indigo-400/30">
                  Apólices, Certidões & Validades
                </span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 shadow-xs" title="Sincronização em tempo real ativa com o Supabase para todos os usuários">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400"></span>
                  </span>
                  <span>Tempo Real Nuvem</span>
                </span>
                {kpis.urgentCount > 0 && (
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-rose-500 text-white shadow-md shadow-rose-500/30 animate-pulse flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    {kpis.urgentCount} Alerta{kpis.urgentCount > 1 ? 's' : ''} de Vencimento
                  </span>
                )}
              </div>
              <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-2xl">
                Lançamento e controle de apólices de seguro de carga (RCTR-C / RC-DC), certidões negativas (CNDs), licenças ambientais e ANTT com alertas automatizados de vencimento (<strong className="text-amber-300 font-bold">≤ 30 dias: Atenção</strong> e <strong className="text-rose-400 font-bold">≤ 10 dias: Crítico</strong>).
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={handleManualSync}
              disabled={isSyncing}
              className="px-3 py-2 rounded-xl text-xs font-bold bg-white/10 hover:bg-white/15 text-slate-200 border border-white/10 hover:border-white/20 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
              title="Sincronizar documentos fiscais agora com a nuvem Supabase"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-sky-400 ${isSyncing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">{isSyncing ? 'Sincronizando...' : 'Sincronizar'}</span>
            </button>
            <button
              type="button"
              onClick={() => setIsTypeModalOpen(true)}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-white/10 hover:bg-white/15 text-slate-200 border border-white/10 hover:border-white/20 transition-all flex items-center gap-1.5 cursor-pointer"
              title="Cadastrar e gerenciar tipos de documentos"
            >
              <Tag className="w-3.5 h-3.5 text-indigo-300" />
              <span>Tipos de Documentos</span>
            </button>

            <button
              type="button"
              onClick={handleExportExcel}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-white/10 hover:bg-white/15 text-slate-200 border border-white/10 hover:border-white/20 transition-all flex items-center gap-1.5 cursor-pointer"
              title="Exportar para Excel"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
              <span>Exportar Excel</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setHomologationDocId(null);
                setIsHomologationModalOpen(true);
              }}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-md shadow-blue-600/30 transition-all flex items-center gap-1.5 cursor-pointer transform active:scale-95"
              title="Gerar e Enviar Dossiê de Homologação da Transportadora para Clientes via contato@transcunhaoficial.com.br"
            >
              <Mail className="w-3.5 h-3.5 text-blue-200" />
              <span>Dossiê de Homologação</span>
            </button>

            <button
              type="button"
              onClick={() => handleOpenDocModal()}
              className="px-4 py-2 rounded-xl text-xs sm:text-sm font-black bg-gradient-to-r from-indigo-500 to-blue-600 hover:from-indigo-600 hover:to-blue-700 text-white shadow-lg shadow-indigo-500/30 transition-all transform active:scale-95 flex items-center gap-2 cursor-pointer"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              <span>Novo Documento Fiscal</span>
            </button>

            {isModal && onClose && (
              <button
                type="button"
                onClick={onClose}
                className="p-2 rounded-xl bg-white/10 hover:bg-rose-500 text-slate-300 hover:text-white transition-colors cursor-pointer"
                title="Fechar janela"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* BANNER PROATIVO DE ALERTA DE VENCIMENTO (REGRAS: <= 30 DIAS ATENÇÃO, <= 10 DIAS CRÍTICO) */}
      {kpis.urgentCount > 0 && (
        <div className={`p-4 rounded-2xl border shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
          kpis.critical > 0 || kpis.expired > 0 
            ? 'bg-gradient-to-r from-red-50 via-rose-50 to-orange-50 dark:from-red-950/40 dark:via-rose-950/30 dark:to-orange-950/30 border-red-300 dark:border-red-800/80 text-red-950 dark:text-red-200' 
            : 'bg-gradient-to-r from-amber-50 via-yellow-50 to-orange-50 dark:from-amber-950/40 dark:via-yellow-950/30 dark:to-orange-950/30 border-amber-300 dark:border-amber-800/80 text-amber-950 dark:text-amber-200'
        }`}>
          <div className="flex items-start sm:items-center gap-3">
            <div className={`p-2 rounded-xl shrink-0 ${
              kpis.critical > 0 || kpis.expired > 0 
                ? 'bg-red-600 text-white shadow-md shadow-red-600/30 animate-pulse' 
                : 'bg-amber-600 text-white shadow-md shadow-amber-600/30'
            }`}>
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-black text-sm uppercase tracking-wide">
                  {kpis.critical > 0 || kpis.expired > 0 ? 'Alerta Crítico de Vencimento' : 'Alerta Preventivo de Validade'}
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-white/80 dark:bg-black/30 border border-current/20">
                  {kpis.expired > 0 && `${kpis.expired} Vencido(s) • `}
                  {kpis.critical > 0 && `${kpis.critical} Crítico(s) (≤ 10 dias) • `}
                  {kpis.warning > 0 && `${kpis.warning} em Atenção (≤ 30 dias)`}
                </span>
              </div>
              <p className="text-xs opacity-90 mt-0.5">
                Providencie imediatamente a renovação das apólices e certidões junto à seguradora ou órgãos públicos para evitar bloqueios operacionais ou cancelamento de autorizações de transporte.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
            {kpis.critical > 0 && (
              <button
                type="button"
                onClick={() => setAlertFilter('critical')}
                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-red-600 hover:bg-red-700 text-white shadow-xs transition-colors cursor-pointer"
              >
                Ver Críticos ({kpis.critical})
              </button>
            )}
            {kpis.warning > 0 && (
              <button
                type="button"
                onClick={() => setAlertFilter('warning')}
                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-xs transition-colors cursor-pointer"
              >
                Ver em Atenção ({kpis.warning})
              </button>
            )}
            {alertFilter !== 'all' && (
              <button
                type="button"
                onClick={() => setAlertFilter('all')}
                className="px-2 py-1 text-xs font-semibold underline opacity-80 hover:opacity-100 cursor-pointer"
              >
                Limpar filtro
              </button>
            )}
          </div>
        </div>
      )}

      {/* CARDS DE KPIS */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {/* Total */}
        <div 
          onClick={() => setAlertFilter('all')}
          className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
            alertFilter === 'all' 
              ? 'bg-indigo-50/80 dark:bg-indigo-950/40 border-indigo-400 shadow-sm ring-2 ring-indigo-500/20' 
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-semibold">
            <span>Total Cadastrados</span>
            <Layers className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-2xl font-black text-slate-900 dark:text-white">{kpis.total}</span>
            <span className="text-[10px] text-slate-400">Documentos</span>
          </div>
        </div>

        {/* Vencidos */}
        <div 
          onClick={() => setAlertFilter('expired')}
          className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
            alertFilter === 'expired' 
              ? 'bg-rose-50 dark:bg-rose-950/50 border-rose-500 shadow-sm ring-2 ring-rose-500/20' 
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-rose-300'
          }`}
        >
          <div className="flex items-center justify-between text-rose-600 dark:text-rose-400 text-xs font-semibold">
            <span>Vencidos</span>
            <AlertCircle className="w-4 h-4 text-rose-600" />
          </div>
          <div className="mt-1 flex items-baseline justify-between">
            <span className={`text-2xl font-black ${kpis.expired > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-400'}`}>
              {kpis.expired}
            </span>
            <span className="text-[10px] text-rose-500 font-bold">Vencidos há &gt;0d</span>
          </div>
        </div>

        {/* Críticos */}
        <div 
          onClick={() => setAlertFilter('critical')}
          className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
            alertFilter === 'critical' 
              ? 'bg-red-50 dark:bg-red-950/50 border-red-500 shadow-sm ring-2 ring-red-500/20' 
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-red-300'
          }`}
        >
          <div className="flex items-center justify-between text-red-600 dark:text-red-400 text-xs font-semibold">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-red-600 animate-ping inline-block" />
              Crítico
            </span>
            <ShieldAlert className="w-4 h-4 text-red-600" />
          </div>
          <div className="mt-1 flex items-baseline justify-between">
            <span className={`text-2xl font-black ${kpis.critical > 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-400'}`}>
              {kpis.critical}
            </span>
            <span className="text-[10px] text-red-500 font-extrabold uppercase">≤ 10 dias</span>
          </div>
        </div>

        {/* Atenção */}
        <div 
          onClick={() => setAlertFilter('warning')}
          className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
            alertFilter === 'warning' 
              ? 'bg-amber-50 dark:bg-amber-950/50 border-amber-500 shadow-sm ring-2 ring-amber-500/20' 
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-amber-300'
          }`}
        >
          <div className="flex items-center justify-between text-amber-700 dark:text-amber-400 text-xs font-semibold">
            <span>Atenção</span>
            <AlertTriangle className="w-4 h-4 text-amber-600" />
          </div>
          <div className="mt-1 flex items-baseline justify-between">
            <span className={`text-2xl font-black ${kpis.warning > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400'}`}>
              {kpis.warning}
            </span>
            <span className="text-[10px] text-amber-600 font-extrabold uppercase">≤ 30 dias</span>
          </div>
        </div>

        {/* Em Dia */}
        <div 
          onClick={() => setAlertFilter('ok')}
          className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
            alertFilter === 'ok' 
              ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-500 shadow-sm ring-2 ring-emerald-500/20' 
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-emerald-300'
          }`}
        >
          <div className="flex items-center justify-between text-emerald-700 dark:text-emerald-400 text-xs font-semibold">
            <span>Em Dia</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400">{kpis.ok}</span>
            <span className="text-[10px] text-emerald-600 font-bold">&gt; 30 dias</span>
          </div>
        </div>
      </div>

      {/* BARRA DE FERRAMENTAS / FILTROS */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 shadow-sm space-y-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Busca textual */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Pesquisar por título, apólice, certidão, seguradora ou órgão emissor..."
              className="w-full pl-9 pr-8 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 outline-none focus:border-indigo-500 focus:bg-white dark:focus:bg-slate-900 transition-colors"
            />
            {searchTerm && (
              <button 
                type="button" 
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Filtro por Alerta */}
            <select
              value={alertFilter}
              onChange={(e) => setAlertFilter(e.target.value as any)}
              className="px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200 outline-none focus:border-indigo-500"
            >
              <option value="all">Todos os Status ({kpis.total})</option>
              <option value="critical">🚨 Críticos (≤ 10 dias) ({kpis.critical})</option>
              <option value="warning">⚠️ Em Atenção (≤ 30 dias) ({kpis.warning})</option>
              <option value="expired">❌ Vencidos ({kpis.expired})</option>
              <option value="ok">✅ Em Dia (&gt; 30 dias) ({kpis.ok})</option>
            </select>

            {/* Filtro por Tipo */}
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200 outline-none focus:border-indigo-500 max-w-[200px] truncate"
            >
              <option value="all">Todos os Tipos</option>
              {documentTypes.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>

            {/* Filtro por Filial */}
            <select
              value={branchFilter}
              onChange={(e) => setBranchFilter(e.target.value)}
              className="px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200 outline-none focus:border-indigo-500 cursor-pointer"
            >
              <option value="all">Todas as Filiais</option>
              {branchOptions.map(b => (
                <option key={b.id} value={b.id}>{b.label}</option>
              ))}
              <option value="Todas">Geral / Todas</option>
            </select>

            {/* Alternador de Visualização */}
            <div className="flex items-center rounded-xl border border-slate-200 dark:border-slate-700 p-0.5 bg-slate-100 dark:bg-slate-800">
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`p-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  viewMode === 'table' 
                    ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs' 
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
                title="Visualização em Tabela"
              >
                <List className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('cards')}
                className={`p-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  viewMode === 'cards' 
                    ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs' 
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
                title="Visualização em Grade de Cards"
              >
                <Grid className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Resumo de Filtros Ativos */}
        {(alertFilter !== 'all' || typeFilter !== 'all' || branchFilter !== 'all' || searchTerm.trim()) && (
          <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
            <span className="text-slate-500 dark:text-slate-400">
              Exibindo <strong>{filteredDocuments.length}</strong> de {documents.length} documentos encontrados.
            </span>
            <button
              type="button"
              onClick={() => {
                setAlertFilter('all');
                setTypeFilter('all');
                setBranchFilter('all');
                setSearchTerm('');
              }}
              className="text-indigo-600 dark:text-indigo-400 font-bold hover:underline cursor-pointer"
            >
              Limpar todos os filtros
            </button>
          </div>
        )}
      </div>

      {/* LISTA DE DOCUMENTOS: MODO TABELA OU MODO CARDS */}
      {filteredDocuments.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-12 text-center shadow-xs">
          <div className="w-16 h-16 rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto mb-3">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">
            Nenhum documento encontrado com os filtros selecionados
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
            Tente redefinir os filtros de busca ou cadastre um novo documento fiscal para iniciar o acompanhamento.
          </p>
          <div className="mt-4 flex justify-center gap-2">
            <button
              type="button"
              onClick={() => handleOpenDocModal()}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition-all cursor-pointer"
            >
              + Lançar Documento
            </button>
          </div>
        </div>
      ) : viewMode === 'table' ? (
        /* VISUALIZAÇÃO EM TABELA */
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50/80 dark:bg-slate-950/80 border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  <th className="py-3 px-4">Documento / Título</th>
                  <th className="py-3 px-4">Tipo & Categoria</th>
                  <th className="py-3 px-4">Emissor & Nº Registro</th>
                  <th className="py-3 px-3">Filial</th>
                  <th className="py-3 px-3">Validade</th>
                  <th className="py-3 px-4">Status & Alerta</th>
                  <th className="py-3 px-3 text-center">Anexo</th>
                  <th className="py-3 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                {filteredDocuments.map(doc => {
                  const status = calculateExpirationStatus(doc.expirationDate);
                  const hasAttachments = doc.attachments && doc.attachments.length > 0;
                  const firstAttachment = hasAttachments ? doc.attachments![0] : null;

                  return (
                    <tr 
                      key={doc.id}
                      className={`hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors ${
                        status.level === 'critical' ? 'bg-red-50/30 dark:bg-red-950/15' : (status.level === 'warning' ? 'bg-amber-50/20 dark:bg-amber-950/10' : '')
                      }`}
                    >
                      {/* Título & Detalhes */}
                      <td className="py-3 px-4 max-w-xs">
                        {editingTitleDocId === doc.id ? (
                          <div className="flex items-center gap-1.5 w-full py-0.5 animate-fade-in" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="text"
                              value={inlineTitleValue}
                              onChange={(e) => setInlineTitleValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSaveInlineTitle(doc.id);
                                if (e.key === 'Escape') handleCancelInlineTitleEdit();
                              }}
                              disabled={isSavingInlineTitle}
                              autoFocus
                              placeholder="Novo título..."
                              className="w-full px-2.5 py-1 text-xs font-bold rounded-lg border-2 border-indigo-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none shadow-sm focus:ring-2 focus:ring-indigo-500/30"
                            />
                            <button
                              type="button"
                              onClick={() => handleSaveInlineTitle(doc.id)}
                              disabled={isSavingInlineTitle || !inlineTitleValue.trim()}
                              className="p-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-all cursor-pointer disabled:opacity-50 shrink-0"
                              title="Salvar título (Enter)"
                            >
                              {isSavingInlineTitle ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                            </button>
                            <button
                              type="button"
                              onClick={handleCancelInlineTitleEdit}
                              disabled={isSavingInlineTitle}
                              className="p-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-200 transition-all cursor-pointer shrink-0"
                              title="Cancelar (Esc)"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="group/title flex items-center gap-1.5">
                            <span 
                              className="font-bold text-slate-900 dark:text-white truncate cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                              title={`Duplo clique ou lápis para modificar o título: "${doc.title}"`}
                              onDoubleClick={() => handleStartInlineTitleEdit(doc)}
                            >
                              {doc.title}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleStartInlineTitleEdit(doc)}
                              className="opacity-0 group-hover/title:opacity-100 p-1 rounded-md text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 transition-all cursor-pointer shrink-0"
                              title="Modificar título do documento"
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          {doc.createdByName && (
                            <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-semibold bg-indigo-50 dark:bg-indigo-950/60 px-1.5 py-0.2 rounded border border-indigo-200 dark:border-indigo-800/40" title={`Cadastrado por: ${doc.createdByName}`}>
                              👤 {doc.createdByName}
                            </span>
                          )}
                          {doc.notes && (
                            <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate max-w-[200px]" title={doc.notes}>
                              {doc.notes}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Tipo */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/60">
                          <Tag className="w-3 h-3 text-indigo-500" />
                          {doc.typeName}
                        </span>
                      </td>

                      {/* Emissor & Nº */}
                      <td className="py-3 px-4 max-w-[200px]">
                        <div className="text-slate-800 dark:text-slate-200 font-semibold truncate" title={doc.issuer || '-'}>
                          {doc.issuer || '-'}
                        </div>
                        {doc.documentNumber && (
                          <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400 truncate" title={doc.documentNumber}>
                            Nº {doc.documentNumber}
                          </div>
                        )}
                      </td>

                      {/* Filial */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        <span className="text-[11px] text-slate-700 dark:text-slate-300 flex items-center gap-1 font-semibold">
                          <Building2 className="w-3 h-3 text-slate-400" />
                          {doc.branchName || doc.branchId || 'Matriz'}
                        </span>
                      </td>

                      {/* Validade */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        <div className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-slate-400" />
                          {new Date(doc.expirationDate + 'T00:00:00').toLocaleDateString('pt-BR')}
                        </div>
                        {doc.issueDate && (
                          <div className="text-[10px] text-slate-400">
                            Emissão: {new Date(doc.issueDate + 'T00:00:00').toLocaleDateString('pt-BR')}
                          </div>
                        )}
                      </td>

                      {/* Status / Alerta Regras */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs ${status.badgeClass}`}>
                          {status.level === 'critical' ? (
                            <ShieldAlert className="w-3.5 h-3.5" />
                          ) : status.level === 'warning' ? (
                            <AlertTriangle className="w-3.5 h-3.5" />
                          ) : status.level === 'expired' ? (
                            <AlertCircle className="w-3.5 h-3.5" />
                          ) : (
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          )}
                          <span>{status.label}</span>
                        </span>
                      </td>

                      {/* Anexo */}
                      <td className="py-3 px-3 text-center whitespace-nowrap">
                        {hasAttachments ? (
                          <button
                            type="button"
                            onClick={() => setPreviewFile({ url: firstAttachment!.url, name: firstAttachment!.name })}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/30 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 transition-colors cursor-pointer"
                            title={`Visualizar ${firstAttachment!.name}`}
                          >
                            <Paperclip className="w-3.5 h-3.5" />
                            <span>{doc.attachments!.length > 1 ? `${doc.attachments!.length} Docs` : 'Ver Doc'}</span>
                          </button>
                        ) : (
                          <span className="text-[10px] text-slate-400 italic">Sem anexo</span>
                        )}
                      </td>

                      {/* Ações */}
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleStartInlineTitleEdit(doc)}
                            className="p-1.5 rounded-lg text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition-colors cursor-pointer"
                            title="Modificar título do documento"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRenewDocument(doc)}
                            className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-colors cursor-pointer"
                            title="Renovar este documento (duplicar com nova data de validade)"
                          >
                            <RefreshCw className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setHomologationDocId(doc.id);
                              setIsHomologationModalOpen(true);
                            }}
                            className="p-1.5 rounded-lg text-sky-500 hover:bg-sky-50 dark:hover:bg-sky-950/40 transition-colors cursor-pointer"
                            title="Enviar este documento por e-mail para homologação de cliente"
                          >
                            <Mail className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenDocModal(doc)}
                            className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors cursor-pointer"
                            title="Editar dados completos do documento"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteDoc(doc.id, doc.title)}
                            className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer"
                            title="Excluir documento"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* VISUALIZAÇÃO EM GRADE DE CARDS */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {filteredDocuments.map(doc => {
            const status = calculateExpirationStatus(doc.expirationDate);
            const hasAttachments = doc.attachments && doc.attachments.length > 0;
            const firstAttachment = hasAttachments ? doc.attachments![0] : null;

            return (
              <div 
                key={doc.id}
                className={`bg-white dark:bg-slate-900 rounded-2xl border p-4 shadow-xs flex flex-col justify-between transition-all hover:shadow-md ${
                  status.level === 'critical' 
                    ? 'border-red-300 dark:border-red-800/80 bg-red-50/15 dark:bg-red-950/10' 
                    : (status.level === 'warning' 
                        ? 'border-amber-300 dark:border-amber-800/80 bg-amber-50/15 dark:bg-amber-950/10' 
                        : 'border-slate-200 dark:border-slate-800')
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[10px] font-bold bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/60 truncate max-w-[200px]">
                      <Tag className="w-3 h-3 text-indigo-500" />
                      {doc.typeName}
                    </span>

                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${status.badgeClass}`}>
                      {status.label}
                    </span>
                  </div>

                  {editingTitleDocId === doc.id ? (
                    <div className="flex items-center gap-1.5 my-1" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="text"
                        autoFocus
                        value={inlineTitleValue}
                        onChange={(e) => setInlineTitleValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveInlineTitle(doc.id);
                          if (e.key === 'Escape') handleCancelInlineTitleEdit();
                        }}
                        disabled={isSavingInlineTitle}
                        className="flex-1 text-xs font-bold px-2 py-1 rounded-lg border border-indigo-400 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-xs"
                        placeholder="Título do documento..."
                      />
                      <button
                        type="button"
                        onClick={() => handleSaveInlineTitle(doc.id)}
                        disabled={isSavingInlineTitle}
                        className="p-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer shadow-xs disabled:opacity-50"
                        title="Salvar título (Enter)"
                      >
                        {isSavingInlineTitle ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        type="button"
                        onClick={handleCancelInlineTitleEdit}
                        disabled={isSavingInlineTitle}
                        className="p-1 rounded bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 cursor-pointer disabled:opacity-50"
                        title="Cancelar (Esc)"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="group/title flex items-start justify-between gap-1.5">
                      <h4 
                        className="text-sm font-bold text-slate-900 dark:text-white leading-tight flex-1 cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors" 
                        title="Clique duplo para editar o título deste documento"
                        onDoubleClick={() => handleStartInlineTitleEdit(doc)}
                      >
                        {doc.title}
                      </h4>
                      <button
                        type="button"
                        onClick={() => handleStartInlineTitleEdit(doc)}
                        className="opacity-0 group-hover/title:opacity-100 p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-300 transition-all cursor-pointer"
                        title="Modificar título do documento"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                    </div>
                  )}

                  <div className="mt-2.5 space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
                    {doc.issuer && (
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-slate-400">Emissor/Seguradora:</span>
                        <span className="font-semibold truncate max-w-[170px]" title={doc.issuer}>{doc.issuer}</span>
                      </div>
                    )}
                    {doc.documentNumber && (
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-slate-400">Nº Registro:</span>
                        <span className="font-mono font-bold text-slate-700 dark:text-slate-200">{doc.documentNumber}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-slate-400">Filial:</span>
                      <span className="font-semibold">{doc.branchName || doc.branchId || 'Matriz'}</span>
                    </div>
                    <div className="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-slate-800">
                      <span className="text-[11px] text-slate-400 flex items-center gap-1">
                        <Calendar className="w-3 h-3" /> Validade:
                      </span>
                      <span className="font-black text-slate-900 dark:text-white">
                        {new Date(doc.expirationDate + 'T00:00:00').toLocaleDateString('pt-BR')}
                      </span>
                    </div>
                  </div>

                  {doc.createdByName && (
                    <div className="mt-2 flex items-center gap-1 text-[10px] text-indigo-600 dark:text-indigo-400 font-semibold">
                      <span>👤 Cadastrado por:</span>
                      <span className="font-bold">{doc.createdByName}</span>
                    </div>
                  )}

                  {doc.notes && (
                    <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2 italic bg-slate-50 dark:bg-slate-950/60 p-2 rounded-lg">
                      {doc.notes}
                    </p>
                  )}
                </div>

                <div className="mt-3.5 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                  <div>
                    {hasAttachments ? (
                      <button
                        type="button"
                        onClick={() => setPreviewFile({ url: firstAttachment!.url, name: firstAttachment!.name })}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/30 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 cursor-pointer"
                      >
                        <Paperclip className="w-3.5 h-3.5" />
                        <span>{doc.attachments!.length > 1 ? `${doc.attachments!.length} Anexos` : 'Ver Anexo'}</span>
                      </button>
                    ) : (
                      <span className="text-[10px] text-slate-400">Sem documento anexo</span>
                    )}
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleStartInlineTitleEdit(doc)}
                      className="p-1.5 rounded-lg text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition-colors cursor-pointer"
                      title="Modificar título do documento"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRenewDocument(doc)}
                      className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-colors cursor-pointer"
                      title="Renovar este documento"
                    >
                      <RefreshCw className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setHomologationDocId(doc.id);
                        setIsHomologationModalOpen(true);
                      }}
                      className="p-1.5 rounded-lg text-sky-500 hover:bg-sky-50 dark:hover:bg-sky-950/40 transition-colors cursor-pointer"
                      title="Enviar este documento por e-mail para homologação de cliente"
                    >
                      <Mail className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOpenDocModal(doc)}
                      className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors cursor-pointer"
                      title="Editar documento"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteDoc(doc.id, doc.title)}
                      className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer"
                      title="Excluir documento"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL DE CADASTRO / EDIÇÃO DE DOCUMENTO FISCAL */}
      {isDocModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Header Modal */}
            <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-gradient-to-r from-indigo-50/60 to-white dark:from-indigo-950/40 dark:to-slate-900">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-600/30">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-white">
                    {editingDoc ? 'Editar Documento Fiscal' : 'Lançar Novo Documento Fiscal'}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Informe os dados da apólice ou certidão e a data de validade para o monitoramento de alertas.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleCloseDocModal}
                disabled={isUploading}
                className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form Body */}
            <form onSubmit={handleSaveDocument} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 text-xs sm:text-sm">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {/* Tipo de Documento */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                      <Tag className="w-3.5 h-3.5 text-indigo-500" />
                      Tipo de Documento *
                    </label>
                    <button
                      type="button"
                      onClick={() => setIsTypeModalOpen(true)}
                      className="text-[11px] text-indigo-600 dark:text-indigo-400 font-bold hover:underline cursor-pointer"
                    >
                      + Cadastrar Tipo
                    </button>
                  </div>
                  <select
                    value={formData.typeId}
                    onChange={(e) => {
                      const nextTypeId = e.target.value;
                      const nextType = documentTypes.find(t => t.id === nextTypeId);
                      setFormData(prev => {
                        const prevType = documentTypes.find(t => t.id === prev.typeId);
                        const shouldAutoFill = !prev.title.trim() || (prevType && prev.title === prevType.name);
                        return {
                          ...prev,
                          typeId: nextTypeId,
                          title: shouldAutoFill && nextType ? nextType.name : prev.title
                        };
                      });
                    }}
                    className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-semibold outline-none focus:border-indigo-500"
                    required
                  >
                    {documentTypes.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>

                {/* Filial */}
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                    <Building2 className="w-3.5 h-3.5 text-indigo-500" />
                    Filial Pertencente
                  </label>
                  <select
                    value={formData.branchId}
                    onChange={(e) => setFormData(prev => ({ ...prev, branchId: e.target.value }))}
                    className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-semibold outline-none focus:border-indigo-500 cursor-pointer"
                  >
                    {branchOptions.map(b => (
                      <option key={b.id} value={b.id}>{b.label}</option>
                    ))}
                    <option value="Todas">Geral / Todas as Filiais</option>
                  </select>
                </div>
              </div>

              {/* Título do Documento */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-bold text-slate-700 dark:text-slate-300 block">
                    Título / Descrição do Documento *
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const curType = documentTypes.find(t => t.id === formData.typeId);
                      if (curType) {
                        const issuerPart = formData.issuer.trim() ? ` - ${formData.issuer.trim()}` : '';
                        const branchPart = formData.branchId && formData.branchId !== 'Todas' ? ` (${formData.branchId})` : '';
                        setFormData(prev => ({ ...prev, title: `${curType.name}${issuerPart}${branchPart}` }));
                      }
                    }}
                    className="text-[11px] text-indigo-600 dark:text-indigo-400 font-bold hover:underline cursor-pointer flex items-center gap-1"
                    title="Sugerir título padronizado combinando o tipo, emissor e filial"
                  >
                    <Sparkles className="w-3 h-3 text-amber-500" />
                    <span>Sugerir Título pelo Tipo</span>
                  </button>
                </div>
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="Ex: Apólice Seguro Carga RCTR-C 2026 - Porto Seguro"
                  className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:border-indigo-500 font-semibold"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {/* Emissor / Seguradora */}
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 mb-1 block">
                    Órgão Emissor / Seguradora
                  </label>
                  <input
                    type="text"
                    value={formData.issuer}
                    onChange={(e) => setFormData(prev => ({ ...prev, issuer: e.target.value }))}
                    placeholder="Ex: Porto Seguro Cia de Seguros, Receita Federal, Caixa"
                    className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:border-indigo-500"
                  />
                </div>

                {/* Número do Documento */}
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 mb-1 block">
                    Número do Registro / Apólice / Certidão
                  </label>
                  <input
                    type="text"
                    value={formData.documentNumber}
                    onChange={(e) => setFormData(prev => ({ ...prev, documentNumber: e.target.value }))}
                    placeholder="Ex: AP-01.077.892/2026 ou CRF-2026-99"
                    className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:border-indigo-500 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {/* Data de Emissão */}
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 mb-1 block">
                    Data de Emissão (Opcional)
                  </label>
                  <input
                    type="date"
                    value={formData.issueDate}
                    onChange={(e) => setFormData(prev => ({ ...prev, issueDate: e.target.value }))}
                    className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:border-indigo-500 font-semibold"
                  />
                </div>

                {/* Data de Validade / Vencimento */}
                <div>
                  <label className="font-black text-rose-700 dark:text-rose-400 mb-1 flex items-center justify-between">
                    <span>Data de Validade / Vencimento *</span>
                    <span className="text-[10px] uppercase font-bold text-slate-400">Obrigatório</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={formData.expirationDate}
                    onChange={(e) => setFormData(prev => ({ ...prev, expirationDate: e.target.value }))}
                    className="w-full p-2.5 rounded-xl border-2 border-indigo-400 dark:border-indigo-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:border-indigo-500 font-bold"
                  />
                </div>
              </div>

              {/* CARD DE PRÉVIA DO STATUS DE ALERTA BASEADO NA DATA */}
              {formPreviewStatus && (
                <div className={`p-3 rounded-xl border flex items-center justify-between gap-2.5 ${formPreviewStatus.bgColor} ${formPreviewStatus.borderColor}`}>
                  <div className="flex items-center gap-2">
                    {formPreviewStatus.level === 'critical' ? (
                      <ShieldAlert className="w-5 h-5 text-red-600 animate-pulse shrink-0" />
                    ) : formPreviewStatus.level === 'warning' ? (
                      <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                    ) : formPreviewStatus.level === 'expired' ? (
                      <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
                    ) : (
                      <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                    )}
                    <div>
                      <div className="font-black text-xs">
                        Classificação de Alerta: <span className={formPreviewStatus.textColor}>{formPreviewStatus.label}</span>
                      </div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400">
                        {formPreviewStatus.level === 'critical' && 'Regra: Faltando 10 dias ou menos ativa o alerta "Crítico" automático.'}
                        {formPreviewStatus.level === 'warning' && 'Regra: Faltando 30 dias ou menos ativa o alerta "Atenção" automático.'}
                        {formPreviewStatus.level === 'ok' && 'Regra: Documento com mais de 30 dias de validade permanece em status "Em Dia".'}
                        {formPreviewStatus.level === 'expired' && 'Atenção: A data informada já se encontra vencida no calendário atual.'}
                      </div>
                    </div>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${formPreviewStatus.badgeClass}`}>
                    {formPreviewStatus.daysRemaining >= 0 ? `${formPreviewStatus.daysRemaining} dias` : 'Vencido'}
                  </span>
                </div>
              )}

              {/* Anexos de Arquivos ou Fotos */}
              <div className="p-3.5 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/40 space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <Paperclip className="w-4 h-4 text-indigo-500" />
                    Anexar Arquivo ou Foto da Apólice / Certidão
                  </label>
                  <span className="text-[11px] text-slate-400">PDF, PNG, JPG (máx. 25MB)</span>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  id="fiscal-doc-file-input"
                  onChange={handleFileChange}
                  className="hidden"
                  multiple
                  accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.xml,.txt"
                />

                {/* Lista de Arquivos Existentes */}
                {existingAttachments.length > 0 && (
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Arquivos já vinculados:</span>
                    {existingAttachments.map((att, idx) => (
                      <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs">
                        <span className="truncate max-w-[300px] font-semibold text-slate-800 dark:text-slate-200" title={att.name}>
                          {att.name}
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setPreviewFile({ url: att.url, name: att.name })}
                            className="p-1 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded"
                            title="Visualizar anexo"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveExistingAttachment(idx)}
                            className="p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded"
                            title="Remover anexo"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Lista de Novos Arquivos Selecionados */}
                {selectedNewFiles.length > 0 && (
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider block">Novos arquivos a enviar:</span>
                    {selectedNewFiles.map((file, idx) => (
                      <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-indigo-50/60 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 text-xs">
                        <span className="truncate max-w-[300px] font-semibold text-indigo-900 dark:text-indigo-200" title={file.name}>
                          {file.name} ({(file.size / 1024).toFixed(0)} KB)
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveNewFile(idx)}
                          className="p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded"
                          title="Remover este arquivo"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-2 pt-1 flex-wrap">
                  <label
                    htmlFor="fiscal-doc-file-input"
                    className="cursor-pointer inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-700 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors shadow-xs"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Escolher Arquivo(s) ou Foto(s)</span>
                  </label>
                  {isExtractingAttachment && (
                    <span className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold flex items-center gap-1.5 animate-pulse bg-indigo-50 dark:bg-indigo-950/40 px-2 py-1 rounded-lg border border-indigo-200 dark:border-indigo-800">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600" />
                      Lendo vencimento e emissão do documento...
                    </span>
                  )}
                  {(!isExtractingAttachment && existingAttachments.length === 0 && selectedNewFiles.length === 0) && (
                    <span className="text-xs text-slate-400 italic">Nenhum anexo selecionado</span>
                  )}
                </div>
              </div>

              {/* Observações */}
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 mb-1 block">
                  Observações, Coberturas e Instruções de Renovação
                </label>
                <textarea
                  rows={2}
                  value={formData.notes}
                  onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="Ex: Coberturas adicionais de tombamento, valor de LMG, contato do corretor ou instruções de renovação..."
                  className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:border-indigo-500 resize-none"
                />
              </div>

              {/* Rodapé Form */}
              <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={handleCloseDocModal}
                  disabled={isUploading}
                  className="px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isUploading}
                  className="px-5 py-2 rounded-xl text-xs sm:text-sm font-black bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-600/30 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isUploading && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>{isUploading ? 'Salvando documento...' : (editingDoc ? 'Atualizar Documento' : 'Salvar Documento Fiscal')}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DE GERENCIAMENTO DE TIPOS DE DOCUMENTO */}
      {isTypeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 w-full max-w-xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center">
                  <Tag className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900 dark:text-white">
                    Tipos de Documentos Fiscais
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Cadastre novos tipos ou gerencie os tipos existentes (Apólices, Certidões, Licenças, etc.).
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsTypeModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1">
              {/* Formulário Novo / Edição Tipo */}
              <form onSubmit={handleSaveNewType} className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-200 block">
                    {editingTypeId ? '✏️ Modificar Nome / Detalhes do Tipo' : '+ Adicionar Novo Tipo de Documento'}
                  </span>
                  {editingTypeId && (
                    <button
                      type="button"
                      onClick={handleCancelEditType}
                      className="text-[11px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 underline cursor-pointer"
                    >
                      Cancelar edição
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    type="text"
                    required
                    value={newTypeName}
                    onChange={(e) => setNewTypeName(e.target.value)}
                    placeholder="Nome do tipo (ex: Certidão IBAMA)"
                    className="p-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white outline-none focus:border-indigo-500 font-semibold"
                  />
                  <select
                    value={newTypeCategory}
                    onChange={(e) => setNewTypeCategory(e.target.value as any)}
                    className="p-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white outline-none focus:border-indigo-500 font-semibold"
                  >
                    <option value="seguro">Categoria: Seguro</option>
                    <option value="certidao">Categoria: Certidão</option>
                    <option value="licenca">Categoria: Licença / Autorização</option>
                    <option value="fiscal">Categoria: Fiscal / Alvará</option>
                    <option value="outros">Categoria: Outros</option>
                  </select>
                </div>
                <input
                  type="text"
                  value={newTypeDescription}
                  onChange={(e) => setNewTypeDescription(e.target.value)}
                  placeholder="Descrição breve ou finalidade (opcional)"
                  className="w-full p-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white outline-none focus:border-indigo-500"
                />
                <div className="flex justify-end gap-2">
                  {editingTypeId && (
                    <button
                      type="button"
                      onClick={handleCancelEditType}
                      className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 text-slate-700 dark:text-slate-200 cursor-pointer"
                    >
                      Cancelar
                    </button>
                  )}
                  <button
                    type="submit"
                    className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs cursor-pointer flex items-center gap-1"
                  >
                    {editingTypeId ? <Check className="w-3.5 h-3.5" /> : null}
                    <span>{editingTypeId ? 'Atualizar Tipo' : 'Salvar Tipo'}</span>
                  </button>
                </div>
              </form>

              {/* Lista dos tipos existentes */}
              <div className="space-y-1.5">
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400 block uppercase tracking-wider">
                  Tipos Cadastrados ({documentTypes.length})
                </span>
                <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden max-h-60 overflow-y-auto">
                  {documentTypes.map(t => (
                    <div key={t.id} className="p-2.5 bg-white dark:bg-slate-900 flex items-center justify-between text-xs hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <div>
                        <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                          <span>{t.name}</span>
                          <span className="text-[10px] uppercase font-semibold px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-500">
                            {t.category}
                          </span>
                        </div>
                        {t.description && (
                          <div className="text-[10px] text-slate-400 truncate max-w-xs">{t.description}</div>
                        )}
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleStartEditType(t)}
                          className="p-1 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 rounded cursor-pointer"
                          title="Editar ou renomear este tipo"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        {!t.isDefault && (
                          <button
                            type="button"
                            onClick={() => handleDeleteType(t.id, t.name)}
                            className="p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 rounded cursor-pointer"
                            title="Remover tipo de documento"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-3 bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={() => setIsTypeModalOpen(false)}
                className="px-4 py-1.5 rounded-xl text-xs font-bold bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200"
              >
                Concluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE PRÉ-VISUALIZAÇÃO DE ANEXO (PDF/IMAGENS) */}
      <DocumentPreviewModal
        isOpen={Boolean(previewFile)}
        onClose={() => setPreviewFile(null)}
        fileUrl={previewFile?.url || null}
        fileName={previewFile?.name || 'Documento Fiscal'}
        category="Controladoria Fiscal"
      />

      {/* MODAL DE ENVIO DE DOSSIÊ DE HOMOLOGAÇÃO PARA CLIENTES */}
      <FiscalHomologationModal
        isOpen={isHomologationModalOpen}
        onClose={() => {
          setIsHomologationModalOpen(false);
          setHomologationDocId(null);
        }}
        documents={documents}
        clients={internalClients}
        branches={branches}
        preselectedDocId={homologationDocId}
      />
    </div>
  );
};
export default ControlFiscalTab;
