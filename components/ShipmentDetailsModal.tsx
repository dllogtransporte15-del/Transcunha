import React, { useState } from 'react';
import type { Shipment, Cargo, User, Client, Product, Vehicle, CorporateEmailAttachment } from '../types';
import { UserProfile, ShipmentStatus, VehicleSetType, VehicleBodyType, DriverPaymentMethod, AnttModality, EtcTaxRegime } from '../types';
import { generateLoadingOrderPDF, isGoiasOrigin, isMinasOrigin, isSpOrigin } from '../utils/pdfGenerator';
import { FileTextIcon, Trash2, ArrowRightLeft, Edit2, Check, X, Copy, AlertCircle, Mail } from 'lucide-react';
import { getToolStaysByShipment, StayRecord } from '../utils/toolStorage';
import { getShipmentAttachmentUrl } from '../lib/db';
import { autoFormatInput } from '../utils/formatters';
import DocumentPreviewModal from './DocumentPreviewModal';
import SwapCargoModal from './SwapCargoModal';
import { StatusPendingModal } from './StatusPendingModal';
import { ComposeEmailModal } from './corporate-email/ComposeEmailModal';
import { corporateEmailService } from '../services/corporateEmailService';
import { openDocumentInNewTab, normalizeDocumentUrl, isActualDocumentUrl, isDocumentMetadataKey } from '../utils/documentViewer';
import { getShipmentCte, getShipmentCteEmissionDate, isCteApplicableForStatus, getShipmentCiotNumber } from '../utils';
import { isDemoUser, isDeveloperUser } from '../auth';
import { useToast } from '../hooks/useToast';


interface ShipmentDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  shipment: Shipment | null;
  cargo: Cargo | undefined;
  currentUser?: User | null;
  onUpdatePrice?: (shipmentId: string, data: { newTotal: number, newRate?: number, newCompanyRate?: number }) => void;
  onUpdateShipmentData?: (shipmentId: string, data: Partial<Shipment>, options?: { silent?: boolean }) => void;
  onAddAttachments?: (shipmentId: string, files: File[]) => Promise<void>;
  onDeleteAttachment?: (shipmentId: string, url: string) => Promise<void>;
  onSwapCargo?: (shipmentId: string, newCargoId: string) => void | Promise<void>;
  cargos?: Cargo[];
  clients: Client[];
  products: Product[];
  vehicles: Vehicle[];
  users: User[];
  companyLogo?: string | null;
}


const DetailItem: React.FC<{ label: string; value?: string | number | null; children?: React.ReactNode }> = ({ label, value, children }) => (
    <div>
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</p>
        {children || <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{value ?? 'N/A'}</p>}
    </div>
);

