import React from 'react';
import { Shipment, ShipmentStatus, Cargo, RISK_QUERY_COST_MAP, HistoryLog, User, Client, UserProfile } from '../types';
import { extractDetailedDocData, isStrictNotaFiscalCategory } from '../utils/fiscalDocParser';
import { upsertShipment } from '../lib/db';
import { useToast } from '../hooks/useToast';
import { isDemoUser } from '../auth';
import { StayRecord, getAllToolStays, extractCteNumberFromStay } from '../utils/toolStorage';
import { isStayForShipment } from '../utils';
import { calculateTacTaxDeductions } from '../utils/freightCalculation';
import { 
  Calculator, 
  ShieldCheck, 
  TrendingUp, 
  Percent, 
  Truck, 
  Receipt, 
  Info,
  Layers,
  RefreshCw,
  Sparkles,
  Building2,
  Save,
  CheckCircle2,
  Clock,
  FileText,
  ExternalLink,
  Pencil,
  Check,
  X,
  RotateCcw,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  UserCheck,
  Plus,
  Trash2,
  HelpCircle,
  FileWarning,
  Landmark
} from 'lucide-react';

interface CteCostAutomationPanelProps {
  shipment: Shipment;
  cargo?: Cargo;
  tollValue?: number | string;
  loadedTonnage?: number | string;
  riskQueryType?: string;
  riskReleaseCode?: string;
  stays?: StayRecord[];
  users?: User[];
  clients?: Client[];
  currentUser?: User | null;
  onUpdateShipmentData?: (shipmentId: string, data: Partial<Shipment>, options?: { silent?: boolean }) => Promise<void> | void;
}

