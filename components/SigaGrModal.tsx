import React, { useState, useEffect, useMemo } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  FileText,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Search,
  Copy,
  Settings,
  Send,
  Upload,
  User as UserIcon,
  Truck,
  Calendar,
  X,
  Eye,
  Check,
  Loader2,
  Sparkles,
  Filter,
  RefreshCw,
  ExternalLink,
  ArrowRight,
  Play,
  AlertCircle,
  Phone,
  MapPin,
  Building,
  DollarSign,
  ChevronRight,
  Trash2
} from 'lucide-react';
import type {
  Driver,
  Shipment,
  Vehicle,
  Owner,
  User,
  SigaConfig,
  SigaRequestRecord,
  SigaProduct,
  SigaVehicleType,
  SigaDriverHistory,
  SigaSimulationTag,
  SigaCreateAnalysisInput,
  SigaUpdateAnalysisInput,
  SigaAnalysisResponseData
} from '../types';
import { useToast } from '../hooks/useToast';
import {
  fetchSigaConfig,
  saveSigaConfig,
  fetchSigaRequests,
  upsertSigaRequest,
  deleteSigaRequest,
  DEFAULT_SIGA_CONFIG
} from '../lib/db';
import {
  authenticateSiga,
  uploadSigaFile,
  createSigaAnalysis,
  updateSigaAnalysis,
  getSigaAnalysis,
  simulateSigaStatus,
  formatCpf,
  cleanPlate,
  cleanDocumentNumber,
  mapVehicleTypeToSiga,
  getTrailersCountForVehicleType,
  mapDriverHistoryToSiga,
  getSigaStateBadgeInfo
} from '../services/sigaGrService';
import { autoFormatInput } from '../utils/formatters';

interface SigaGrModalProps {
  isOpen: boolean;
  onClose: () => void;
  shipments?: Shipment[];
  drivers?: Driver[];
  vehicles?: Vehicle[];
  owners?: Owner[];
  currentUser?: User | null;
  initialShipmentId?: string;
  initialDriverId?: string;
  onSelectApprovedCode?: (code: string, processNumber: string, shipmentId?: string) => void;
}

type TabType = 'nova_solicitacao' | 'historico' | 'detalhes' | 'configuracoes';