const ShipmentDetailsModal: React.FC<ShipmentDetailsModalProps> = ({ 
  isOpen, 
  onClose, 
  shipment, 
  cargo, 
  currentUser, 
  onUpdatePrice, 
  onUpdateShipmentData, 
  onAddAttachments, 
  onDeleteAttachment, 
  onSwapCargo,
  cargos = [],
  clients = [], 
  products = [], 
  vehicles = [], 
  users = [], 
  companyLogo 
}) => {

  const [isEditing, setIsEditing] = useState(false);
  const [editRate, setEditRate] = useState<number>(0);
  const [editCompanyRate, setEditCompanyRate] = useState<number>(0);
  const [isEditingData, setIsEditingData] = useState(false);
  const [editedData, setEditedData] = useState<Partial<Shipment>>({});
  const [filesToAttach, setFilesToAttach] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [shipmentStays, setShipmentStays] = useState<StayRecord[]>([]);
  const [previewDocument, setPreviewDocument] = useState<{ url: string; name?: string; category?: string } | null>(null);
  const [isSwapModalOpen, setIsSwapModalOpen] = useState(false);
  const [isPendingModalOpen, setIsPendingModalOpen] = useState(false);
  const [isEditingAdvance, setIsEditingAdvance] = useState(false);
  const [inlineAdvancePercentage, setInlineAdvancePercentage] = useState<number>(70);
  const [isSavingAdvance, setIsSavingAdvance] = useState(false);

  const [isEditingPaymentMethod, setIsEditingPaymentMethod] = useState(false);
  const [inlinePaymentMethod, setInlinePaymentMethod] = useState<string>(DriverPaymentMethod.PixEFrete);
  const [inlinePixKey, setInlinePixKey] = useState<string>('');
  const [inlineBankDetails, setInlineBankDetails] = useState<string>('');
  const [isSavingPaymentMethod, setIsSavingPaymentMethod] = useState(false);
  const { showToast } = useToast();
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const handleCopy = (text: string, key: string, label: string) => {
    if (!text) return;
    try {
      navigator.clipboard.writeText(text);
      setCopiedKey(key);
      showToast(`${label} copiado: ${text}`, 'success');
      setTimeout(() => {
        setCopiedKey(prev => (prev === key ? null : prev));
      }, 2000);
    } catch {
      showToast('Não foi possível copiar.', 'warning');
    }
  };

  React.useEffect(() => {
    if (shipment) {
      setInlineAdvancePercentage(shipment.advancePercentage !== undefined ? shipment.advancePercentage : 70);
      setIsEditingAdvance(false);
      setInlinePaymentMethod(shipment.paymentMethod || DriverPaymentMethod.PixEFrete);
      setInlinePixKey(shipment.pixKey || '');
      setInlineBankDetails(shipment.bankDetails || '');
      setIsEditingPaymentMethod(false);
    }
  }, [shipment?.id, shipment?.advancePercentage, shipment?.paymentMethod, shipment?.pixKey, shipment?.bankDetails]);

  const handleSaveInlineAdvance = async () => {
    if (!onUpdateShipmentData || !shipment) return;
    setIsSavingAdvance(true);
    try {
      await onUpdateShipmentData(shipment.id, { advancePercentage: inlineAdvancePercentage });
      setIsEditingAdvance(false);
    } catch (err) {
      console.error('Erro ao atualizar porcentagem de adiantamento:', err);
    } finally {
      setIsSavingAdvance(false);
    }
  };

  const handleSaveInlinePaymentMethod = async () => {
    if (!onUpdateShipmentData || !shipment) return;
    setIsSavingPaymentMethod(true);
    try {
      await onUpdateShipmentData(shipment.id, { 
        paymentMethod: inlinePaymentMethod,
        pixKey: (inlinePaymentMethod === DriverPaymentMethod.PixEFrete || inlinePaymentMethod === DriverPaymentMethod.PagamentoLivre) ? inlinePixKey : (shipment.pixKey || undefined),
        bankDetails: (inlinePaymentMethod === DriverPaymentMethod.DepositoConta || inlinePaymentMethod === DriverPaymentMethod.PagamentoLivre || inlineBankDetails) ? inlineBankDetails : (shipment.bankDetails || undefined)
      });
      setIsEditingPaymentMethod(false);
    } catch (err) {
      console.error('Erro ao atualizar forma de pagamento:', err);
    } finally {
      setIsSavingPaymentMethod(false);
    }
  };

  const emailAccounts = React.useMemo(() => corporateEmailService.getEmailAccounts(users), [users]);

  const [isOrderEmailModalOpen, setIsOrderEmailModalOpen] = useState(false);
  const [orderEmailSubject, setOrderEmailSubject] = useState('');
  const [orderEmailBody, setOrderEmailBody] = useState('');
  const [orderEmailAttachments, setOrderEmailAttachments] = useState<CorporateEmailAttachment[]>([]);

  const handleOpenOrderEmailModal = () => {
    if (!shipment || !cargo) return;
    try {
      const pdfResult = generateLoadingOrderPDF(
        shipment,
        cargo,
        clients,
        products,
        vehicles,
        companyLogo,
        undefined,
        { returnBase64Only: true }
      );
      if (!pdfResult || !pdfResult.base64) {
        showToast('Não foi possível gerar o PDF da Ordem de Carregamento.', 'error');
        return;
      }

      const linkedClient = clients.find(c => c.id === cargo.clientId);
      const clientName = linkedClient?.nomeFantasia || linkedClient?.razaoSocial || 'Cliente';
      const product = products.find(p => p.id === cargo.productId);
      const productName = product?.name || 'Mercadoria';
      const plates = [
        shipment.horsePlate,
        shipment.trailer1Plate,
        shipment.trailer2Plate,
        shipment.trailer3Plate,
      ]
        .filter(Boolean)
        .map(p => String(p).toUpperCase())
        .join(' / ');

      const scheduledLabel = shipment.scheduledDate
        ? `${shipment.scheduledDate.split('-').reverse().join('/')}${shipment.scheduledTime ? ` às ${shipment.scheduledTime}` : ''}`
        : '';

      const subject = `Ordem de Carregamento #${shipment.id} | ${clientName} | ${cargo.origin} -> ${cargo.destination} | Placa ${shipment.horsePlate.toUpperCase()}`;
      const bodyLines = [
        `Prezados(as),`,
        ``,
        `Segue em anexo a Ordem de Carregamento referente ao embarque #${shipment.id}.`,
        ``,
        `DADOS DO EMBARQUE:`,
        `• Embarque: #${shipment.id}`,
        `• Cliente: ${clientName}`,
        `• Produto: ${productName}`,
        `• Rota: ${cargo.origin} -> ${cargo.destination}`,
        `• Motorista: ${shipment.driverName}${shipment.driverCpf ? ` (CPF: ${shipment.driverCpf})` : ''}`,
        `• Veículo / Placas: ${plates || 'N/A'}`,
        shipment.shipmentTonnage ? `• Peso / Volume: ${shipment.shipmentTonnage.toLocaleString('pt-BR')} ton` : '',
        scheduledLabel ? `• Previsão de Carregamento: ${scheduledLabel}` : '',
        shipment.statusPendingObservation ? `• Observações: ${shipment.statusPendingObservation}` : '',
        ``,
        `Atenciosamente,`,
        `Transcunha Transportes e Logística LTDA.`,
      ].filter(line => line !== '');

      setOrderEmailSubject(subject);
      setOrderEmailBody(bodyLines.join('\n'));
      setOrderEmailAttachments([
        {
          id: `att_oc_${shipment.id}_${Date.now()}`,
          filename: pdfResult.filename,
          sizeBytes: pdfResult.sizeBytes,
          contentType: 'application/pdf',
          base64: pdfResult.base64,
        },
      ]);
      setIsOrderEmailModalOpen(true);
    } catch (err) {
      console.error('Erro ao preparar Ordem de Carregamento por e-mail:', err);
      showToast('Falha ao preparar o e-mail da Ordem de Carregamento.', 'error');
    }
  };

  React.useEffect(() => {
    let isMounted = true;
    if (isOpen && shipment) {
      getToolStaysByShipment(shipment.id)
        .then(stays => {
          if (isMounted) setShipmentStays(stays || []);
        })
        .catch(err => {
          console.warn('Erro ao buscar estadias:', err);
          if (isMounted) setShipmentStays([]);
        });
    } else {
      setShipmentStays([]);
    }
    return () => {
      isMounted = false;
    };
  }, [isOpen, shipment?.id]);

  if (!isOpen || !shipment) return null;

  const formatCurrency = (value?: number | null) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0);
  const formatDate = (dateString?: string | null) => {
    if (!dateString) return 'N/A';
    const d = new Date(dateString);
    return isNaN(d.getTime()) ? String(dateString) : d.toLocaleString('pt-BR');
  };

  const isDemo = isDemoUser(currentUser);
  const isFinalized = shipment.status === ShipmentStatus.Finalizado;
  const isAdmin = isDeveloperUser(currentUser) ||
    currentUser?.profile === UserProfile.Desenvolvedor ||
    currentUser?.profile === UserProfile.Admin ||
    currentUser?.profile === UserProfile.GerenciadoraDeRisco ||
    (currentUser?.profile as string) === 'Administrador do Sistema' ||
    (currentUser?.profile as string) === 'Gerenciadora de Risco' ||
    Boolean(currentUser?.name && (currentUser.name.toLowerCase().includes('samanta') || currentUser.name.toLowerCase().includes('samantha'))) ||
    Boolean(currentUser?.email && (currentUser.email.toLowerCase().includes('samanta') || currentUser.email.toLowerCase().includes('samantha')));
  const isDiretoria = currentUser?.profile === UserProfile.Diretor;

  const isOperationalPriceEditor = currentUser?.profile ? [
    UserProfile.Embarcador,
    UserProfile.Agenciador,
    UserProfile.Comercial
  ].includes(currentUser.profile) : false;

  const canEdit = !isDemo && !!onUpdatePrice && (
    (isFinalized ? isAdmin : (isAdmin || isOperationalPriceEditor))
  );

  const isBeforeAdvanceStatus = [
    ShipmentStatus.PreCadastro,
    'Ag. Cadastro',
    'PreCadastro',
    ShipmentStatus.AguardandoSeguradora,
    'Ag. Seguradora',
    'AguardandoSeguradora',
    ShipmentStatus.AguardandoCarregamento,
    'Ag. Carregamento',
    'AguardandoCarregamento',
    ShipmentStatus.AguardandoNota,
    'Ag. Nota',
    'AguardandoNota',
    ShipmentStatus.AguardandoFiscal,
    'Ag. Fiscal',
    'AguardandoFiscal',
  ].includes(shipment.status);

  const canEditPaymentDetails = !isDemo && !!onUpdateShipmentData && (
    isBeforeAdvanceStatus || isAdmin || isDiretoria
  );

  const tonnage = Number(shipment.shipmentTonnage) || 0;
  const driverFreight = Number(shipment.driverFreightValue) || 0;
  const driverRateSnapshot = shipment.driverFreightRateSnapshot || (driverFreight / (tonnage || 1));
  const companyRateSnapshot = shipment.companyFreightRateSnapshot || cargo?.companyFreightValuePerTon || 0;
  const commissionPerTon = Number(cargo?.salespersonCommissionPerTon) || 0;

  // Custo Financeiro
  const financialCostMonthlyRate = shipment.financialCostMonthlyRate !== undefined 
    ? shipment.financialCostMonthlyRate 
    : (cargo?.financialCostMonthlyRate || 0);
  const financialCostDaysTerm = shipment.financialCostDaysTerm !== undefined 
    ? shipment.financialCostDaysTerm 
    : (cargo?.financialCostDaysTerm || 0);
  const financialCostRate = shipment.financialCostRate !== undefined 
    ? shipment.financialCostRate 
    : (cargo?.financialCostEffectiveRate !== undefined 
        ? cargo.financialCostEffectiveRate 
        : ((financialCostMonthlyRate * financialCostDaysTerm) / (cargo?.financialCostBaseDays || 30)));
  const calculatedFinancialCost = (financialCostRate > 0 && (companyRateSnapshot * tonnage) > 0)
    ? Number(((companyRateSnapshot * tonnage) * (financialCostRate / 100)).toFixed(2))
    : 0;
  const financialCostValue = calculatedFinancialCost > 0
    ? calculatedFinancialCost
    : ((shipment.financialCostValue !== undefined && shipment.financialCostValue > 0)
        ? shipment.financialCostValue
        : 0);

  // Valor original colocado na carga (R$/ton) e teto de +R$ 5,00 para perfis operacionais
  const cargoBaseDriverRate = (cargo?.driverFreightValuePerTon !== undefined && cargo.driverFreightValuePerTon > 0)
    ? cargo.driverFreightValuePerTon
    : (driverRateSnapshot || 0);

  const maxAllowedDriverRate = isAdmin 
    ? Infinity 
    : Number((cargoBaseDriverRate + 5.00).toFixed(2));

  const staysList = Array.isArray(shipmentStays) ? shipmentStays : [];
  const approvedStaysValue = staysList.reduce((acc, stay) => acc + (Number(stay.approvedValue) || 0), 0);
  const driverPaidStaysValue = staysList.reduce((acc, stay) => acc + (Number(stay.driverPaidValue) || 0), 0);
  const netDemurrage = approvedStaysValue - driverPaidStaysValue;

  const handleStartEdit = () => {
    if (isDemo) return;
    setEditRate(driverRateSnapshot);
    setEditCompanyRate(companyRateSnapshot);
    setIsEditing(true);
  };

  const mainVehicle = (vehicles || []).find(v => v.plate === shipment.horsePlate);
  const embarcador = (users || []).find(u => u.id === shipment.embarcadorId);
  const product = (products || []).find(p => p.id === cargo?.productId);

  const handleSave = () => {
    if (isDemo) return;
    if (onUpdatePrice) {
      if (!isAdmin && isOperationalPriceEditor && editRate > maxAllowedDriverRate + 0.001) {
        alert(`O frete do motorista não pode ultrapassar ${formatCurrency(maxAllowedDriverRate)}/ton (R$ 5,00 a mais que o valor colocado na carga).`);
        return;
      }
      const newTotal = Number((editRate * tonnage).toFixed(2));
      onUpdatePrice(shipment.id, {
        newTotal,
        newRate: editRate,
        newCompanyRate: isAdmin ? editCompanyRate : undefined
      });
      setIsEditing(false);
    }
  };

  const handleStartEditData = () => {
    if (isDemo) return;
    setEditedData({
      driverName: shipment.driverName,
      driverCpf: shipment.driverCpf,
      driverContact: shipment.driverContact,
      horsePlate: shipment.horsePlate,
      trailer1Plate: shipment.trailer1Plate,
      trailer2Plate: shipment.trailer2Plate,
      trailer3Plate: shipment.trailer3Plate,
      vehicleTag: shipment.vehicleTag,
      vehicleSetType: shipment.vehicleSetType || mainVehicle?.setType,
      vehicleBodyType: shipment.vehicleBodyType || mainVehicle?.bodyType,
      shipmentTonnage: tonnage,
      driverFreightRateSnapshot: driverRateSnapshot,
      driverFreightValue: driverFreight,
      paymentMethod: shipment.paymentMethod || DriverPaymentMethod.PixEFrete,
      pixKey: shipment.pixKey || '',
      bankDetails: shipment.bankDetails || '',
      advancePercentage: shipment.advancePercentage !== undefined ? shipment.advancePercentage : 70,
      driverReferences: shipment.driverReferences,
      anttModality: shipment.anttModality,
      etcTaxRegime: shipment.etcTaxRegime,
      driverFreightType: shipment.driverFreightType,
      ownerContact: shipment.ownerContact,
      anttOwnerIdentifier: shipment.anttOwnerIdentifier,
      cteNumber: isCteApplicableForStatus(shipment.status) ? (shipment.cteNumber || (getShipmentCte(shipment) !== '-' ? getShipmentCte(shipment) : '')) : '',
      cteEmissionDate: isCteApplicableForStatus(shipment.status) ? (shipment.cteEmissionDate || (getShipmentCteEmissionDate(shipment) || '')) : '',
      ciotNumber: shipment.ciotNumber || shipment.ciot || (getShipmentCiotNumber(shipment) !== '-' ? getShipmentCiotNumber(shipment) : ''),
      ciot: shipment.ciot || shipment.ciotNumber || (getShipmentCiotNumber(shipment) !== '-' ? getShipmentCiotNumber(shipment) : ''),
      statusPendingObservation: shipment.statusPendingObservation || '',
    });
    setIsEditingData(true);
  };

  const handleSaveData = () => {
    if (isDemo) return;
    if (onUpdateShipmentData) {
      const finalRate = editedData.driverFreightRateSnapshot !== undefined ? editedData.driverFreightRateSnapshot : driverRateSnapshot;
      if (!isAdmin && isOperationalPriceEditor && finalRate > maxAllowedDriverRate + 0.001) {
        alert(`O frete do motorista não pode ultrapassar ${formatCurrency(maxAllowedDriverRate)}/ton (R$ 5,00 a mais que o valor colocado na carga).`);
        return;
      }
      const finalTon = editedData.shipmentTonnage !== undefined ? editedData.shipmentTonnage : tonnage;
      const finalTotal = finalRate * finalTon;
      onUpdateShipmentData(shipment.id, {
        ...editedData,
        driverFreightRateSnapshot: finalRate,
        driverFreightValue: finalTotal,
        statusPendingObservation: editedData.statusPendingObservation !== undefined ? (editedData.statusPendingObservation.trim() || undefined) : undefined
      });
      setIsEditingData(false);
    }
  };

  const handleConfirmAttachments = async () => {
    if (isDemo) return;
    if (!onAddAttachments || filesToAttach.length === 0) return;
    setIsUploading(true);
    try {
      await onAddAttachments(shipment.id, filesToAttach);
      setFilesToAttach([]);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9998]"
        onClick={onClose}
      />
      {/* Modal Container */}
      <div className="fixed inset-0 z-[9999] flex justify-center items-center pointer-events-none p-4">
        <div 
          className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-6 max-w-6xl w-full max-h-[90vh] flex flex-col border border-gray-200 dark:border-gray-700 pointer-events-auto"
          onClick={(e) => e.stopPropagation()}
        >
        <div className="flex justify-between items-start mb-4 border-b pb-4 dark:border-gray-700 shrink-0">
            <div>
                <div className="flex items-center gap-3">
                    <h2 className="text-2xl font-bold text-gray-800 dark:text-white">Detalhes do Embarque</h2>
                    {!isDemo && shipment && cargo && ![ShipmentStatus.AguardandoSeguradora, ShipmentStatus.PreCadastro, ShipmentStatus.Cancelado].includes(shipment.status) && (
                        <button
                            type="button"
                            onClick={handleOpenOrderEmailModal}
                            title="Enviar Ordem de Carregamento por E-mail com PDF anexado"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 dark:text-blue-300 rounded-md text-xs font-bold transition-all shadow-sm border border-blue-200 dark:border-blue-800/60 cursor-pointer"
                        >
                            <Mail size={14} />
                            <span>Enviar Ordem por E-mail</span>
                        </button>
                    )}
                    {shipment && ![ShipmentStatus.AguardandoSeguradora, ShipmentStatus.PreCadastro, ShipmentStatus.Cancelado].includes(shipment.status) && (() => {
                        const linkedClient = clients.find(c => c.id === cargo?.clientId);
                        const linkedBranch = linkedClient?.secondaryCnpjs?.find(b => b.id === cargo?.clientBranchId || b.cnpj === cargo?.clientCnpj);
                        const activeLoadingOrderModelId = linkedBranch?.loadingOrderModelId || linkedBranch?.ordemCarregamentoModelId || linkedClient?.loadingOrderModelId || linkedClient?.ordemCarregamentoModelId;
                        const isConsubePayingClient = [
                            linkedClient?.nomeFantasia,
                            linkedClient?.razaoSocial,
                            linkedBranch?.razaoSocial,
                        ].some(name => String(name || '').toUpperCase().includes('CONSUBE'));
                        const isConsubeModel = activeLoadingOrderModelId === 'mod_consube' && isConsubePayingClient;
                        const isGoias = cargo ? isGoiasOrigin(cargo, shipment) : false;
                        const isSp = cargo ? isSpOrigin(cargo, shipment) : false;
                        const isMinas = cargo ? isMinasOrigin(cargo, shipment) : false;
                        const originBranchTitle = isGoias ? ' - Filial Catalão/GO' : isSp ? ' - Filial Ipaussu/SP' : isMinas ? ' - Matriz Pratápolis/MG' : '';

                        return (
                            <div className="inline-flex items-center gap-1.5">
                                <button
                                    onClick={() => cargo && generateLoadingOrderPDF(shipment, cargo, clients, products, vehicles, companyLogo)}
                                    title={
                                        isConsubeModel 
                                            ? `Gerar Ordem de Carregamento - Modelo Consube (PDF${originBranchTitle})` 
                                            : `Gerar Ordem de Carregamento (PDF${originBranchTitle})`
                                    }
                                    className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-bold transition-all shadow-sm border ${
                                        isConsubeModel 
                                            ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-700/60 hover:bg-amber-500/20' 
                                            : 'bg-indigo-50 text-indigo-600 rounded-md hover:bg-indigo-600 hover:text-white border-indigo-100 dark:bg-indigo-900/30 dark:text-indigo-400 dark:border-indigo-800/50'
                                    }`}
                                >
                                    <FileTextIcon size={15} />
                                    <span>{isConsubeModel ? 'Ordem Consube' : 'Ordem de Carga'}</span>
                                    {isGoias && (
                                        <span className="ml-0.5 px-1 py-0.2 text-[9px] font-black rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700" title="Origem Goiás - Emissão Filial Catalão/GO">
                                            GO
                                        </span>
                                    )}
                                    {isSp && (
                                        <span className="ml-0.5 px-1 py-0.2 text-[9px] font-black rounded bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 border border-purple-300 dark:border-purple-700" title="Origem São Paulo - Emissão Filial Ipaussu/SP">
                                            SP
                                        </span>
                                    )}
                                    {isMinas && (
                                        <span className="ml-0.5 px-1 py-0.2 text-[9px] font-black rounded bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300 border border-sky-300 dark:border-sky-700" title="Origem Minas Gerais - Emissão Matriz Pratápolis/MG">
                                            MG
                                        </span>
                                    )}
                                </button>
                                {!isConsubeModel && isConsubePayingClient && (
                                    <button
                                        onClick={() => cargo && generateLoadingOrderPDF(shipment, cargo, clients, products, vehicles, companyLogo, 'mod_consube')}
                                        title={`Emitir Ordem de Carregamento no Modelo Consube${originBranchTitle}`}
                                        className="inline-flex items-center gap-1 px-2 py-1.5 bg-gray-50 hover:bg-amber-50 text-gray-600 hover:text-amber-700 dark:bg-gray-800 dark:hover:bg-amber-900/30 dark:text-gray-300 dark:hover:text-amber-300 rounded-md text-[11px] font-semibold transition-all border border-gray-200 dark:border-gray-700"
                                    >
                                        <span>Mod. Consube</span>
                                        {isGoias && (
                                            <span className="text-[9px] font-black text-emerald-600 dark:text-emerald-400">
                                                (GO)
                                            </span>
                                        )}
                                        {isSp && (
                                            <span className="text-[9px] font-black text-purple-600 dark:text-purple-400">
                                                (SP)
                                            </span>
                                        )}
                                        {isMinas && (
                                            <span className="text-[9px] font-black text-sky-600 dark:text-sky-400">
                                                (MG)
                                            </span>
                                        )}
                                    </button>
                                )}
                            </div>
                        );
                    })()}
                </div>
                <p className="text-sm font-mono text-primary dark:text-blue-400 mt-1">{shipment.id}</p>
            </div>

            <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition">&times;</button>
        </div>
        
        <div className="flex-1 overflow-y-auto space-y-6 pr-2">
            
            {/* Rota e Origem/Destino */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-blue-50/50 dark:bg-blue-900/20 rounded-lg border border-blue-100 dark:border-blue-800/50">
                <DetailItem label="Origem da Carga" value={cargo?.origin} />
                <DetailItem label="Destino da Carga" value={cargo?.destination} />
                <DetailItem label="Produto" value={product?.name || (cargo as any)?.productName || 'GRÃOS'} />
                <DetailItem label="Nº do Pedido" value={cargo?.orderNumber || (cargo as any)?.numeroPedido || cargo?.tmsLoteNumber || 'N/A'} />
                <DetailItem label="Tipo / Embalagem" value={cargo?.packaging || 'Granel'} />
                <DetailItem label="Carga Vinculada">
                    <div className="flex items-center justify-between gap-2 mt-0.5">
                        <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                            {cargo?.sequenceId ? `#${cargo.sequenceId}${cargo.orderNumber ? ` (Ped: ${cargo.orderNumber})` : (cargo.tmsLoteNumber ? ` (Lote: ${cargo.tmsLoteNumber})` : '')}` : (cargo?.id || 'N/A')}
                        </span>
                        {onSwapCargo && !isDemo && shipment.status !== ShipmentStatus.Cancelado && (
                            <button
                                type="button"
                                onClick={() => setIsSwapModalOpen(true)}
                                className="text-[11px] font-bold text-primary dark:text-blue-400 hover:underline flex items-center gap-1 cursor-pointer bg-primary/10 dark:bg-primary/20 px-2 py-0.5 rounded"
                                title="Trocar carga vinculada"
                            >
                                <ArrowRightLeft size={12} />
                                <span>Trocar</span>
                            </button>
                        )}
                    </div>
                </DetailItem>
                <DetailItem label="Status Atual">
                    <div className="flex flex-col gap-1.5 mt-0.5">
                        <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">{shipment.status}</span>
                            {!isDemo && onUpdateShipmentData && (
                                <button
                                    type="button"
                                    onClick={() => setIsPendingModalOpen(true)}
                                    className="text-[11px] font-bold text-amber-700 dark:text-amber-400 hover:underline flex items-center gap-1 cursor-pointer bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 px-2 py-0.5 rounded transition-all"
                                    title="Editar ou informar pendência do status"
                                >
                                    <AlertCircle size={12} />
                                    <span>{shipment.statusPendingObservation ? 'Editar Pendência' : '+ Pendência'}</span>
                                </button>
                            )}
                        </div>
                        {shipment.statusPendingObservation && (
                            <div className="p-2 rounded-md bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700/60 text-amber-900 dark:text-amber-200 text-xs flex items-start gap-1.5 shadow-xs">
                                <AlertCircle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                                <div className="flex-1">
                                    <span className="font-bold">Pendência:</span> {shipment.statusPendingObservation}
                                </div>
                            </div>
                        )}
                    </div>
                </DetailItem>
                <DetailItem label="Comercial (Embarcador)" value={embarcador?.name || 'N/A'} />
                {shipment.status === 'Cancelado' && shipment.cancellationReason && (
                    <div className="md:col-span-2 mt-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800/50 rounded-md">
                        <p className="text-xs font-medium text-red-800 dark:text-red-400">Motivo do Cancelamento</p>
                        <p className="text-sm font-semibold text-red-900 dark:text-red-200 mt-1">{shipment.cancellationReason}</p>
                    </div>
                )}
            </div>

            {/* Informações do Motorista e Veículo */}
            <div className="border-t dark:border-gray-700 pt-4">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Motorista e Veículo</h3>
                    {!isEditingData ? (
                        !isDemo && (
                            <button 
                                onClick={handleStartEditData}
                                className="text-xs font-semibold text-primary hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 flex items-center gap-1"
                            >
                                <span>Editar Dados</span>
                            </button>
                        )
                    ) : (
                        <div className="flex gap-2">
                            <button 
                                onClick={handleSaveData}
                                className="px-3 py-1 bg-green-600 text-white text-xs font-bold rounded hover:bg-green-700 transition"
                            >
                                Salvar
                            </button>
                            <button 
                                onClick={() => setIsEditingData(false)}
                                className="px-3 py-1 bg-gray-500 text-white text-xs font-bold rounded hover:bg-gray-600 transition"
                            >
                                Cancelar
                            </button>
                        </div>
                    )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {isEditingData ? (
                        <>
                            <div>
                                <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Motorista</label>
                                <input 
                                    type="text"
                                    className="w-full mt-1 p-1.5 text-sm border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                    value={editedData.driverName || ''}
                                    onChange={e => setEditedData({...editedData, driverName: autoFormatInput('driverName', e.target.value)})}
                                />
                            </div>
                            <div>
                                <label className="text-xs font-medium text-gray-500 dark:text-gray-400">CPF</label>
                                <input 
                                    type="text"
                                    className="w-full mt-1 p-1.5 text-sm border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                    value={editedData.driverCpf || ''}
                                    onChange={e => setEditedData({...editedData, driverCpf: autoFormatInput('driverCpf', e.target.value)})}
                                />
                            </div>
                            <div>
                                <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Contato</label>
                                <input 
                                    type="text"
                                    className="w-full mt-1 p-1.5 text-sm border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                    value={editedData.driverContact || ''}
                                    onChange={e => setEditedData({...editedData, driverContact: autoFormatInput('phone', e.target.value)})}
                                />
                            </div>
                            <div>
                                <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Placa Cavalo</label>
                                <input 
                                    type="text"
                                    className="w-full mt-1 p-1.5 text-sm border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                    value={editedData.horsePlate || ''}
                                    onChange={e => setEditedData({...editedData, horsePlate: e.target.value.toUpperCase()})}
                                />
                            </div>
                            <div>
                                <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Placa Carreta 1</label>
                                <input 
                                    type="text"
                                    className="w-full mt-1 p-1.5 text-sm border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                    value={editedData.trailer1Plate || ''}
                                    onChange={e => setEditedData({...editedData, trailer1Plate: e.target.value.toUpperCase()})}
                                />
                            </div>
                            <div>
                                <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Placa Carreta 2</label>
                                <input 
                                    type="text"
                                    className="w-full mt-1 p-1.5 text-sm border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                    value={editedData.trailer2Plate || ''}
                                    onChange={e => setEditedData({...editedData, trailer2Plate: e.target.value.toUpperCase()})}
                                />
                            </div>
                            <div>
                                <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Placa Carreta 3</label>
                                <input 
                                    type="text"
                                    className="w-full mt-1 p-1.5 text-sm border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                    value={editedData.trailer3Plate || ''}
                                    onChange={e => setEditedData({...editedData, trailer3Plate: e.target.value.toUpperCase()})}
                                />
                            </div>
                            <div>
                                <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Tag do Veículo</label>
                                <input 
                                    type="text"
                                    className="w-full mt-1 p-1.5 text-sm border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                    value={editedData.vehicleTag || ''}
                                    onChange={e => setEditedData({...editedData, vehicleTag: e.target.value})}
                                />
                            </div>
                            <div>
                                <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Tipo de Veículo</label>
                                <select 
                                    className="w-full mt-1 p-1.5 text-sm border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                    value={editedData.vehicleSetType || ''}
                                    onChange={e => setEditedData({...editedData, vehicleSetType: e.target.value as VehicleSetType})}
                                >
                                    <option value="" disabled>Selecione...</option>
                                    {Object.values(VehicleSetType).map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Carroceria</label>
                                <select 
                                    className="w-full mt-1 p-1.5 text-sm border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                    value={editedData.vehicleBodyType || ''}
                                    onChange={e => setEditedData({...editedData, vehicleBodyType: e.target.value as VehicleBodyType})}
                                >
                                    <option value="" disabled>Selecione...</option>
                                    {Object.values(VehicleBodyType).map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                            </div>
                            <div className="md:col-span-2 lg:col-span-3 p-3 bg-amber-50/50 dark:bg-amber-950/20 rounded-lg border border-amber-200 dark:border-amber-800/40">
                                <label className="text-xs font-bold text-amber-800 dark:text-amber-300 flex items-center gap-1.5 mb-1">
                                    <AlertCircle size={14} className="text-amber-600 dark:text-amber-400" />
                                    <span>Pendência do Status Atual ({shipment.status})</span>
                                </label>
                                <input 
                                    type="text"
                                    className="w-full p-2 text-sm border border-amber-300 dark:border-amber-700 rounded-md dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-amber-500 outline-none"
                                    value={editedData.statusPendingObservation || ''}
                                    onChange={e => setEditedData({...editedData, statusPendingObservation: e.target.value})}
                                    placeholder="Ex: Aguardando facial, pendente consulta CNH, fila do pátio..."
                                />
                            </div>
                            <div>
                                <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Número do CT-e</label>
                                <input 
                                    type="text"
                                    className="w-full mt-1 p-1.5 text-sm border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                    value={editedData.cteNumber || ''}
                                    onChange={e => setEditedData({...editedData, cteNumber: e.target.value})}
                                    placeholder="Ex: 1753"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Data/Hora Emissão CT-e</label>
                                <input 
                                    type="text"
                                    className="w-full mt-1 p-1.5 text-sm border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                    value={editedData.cteEmissionDate || ''}
                                    onChange={e => setEditedData({...editedData, cteEmissionDate: e.target.value})}
                                    placeholder="Ex: 13/08/2026 11:40"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Número do CIOT</label>
                                <input 
                                    type="text"
                                    className="w-full mt-1 p-1.5 text-sm border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                    value={editedData.ciotNumber || ''}
                                    onChange={e => setEditedData({...editedData, ciotNumber: e.target.value, ciot: e.target.value})}
                                    placeholder="Ex: 520.038.012.363/9057"
                                />
                            </div>
                        </>
                    ) : (
                        <>
                            <DetailItem label="Motorista">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                    {(() => {
                                        const atua = shipment.codigoAtua || (shipment.documents as any)?.codigo_atua || (shipment.documents as any)?.codg_atua || (shipment.documents as any)?.codigoAtua;
                                        return atua ? (
                                            <span 
                                                onClick={() => handleCopy(atua, 'modal_atua', 'Código ATUA')}
                                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-black font-mono bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-200 border border-blue-300 dark:border-blue-700/60 shadow-2xs cursor-pointer hover:bg-blue-200/80 dark:hover:bg-blue-800/80 transition-colors"
                                                title={`Código ATUA: ${atua} (Clique para copiar)`}
                                            >
                                                <span>{atua}</span>
                                                <button
                                                    type="button"
                                                    onClick={(e) => { e.stopPropagation(); handleCopy(atua, 'modal_atua', 'Código ATUA'); }}
                                                    className="text-blue-600 hover:text-blue-950 dark:text-blue-300 dark:hover:text-white transition-colors cursor-pointer p-0.5 rounded"
                                                    title={`Copiar Código ATUA (${atua})`}
                                                >
                                                    {copiedKey === 'modal_atua' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                                                </button>
                                            </span>
                                        ) : null;
                                    })()}
                                    <span className="font-semibold text-gray-800 dark:text-gray-100">{shipment.driverName}</span>
                                </div>
                            </DetailItem>
                            <DetailItem label="Documento (CPF)" value={shipment.driverCpf} />
                            <DetailItem label="Contato" value={shipment.driverContact} />
                            
                            <div className="md:col-span-2 lg:col-span-3 h-px bg-gray-100 dark:bg-gray-700 my-2" />
                            
                            <DetailItem label="Placa do Cavalo">
                                {shipment.horsePlate ? (
                                    <div className="flex items-center gap-1.5 font-semibold text-gray-800 dark:text-gray-200">
                                        <span 
                                            onClick={() => handleCopy(shipment.horsePlate!, 'modal_horse_plate', 'Placa do Cavalo')}
                                            className="font-mono cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                                            title="Clique para copiar a Placa do Cavalo"
                                        >
                                            {shipment.horsePlate}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={(e) => { e.stopPropagation(); handleCopy(shipment.horsePlate!, 'modal_horse_plate', 'Placa do Cavalo'); }}
                                            className="p-1 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 rounded transition-colors cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700"
                                            title="Copiar Placa do Cavalo"
                                        >
                                            {copiedKey === 'modal_horse_plate' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                                        </button>
                                    </div>
                                ) : (
                                    <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">N/A</p>
                                )}
                            </DetailItem>
                            <DetailItem label="Placa Carreta 1">
                                {shipment.trailer1Plate ? (
                                    <div className="flex items-center gap-1.5 font-semibold text-gray-800 dark:text-gray-200">
                                        <span 
                                            onClick={() => handleCopy(shipment.trailer1Plate!, 'modal_trailer1', 'Placa Carreta 1')}
                                            className="font-mono cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                                            title="Clique para copiar a Placa Carreta 1"
                                        >
                                            {shipment.trailer1Plate}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={(e) => { e.stopPropagation(); handleCopy(shipment.trailer1Plate!, 'modal_trailer1', 'Placa Carreta 1'); }}
                                            className="p-1 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 rounded transition-colors cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700"
                                            title="Copiar Placa Carreta 1"
                                        >
                                            {copiedKey === 'modal_trailer1' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                                        </button>
                                    </div>
                                ) : (
                                    <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">N/A</p>
                                )}
                            </DetailItem>
                            <DetailItem label="Placa Carreta 2" value={shipment.trailer2Plate || 'N/A'} />
                            <DetailItem label="Placa Carreta 3" value={shipment.trailer3Plate || 'N/A'} />
                            <DetailItem label="Tag do Veículo" value={shipment.vehicleTag || 'N/A'} />
                            <DetailItem label="Tipo de Veículo" value={shipment.vehicleSetType || mainVehicle?.setType || 'N/A'} />
                            <DetailItem label="Carroceria" value={shipment.vehicleBodyType || mainVehicle?.bodyType || 'N/A'} />
                            <DetailItem label="Número do CT-e">
                                {(() => {
                                    const cte = getShipmentCte(shipment);
                                    const cteDate = getShipmentCteEmissionDate(shipment);
                                    if (cte === '-') return <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">N/A</p>;
                                    return (
                                        <div>
                                            <p className="text-sm font-bold text-blue-600 dark:text-blue-400">{cte}</p>
                                            {cteDate && <p className="text-xs text-gray-500 dark:text-gray-400">Emissão: {cteDate}</p>}
                                        </div>
                                    );
                                })()}
                            </DetailItem>
                            <DetailItem label="CIOT">
                                {(() => {
                                    const ciotVal = getShipmentCiotNumber(shipment);
                                    if (ciotVal === '-') return <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">N/A</p>;
                                    return <p className="text-sm font-bold text-rose-600 dark:text-rose-400">{ciotVal}</p>;
                                })()}
                            </DetailItem>
                        </>
                    )}
                </div>
            </div>

            {/* Frete e Financeiro */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t dark:border-gray-700 pt-4">
                <div className="md:col-span-2 flex justify-between items-center mb-2">
                    <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider">Informações Financeiras</h3>
                    {canEdit && !isEditing && (
                        <button 
                            onClick={handleStartEdit}
                            className="text-xs font-bold text-primary dark:text-blue-400 hover:underline flex items-center gap-1"
                        >
                            Editar Valores
                        </button>
                    )}
                </div>

                {isEditing ? (
                    <>
                        <div className="space-y-4 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg border dark:border-gray-600 md:col-span-2">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Taxa Motorista (R$ / Ton)</label>
                                    <input 
                                        type="number" 
                                        step="0.01"
                                        value={editRate}
                                        onChange={(e) => setEditRate(Number(e.target.value))}
                                        className={`w-full p-2 text-sm border rounded dark:bg-gray-800 dark:text-white ${
                                          !isAdmin && isOperationalPriceEditor && editRate > maxAllowedDriverRate + 0.001 
                                            ? 'border-red-500 dark:border-red-500 bg-red-50/20' 
                                            : 'dark:border-gray-600'
                                        }`}
                                    />
                                    {isOperationalPriceEditor && !isAdmin && (
                                        <p className="text-[10px] text-blue-600 dark:text-blue-400 mt-1">
                                            Limite operacional: máx. {formatCurrency(maxAllowedDriverRate)}/ton (+R$ 5,00 da carga)
                                        </p>
                                    )}
                                    {!isAdmin && isOperationalPriceEditor && editRate > maxAllowedDriverRate + 0.001 && (
                                        <p className="text-[10px] text-red-600 dark:text-red-400 font-bold mt-0.5">
                                            ⚠️ Ultrapassa o teto permitido de {formatCurrency(maxAllowedDriverRate)}/ton.
                                        </p>
                                    )}
                                </div>
                                {isAdmin ? (
                                    <div>
                                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Frete Empresa (R$ / Ton)</label>
                                        <input 
                                            type="number" 
                                            step="0.01"
                                            value={editCompanyRate}
                                            onChange={(e) => setEditCompanyRate(Number(e.target.value))}
                                            className="w-full p-2 text-sm border rounded dark:bg-gray-800 dark:border-gray-600 dark:text-white"
                                        />
                                    </div>
                                ) : (
                                    <div>
                                        <label className="block text-xs font-medium text-gray-400 dark:text-gray-500 mb-1">Frete Empresa (R$ / Ton)</label>
                                        <div className="w-full p-2 text-sm border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800/60 rounded text-gray-500 dark:text-gray-400">
                                            {formatCurrency(companyRateSnapshot)}/ton (Restrito ao Administrador)
                                        </div>
                                    </div>
                                )}
                            </div>
                            <div className="flex justify-between items-center pt-2 border-t dark:border-gray-600 mt-2">
                                <div className="text-sm">
                                    <span className="text-gray-500">Novo Total: </span>
                                    <span className="font-bold text-green-600 dark:text-green-400">{formatCurrency(editRate * tonnage)}</span>
                                </div>
                                <div className="flex gap-2">
                                    <button onClick={() => setIsEditing(false)} className="px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600 rounded">Cancelar</button>
                                    <button 
                                      onClick={handleSave} 
                                      disabled={!isAdmin && isOperationalPriceEditor && editRate > maxAllowedDriverRate + 0.001}
                                      className={`px-3 py-1.5 text-xs font-bold rounded shadow-sm transition ${
                                        !isAdmin && isOperationalPriceEditor && editRate > maxAllowedDriverRate + 0.001
                                          ? 'bg-gray-300 text-gray-500 cursor-not-allowed dark:bg-gray-700'
                                          : 'bg-primary text-white hover:bg-primary/90'
                                      }`}
                                    >
                                      Salvar Alterações
                                    </button>
                                </div>
                            </div>
                        </div>
                    </>
                ) : (
                    <>
                        {currentUser?.profile !== UserProfile.Cliente && (
                            <DetailItem label="Valor Frete Motorista">
                                {isEditingData ? (
                                    <div className="mt-1">
                                        <label className="block text-[10px] text-gray-500 dark:text-gray-400 font-medium mb-0.5">Valor por Tonelada (R$/ton)</label>
                                        <input 
                                            type="number"
                                            step="0.01"
                                            className="w-full p-1.5 text-sm font-semibold border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                            value={editedData.driverFreightRateSnapshot !== undefined ? editedData.driverFreightRateSnapshot : driverRateSnapshot}
                                            onChange={e => {
                                                const newRate = Number(e.target.value);
                                                const curTon = editedData.shipmentTonnage !== undefined ? editedData.shipmentTonnage : tonnage;
                                                setEditedData({
                                                    ...editedData,
                                                    driverFreightRateSnapshot: newRate,
                                                    driverFreightValue: newRate * curTon
                                                });
                                            }}
                                            placeholder="Ex: 95.00"
                                        />
                                        <p className="text-xs font-bold text-green-700 dark:text-green-400 mt-1">
                                            Total: {formatCurrency(((editedData.shipmentTonnage !== undefined ? editedData.shipmentTonnage : tonnage) || 0) * (editedData.driverFreightRateSnapshot !== undefined ? editedData.driverFreightRateSnapshot : driverRateSnapshot))}
                                        </p>
                                    </div>
                                ) : (
                                    <div>
                                        <p className="text-lg font-bold text-green-700 dark:text-green-400 leading-tight">
                                            {formatCurrency(driverFreight)}
                                        </p>
                                        <span className="text-xs text-gray-500 dark:text-gray-400 font-medium block mt-0.5">
                                            ({formatCurrency(driverRateSnapshot)} /ton)
                                        </span>
                                    </div>
                                )}
                            </DetailItem>
                        )}
                        <DetailItem label="Tonelagem">
                            {isEditingData ? (
                                <input 
                                    type="number"
                                    step="0.01"
                                    className="w-full mt-1 p-1.5 text-sm font-semibold border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                    value={editedData.shipmentTonnage || 0}
                                    onChange={e => setEditedData({...editedData, shipmentTonnage: Number(e.target.value)})}
                                />
                            ) : (
                                <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                                    {tonnage.toLocaleString('pt-BR')} ton
                                </p>
                            )}
                        </DetailItem>
                        
                        {currentUser?.profile !== UserProfile.Embarcador && currentUser?.profile !== UserProfile.Motorista && (
                            <DetailItem label="Frete Empresa (Foto)">
                                <p className="text-sm font-bold text-primary dark:text-blue-400">
                                    {formatCurrency(companyRateSnapshot)} /ton
                                </p>
                            </DetailItem>
                        )}

                        {currentUser?.profile !== UserProfile.Embarcador && currentUser?.profile !== UserProfile.Motorista && financialCostValue > 0 && (
                            <DetailItem label="Custo Financeiro">
                                <div>
                                    <p className="text-sm font-bold text-purple-700 dark:text-purple-400">
                                        - {formatCurrency(financialCostValue)}
                                    </p>
                                    <span className="text-xs text-gray-500 dark:text-gray-400 font-medium block mt-0.5">
                                        {financialCostRate.toFixed(2)}% ({financialCostDaysTerm} dias a {financialCostMonthlyRate}% a.m.)
                                    </span>
                                </div>
                            </DetailItem>
                        )}
                        
                        {staysList.length > 0 && currentUser?.profile !== UserProfile.Embarcador && currentUser?.profile !== UserProfile.Motorista && currentUser?.profile !== UserProfile.Cliente && (
                            <div className="md:col-span-2 mt-2 pt-2 border-t dark:border-gray-700">
                                <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Resumo de Estadias</h4>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                    <div className="bg-green-50 dark:bg-green-900/20 p-2 rounded border border-green-100 dark:border-green-800/50">
                                        <p className="text-[10px] font-bold text-green-600 dark:text-green-400 uppercase">Receita (Aprovado)</p>
                                        <p className="text-sm font-bold text-green-700 dark:text-green-300">
                                            {formatCurrency(approvedStaysValue)}
                                        </p>
                                    </div>
                                    <div className="bg-red-50 dark:bg-red-900/20 p-2 rounded border border-red-100 dark:border-red-800/50">
                                        <p className="text-[10px] font-bold text-red-600 dark:text-red-400 uppercase">Custo (Pago Motorista)</p>
                                        <p className="text-sm font-bold text-red-700 dark:text-red-300">
                                            {formatCurrency(driverPaidStaysValue)}
                                        </p>
                                    </div>
                                    <div className="bg-blue-50 dark:bg-blue-900/20 p-2 rounded border border-blue-100 dark:border-blue-800/50">
                                        <p className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase">Lucro Adicional</p>
                                        <p className={`text-sm font-bold ${
                                            netDemurrage >= 0 
                                            ? 'text-blue-700 dark:text-blue-300' 
                                            : 'text-red-600 dark:text-red-400'
                                        }`}>
                                            {formatCurrency(netDemurrage)}
                                        </p>
                                    </div>
                                </div>
                                <div className="mt-3 space-y-2">
                                    {staysList.map((stay, idx) => (
                                        <div key={stay.id || idx} className="flex flex-col gap-2 p-2 bg-gray-50 dark:bg-gray-800/50 rounded border border-gray-100 dark:border-gray-700">
                                            <div className="flex justify-between items-center text-xs">
                                                <div>
                                                    <span className="font-bold text-gray-700 dark:text-gray-300">Estadia #{idx + 1}</span>
                                                    <span className="text-gray-400 ml-2">{stay.date ? new Date(stay.date).toLocaleDateString('pt-BR') : 'N/A'}</span>
                                                </div>
                                                <div className="flex gap-4">
                                                    <div className="text-center">
                                                        <div className="text-[9px] uppercase text-gray-400 font-bold">Solicitado</div>
                                                        <div className="font-medium text-gray-600 dark:text-gray-300">{formatCurrency(stay.totalValue)}</div>
                                                    </div>
                                                    <div className="text-center">
                                                        <div className="text-[9px] uppercase text-green-500 font-bold">Aprovado</div>
                                                        <div className="font-medium text-green-600 dark:text-green-400">{formatCurrency(stay.approvedValue || 0)}</div>
                                                    </div>
                                                    <div className="text-center">
                                                        <div className="text-[9px] uppercase text-red-500 font-bold">Pago (Mot.)</div>
                                                        <div className="font-medium text-red-600 dark:text-red-400">{formatCurrency(stay.driverPaidValue || 0)}</div>
                                                    </div>
                                                </div>
                                            </div>
                                            {(stay.cteUrl || stay.paymentProofUrl) && (
                                                <div className="flex gap-4 pt-2 mt-1 border-t border-gray-200 dark:border-gray-700/50">
                                                    {stay.cteUrl && (
                                                        <button type="button" onClick={() => openDocumentInNewTab(getShipmentAttachmentUrl(stay.cteUrl!), 'CTe Complementar')} className="text-[10px] flex items-center font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 hover:underline text-left cursor-pointer">
                                                            <FileTextIcon className="w-3 h-3 mr-1" /> CTe Complementar
                                                        </button>
                                                    )}
                                                    {stay.paymentProofUrl && (
                                                        <button type="button" onClick={() => openDocumentInNewTab(getShipmentAttachmentUrl(stay.paymentProofUrl!), 'Comprovante de Pagamento')} className="text-[10px] flex items-center font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 hover:underline text-left cursor-pointer">
                                                            <FileTextIcon className="w-3 h-3 mr-1" /> Comprovante de Pagamento
                                                        </button>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                        
                        {currentUser?.profile !== UserProfile.Embarcador && (
                            <div className="md:col-span-2 mt-2 pt-2 border-t dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-3 rounded-lg flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                                <DetailItem label="Lucro Operacional do Embarque (Margem + Estadias)">
                                    <p className="text-lg font-bold text-primary dark:text-blue-400">
                                        {formatCurrency(
                                            (companyRateSnapshot * tonnage) 
                                            - driverFreight 
                                            - (commissionPerTon * tonnage)
                                            - financialCostValue
                                            + netDemurrage
                                        )}
                                    </p>
                                </DetailItem>
                                {financialCostValue > 0 && (
                                    <span className="text-xs px-2.5 py-1 rounded-md bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300 border border-purple-200 dark:border-purple-700 font-semibold">
                                        Deduzido Custo Financeiro: -{formatCurrency(financialCostValue)}
                                    </span>
                                )}
                            </div>
                        )}

                        <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4 bg-gray-50 dark:bg-gray-900/40 p-4 rounded-xl border dark:border-gray-700">
                            <DetailItem label="Forma de Pagamento">
                                {isEditingData ? (
                                    <select
                                        className="w-full mt-1 p-2 text-sm border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
                                        value={editedData.paymentMethod || DriverPaymentMethod.PixEFrete}
                                        onChange={e => setEditedData({...editedData, paymentMethod: e.target.value})}
                                        disabled={!canEditPaymentDetails}
                                    >
                                        {Object.values(DriverPaymentMethod).map(m => (
                                            <option key={m} value={m}>{m}</option>
                                        ))}
                                    </select>
                                ) : isEditingPaymentMethod ? (
                                    <div className="mt-1 space-y-2">
                                        <div className="flex items-center gap-2">
                                            <select
                                                className="flex-1 p-1.5 text-xs font-bold border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                                value={inlinePaymentMethod}
                                                onChange={e => setInlinePaymentMethod(e.target.value)}
                                                disabled={isSavingPaymentMethod}
                                                autoFocus
                                            >
                                                {Object.values(DriverPaymentMethod).map(m => (
                                                    <option key={m} value={m}>{m}</option>
                                                ))}
                                            </select>
                                            <button
                                                type="button"
                                                onClick={handleSaveInlinePaymentMethod}
                                                disabled={isSavingPaymentMethod}
                                                className="p-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-xs font-bold transition-colors cursor-pointer shadow-xs"
                                                title="Salvar Forma de Pagamento"
                                            >
                                                <Check size={14} />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setInlinePaymentMethod(shipment.paymentMethod || DriverPaymentMethod.PixEFrete);
                                                    setInlinePixKey(shipment.pixKey || '');
                                                    setInlineBankDetails(shipment.bankDetails || '');
                                                    setIsEditingPaymentMethod(false);
                                                }}
                                                disabled={isSavingPaymentMethod}
                                                className="p-1.5 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 text-gray-700 dark:text-gray-200 rounded-md text-xs transition-colors cursor-pointer"
                                                title="Cancelar"
                                            >
                                                <X size={14} />
                                            </button>
                                        </div>

                                        {inlinePaymentMethod === DriverPaymentMethod.PixEFrete && (
                                            <div>
                                                <input
                                                    type="text"
                                                    placeholder="Informe a Chave Pix..."
                                                    className="w-full p-1.5 text-xs border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white font-mono"
                                                    value={inlinePixKey}
                                                    onChange={e => setInlinePixKey(e.target.value)}
                                                    disabled={isSavingPaymentMethod}
                                                />
                                            </div>
                                        )}

                                        {inlinePaymentMethod === DriverPaymentMethod.DepositoConta && (
                                            <div>
                                                <textarea
                                                    rows={2}
                                                    placeholder="Banco, agência, conta e favorecido..."
                                                    className="w-full p-1.5 text-xs border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                                    value={inlineBankDetails}
                                                    onChange={e => setInlineBankDetails(e.target.value)}
                                                    disabled={isSavingPaymentMethod}
                                                />
                                            </div>
                                        )}

                                        {inlinePaymentMethod === DriverPaymentMethod.PagamentoLivre && (
                                            <div className="space-y-2">
                                                <div className="p-2 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-lg text-xs text-amber-800 dark:text-amber-300">
                                                    <span>ℹ️ Pagamento Livre: modalidade livre/direta negociada com o motorista.</span>
                                                </div>
                                                <input
                                                    type="text"
                                                    placeholder="Chave Pix (opcional)..."
                                                    className="w-full p-1.5 text-xs border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white font-mono"
                                                    value={inlinePixKey}
                                                    onChange={e => setInlinePixKey(e.target.value)}
                                                    disabled={isSavingPaymentMethod}
                                                />
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-2 mt-0.5">
                                        <p className="text-sm font-bold text-gray-800 dark:text-gray-200">
                                            {shipment.paymentMethod || 'PIX - E-FRETE'}
                                        </p>
                                        {canEditPaymentDetails && (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setInlinePaymentMethod(shipment.paymentMethod || DriverPaymentMethod.PixEFrete);
                                                    setInlinePixKey(shipment.pixKey || '');
                                                    setInlineBankDetails(shipment.bankDetails || '');
                                                    setIsEditingPaymentMethod(true);
                                                }}
                                                className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 px-2 py-0.5 rounded-md border border-blue-200 dark:border-blue-800 cursor-pointer transition-colors"
                                                title="Editar Forma de Pagamento"
                                            >
                                                <Edit2 size={11} />
                                                <span>Editar</span>
                                            </button>
                                        )}
                                    </div>
                                )}
                            </DetailItem>

                            <DetailItem label="Adiantamento (%)">
                                {isEditingData ? (
                                    <div className="mt-1 flex items-center gap-2">
                                        <div className="relative flex-1">
                                            <input 
                                                type="number"
                                                min="0"
                                                max="100"
                                                className="w-full p-2 pr-7 text-sm border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white font-bold disabled:opacity-60 disabled:cursor-not-allowed"
                                                value={editedData.advancePercentage !== undefined ? editedData.advancePercentage : 70}
                                                onChange={e => setEditedData({...editedData, advancePercentage: Number(e.target.value)})}
                                                disabled={!canEditPaymentDetails}
                                            />
                                            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400">%</span>
                                        </div>
                                        <div className="flex gap-1 shrink-0">
                                            {[70, 80, 90, 100].map(pct => (
                                                <button
                                                    key={pct}
                                                    type="button"
                                                    onClick={() => setEditedData({...editedData, advancePercentage: pct})}
                                                    disabled={!canEditPaymentDetails}
                                                    className={`px-1.5 py-1 text-[10px] font-bold rounded border transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${
                                                        (editedData.advancePercentage !== undefined ? editedData.advancePercentage : 70) === pct
                                                            ? 'bg-emerald-600 text-white border-emerald-600'
                                                            : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-100'
                                                    }`}
                                                >
                                                    {pct}%
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                ) : isEditingAdvance ? (
                                    <div className="mt-1 flex items-center gap-2">
                                        <div className="relative w-24">
                                            <input 
                                                type="number"
                                                min="0"
                                                max="100"
                                                className="w-full p-1.5 pr-6 text-sm font-bold border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                                value={inlineAdvancePercentage}
                                                onChange={e => setInlineAdvancePercentage(Number(e.target.value))}
                                                autoFocus
                                                disabled={isSavingAdvance}
                                            />
                                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400">%</span>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={handleSaveInlineAdvance}
                                            disabled={isSavingAdvance}
                                            className="p-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-xs font-bold transition-colors cursor-pointer shadow-xs"
                                            title="Salvar porcentagem"
                                        >
                                            <Check size={14} />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setInlineAdvancePercentage(shipment.advancePercentage !== undefined ? shipment.advancePercentage : 70);
                                                setIsEditingAdvance(false);
                                            }}
                                            disabled={isSavingAdvance}
                                            className="p-1.5 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 text-gray-700 dark:text-gray-200 rounded-md text-xs transition-colors cursor-pointer"
                                            title="Cancelar"
                                        >
                                            <X size={14} />
                                        </button>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-2 mt-0.5">
                                        <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                                            {shipment.advancePercentage !== undefined ? shipment.advancePercentage : 70}%
                                        </p>
                                        {canEditPaymentDetails && (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setInlineAdvancePercentage(shipment.advancePercentage !== undefined ? shipment.advancePercentage : 70);
                                                    setIsEditingAdvance(true);
                                                }}
                                                className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 px-2 py-0.5 rounded-md border border-blue-200 dark:border-blue-800 cursor-pointer transition-colors"
                                                title="Editar Porcentagem de Adiantamento"
                                            >
                                                <Edit2 size={11} />
                                                <span>Editar</span>
                                            </button>
                                        )}
                                    </div>
                                )}
                            </DetailItem>

                            {(editedData.paymentMethod === DriverPaymentMethod.PixEFrete || shipment.paymentMethod === DriverPaymentMethod.PixEFrete || shipment.pixKey || inlinePaymentMethod === DriverPaymentMethod.PixEFrete) && (
                                <div className="md:col-span-2">
                                    <DetailItem label="Chave Pix">
                                        {isEditingData ? (
                                            <input 
                                                type="text"
                                                className="w-full mt-1 p-2 text-sm border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white font-mono disabled:opacity-60 disabled:cursor-not-allowed"
                                                value={editedData.pixKey || ''}
                                                onChange={e => setEditedData({...editedData, pixKey: e.target.value})}
                                                placeholder="Informe a Chave Pix..."
                                                disabled={!canEditPaymentDetails}
                                            />
                                        ) : (
                                            <div className="mt-1 p-2.5 bg-white dark:bg-gray-800 rounded-md border dark:border-gray-700">
                                                <p className="text-sm font-mono text-gray-800 dark:text-gray-200">
                                                    {shipment.pixKey || <span className="text-gray-400 italic">Não informada</span>}
                                                </p>
                                            </div>
                                        )}
                                    </DetailItem>
                                </div>
                            )}

                            <div className="md:col-span-2">
                                <DetailItem label="Dados Bancários">
                                    {isEditingData ? (
                                        <textarea 
                                            className="w-full mt-1 p-2 text-sm border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white min-h-[70px] disabled:opacity-60 disabled:cursor-not-allowed"
                                            value={editedData.bankDetails || ''}
                                            onChange={e => setEditedData({...editedData, bankDetails: e.target.value})}
                                            placeholder="Informe os dados bancários..."
                                            disabled={!canEditPaymentDetails}
                                        />
                                    ) : (
                                        <div className="mt-1 p-2.5 bg-white dark:bg-gray-800 rounded-md border dark:border-gray-700">
                                            <p className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
                                                {shipment.bankDetails || <span className="text-gray-400 italic">Não informados</span>}
                                            </p>
                                        </div>
                                    )}
                                </DetailItem>
                            </div>
                        </div>

                        <div className="md:col-span-2">
                            <DetailItem label="Modalidade ANTT & Tipo de Frete">
                                <div className="mt-1 p-3 bg-gray-50 dark:bg-gray-900/50 rounded-xl border dark:border-gray-700 flex flex-wrap items-center gap-2">
                                    <span className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
                                        shipment.driverFreightType === 'PF' || shipment.anttModality === AnttModality.TAC
                                            ? 'bg-orange-100 text-orange-800 dark:bg-orange-950/60 dark:text-orange-300 border border-orange-200 dark:border-orange-800'
                                            : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                                    }`}>
                                        {shipment.anttModality ? `ANTT: ${shipment.anttModality}` : (shipment.driverFreightType === 'PF' ? 'ANTT: TAC (Autônomo)' : 'ANTT: ETC (Empresa)')}
                                    </span>
                                    {shipment.etcTaxRegime && (
                                        <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                                            Regime: {shipment.etcTaxRegime}
                                        </span>
                                    )}
                                    <span className="px-2.5 py-1 rounded-lg text-xs font-medium bg-gray-200/80 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600">
                                        Tipo: {shipment.driverFreightType || (shipment.anttModality === AnttModality.TAC ? 'PF' : 'PJ')}
                                    </span>
                                    {shipment.driverReferences && (
                                        <div className="w-full mt-2 pt-2 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-600 dark:text-gray-400 whitespace-pre-wrap">
                                            <strong>Obs / Referências anteriores:</strong> {shipment.driverReferences}
                                        </div>
                                    )}
                                </div>
                            </DetailItem>
                        </div>
                        
                        <div className="md:col-span-2">
                            <DetailItem label="Contato do Proprietário">
                                {isEditingData ? (
                                    <input 
                                        type="text"
                                        className="w-full mt-1 p-1.5 text-sm border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                        value={editedData.ownerContact || ''}
                                        onChange={e => setEditedData({...editedData, ownerContact: autoFormatInput('phone', e.target.value)})}
                                        placeholder="Telefone do proprietário..."
                                    />
                                ) : (
                                    <div className="mt-1 p-3 bg-blue-50/50 dark:bg-blue-900/10 rounded-md border border-blue-100 dark:border-blue-800/30">
                                        {shipment.ownerContact ? (
                                            <a 
                                                href={`https://wa.me/${String(shipment.ownerContact).replace(/\D/g, '')}`} 
                                                target="_blank" 
                                                rel="noopener noreferrer"
                                                className="text-sm font-semibold text-primary dark:text-blue-400 hover:text-accent dark:hover:text-accent transition-colors flex items-center gap-2 group"
                                                title="Abrir no WhatsApp"
                                            >
                                                {shipment.ownerContact}
                                                <svg className="w-4 h-4 opacity-50 group-hover:opacity-100 transition-opacity" fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                                                </svg>
                                            </a>
                                        ) : (
                                            <p className="text-sm text-gray-400 italic font-normal">Não informado</p>
                                        )}
                                    </div>
                                )}
                            </DetailItem>
                        </div>
                        
                        <div className="md:col-span-2">
                            <DetailItem label="Titular da ANTT (CPF/CNPJ)">
                                {isEditingData ? (
                                    <input 
                                        type="text"
                                        className="w-full mt-1 p-1.5 text-sm font-mono border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                        value={editedData.anttOwnerIdentifier || ''}
                                        onChange={e => setEditedData({...editedData, anttOwnerIdentifier: autoFormatInput('cpfCnpj', e.target.value)})}
                                        placeholder="CPF ou CNPJ do titular..."
                                    />
                                ) : (
                                    <div className="mt-1 p-3 bg-gray-50 dark:bg-gray-900/50 rounded-md border dark:border-gray-700">
                                        <p className="text-sm font-mono text-gray-800 dark:text-gray-200">
                                            {shipment.anttOwnerIdentifier || <span className="text-gray-400 italic font-sans">Não preenchido no cadastro</span>}
                                        </p>
                                    </div>
                                )}
                            </DetailItem>
                        </div>

                        {shipment.documents && typeof shipment.documents === 'object' && Object.keys(shipment.documents).length > 0 && (() => {
                            const validEntries = Object.entries(shipment.documents).filter(([category, urls]) => {
                                if (!category || isDocumentMetadataKey(category)) return false;
                                const urlList = Array.isArray(urls) ? urls : (urls ? [urls] : []);
                                return urlList.some(url => isActualDocumentUrl(url));
                            });

                            if (validEntries.length === 0) return null;

                            return (
                                <div className="md:col-span-2 mt-4">
                                    <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-2">Arquivos do Embarque</h3>
                                    <div className="space-y-4">
                                        {validEntries.map(([category, urls]) => {
                                            const urlList = (Array.isArray(urls) ? urls : (urls ? [urls] : []))
                                                .filter(url => isActualDocumentUrl(url));
                                            if (urlList.length === 0) return null;

                                            return (
                                                <div key={category}>
                                                    <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase mb-1">{category}</p>
                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                                        {urlList.map((rawUrlItem, idx) => {
                                                            const docUrl = normalizeDocumentUrl(rawUrlItem) || (typeof rawUrlItem === 'string' ? rawUrlItem : (rawUrlItem && typeof rawUrlItem === 'object' ? ((rawUrlItem as any).url || (rawUrlItem as any).fileUrl || (rawUrlItem as any).path || '') : ''));
                                                            if (!docUrl || typeof docUrl !== 'string') return null;

                                                            let customName = '';
                                                            if (rawUrlItem && typeof rawUrlItem === 'object' && ((rawUrlItem as any).name || (rawUrlItem as any).fileName)) {
                                                                customName = String((rawUrlItem as any).name || (rawUrlItem as any).fileName).trim();
                                                            }

                                                            const urlParts = docUrl.split('/');
                                                            const rawFileName = decodeURIComponent(urlParts[urlParts.length - 1] || '');
                                                            const cleanNameFromUrl = rawFileName.includes('_') ? rawFileName.split('_').slice(2).join('_') : rawFileName;
                                                            const fileName = customName || cleanNameFromUrl || `Anexo ${idx + 1}`;
                                                            
                                                            return (
                                                                <div key={idx} className="flex items-center gap-1 group">
                                                                    <button 
                                                                        type="button"
                                                                        onClick={() => openDocumentInNewTab(docUrl, fileName)}
                                                                        className="flex-1 flex items-center p-2 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800/50 rounded-md text-xs font-medium text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition-colors text-left truncate cursor-pointer"
                                                                    >
                                                                        <FileTextIcon size={14} className="mr-2 flex-shrink-0" />
                                                                        <span className="truncate">{fileName}</span>
                                                                    </button>
                                                                    {onDeleteAttachment && !isDemo && (isDeveloperUser(currentUser) || currentUser?.profile === UserProfile.Desenvolvedor || currentUser?.profile === UserProfile.Admin || currentUser?.profile === UserProfile.Diretor || currentUser?.profile === UserProfile.Supervisor) && (
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => {
                                                                                if (confirm(`Tem certeza que deseja excluir o anexo "${fileName}"?`)) {
                                                                                    onDeleteAttachment(shipment.id, typeof rawUrlItem === 'string' ? rawUrlItem : docUrl);
                                                                                }
                                                                            }}
                                                                            className="p-2 text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/30 rounded-md transition-colors cursor-pointer"
                                                                            title="Excluir Anexo"
                                                                        >
                                                                            <Trash2 size={16} />
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })()}

                        {onAddAttachments && !isDemo && (
                            <div className="md:col-span-2 mt-6 pt-6 border-t dark:border-gray-700">
                                <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">Anexar Novos Documentos</h3>
                                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                                    <div className="flex items-center">
                                        <label className="cursor-pointer bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 py-2 px-4 rounded-lg inline-flex items-center transition-colors border border-gray-200 dark:border-gray-600 shadow-sm">
                                            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"></path></svg>
                                            <span className="text-sm font-medium">Selecionar Arquivos</span>
                                            <input type="file" multiple className="hidden" onChange={(e) => {
                                                if (e.target.files) {
                                                    setFilesToAttach(Array.from(e.target.files));
                                                }
                                            }} />
                                        </label>
                                        <span className="ml-3 text-xs text-gray-500 dark:text-gray-400 font-medium">
                                            {filesToAttach.length > 0 ? `${filesToAttach.length} selecionado(s)` : 'Nenhum arquivo'}
                                        </span>
                                    </div>

                                    {filesToAttach.length > 0 && (
                                        <button
                                            type="button"
                                            onClick={handleConfirmAttachments}
                                            disabled={isUploading}
                                            className={`py-2 px-4 rounded-lg text-sm font-bold transition-all shadow-sm flex items-center ${
                                                isUploading 
                                                ? 'bg-gray-300 text-gray-500 cursor-not-allowed' 
                                                : 'bg-green-600 text-white hover:bg-green-700'
                                            }`}
                                        >
                                            {isUploading ? (
                                                <>
                                                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                                    Enviando...
                                                </>
                                            ) : (
                                                'Confirmar e Enviar'
                                            )}
                                        </button>
                                    )}
                                </div>
                                {filesToAttach.length > 0 && (
                                    <div className="mt-2 space-y-1">
                                        {filesToAttach.map((f, i) => (
                                            <div key={i} className="text-[10px] text-gray-500 dark:text-gray-400 flex items-center gap-1">
                                                <div className="w-1 h-1 bg-gray-400 rounded-full" />
                                                {f.name}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Timestamps */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t dark:border-gray-700 pt-4 opacity-75">
                <DetailItem label="Criado em" value={formatDate(shipment.createdAt)} />
                <DetailItem label="Data Programada" value={shipment.scheduledDate ? formatDate(`${shipment.scheduledDate}T${shipment.scheduledTime || '00:00'}`) : null} />
            </div>
            
        </div>
        
        <div className="mt-4 flex justify-end border-t dark:border-gray-700 pt-4 shrink-0">
          <button type="button" onClick={onClose} className="py-2 px-6 bg-gray-200 text-gray-800 font-medium rounded-lg hover:bg-gray-300 dark:bg-gray-700 dark:text-white dark:hover:bg-gray-600 transition-colors">
            Fechar
          </button>
        </div>
        </div>
      </div>

      <DocumentPreviewModal
        isOpen={!!previewDocument}
        onClose={() => setPreviewDocument(null)}
        fileUrl={previewDocument?.url || null}
        fileName={previewDocument?.name}
        category={previewDocument?.category}
      />

      {onSwapCargo && (
        <SwapCargoModal
          isOpen={isSwapModalOpen}
          onClose={() => setIsSwapModalOpen(false)}
          onConfirm={(shipmentId, newCargoId) => {
            onSwapCargo(shipmentId, newCargoId);
            setIsSwapModalOpen(false);
          }}
          shipment={shipment}
          cargos={cargos || []}
          clients={clients}
          products={products}
        />
      )}
          {/* Modal de Observação de Pendência do Status */}
      <StatusPendingModal
        isOpen={isPendingModalOpen}
        onClose={() => setIsPendingModalOpen(false)}
        shipment={shipment}
        onSave={async (shipmentId, pendingObs) => {
          if (onUpdateShipmentData) {
            await onUpdateShipmentData(shipmentId, { statusPendingObservation: pendingObs });
          }
        }}
      />

      <ComposeEmailModal
        isOpen={isOrderEmailModalOpen}
        onClose={() => setIsOrderEmailModalOpen(false)}
        accounts={emailAccounts}
        initialMode="new"
        initialSubject={orderEmailSubject}
        initialBody={orderEmailBody}
        initialAttachments={orderEmailAttachments}
      />
</>
  );
};

export default ShipmentDetailsModal;