export const CteCostAutomationPanel: React.FC<CteCostAutomationPanelProps> = ({
  shipment,
  cargo,
  tollValue,
  loadedTonnage,
  riskQueryType,
  riskReleaseCode,
  stays,
  users,
  clients,
  currentUser,
  onUpdateShipmentData,
}) => {
  const { showToast } = useToast();
  const formatBrl = (val: number | undefined | null) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);

  const isDemo = isDemoUser(currentUser);

  const isRestrictedProfile = 
    currentUser?.profile === UserProfile.Embarcador || 
    currentUser?.profile === UserProfile.Agenciador ||
    currentUser?.profile === UserProfile.Cliente ||
    currentUser?.profile === UserProfile.Motorista ||
    (currentUser?.profile as string) === 'Embarcador' ||
    (currentUser?.profile as string) === 'Agenciador' ||
    (currentUser?.profile as string) === 'Cliente' ||
    (currentUser?.profile as string) === 'Motorista';

  const isAgenciador = currentUser?.profile === UserProfile.Agenciador || (currentUser?.profile as string) === 'Agenciador';
  const isEmbarcadorOrAgenciador = isRestrictedProfile;

  // Determinação inicial do enquadramento tributário
  const defaultInitialRegime = shipment.etcTaxRegime || 
    (shipment.documents as any)?.etc_tax_regime || 
    (shipment.driverFreightType === 'PF' || shipment.anttModality === 'TAC' ? 'PF' : 'Lucro Real / Presumido');

  const [showDeductions, setShowDeductions] = React.useState(false);
  const [selectedRegime, setSelectedRegime] = React.useState<string>(defaultInitialRegime);
  const [savedRegime, setSavedRegime] = React.useState<string>(defaultInitialRegime);
  const [isSavingRegime, setIsSavingRegime] = React.useState(false);
  const [justSaved, setJustSaved] = React.useState(false);

  // --- MÓDULO 1: Custo Adicional / Registro de Prejuízo ---
  const [additionalCost, setAdditionalCost] = React.useState<{
    value: number;
    category: string;
    description: string;
  } | null>(() => {
    if (shipment.additionalCost && shipment.additionalCost.value > 0) {
      return {
        value: shipment.additionalCost.value,
        category: shipment.additionalCost.category || 'Outros Custos Imprevistos',
        description: shipment.additionalCost.description || ''
      };
    }
    if (shipment.additionalCostValue && shipment.additionalCostValue > 0) {
      return {
        value: shipment.additionalCostValue,
        category: shipment.additionalCostCategory || (shipment.documents as any)?.additional_cost_category || 'Outros Custos Imprevistos',
        description: shipment.additionalCostDescription || (shipment.documents as any)?.additional_cost_description || ''
      };
    }
    if ((shipment.documents as any)?.additional_cost?.value > 0) {
      const ac = (shipment.documents as any).additional_cost;
      return {
        value: Number(ac.value),
        category: ac.category || 'Outros Custos Imprevistos',
        description: ac.description || ''
      };
    }
    return null;
  });

  const [isAdditionalCostModalOpen, setIsAdditionalCostModalOpen] = React.useState(false);
  const [additionalCostModalMode, setAdditionalCostModalMode] = React.useState<'create' | 'edit' | 'view'>('create');
  const [costFormValue, setCostFormValue] = React.useState('');
  const [costFormCategory, setCostFormCategory] = React.useState('Avaria de Carga');
  const [costFormDescription, setCostFormDescription] = React.useState('');
  const [isSavingAdditionalCost, setIsSavingAdditionalCost] = React.useState(false);

  React.useEffect(() => {
    if (shipment.additionalCost && shipment.additionalCost.value > 0) {
      setAdditionalCost({
        value: shipment.additionalCost.value,
        category: shipment.additionalCost.category || 'Outros Custos Imprevistos',
        description: shipment.additionalCost.description || ''
      });
    } else if (shipment.additionalCostValue && shipment.additionalCostValue > 0) {
      setAdditionalCost({
        value: shipment.additionalCostValue,
        category: shipment.additionalCostCategory || (shipment.documents as any)?.additional_cost_category || 'Outros Custos Imprevistos',
        description: shipment.additionalCostDescription || (shipment.documents as any)?.additional_cost_description || ''
      });
    } else if ((shipment.documents as any)?.additional_cost?.value > 0) {
      const ac = (shipment.documents as any).additional_cost;
      setAdditionalCost({
        value: Number(ac.value),
        category: ac.category || 'Outros Custos Imprevistos',
        description: ac.description || ''
      });
    } else {
      setAdditionalCost(null);
    }
  }, [shipment.additionalCost, shipment.additionalCostValue, shipment.additionalCostCategory, shipment.additionalCostDescription, shipment.documents]);

  // --- MÓDULO 2: Comissão de Agência (30% sobre Lucro Líquido Real) ---
  const [agencyCommEnabled, setAgencyCommEnabled] = React.useState<boolean>(() => {
    const reqUser = users?.find(u => u.id === shipment.embarcadorId || u.id === shipment.createdById);
    const isAgenciador = reqUser?.profile === UserProfile.Agenciador;
    
    if (isAgenciador) {
      if (shipment.agencyCommissionEnabled !== undefined) return shipment.agencyCommissionEnabled;
      if ((shipment.documents as any)?.agency_commission_enabled !== undefined) return Boolean((shipment.documents as any).agency_commission_enabled);
      return true;
    }

    if (shipment.agencyCommissionEnabled !== undefined) return shipment.agencyCommissionEnabled;
    if ((shipment.documents as any)?.agency_commission_enabled !== undefined) return Boolean((shipment.documents as any).agency_commission_enabled);
    return false;
  });
  const [isSavingAgencyComm, setIsSavingAgencyComm] = React.useState(false);

  React.useEffect(() => {
    const reqUser = users?.find(u => u.id === shipment.embarcadorId || u.id === shipment.createdById);
    const isAgenciador = reqUser?.profile === UserProfile.Agenciador;

    if (isAgenciador) {
      if (shipment.agencyCommissionEnabled !== undefined) {
        setAgencyCommEnabled(shipment.agencyCommissionEnabled);
      } else if ((shipment.documents as any)?.agency_commission_enabled !== undefined) {
        setAgencyCommEnabled(Boolean((shipment.documents as any).agency_commission_enabled));
      } else {
        setAgencyCommEnabled(true);
      }
    } else {
      if (shipment.agencyCommissionEnabled !== undefined) {
        setAgencyCommEnabled(shipment.agencyCommissionEnabled);
      } else if ((shipment.documents as any)?.agency_commission_enabled !== undefined) {
        setAgencyCommEnabled(Boolean((shipment.documents as any).agency_commission_enabled));
      } else {
        setAgencyCommEnabled(false);
      }
    }
  }, [shipment.agencyCommissionEnabled, shipment.documents, shipment.embarcadorId, shipment.createdById, users]);

  // --- MÓDULO 3: Comissão do Embarcador (Valor Variável por Tonelada) ---
  const [shipperCommEnabled, setShipperCommEnabled] = React.useState<boolean>(() => {
    if (shipment.shipperCommissionEnabled !== undefined) return shipment.shipperCommissionEnabled;
    if ((shipment.documents as any)?.shipper_commission_enabled !== undefined) return Boolean((shipment.documents as any).shipper_commission_enabled);
    const reqUser = users?.find(u => u.id === shipment.embarcadorId || u.id === shipment.createdById);
    if (reqUser?.shipperCommissionRatePerTon && reqUser.shipperCommissionRatePerTon > 0) return true;
    return false;
  });
  const [shipperCommRate, setShipperCommRate] = React.useState<number>(() => {
    if (shipment.shipperCommissionRatePerTon !== undefined) return shipment.shipperCommissionRatePerTon;
    if ((shipment.documents as any)?.shipper_commission_rate_per_ton !== undefined) return Number((shipment.documents as any).shipper_commission_rate_per_ton);
    const reqUser = users?.find(u => u.id === shipment.embarcadorId || u.id === shipment.createdById);
    if (reqUser?.shipperCommissionRatePerTon && reqUser.shipperCommissionRatePerTon > 0) return reqUser.shipperCommissionRatePerTon;
    return 1.00;
  });
  const [isEditingShipperRate, setIsEditingShipperRate] = React.useState(false);
  const [shipperRateInput, setShipperRateInput] = React.useState(String(shipperCommRate));
  const [isSavingShipperComm, setIsSavingShipperComm] = React.useState(false);

  React.useEffect(() => {
    if (shipment.shipperCommissionEnabled !== undefined) {
      setShipperCommEnabled(shipment.shipperCommissionEnabled);
    } else if ((shipment.documents as any)?.shipper_commission_enabled !== undefined) {
      setShipperCommEnabled(Boolean((shipment.documents as any).shipper_commission_enabled));
    } else {
      const reqUser = users?.find(u => u.id === shipment.embarcadorId || u.id === shipment.createdById);
      if (reqUser?.shipperCommissionRatePerTon && reqUser.shipperCommissionRatePerTon > 0) {
        setShipperCommEnabled(true);
      }
    }
    if (shipment.shipperCommissionRatePerTon !== undefined) {
      setShipperCommRate(shipment.shipperCommissionRatePerTon);
      setShipperRateInput(String(shipment.shipperCommissionRatePerTon));
    } else if ((shipment.documents as any)?.shipper_commission_rate_per_ton !== undefined) {
      const rate = Number((shipment.documents as any).shipper_commission_rate_per_ton);
      setShipperCommRate(rate);
      setShipperRateInput(String(rate));
    } else {
      const reqUser = users?.find(u => u.id === shipment.embarcadorId || u.id === shipment.createdById);
      if (reqUser?.shipperCommissionRatePerTon && reqUser.shipperCommissionRatePerTon > 0) {
        setShipperCommRate(reqUser.shipperCommissionRatePerTon);
        setShipperRateInput(String(reqUser.shipperCommissionRatePerTon));
      }
    }
  }, [shipment.shipperCommissionEnabled, shipment.shipperCommissionRatePerTon, shipment.documents, shipment.embarcadorId, shipment.createdById, users]);

  React.useEffect(() => {
    const reg = shipment.etcTaxRegime || 
      (shipment.documents as any)?.etc_tax_regime || 
      (shipment.driverFreightType === 'PF' || shipment.anttModality === 'TAC' ? 'PF' : 'Lucro Real / Presumido');
    setSelectedRegime(reg);
    setSavedRegime(reg);
  }, [shipment.etcTaxRegime, shipment.documents, shipment.driverFreightType, shipment.anttModality]);

  const handleSaveRegime = async () => {
    if (isDemo) {
      showToast('Usuário em modo demonstração possui acesso apenas de visualização.', 'warning');
      return;
    }
    setIsSavingRegime(true);
    try {
      const isPf = selectedRegime === 'PF' || selectedRegime === 'TAC';
      const modality = isPf ? 'TAC' : 'ETC';
      const freightType = isPf ? 'PF' : 'PJ';
      const etcRegime = isPf ? undefined : selectedRegime;

      const oldRegimeLabel = savedRegime || shipment.etcTaxRegime || (shipment.driverFreightType === 'PF' ? 'Pessoa Física / TAC' : 'Lucro Real / Presumido');
      const newRegimeLabel = selectedRegime;

      const historyEntry: HistoryLog = {
        id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
        userId: currentUser?.id || 'system',
        timestamp: new Date().toISOString(),
        description: `Enquadramento fiscal alterado de "${oldRegimeLabel}" para "${newRegimeLabel}". Imposto Federal e custos operacionais recalculados.`
      };

      const updatedHistory = [...(shipment.history || []), historyEntry];

      const updatedShipment: Shipment = {
        ...shipment,
        etcTaxRegime: etcRegime,
        driverFreightType: freightType,
        anttModality: modality as any,
        history: updatedHistory,
        documents: {
          ...(shipment.documents || {}),
          etc_tax_regime: etcRegime,
          antt_modality: modality,
        }
      };

      if (onUpdateShipmentData) {
        await onUpdateShipmentData(shipment.id, {
          etcTaxRegime: etcRegime,
          driverFreightType: freightType,
          anttModality: modality as any,
          history: updatedHistory,
          documents: {
            ...(shipment.documents || {}),
            etc_tax_regime: etcRegime,
            antt_modality: modality,
          }
        });
      } else {
        await upsertShipment(updatedShipment);
      }

      setSavedRegime(selectedRegime);
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 3000);
      showToast(`Enquadramento tributário salvo como "${selectedRegime}" e registrado no histórico!`, 'success');
    } catch (err) {
      console.error('Erro ao salvar regime tributário:', err);
      showToast('Erro ao persistir enquadramento tributário.', 'error');
    } finally {
      setIsSavingRegime(false);
    }
  };

  // Status Ag. Fiscal: Libera edição manual do campo Imposto Federal
  const isAguardandoFiscal = shipment.status === ShipmentStatus.AguardandoFiscal || 
    (shipment.status as string) === 'Ag. Fiscal' || 
    (shipment.status as string) === 'Aguardando Fiscal';

  const parseCurrencyInput = (val: string | number | undefined | null): number => {
    if (val === undefined || val === null || val === '') return 0;
    if (typeof val === 'number') return isNaN(val) ? 0 : val;
    const cleanStr = String(val).replace(/[R$\s]/g, '').trim();
    if (!cleanStr) return 0;
    if (cleanStr.includes('.') && cleanStr.includes(',')) {
      if (cleanStr.lastIndexOf(',') > cleanStr.lastIndexOf('.')) {
        return parseFloat(cleanStr.replace(/\./g, '').replace(',', '.'));
      } else {
        return parseFloat(cleanStr.replace(/,/g, ''));
      }
    }
    if (cleanStr.includes(',')) {
      return parseFloat(cleanStr.replace(',', '.'));
    }
    return parseFloat(cleanStr);
  };

  // Imposto Federal editável
  const isShipmentFederalTaxManual = Boolean(
    shipment.isFederalTaxManual === true ||
    shipment.realProfitData?.isFederalTaxManual === true ||
    (shipment.documents as any)?.is_federal_tax_manual === true
  );

  const initialCustomFederalTax = isShipmentFederalTaxManual
    ? (shipment.realProfitData?.federalTax !== undefined 
        ? shipment.realProfitData.federalTax 
        : (shipment.federalTax !== undefined 
            ? shipment.federalTax 
            : ((shipment.documents as any)?.federal_tax !== undefined 
                ? Number((shipment.documents as any).federal_tax) 
                : ((shipment.documents as any)?.imposto_federal !== undefined 
                    ? Number((shipment.documents as any).imposto_federal) 
                    : undefined))))
    : undefined;

  const [customFederalTax, setCustomFederalTax] = React.useState<number | undefined>(initialCustomFederalTax);
  const [isManualFederalTax, setIsManualFederalTax] = React.useState<boolean>(isShipmentFederalTaxManual);
  const [isEditingFederalTax, setIsEditingFederalTax] = React.useState(false);
  const [federalTaxInput, setFederalTaxInput] = React.useState<string>('');
  const [isSavingFederalTax, setIsSavingFederalTax] = React.useState(false);
  const [justSavedFederalTax, setJustSavedFederalTax] = React.useState(false);

  React.useEffect(() => {
    const isManual = Boolean(
      shipment.isFederalTaxManual === true ||
      shipment.realProfitData?.isFederalTaxManual === true ||
      (shipment.documents as any)?.is_federal_tax_manual === true
    );
    setIsManualFederalTax(isManual);
    if (isManual) {
      const currentVal = shipment.realProfitData?.federalTax !== undefined 
        ? shipment.realProfitData.federalTax 
        : (shipment.federalTax !== undefined 
            ? shipment.federalTax 
            : ((shipment.documents as any)?.federal_tax !== undefined 
                ? Number((shipment.documents as any).federal_tax) 
                : ((shipment.documents as any)?.imposto_federal !== undefined 
                    ? Number((shipment.documents as any).imposto_federal) 
                    : undefined)));
      setCustomFederalTax(currentVal);
    } else {
      setCustomFederalTax(undefined);
    }
  }, [shipment.isFederalTaxManual, shipment.realProfitData?.isFederalTaxManual, shipment.realProfitData?.federalTax, shipment.federalTax, shipment.documents]);

  const handleStartEditFederalTax = () => {
    if (isDemo) {
      showToast('Usuário em modo demonstração possui acesso apenas de visualização.', 'warning');
      return;
    }
    const currentNum = (isManualFederalTax && customFederalTax !== undefined) 
      ? customFederalTax 
      : (impostoFederalLiquido > 0 ? impostoFederalLiquido : 0);
    setFederalTaxInput(currentNum > 0 ? String(currentNum) : '');
    setIsEditingFederalTax(true);
  };

  const handleSaveFederalTax = async () => {
    if (isDemo) {
      showToast('Usuário em modo demonstração possui acesso apenas de visualização.', 'warning');
      return;
    }
    setIsSavingFederalTax(true);
    try {
      const parsedVal = parseCurrencyInput(federalTaxInput);
      const validNum = isNaN(parsedVal) || parsedVal < 0 ? 0 : Number(parsedVal.toFixed(2));
      
      // Atualiza estado local imediatamente para refletir no painel
      setCustomFederalTax(validNum);
      setIsManualFederalTax(true);
      setIsEditingFederalTax(false);
      setJustSavedFederalTax(true);
      setTimeout(() => setJustSavedFederalTax(false), 3000);

      const oldTax = impostoFederalLiquido;
      const historyEntry: HistoryLog = {
        id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
        userId: currentUser?.id || 'system',
        timestamp: new Date().toISOString(),
        description: `Imposto Federal editado manualmente: de "${formatBrl(oldTax)}" para "${formatBrl(validNum)}".`
      };

      const updatedHistory = [...(shipment.history || []), historyEntry];
      const updatedRealProfitData = {
        ...(shipment.realProfitData || {}),
        federalTax: validNum,
        isFederalTaxManual: true,
      };

      const updatedDocs = {
        ...(shipment.documents || {}),
        imposto_federal: validNum,
        federal_tax: validNum,
        is_federal_tax_manual: true,
        real_profit_data: updatedRealProfitData
      };

      const updatedShipment: Shipment = {
        ...shipment,
        isFederalTaxManual: true,
        federalTax: validNum,
        realProfitData: updatedRealProfitData as any,
        history: updatedHistory,
        documents: updatedDocs
      };

      await upsertShipment(updatedShipment);
      if (onUpdateShipmentData) {
        await onUpdateShipmentData(shipment.id, {
          isFederalTaxManual: true,
          federalTax: validNum,
          realProfitData: updatedRealProfitData as any,
          history: updatedHistory,
          documents: updatedDocs
        });
      }

      showToast(`Imposto Federal atualizado para ${formatBrl(validNum)} com sucesso!`, 'success');
    } catch (err) {
      console.error('Erro ao salvar Imposto Federal:', err);
      showToast('Erro ao salvar Imposto Federal.', 'error');
    } finally {
      setIsSavingFederalTax(false);
    }
  };

  const handleRestoreDefaultFederalTax = async () => {
    if (isDemo) {
      showToast('Usuário em modo demonstração possui acesso apenas de visualização.', 'warning');
      return;
    }
    setIsSavingFederalTax(true);
    try {
      setCustomFederalTax(undefined);
      setIsManualFederalTax(false);
      setIsEditingFederalTax(false);

      const historyEntry: HistoryLog = {
        id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
        userId: currentUser?.id || 'system',
        timestamp: new Date().toISOString(),
        description: `Imposto Federal restaurado para o cálculo automático do sistema.`
      };

      const updatedHistory = [...(shipment.history || []), historyEntry];
      const updatedRealProfitData = {
        ...(shipment.realProfitData || {}),
      };
      delete (updatedRealProfitData as any).federalTax;
      delete (updatedRealProfitData as any).isFederalTaxManual;

      const updatedDocs = {
        ...(shipment.documents || {}),
        real_profit_data: Object.keys(updatedRealProfitData).length > 0 ? updatedRealProfitData : undefined,
      };
      delete (updatedDocs as any).imposto_federal;
      delete (updatedDocs as any).federal_tax;
      delete (updatedDocs as any).is_federal_tax_manual;

      const updatedShipment: Shipment = {
        ...shipment,
        isFederalTaxManual: false,
        federalTax: undefined,
        realProfitData: Object.keys(updatedRealProfitData).length > 0 ? (updatedRealProfitData as any) : undefined,
        documents: updatedDocs,
        history: updatedHistory,
      };

      await upsertShipment(updatedShipment);
      if (onUpdateShipmentData) {
        await onUpdateShipmentData(shipment.id, {
          isFederalTaxManual: false,
          federalTax: undefined,
          realProfitData: Object.keys(updatedRealProfitData).length > 0 ? (updatedRealProfitData as any) : undefined,
          documents: updatedDocs,
          history: updatedHistory,
        });
      }

      showToast('Imposto Federal restaurado para o cálculo automático do sistema!', 'success');
    } catch (err) {
      console.error('Erro ao restaurar Imposto Federal:', err);
      showToast('Erro ao restaurar cálculo automático.', 'error');
    } finally {
      setIsSavingFederalTax(false);
    }
  };

  // Crédito Gerado editável
  const isShipmentGeneratedCreditManual = Boolean(
    shipment.isGeneratedCreditManual === true ||
    shipment.realProfitData?.isGeneratedCreditManual === true ||
    (shipment.documents as any)?.is_generated_credit_manual === true
  );

  const initialCustomGeneratedCredit = isShipmentGeneratedCreditManual
    ? (shipment.realProfitData?.generatedCredit !== undefined 
        ? shipment.realProfitData.generatedCredit 
        : (shipment.generatedCredit !== undefined 
            ? shipment.generatedCredit 
            : ((shipment.documents as any)?.generated_credit !== undefined 
                ? Number((shipment.documents as any).generated_credit) 
                : ((shipment.documents as any)?.credito_gerado !== undefined 
                    ? Number((shipment.documents as any).credito_gerado) 
                    : undefined))))
    : undefined;

  const [customGeneratedCredit, setCustomGeneratedCredit] = React.useState<number | undefined>(initialCustomGeneratedCredit);
  const [isManualGeneratedCredit, setIsManualGeneratedCredit] = React.useState<boolean>(isShipmentGeneratedCreditManual);
  const [isEditingGeneratedCredit, setIsEditingGeneratedCredit] = React.useState(false);
  const [generatedCreditInput, setGeneratedCreditInput] = React.useState<string>('');
  const [isSavingGeneratedCredit, setIsSavingGeneratedCredit] = React.useState(false);
  const [justSavedGeneratedCredit, setJustSavedGeneratedCredit] = React.useState(false);

  React.useEffect(() => {
    const isManual = Boolean(
      shipment.isGeneratedCreditManual === true ||
      shipment.realProfitData?.isGeneratedCreditManual === true ||
      (shipment.documents as any)?.is_generated_credit_manual === true
    );
    setIsManualGeneratedCredit(isManual);
    if (isManual) {
      const currentVal = shipment.realProfitData?.generatedCredit !== undefined 
        ? shipment.realProfitData.generatedCredit 
        : (shipment.generatedCredit !== undefined 
            ? shipment.generatedCredit 
            : ((shipment.documents as any)?.generated_credit !== undefined 
                ? Number((shipment.documents as any).generated_credit) 
                : ((shipment.documents as any)?.credito_gerado !== undefined 
                    ? Number((shipment.documents as any).credito_gerado) 
                    : undefined)));
      setCustomGeneratedCredit(currentVal);
    } else {
      setCustomGeneratedCredit(undefined);
    }
  }, [shipment.isGeneratedCreditManual, shipment.realProfitData?.isGeneratedCreditManual, shipment.realProfitData?.generatedCredit, shipment.generatedCredit, shipment.documents]);

  const handleStartEditGeneratedCredit = () => {
    if (isDemo) {
      showToast('Usuário em modo demonstração possui acesso apenas de visualização.', 'warning');
      return;
    }
    const currentNum = (isManualGeneratedCredit && customGeneratedCredit !== undefined) 
      ? customGeneratedCredit 
      : (pisCofinsCredit > 0 ? pisCofinsCredit : 0);
    setGeneratedCreditInput(currentNum > 0 ? String(currentNum) : '');
    setIsEditingGeneratedCredit(true);
  };

  const handleSaveGeneratedCredit = async () => {
    if (isDemo) {
      showToast('Usuário em modo demonstração possui acesso apenas de visualização.', 'warning');
      return;
    }
    setIsSavingGeneratedCredit(true);
    try {
      const parsedVal = parseCurrencyInput(generatedCreditInput);
      const validNum = isNaN(parsedVal) || parsedVal < 0 ? 0 : Number(parsedVal.toFixed(2));
      
      // Atualiza estado local imediatamente para refletir no painel
      setCustomGeneratedCredit(validNum);
      setIsManualGeneratedCredit(true);
      setIsEditingGeneratedCredit(false);
      setJustSavedGeneratedCredit(true);
      setTimeout(() => setJustSavedGeneratedCredit(false), 3000);

      const oldCredit = pisCofinsCredit;
      const historyEntry: HistoryLog = {
        id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
        userId: currentUser?.id || 'system',
        timestamp: new Date().toISOString(),
        description: `Crédito Gerado editado manualmente: de "${formatBrl(oldCredit)}" para "${formatBrl(validNum)}".`
      };

      const updatedHistory = [...(shipment.history || []), historyEntry];
      const updatedRealProfitData = {
        ...(shipment.realProfitData || {}),
        generatedCredit: validNum,
        isGeneratedCreditManual: true,
      };

      const updatedDocs = {
        ...(shipment.documents || {}),
        credito_gerado: validNum,
        generated_credit: validNum,
        is_generated_credit_manual: true,
        real_profit_data: updatedRealProfitData
      };

      const updatedShipment: Shipment = {
        ...shipment,
        isGeneratedCreditManual: true,
        generatedCredit: validNum,
        realProfitData: updatedRealProfitData as any,
        history: updatedHistory,
        documents: updatedDocs
      };

      await upsertShipment(updatedShipment);
      if (onUpdateShipmentData) {
        await onUpdateShipmentData(shipment.id, {
          isGeneratedCreditManual: true,
          generatedCredit: validNum,
          realProfitData: updatedRealProfitData as any,
          history: updatedHistory,
          documents: updatedDocs
        });
      }

      showToast(`Crédito Gerado atualizado para ${formatBrl(validNum)} com sucesso!`, 'success');
    } catch (err) {
      console.error('Erro ao salvar Crédito Gerado:', err);
      showToast('Erro ao salvar Crédito Gerado.', 'error');
    } finally {
      setIsSavingGeneratedCredit(false);
    }
  };

  const handleRestoreDefaultGeneratedCredit = async () => {
    if (isDemo) {
      showToast('Usuário em modo demonstração possui acesso apenas de visualização.', 'warning');
      return;
    }
    setIsSavingGeneratedCredit(true);
    try {
      setCustomGeneratedCredit(undefined);
      setIsManualGeneratedCredit(false);
      setIsEditingGeneratedCredit(false);

      const historyEntry: HistoryLog = {
        id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
        userId: currentUser?.id || 'system',
        timestamp: new Date().toISOString(),
        description: `Crédito Gerado restaurado para o cálculo automático do sistema.`
      };

      const updatedHistory = [...(shipment.history || []), historyEntry];
      const updatedRealProfitData = {
        ...(shipment.realProfitData || {}),
      };
      delete (updatedRealProfitData as any).generatedCredit;
      delete (updatedRealProfitData as any).isGeneratedCreditManual;

      const updatedDocs = {
        ...(shipment.documents || {}),
        real_profit_data: Object.keys(updatedRealProfitData).length > 0 ? updatedRealProfitData : undefined,
      };
      delete (updatedDocs as any).credito_gerado;
      delete (updatedDocs as any).generated_credit;
      delete (updatedDocs as any).is_generated_credit_manual;

      const updatedShipment: Shipment = {
        ...shipment,
        isGeneratedCreditManual: false,
        generatedCredit: undefined,
        realProfitData: Object.keys(updatedRealProfitData).length > 0 ? (updatedRealProfitData as any) : undefined,
        documents: updatedDocs,
        history: updatedHistory,
      };

      await upsertShipment(updatedShipment);
      if (onUpdateShipmentData) {
        await onUpdateShipmentData(shipment.id, {
          isGeneratedCreditManual: false,
          generatedCredit: undefined,
          realProfitData: Object.keys(updatedRealProfitData).length > 0 ? (updatedRealProfitData as any) : undefined,
          documents: updatedDocs,
          history: updatedHistory,
        });
      }

      showToast('Crédito Gerado restaurado para o cálculo automático do sistema!', 'success');
    } catch (err) {
      console.error('Erro ao restaurar Crédito Gerado:', err);
      showToast('Erro ao restaurar cálculo automático.', 'error');
    } finally {
      setIsSavingGeneratedCredit(false);
    }
  };

  // Valor da NF (Mercadoria) editável
  const initialCustomInvoiceValue = shipment.nfeValue !== undefined 
    ? shipment.nfeValue 
    : (shipment.realProfitData?.invoiceValue !== undefined 
        ? shipment.realProfitData.invoiceValue 
        : ((shipment.documents as any)?.nfe_value !== undefined 
            ? Number((shipment.documents as any).nfe_value) 
            : ((shipment.documents as any)?.valor_mercadoria !== undefined 
                ? Number((shipment.documents as any).valor_mercadoria) 
                : undefined)));

  const [customInvoiceValue, setCustomInvoiceValue] = React.useState<number | undefined>(initialCustomInvoiceValue);
  const [isEditingInvoiceValue, setIsEditingInvoiceValue] = React.useState(false);
  const [invoiceValueInput, setInvoiceValueInput] = React.useState<string>('');
  const [isSavingInvoiceValue, setIsSavingInvoiceValue] = React.useState(false);
  const [justSavedInvoiceValue, setJustSavedInvoiceValue] = React.useState(false);

  React.useEffect(() => {
    const currentVal = shipment.nfeValue !== undefined 
      ? shipment.nfeValue 
      : (shipment.realProfitData?.invoiceValue !== undefined 
          ? shipment.realProfitData.invoiceValue 
          : ((shipment.documents as any)?.nfe_value !== undefined 
              ? Number((shipment.documents as any).nfe_value) 
              : ((shipment.documents as any)?.valor_mercadoria !== undefined 
                  ? Number((shipment.documents as any).valor_mercadoria) 
                  : undefined)));
    setCustomInvoiceValue(currentVal);
  }, [shipment.nfeValue, shipment.realProfitData?.invoiceValue, shipment.documents]);

  const handleStartEditInvoiceValue = () => {
    if (isDemo) {
      showToast('Usuário em modo demonstração possui acesso apenas de visualização.', 'warning');
      return;
    }
    const currentNum = customInvoiceValue !== undefined ? customInvoiceValue : (autoInvoiceValue || shipment.nfeValue || shipment.realProfitData?.invoiceValue || 0);
    setInvoiceValueInput(currentNum > 0 ? String(currentNum) : '');
    setIsEditingInvoiceValue(true);
  };

  const handleSaveInvoiceValue = async () => {
    if (isDemo) {
      showToast('Usuário em modo demonstração possui acesso apenas de visualização.', 'warning');
      return;
    }
    setIsSavingInvoiceValue(true);
    try {
      const parsedVal = parseCurrencyInput(invoiceValueInput);
      const validNum = isNaN(parsedVal) || parsedVal < 0 ? 0 : Number(parsedVal.toFixed(2));
      
      setCustomInvoiceValue(validNum);
      setIsEditingInvoiceValue(false);
      setJustSavedInvoiceValue(true);
      setTimeout(() => setJustSavedInvoiceValue(false), 3000);

      const oldVal = customInvoiceValue || shipment.nfeValue || 0;
      const historyEntry: HistoryLog = {
        id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
        userId: currentUser?.id || 'system',
        timestamp: new Date().toISOString(),
        description: `Valor da NF-e editado manualmente: de "${formatBrl(oldVal)}" para "${formatBrl(validNum)}".`
      };

      const updatedHistory = [...(shipment.history || []), historyEntry];
      const updatedRealProfitData = {
        ...(shipment.realProfitData || {}),
        invoiceValue: validNum,
        isInvoiceValueManual: true,
      };

      const updatedDocs = {
        ...(shipment.documents || {}),
        nfe_value: validNum,
        valor_mercadoria: validNum,
        real_profit_data: updatedRealProfitData
      };

      const updatedShipment: Shipment = {
        ...shipment,
        nfeValue: validNum,
        realProfitData: updatedRealProfitData as any,
        history: updatedHistory,
        documents: updatedDocs
      };

      await upsertShipment(updatedShipment);
      if (onUpdateShipmentData) {
        await onUpdateShipmentData(shipment.id, {
          nfeValue: validNum,
          realProfitData: updatedRealProfitData as any,
          history: updatedHistory,
          documents: updatedDocs
        });
      }

      showToast(`Valor da NF-e atualizado para ${formatBrl(validNum)} com sucesso!`, 'success');
    } catch (err) {
      console.error('Erro ao salvar Valor da NF-e:', err);
      showToast('Erro ao salvar Valor da NF-e.', 'error');
    } finally {
      setIsSavingInvoiceValue(false);
    }
  };

  // Vale-Pedágio editável / correção de divergência
  const [customToll, setCustomToll] = React.useState<number | undefined>(undefined);
  const [isEditingToll, setIsEditingToll] = React.useState(false);
  const [tollInput, setTollInput] = React.useState<string>('');
  const [isSavingToll, setIsSavingToll] = React.useState(false);
  const [justSavedToll, setJustSavedToll] = React.useState(false);

  React.useEffect(() => {
    if (shipment.tollValue !== undefined && shipment.tollValue !== null) {
      setCustomToll(Number(shipment.tollValue));
    } else if (shipment.realProfitData?.toll !== undefined) {
      setCustomToll(Number(shipment.realProfitData.toll));
    } else {
      setCustomToll(undefined);
    }
  }, [shipment.tollValue, shipment.realProfitData?.toll, shipment.id]);

  const handleApplyDocToll = async (targetToll: number) => {
    if (isDemo) {
      showToast('Usuário em modo demonstração possui acesso apenas de visualização.', 'warning');
      return;
    }
    setIsSavingToll(true);
    try {
      const validNum = Math.max(0, Number(targetToll.toFixed(2)));
      setCustomToll(validNum);
      setIsEditingToll(false);
      setJustSavedToll(true);
      setTimeout(() => setJustSavedToll(false), 4000);

      const oldToll = toll;
      const historyEntry: HistoryLog = {
        id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
        userId: currentUser?.id || 'system',
        timestamp: new Date().toISOString(),
        description: `Vale-Pedágio corrigido para o valor do documento fiscal: de "${formatBrl(oldToll)}" para "${formatBrl(validNum)}".`
      };

      const updatedHistory = [...(shipment.history || []), historyEntry];
      const updatedRealProfitData = {
        ...(shipment.realProfitData || {}),
        toll: validNum,
      };

      const updatedDocs = {
        ...(shipment.documents || {}),
        toll_value: validNum,
        valor_pedagio: validNum,
        real_profit_data: updatedRealProfitData
      };

      const updatedShipment: Shipment = {
        ...shipment,
        tollValue: validNum,
        realProfitData: updatedRealProfitData as any,
        history: updatedHistory,
        documents: updatedDocs
      };

      await upsertShipment(updatedShipment);
      if (onUpdateShipmentData) {
        await onUpdateShipmentData(shipment.id, {
          tollValue: validNum,
          realProfitData: updatedRealProfitData as any,
          history: updatedHistory,
          documents: updatedDocs
        });
      }

      showToast(`Vale-Pedágio corrigido para ${formatBrl(validNum)} com sucesso!`, 'success');
    } catch (err) {
      console.error('Erro ao corrigir Vale-Pedágio:', err);
      showToast('Erro ao corrigir Vale-Pedágio.', 'error');
    } finally {
      setIsSavingToll(false);
    }
  };

  const handleStartEditToll = () => {
    if (isDemo) {
      showToast('Usuário em modo demonstração possui acesso apenas de visualização.', 'warning');
      return;
    }
    const currentNum = customToll !== undefined ? customToll : toll;
    setTollInput(currentNum > 0 ? String(currentNum) : (autoToll && autoToll > 0 ? String(autoToll) : ''));
    setIsEditingToll(true);
  };

  const handleSaveCustomToll = async () => {
    if (isDemo) {
      showToast('Usuário em modo demonstração possui acesso apenas de visualização.', 'warning');
      return;
    }
    setIsSavingToll(true);
    try {
      const parsedVal = parseCurrencyInput(tollInput);
      const validNum = isNaN(parsedVal) || parsedVal < 0 ? 0 : Number(parsedVal.toFixed(2));

      setCustomToll(validNum);
      setIsEditingToll(false);
      setJustSavedToll(true);
      setTimeout(() => setJustSavedToll(false), 4000);

      const oldToll = toll;
      const historyEntry: HistoryLog = {
        id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
        userId: currentUser?.id || 'system',
        timestamp: new Date().toISOString(),
        description: `Vale-Pedágio editado manualmente: de "${formatBrl(oldToll)}" para "${formatBrl(validNum)}".`
      };

      const updatedHistory = [...(shipment.history || []), historyEntry];
      const updatedRealProfitData = {
        ...(shipment.realProfitData || {}),
        toll: validNum,
      };

      const updatedDocs = {
        ...(shipment.documents || {}),
        toll_value: validNum,
        valor_pedagio: validNum,
        real_profit_data: updatedRealProfitData
      };

      const updatedShipment: Shipment = {
        ...shipment,
        tollValue: validNum,
        realProfitData: updatedRealProfitData as any,
        history: updatedHistory,
        documents: updatedDocs
      };

      await upsertShipment(updatedShipment);
      if (onUpdateShipmentData) {
        await onUpdateShipmentData(shipment.id, {
          tollValue: validNum,
          realProfitData: updatedRealProfitData as any,
          history: updatedHistory,
          documents: updatedDocs
        });
      }

      showToast(`Vale-Pedágio atualizado para ${formatBrl(validNum)} com sucesso!`, 'success');
    } catch (err) {
      console.error('Erro ao salvar Vale-Pedágio:', err);
      showToast('Erro ao salvar Vale-Pedágio.', 'error');
    } finally {
      setIsSavingToll(false);
    }
  };

  // 1. CTe Frete Bruto / Frete Empresa
  const companyRate = shipment.companyFreightRateSnapshot || cargo?.companyFreightValuePerTon || 0;
  const parsedPropTonnage = loadedTonnage !== undefined && loadedTonnage !== '' ? Number(loadedTonnage) : undefined;
  const tonnage = (parsedPropTonnage !== undefined && !isNaN(parsedPropTonnage) && parsedPropTonnage > 0)
    ? parsedPropTonnage
    : (shipment.shipmentTonnage || cargo?.totalVolume || 0);

  // Identificação da Agência do Solicitante (considerando vínculo de Agenciador de Embarque com seu Líder)
  const requesterUser = users?.find(u => u.id === shipment.embarcadorId || u.id === shipment.createdById);
  const agencyLeaderUser = (requesterUser?.profile === UserProfile.Agenciador && requesterUser.agencyRole === 'embarque' && requesterUser.agencyLeaderId)
    ? users?.find(u => u.id === requesterUser.agencyLeaderId)
    : (requesterUser?.profile === UserProfile.Agenciador ? requesterUser : null);

  const effectiveAgencyPercentage = shipment.agencyCommissionPercentage ?? agencyLeaderUser?.agencyCommissionPercentage ?? 30;

  const responsibleAgencyName = agencyLeaderUser?.name 
    ? (agencyLeaderUser.branchId ? `Agência ${agencyLeaderUser.branchId} (${agencyLeaderUser.name})` : agencyLeaderUser.name)
    : (requesterUser?.name 
        ? (requesterUser.branchId ? `Agência ${requesterUser.branchId} (${requesterUser.name})` : requesterUser.name)
        : (shipment.branchId ? `Agência ${shipment.branchId}` : (shipment.embarcadorId || 'Agência Solicitante')));

  // Identificação do Cliente / Embarcador
  const shipmentClient = clients?.find(c => c.id === cargo?.clientId);
  const clientBeneficiaryName = shipmentClient?.razaoSocial || shipmentClient?.nomeFantasia || cargo?.clientId || shipment.embarcadorId || 'Embarcador Solicitante';

  // --- HANDLERS: Custo Adicional / Prejuízo ---
  const handleOpenAddAdditionalCost = (mode: 'create' | 'edit' = 'create') => {
    if (isDemo) {
      showToast('Usuário em modo demonstração possui acesso apenas de visualização.', 'warning');
      return;
    }
    if (additionalCost && mode === 'edit') {
      setCostFormValue(String(additionalCost.value));
      setCostFormCategory(additionalCost.category || 'Avaria de Carga');
      setCostFormDescription(additionalCost.description || '');
      setAdditionalCostModalMode('edit');
    } else {
      setCostFormValue('');
      setCostFormCategory('Avaria de Carga');
      setCostFormDescription('');
      setAdditionalCostModalMode('create');
    }
    setIsAdditionalCostModalOpen(true);
  };

  const handleOpenViewAdditionalCost = () => {
    setAdditionalCostModalMode('view');
    setIsAdditionalCostModalOpen(true);
  };

  const handleSaveAdditionalCost = async () => {
    if (isDemo) {
      showToast('Usuário em modo demonstração possui acesso apenas de visualização.', 'warning');
      return;
    }
    const numVal = parseCurrencyInput(costFormValue);
    if (!numVal || numVal <= 0) {
      showToast('Por favor, informe um valor monetário válido maior que zero.', 'error');
      return;
    }
    if (!costFormDescription.trim()) {
      showToast('Por favor, preencha a justificativa / descrição do ocorrido.', 'error');
      return;
    }

    setIsSavingAdditionalCost(true);
    try {
      const newCost = {
        value: Number(numVal.toFixed(2)),
        category: costFormCategory.trim() || 'Outros Custos Imprevistos',
        description: costFormDescription.trim(),
        createdAt: new Date().toISOString(),
        createdBy: 'sistema'
      };

      setAdditionalCost(newCost);
      setIsAdditionalCostModalOpen(false);

      const historyEntry: HistoryLog = {
        id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
        userId: currentUser?.id || 'system',
        timestamp: new Date().toISOString(),
        description: `Custo Adicional / Prejuízo registrado: ${formatBrl(newCost.value)} (Categoria: ${newCost.category}). Justificativa: "${newCost.description}".`
      };

      const updatedHistory = [...(shipment.history || []), historyEntry];
      const updatedRealProfitData = {
        ...(shipment.realProfitData || {}),
        additionalCost: newCost.value,
        additionalCostCategory: newCost.category,
        additionalCostDescription: newCost.description,
      };

      const updatedDocs = {
        ...(shipment.documents || {}),
        additional_cost: newCost,
        additional_cost_value: newCost.value,
        additional_cost_category: newCost.category,
        additional_cost_description: newCost.description,
        real_profit_data: updatedRealProfitData
      };

      const updatedShipment: Shipment = {
        ...shipment,
        additionalCost: newCost,
        additionalCostValue: newCost.value,
        additionalCostCategory: newCost.category,
        additionalCostDescription: newCost.description,
        realProfitData: updatedRealProfitData as any,
        history: updatedHistory,
        documents: updatedDocs
      };

      if (onUpdateShipmentData) {
        await onUpdateShipmentData(shipment.id, {
          additionalCost: newCost,
          additionalCostValue: newCost.value,
          additionalCostCategory: newCost.category,
          additionalCostDescription: newCost.description,
          realProfitData: updatedRealProfitData as any,
          history: updatedHistory,
          documents: updatedDocs
        });
      } else {
        await upsertShipment(updatedShipment);
      }

      showToast(`Custo Adicional de ${formatBrl(newCost.value)} salvo com sucesso!`, 'success');
    } catch (err) {
      console.error('Erro ao salvar custo adicional:', err);
      showToast('Erro ao salvar custo adicional.', 'error');
    } finally {
      setIsSavingAdditionalCost(false);
    }
  };

  const handleDeleteAdditionalCost = async () => {
    if (isDemo) {
      showToast('Usuário em modo demonstração possui acesso apenas de visualização.', 'warning');
      return;
    }
    if (!window.confirm('Tem certeza que deseja remover este lançamento de custo adicional?')) return;
    setIsSavingAdditionalCost(true);
    try {
      const oldVal = additionalCost?.value || 0;
      setAdditionalCost(null);
      setIsAdditionalCostModalOpen(false);

      const historyEntry: HistoryLog = {
        id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
        userId: currentUser?.id || 'system',
        timestamp: new Date().toISOString(),
        description: `Custo Adicional / Prejuízo de ${formatBrl(oldVal)} removido da operação.`
      };

      const updatedHistory = [...(shipment.history || []), historyEntry];
      const updatedRealProfitData = { ...(shipment.realProfitData || {}) };
      delete (updatedRealProfitData as any).additionalCost;
      delete (updatedRealProfitData as any).additionalCostCategory;
      delete (updatedRealProfitData as any).additionalCostDescription;

      const updatedDocs = { ...(shipment.documents || {}) };
      delete (updatedDocs as any).additional_cost;
      delete (updatedDocs as any).additional_cost_value;
      delete (updatedDocs as any).additional_cost_category;
      delete (updatedDocs as any).additional_cost_description;
      (updatedDocs as any).real_profit_data = Object.keys(updatedRealProfitData).length > 0 ? updatedRealProfitData : undefined;

      const updatedShipment: Shipment = {
        ...shipment,
        additionalCost: undefined,
        additionalCostValue: undefined,
        additionalCostCategory: undefined,
        additionalCostDescription: undefined,
        realProfitData: Object.keys(updatedRealProfitData).length > 0 ? (updatedRealProfitData as any) : undefined,
        documents: updatedDocs,
        history: updatedHistory
      };

      if (onUpdateShipmentData) {
        await onUpdateShipmentData(shipment.id, {
          additionalCost: undefined,
          additionalCostValue: undefined,
          additionalCostCategory: undefined,
          additionalCostDescription: undefined,
          realProfitData: Object.keys(updatedRealProfitData).length > 0 ? (updatedRealProfitData as any) : undefined,
          documents: updatedDocs,
          history: updatedHistory
        });
      } else {
        await upsertShipment(updatedShipment);
      }

      showToast('Custo Adicional removido com sucesso!', 'success');
    } catch (err) {
      console.error('Erro ao remover custo adicional:', err);
      showToast('Erro ao remover custo adicional.', 'error');
    } finally {
      setIsSavingAdditionalCost(false);
    }
  };

  // --- HANDLERS: Comissão de Agência ---
  const handleToggleAgencyCommission = async () => {
    if (isDemo) {
      showToast('Usuário em modo demonstração possui acesso apenas de visualização.', 'warning');
      return;
    }
    const nextState = !agencyCommEnabled;
    setIsSavingAgencyComm(true);
    setAgencyCommEnabled(nextState);

    try {
      const calculatedAgencyVal = (nextState && operationalProfitBeforeAgency > 0)
        ? Number((operationalProfitBeforeAgency * (effectiveAgencyPercentage / 100)).toFixed(2))
        : 0;

      const historyEntry: HistoryLog = {
        id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
        userId: currentUser?.id || 'system',
        timestamp: new Date().toISOString(),
        description: `Comissão de Agência (${effectiveAgencyPercentage}% sobre Lucro Líquido Real) ${nextState ? `ativada: ${formatBrl(calculatedAgencyVal)} destinado à ${responsibleAgencyName}` : 'desativada'}.`
      };

      const updatedHistory = [...(shipment.history || []), historyEntry];
      const updatedRealProfitData = {
        ...(shipment.realProfitData || {}),
        agencyCommission: calculatedAgencyVal,
        agencyCommissionEnabled: nextState
      };

      const updatedDocs = {
        ...(shipment.documents || {}),
        agency_commission_enabled: nextState,
        agency_commission_percentage: effectiveAgencyPercentage,
        agency_commission_value: calculatedAgencyVal,
        agency_commission_agency_name: responsibleAgencyName,
        real_profit_data: updatedRealProfitData
      };

      const updatedShipment: Shipment = {
        ...shipment,
        agencyCommissionEnabled: nextState,
        agencyCommissionPercentage: effectiveAgencyPercentage,
        agencyCommissionValue: calculatedAgencyVal,
        agencyCommissionAgencyName: responsibleAgencyName,
        realProfitData: updatedRealProfitData as any,
        history: updatedHistory,
        documents: updatedDocs
      };

      if (onUpdateShipmentData) {
        await onUpdateShipmentData(shipment.id, {
          agencyCommissionEnabled: nextState,
          agencyCommissionPercentage: effectiveAgencyPercentage,
          agencyCommissionValue: calculatedAgencyVal,
          agencyCommissionAgencyName: responsibleAgencyName,
          realProfitData: updatedRealProfitData as any,
          history: updatedHistory,
          documents: updatedDocs
        });
      } else {
        await upsertShipment(updatedShipment);
      }

      showToast(nextState ? `Comissão de Agência (${effectiveAgencyPercentage}%) ativada!` : `Comissão de Agência desativada.`, 'success');
    } catch (err) {
      console.error('Erro ao alternar comissão de agência:', err);
      showToast('Erro ao atualizar comissão de agência.', 'error');
      setAgencyCommEnabled(!nextState);
    } finally {
      setIsSavingAgencyComm(false);
    }
  };

  // --- HANDLERS: Comissão do Embarcador (R$/ton) ---
  const handleToggleShipperCommission = async () => {
    if (isDemo) {
      showToast('Usuário em modo demonstração possui acesso apenas de visualização.', 'warning');
      return;
    }
    const nextState = !shipperCommEnabled;
    setIsSavingShipperComm(true);
    setShipperCommEnabled(nextState);

    try {
      const calculatedShipperVal = (nextState && shipperCommRate > 0 && tonnage > 0)
        ? Number((shipperCommRate * tonnage).toFixed(2))
        : 0;

      const historyEntry: HistoryLog = {
        id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
        userId: currentUser?.id || 'system',
        timestamp: new Date().toISOString(),
        description: `Comissão do Embarcador (${formatBrl(shipperCommRate)}/t) ${nextState ? `ativada: ${formatBrl(calculatedShipperVal)} (${tonnage.toFixed(2)}t) creditado ao embarcador` : 'desativada'}.`
      };

      const updatedHistory = [...(shipment.history || []), historyEntry];
      const updatedRealProfitData = {
        ...(shipment.realProfitData || {}),
        shipperCommission: calculatedShipperVal,
        shipperCommissionRatePerTon: shipperCommRate,
        shipperCommissionEnabled: nextState
      };

      const updatedDocs = {
        ...(shipment.documents || {}),
        shipper_commission_enabled: nextState,
        shipper_commission_rate_per_ton: shipperCommRate,
        shipper_commission_value: calculatedShipperVal,
        real_profit_data: updatedRealProfitData
      };

      const updatedShipment: Shipment = {
        ...shipment,
        shipperCommissionEnabled: nextState,
        shipperCommissionRatePerTon: shipperCommRate,
        shipperCommissionValue: calculatedShipperVal,
        realProfitData: updatedRealProfitData as any,
        history: updatedHistory,
        documents: updatedDocs
      };

      if (onUpdateShipmentData) {
        await onUpdateShipmentData(shipment.id, {
          shipperCommissionEnabled: nextState,
          shipperCommissionRatePerTon: shipperCommRate,
          shipperCommissionValue: calculatedShipperVal,
          realProfitData: updatedRealProfitData as any,
          history: updatedHistory,
          documents: updatedDocs
        });
      } else {
        await upsertShipment(updatedShipment);
      }

      showToast(nextState ? `Comissão do Embarcador (${formatBrl(shipperCommRate)}/t) ativada!` : `Comissão do Embarcador desativada.`, 'success');
    } catch (err) {
      console.error('Erro ao alternar comissão do embarcador:', err);
      showToast('Erro ao atualizar comissão do embarcador.', 'error');
      setShipperCommEnabled(!nextState);
    } finally {
      setIsSavingShipperComm(false);
    }
  };

  const handleSaveShipperRate = async (newRateVal?: number) => {
    if (isDemo) {
      showToast('Usuário em modo demonstração possui acesso apenas de visualização.', 'warning');
      return;
    }
    const parsedRate = newRateVal !== undefined ? newRateVal : parseCurrencyInput(shipperRateInput);
    const validRate = isNaN(parsedRate) || parsedRate <= 0 ? 1.00 : Number(parsedRate.toFixed(2));

    setIsSavingShipperComm(true);
    setShipperCommRate(validRate);
    setShipperRateInput(String(validRate));
    setIsEditingShipperRate(false);

    try {
      const calculatedShipperVal = (shipperCommEnabled && validRate > 0 && tonnage > 0)
        ? Number((validRate * tonnage).toFixed(2))
        : 0;

      const historyEntry: HistoryLog = {
        id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
        userId: currentUser?.id || 'system',
        timestamp: new Date().toISOString(),
        description: `Taxa da Comissão do Embarcador alterada para ${formatBrl(validRate)}/ton (Total: ${formatBrl(calculatedShipperVal)}).`
      };

      const updatedHistory = [...(shipment.history || []), historyEntry];
      const updatedRealProfitData = {
        ...(shipment.realProfitData || {}),
        shipperCommission: calculatedShipperVal,
        shipperCommissionRatePerTon: validRate,
        shipperCommissionEnabled: shipperCommEnabled
      };

      const updatedDocs = {
        ...(shipment.documents || {}),
        shipper_commission_enabled: shipperCommEnabled,
        shipper_commission_rate_per_ton: validRate,
        shipper_commission_value: calculatedShipperVal,
        real_profit_data: updatedRealProfitData
      };

      const updatedShipment: Shipment = {
        ...shipment,
        shipperCommissionEnabled: shipperCommEnabled,
        shipperCommissionRatePerTon: validRate,
        shipperCommissionValue: calculatedShipperVal,
        realProfitData: updatedRealProfitData as any,
        history: updatedHistory,
        documents: updatedDocs
      };

      if (onUpdateShipmentData) {
        await onUpdateShipmentData(shipment.id, {
          shipperCommissionEnabled: shipperCommEnabled,
          shipperCommissionRatePerTon: validRate,
          shipperCommissionValue: calculatedShipperVal,
          realProfitData: updatedRealProfitData as any,
          history: updatedHistory,
          documents: updatedDocs
        });
      } else {
        await upsertShipment(updatedShipment);
      }

      showToast(`Taxa de comissão do embarcador atualizada para ${formatBrl(validRate)}/t!`, 'success');
    } catch (err) {
      console.error('Erro ao atualizar taxa da comissão do embarcador:', err);
      showToast('Erro ao atualizar taxa.', 'error');
    } finally {
      setIsSavingShipperComm(false);
    }
  };

  const calculatedCompanyFreight = (companyRate > 0 && tonnage > 0) ? Number((companyRate * tonnage).toFixed(2)) : 0;
  const cteGrossFreight = (calculatedCompanyFreight > 0 && shipment.realProfitData?.companyFreight && Math.abs(shipment.realProfitData.companyFreight - calculatedCompanyFreight) > 5.00 && (shipment.companyFreightRateSnapshot || cargo?.companyFreightValuePerTon))
    ? calculatedCompanyFreight
    : (shipment.realProfitData?.companyFreight !== undefined && shipment.realProfitData.companyFreight > 0
        ? shipment.realProfitData.companyFreight
        : (calculatedCompanyFreight > 0 
            ? calculatedCompanyFreight 
            : (shipment.driverFreightValue || 0)));

  // Estados para capturas automáticas do XML/Documentos
  const [autoToll, setAutoToll] = React.useState<number | undefined>(undefined);
  const [autoInvoiceValue, setAutoInvoiceValue] = React.useState<number | undefined>(undefined);
  const [autoFederalTax, setAutoFederalTax] = React.useState<number | undefined>(undefined);
  const [autoCteServiceTotal, setAutoCteServiceTotal] = React.useState<number | undefined>(undefined);
  const [autoCteIcms, setAutoCteIcms] = React.useState<number | undefined>(undefined);
  const [autoCteIcmsRate, setAutoCteIcmsRate] = React.useState<number | undefined>(undefined);
  const [isSyncing, setIsSyncing] = React.useState(false);

  const syncDocs = React.useCallback(async () => {
    if (!shipment.documents) return;

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

    const docEntries: Array<{ url: string; category: string }> = [];
    for (const [key, val] of Object.entries(shipment.documents)) {
      if (isExcludedDocCategory(key)) continue;
      if (Array.isArray(val)) {
        for (const u of val) {
          if (typeof u === 'string' && (u.startsWith('http') || u.startsWith('/'))) {
            docEntries.push({ url: u, category: key });
          }
        }
      } else if (typeof val === 'string' && (val.startsWith('http') || val.startsWith('/'))) {
        docEntries.push({ url: val, category: key });
      }
    }

    let sumDirectNfeValues = 0;
    let directNfeCount = 0;
    let transportCargoValue: number | undefined;
    const detectedNfeNumbersList: string[] = [];
    const countedNfeKeys = new Set<string>();

    let detectedToll: number | undefined;
    let detectedFederalTax: number | undefined;

    for (const { url, category } of docEntries) {
      try {
        const ext = await extractDetailedDocData(url, category);

        // Se for CT-e de outro número que não do embarque (ex: anexo de outro transporte), ignorar
        if (ext.documentType === 'CT-e' && shipment.cteNumber && ext.docNumber && String(ext.docNumber) !== String(shipment.cteNumber)) {
          continue;
        }
        // Se for MDF-e de outro número que não do embarque, ignorar
        if (ext.documentType === 'MDF-e' && shipment.mdfeNumber && ext.docNumber && String(ext.docNumber) !== String(shipment.mdfeNumber)) {
          continue;
        }

        const isTransportDoc = 
          ext.documentType === 'Carta Frete' || 
          ext.documentType === 'CT-e' || 
          ext.documentType === 'MDF-e' ||
          category.toLowerCase().includes('carta') ||
          category.toLowerCase().includes('frete') ||
          category.toLowerCase().includes('contrato') ||
          category.toLowerCase().includes('cte') ||
          category.toLowerCase().includes('ct-e') ||
          category.toLowerCase().includes('mdfe') ||
          category.toLowerCase().includes('mdf-e');

        if (isTransportDoc && ext.financeiro?.valorPedagio !== undefined && ext.financeiro.valorPedagio >= 0) {
          // Um documento declarando "sem pedágio" (0) prevalece sobre valores positivos de outros documentos
          if (ext.financeiro.valorPedagio === 0 || detectedToll !== 0) {
            detectedToll = ext.financeiro.valorPedagio;
            setAutoToll(ext.financeiro.valorPedagio);
          }
        }

        const isNotaFiscalCategory = isStrictNotaFiscalCategory(category);
        const docNfeVal = ext.carga?.valorMercadoria || ext.financeiro?.valorTotalNfe;

        if (isNotaFiscalCategory) {
          // Identificador único da NF para evitar dupla contagem do mesmo arquivo/número
          const nfeUniqueKey = ext.accessKey || (ext.docNumber ? String(ext.docNumber) : url);
          if (!countedNfeKeys.has(nfeUniqueKey)) {
            countedNfeKeys.add(nfeUniqueKey);
            // Quando há múltiplas notas anexadas (ex: 2 notas), soma o valor de cada uma delas
            if (docNfeVal !== undefined && docNfeVal > 0) {
              sumDirectNfeValues = Number((sumDirectNfeValues + docNfeVal).toFixed(2));
              directNfeCount++;
            }
          }
          const num = ext.docNumber || ext.notasFiscais?.[0]?.numero || ext.documentosVinculados?.find(d => d.tipo.toLowerCase().includes('nfe') || d.tipo.toLowerCase().includes('nota'))?.numero;
          if (num && !detectedNfeNumbersList.includes(String(num))) {
            detectedNfeNumbersList.push(String(num));
          }
        } else if (ext.documentType === 'CT-e' || ext.documentType === 'MDF-e') {
          if (docNfeVal !== undefined && docNfeVal > 0 && !transportCargoValue) {
            transportCargoValue = docNfeVal;
          }
          if (ext.documentType === 'CT-e') {
            const servVal = ext.financeiro?.valorTotalServico !== undefined ? ext.financeiro.valorTotalServico : ext.financeiro?.valorTotalFrete;
            if (servVal !== undefined && servVal > 0) {
              setAutoCteServiceTotal(servVal);
            }
            if (ext.financeiro?.valorIcms !== undefined) {
              setAutoCteIcms(ext.financeiro.valorIcms);
            }
            if (ext.financeiro?.aliquotaIcms !== undefined && ext.financeiro.aliquotaIcms > 0) {
              setAutoCteIcmsRate(ext.financeiro.aliquotaIcms);
            }
          }
          if (ext.notasFiscais && ext.notasFiscais.length > 0) {
            for (const nf of ext.notasFiscais) {
              if (nf.numero && !detectedNfeNumbersList.includes(String(nf.numero))) {
                detectedNfeNumbersList.push(String(nf.numero));
              }
            }
          }
        }

        if (ext.financeiro?.valorPisCofinsFederal !== undefined && ext.financeiro.valorPisCofinsFederal > 0) {
          detectedFederalTax = ext.financeiro.valorPisCofinsFederal;
          setAutoFederalTax(ext.financeiro.valorPisCofinsFederal);
        } else if (ext.financeiro?.valorPis !== undefined || ext.financeiro?.valorCofins !== undefined) {
          const sumFed = (ext.financeiro?.valorPis || 0) + (ext.financeiro?.valorCofins || 0);
          if (sumFed > 0) {
            detectedFederalTax = sumFed;
            setAutoFederalTax(sumFed);
          }
        }
      } catch {
        // ignore
      }
    }

    // Consolidação do Valor da NF: se houver 2 ou mais notas anexadas, a soma total prevalece
    let detectedInvoiceValue: number | undefined;
    if (directNfeCount > 0 && sumDirectNfeValues > 0) {
      detectedInvoiceValue = directNfeCount > 1 
        ? sumDirectNfeValues 
        : Math.max(sumDirectNfeValues, transportCargoValue || 0);
    } else if (transportCargoValue !== undefined && transportCargoValue > 0) {
      detectedInvoiceValue = transportCargoValue;
    }

    if (detectedInvoiceValue && detectedInvoiceValue > 0) {
      setAutoInvoiceValue(detectedInvoiceValue);
    }

    if (onUpdateShipmentData) {
      let hasPatch = false;
      const patch: Partial<Shipment> = {};
      const updatedRealProfit = { ...(shipment.realProfitData || {}) };
      const updatedDocs = { ...(shipment.documents || {}) };

      if (detectedInvoiceValue && detectedInvoiceValue > 0) {
        const currentInv = shipment.nfeValue || shipment.realProfitData?.invoiceValue;
        if (!currentInv || currentInv !== detectedInvoiceValue) {
          patch.nfeValue = detectedInvoiceValue;
          updatedRealProfit.invoiceValue = detectedInvoiceValue;
          (updatedDocs as any).nfe_value = detectedInvoiceValue;
          (updatedDocs as any).valor_mercadoria = detectedInvoiceValue;
          if (detectedNfeNumbersList.length > 0) {
            const combinedNumbers = detectedNfeNumbersList.join(', ');
            patch.nfeNumber = combinedNumbers;
            (updatedDocs as any).nfe_number = combinedNumbers;
          }
          hasPatch = true;
        }
      }

      // Pedágio explicitamente zerado no embarque (sem pedágio) nunca é sobrescrito pela leitura automática
      const isTollExplicitlyZero = shipment.tollValue !== undefined && shipment.tollValue !== null && Number(shipment.tollValue) === 0;
      if (detectedToll === 0) {
        const docs: any = shipment.documents || {};
        if (!isTollExplicitlyZero || Number(shipment.realProfitData?.toll) > 0 || Number(docs.toll_value) > 0 || Number(docs.valor_pedagio) > 0) {
          patch.tollValue = 0;
          updatedRealProfit.toll = 0;
          (updatedDocs as any).toll_value = 0;
          (updatedDocs as any).valor_pedagio = 0;
          hasPatch = true;
        }
      } else if (detectedToll && detectedToll > 0 && !isTollExplicitlyZero) {
        if (!shipment.tollValue || shipment.tollValue !== detectedToll || !shipment.realProfitData?.toll) {
          patch.tollValue = detectedToll;
          updatedRealProfit.toll = detectedToll;
          (updatedDocs as any).toll_value = detectedToll;
          (updatedDocs as any).valor_pedagio = detectedToll;
          hasPatch = true;
        }
      }

      if (hasPatch) {
        patch.realProfitData = updatedRealProfit as any;
        patch.documents = updatedDocs;
        try {
          onUpdateShipmentData(shipment.id, patch, { silent: true });
        } catch {
          // ignore
        }
      }
    }
  }, [shipment.documents, shipment.id, shipment.nfeValue, shipment.tollValue, shipment.realProfitData, onUpdateShipmentData]);

  React.useEffect(() => {
    syncDocs();
  }, [syncDocs]);

  const handleManualSync = async () => {
    setIsSyncing(true);
    await syncDocs();
    setTimeout(() => setIsSyncing(false), 500);
  };

  // 2. Verificação de Carga de Exportação (Destino Porto, Terminal Retroportuário, EADI, Armazém Alfandegado, CFOP 6353, CST 40)
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

  const isExportSuspended = isExportCargo;

  // 3. Valor NF (Valor da Mercadoria / Carga informado no CT-e / NF-e)
  const invoiceValue = customInvoiceValue !== undefined 
    ? customInvoiceValue 
    : (autoInvoiceValue || shipment.nfeValue || shipment.realProfitData?.invoiceValue || 0);
  // Base de Seguro: Acréscimo de +18% somente em carga de exportação (NF * 1.18); Mercado Interno: Base = Valor da NF
  const insuranceBaseValue = invoiceValue > 0 
    ? Number((invoiceValue * (isExportCargo ? 1.18 : 1.00)).toFixed(2)) 
    : 0;

  // 4. Seguro Acidente (0,0125%) + Roubo (0,0125%) = 0,025% sobre a Base de Seguro
  const taxaSeguroAcidente = 0.000125; // 0,0125%
  const taxaSeguroRoubo = 0.000125;    // 0,0125%
  const taxaSeguroTotal = taxaSeguroAcidente + taxaSeguroRoubo; // 0,025%
  const insuranceTaxes = insuranceBaseValue > 0 ? Number((insuranceBaseValue * taxaSeguroTotal).toFixed(2)) : 0;
  const totalSeguroAcidenteRoubo = insuranceTaxes;

  // 5. Seguro RCV (R$ 5,00 por veículo / viagem)
  const isComplementar = Boolean(
    shipment.isComplementar || 
    (shipment.documents as any)?.is_complementar || 
    (shipment.documents as any)?.isComplementar
  );
  const seguroRcv = isComplementar ? 0 : 5.00;

  // 8. Vale-Pedágio (Informativo da Carta Frete / TAG / Formulário / Embarque)
  const parsedPropToll = tollValue !== undefined && tollValue !== '' ? Number(tollValue) : undefined;
  // Prioridade: valor editado/corrigido no painel > valor digitado no formulário > tollValue do embarque (inclusive 0 = sem pedágio) > leitura automática > realProfitData
  const toll = isComplementar
    ? 0
    : (customToll !== undefined && !isNaN(customToll)
        ? customToll
        : (parsedPropToll !== undefined && !isNaN(parsedPropToll) && parsedPropToll > 0
            ? parsedPropToll
            : (shipment.tollValue !== undefined && shipment.tollValue !== null && !isNaN(Number(shipment.tollValue))
                ? Number(shipment.tollValue)
                : (autoToll !== undefined && autoToll > 0
                    ? autoToll
                    : (shipment.realProfitData?.toll || 0)))));

  const isExplicitPj = selectedRegime === 'Lucro Real / Presumido' || selectedRegime === 'Lucro Real' || selectedRegime === 'Lucro Presumido' || selectedRegime === 'Simples Nacional' || selectedRegime === 'MEI' || selectedRegime === 'PJ' || selectedRegime === 'ETC' || shipment.driverFreightType === 'PJ' || shipment.anttModality === 'ETC';
  const isShipmentPf = !isExplicitPj && (selectedRegime === 'PF' || selectedRegime === 'TAC' || shipment.driverFreightType === 'PF' || shipment.anttModality === 'TAC');
  const isPjDriver = !isShipmentPf;
  const isPf = isShipmentPf;
  const isSimplesNacional = selectedRegime === 'Simples Nacional' || selectedRegime === 'MEI';
  // REGRA APURAÇÃO CRÉDITO FISCAL EXPORTAÇÃO:
  // 1. Base Efetiva do Frete Tributável (BC Crédito / BC Serviço) = Frete Empresa - Vale-Pedágio
  // 2. Alíquota Efetiva de Crédito:
  //    - PF (TAC / Terceiro PF): 6,52834% (Manutenção de Crédito: ICMS 12% * 54,39%)
  //    - PJ (Lucro Real / Lucro Presumido / Simples Nacional / MEI): 6,5136% (Manutenção de Crédito: ICMS 12% * 54,28%)
  const creditRate = isShipmentPf 
    ? 0.0652834 
    : 0.065136;
  const creditRatePercentLabel = isShipmentPf 
    ? 'PF (6,52834% • Manutenção Crédito)' 
    : 'PJ (6,5136% • Manut. ICMS Exportação)';

  const driverRate = shipment.driverFreightRateSnapshot || cargo?.driverFreightValuePerTon || 0;
  const tonVal = Number(tonnage) || Number(shipment.shipmentTonnage) || 0;
  const calculatedDriverFreight = (driverRate > 0 && tonVal > 0) ? Number((driverRate * tonVal).toFixed(2)) : 0;
  const driverFreight = shipment.realProfitData?.driverFreight !== undefined && shipment.realProfitData.driverFreight > 0
    ? shipment.realProfitData.driverFreight
    : ((calculatedDriverFreight > 0 && shipment.driverFreightValue && Math.abs(Number(shipment.driverFreightValue) - calculatedDriverFreight) > 5.00 && shipment.driverFreightRateSnapshot)
        ? calculatedDriverFreight
        : (Number(shipment.driverFreightValue) || calculatedDriverFreight));

  // Bases de Frete Líquidas de Pedágio (Conforme regra do ERP)
  const baseFreteEmpresa = Math.max(0, cteGrossFreight - toll);
  const baseFreteMotorista = Math.max(0, driverFreight - toll);

  // 7. ICMS (Valor integral do ICMS destacado no CT-e / vICMS)
  // Se a carga NÃO tem ICMS destacado no seu cadastro, nenhum embarque vinculado pode destacar/deduzir ICMS
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

  const isIcmsExemptExplicit = Boolean(
    isCargoWithoutIcms ||
    (shipment as any)?.isIcmsExempt ||
    (shipment.documents as any)?.is_icms_exempt ||
    (shipment.documents as any)?.isIcmsExempt ||
    shipment.realProfitData?.isIcmsExempt ||
    shipment.icmsValue === 0 ||
    (shipment.documents as any)?.icms_value === 0 ||
    (shipment.documents as any)?.icms_value === '0' ||
    (shipment.documents as any)?.valor_icms === 0 ||
    shipment.realProfitData?.icmsDifference === 0
  );
  const detectedOrCalculatedIcmsRate = (() => {
    if (isIcmsExemptExplicit || isCargoWithoutIcms) return 0;
    if (autoCteIcmsRate && autoCteIcmsRate > 0) return autoCteIcmsRate;
    if ((shipment as any)?.icmsPercentage && (shipment as any).icmsPercentage > 0) return (shipment as any).icmsPercentage;
    if (cargo?.icmsPercentage && cargo.icmsPercentage > 0) return cargo.icmsPercentage;
    const effectiveIcmsVal = autoCteIcms !== undefined 
      ? autoCteIcms 
      : (Number((shipment.documents as any)?.icms_value) || Number(shipment.icmsValue) || 0);
    if (effectiveIcmsVal > 0 && cteGrossFreight > 0) {
      const computedRatio = Math.round((effectiveIcmsVal / cteGrossFreight) * 100);
      if (computedRatio > 0 && computedRatio <= 30) return computedRatio;
    }
    return ((shipment as any)?.hasIcms || cargo?.hasIcms) ? 7 : 0;
  })();
  const icmsPercentage = isIcmsExemptExplicit ? 0 : detectedOrCalculatedIcmsRate;
  const icmsBruto = (!isIcmsExemptExplicit && !isCargoWithoutIcms && (cargo?.hasIcms || (shipment as any)?.hasIcms || icmsPercentage > 0) && icmsPercentage > 0)
    ? Number((cteGrossFreight * (icmsPercentage / 100)).toFixed(2))
    : 0;

  // Valor ICMS Completo (Destacado no CT-e)
  const icmsDoc = isIcmsExemptExplicit ? 0 : (Number((shipment.documents as any)?.icms_value) || Number(shipment.icmsValue) || 0);
  const icms = isIcmsExemptExplicit
    ? 0
    : (icmsBruto > 0
        ? icmsBruto
        : (shipment.realProfitData?.icmsDifference !== undefined && shipment.realProfitData.icmsDifference > 0
            ? shipment.realProfitData.icmsDifference
            : (icmsDoc > 0 ? icmsDoc : 0)));

  const allDocText = [
    cargo?.observations,
    (shipment as any)?.observations,
    (shipment as any)?.cargoObservations,
    (shipment as any)?.cteFiscalInfo,
    (shipment as any)?.taxObservations,
    (shipment as any)?.fiscalNotes,
    (cargo as any)?.specialInstructions,
    (cargo as any)?.productName,
    Array.isArray(shipment.history) ? JSON.stringify(shipment.history) : '',
    shipment.documents ? JSON.stringify(shipment.documents) : ''
  ].filter(Boolean).join(' ');

  const suspMatch = allDocText.match(/(?:impostos?\s+suspensos?|suspens[aã]o(?:\s+tribut[aá]ria)?)\s*:\s*(\d+(?:[.,]\d+)?)\s*%/i) ||
                    allDocText.match(/suspens[aã]o\s*(?:de\s*)?(\d+(?:[.,]\d+)?)\s*%/i) ||
                    allDocText.match(/(\d+(?:[.,]\d+)?)\s*%\s*(?:de\s*)?suspens[aã]o/i);

  const isSuspendedRoute = Boolean(
    /CEL[-_ ]?(337|338|\d+)/i.test(shipment.id || '') ||
    /CEL[-_ ]?(337|338|\d+)/i.test((shipment as any)?.cargoNumber || '') ||
    /CEL[-_ ]?(337|338|\d+)/i.test(allDocText)
  );

  const suspensionPercentage = isExportCargo 
    ? 100 
    : (suspMatch ? parseFloat(suspMatch[1].replace(',', '.')) : (isSuspendedRoute ? 30 : 0));
  const tributavelRatio = isExportCargo ? 0 : Math.max(0, (100 - suspensionPercentage) / 100);

  // Bases Líquidas de ICMS
  const icmsRate = (cargo?.hasIcms && icmsPercentage > 0) ? (icmsPercentage / 100) : 0;
  const baseFreteEmpresaLiqIcms = Math.max(0, baseFreteEmpresa * (1 - icmsRate));
  const baseFreteMotoristaLiqIcms = Math.max(0, baseFreteMotorista * (1 - icmsRate));
  const spreadLiquidoIcms = Math.max(0, (baseFreteEmpresa - baseFreteMotorista) * (1 - icmsRate));

  // Passo 1: Identificar os Valores de Faturamento da Viagem
  // Frete_Bruto = cteGrossFreight (vTPrest)
  // ICMS_Destacado = icmsBruto (vICMS)
  // Frete_Liquido = Frete_Bruto - ICMS_Destacado
  const freteLiquidoIcms = Math.max(0, cteGrossFreight - (icmsBruto > 0 ? icmsBruto : icms));

  // Passo 2: Apurar o Spread Comercial (Diferença de Frete)
  // Diferenca_Frete_RS = Frete_Empresa_Liquido - Frete_Motorista
  const diferencaFreteReais = Number((freteLiquidoIcms - driverFreight).toFixed(2));
  const margemFretePercent = freteLiquidoIcms > 0
    ? Number(((diferencaFreteReais / freteLiquidoIcms) * 100).toFixed(2))
    : 0;

  // 5. Crédito Gerado (Gerado EXCLUSIVAMENTE quando a carga for de exportação)
  // Regra PF: BC_Servico = (cteGrossFreight - toll) * 6,52834% (Manutenção de Crédito de Exportação)
  // Regra PJ: BC_Credito = (cteGrossFreight - toll) * 6,5136% (Manutenção de Crédito de Exportação)
  const isGeneratedCreditCustom = Boolean(isManualGeneratedCredit && customGeneratedCredit !== undefined);
  const calculatedExportCredit = (isExportCargo && baseFreteEmpresa > 0)
    ? Number((baseFreteEmpresa * creditRate).toFixed(2))
    : (isExportCargo && baseFreteMotorista > 0 ? Number((baseFreteMotorista * creditRate).toFixed(2)) : 0);
  const pisCofinsCredit = isGeneratedCreditCustom
    ? customGeneratedCredit!
    : (isExportCargo ? calculatedExportCredit : 0);

  // 6. Débito PIS COFINS
  const isFederalTaxCustom = Boolean(isManualFederalTax && customFederalTax !== undefined);

  const autoOrRealFederalTax = isFederalTaxCustom
    ? customFederalTax
    : undefined;

  const federalPisCofinsDebito = isExportCargo
    ? 0
    : ((autoOrRealFederalTax !== undefined && autoOrRealFederalTax >= 0)
        ? autoOrRealFederalTax
        : (baseFreteEmpresaLiqIcms > 0 ? Number((baseFreteEmpresaLiqIcms * (suspensionPercentage > 0 ? tributavelRatio : 1) * 0.0925).toFixed(2)) : 0));

  // Passo 3: Imposto Federal (Simples Nacional 3,40% s/ Frete Bruto | PF: 3,655% s/ Líquido | PJ: 9,25% s/ Spread)
  const simplesFederalRate = 0.0340; // 3,40% (Anexo III - Tributos Federais)
  const impostoFederalSimples = Number((cteGrossFreight * simplesFederalRate).toFixed(2));
  const impostoFederalPf = Number((freteLiquidoIcms * 0.03655).toFixed(2));
  const impostoFederalPjSpread = Number((Math.max(0, diferencaFreteReais) * 0.0925).toFixed(2));

  let impostoFederalMercadoInterno = 0;
  if (isSimplesNacional) {
    impostoFederalMercadoInterno = impostoFederalSimples;
  } else if (isShipmentPf) {
    impostoFederalMercadoInterno = impostoFederalPf;
  } else {
    impostoFederalMercadoInterno = impostoFederalPjSpread;
  }

  // Imposto Federal Líquido Efetivo a Recolher
  const impostoFederalLiquido = isFederalTaxCustom
    ? customFederalTax!
    : (isExportCargo ? 0 : impostoFederalMercadoInterno);

  // 9. GR (Gerenciadora de Risco - Modalidade de Consulta Realizada)
  const isRiskRequired = Boolean(
    (cargo as any)?.requiresRiskManagement !== false &&
    (shipment as any)?.requiresRiskManagement !== false &&
    (cargo as any)?.product?.requiresRiskManagement !== false
  );

  let historyRiskType: string | undefined;
  let historyReleaseCode: string | undefined;
  let historyRiskCost: number | undefined;

  if (Array.isArray(shipment.history)) {
    for (const h of shipment.history) {
      const msg = typeof h === 'string' ? h : ((h as any)?.description || (h as any)?.message || '');
      const matchGr = msg.match(/Libera[çc][ãa]o\s+de\s+Seguradora:\s*(?:C[óo]d\s*)?([^\(\n]+?)\s*\(([^-\)]+?)(?:\s*-\s*R\$\s*([\d.,]+))?\)/i);
      if (matchGr) {
        if (matchGr[1] && matchGr[1].trim()) historyReleaseCode = matchGr[1].trim();
        if (matchGr[2] && matchGr[2].trim()) historyRiskType = matchGr[2].trim();
        if (matchGr[3] && matchGr[3].trim()) {
          const c = parseFloat(matchGr[3].replace('.', '').replace(',', '.'));
          if (!isNaN(c)) historyRiskCost = c;
        }
      }
    }
  }

  const effectiveRiskType = riskQueryType || shipment.riskQueryType || historyRiskType;
  const effectiveReleaseCode = riskReleaseCode || shipment.riskReleaseCode || historyReleaseCode;
  
  const isPreCadastroOrSeguradora = shipment.status === ShipmentStatus.PreCadastro || 
    shipment.status === ShipmentStatus.AguardandoSeguradora || 
    (shipment.status as string) === 'Ag. Cadastro' || 
    (shipment.status as string) === 'Aguardando Cadastro' ||
    (shipment.status as string) === 'Ag. Seguradora';

  let riskCost = 0;
  if (!isRiskRequired) {
    riskCost = (shipment.riskQueryCost !== undefined && shipment.riskQueryCost !== null && Number(shipment.riskQueryCost) > 0) ? Number(shipment.riskQueryCost) : 0;
  } else if (shipment.riskQueryCost !== undefined && shipment.riskQueryCost !== null && Number(shipment.riskQueryCost) > 0) {
    riskCost = Number(shipment.riskQueryCost);
  } else if (historyRiskCost !== undefined && historyRiskCost !== null && Number(historyRiskCost) > 0) {
    riskCost = historyRiskCost;
  } else if (effectiveRiskType && effectiveRiskType !== 'Pendente de Definição') {
    riskCost = (RISK_QUERY_COST_MAP[effectiveRiskType] ?? RISK_QUERY_COST_MAP[effectiveRiskType.toLowerCase().trim()] ?? 6.50);
  } else if (effectiveReleaseCode && !isPreCadastroOrSeguradora) {
    riskCost = 6.50;
  } else if ((shipment.status === ShipmentStatus.Cancelado || (shipment as any)?.releaseStatus === 'Reprovado') && !isPreCadastroOrSeguradora) {
    const inferredType = effectiveRiskType || 'Cadastro Geral + Biometria';
    riskCost = RISK_QUERY_COST_MAP[inferredType] ?? RISK_QUERY_COST_MAP[inferredType.toLowerCase().trim()] ?? 31.50;
  } else {
    riskCost = 0;
  }

  // 10. INSS Patronal / CPRB: PF = 4% sobre (Frete Motorista - Pedágio); PJ = R$ 0,00 (Isento)
  const cprbPfRate = 0.04; // 4%
  const baseInssPatronal = Math.max(0, driverFreight - toll);
  const inssPatronalMotorista = isShipmentPf
    ? Number((baseInssPatronal * cprbPfRate).toFixed(2))
    : 0;

  // Retenções de TAC / Motorista Pessoa Física (INSS e SEST/SENAT)
  const tacDeductions = isShipmentPf ? calculateTacTaxDeductions(driverFreight, toll) : null;
  const inssRetidoPf = tacDeductions?.inss || 0;
  const sestSenatRetidoPf = tacDeductions?.sestSenat || 0;

  // 11. CIOT (0,20% s/ Frete Líquido do Motorista: deduz pedágio e, para TAC/PF, retenções de INSS e SEST/SENAT)
  const isCiotManual = Boolean((shipment.realProfitData as any)?.isCiotManual);
  const manualCiotValue = (shipment.realProfitData as any)?.ciot;
  const baseCiotFreight = isShipmentPf
    ? Math.max(0, driverFreight - toll - inssRetidoPf - sestSenatRetidoPf)
    : Math.max(0, driverFreight - toll);
  const ciotValue = isComplementar
    ? 0
    : (isCiotManual && manualCiotValue !== undefined
        ? Number(manualCiotValue)
        : (baseCiotFreight > 0 ? Number((baseCiotFreight * 0.0020).toFixed(2)) : 0));

  // 13. Custo Fixo (0,35% s/ Frete Bruto)
  const custoFixoValue = Number((cteGrossFreight * 0.0035).toFixed(2));

  // 14. Comissão Vendedor Externo (R$/ton cadastrado na carga)
  const salespersonRate = Number(cargo?.salespersonCommissionPerTon) || 0;
  const salespersonName = cargo?.salespersonName || '';
  const salespersonCommission = (salespersonRate > 0 && tonnage > 0)
    ? Number((salespersonRate * tonnage).toFixed(2))
    : 0;

  // 14.1 Comissão Comercial (0,20% s/ Frete Bruto)
  const comissaoComercialCalculada = Number((cteGrossFreight * 0.0020).toFixed(2));
  const comissaoComercial = shipment.commercialCommission !== undefined && shipment.commercialCommission > 0
    ? shipment.commercialCommission
    : (shipment.realProfitData?.commission !== undefined && shipment.realProfitData.commission > 0
        ? shipment.realProfitData.commission
        : comissaoComercialCalculada);

  // 14.2 Estadias / CT-e Complementar Vinculados
  const [fetchedStays, setFetchedStays] = React.useState<StayRecord[]>([]);

  React.useEffect(() => {
    if (stays && stays.length > 0) {
      setFetchedStays(stays);
      return;
    }
    let isMounted = true;
    getAllToolStays().then(allStays => {
      if (isMounted && allStays) {
        setFetchedStays(allStays);
      }
    }).catch(err => {
      console.warn('Erro ao carregar estadias no painel de automação CT-e:', err);
    });
    return () => { isMounted = false; };
  }, [stays, shipment.id]);

  const activeStaysList = (stays && stays.length > 0) ? stays : fetchedStays;
  const shipmentStays = React.useMemo(() => {
    return activeStaysList.filter(s => isStayForShipment(s, shipment));
  }, [activeStaysList, shipment]);

  const demurrageRevenue = shipmentStays.reduce((sum, s) => sum + (s.approvedValue || 0), 0);
  const demurrageDriverPaid = shipmentStays.reduce((sum, s) => sum + (s.driverPaidValue || 0), 0);
  const demurrageProfit = demurrageRevenue - demurrageDriverPaid;
  const hasStays = shipmentStays.length > 0 && (demurrageRevenue > 0 || demurrageDriverPaid > 0 || shipmentStays.length > 0);

  // Tributos do CT-e Complementar de Estadia (conforme alíquotas do embarque ou informados na estadia)
  const stayCteNumbers = shipmentStays.map(s => s.cteNumber).filter(Boolean);
  const effectiveStayIcmsRate = isIcmsExemptExplicit ? 0 : icmsPercentage;
  const stayFederalRate = isExportCargo 
    ? 0 
    : (isSimplesNacional ? simplesFederalRate : (isShipmentPf ? 0.03655 : 0.0925));
  const stayFederalRateLabel = isExportCargo 
    ? '0% Exportação' 
    : (isSimplesNacional ? '3,40% Simples' : (isShipmentPf ? '3,655% PF' : '9,25%'));

  // Apuração detalhada de tributos de cada estadia vinculada
  const staysWithTaxes = shipmentStays.map(s => {
    const cteNum = s.cteNumber || extractCteNumberFromStay(s) || 'S/N';
    const appVal = s.approvedValue || 0;

    // ICMS
    const sIcmsPct = s.icmsPercentage !== undefined && s.icmsPercentage !== null
      ? Number(s.icmsPercentage)
      : effectiveStayIcmsRate;
    const sIcmsVal = s.icmsValue !== undefined && s.icmsValue !== null
      ? Number(s.icmsValue)
      : ((isIcmsExemptExplicit || effectiveStayIcmsRate <= 0 || appVal <= 0)
          ? 0
          : Number((appVal * (effectiveStayIcmsRate / 100)).toFixed(2)));

    // Imposto Federal
    const sFedVal = s.federalTaxValue !== undefined && s.federalTaxValue !== null
      ? Number(s.federalTaxValue)
      : (isExportCargo ? 0 : (stayFederalRate > 0 && appVal > 0 ? Number((appVal * stayFederalRate).toFixed(2)) : 0));

    return {
      ...s,
      cteNumber: cteNum,
      stayIcmsVal: sIcmsVal,
      stayIcmsPct: sIcmsPct,
      stayFederalVal: sFedVal
    };
  });

  const totalStayIcms = Number(staysWithTaxes.reduce((sum, s) => sum + s.stayIcmsVal, 0).toFixed(2));
  const totalStayFederalTax = Number(staysWithTaxes.reduce((sum, s) => sum + s.stayFederalVal, 0).toFixed(2));
  const stayIcms = totalStayIcms;
  const stayFederalTax = totalStayFederalTax;

  // Totais Tributários Consolidados (CT-e Principal + Complementares)
  const totalImpostoFederal = Number((impostoFederalLiquido + totalStayFederalTax).toFixed(2));
  const totalIcms = Number((icms + totalStayIcms).toFixed(2));

  // Totais Combinados (Frete Base CT-e + Estadia / CT-e Complementar)
  const totalCompanyFreight = cteGrossFreight + demurrageRevenue;
  const totalDriverFreight = driverFreight + demurrageDriverPaid;
  const freteLiquidoIcmsWithStay = freteLiquidoIcms + demurrageRevenue;
  const totalDiferencaFreteReais = Number((freteLiquidoIcmsWithStay - totalDriverFreight).toFixed(2));
  const margemFretePercentWithStay = freteLiquidoIcmsWithStay > 0
    ? Number(((totalDiferencaFreteReais / freteLiquidoIcmsWithStay) * 100).toFixed(2))
    : 0;

  // 14.3 Custo Adicional / Registro de Prejuízo
  const additionalCostValue = additionalCost?.value || 0;

  // 14.4 Comissão do Embarcador (R$/ton configurável)
  const shipperCommissionValue = (shipperCommEnabled && shipperCommRate > 0 && tonnage > 0)
    ? Number((shipperCommRate * tonnage).toFixed(2))
    : 0;

  // 14.5 Custo Financeiro (pro rata s/ Frete Empresa conforme taxa mensal e prazo)
  const isCargoFinActive = Boolean(
    (shipment.financialCostValue !== undefined && Number(shipment.financialCostValue) > 0) ||
    (shipment.financialCostRate !== undefined && Number(shipment.financialCostRate) > 0) ||
    cargo?.financialCostEnabled === true ||
    (cargo?.financialCostMonthlyRate !== undefined && Number(cargo.financialCostMonthlyRate) > 0 && cargo?.financialCostDaysTerm !== undefined && Number(cargo.financialCostDaysTerm) > 0)
  );

  const financialCostMonthlyRate = shipment.financialCostMonthlyRate !== undefined && shipment.financialCostMonthlyRate !== null
    ? Number(shipment.financialCostMonthlyRate)
    : (cargo?.financialCostMonthlyRate !== undefined && cargo.financialCostMonthlyRate !== null
        ? Number(cargo.financialCostMonthlyRate)
        : 0);

  const financialCostDaysTerm = shipment.financialCostDaysTerm !== undefined && shipment.financialCostDaysTerm !== null
    ? Number(shipment.financialCostDaysTerm)
    : (cargo?.financialCostDaysTerm !== undefined && cargo.financialCostDaysTerm !== null
        ? Number(cargo.financialCostDaysTerm)
        : 30);

  const financialCostBaseDays = cargo?.financialCostBaseDays || 30;

  const financialCostEffectiveRate = shipment.financialCostRate !== undefined && shipment.financialCostRate !== null
    ? Number(shipment.financialCostRate)
    : (cargo?.financialCostEffectiveRate !== undefined && cargo.financialCostEffectiveRate !== null
        ? Number(cargo.financialCostEffectiveRate)
        : (financialCostBaseDays > 0 ? Number(((financialCostMonthlyRate * financialCostDaysTerm) / financialCostBaseDays).toFixed(4)) : 0));

  const calculatedFinancialCost = (financialCostEffectiveRate > 0 && cteGrossFreight > 0)
    ? Number((cteGrossFreight * (financialCostEffectiveRate / 100)).toFixed(2))
    : 0;

  const financialCostValue = calculatedFinancialCost > 0
    ? calculatedFinancialCost
    : ((shipment.financialCostValue !== undefined && shipment.financialCostValue !== null && Number(shipment.financialCostValue) > 0)
        ? Number(shipment.financialCostValue)
        : (isCargoFinActive ? calculatedFinancialCost : 0));

  // 15. Deduções Operacionais Base (sem comissão de agência)
  // Nota: Custo Adicional / Prejuízo agora é informativo e não afeta o cálculo do Lucro Líquido Real
  const totalBaseDeductionsWithoutAgency = Number((
    impostoFederalLiquido +
    totalStayFederalTax +
    icms +
    totalStayIcms +
    riskCost +
    seguroRcv +
    totalSeguroAcidenteRoubo +
    ciotValue +
    custoFixoValue +
    inssPatronalMotorista +
    salespersonCommission +
    comissaoComercial +
    totalDriverFreight +
    shipperCommissionValue +
    financialCostValue
  ).toFixed(2));

  // Lucro Operacional antes da comissão de agência
  const operationalProfitBeforeAgency = Number((totalCompanyFreight - totalBaseDeductionsWithoutAgency).toFixed(2));

  // 14.5 Comissão de Agência: configurada sobre o Lucro Líquido Real da operação
  const agencyCommissionValue = (agencyCommEnabled && operationalProfitBeforeAgency > 0)
    ? Number((operationalProfitBeforeAgency * (effectiveAgencyPercentage / 100)).toFixed(2))
    : 0;

  // Total Geral de Deduções com Estadias e Novos Módulos
  const totalDeducoesWithStay = Number((totalBaseDeductionsWithoutAgency + agencyCommissionValue).toFixed(2));

  // Lucro Líquido Real Final da Operação
  const totalRealProfit = Number((totalCompanyFreight - totalDeducoesWithStay).toFixed(2));
  const marginPercent = cteGrossFreight > 0 ? ((totalRealProfit / cteGrossFreight) * 100).toFixed(1) : '0.0';
  const totalMarginPercent = totalCompanyFreight > 0 ? ((totalRealProfit / totalCompanyFreight) * 100).toFixed(1) : '0.0';
  const realProfit = totalRealProfit;

  if (isRestrictedProfile) {
    return null;
  }

  return (
    <div className="w-full bg-slate-50/70 dark:bg-slate-900/60 rounded-2xl border border-slate-200/90 dark:border-slate-800 p-3 sm:p-4 shadow-xs text-slate-800 dark:text-slate-100 font-sans space-y-3.5">
      
      {/* Cabeçalho Principal */}
      <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-slate-200/80 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 rounded-lg">
            <Calculator className="w-3.5 h-3.5" />
          </div>
          <div>
            <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white uppercase tracking-tight flex items-center gap-1.5 flex-wrap">
              <span>Automatização do CT-e</span>
              <span className="text-[9px] font-semibold px-1.5 py-0.2 rounded bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-300 border border-blue-200/60 dark:border-blue-800/60">
                Custos & Margem
              </span>
              {isExportCargo ? (
                <span className="text-[9px] font-semibold px-1.5 py-0.2 rounded bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 border border-blue-300 dark:border-blue-700">
                  Exportação
                </span>
              ) : (
                <span className="text-[9px] font-semibold px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                  Mercado Interno
                </span>
              )}
            </h4>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500 italic flex items-center gap-1 shrink-0">
            <Info className="w-3 h-3" />
            Visualização
          </span>
        </div>
      </div>

      {/* Barra Compacta de Enquadramento Fiscal */}
      <div className="bg-white dark:bg-slate-800/95 rounded-xl border border-slate-200/90 dark:border-slate-700/80 p-2.5 shadow-2xs space-y-1.5">
        <div className="flex items-center justify-between gap-1.5">
          <div className="flex items-center gap-1.5 min-w-0">
            <Building2 className={`w-3.5 h-3.5 shrink-0 ${
              isSimplesNacional ? 'text-purple-600' : isShipmentPf ? 'text-orange-500' : 'text-blue-600'
            }`} />
            <span className="text-[11px] font-bold text-slate-800 dark:text-slate-100 uppercase tracking-tight truncate">
              Regime Tributário
            </span>
          </div>
          <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded shrink-0 ${
            isSimplesNacional
              ? 'bg-purple-50 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300'
              : isShipmentPf
                ? 'bg-orange-50 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300'
                : 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
          }`}>
            {justSaved ? '✔ Salvo!' : selectedRegime}
          </span>
        </div>

        {/* Linha com Select e Botão Salvar perfeitamente dimensionados */}
        <div className="flex items-center gap-1.5">
          <select
            value={selectedRegime}
            onChange={(e) => setSelectedRegime(e.target.value)}
            disabled={isSavingRegime || isDemo}
            className={`flex-1 min-w-0 text-xs font-semibold rounded-lg px-2 py-1.5 border outline-hidden transition-all ${isDemo ? 'cursor-not-allowed opacity-80' : 'cursor-pointer'} truncate ${
              isSimplesNacional
                ? 'bg-purple-50/70 text-purple-900 border-purple-300 dark:bg-purple-950/50 dark:text-purple-200 dark:border-purple-800'
                : isShipmentPf
                  ? 'bg-orange-50/70 text-orange-900 border-orange-300 dark:bg-orange-950/50 dark:text-orange-200 dark:border-orange-800'
                  : 'bg-blue-50/70 text-blue-900 border-blue-300 dark:bg-blue-950/50 dark:text-blue-200 dark:border-blue-800'
            }`}
          >
            <option value="Simples Nacional">🟣 Simples Nacional (3,40% s/ Frete Bruto)</option>
            <option value="Lucro Real / Presumido">🔵 Lucro Real / Presumido (9,25% s/ Spread)</option>
            <option value="PF">🟠 Pessoa Física / TAC (3,655% s/ Líq. + 4% CPRB)</option>
            <option value="MEI">🟢 MEI (Simples Nacional - 3,40%)</option>
          </select>

          {!isDemo && (
            <button
              type="button"
              onClick={handleSaveRegime}
              disabled={isSavingRegime}
              className="inline-flex items-center justify-center gap-1 px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 text-white text-xs font-bold rounded-lg shadow-xs transition-all shrink-0 cursor-pointer"
              title="Salvar regime tributário no banco de dados e registrar histórico"
            >
              {isSavingRegime ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              <span>Salvar</span>
            </button>
          )}
        </div>

        <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
          {isSimplesNacional 
            ? 'Simples Nacional: 3,40% sobre Frete Empresa Bruto' 
            : isShipmentPf 
              ? 'PF / TAC: 3,655% s/ Frete Líquido + 4% CPRB' 
              : 'Regime Normal: 9,25% s/ Spread Comercial'}
        </p>
      </div>

      {/* SEÇÃO DE ESTADIAS / CT-E COMPLEMENTAR (Exibida quando houver estadias vinculadas ao embarque) */}
      {hasStays && (
        <div className="bg-gradient-to-r from-amber-500/10 via-orange-500/5 to-amber-500/10 dark:from-amber-950/40 dark:via-orange-950/20 dark:to-amber-950/40 rounded-xl border border-amber-300 dark:border-amber-700/70 p-3 shadow-xs space-y-2.5">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-amber-500 text-white rounded-lg shadow-2xs">
                <Clock className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs font-bold text-amber-950 dark:text-amber-200 uppercase tracking-tight">
                    Estadia Vinculada (CT-e Complementar)
                  </span>
                  <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-200/80 dark:bg-amber-900 text-amber-900 dark:text-amber-200 border border-amber-300 dark:border-amber-700">
                    {shipmentStays.length} {shipmentStays.length === 1 ? 'registro' : 'registros'}
                  </span>
                </div>
                <p className="text-[10px] text-amber-800 dark:text-amber-300">
                  Estadia faturada ao cliente e repassada ao motorista integrada aos cálculos
                </p>
              </div>
            </div>
          </div>

          {/* Resumo Financeiro da Estadia */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {/* Faturado Cliente */}
            <div className="bg-white/90 dark:bg-slate-800/90 rounded-lg p-2 border border-amber-200/80 dark:border-amber-800/60 shadow-2xs">
              <div className="text-[9px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-tight">
                Faturado Cliente (CT-e Comp.)
              </div>
              <div className="text-xs sm:text-sm font-bold text-amber-700 dark:text-amber-300 font-mono">
                + {formatBrl(demurrageRevenue)}
              </div>
            </div>

            {/* Repasse Motorista */}
            <div className="bg-white/90 dark:bg-slate-800/90 rounded-lg p-2 border border-amber-200/80 dark:border-amber-800/60 shadow-2xs">
              <div className="text-[9px] font-semibold text-rose-500 dark:text-rose-400 uppercase tracking-tight">
                Pago ao Motorista
              </div>
              <div className="text-xs sm:text-sm font-bold text-rose-600 dark:text-rose-400 font-mono">
                - {formatBrl(demurrageDriverPaid)}
              </div>
            </div>

            {/* Margem / Lucro da Estadia */}
            <div className="bg-white/90 dark:bg-slate-800/90 rounded-lg p-2 border border-emerald-200/80 dark:border-emerald-800/60 shadow-2xs">
              <div className="text-[9px] font-semibold text-emerald-700 dark:text-emerald-300 uppercase tracking-tight">
                Resultado Estadia
              </div>
              <div className="text-xs sm:text-sm font-bold text-emerald-700 dark:text-emerald-300 font-mono">
                {demurrageProfit >= 0 ? `+ ${formatBrl(demurrageProfit)}` : formatBrl(demurrageProfit)}
              </div>
            </div>
          </div>

          {/* Lista detalhada das estadias vinculadas */}
          <div className="space-y-1 pt-1 border-t border-amber-200/60 dark:border-amber-800/40">
            {shipmentStays.map((stay, idx) => (
              <div key={stay.id || idx} className="bg-white/80 dark:bg-slate-800/70 rounded-lg p-1.5 sm:p-2 border border-amber-100 dark:border-amber-900/40 flex items-center justify-between gap-2 text-[10px] flex-wrap">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-mono font-bold text-slate-700 dark:text-slate-200">
                    {stay.entryDate ? new Date(stay.entryDate).toLocaleDateString('pt-BR') : stay.date ? new Date(stay.date).toLocaleDateString('pt-BR') : 'Data n/d'}
                  </span>
                  {stay.invoice && (
                    <span className="px-1 py-0.2 rounded bg-slate-100 dark:bg-slate-700 font-mono text-slate-600 dark:text-slate-300">
                      NF: {stay.invoice}
                    </span>
                  )}
                  <span className="text-slate-600 dark:text-slate-300">
                    {stay.driver} • <strong className="font-mono">{stay.plate}</strong>
                  </span>
                  {stay.totalHours ? (
                    <span className="text-slate-500 dark:text-slate-400">
                      ({stay.totalHours}h)
                    </span>
                  ) : null}
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-amber-700 dark:text-amber-300 font-mono font-semibold" title="Valor aprovado cliente">
                    Cli: {formatBrl(stay.approvedValue || 0)}
                  </span>
                  <span className="text-rose-600 dark:text-rose-400 font-mono font-semibold" title="Valor pago motorista">
                    Mot: {formatBrl(stay.driverPaidValue || 0)}
                  </span>
                  {stay.cteUrl && (
                    <a
                      href={stay.cteUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-0.5 text-blue-600 dark:text-blue-400 hover:underline font-semibold"
                    >
                      <FileText className="w-3 h-3" />
                      CT-e
                    </a>
                  )}
                  {stay.paymentProofUrl && (
                    <a
                      href={stay.paymentProofUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400 hover:underline font-semibold"
                    >
                      <ExternalLink className="w-3 h-3" />
                      Recibo
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* LINHA 1: Cards Principais de Receita & Bases */}
      <div className={`grid grid-cols-1 ${isAgenciador ? 'sm:grid-cols-2' : 'sm:grid-cols-3'} gap-2`}>
        {/* Box 1: CTe Frete Bruto */}
        <div className="bg-white dark:bg-slate-800/90 rounded-xl border border-blue-100 dark:border-blue-900/40 p-2.5 shadow-2xs">
          <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-0.5">
            <span className="uppercase tracking-wider">CT-e Frete Bruto</span>
            <Receipt className="w-3 h-3 text-blue-600 dark:text-blue-400 shrink-0" />
          </div>
          <div className="text-sm sm:text-base font-bold text-slate-900 dark:text-white font-mono">
            {formatBrl(totalCompanyFreight)}
          </div>
          {autoCteServiceTotal !== undefined && Math.abs(autoCteServiceTotal - totalCompanyFreight) > 1.00 && (
            <div className="mt-1 flex items-center gap-1 text-[10px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-1.5 py-0.5 rounded border border-amber-200 dark:border-amber-800" title="Regra: VALOR TOTAL DO SERVIÇO - CTE precisa ser igual ao Total Frete Emp do sistema.">
              <AlertTriangle className="w-3 h-3 shrink-0" />
              <span>Divergência CT-e: {formatBrl(autoCteServiceTotal)}</span>
            </div>
          )}
          <div className="text-[10px] text-blue-600 dark:text-blue-400 font-medium truncate mt-0.5" title={demurrageRevenue > 0 ? `Frete Base: ${formatBrl(cteGrossFreight)} + Estadia: ${formatBrl(demurrageRevenue)}` : undefined}>
            Empresa • {tonnage.toLocaleString('pt-BR')} ton
            {demurrageRevenue > 0 && (
              <span className="text-amber-600 dark:text-amber-400 font-semibold ml-1">
                (+{formatBrl(demurrageRevenue)} estadia)
              </span>
            )}
          </div>
        </div>

        {/* Box 2: Valor NF (Valor da Mercadoria / Carga do CT-e) & Base de Seguro (+18%) */}
        <div className={`p-2.5 bg-white dark:bg-slate-800/90 rounded-xl border ${
          isEditingInvoiceValue
            ? 'border-indigo-500 ring-2 ring-indigo-500/20 shadow-md'
            : 'border-indigo-100 dark:border-indigo-900/40 shadow-2xs'
        } flex flex-col justify-between transition-all`}>
          <div>
            <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-0.5">
              <span className="uppercase tracking-wider">Valor NF</span>
              <div className="flex items-center gap-1">
                {justSavedInvoiceValue && (
                  <span className="text-[7px] font-bold px-1 py-0.2 rounded bg-indigo-100 text-indigo-800 dark:bg-indigo-950/80 dark:text-indigo-300 animate-pulse">
                    ✔ Salvo!
                  </span>
                )}
                <ShieldCheck className="w-3 h-3 text-indigo-600 dark:text-indigo-400 shrink-0" />
                {!isEditingInvoiceValue && !isDemo && (
                  <button
                    type="button"
                    onClick={handleStartEditInvoiceValue}
                    className="p-0.5 text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 rounded transition-all cursor-pointer"
                    title="Editar valor da NF manualmente"
                  >
                    <Pencil className="w-2.5 h-2.5" />
                  </button>
                )}
              </div>
            </div>

            {isEditingInvoiceValue ? (
              <div className="space-y-1 py-0.5">
                <div className="flex items-center gap-1">
                  <span className="text-[10px] font-mono font-bold text-slate-500 dark:text-slate-400">R$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    autoFocus
                    placeholder="0,00"
                    value={invoiceValueInput}
                    onChange={(e) => setInvoiceValueInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveInvoiceValue();
                      if (e.key === 'Escape') setIsEditingInvoiceValue(false);
                    }}
                    disabled={isSavingInvoiceValue}
                    className="w-full text-xs font-bold font-mono px-1.5 py-0.5 rounded border border-indigo-400 bg-indigo-50/40 dark:bg-slate-700 dark:border-indigo-500 text-slate-800 dark:text-white outline-hidden focus:ring-1 focus:ring-indigo-500/40"
                  />
                </div>
                
                <div className="flex items-center justify-between gap-1 pt-0.5">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={handleSaveInvoiceValue}
                      disabled={isSavingInvoiceValue}
                      className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-indigo-600 hover:bg-indigo-700 text-white text-[9px] font-bold rounded shadow-2xs transition-all cursor-pointer disabled:opacity-50"
                      title="Salvar valor da NF"
                    >
                      {isSavingInvoiceValue ? <RefreshCw className="w-2 h-2 animate-spin" /> : <Check className="w-2 h-2" />}
                      <span>Salvar</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsEditingInvoiceValue(false)}
                      disabled={isSavingInvoiceValue}
                      className="px-1 py-0.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300 text-[9px] font-medium rounded transition-all cursor-pointer"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-sm sm:text-base font-bold text-slate-900 dark:text-white font-mono leading-tight">
                {formatBrl(invoiceValue)}
              </div>
            )}
          </div>
          <div className="mt-1 pt-1 border-t border-indigo-50 dark:border-indigo-950/60" title={`Base de cálculo do seguro averbado: Valor da NF (${formatBrl(invoiceValue)})${isExportCargo ? ' + 18% (Exportação)' : ' (Mercado Interno)'} = ${formatBrl(insuranceBaseValue)}`}>
            <div className="text-[9px] text-slate-400 dark:text-slate-500 leading-tight">
              Base Seguro {isExportCargo ? '(+18% Exp.)' : '(NF)'}:
            </div>
            <div className="text-[11px] font-mono font-bold text-indigo-700 dark:text-indigo-300 leading-tight">
              {formatBrl(insuranceBaseValue)}
            </div>
          </div>
        </div>

        {/* Box 3: Crédito Gerado (Informativo Fiscal - Gerado apenas se for Exportação - Oculto para Agenciador) */}
        {!isAgenciador && (
          <div className={`p-2.5 bg-white dark:bg-slate-800/90 rounded-xl border ${
            isEditingGeneratedCredit
              ? 'border-emerald-500 ring-2 ring-emerald-500/20 shadow-md'
              : isGeneratedCreditCustom
                ? 'border-emerald-300 dark:border-emerald-700/80 shadow-2xs'
                : isExportCargo 
                  ? 'border-emerald-200 dark:border-emerald-900/40 shadow-2xs' 
                  : 'border-slate-200 dark:border-slate-800 opacity-80 shadow-2xs'
          } flex flex-col justify-between transition-all relative`}>
            <div className="flex items-center justify-between gap-1 mb-0.5">
              <div className="flex items-center gap-1 min-w-0">
                <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider truncate">Crédito Gerado</span>
                {isGeneratedCreditCustom && (
                  <span className="text-[7px] font-bold px-1 py-0.2 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 shrink-0">
                    Manual
                  </span>
                )}
                {justSavedGeneratedCredit && (
                  <span className="text-[7px] font-bold px-1 py-0.2 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 shrink-0 animate-pulse">
                    ✔ Salvo!
                  </span>
                )}
              </div>
              
              <div className="flex items-center gap-0.5 shrink-0">
                <span className="text-[9px] font-medium px-1.5 py-0.2 rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/60">
                  Informativo
                </span>

                {!isEditingGeneratedCredit && (
                  <button
                    type="button"
                    onClick={handleStartEditGeneratedCredit}
                    className="p-0.5 text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 rounded transition-all cursor-pointer"
                    title="Editar valor do Crédito Gerado"
                  >
                    <Pencil className="w-2.5 h-2.5" />
                  </button>
                )}
              </div>
            </div>

            {isEditingGeneratedCredit ? (
              <div className="space-y-1 py-0.5">
                <div className="flex items-center gap-1">
                  <span className="text-[10px] font-mono font-bold text-slate-500 dark:text-slate-400">R$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    autoFocus
                    placeholder="0,00"
                    value={generatedCreditInput}
                    onChange={(e) => setGeneratedCreditInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveGeneratedCredit();
                      if (e.key === 'Escape') setIsEditingGeneratedCredit(false);
                    }}
                    disabled={isSavingGeneratedCredit}
                    className="w-full text-xs font-bold font-mono px-1.5 py-0.5 rounded border border-emerald-400 bg-emerald-50/40 dark:bg-slate-700 dark:border-emerald-500 text-slate-800 dark:text-white outline-hidden focus:ring-1 focus:ring-emerald-500/40"
                  />
                </div>
                
                <div className="flex items-center justify-between gap-1 pt-0.5">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={handleSaveGeneratedCredit}
                      disabled={isSavingGeneratedCredit}
                      className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[9px] font-bold rounded shadow-2xs transition-all cursor-pointer disabled:opacity-50"
                      title="Salvar valor do Crédito Gerado"
                    >
                      {isSavingGeneratedCredit ? <RefreshCw className="w-2 h-2 animate-spin" /> : <Check className="w-2 h-2" />}
                      <span>Salvar</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsEditingGeneratedCredit(false)}
                      disabled={isSavingGeneratedCredit}
                      className="px-1 py-0.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300 text-[9px] font-medium rounded transition-all cursor-pointer"
                      title="Cancelar"
                    >
                      <X className="w-2 h-2" />
                    </button>
                  </div>

                  {isGeneratedCreditCustom && (
                    <button
                      type="button"
                      onClick={handleRestoreDefaultGeneratedCredit}
                      disabled={isSavingGeneratedCredit}
                      className="inline-flex items-center gap-0.5 text-[8px] text-slate-500 hover:text-emerald-600 dark:text-slate-400 dark:hover:text-emerald-400 underline transition-all cursor-pointer"
                      title="Restaurar fórmula de cálculo automático"
                    >
                      <RotateCcw className="w-2 h-2" />
                      <span>Auto</span>
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <>
                <div className={`text-sm sm:text-base font-bold font-mono ${
                  isExportCargo || isGeneratedCreditCustom ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'
                }`}>
                  {formatBrl(pisCofinsCredit)}
                </div>
                <div className="flex items-center justify-between">
                  <div 
                    className={`text-[10px] font-medium truncate ${
                      isExportCargo || isGeneratedCreditCustom ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400 dark:text-slate-500'
                    }`} 
                    title={
                      isGeneratedCreditCustom
                        ? `Valor manual informado: ${formatBrl(pisCofinsCredit)} (Cálculo padrão: ${creditRatePercentLabel})`
                        : (isExportCargo ? `Exportação PJ • Crédito Fiscal PIS/COFINS informativo (${formatBrl(pisCofinsCredit)})` : 'Gera crédito fiscal apenas quando a carga for de exportação')
                    }
                  >
                    {isGeneratedCreditCustom ? 'Valor Manual' : (isExportCargo ? `${creditRatePercentLabel} (Info)` : 'Apenas Exportação')}
                  </div>
                  <button
                    type="button"
                    onClick={handleStartEditGeneratedCredit}
                    className="text-[8px] text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer flex items-center gap-0.5 font-medium ml-1 shrink-0"
                    title="Editar valor manualmente"
                  >
                    <Pencil className="w-2 h-2" />
                    Editar
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Box de Destaque: Diferença de Frete (Passo 3: Frete_Liquido - Frete_Motorista) */}
      <div className="bg-white dark:bg-slate-800/90 rounded-xl border border-blue-200/80 dark:border-blue-800/60 p-2.5 shadow-2xs space-y-2">
        {/* Cabeçalho da Diferença de Frete */}
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-700/60 pb-1.5">
          <div className="flex items-center gap-1.5">
            <span className="text-xs">💡</span>
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-800 dark:text-slate-100">
              Diferença de Frete
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-slate-400 font-medium">Margem:</span>
            <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200/60 dark:border-blue-800/60">
              {margemFretePercentWithStay}%
            </span>
          </div>
        </div>

        {/* Grade da Equação: Frete Líquido - Frete Motorista = Diferença */}
        <div className="grid grid-cols-3 gap-1.5 items-center text-center">
          {/* Frete Líquido */}
          <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-1.5 border border-slate-100 dark:border-slate-800">
            <div className="text-[9px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-tight truncate">
              Frete Líquido
            </div>
            <div className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white font-mono truncate" title={`Frete Bruto ${formatBrl(totalCompanyFreight)} - ICMS ${formatBrl(icmsBruto)}`}>
              {formatBrl(freteLiquidoIcmsWithStay)}
            </div>
            {demurrageRevenue > 0 && (
              <div className="text-[8px] text-slate-400 dark:text-slate-500 truncate">
                Base {formatBrl(freteLiquidoIcms)} + Est. {formatBrl(demurrageRevenue)}
              </div>
            )}
          </div>

          {/* Frete Motorista */}
          <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-1.5 border border-slate-100 dark:border-slate-800 relative">
            <span className="absolute -left-1.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs pointer-events-none select-none">−</span>
            <div className="text-[9px] font-semibold text-rose-500 uppercase tracking-tight truncate">
              Frete Motorista
            </div>
            <div className="text-xs sm:text-sm font-bold text-rose-600 dark:text-rose-400 font-mono truncate" title={demurrageDriverPaid > 0 ? `Base: ${formatBrl(driverFreight)} + Estadia: ${formatBrl(demurrageDriverPaid)}` : 'Frete contratado do motorista'}>
              {formatBrl(totalDriverFreight)}
            </div>
            {toll > 0 ? (
              <div className="text-[8px] text-rose-500/90 dark:text-rose-400/90 font-medium truncate" title={`Frete Motorista deduzindo pedágio (${formatBrl(totalDriverFreight)} - ${formatBrl(toll)} = ${formatBrl(Math.max(0, totalDriverFreight - toll))})`}>
                Líq. Ped: {formatBrl(Math.max(0, totalDriverFreight - toll))}
              </div>
            ) : demurrageDriverPaid > 0 ? (
              <div className="text-[8px] text-rose-400 dark:text-rose-500 truncate">
                Base {formatBrl(driverFreight)} + Est. {formatBrl(demurrageDriverPaid)}
              </div>
            ) : null}
            <span className="absolute -right-1.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs pointer-events-none select-none">=</span>
          </div>

          {/* Diferença R$ */}
          <div className="bg-emerald-50/80 dark:bg-emerald-950/40 rounded-lg p-1.5 border border-emerald-200/80 dark:border-emerald-800/60">
            <div className="text-[9px] font-semibold text-emerald-700 dark:text-emerald-300 uppercase tracking-tight truncate">
              Diferença R$
            </div>
            <div className="text-xs sm:text-sm font-bold text-emerald-700 dark:text-emerald-300 font-mono truncate">
              {formatBrl(totalDiferencaFreteReais)}
            </div>
            {demurrageProfit !== 0 && (
              <div className="text-[8px] text-emerald-600 dark:text-emerald-400 truncate">
                Margem Estadia: {formatBrl(demurrageProfit)}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* LINHA 2: Composição das Deduções & Custos (Grid 2 Colunas) - Oculto para Embarcador e Agenciador */}
      {!isEmbarcadorOrAgenciador && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider px-0.5">
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5">
                <Layers className="w-3 h-3 text-slate-400" />
                Composição das Deduções
              </span>
              <button
                type="button"
                onClick={() => setShowDeductions(!showDeductions)}
                className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900/60 border border-blue-200/80 dark:border-blue-800/80 rounded-md transition-colors cursor-pointer capitalize shadow-2xs"
                title={showDeductions ? 'Ocultar detalhes das deduções' : 'Exibir detalhes das deduções'}
              >
                {showDeductions ? (
                  <>
                    <EyeOff className="w-3 h-3" />
                    <span>Ocultar</span>
                    <ChevronUp className="w-2.5 h-2.5" />
                  </>
                ) : (
                  <>
                    <Eye className="w-3 h-3" />
                    <span>Exibir</span>
                    <ChevronDown className="w-2.5 h-2.5" />
                  </>
                )}
              </button>
            </div>
            <span className="text-[10px] font-normal text-slate-400 lowercase">
              total descontos: <strong className="font-mono text-rose-600 dark:text-rose-400 font-bold">{formatBrl(totalDeducoesWithStay)}</strong>
            </span>
          </div>

          {showDeductions && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1.5">
            
            {/* Imposto Federal (Simples Nacional 3,40% / PIS/COFINS / Contribuições Federais) */}
            <div className={`p-2 bg-white dark:bg-slate-800/80 rounded-lg border ${
              isEditingFederalTax
                ? 'border-blue-500 ring-2 ring-blue-500/20 shadow-md'
                : isFederalTaxCustom
                  ? 'border-amber-300 dark:border-amber-700/80 shadow-2xs'
                  : 'border-slate-200/90 dark:border-slate-700/80 shadow-2xs'
            } flex flex-col justify-between transition-all relative`}>
              <div className="flex items-center justify-between gap-1 mb-0.5">
                <div className="flex items-center gap-1 min-w-0">
                  <span className="text-[10px] font-semibold text-slate-700 dark:text-slate-200 truncate">Imposto Federal</span>
                  {isFederalTaxCustom && (
                    <span className="text-[7px] font-bold px-1 py-0.2 rounded bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 shrink-0">
                      Manual
                    </span>
                  )}
                  {justSavedFederalTax && (
                    <span className="text-[7px] font-bold px-1 py-0.2 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 shrink-0 animate-pulse">
                      ✔ Salvo!
                    </span>
                  )}
                </div>
                
                <div className="flex items-center gap-0.5 shrink-0">
                  <span className={`text-[8px] font-medium px-1 py-0.2 rounded ${
                    isExportCargo
                      ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300' 
                      : isSimplesNacional
                        ? 'bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300'
                        : 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300'
                  } max-w-[95px] truncate`} title={
                    isFederalTaxCustom
                      ? `Valor manual informado: ${formatBrl(impostoFederalLiquido)} (Base cálculo: ${isExportCargo ? 'Exportação' : (isSimplesNacional ? 'Simples Nacional 3,40%' : (isShipmentPf ? 'PF 3,655%' : 'PJ Spread 9,25%'))})`
                      : isExportCargo 
                        ? 'Exportação: Isenção / Alíquota zero de PIS/COFINS na saída' 
                        : isSimplesNacional
                          ? `Simples Nacional (Anexo III): 3,40% sobre Frete Empresa Bruto (${formatBrl(cteGrossFreight)})`
                          : (isShipmentPf ? `PF Mercado Interno: 3,655% sobre Frete Líquido (${formatBrl(freteLiquidoIcms)})` : `PJ Mercado Interno: 9,25% sobre o Spread Comercial / Diferença (${formatBrl(diferencaFreteReais)})`)
                  }>
                    {isExportCargo ? 'Exportação' : (isSimplesNacional ? '3,40% Simples' : (isShipmentPf ? '3,655% PF' : '9,25% Spread'))}
                  </span>

                  {!isEditingFederalTax && !isDemo && (
                    <button
                      type="button"
                      onClick={handleStartEditFederalTax}
                      className="p-0.5 text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950/50 rounded transition-all cursor-pointer"
                      title="Editar valor do Imposto Federal"
                    >
                      <Pencil className="w-2.5 h-2.5" />
                    </button>
                  )}
                </div>
              </div>

              {isEditingFederalTax ? (
                <div className="space-y-1 py-0.5">
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] font-mono font-bold text-slate-500 dark:text-slate-400">R$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      autoFocus
                      placeholder="0,00"
                      value={federalTaxInput}
                      onChange={(e) => setFederalTaxInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveFederalTax();
                        if (e.key === 'Escape') setIsEditingFederalTax(false);
                      }}
                      disabled={isSavingFederalTax}
                      className="w-full text-xs font-bold font-mono px-1.5 py-0.5 rounded border border-blue-400 bg-blue-50/40 dark:bg-slate-700 dark:border-blue-500 text-slate-800 dark:text-white outline-hidden focus:ring-1 focus:ring-blue-500/40"
                    />
                  </div>
                  
                  <div className="flex items-center justify-between gap-1 pt-0.5">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={handleSaveFederalTax}
                        disabled={isSavingFederalTax}
                        className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-blue-600 hover:bg-blue-700 text-white text-[9px] font-bold rounded shadow-2xs transition-all cursor-pointer disabled:opacity-50"
                        title="Salvar valor do Imposto Federal"
                      >
                        {isSavingFederalTax ? <RefreshCw className="w-2 h-2 animate-spin" /> : <Check className="w-2 h-2" />}
                        <span>Salvar</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsEditingFederalTax(false)}
                        disabled={isSavingFederalTax}
                        className="px-1 py-0.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300 text-[9px] font-medium rounded transition-all cursor-pointer"
                        title="Cancelar"
                      >
                        <X className="w-2 h-2" />
                      </button>
                    </div>

                    {isFederalTaxCustom && (
                      <button
                        type="button"
                        onClick={handleRestoreDefaultFederalTax}
                        disabled={isSavingFederalTax}
                        className="inline-flex items-center gap-0.5 text-[8px] text-slate-500 hover:text-amber-600 dark:text-slate-400 dark:hover:text-amber-400 underline transition-all cursor-pointer"
                        title="Restaurar fórmula de cálculo automático"
                      >
                        <RotateCcw className="w-2 h-2" />
                        <span>Auto</span>
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-baseline justify-between gap-1">
                    <div className={`text-xs font-bold font-mono ${totalImpostoFederal > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-500 dark:text-slate-400'}`}>
                      {totalImpostoFederal > 0 ? `- ${formatBrl(totalImpostoFederal)}` : 'R$ 0,00'}
                    </div>
                    {!isDemo && (
                      <button
                        type="button"
                        onClick={handleStartEditFederalTax}
                        className="text-[8px] text-blue-600 dark:text-blue-400 hover:underline cursor-pointer flex items-center gap-0.5 font-medium"
                        title="Editar valor do Imposto Federal"
                      >
                        <Pencil className="w-2 h-2" />
                        <span>editar</span>
                      </button>
                    )}
                  </div>
                  <div className="text-[8px] text-slate-400 dark:text-slate-500 truncate mt-0.5" title={
                    isFederalTaxCustom
                      ? `Valor manual informado: ${formatBrl(impostoFederalLiquido)}. Cálculo automático sugerido: ${formatBrl(isSimplesNacional ? impostoFederalSimples : (isShipmentPf ? impostoFederalPf : impostoFederalPjSpread))}`
                      : isExportCargo 
                        ? 'Exportação: Receita desonerada de PIS/COFINS' 
                        : isSimplesNacional
                          ? `Simples Nacional: Frete Empresa Bruto ${formatBrl(cteGrossFreight)} • 3,40% = ${formatBrl(impostoFederalSimples)}`
                          : (isShipmentPf ? `PF: Frete Líq. ${formatBrl(freteLiquidoIcms)} • 3,655%` : `PJ: Spread ${formatBrl(diferencaFreteReais)} • 9,25%`)
                  }>
                    {staysWithTaxes.length > 0 
                      ? `CT-e Princ.: ${formatBrl(impostoFederalLiquido)}`
                      : (isFederalTaxCustom
                          ? `Manual (Auto: ${formatBrl(isSimplesNacional ? impostoFederalSimples : (isShipmentPf ? impostoFederalPf : impostoFederalPjSpread))})`
                          : (isExportCargo ? 'Exportação: R$ 0,00' : (isSimplesNacional ? `Simples: ${formatBrl(cteGrossFreight)} • 3,4%` : (isShipmentPf ? `PF: Líq. • 3,655%` : `PJ: Spread • 9,25%`))))}
                  </div>
                </>
              )}

              {staysWithTaxes.map((s, idx) => (
                <div 
                  key={s.id || idx}
                  className="mt-1 pt-1 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between text-[8px]"
                  title={`CT-e Complementar de Estadia (CT-e nº ${s.cteNumber}): ${formatBrl(s.stayFederalVal)}. Total Imposto Federal: ${formatBrl(totalImpostoFederal)}`}
                >
                  <span className="text-slate-500 dark:text-slate-400 font-medium truncate flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0 inline-block"></span>
                    <span>CT-e Comp. Estadia (CT-e nº {s.cteNumber}):</span>
                  </span>
                  <span className={`font-mono font-bold shrink-0 ml-1 ${s.stayFederalVal > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400 dark:text-slate-500'}`}>
                    {formatBrl(s.stayFederalVal)}
                  </span>
                </div>
              ))}
            </div>

            {/* ICMS Destacado Completo */}
            <div className="p-2 bg-white dark:bg-slate-800/80 rounded-lg border border-slate-200/90 dark:border-slate-700/80 shadow-2xs flex flex-col justify-between">
              <div className="flex items-center justify-between gap-1 mb-0.5">
                <span className="text-[10px] font-semibold text-slate-700 dark:text-slate-200 truncate" title="Valor integral do ICMS destacado no CT-e">
                  ICMS Destacado
                </span>
                <span className="text-[8px] font-medium px-1 py-0.2 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 shrink-0" title={`Alíquota de ${icmsPercentage}% destacada no CT-e`}>
                  {icmsPercentage > 0 ? `${icmsPercentage}% CT-e` : 'Isento'}
                </span>
              </div>
              <div className={`text-xs font-bold font-mono ${totalIcms > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-500 dark:text-slate-400'}`}>
                {totalIcms > 0 ? `- ${formatBrl(totalIcms)}` : 'R$ 0,00'}
              </div>
              {(() => {
                const effectiveCteIcms = autoCteIcms !== undefined 
                  ? autoCteIcms 
                  : (Number((shipment.documents as any)?.icms_value) || (shipment.icmsValue !== undefined ? Number(shipment.icmsValue) : undefined));
                if (effectiveCteIcms !== undefined && Math.abs(effectiveCteIcms - icms) > 1.00) {
                  return (
                    <div className="mt-1 flex items-center gap-1 text-[10px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-1.5 py-0.5 rounded border border-amber-200 dark:border-amber-800" title="Divergência entre o ICMS do sistema e o destacado no CT-e">
                      <AlertTriangle className="w-3 h-3 shrink-0" />
                      <span>Divergência CT-e: {formatBrl(effectiveCteIcms)}</span>
                    </div>
                  );
                }
                return null;
              })()}
              {staysWithTaxes.length > 0 ? (
                <div className="text-[8px] text-slate-400 dark:text-slate-500 truncate mt-0.5" title="ICMS destacado no CT-e Principal">
                  {isIcmsExemptExplicit || icmsPercentage === 0 ? 'CT-e Princ.: Isento' : `CT-e Princ.: ${formatBrl(icms)}`}
                </div>
              ) : (icmsBruto > 0 ? (
                <div className="text-[8px] text-slate-400 dark:text-slate-500 truncate mt-0.5" title={`Valor integral do ICMS destacado no CT-e Principal (${icmsPercentage}% s/ ${formatBrl(cteGrossFreight)})`}>
                  Integral ({formatBrl(icmsBruto)})
                </div>
              ) : null)}

              {staysWithTaxes.map((s, idx) => (
                <div 
                  key={s.id || idx}
                  className="mt-1 pt-1 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between text-[8px]" 
                  title={`CT-e Complementar de Estadia (CT-e nº ${s.cteNumber}) (${s.stayIcmsPct}%): ${formatBrl(s.stayIcmsVal)}. Total ICMS: ${formatBrl(totalIcms)}`}
                >
                  <span className="text-slate-500 dark:text-slate-400 font-medium truncate flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0 inline-block"></span>
                    <span>CT-e Comp. Estadia (CT-e nº {s.cteNumber}) ({s.stayIcmsPct}%):</span>
                  </span>
                  <span className={`font-mono font-bold shrink-0 ml-1 ${s.stayIcmsVal > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400 dark:text-slate-500'}`}>
                    {isIcmsExemptExplicit || s.stayIcmsPct === 0 ? 'Isento' : formatBrl(s.stayIcmsVal)}
                  </span>
                </div>
              ))}
            </div>

            {/* Vale-Pedágio: (Informativo da Carta Frete / TAG) */}
            <div className={`p-2 bg-white dark:bg-slate-800/80 rounded-lg border shadow-2xs flex flex-col justify-between transition-all ${
              isEditingToll
                ? 'border-amber-400 dark:border-amber-500 ring-2 ring-amber-400/20'
                : 'border-slate-200/90 dark:border-slate-700/80'
            }`}>
              <div className="flex items-center justify-between gap-1 mb-0.5">
                <span className="text-[10px] font-semibold text-slate-700 dark:text-slate-200 truncate">Vale-Pedágio:</span>
                <span className="text-[8px] font-medium px-1 py-0.2 rounded bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 shrink-0">
                  Informativo
                </span>
              </div>

              {isEditingToll ? (
                <div className="space-y-1.5 mt-0.5 animate-in fade-in duration-150">
                  <div className="relative">
                    <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[9px] font-bold text-slate-400">R$</span>
                    <input
                      type="text"
                      autoFocus
                      placeholder="0,00"
                      value={tollInput}
                      onChange={(e) => setTollInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveCustomToll();
                        if (e.key === 'Escape') setIsEditingToll(false);
                      }}
                      disabled={isSavingToll}
                      className="w-full text-xs font-bold font-mono pl-6 pr-1.5 py-0.5 rounded border border-amber-400 bg-amber-50/40 dark:bg-slate-700 dark:border-amber-500 text-slate-800 dark:text-white outline-hidden focus:ring-1 focus:ring-amber-500/40"
                    />
                  </div>

                  <div className="flex items-center justify-between gap-1">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={handleSaveCustomToll}
                        disabled={isSavingToll}
                        className="inline-flex items-center gap-0.5 px-2 py-0.5 bg-amber-600 hover:bg-amber-700 text-white text-[9px] font-bold rounded shadow-2xs transition-all cursor-pointer disabled:opacity-50"
                        title="Salvar valor do Vale-Pedágio"
                      >
                        {isSavingToll ? <RefreshCw className="w-2.5 h-2.5 animate-spin" /> : <Check className="w-2.5 h-2.5" />}
                        <span>Salvar</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsEditingToll(false)}
                        disabled={isSavingToll}
                        className="px-1.5 py-0.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300 text-[9px] font-medium rounded transition-all cursor-pointer"
                        title="Cancelar"
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </div>

                    {autoToll !== undefined && autoToll > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setTollInput(String(autoToll));
                        }}
                        disabled={isSavingToll}
                        className="text-[8px] font-bold text-amber-700 dark:text-amber-300 hover:underline cursor-pointer"
                        title={`Preencher com o valor do documento (${formatBrl(autoToll)})`}
                      >
                        Usar Doc ({formatBrl(autoToll)})
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-baseline justify-between gap-1">
                    <div className="text-xs font-bold font-mono text-amber-600 dark:text-amber-400">
                      {formatBrl(toll)}
                    </div>
                    {!isDemo && (
                      <button
                        type="button"
                        onClick={handleStartEditToll}
                        className="text-[8px] text-blue-600 dark:text-blue-400 hover:underline cursor-pointer flex items-center gap-0.5 font-medium"
                        title="Editar valor do Vale-Pedágio manualmente"
                      >
                        <Pencil className="w-2 h-2" />
                        <span>editar</span>
                      </button>
                    )}
                  </div>

                  {justSavedToll && (
                    <div className="mt-1 flex items-center gap-1 text-[9px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.5 rounded border border-emerald-200 dark:border-emerald-800 animate-in fade-in">
                      <Check className="w-3 h-3 text-emerald-600" />
                      <span>Valor atualizado</span>
                    </div>
                  )}

                  {autoToll !== undefined && Math.abs(autoToll - toll) > 1.00 && (
                    <div className="mt-1.5 flex flex-col gap-1.5 text-[10px] bg-amber-50 dark:bg-amber-950/40 p-2 rounded-md border border-amber-300 dark:border-amber-700/80 shadow-2xs animate-in fade-in duration-200" title="Divergência entre o Vale-Pedágio do sistema e o documento fiscal">
                      <div className="flex items-center gap-1 font-bold text-amber-700 dark:text-amber-300">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                        <span className="truncate">Divergência Doc: {formatBrl(autoToll)}</span>
                      </div>
                      {!isDemo && (
                        <div className="flex items-center gap-1.5 pt-0.5">
                          <button
                            type="button"
                            onClick={() => handleApplyDocToll(autoToll)}
                            disabled={isSavingToll}
                            className="flex-1 text-[10px] font-bold text-white bg-amber-600 hover:bg-amber-700 active:scale-95 px-2 py-1 rounded shadow-2xs transition-all cursor-pointer flex items-center justify-center gap-1 disabled:opacity-50"
                            title={`Corrigir o Vale-Pedágio para o valor do documento fiscal (${formatBrl(autoToll)})`}
                          >
                            {isSavingToll ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                            <span>Corrigir p/ {formatBrl(autoToll)}</span>
                          </button>
                          <button
                            type="button"
                            onClick={handleStartEditToll}
                            disabled={isSavingToll}
                            className="text-[9px] font-semibold text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-amber-100 dark:hover:bg-amber-900/40 px-1.5 py-1 rounded transition-colors cursor-pointer flex items-center gap-0.5"
                            title="Digitar outro valor manualmente"
                          >
                            <Pencil className="w-2.5 h-2.5" />
                            <span>Outro</span>
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Consulta GR (Modalidade de Consulta Realizada) */}
            <div className="p-2 bg-white dark:bg-slate-800/80 rounded-lg border border-slate-200/90 dark:border-slate-700/80 shadow-2xs flex flex-col justify-between">
              <div className="flex items-center justify-between gap-1 mb-0.5">
                <span className="text-[10px] font-semibold text-slate-700 dark:text-slate-200 truncate">Consulta GR:</span>
                <span className="text-[8px] font-medium px-1 py-0.2 rounded bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 shrink-0 max-w-[95px] truncate" title={effectiveRiskType || 'Pendente de Definição'}>
                  {effectiveRiskType || 'Consulta'}
                </span>
              </div>
              <div className="flex items-baseline justify-between gap-1">
                <div className={`text-xs font-bold font-mono ${riskCost > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-500 dark:text-slate-400'}`}>
                  {riskCost > 0 ? `- ${formatBrl(riskCost)}` : 'R$ 0,00'}
                </div>
                {effectiveReleaseCode ? (
                  <span className="text-[8px] font-mono text-slate-400 dark:text-slate-500 truncate max-w-[70px]" title={`Liberação: ${effectiveReleaseCode}`}>
                    {effectiveReleaseCode}
                  </span>
                ) : null}
              </div>
            </div>

            {/* Seguro RCV */}
            <div className="p-2 bg-white dark:bg-slate-800/80 rounded-lg border border-slate-200/90 dark:border-slate-700/80 shadow-2xs flex flex-col justify-between">
              <div className="flex items-center justify-between gap-1 mb-0.5">
                <span className="text-[10px] font-semibold text-slate-700 dark:text-slate-200 truncate">Seguro RCV</span>
                <span className="text-[8px] font-medium px-1 py-0.2 rounded bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 shrink-0">
                  R$ 5/veíc
                </span>
              </div>
              <div className="text-xs font-bold font-mono text-rose-600 dark:text-rose-400">
                - {formatBrl(seguroRcv)}
              </div>
            </div>

            {/* Seguro Acidente + Roubo */}
            <div className="p-2 bg-white dark:bg-slate-800/80 rounded-lg border border-slate-200/90 dark:border-slate-700/80 shadow-2xs flex flex-col justify-between">
              <div className="flex items-center justify-between gap-1 mb-0.5">
                <span className="text-[10px] font-semibold text-slate-700 dark:text-slate-200 truncate">Acidente + Roubo</span>
                <span className="text-[8px] font-medium px-1 py-0.2 rounded bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 shrink-0" title={`0,0125% Acidente + 0,0125% Roubo = 0,025% sobre a Base de Seguro (${formatBrl(insuranceBaseValue)})${isExportCargo ? ' (NF + 18% para Exportação)' : ' (NF Integral)'}`}>
                  {isExportCargo ? '0,025% Exp' : '0,025% NF'}
                </span>
              </div>
              <div className={`text-xs font-bold font-mono ${totalSeguroAcidenteRoubo > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-500 dark:text-slate-400'}`}>
                {totalSeguroAcidenteRoubo > 0 ? `- ${formatBrl(totalSeguroAcidenteRoubo)}` : 'R$ 0,00'}
              </div>
              {insuranceBaseValue > 0 && (
                <div className="text-[8px] text-slate-400 dark:text-slate-500 truncate mt-0.5" title={`Base de Seguro: ${formatBrl(insuranceBaseValue)}${isExportCargo ? ' (NF + 18%)' : ' (NF)'} x 0,025%`}>
                  Base {formatBrl(insuranceBaseValue)} • 0,025%
                </div>
              )}
            </div>

            {/* CIOT (0,20% sobre o Frete Líquido do Motorista) */}
            <div className="p-2 bg-white dark:bg-slate-800/80 rounded-lg border border-slate-200/90 dark:border-slate-700/80 shadow-2xs flex flex-col justify-between">
              <div className="flex items-center justify-between gap-1 mb-0.5">
                <span className="text-[10px] font-semibold text-slate-700 dark:text-slate-200 truncate">CIOT</span>
                <span 
                  className="text-[8px] font-medium px-1 py-0.2 rounded shrink-0 bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300"
                  title={isShipmentPf ? "0,20% sobre o frete líquido do motorista deduzindo pedágio, INSS e SEST/SENAT (PF)" : "0,20% sobre o frete líquido do motorista abatido o pedágio (PJ)"}
                >
                  {isShipmentPf ? '0,20% Líq. (PF)' : '0,20% Líq. (PJ)'}
                </span>
              </div>
              <div className={`text-xs font-bold font-mono ${
                ciotValue > 0
                  ? 'text-rose-600 dark:text-rose-400'
                  : 'text-slate-500 dark:text-slate-400 font-medium'
              }`}>
                {ciotValue > 0 ? `- ${formatBrl(ciotValue)}` : 'R$ 0,00'}
              </div>
              {driverFreight > 0 && (
                <div 
                  className="text-[8px] text-slate-400 dark:text-slate-500 truncate mt-0.5" 
                  title={
                    isShipmentPf
                      ? `0,20% sobre frete (${formatBrl(driverFreight)}) - pedágio (${formatBrl(toll)}) - INSS (${formatBrl(inssRetidoPf)}) - SEST/SENAT (${formatBrl(sestSenatRetidoPf)}) = Base ${formatBrl(baseCiotFreight)}`
                      : `0,20% sobre frete líquido (${formatBrl(driverFreight)}${toll > 0 ? ` - pedágio (${formatBrl(toll)})` : ''}) = Base ${formatBrl(baseCiotFreight)}`
                  }
                >
                  {isShipmentPf 
                    ? `0,20% s/ Líq. (Mot-Ped-INSS-SEST)` 
                    : (toll > 0 ? `0,20% s/ Mot.-Ped.` : `0,20% s/ Mot.`)}
                </div>
              )}
            </div>

            {/* Custo Fixo */}
            <div className="p-2 bg-white dark:bg-slate-800/80 rounded-lg border border-slate-200/90 dark:border-slate-700/80 shadow-2xs flex flex-col justify-between">
              <div className="flex items-center justify-between gap-1 mb-0.5">
                <span className="text-[10px] font-semibold text-slate-700 dark:text-slate-200 truncate">Custo Fixo</span>
                <span className="text-[8px] font-medium px-1 py-0.2 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 shrink-0">
                  0,35%
                </span>
              </div>
              <div className="text-xs font-bold font-mono text-rose-600 dark:text-rose-400">
                - {formatBrl(custoFixoValue)}
              </div>
            </div>

            {/* INSS Patronal / CPRB (4% s/ (Frete Motorista - Pedágio) em embarques PF, Isento para PJ) */}
            <div className={`p-2 bg-white dark:bg-slate-800/80 rounded-lg border border-slate-200/90 dark:border-slate-700/80 shadow-2xs flex flex-col justify-between ${!isShipmentPf ? 'opacity-90' : ''}`}>
              <div className="flex items-center justify-between gap-1 mb-0.5">
                <span className="text-[10px] font-semibold text-slate-700 dark:text-slate-200 truncate">INSS Patronal / CPRB</span>
                <span className={`text-[8px] font-medium px-1 py-0.2 rounded shrink-0 ${
                  isShipmentPf 
                    ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300' 
                    : 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                }`}>
                  {isShipmentPf ? '4% (PF)' : 'Isento (PJ)'}
                </span>
              </div>
              <div className={`text-xs font-bold font-mono ${
                isShipmentPf && inssPatronalMotorista > 0
                  ? 'text-rose-600 dark:text-rose-400' 
                  : 'text-emerald-600 dark:text-emerald-400 font-medium'
              }`}>
                {isShipmentPf && inssPatronalMotorista > 0 ? `- ${formatBrl(inssPatronalMotorista)}` : 'R$ 0,00'}
              </div>
              {isShipmentPf && inssPatronalMotorista > 0 && (
                <div className="text-[8px] text-slate-400 dark:text-slate-500 truncate mt-0.5" title={`4,00% do INSS Patronal / CPRB sobre o frete motorista líquido de pedágio (${formatBrl(driverFreight)} - ${formatBrl(toll)} = ${formatBrl(baseInssPatronal)})`}>
                  4% s/ Frete Mot. - Pedágio
                </div>
              )}
            </div>

            {/* Comissão Vendedor */}
            <div className={`p-2 bg-white dark:bg-slate-800/80 rounded-lg border border-slate-200/90 dark:border-slate-700/80 shadow-2xs flex flex-col justify-between ${salespersonCommission === 0 ? 'opacity-90' : ''}`}>
              <div className="flex items-center justify-between gap-1 mb-0.5">
                <span className="text-[10px] font-semibold text-slate-700 dark:text-slate-200 truncate" title={salespersonName ? `Vendedor: ${salespersonName}` : 'Comissão Vendedor'}>
                  Comissão Vendedor
                </span>
                <span className={`text-[8px] font-medium px-1 py-0.2 rounded shrink-0 max-w-[95px] truncate ${
                  salespersonCommission > 0 
                    ? 'bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300' 
                    : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                }`} title={salespersonCommission > 0 ? (salespersonName ? `${salespersonName} (R$ ${salespersonRate.toFixed(2)}/t)` : `R$ ${salespersonRate.toFixed(2)}/t`) : 'Sem comissão'}>
                  {salespersonCommission > 0 ? (salespersonName ? `${salespersonName.slice(0, 8)} • R$ ${salespersonRate.toFixed(2)}/t` : `R$ ${salespersonRate.toFixed(2)}/t`) : 'Isento'}
                </span>
              </div>
              <div className={`text-xs font-bold font-mono ${salespersonCommission > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-500 dark:text-slate-400'}`}>
                {salespersonCommission > 0 ? `- ${formatBrl(salespersonCommission)}` : 'R$ 0,00'}
              </div>
              {salespersonCommission > 0 && (
                <div className="text-[8px] text-slate-400 dark:text-slate-500 truncate mt-0.5" title={`${tonnage.toFixed(2)} ton x R$ ${salespersonRate.toFixed(2)}/ton`}>
                  {salespersonName ? `${salespersonName} • ` : ''}{tonnage.toFixed(2)}t x {formatBrl(salespersonRate)}/t
                </div>
              )}
            </div>

            {/* Custo Financeiro (Pro rata s/ Frete Empresa) */}
            <div className={`p-2 bg-white dark:bg-slate-800/80 rounded-lg border border-slate-200/90 dark:border-slate-700/80 shadow-2xs flex flex-col justify-between ${financialCostValue === 0 ? 'opacity-90' : ''}`}>
              <div className="flex items-center justify-between gap-1 mb-0.5">
                <span className="text-[10px] font-semibold text-slate-700 dark:text-slate-200 truncate flex items-center gap-1" title="Custo Financeiro pro rata sobre o Frete Empresa">
                  <Landmark className="w-2.5 h-2.5 text-blue-500 shrink-0" />
                  Custo Financeiro
                </span>
                <span className={`text-[8px] font-medium px-1 py-0.2 rounded shrink-0 max-w-[110px] truncate ${
                  financialCostValue > 0 
                    ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300' 
                    : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                }`} title={financialCostValue > 0 ? `${financialCostEffectiveRate.toFixed(2)}% (${financialCostDaysTerm} dias a ${financialCostMonthlyRate}% a.m.)` : 'Sem custo financeiro'}>
                  {financialCostValue > 0 ? `${financialCostEffectiveRate.toFixed(2)}% (${financialCostDaysTerm}d)` : 'Isento'}
                </span>
              </div>
              <div className={`text-xs font-bold font-mono ${financialCostValue > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-500 dark:text-slate-400'}`}>
                {financialCostValue > 0 ? `- ${formatBrl(financialCostValue)}` : 'R$ 0,00'}
              </div>
              {financialCostValue > 0 && (
                <div className="text-[8px] text-slate-400 dark:text-slate-500 truncate mt-0.5" title={`${financialCostDaysTerm} dias a ${financialCostMonthlyRate}% a.m. (base ${financialCostBaseDays}d) sobre ${formatBrl(cteGrossFreight)}`}>
                  {financialCostDaysTerm}d a {financialCostMonthlyRate}% a.m. s/ {formatBrl(cteGrossFreight)}
                </div>
              )}
            </div>

            {/* Frete Motorista */}
            <div className="p-2 bg-white dark:bg-slate-800/80 rounded-lg border border-slate-200/90 dark:border-slate-700/80 shadow-2xs flex flex-col justify-between">
              <div className="flex items-center justify-between gap-1 mb-0.5">
                <span className="text-[10px] font-semibold text-slate-700 dark:text-slate-200 truncate flex items-center gap-1">
                  <Truck className="w-2.5 h-2.5 text-slate-400 shrink-0" />
                  Frete Motorista
                </span>
                <span className="text-[8px] font-medium px-1 py-0.2 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 shrink-0">
                  R$ {driverRate.toLocaleString('pt-BR')}/t
                </span>
              </div>
              <div className="text-xs font-bold font-mono text-rose-600 dark:text-rose-400">
                - {formatBrl(totalDriverFreight)}
              </div>
              {toll > 0 ? (
                <div className="text-[8px] text-slate-500 dark:text-slate-400 truncate mt-0.5 font-medium" title={`Frete Motorista deduzindo pedágio: ${formatBrl(totalDriverFreight)} - ${formatBrl(toll)} = ${formatBrl(Math.max(0, totalDriverFreight - toll))}`}>
                  Líq. Pedágio: {formatBrl(Math.max(0, totalDriverFreight - toll))}
                </div>
              ) : demurrageDriverPaid > 0 ? (
                <div className="text-[8px] text-slate-400 dark:text-slate-500 truncate mt-0.5" title={`Base: ${formatBrl(driverFreight)} • Estadia: ${formatBrl(demurrageDriverPaid)}`}>
                  Base {formatBrl(driverFreight)} • Est. {formatBrl(demurrageDriverPaid)}
                </div>
              ) : null}
            </div>

            {/* Comissão do Comercial (0,20% sobre o Frete Bruto da Empresa) */}
            <div className={`p-2 bg-white dark:bg-slate-800/80 rounded-lg border border-slate-200/90 dark:border-slate-700/80 shadow-2xs flex flex-col justify-between ${comissaoComercial === 0 ? 'opacity-90' : ''}`}>
              <div className="flex items-center justify-between gap-1 mb-0.5">
                <span className="text-[10px] font-semibold text-slate-700 dark:text-slate-200 truncate">
                  Comissão Comercial
                </span>
                <span className="text-[8px] font-medium px-1 py-0.2 rounded bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 shrink-0" title="0,20% sobre o valor bruto do frete empresa do embarque">
                  0,20%
                </span>
              </div>
              <div className={`text-xs font-bold font-mono ${comissaoComercial > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-500 dark:text-slate-400'}`}>
                {comissaoComercial > 0 ? `- ${formatBrl(comissaoComercial)}` : 'R$ 0,00'}
              </div>
              {cteGrossFreight > 0 && (
                <div className="text-[8px] text-slate-400 dark:text-slate-500 truncate mt-0.5" title={`0,20% sobre Frete Bruto da Empresa (${formatBrl(cteGrossFreight)})`}>
                  0,20% s/ Bruto ({formatBrl(cteGrossFreight)})
                </div>
              )}
            </div>



            {/* 14. Comissionamento de Agência (% sobre Lucro Líquido Real) */}
            <div className={`p-2 bg-white dark:bg-slate-800/80 rounded-lg border ${
              agencyCommEnabled
                ? 'border-purple-300 dark:border-purple-900/60 bg-purple-50/20 dark:bg-purple-950/20'
                : 'border-slate-200/90 dark:border-slate-700/80'
            } shadow-2xs flex flex-col justify-between transition-all relative`}>
              <div className="flex items-center justify-between gap-1 mb-0.5">
                <span className="text-[10px] font-semibold text-slate-700 dark:text-slate-200 truncate flex items-center gap-1" title="Comissão da Agência vinculada ao solicitante (30% sobre Lucro Líquido Real)">
                  <Building2 className={`w-2.5 h-2.5 ${agencyCommEnabled ? 'text-purple-600 dark:text-purple-400' : 'text-slate-400'} shrink-0`} />
                  Comissão Agência
                </span>
                
                {/* Toggle Switch */}
                <button
                  type="button"
                  onClick={handleToggleAgencyCommission}
                  disabled={isSavingAgencyComm || isDemo}
                  className={`relative inline-flex h-4 w-7 shrink-0 ${isDemo ? 'cursor-not-allowed opacity-75' : 'cursor-pointer'} rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden disabled:opacity-50 ${
                    agencyCommEnabled ? 'bg-purple-600' : 'bg-slate-300 dark:bg-slate-600'
                  }`}
                  title={isDemo ? 'Acesso de visualização no modo demonstração' : (agencyCommEnabled ? 'Desativar comissão de agência' : 'Ativar comissão de 30% da agência sobre o Lucro Líquido Real')}
                >
                  <span
                    className={`pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                      agencyCommEnabled ? 'translate-x-3' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-baseline justify-between gap-1">
                <div className={`text-xs font-bold font-mono ${
                  agencyCommEnabled && agencyCommissionValue > 0
                    ? 'text-rose-600 dark:text-rose-400'
                    : 'text-slate-400 dark:text-slate-500 font-medium'
                }`}>
                  {agencyCommEnabled && agencyCommissionValue > 0 ? `- ${formatBrl(agencyCommissionValue)}` : 'R$ 0,00'}
                </div>
                <span className={`text-[8px] font-medium px-1 py-0.2 rounded shrink-0 ${
                  agencyCommEnabled
                    ? 'bg-purple-100 text-purple-800 dark:bg-purple-950/80 dark:text-purple-300'
                    : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
                }`}>
                  {effectiveAgencyPercentage}% {agencyCommEnabled ? 'Ativo' : 'Off'}
                </span>
              </div>

              <div className="text-[8px] text-slate-400 dark:text-slate-500 truncate mt-0.5" title={
                agencyCommEnabled
                  ? `${effectiveAgencyPercentage}% sobre Lucro Real Operacional (${formatBrl(operationalProfitBeforeAgency)}) creditado para ${responsibleAgencyName}`
                  : `Desativado. Quando ativo, debita ${effectiveAgencyPercentage}% do lucro real para a agência (${responsibleAgencyName})`
              }>
                {agencyCommEnabled 
                  ? `${effectiveAgencyPercentage}% s/ Lucro (${responsibleAgencyName})` 
                  : `${effectiveAgencyPercentage}% s/ Lucro • ${responsibleAgencyName}`}
              </div>
            </div>

            {/* 15. Comissionamento do Embarcador (Valor Variável por Tonelada) */}
            <div className={`p-2 bg-white dark:bg-slate-800/80 rounded-lg border ${
              shipperCommEnabled
                ? 'border-blue-300 dark:border-blue-900/60 bg-blue-50/20 dark:bg-blue-950/20'
                : 'border-slate-200/90 dark:border-slate-700/80'
            } shadow-2xs flex flex-col justify-between transition-all relative`}>
              <div className="flex items-center justify-between gap-1 mb-0.5">
                <span className="text-[10px] font-semibold text-slate-700 dark:text-slate-200 truncate flex items-center gap-1" title="Comissão do Embarcador / Cliente por Tonelada">
                  <UserCheck className={`w-2.5 h-2.5 ${shipperCommEnabled ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400'} shrink-0`} />
                  Comissão Embarcador
                </span>

                {/* Toggle Switch */}
                <button
                  type="button"
                  onClick={handleToggleShipperCommission}
                  disabled={isSavingShipperComm || isDemo}
                  className={`relative inline-flex h-4 w-7 shrink-0 ${isDemo ? 'cursor-not-allowed opacity-75' : 'cursor-pointer'} rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden disabled:opacity-50 ${
                    shipperCommEnabled ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-600'
                  }`}
                  title={isDemo ? 'Acesso de visualização no modo demonstração' : (shipperCommEnabled ? 'Desativar comissão do embarcador' : 'Ativar comissão do embarcador por tonelada')}
                >
                  <span
                    className={`pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                      shipperCommEnabled ? 'translate-x-3' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {shipperCommEnabled && isEditingShipperRate ? (
                <div className="space-y-1 py-0.5">
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] font-mono font-bold text-slate-500 dark:text-slate-400">R$/t</span>
                    <input
                      type="number"
                      step="0.50"
                      min="0"
                      autoFocus
                      placeholder="1,00"
                      value={shipperRateInput}
                      onChange={(e) => setShipperRateInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveShipperRate();
                        if (e.key === 'Escape') setIsEditingShipperRate(false);
                      }}
                      disabled={isSavingShipperComm}
                      className="w-full text-xs font-bold font-mono px-1.5 py-0.5 rounded border border-blue-400 bg-blue-50/40 dark:bg-slate-700 dark:border-blue-500 text-slate-800 dark:text-white outline-hidden focus:ring-1 focus:ring-blue-500/40"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-1 pt-0.5">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleSaveShipperRate()}
                        disabled={isSavingShipperComm}
                        className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-blue-600 hover:bg-blue-700 text-white text-[9px] font-bold rounded shadow-2xs transition-all cursor-pointer disabled:opacity-50"
                      >
                        <Check className="w-2 h-2" />
                        <span>Salvar</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsEditingShipperRate(false)}
                        className="px-1 py-0.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-[9px] font-medium rounded transition-all cursor-pointer"
                      >
                        <X className="w-2 h-2" />
                      </button>
                    </div>
                    {/* Presets Rápidos */}
                    <div className="flex items-center gap-0.5">
                      {[1, 2, 3].map(presetVal => (
                        <button
                          key={presetVal}
                          type="button"
                          onClick={() => handleSaveShipperRate(presetVal)}
                          className="px-1 py-0.2 rounded bg-blue-100 hover:bg-blue-200 dark:bg-blue-900/60 dark:hover:bg-blue-800 text-blue-800 dark:text-blue-200 text-[8px] font-bold cursor-pointer"
                        >
                          {presetVal}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-baseline justify-between gap-1">
                    <div className={`text-xs font-bold font-mono ${
                      shipperCommEnabled && shipperCommissionValue > 0
                        ? 'text-rose-600 dark:text-rose-400'
                        : 'text-slate-400 dark:text-slate-500 font-medium'
                    }`}>
                      {shipperCommEnabled && shipperCommissionValue > 0 ? `- ${formatBrl(shipperCommissionValue)}` : 'R$ 0,00'}
                    </div>
                    {shipperCommEnabled && !isDemo && (
                      <button
                        type="button"
                        onClick={() => {
                          setShipperRateInput(String(shipperCommRate));
                          setIsEditingShipperRate(true);
                        }}
                        className="text-[8px] font-bold px-1 py-0.2 rounded bg-blue-50 hover:bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 dark:hover:bg-blue-900/60 border border-blue-200 dark:border-blue-800 shrink-0 cursor-pointer flex items-center gap-0.5"
                        title="Alterar valor da comissão por tonelada"
                      >
                        <span>R$ {shipperCommRate.toFixed(2)}/t</span>
                        <Pencil className="w-2 h-2" />
                      </button>
                    )}
                    {shipperCommEnabled && isDemo && (
                      <span
                        className="text-[8px] font-bold px-1 py-0.2 rounded bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800 shrink-0"
                      >
                        R$ {shipperCommRate.toFixed(2)}/t
                      </span>
                    )}
                  </div>

                  <div className="text-[8px] text-slate-400 dark:text-slate-500 truncate mt-0.5" title={
                    shipperCommEnabled
                      ? `${tonnage.toFixed(2)}t x ${formatBrl(shipperCommRate)}/t = ${formatBrl(shipperCommissionValue)} creditado ao embarcador (${clientBeneficiaryName})`
                      : `Desativado • ${tonnage.toFixed(2)}t (${clientBeneficiaryName})`
                  }>
                    {shipperCommEnabled
                      ? `${tonnage.toFixed(2)}t x ${formatBrl(shipperCommRate)}/t (${clientBeneficiaryName})`
                      : `R$/ton • ${clientBeneficiaryName}`}
                  </div>
                </>
              )}
            </div>

            </div>
          )}
        </div>
      )}

      {/* LINHA 3: Card de Destaque - LUCRO LÍQUIDO REAL */}
      <div>
        <div className={`p-3 sm:p-3.5 rounded-xl border transition-all duration-300 ${
          totalRealProfit >= 0
            ? 'bg-gradient-to-r from-emerald-500/10 via-teal-500/5 to-emerald-500/10 border-emerald-500/30 dark:border-emerald-500/40 shadow-xs'
            : 'bg-gradient-to-r from-rose-500/10 via-red-500/5 to-rose-500/10 border-rose-500/30 dark:border-rose-500/40 shadow-xs'
        }`}>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className={`p-2 rounded-lg shadow-xs shrink-0 ${
                totalRealProfit >= 0 
                  ? 'bg-emerald-600 text-white dark:bg-emerald-500' 
                  : 'bg-rose-600 text-white dark:bg-rose-500'
              }`}>
                <TrendingUp className="w-4 h-4" />
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Lucro Líquido Real
                </span>
                <div className="flex items-baseline gap-1.5">
                  <span className={`text-base sm:text-lg font-black font-mono tracking-tight ${
                    totalRealProfit >= 0
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : 'text-rose-600 dark:text-rose-400'
                  }`}>
                    {formatBrl(totalRealProfit)}
                  </span>
                  <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
                    totalRealProfit >= 0
                      ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300'
                      : 'bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300'
                  }`}>
                    {totalMarginPercent}%
                  </span>
                </div>
                {hasStays && (
                  <div className="text-[9px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                    Frete Base: <strong>{formatBrl(realProfit)}</strong> | Estadia: <strong>{formatBrl(demurrageProfit)}</strong>
                  </div>
                )}
              </div>
            </div>

            <div className="shrink-0">
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border ${
                totalRealProfit >= 0
                  ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60'
                  : 'bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800/60'
              }`}>
                {totalRealProfit >= 0 ? '✓ Lucrativo' : '⚠ Negativo'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* LINHA 4: Card Separado e Informativo - REGISTRO DE CUSTO ADICIONAL / PREJUÍZO */}
      <div>
        <div className={`p-3 rounded-xl border transition-all ${
          additionalCostValue > 0
            ? 'bg-rose-50/50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/50'
            : 'bg-slate-50/80 dark:bg-slate-800/40 border-slate-200/90 dark:border-slate-700/60'
        }`}>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2.5">
              <div className={`p-2 rounded-lg shrink-0 ${
                additionalCostValue > 0 
                  ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/60 dark:text-rose-300' 
                  : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
              }`}>
                <AlertTriangle className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    Custo Adicional / Registro de Prejuízo
                  </span>
                  <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-slate-200/80 text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                    Informativo
                  </span>
                  {additionalCostValue > 0 && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                      {additionalCost?.category || 'Prejuízo Operacional'}
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-slate-500 dark:text-slate-400">
                  Registro para controle e histórico operacional (não deduz do Lucro Líquido Real da operação).
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="text-right">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Valor Registrado</span>
                <span className={`text-sm font-black font-mono ${
                  additionalCostValue > 0 
                    ? 'text-rose-600 dark:text-rose-400' 
                    : 'text-slate-400 dark:text-slate-500'
                }`}>
                  {additionalCostValue > 0 ? formatBrl(additionalCostValue) : 'R$ 0,00'}
                </span>
              </div>

              {additionalCostValue > 0 ? (
                <div className="flex items-center gap-1.5 pl-2 border-l border-slate-200 dark:border-slate-700">
                  <button
                    type="button"
                    onClick={handleOpenViewAdditionalCost}
                    className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-950/60 dark:text-blue-300 dark:hover:bg-blue-900/60 border border-blue-200 dark:border-blue-800 transition-colors cursor-pointer inline-flex items-center gap-1"
                  >
                    <Eye className="w-3 h-3" />
                    <span>Ver Detalhes</span>
                  </button>
                  {!isDemo && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleOpenAddAdditionalCost('edit')}
                        className="p-1.5 text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                        title="Editar valor, categoria ou justificativa"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={handleDeleteAdditionalCost}
                        className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                        title="Remover custo adicional"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </div>
              ) : !isDemo ? (
                <button
                  type="button"
                  onClick={() => handleOpenAddAdditionalCost('create')}
                  className="px-3 py-1.5 text-xs font-bold rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-300 dark:hover:bg-rose-950/40 dark:hover:text-rose-300 dark:hover:border-rose-800 transition-all cursor-pointer shadow-2xs inline-flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Lançar Custo / Prejuízo</span>
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {/* MODAL: Lançamento e Detalhes de Custo Adicional / Prejuízo Operacional */}
      {isAdditionalCostModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden text-slate-800 dark:text-slate-100">
            {/* Header */}
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/80 dark:bg-slate-800/60">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 rounded-xl">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                    {additionalCostModalMode === 'view'
                      ? 'Detalhes do Custo Adicional / Prejuízo'
                      : additionalCostModalMode === 'edit'
                        ? 'Editar Custo Adicional / Prejuízo'
                        : 'Registrar Custo Adicional / Prejuízo Operacional'}
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Embarque: <span className="font-mono font-bold text-blue-600 dark:text-blue-400">{shipment.id}</span> • Placa: <span className="font-mono font-bold">{shipment.horsePlate}</span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAdditionalCostModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                title="Fechar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            {additionalCostModalMode === 'view' && additionalCost ? (
              <div className="p-5 space-y-4 text-xs">
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/80 dark:border-slate-700/80">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 block mb-1">
                      Valor do Prejuízo
                    </span>
                    <span className="text-base font-black font-mono text-rose-600 dark:text-rose-400">
                      - {formatBrl(additionalCost.value)}
                    </span>
                  </div>
                  <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/80 dark:border-slate-700/80">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 block mb-1">
                      Classificação / Motivo
                    </span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">
                      {additionalCost.category}
                    </span>
                  </div>
                </div>

                <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/80 dark:border-slate-700/80 space-y-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 block">
                    Justificativa / Descrição do Ocorrido
                  </span>
                  <p className="text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
                    {additionalCost.description}
                  </p>
                </div>

                <div className="pt-2 flex items-center justify-between gap-2">
                  {!isDemo ? (
                    <button
                      type="button"
                      onClick={handleDeleteAdditionalCost}
                      disabled={isSavingAdditionalCost}
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Excluir Lançamento</span>
                    </button>
                  ) : <div />}

                  <div className="flex items-center gap-2">
                    {!isDemo && (
                      <button
                        type="button"
                        onClick={() => handleOpenAddAdditionalCost('edit')}
                        className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        <span>Editar</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setIsAdditionalCostModalOpen(false)}
                      className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                    >
                      Fechar
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSaveAdditionalCost();
                }}
                className="p-5 space-y-4 text-xs"
              >
                {/* Campo 1: Valor */}
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1">
                    Valor do Prejuízo / Custo Extra (R$) <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative rounded-xl shadow-2xs">
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 font-bold font-mono">
                      R$
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      required
                      placeholder="0,00"
                      value={costFormValue}
                      onChange={(e) => setCostFormValue(e.target.value)}
                      disabled={isSavingAdditionalCost}
                      className="w-full pl-10 pr-3 py-2 text-sm font-bold font-mono rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-rose-500/30 focus:border-rose-500 outline-hidden transition-all"
                    />
                  </div>
                </div>

                {/* Campo 2: Categoria */}
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1">
                    Motivo / Categoria <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={costFormCategory}
                    onChange={(e) => setCostFormCategory(e.target.value)}
                    disabled={isSavingAdditionalCost}
                    className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-rose-500/30 focus:border-rose-500 outline-hidden transition-all cursor-pointer"
                  >
                    <option value="Avaria de Carga">📦 Avaria de Carga / Sinistro Parcial</option>
                    <option value="Transbordo / Guincho">🚚 Transbordo / Socorro Mecânico / Guincho</option>
                    <option value="Multa / Notificação">⚠️ Multa de Trânsito / Fiscal / Balança</option>
                    <option value="Estadia Excedente">⏱️ Estadia Excedente Não Faturada</option>
                    <option value="Atraso / Retenção Operacional">🛑 Atraso / Retenção Operacional</option>
                    <option value="Pedágio Extra / Rota Não Prevista">🛣️ Pedágio Extra / Desvio de Rota</option>
                    <option value="Outros Custos Imprevistos">📝 Outros Custos Imprevistos</option>
                  </select>
                </div>

                {/* Campo 3: Justificativa */}
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1">
                    Justificativa / Descrição do Ocorrido <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    rows={4}
                    required
                    placeholder="Descreva detalhadamente o evento causador do custo adicional ou prejuízo operacional..."
                    value={costFormDescription}
                    onChange={(e) => setCostFormDescription(e.target.value)}
                    disabled={isSavingAdditionalCost}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-rose-500/30 focus:border-rose-500 outline-hidden transition-all resize-none"
                  />
                </div>

                {/* Botões do Formulário */}
                <div className="pt-2 flex items-center justify-between gap-2">
                  {additionalCostModalMode === 'edit' ? (
                    <button
                      type="button"
                      onClick={handleDeleteAdditionalCost}
                      disabled={isSavingAdditionalCost}
                      className="inline-flex items-center gap-1 px-3 py-2 text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Excluir</span>
                    </button>
                  ) : <div />}

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setIsAdditionalCostModalOpen(false)}
                      disabled={isSavingAdditionalCost}
                      className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={isSavingAdditionalCost}
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer disabled:opacity-50"
                    >
                      {isSavingAdditionalCost ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                      <span>Salvar Custo Adicional</span>
                    </button>
                  </div>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default CteCostAutomationPanel;