export const SigaGrModal: React.FC<SigaGrModalProps> = ({
  isOpen,
  onClose,
  shipments = [],
  drivers = [],
  vehicles = [],
  owners = [],
  currentUser,
  initialShipmentId,
  initialDriverId,
  onSelectApprovedCode
}) => {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<TabType>('nova_solicitacao');

  // Configurações
  const [config, setConfig] = useState<SigaConfig>(DEFAULT_SIGA_CONFIG);
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [isTestingAuth, setIsTestingAuth] = useState(false);
  const [authStatus, setAuthStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [authErrorMessage, setAuthErrorMessage] = useState('');

  // Histórico e Lista
  const [requests, setRequests] = useState<SigaRequestRecord[]>([]);
  const [isLoadingRequests, setIsLoadingRequests] = useState(false);
  const [searchFilter, setSearchFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('todos');

  // Análise selecionada para ver detalhes
  const [selectedRecord, setSelectedRecord] = useState<SigaRequestRecord | null>(null);
  const [isRefreshingAnalysis, setIsRefreshingAnalysis] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);

  // Vínculos com Entidades do Sistema
  const [selectedShipmentId, setSelectedShipmentId] = useState<string>(initialShipmentId || '');
  const [selectedDriverId, setSelectedDriverId] = useState<string>(initialDriverId || '');

  // Wizard / Etapas da Nova Análise
  const [creationStep, setCreationStep] = useState<1 | 2>(1);
  const [createdProcessNumber, setCreatedProcessNumber] = useState<string>('');
  const [isCreatingDraft, setIsCreatingDraft] = useState(false);
  const [isSubmittingFull, setIsSubmittingFull] = useState(false);

  // Formulário - Passo 1 (Criação Inicial)
  const [productName, setProductName] = useState<SigaProduct>('siga');
  const [requesterEmail, setRequesterEmail] = useState('');
  const [driverCpf, setDriverCpf] = useState('');
  const [vehicleType, setVehicleType] = useState<SigaVehicleType>('LS');
  const [truckPlate, setTruckPlate] = useState('');
  const [trailer1Plate, setTrailer1Plate] = useState('');
  const [trailer2Plate, setTrailer2Plate] = useState('');
  const [trailer3Plate, setTrailer3Plate] = useState('');
  const [businessUnit, setBusinessUnit] = useState('');
  const [requestBiometrics, setRequestBiometrics] = useState(false);

  // Formulário - Passo 2 (Uploads e Dados Complementares)
  // Uploads Tokens
  const [cnhToken, setCnhToken] = useState<string>('');
  const [cnhUploading, setCnhUploading] = useState(false);
  const [crlvToken, setCrlvToken] = useState<string>('');
  const [crlvUploading, setCrlvUploading] = useState(false);
  const [photoHorseToken, setPhotoHorseToken] = useState<string>('');
  const [photoHorseUploading, setPhotoHorseUploading] = useState(false);
  const [photoComboToken, setPhotoComboToken] = useState<string>('');
  const [photoComboUploading, setPhotoComboUploading] = useState(false);
  const [trailer1Token, setTrailer1Token] = useState<string>('');
  const [trailer1Uploading, setTrailer1Uploading] = useState(false);

  // Dados do Motorista
  const [driverFullname, setDriverFullname] = useState('');
  const [driverRg, setDriverRg] = useState('');
  const [driverRgIssuer, setDriverRgIssuer] = useState('PR');
  const [driverBirthdate, setDriverBirthdate] = useState('');
  const [driverMother, setDriverMother] = useState('');
  const [driverPhone, setDriverPhone] = useState('');
  const [driverCnhNumber, setDriverCnhNumber] = useState('');
  const [driverCnhSecurityCode, setDriverCnhSecurityCode] = useState('');
  const [driverCnhIssuerLocation, setDriverCnhIssuerLocation] = useState('');
  const [driverStreet, setDriverStreet] = useState('');
  const [driverStreetNumber, setDriverStreetNumber] = useState('');
  const [driverBuilding, setDriverBuilding] = useState('');
  const [driverDistrict, setDriverDistrict] = useState('');
  const [driverCity, setDriverCity] = useState('');
  const [driverState, setDriverState] = useState('PR');
  const [driverZipcode, setDriverZipcode] = useState('');

  // Dados do Veículo / Carga
  const [truckRenavam, setTruckRenavam] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [ownerDoc, setOwnerDoc] = useState('');
  const [ownerPhone, setOwnerPhone] = useState('');
  const [anttDoc, setAnttDoc] = useState('');
  const [goodsType, setGoodsType] = useState('');
  const [loadCost, setLoadCost] = useState<number | ''>('');
  const [hirer, setHirer] = useState('');
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');

  // Histórico do Motorista
  const [driverHistory, setDriverHistory] = useState<SigaDriverHistory>('Primeira viagem');
  const [tripsCount, setTripsCount] = useState<number | ''>('');
  const [lastTripAt, setLastTripAt] = useState('');
  const [lastLicensePlate, setLastLicensePlate] = useState('');

  // Referências Comerciais (obrigatório 3 no siga_plus)
  const [references, setReferences] = useState<Array<{ name: string; phone: string }>>([
    { name: '', phone: '' },
    { name: '', phone: '' },
    { name: '', phone: '' }
  ]);

  // Carrega configurações e histórico ao abrir o modal
  useEffect(() => {
    if (!isOpen) return;

    const loadData = async () => {
      setIsLoadingRequests(true);
      try {
        const loadedConfig = await fetchSigaConfig();
        setConfig(loadedConfig);
        setRequesterEmail(loadedConfig.requesterEmail || loadedConfig.email || '');
        setBusinessUnit(loadedConfig.businessUnit || '');

        const loadedRequests = await fetchSigaRequests();
        setRequests(loadedRequests);

        // Auto-preenchimento ao abrir com initialShipmentId ou initialDriverId
        if (initialShipmentId) {
          setSelectedShipmentId(initialShipmentId);
          handleSelectShipment(initialShipmentId);
        } else if (initialDriverId) {
          setSelectedDriverId(initialDriverId);
          const d = drivers.find(drv => drv.id === initialDriverId);
          if (d) populateFromDriver(d);
        }
      } catch (err) {
        console.warn('[SIGA GR Modal] Erro ao carregar dados:', err);
      } finally {
        setIsLoadingRequests(false);
      }
    };

    loadData();
  }, [isOpen, initialShipmentId, initialDriverId]);

  // Sincroniza listener de Realtime Hub
  useEffect(() => {
    if (!isOpen) return;

    const handleSigaChanged = async () => {
      const refreshed = await fetchSigaRequests();
      setRequests(refreshed);
      if (selectedRecord) {
        const updated = refreshed.find(r => r.processNumber === selectedRecord.processNumber);
        if (updated) setSelectedRecord(updated);
      }
    };

    window.addEventListener('transcunha:siga_changed', handleSigaChanged);
    return () => {
      window.removeEventListener('transcunha:siga_changed', handleSigaChanged);
    };
  }, [isOpen, selectedRecord]);

  // Preenchimento automático ao selecionar Motorista ou Embarque
  const handleSelectShipment = (shipmentId: string) => {
    setSelectedShipmentId(shipmentId);
    if (!shipmentId) return;

    const shipment = shipments.find(s => s.id === shipmentId);
    if (!shipment) return;

    if (shipment.driverCpf) {
      setDriverCpf(formatCpf(shipment.driverCpf));
    }
    if (shipment.driverName) {
      setDriverFullname(shipment.driverName);
    }
    if (shipment.horsePlate) {
      setTruckPlate(cleanPlate(shipment.horsePlate));
    }
    if (shipment.trailer1Plate) {
      setTrailer1Plate(cleanPlate(shipment.trailer1Plate));
    }
    if (shipment.trailer2Plate) {
      setTrailer2Plate(cleanPlate(shipment.trailer2Plate));
    }
    if (shipment.route) {
      const parts = shipment.route.split(/->|➔|para/i);
      if (parts[0]) setOrigin(parts[0].trim());
      if (parts[1]) setDestination(parts[1].trim());
    }
    if (shipment.nfeValue || shipment.driverFreightValue) {
      setLoadCost(Number(shipment.nfeValue || shipment.driverFreightValue || 0));
    }
    if (shipment.driverRg) {
      setDriverRg(shipment.driverRg);
    }
    if (shipment.driverCnh) {
      setDriverCnhNumber(shipment.driverCnh);
    }
    if (shipment.driverContact) {
      setDriverPhone(shipment.driverContact);
    }
    if (shipment.ownerName) {
      setOwnerName(shipment.ownerName);
    }
    if (shipment.ownerContact) {
      setOwnerPhone(shipment.ownerContact);
    }

    // Tenta encontrar o motorista correspondente
    const cleanCpfShipment = cleanDocumentNumber(shipment.driverCpf);
    const driver = drivers.find(d => cleanDocumentNumber(d.cpf) === cleanCpfShipment);
    if (driver) {
      setSelectedDriverId(driver.id);
      populateFromDriver(driver);
    }

    // Tenta encontrar o veículo e define o tipo aceito pelo SIGA GR
    const cleanPlateShipment = cleanPlate(shipment.horsePlate);
    const vehicle = vehicles.find(v => cleanPlate(v.plate) === cleanPlateShipment);
    const mapped = mapVehicleTypeToSiga(vehicle?.bodyType || vehicle?.setType || (shipment as any)?.truckType || (shipment as any)?.tipo_veiculo);
    setVehicleType(mapped);
  };

  const populateFromDriver = (driver: Driver) => {
    if (driver.name) setDriverFullname(driver.name);
    if (driver.cpf) setDriverCpf(formatCpf(driver.cpf));
    if (driver.phone) setDriverPhone(driver.phone);
    if (driver.cnh) setDriverCnhNumber(driver.cnh);

    // Contagem de viagens
    const cleanC = cleanDocumentNumber(driver.cpf);
    const driverTrips = shipments.filter(s => cleanDocumentNumber(s.driverCpf) === cleanC);
    if (driverTrips.length > 0) {
      setDriverHistory('Com histórico');
      setTripsCount(driverTrips.length);
      const sorted = [...driverTrips].sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
      if (sorted[0]?.createdAt) setLastTripAt(sorted[0].createdAt.split('T')[0]);
      if (sorted[0]?.horsePlate) setLastLicensePlate(cleanPlate(sorted[0].horsePlate));
    } else {
      setDriverHistory(mapDriverHistoryToSiga(driver, 0));
    }
  };

  const handleSelectDriver = (driverId: string) => {
    setSelectedDriverId(driverId);
    if (!driverId) return;
    const driver = drivers.find(d => d.id === driverId);
    if (driver) populateFromDriver(driver);
  };

  // Upload handler genérico para documentos do SIGA GR
  const handleUploadFile = async (
    file: File,
    type: 'cnh' | 'crlv' | 'horse' | 'combo' | 'trailer1'
  ) => {
    try {
      if (type === 'cnh') setCnhUploading(true);
      if (type === 'crlv') setCrlvUploading(true);
      if (type === 'horse') setPhotoHorseUploading(true);
      if (type === 'combo') setPhotoComboUploading(true);
      if (type === 'trailer1') setTrailer1Uploading(true);

      const result = await uploadSigaFile(file, file.name);
      if (!result.success || !result.token) {
        showToast(`Erro no upload: ${result.error || 'Token não gerado'}`, 'error');
        return;
      }

      if (type === 'cnh') setCnhToken(result.token);
      if (type === 'crlv') setCrlvToken(result.token);
      if (type === 'horse') setPhotoHorseToken(result.token);
      if (type === 'combo') setPhotoComboToken(result.token);
      if (type === 'trailer1') setTrailer1Token(result.token);

      showToast(`Documento enviado ao SIGA GR com sucesso! Token gerado.`, 'success');
    } catch (err: any) {
      showToast(`Falha no upload: ${err?.message || 'Erro inesperado'}`, 'error');
    } finally {
      if (type === 'cnh') setCnhUploading(false);
      if (type === 'crlv') setCrlvUploading(false);
      if (type === 'horse') setPhotoHorseUploading(false);
      if (type === 'combo') setPhotoComboUploading(false);
      if (type === 'trailer1') setTrailer1Uploading(false);
    }
  };

  // PASSO 1: Criar Análise Inicial (POST /v1/analyses -> draft)
  const handleCreateDraftAnalysis = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!cleanDocumentNumber(driverCpf)) {
      showToast('Por favor, informe o CPF do motorista.', 'warning');
      return;
    }
    if (!cleanPlate(truckPlate)) {
      showToast('Por favor, informe a placa do veículo principal.', 'warning');
      return;
    }

    setIsCreatingDraft(true);
    try {
      const tags: string[] = [];
      if (requestBiometrics) {
        tags.push('biometrics_requested');
      }

      const input: SigaCreateAnalysisInput = {
        product_name: productName,
        requester_email: requesterEmail || config.requesterEmail || config.email || 'operacao@transcunha.com.br',
        driver_personal_document: formatCpf(driverCpf),
        vehicle_type: vehicleType,
        truck_license_plate: cleanPlate(truckPlate),
        trailer_1_license_plate: trailer1Plate ? cleanPlate(trailer1Plate) : undefined,
        trailer_2_license_plate: trailer2Plate ? cleanPlate(trailer2Plate) : undefined,
        trailer_3_license_plate: trailer3Plate ? cleanPlate(trailer3Plate) : undefined,
        business_unit: businessUnit || config.businessUnit || undefined,
        tags: tags.length > 0 ? tags : undefined,
      };

      const result = await createSigaAnalysis(input, {
        shipmentId: selectedShipmentId || undefined,
        driverId: selectedDriverId || undefined,
        driverName: driverFullname || 'Motorista',
        createdById: currentUser?.id,
        createdByName: currentUser?.name,
      });

      if (!result.success || !result.data) {
        showToast(result.error || 'Não foi possível criar a análise no SIGA GR.', 'error');
        return;
      }

      const procNum = String(result.data.process_number);
      setCreatedProcessNumber(procNum);
      setCreationStep(2);

      const refreshed = await fetchSigaRequests();
      setRequests(refreshed);

      showToast(`Processo nº ${procNum} iniciado! Prossiga com o upload e complementação.`, 'success');
    } catch (err: any) {
      showToast(`Erro ao criar análise: ${err?.message || 'Falha desconhecida'}`, 'error');
    } finally {
      setIsCreatingDraft(false);
    }
  };

  // PASSO 2: Enviar Dados Completos e Documentos (PUT /v1/analyses/{process_number})
  const handleSendToAnalysisQueue = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!createdProcessNumber) {
      showToast('Número do processo não encontrado. Crie a análise no Passo 1 primeiro.', 'warning');
      return;
    }

    setIsSubmittingFull(true);
    try {
      const trailersPayload: any[] = [];
      if (trailer1Plate) {
        trailersPayload.push({
          license_plate: cleanPlate(trailer1Plate),
          license_file: trailer1Token || undefined,
          owner_name: ownerName || undefined,
          owner_document: ownerDoc ? cleanDocumentNumber(ownerDoc) : undefined,
          owner_phone: ownerPhone || undefined,
          antt_owner_document: anttDoc ? cleanDocumentNumber(anttDoc) : undefined,
        });
      }
      if (trailer2Plate) {
        trailersPayload.push({
          license_plate: cleanPlate(trailer2Plate),
        });
      }

      // Referências filtradas
      const validReferences = references.filter(r => r.name.trim() && r.phone.trim());

      const updateInput: SigaUpdateAnalysisInput = {
        business_unit: businessUnit || config.businessUnit || undefined,
        goods_type: goodsType || undefined,
        load_cost: loadCost !== '' ? Number(loadCost) : undefined,
        hirer: hirer || undefined,
        origin: origin || undefined,
        destination: destination || undefined,
        driver: {
          fullname: driverFullname || undefined,
          national_id_number: driverRg || undefined,
          national_id_issuer: driverRgIssuer || undefined,
          birthdate: driverBirthdate || undefined,
          mother: driverMother || undefined,
          license_file: cnhToken || undefined,
          license_number: driverCnhNumber || undefined,
          license_security_code: driverCnhSecurityCode || undefined,
          license_issued_location: driverCnhIssuerLocation || undefined,
          street: driverStreet || undefined,
          street_number: driverStreetNumber || undefined,
          building: driverBuilding || undefined,
          district: driverDistrict || undefined,
          city: driverCity || undefined,
          state: driverState || undefined,
          zipcode: driverZipcode || undefined,
          phone: driverPhone || undefined,
        },
        truck: {
          license_number: truckRenavam || undefined,
          license_file: crlvToken || undefined,
          photo: photoHorseToken || undefined,
          tractor_trailer_photo: photoComboToken || undefined,
          owner_name: ownerName || undefined,
          owner_document: ownerDoc ? cleanDocumentNumber(ownerDoc) : undefined,
          owner_phone: ownerPhone || undefined,
          another_antt_owner: !!anttDoc && anttDoc !== ownerDoc,
          antt_owner_document: anttDoc ? cleanDocumentNumber(anttDoc) : undefined,
          trailers: trailersPayload.length > 0 ? trailersPayload : undefined,
        },
        driver_history: driverHistory,
        trips_count: driverHistory === 'Com histórico' && tripsCount !== '' ? Number(tripsCount) : undefined,
        last_trip_at: driverHistory === 'Com histórico' && lastTripAt ? lastTripAt : undefined,
        last_license_plate: driverHistory === 'Com histórico' && lastLicensePlate ? cleanPlate(lastLicensePlate) : undefined,
        professional_references: validReferences.length > 0 ? validReferences : undefined,
      };

      const result = await updateSigaAnalysis(createdProcessNumber, updateInput, {
        shipmentId: selectedShipmentId || undefined,
        driverId: selectedDriverId || undefined,
      });

      if (!result.success || !result.data) {
        showToast(result.error || 'Erro ao enviar dados para análise do SIGA GR.', 'error');
        return;
      }

      showToast(`Análise nº ${createdProcessNumber} enviada com sucesso para a fila de atendimento!`, 'success');

      const refreshed = await fetchSigaRequests();
      setRequests(refreshed);

      // Abre aba de histórico ou detalhes
      if (result.record) {
        setSelectedRecord(result.record);
        setActiveTab('detalhes');
      } else {
        setActiveTab('historico');
      }
    } catch (err: any) {
      showToast(`Falha ao enviar análise: ${err?.message || 'Erro desconhecido'}`, 'error');
    } finally {
      setIsSubmittingFull(false);
    }
  };

  // Consulta manual / Atualização do Processo selecionado
  const handleRefreshProcess = async (procNumber: string) => {
    setIsRefreshingAnalysis(true);
    try {
      const res = await getSigaAnalysis(procNumber);
      if (!res.success || !res.data) {
        showToast(res.error || 'Não foi possível consultar o status da análise.', 'error');
        return;
      }

      showToast(`Processo atualizado! Status: ${getSigaStateBadgeInfo(res.data.state).label}`, 'success');

      const refreshed = await fetchSigaRequests();
      setRequests(refreshed);
      if (res.record) setSelectedRecord(res.record);
    } catch (err: any) {
      showToast(`Erro na consulta: ${err?.message || 'Falha de comunicação'}`, 'error');
    } finally {
      setIsRefreshingAnalysis(false);
    }
  };

  // Simulação de analista no ambiente de homologação
  const handleSimulateTag = async (procNumber: string, tag: SigaSimulationTag) => {
    setIsSimulating(true);
    try {
      const res = await simulateSigaStatus(procNumber, tag);
      if (!res.success) {
        showToast(res.error || 'Falha ao acionar simulação.', 'error');
        return;
      }

      showToast('Tag de simulação enviada ao SIGA GR! Aguarde até 5 minutos para processamento na homologação.', 'info');
      await handleRefreshProcess(procNumber);
    } catch (err: any) {
      showToast(`Erro na simulação: ${err?.message || 'Falha desconhecida'}`, 'error');
    } finally {
      setIsSimulating(false);
    }
  };

  // Teste de Conexão e Autenticação
  const handleTestConnection = async () => {
    setIsTestingAuth(true);
    setAuthStatus('idle');
    setAuthErrorMessage('');

    try {
      const result = await authenticateSiga(config);
      if (result.success) {
        setAuthStatus('success');
        showToast('Autenticado com sucesso na API do SIGA GR!', 'success');
      } else {
        setAuthStatus('error');
        setAuthErrorMessage(result.error || 'Erro de autenticação.');
        showToast(result.error || 'Falha de autenticação.', 'error');
      }
    } catch (err: any) {
      setAuthStatus('error');
      setAuthErrorMessage(err?.message || 'Falha ao conectar no servidor.');
      showToast(`Erro: ${err?.message || 'Falha na conexão'}`, 'error');
    } finally {
      setIsTestingAuth(false);
    }
  };

  // Salvar Configurações
  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingConfig(true);
    try {
      await saveSigaConfig(config);
      showToast('Configurações do SIGA GR salvas com sucesso!', 'success');
    } catch (err: any) {
      showToast('Erro ao salvar configurações.', 'error');
    } finally {
      setIsSavingConfig(false);
    }
  };

  // Exclusão de registro de histórico
  const handleDeleteRecord = async (procNumber: string) => {
    if (!window.confirm(`Deseja remover o registro nº ${procNumber} do histórico local?`)) return;
    await deleteSigaRequest(procNumber);
    const refreshed = await fetchSigaRequests();
    setRequests(refreshed);
    if (selectedRecord?.processNumber === procNumber) setSelectedRecord(null);
    showToast('Registro excluído do histórico.', 'info');
  };

  // Lista filtrada
  const filteredRequests = useMemo(() => {
    return requests.filter(r => {
      const matchSearch =
        !searchFilter ||
        r.processNumber.includes(searchFilter) ||
        r.driverName.toLowerCase().includes(searchFilter.toLowerCase()) ||
        r.driverCpf.includes(searchFilter) ||
        r.truckPlate.toLowerCase().includes(searchFilter.toLowerCase());

      const matchStatus = statusFilter === 'todos' || r.state === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [requests, searchFilter, statusFilter]);

  if (!isOpen) return null;

  const trailersCountRequired = getTrailersCountForVehicleType(vehicleType);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden text-gray-900 dark:text-gray-100">
        
        {/* Top Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/40">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-blue-700 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-blue-600/20">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-black tracking-tight text-gray-900 dark:text-white">
                  SIGA GR
                </h2>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">
                  Gerenciadora de Risco
                </span>
                <span
                  className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${
                    config.environment === 'production'
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800'
                      : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800'
                  }`}
                >
                  {config.environment === 'production' ? '● Produção' : '● Homologação (Staging)'}
                </span>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Integração oficial REST+JSON para criação e acompanhamento de análises de risco.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center justify-between px-6 border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900">
          <div className="flex gap-2 -mb-px">
            <button
              onClick={() => setActiveTab('nova_solicitacao')}
              className={`px-4 py-3 text-xs font-bold border-b-2 flex items-center gap-2 transition-all ${
                activeTab === 'nova_solicitacao'
                  ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
              }`}
            >
              <Send className="w-4 h-4" />
              Nova Análise
            </button>

            <button
              onClick={() => setActiveTab('historico')}
              className={`px-4 py-3 text-xs font-bold border-b-2 flex items-center gap-2 transition-all ${
                activeTab === 'historico'
                  ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
              }`}
            >
              <Clock className="w-4 h-4" />
              Histórico & Acompanhamento
              {requests.length > 0 && (
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 font-bold">
                  {requests.length}
                </span>
              )}
            </button>

            {selectedRecord && (
              <button
                onClick={() => setActiveTab('detalhes')}
                className={`px-4 py-3 text-xs font-bold border-b-2 flex items-center gap-2 transition-all ${
                  activeTab === 'detalhes'
                    ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                }`}
              >
                <Eye className="w-4 h-4" />
                Processo #{selectedRecord.processNumber}
              </button>
            )}

            <button
              onClick={() => setActiveTab('configuracoes')}
              className={`px-4 py-3 text-xs font-bold border-b-2 flex items-center gap-2 transition-all ${
                activeTab === 'configuracoes'
                  ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
              }`}
            >
              <Settings className="w-4 h-4" />
              Configurações & Chaves
            </button>
          </div>

          {activeTab === 'historico' && (
            <button
              onClick={async () => {
                setIsLoadingRequests(true);
                const refreshed = await fetchSigaRequests();
                setRequests(refreshed);
                setIsLoadingRequests(false);
                showToast('Histórico atualizado!', 'info');
              }}
              disabled={isLoadingRequests}
              className="text-xs font-semibold text-gray-600 dark:text-gray-300 hover:text-blue-600 flex items-center gap-1.5 py-1 px-2.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-all cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingRequests ? 'animate-spin' : ''}`} />
              Atualizar
            </button>
          )}
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6">
          
          {/* TAB 1: NOVA ANÁLISE */}
          {activeTab === 'nova_solicitacao' && (
            <div className="space-y-6">
              {/* Stepper Header */}
              <div className="flex items-center justify-between bg-blue-50/60 dark:bg-blue-950/20 p-4 rounded-2xl border border-blue-100 dark:border-blue-900/40">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs ${
                    creationStep === 1 ? 'bg-blue-600 text-white shadow-xs' : 'bg-emerald-600 text-white'
                  }`}>
                    {creationStep === 1 ? '1' : <Check className="w-4 h-4" />}
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-gray-900 dark:text-white">
                      Passo 1: Criação Inicial da Análise (POST /v1/analyses)
                    </h4>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">
                      Gera o número de processo e cria o rascunho na base do SIGA GR.
                    </p>
                  </div>
                </div>

                <ChevronRight className="w-4 h-4 text-gray-400" />

                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs ${
                    creationStep === 2 ? 'bg-blue-600 text-white shadow-xs' : 'bg-gray-200 dark:bg-gray-800 text-gray-500'
                  }`}>
                    2
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-gray-900 dark:text-white">
                      Passo 2: Upload de Documentos & Envio (PUT /v1/analyses)
                    </h4>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">
                      Anexa CNH, CRLVs, fotos e encaminha para a fila de atendimento.
                    </p>
                  </div>
                </div>
              </div>

              {/* Seletor de Autopreenchimento a partir de Embarque ou Motorista */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-gray-50 dark:bg-gray-800/40 p-4 rounded-2xl border border-gray-100 dark:border-gray-800">
                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1 flex items-center gap-1.5">
                    <Truck className="w-3.5 h-3.5 text-blue-600" />
                    Puxar dados do Embarque (Opcional):
                  </label>
                  <select
                    value={selectedShipmentId}
                    onChange={(e) => handleSelectShipment(e.target.value)}
                    className="w-full text-xs rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 py-2 px-3 focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Selecione um embarque ativo...</option>
                    {shipments.slice(0, 50).map(s => (
                      <option key={s.id} value={s.id}>
                        #{s.id.substring(0, 8)} - {s.driverName || 'Sem motorista'} ({s.horsePlate || 'Sem placa'})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1 flex items-center gap-1.5">
                    <UserIcon className="w-3.5 h-3.5 text-blue-600" />
                    Puxar dados do Motorista Cadastrado:
                  </label>
                  <select
                    value={selectedDriverId}
                    onChange={(e) => handleSelectDriver(e.target.value)}
                    className="w-full text-xs rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 py-2 px-3 focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Selecione um motorista da base...</option>
                    {drivers.map(d => (
                      <option key={d.id} value={d.id}>
                        {d.name} - CPF: {formatCpf(d.cpf)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* PASSO 1: FORMULÁRIO DE CRIAÇÃO */}
              {creationStep === 1 && (
                <form onSubmit={handleCreateDraftAnalysis} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Produto Contratado */}
                    <div>
                      <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                        Produto SIGA *
                      </label>
                      <select
                        value={productName}
                        onChange={(e) => setProductName(e.target.value as SigaProduct)}
                        className="w-full text-xs rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 py-2.5 px-3 font-semibold focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="siga">SIGA (Padrão)</option>
                        <option value="siga_plus">SIGA PLUS (3 Referências Comerciais)</option>
                      </select>
                      <p className="text-[10px] text-gray-400 mt-1">
                        {productName === 'siga_plus' ? 'Exige verificação de contatos comerciais.' : 'Análise simplificada de cadastro.'}
                      </p>
                    </div>

                    {/* Email do Solicitante */}
                    <div>
                      <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                        E-mail do Embarcador/Solicitante *
                      </label>
                      <input
                        type="email"
                        value={requesterEmail}
                        onChange={(e) => setRequesterEmail(e.target.value)}
                        placeholder="embarcador@transcunha.com.br"
                        required
                        className="w-full text-xs rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 py-2.5 px-3 focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    {/* CPF do Motorista */}
                    <div>
                      <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                        CPF do Motorista *
                      </label>
                      <input
                        type="text"
                        value={driverCpf}
                        onChange={(e) => setDriverCpf(autoFormatInput(e.target.value, 'cpf'))}
                        placeholder="000.000.000-00"
                        maxLength={14}
                        required
                        className="w-full text-xs font-mono rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 py-2.5 px-3 focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  {/* Veículo Principal e Carretas */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                        Tipo do Veículo *
                      </label>
                      <select
                        value={vehicleType}
                        onChange={(e) => setVehicleType(e.target.value as SigaVehicleType)}
                        className="w-full text-xs rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 py-2.5 px-3 font-semibold focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="Baú">Baú (1 carreta)</option>
                        <option value="BI-Caçamba">BI-Caçamba (2 carretas)</option>
                        <option value="BI-Trem">BI-Trem (2 carretas)</option>
                        <option value="Container">Container (1 carreta)</option>
                        <option value="LS">LS (1 carreta)</option>
                        <option value="Rodotrem">Rodotrem (3 carretas)</option>
                        <option value="Sider">Sider (1 carreta)</option>
                        <option value="Tanque">Tanque (1 carreta)</option>
                        <option value="Truck">Truck (0 carretas)</option>
                        <option value="Vanderléia">Vanderléia (1 carreta)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                        Placa Cavalo / Truck *
                      </label>
                      <input
                        type="text"
                        value={truckPlate}
                        onChange={(e) => setTruckPlate(cleanPlate(e.target.value))}
                        placeholder="AAA9999 ou AAA9A99"
                        maxLength={8}
                        required
                        className="w-full text-xs font-mono uppercase rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 py-2.5 px-3 focus:ring-2 focus:ring-blue-500 font-bold"
                      />
                    </div>

                    {trailersCountRequired >= 1 && (
                      <div>
                        <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                          Placa Carreta 1 *
                        </label>
                        <input
                          type="text"
                          value={trailer1Plate}
                          onChange={(e) => setTrailer1Plate(cleanPlate(e.target.value))}
                          placeholder="BBB9999"
                          maxLength={8}
                          required
                          className="w-full text-xs font-mono uppercase rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 py-2.5 px-3 focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    )}

                    {trailersCountRequired >= 2 && (
                      <div>
                        <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                          Placa Carreta 2 *
                        </label>
                        <input
                          type="text"
                          value={trailer2Plate}
                          onChange={(e) => setTrailer2Plate(cleanPlate(e.target.value))}
                          placeholder="CCC9999"
                          maxLength={8}
                          required
                          className="w-full text-xs font-mono uppercase rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 py-2.5 px-3 focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    )}

                    {trailersCountRequired >= 3 && (
                      <div>
                        <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                          Placa Carreta 3 *
                        </label>
                        <input
                          type="text"
                          value={trailer3Plate}
                          onChange={(e) => setTrailer3Plate(cleanPlate(e.target.value))}
                          placeholder="DDD9999"
                          maxLength={8}
                          required
                          className="w-full text-xs font-mono uppercase rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 py-2.5 px-3 focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    )}
                  </div>

                  {/* Opções Avançadas */}
                  <div className="flex flex-wrap items-center gap-6 pt-2">
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-gray-700 dark:text-gray-300">
                      <input
                        type="checkbox"
                        checked={requestBiometrics}
                        onChange={(e) => setRequestBiometrics(e.target.checked)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 w-4 h-4"
                      />
                      Solicitar Biometria Facial do Motorista
                    </label>
                  </div>

                  <div className="flex justify-end pt-4 border-t border-gray-100 dark:border-gray-800">
                    <button
                      type="submit"
                      disabled={isCreatingDraft}
                      className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-md shadow-blue-500/20 flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
                    >
                      {isCreatingDraft ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Criando Rascunho no SIGA GR...
                        </>
                      ) : (
                        <>
                          Criar Análise e Avançar para Documentos
                          <ArrowRight className="w-4 h-4" />
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}

              {/* PASSO 2: UPLOAD DE DOCUMENTOS & FORMULÁRIO COMPLETO */}
              {creationStep === 2 && (
                <form onSubmit={handleSendToAnalysisQueue} className="space-y-6">
                  {/* Banner do Processo Criado */}
                  <div className="flex items-center justify-between bg-emerald-50 dark:bg-emerald-950/30 p-4 rounded-2xl border border-emerald-200 dark:border-emerald-800">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold">
                        <Check className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300">
                            Processo Aberto no SIGA GR:
                          </span>
                          <span className="text-sm font-mono font-black text-emerald-900 dark:text-emerald-200 bg-white dark:bg-gray-800 px-2 py-0.5 rounded-lg border border-emerald-300 dark:border-emerald-700">
                            #{createdProcessNumber}
                          </span>
                        </div>
                        <p className="text-xs text-emerald-700 dark:text-emerald-400">
                          Faça o upload dos documentos e preencha os dados complementares para despachar a análise.
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setCreationStep(1)}
                      className="text-xs font-bold text-emerald-700 dark:text-emerald-400 hover:underline"
                    >
                      Voltar ao Passo 1
                    </button>
                  </div>

                  {/* Grid de Upload de Documentos */}
                  <div>
                    <h4 className="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-wider mb-3 flex items-center gap-1.5">
                      <Upload className="w-4 h-4 text-blue-600" />
                      Documentos e Fotos Obrigatórios (Máx. 5MB cada - PDF/JPG/PNG)
                    </h4>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                      {/* CNH */}
                      <div className="p-3 rounded-2xl border border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold">CNH do Motorista</span>
                          {cnhToken ? (
                            <span className="text-[10px] font-bold text-emerald-600 flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" /> Token OK
                            </span>
                          ) : (
                            <span className="text-[10px] text-amber-600 font-semibold">Pendente</span>
                          )}
                        </div>
                        <input
                          type="file"
                          accept=".pdf,.jpg,.jpeg,.png"
                          onChange={(e) => {
                            if (e.target.files?.[0]) handleUploadFile(e.target.files[0], 'cnh');
                          }}
                          className="w-full text-[11px] text-gray-500 file:mr-2 file:py-1 file:px-2.5 file:rounded-lg file:border-0 file:text-[11px] file:font-bold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                        />
                        {cnhUploading && <p className="text-[10px] text-blue-600 animate-pulse">Enviando CNH...</p>}
                      </div>

                      {/* CRLV Cavalo */}
                      <div className="p-3 rounded-2xl border border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold">CRLV (Cavalo/Truck)</span>
                          {crlvToken ? (
                            <span className="text-[10px] font-bold text-emerald-600 flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" /> Token OK
                            </span>
                          ) : (
                            <span className="text-[10px] text-amber-600 font-semibold">Pendente</span>
                          )}
                        </div>
                        <input
                          type="file"
                          accept=".pdf,.jpg,.jpeg,.png"
                          onChange={(e) => {
                            if (e.target.files?.[0]) handleUploadFile(e.target.files[0], 'crlv');
                          }}
                          className="w-full text-[11px] text-gray-500 file:mr-2 file:py-1 file:px-2.5 file:rounded-lg file:border-0 file:text-[11px] file:font-bold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                        />
                        {crlvUploading && <p className="text-[10px] text-blue-600 animate-pulse">Enviando CRLV...</p>}
                      </div>

                      {/* Foto Cavalo */}
                      <div className="p-3 rounded-2xl border border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold">Foto do Veículo</span>
                          {photoHorseToken ? (
                            <span className="text-[10px] font-bold text-emerald-600 flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" /> Token OK
                            </span>
                          ) : (
                            <span className="text-[10px] text-gray-400 font-semibold">Opcional</span>
                          )}
                        </div>
                        <input
                          type="file"
                          accept=".jpg,.jpeg,.png"
                          onChange={(e) => {
                            if (e.target.files?.[0]) handleUploadFile(e.target.files[0], 'horse');
                          }}
                          className="w-full text-[11px] text-gray-500 file:mr-2 file:py-1 file:px-2.5 file:rounded-lg file:border-0 file:text-[11px] file:font-bold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                        />
                        {photoHorseUploading && <p className="text-[10px] text-blue-600 animate-pulse">Enviando Foto...</p>}
                      </div>

                      {/* Foto Conjunto */}
                      <div className="p-3 rounded-2xl border border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold">Foto do Conjunto</span>
                          {photoComboToken ? (
                            <span className="text-[10px] font-bold text-emerald-600 flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" /> Token OK
                            </span>
                          ) : (
                            <span className="text-[10px] text-gray-400 font-semibold">Opcional</span>
                          )}
                        </div>
                        <input
                          type="file"
                          accept=".jpg,.jpeg,.png"
                          onChange={(e) => {
                            if (e.target.files?.[0]) handleUploadFile(e.target.files[0], 'combo');
                          }}
                          className="w-full text-[11px] text-gray-500 file:mr-2 file:py-1 file:px-2.5 file:rounded-lg file:border-0 file:text-[11px] file:font-bold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                        />
                        {photoComboUploading && <p className="text-[10px] text-blue-600 animate-pulse">Enviando Foto...</p>}
                      </div>
                    </div>
                  </div>

                  {/* Dados Pessoais do Motorista */}
                  <div>
                    <h4 className="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-wider mb-3 flex items-center gap-1.5">
                      <UserIcon className="w-4 h-4 text-blue-600" />
                      Dados Pessoais e CNH do Motorista
                    </h4>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                      <div className="md:col-span-2">
                        <label className="block text-[11px] font-semibold text-gray-600 dark:text-gray-400 mb-1">
                          Nome Completo *
                        </label>
                        <input
                          type="text"
                          value={driverFullname}
                          onChange={(e) => setDriverFullname(e.target.value)}
                          placeholder="Nome do motorista"
                          required
                          className="w-full text-xs rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 py-2 px-3"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-gray-600 dark:text-gray-400 mb-1">
                          RG / UF Emissor *
                        </label>
                        <div className="grid grid-cols-3 gap-1">
                          <input
                            type="text"
                            value={driverRg}
                            onChange={(e) => setDriverRg(e.target.value)}
                            placeholder="Número RG"
                            className="col-span-2 text-xs rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 py-2 px-3"
                          />
                          <input
                            type="text"
                            value={driverRgIssuer}
                            onChange={(e) => setDriverRgIssuer(e.target.value.toUpperCase())}
                            placeholder="UF"
                            maxLength={2}
                            className="text-xs text-center rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 py-2 px-1 uppercase"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-gray-600 dark:text-gray-400 mb-1">
                          Data de Nascimento *
                        </label>
                        <input
                          type="date"
                          value={driverBirthdate}
                          onChange={(e) => setDriverBirthdate(e.target.value)}
                          className="w-full text-xs rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 py-2 px-3"
                        />
                      </div>

                      <div className="md:col-span-2">
                        <label className="block text-[11px] font-semibold text-gray-600 dark:text-gray-400 mb-1">
                          Nome da Mãe *
                        </label>
                        <input
                          type="text"
                          value={driverMother}
                          onChange={(e) => setDriverMother(e.target.value)}
                          placeholder="Nome completo da mãe"
                          className="w-full text-xs rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 py-2 px-3"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-gray-600 dark:text-gray-400 mb-1">
                          Telefone Celular com DDD *
                        </label>
                        <input
                          type="text"
                          value={driverPhone}
                          onChange={(e) => setDriverPhone(autoFormatInput(e.target.value, 'phone'))}
                          placeholder="(41) 99999-9999"
                          className="w-full text-xs rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 py-2 px-3"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-gray-600 dark:text-gray-400 mb-1">
                          Número da CNH *
                        </label>
                        <input
                          type="text"
                          value={driverCnhNumber}
                          onChange={(e) => setDriverCnhNumber(e.target.value)}
                          placeholder="Número CNH"
                          className="w-full text-xs rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 py-2 px-3"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-gray-600 dark:text-gray-400 mb-1">
                          Cód. Segurança CNH *
                        </label>
                        <input
                          type="text"
                          value={driverCnhSecurityCode}
                          onChange={(e) => setDriverCnhSecurityCode(e.target.value)}
                          placeholder="Ex: 99999999999"
                          className="w-full text-xs rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 py-2 px-3"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-gray-600 dark:text-gray-400 mb-1">
                          Cidade/UF Emissão CNH
                        </label>
                        <input
                          type="text"
                          value={driverCnhIssuerLocation}
                          onChange={(e) => setDriverCnhIssuerLocation(e.target.value)}
                          placeholder="Ex: Curitiba - PR"
                          className="w-full text-xs rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 py-2 px-3"
                        />
                      </div>

                      <div className="md:col-span-2">
                        <label className="block text-[11px] font-semibold text-gray-600 dark:text-gray-400 mb-1">
                          Endereço / Logradouro
                        </label>
                        <input
                          type="text"
                          value={driverStreet}
                          onChange={(e) => setDriverStreet(e.target.value)}
                          placeholder="Rua, Avenida, etc."
                          className="w-full text-xs rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 py-2 px-3"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Dados Operacionais e Viagem */}
                  <div>
                    <h4 className="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-wider mb-3 flex items-center gap-1.5">
                      <Truck className="w-4 h-4 text-blue-600" />
                      Dados da Carga, Viagem e Histórico do Motorista
                    </h4>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                      <div>
                        <label className="block text-[11px] font-semibold text-gray-600 dark:text-gray-400 mb-1">
                          Renavam Cavalo/Truck *
                        </label>
                        <input
                          type="text"
                          value={truckRenavam}
                          onChange={(e) => setTruckRenavam(e.target.value)}
                          placeholder="Renavam do veículo"
                          className="w-full text-xs rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 py-2 px-3"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-gray-600 dark:text-gray-400 mb-1">
                          Histórico com o Cliente *
                        </label>
                        <select
                          value={driverHistory}
                          onChange={(e) => setDriverHistory(e.target.value as SigaDriverHistory)}
                          className="w-full text-xs rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 py-2 px-3 font-semibold"
                        >
                          <option value="Primeira viagem">Primeira viagem</option>
                          <option value="Com histórico">Com histórico</option>
                          <option value="Agregado">Agregado</option>
                          <option value="Frota">Frota</option>
                          <option value="Terceiro">Terceiro</option>
                        </select>
                      </div>

                      {driverHistory === 'Com histórico' && (
                        <>
                          <div>
                            <label className="block text-[11px] font-semibold text-gray-600 dark:text-gray-400 mb-1">
                              Qtd de Viagens Feitas *
                            </label>
                            <input
                              type="number"
                              value={tripsCount}
                              onChange={(e) => setTripsCount(e.target.value ? Number(e.target.value) : '')}
                              placeholder="Ex: 10"
                              className="w-full text-xs rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 py-2 px-3"
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] font-semibold text-gray-600 dark:text-gray-400 mb-1">
                              Data da Última Viagem *
                            </label>
                            <input
                              type="date"
                              value={lastTripAt}
                              onChange={(e) => setLastTripAt(e.target.value)}
                              className="w-full text-xs rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 py-2 px-3"
                            />
                          </div>
                        </>
                      )}

                      <div>
                        <label className="block text-[11px] font-semibold text-gray-600 dark:text-gray-400 mb-1">
                          Mercadoria Transportada
                        </label>
                        <input
                          type="text"
                          value={goodsType}
                          onChange={(e) => setGoodsType(e.target.value)}
                          placeholder="Ex: MILHO, SOJA, FERTILIZANTE"
                          className="w-full text-xs rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 py-2 px-3"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-gray-600 dark:text-gray-400 mb-1">
                          Valor Estimado da Carga (R$)
                        </label>
                        <input
                          type="number"
                          value={loadCost}
                          onChange={(e) => setLoadCost(e.target.value ? Number(e.target.value) : '')}
                          placeholder="Ex: 120000.00"
                          className="w-full text-xs rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 py-2 px-3"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-gray-600 dark:text-gray-400 mb-1">
                          Origem (Município - UF)
                        </label>
                        <input
                          type="text"
                          value={origin}
                          onChange={(e) => setOrigin(e.target.value)}
                          placeholder="Ex: Curitiba - PR"
                          className="w-full text-xs rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 py-2 px-3"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-gray-600 dark:text-gray-400 mb-1">
                          Destino (Município - UF)
                        </label>
                        <input
                          type="text"
                          value={destination}
                          onChange={(e) => setDestination(e.target.value)}
                          placeholder="Ex: Maringá - PR"
                          className="w-full text-xs rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 py-2 px-3"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Referências Comerciais (obrigatório 3 no Siga Plus) */}
                  {productName === 'siga_plus' && (
                    <div className="p-4 rounded-2xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 space-y-3">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-600" />
                        <h4 className="text-xs font-bold text-amber-900 dark:text-amber-300">
                          Contatos Comerciais do Motorista (Obrigatório 3 para SIGA PLUS)
                        </h4>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        {references.map((ref, idx) => (
                          <div key={idx} className="bg-white dark:bg-gray-800 p-2.5 rounded-xl border border-gray-200 dark:border-gray-700 space-y-2">
                            <span className="text-[10px] font-bold text-gray-400 uppercase">
                              Referência #{idx + 1}
                            </span>
                            <input
                              type="text"
                              value={ref.name}
                              onChange={(e) => {
                                const next = [...references];
                                next[idx].name = e.target.value;
                                setReferences(next);
                              }}
                              placeholder="Nome da empresa / contato"
                              className="w-full text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent py-1.5 px-2"
                            />
                            <input
                              type="text"
                              value={ref.phone}
                              onChange={(e) => {
                                const next = [...references];
                                next[idx].phone = autoFormatInput(e.target.value, 'phone');
                                setReferences(next);
                              }}
                              placeholder="Telefone (00) 00000-0000"
                              className="w-full text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent py-1.5 px-2"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-4 border-t border-gray-100 dark:border-gray-800">
                    <button
                      type="button"
                      onClick={() => setCreationStep(1)}
                      className="px-4 py-2 text-xs font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl"
                    >
                      ← Voltar
                    </button>

                    <button
                      type="submit"
                      disabled={isSubmittingFull}
                      className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold text-xs rounded-xl shadow-lg shadow-blue-500/20 flex items-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      {isSubmittingFull ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Despachando para a Fila de Atendimento...
                        </>
                      ) : (
                        <>
                          <Send className="w-4 h-4" />
                          Enviar Análise para Atendimento
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* TAB 2: HISTÓRICO & ACOMPANHAMENTO */}
          {activeTab === 'historico' && (
            <div className="space-y-4">
              {/* Filtros e Busca */}
              <div className="flex flex-col sm:flex-row items-center gap-3 justify-between">
                <div className="relative w-full sm:w-80">
                  <Search className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" />
                  <input
                    type="text"
                    value={searchFilter}
                    onChange={(e) => setSearchFilter(e.target.value)}
                    placeholder="Buscar por motorista, CPF, placa ou processo..."
                    className="w-full text-xs rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 py-2 pl-9 pr-3 focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <Filter className="w-3.5 h-3.5 text-gray-400" />
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="text-xs rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 py-2 px-3 font-semibold"
                  >
                    <option value="todos">Todos os Status</option>
                    <option value="draft">Rascunho</option>
                    <option value="awaiting_analysis">Aguardando Análise</option>
                    <option value="under_analysis">Em Análise</option>
                    <option value="pending">Com Pendências</option>
                    <option value="approved">Concluída (Aprovado)</option>
                    <option value="authorized_by_manager">Autorizado pelo Gestor</option>
                    <option value="denied">Encerrada (Não Recomendado)</option>
                  </select>
                </div>
              </div>

              {/* Lista / Tabela de Solicitações */}
              {filteredRequests.length === 0 ? (
                <div className="text-center py-12 border border-dashed border-gray-200 dark:border-gray-800 rounded-3xl bg-gray-50/50 dark:bg-gray-800/20">
                  <ShieldCheck className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                  <h4 className="text-sm font-bold text-gray-700 dark:text-gray-300">
                    Nenhuma análise encontrada
                  </h4>
                  <p className="text-xs text-gray-500 dark:text-gray-400 max-w-sm mx-auto mt-1">
                    Inicie uma nova solicitação na aba "Nova Análise" para começar a triagem com o SIGA GR.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredRequests.map((req) => {
                    const badge = getSigaStateBadgeInfo(req.state);
                    const isFinalApproved = req.state === 'approved' || req.state === 'authorized_by_manager';

                    return (
                      <div
                        key={req.id || req.processNumber}
                        className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700/80 hover:border-blue-300 dark:hover:border-blue-700 p-4 rounded-2xl shadow-xs transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
                      >
                        <div className="space-y-1.5 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono font-black text-xs text-gray-900 dark:text-white bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-lg">
                              #{req.processNumber}
                            </span>
                            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${badge.bg} ${badge.text} ${badge.border}`}>
                              {badge.label}
                            </span>
                            <span className="text-[10px] font-semibold text-gray-500 uppercase px-1.5 py-0.2 rounded-md bg-gray-50 dark:bg-gray-900">
                              {req.productName}
                            </span>
                            {req.vehicleType && (
                              <span className="text-[10px] text-gray-400">
                                • {req.vehicleType}
                              </span>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-3 text-xs text-gray-600 dark:text-gray-300">
                            <span className="font-bold text-gray-900 dark:text-white">
                              {req.driverName}
                            </span>
                            <span>CPF: {formatCpf(req.driverCpf)}</span>
                            <span>Placa: <strong className="font-mono">{req.truckPlate}</strong></span>
                            {req.origin && req.destination && (
                              <span className="text-gray-400">
                                ({req.origin} ➔ {req.destination})
                              </span>
                            )}
                          </div>

                          {/* Pendências ou Comentários */}
                          {(req.unsolvedIssuesCount ?? 0) > 0 && (
                            <div className="text-[11px] text-amber-600 font-bold flex items-center gap-1">
                              <AlertCircle className="w-3.5 h-3.5" />
                              {req.unsolvedIssuesCount} pendência(s) apontada(s) pelo analista
                            </div>
                          )}
                        </div>

                        {/* Botões de Ação */}
                        <div className="flex flex-wrap items-center gap-2">
                          {/* Atualizar Status */}
                          <button
                            onClick={() => handleRefreshProcess(req.processNumber)}
                            className="p-2 rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer"
                            title="Consultar status em tempo real no SIGA GR"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                          </button>

                          {/* Ver Detalhes */}
                          <button
                            onClick={() => {
                              setSelectedRecord(req);
                              setActiveTab('detalhes');
                            }}
                            className="px-3 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 text-blue-700 dark:text-blue-300 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            Detalhes
                          </button>

                          {/* Aplicar Código de Liberação ao Embarque */}
                          {isFinalApproved && onSelectApprovedCode && (
                            <button
                              onClick={() => {
                                onSelectApprovedCode(`SIGA-${req.processNumber}`, req.processNumber, req.shipmentId || selectedShipmentId);
                                showToast(`Código de liberação SIGA-${req.processNumber} aplicado!`, 'success');
                                onClose();
                              }}
                              className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
                              title="Copiar e vincular o número de processo como liberação do embarque"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Aplicar Liberação
                            </button>
                          )}

                          <button
                            onClick={() => handleDeleteRecord(req.processNumber)}
                            className="p-2 rounded-xl text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-all"
                            title="Remover do histórico"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: DETALHES DO PROCESSO */}
          {activeTab === 'detalhes' && selectedRecord && (
            <div className="space-y-6">
              {/* Card Resumo do Processo */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-3xl bg-gradient-to-r from-blue-900/10 via-indigo-900/10 to-transparent border border-blue-200 dark:border-blue-800">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 uppercase font-semibold">Número do Processo</span>
                    <span className="text-xl font-mono font-black text-gray-900 dark:text-white">
                      #{selectedRecord.processNumber}
                    </span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(selectedRecord.processNumber);
                        showToast('Número do processo copiado!', 'info');
                      }}
                      className="p-1 text-gray-400 hover:text-gray-600"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">
                    Motorista: <strong>{selectedRecord.driverName}</strong> (CPF: {formatCpf(selectedRecord.driverCpf)}) • Placa: <strong>{selectedRecord.truckPlate}</strong>
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <span className={`text-xs font-bold px-3 py-1 rounded-full border ${getSigaStateBadgeInfo(selectedRecord.state).bg} ${getSigaStateBadgeInfo(selectedRecord.state).text} ${getSigaStateBadgeInfo(selectedRecord.state).border}`}>
                    {getSigaStateBadgeInfo(selectedRecord.state).label}
                  </span>

                  <button
                    onClick={() => handleRefreshProcess(selectedRecord.processNumber)}
                    disabled={isRefreshingAnalysis}
                    className="px-3 py-1.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingAnalysis ? 'animate-spin' : ''}`} />
                    Atualizar Status
                  </button>

                  {['approved', 'authorized_by_manager'].includes(selectedRecord.state) && onSelectApprovedCode && (
                    <button
                      onClick={() => {
                        onSelectApprovedCode(`SIGA-${selectedRecord.processNumber}`, selectedRecord.processNumber, selectedRecord.shipmentId || selectedShipmentId);
                        showToast(`Código de liberação SIGA-${selectedRecord.processNumber} aplicado!`, 'success');
                        onClose();
                      }}
                      className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
                      title="Aplicar liberação ao embarque"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Aplicar no Embarque
                    </button>
                  )}
                </div>
              </div>

              {/* Fluxo Visual da Análise (Workflow Stepper) */}
              <div className="bg-gray-50 dark:bg-gray-800/40 p-4 rounded-2xl border border-gray-100 dark:border-gray-800">
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block mb-3">
                  Etapa do Fluxo no SIGA GR
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2 text-center text-xs">
                  {[
                    { key: 'draft', label: 'Rascunho' },
                    { key: 'awaiting_analysis', label: 'Ag. Análise' },
                    { key: 'under_analysis', label: 'Em Análise' },
                    { key: 'pending', label: 'Pendências' },
                    { key: 'awaiting_reanalysis', label: 'Reanálise' },
                    { key: 'approved', label: 'Concluída' },
                  ].map((step, idx) => {
                    const isCurrent = selectedRecord.state === step.key;
                    return (
                      <div
                        key={step.key}
                        className={`p-2.5 rounded-xl border font-bold transition-all ${
                          isCurrent
                            ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                            : 'bg-white dark:bg-gray-800 text-gray-500 border-gray-200 dark:border-gray-700'
                        }`}
                      >
                        <span className="text-[10px] block opacity-70">Passo {idx + 1}</span>
                        {step.label}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Pendências (Issues) */}
              {selectedRecord.rawAnalysis?.issues && selectedRecord.rawAnalysis.issues.length > 0 && (
                <div className="p-4 rounded-2xl bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 space-y-3">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    <h4 className="text-xs font-bold text-amber-900 dark:text-amber-200">
                      Pendências Reportadas pelo Analista ({selectedRecord.rawAnalysis.issues.length})
                    </h4>
                  </div>
                  <div className="space-y-2">
                    {selectedRecord.rawAnalysis.issues.map((issue) => (
                      <div key={issue.id} className="p-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 text-xs">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-bold text-gray-900 dark:text-white">{issue.reason}</span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${issue.solved ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                            {issue.solved ? 'Resolvido' : 'Pendente'}
                          </span>
                        </div>
                        {issue.body && <p className="text-gray-600 dark:text-gray-300">{issue.body}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Comentários da Central */}
              {selectedRecord.rawAnalysis?.comments && selectedRecord.rawAnalysis.comments.length > 0 && (
                <div className="p-4 rounded-2xl bg-gray-50 dark:bg-gray-800/40 border border-gray-200 dark:border-gray-700 space-y-3">
                  <h4 className="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-wider">
                    Comentários e Pareceres da Central
                  </h4>
                  <div className="space-y-2">
                    {selectedRecord.rawAnalysis.comments.map((comment) => (
                      <div key={comment.id} className="p-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 text-xs space-y-1">
                        <div className="flex items-center justify-between text-gray-400 text-[11px]">
                          <span>{comment.author?.fullname || 'Analista SIGA'}</span>
                          <span>{comment.created_at ? new Date(comment.created_at).toLocaleString('pt-BR') : ''}</span>
                        </div>
                        <p className="text-gray-800 dark:text-gray-200">{comment.body}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Painel do Simulador (Homologação) */}
              {config.environment === 'staging' && (
                <div className="p-4 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-900/50 space-y-3">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-indigo-600" />
                    <div>
                      <h4 className="text-xs font-bold text-indigo-900 dark:text-indigo-200">
                        Simulador de Atendimento (Ambiente de Homologação)
                      </h4>
                      <p className="text-[11px] text-indigo-700 dark:text-indigo-300">
                        Como não há analistas trabalhando na homologação, dispare as tags abaixo para simular a resposta (leva até 5 minutos no SIGA):
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <button
                      onClick={() => handleSimulateTag(selectedRecord.processNumber, 'simulate_approval')}
                      disabled={isSimulating}
                      className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5" />
                      Simular Aprovação (approved)
                    </button>

                    <button
                      onClick={() => handleSimulateTag(selectedRecord.processNumber, 'simulate_denial')}
                      disabled={isSimulating}
                      className="px-3 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                      Simular Reprovação (denied)
                    </button>

                    <button
                      onClick={() => handleSimulateTag(selectedRecord.processNumber, 'simulate_authorization')}
                      disabled={isSimulating}
                      className="px-3 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer"
                    >
                      <ShieldCheck className="w-3.5 h-3.5" />
                      Simular Autorização pelo Gestor
                    </button>

                    <button
                      onClick={() => handleSimulateTag(selectedRecord.processNumber, 'simulate_issue')}
                      disabled={isSimulating}
                      className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer"
                    >
                      <AlertTriangle className="w-3.5 h-3.5" />
                      Simular Pendência
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: CONFIGURAÇÕES */}
          {activeTab === 'configuracoes' && (
            <form onSubmit={handleSaveConfig} className="space-y-6 max-w-2xl mx-auto">
              <div className="bg-blue-50/60 dark:bg-blue-950/20 p-4 rounded-2xl border border-blue-100 dark:border-blue-900/40">
                <h4 className="text-xs font-bold text-blue-900 dark:text-blue-200 flex items-center gap-1.5 mb-1">
                  <ShieldCheck className="w-4 h-4 text-blue-600" />
                  Credenciais de Acesso à API do SIGA GR
                </h4>
                <p className="text-[11px] text-blue-800 dark:text-blue-300">
                  Solicite suas chaves de acesso (homologação e produção) diretamente com o suporte SIGA através do e-mail <strong>antonio.s.m.gatto@gmail.com</strong>.
                </p>
              </div>

              {/* Ambiente */}
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                  Ambiente de Execução *
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setConfig({ ...config, environment: 'staging', apiUrl: 'https://api.staging.sigagr.com.br' })}
                    className={`p-3 rounded-2xl border text-left transition-all ${
                      config.environment === 'staging'
                        ? 'border-blue-600 bg-blue-50/60 dark:bg-blue-950/40 font-bold text-blue-700 dark:text-blue-300'
                        : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                    }`}
                  >
                    <span className="text-xs block">Homologação (Staging)</span>
                    <span className="text-[10px] text-gray-400 font-mono">https://api.staging.sigagr.com.br</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setConfig({ ...config, environment: 'production', apiUrl: 'https://api.sigagr.com.br' })}
                    className={`p-3 rounded-2xl border text-left transition-all ${
                      config.environment === 'production'
                        ? 'border-emerald-600 bg-emerald-50/60 dark:bg-emerald-950/40 font-bold text-emerald-700 dark:text-emerald-300'
                        : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                    }`}
                  >
                    <span className="text-xs block">Produção (Oficial)</span>
                    <span className="text-[10px] text-gray-400 font-mono">https://api.sigagr.com.br</span>
                  </button>
                </div>
              </div>

              {/* E-mail e Senha */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                    E-mail da Chave de Acesso *
                  </label>
                  <input
                    type="email"
                    value={config.email}
                    onChange={(e) => setConfig({ ...config, email: e.target.value })}
                    placeholder="usuario@empresa.com.br"
                    required
                    className="w-full text-xs rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 py-2.5 px-3 focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                    Senha de Integração *
                  </label>
                  <input
                    type="password"
                    value={config.password || ''}
                    onChange={(e) => setConfig({ ...config, password: e.target.value })}
                    placeholder="••••••••••••"
                    className="w-full text-xs rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 py-2.5 px-3 focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Dados do Embarcador */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                    E-mail do Embarcador Padrão
                  </label>
                  <input
                    type="email"
                    value={config.requesterEmail || ''}
                    onChange={(e) => setConfig({ ...config, requesterEmail: e.target.value })}
                    placeholder="embarcador@transcunha.com.br"
                    className="w-full text-xs rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 py-2.5 px-3 focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                    Unidade de Negócio Padrão
                  </label>
                  <input
                    type="text"
                    value={config.businessUnit || ''}
                    onChange={(e) => setConfig({ ...config, businessUnit: e.target.value })}
                    placeholder="Ex: 33 - Agronegócio"
                    className="w-full text-xs rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 py-2.5 px-3 focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Botões de Ação */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-gray-100 dark:border-gray-800">
                <button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={isTestingAuth || !config.email}
                  className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 hover:bg-blue-100 text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                >
                  {isTestingAuth ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Testando Conexão...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" />
                      Testar Conexão e Autenticar
                    </>
                  )}
                </button>

                <button
                  type="submit"
                  disabled={isSavingConfig}
                  className="w-full sm:w-auto px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-md shadow-blue-500/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isSavingConfig ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  Salvar Configurações
                </button>
              </div>

              {authStatus === 'success' && (
                <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-xl text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  Conexão e autenticação estabelecidas com sucesso no SIGA GR!
                </div>
              )}

              {authStatus === 'error' && (
                <div className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl text-xs text-red-700 dark:text-red-300 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  {authErrorMessage || 'Falha ao autenticar no SIGA GR.'}
                </div>
              )}
            </form>
          )}

        </div>
      </div>
    </div>
  );
};
