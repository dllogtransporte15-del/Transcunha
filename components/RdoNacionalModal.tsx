import React, { useState, useEffect, useMemo } from 'react';
import { 
  ShieldCheck, ShieldAlert, FileText, CheckCircle2, Clock, AlertTriangle, 
  Search, Copy, Settings, Send, Upload, User as UserIcon, Truck, 
  Calendar, X, Eye, Check, Loader2, Sparkles, Filter, RefreshCw
} from 'lucide-react';
import type { 
  Driver, Shipment, Vehicle, Owner, User, RdoRequestRecord, RdoConfig, RdoExtensaoArquivo, SigaRequestRecord 
} from '../types';
import { useToast } from '../hooks/useToast';
import { 
  submitRdoSolicitacao, 
  cleanDocumentNumber, 
  cleanPlate, 
  fileToBase64, 
  urlToBase64,
  testRdoConnection
} from '../services/rdoNacionalService';
import { 
  fetchRdoRequests, 
  fetchRdoConfig, 
  saveRdoConfig,
  fetchShipments,
  fetchDrivers,
  fetchVehicles,
  fetchOwners,
  fetchSigaRequests,
  upsertShipment
} from '../lib/db';
import { autoFormatInput } from '../utils/formatters';


// Utilitário: Normaliza qualquer formato de data para o padrão HTML YYYY-MM-DD
function normalizeDateToYyyyMmDd(val?: string | null): string {
  if (!val) return '';
  const clean = String(val).trim();
  // Se for DD/MM/AAAA ou DD-MM-AAAA
  const matchBr = clean.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (matchBr) {
    const [, d, m, y] = matchBr;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  // Se for ISO string AAAA-MM-DDTHH:mm:ss
  if (clean.includes('T')) {
    return clean.split('T')[0];
  }
  // Se já for AAAA-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
    return clean;
  }
  return clean;
}

// Utilitário: Extrai URL de CNH em anexo no embarque ou motorista
function extractCnhUrlFromShipment(s?: Shipment | null, matchedDriver?: Driver | null): string | undefined {
  if (!s) return undefined;
  if (s.documents && typeof s.documents === 'object') {
    const docs = s.documents as Record<string, any>;
    const cnhKeyCandidates = [
      'cnh', 'cnh_url', 'cnhurl', 'cnhfile', 'cnh_file',
      'cnh do motorista', 'cnh motorista', 'documento motorista',
      'documentos motorista', 'comprovante de cadastro', 'cadastro', 'habilitacao'
    ];
    for (const [key, val] of Object.entries(docs)) {
      const kLower = key.toLowerCase().trim();
      const isCandidate = cnhKeyCandidates.some(c => kLower === c || kLower.includes('cnh') || kLower.includes('habilitacao'));
      if (isCandidate) {
        if (typeof val === 'string' && (val.startsWith('http') || val.startsWith('data:') || val.startsWith('blob:'))) {
          return val;
        }
        if (Array.isArray(val) && val.length > 0) {
          const first = val[0];
          if (typeof first === 'string' && (first.startsWith('http') || first.startsWith('data:') || first.startsWith('blob:'))) {
            return first;
          }
        }
      }
    }
    // Procura em arrays gerais por nomes de arquivo que contenham 'cnh'
    for (const [, val] of Object.entries(docs)) {
      const list = Array.isArray(val) ? val : [val];
      for (const item of list) {
        if (typeof item === 'string' && (item.startsWith('http') || item.startsWith('data:')) && /cnh|habilitacao|carteira/i.test(item)) {
          return item;
        }
      }
    }
  }

  if (matchedDriver) {
    const dCnh = matchedDriver.cnhAttachmentUrl || (matchedDriver as any)?.cnh_url || (matchedDriver as any)?.cnhFile;
    if (typeof dCnh === 'string' && (dCnh.startsWith('http') || dCnh.startsWith('data:') || dCnh.startsWith('blob:'))) {
      return dCnh;
    }
  }

  return undefined;
}

// Utilitário: Cache persistente local de perfil complementar de motoristas (Mãe, Nascimento, CNH)
function getCachedDriverProfile(cpf?: string): { nomeDaMae?: string; dataDeNascimento?: string; cnhUrl?: string } | null {
  const clean = cleanDocumentNumber(cpf);
  if (!clean) return null;
  try {
    const raw = localStorage.getItem('transcunha_driver_profiles_cache');
    if (!raw) return null;
    const cache = JSON.parse(raw);
    return cache[clean] || null;
  } catch {
    return null;
  }
}

function saveDriverProfileCache(cpf?: string, data?: { nomeDaMae?: string; dataDeNascimento?: string; cnhUrl?: string }) {
  const clean = cleanDocumentNumber(cpf);
  if (!clean || !data) return;
  try {
    const raw = localStorage.getItem('transcunha_driver_profiles_cache') || '{}';
    const cache = JSON.parse(raw);
    cache[clean] = {
      ...(cache[clean] || {}),
      ...(data.nomeDaMae ? { nomeDaMae: data.nomeDaMae.trim().toUpperCase() } : {}),
      ...(data.dataDeNascimento ? { dataDeNascimento: normalizeDateToYyyyMmDd(data.dataDeNascimento) } : {}),
      ...(data.cnhUrl ? { cnhUrl: data.cnhUrl } : {}),
      updatedAt: new Date().toISOString()
    };
    localStorage.setItem('transcunha_driver_profiles_cache', JSON.stringify(cache));
  } catch {}
}

interface RdoNacionalModalProps {
  isOpen: boolean;
  onClose: () => void;
  shipments?: Shipment[];
  drivers?: Driver[];
  vehicles?: Vehicle[];
  owners?: Owner[];
  currentUser: User | null;
  initialShipmentId?: string;
  initialDriverId?: string;
  onSelectApprovedCode?: (code: string, shipmentId?: string) => void;
}

type TabType = 'nova_solicitacao' | 'historico' | 'configuracoes';

export const RdoNacionalModal: React.FC<RdoNacionalModalProps> = ({
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
  const [config, setConfig] = useState<RdoConfig>({
    apiToken: '',
    callbackToken: '',
    apiUrl: 'https://painel.mrbsolucoes.com.br',
    clientName: 'TRANSCUNHA TRANSPORTES',
    enabled: true,
    autoApproveInRisk: true,
  });
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [showTokens, setShowTokens] = useState(false);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [connectionMessage, setConnectionMessage] = useState('');

  // Histórico
  const [rdoRequests, setRdoRequests] = useState<RdoRequestRecord[]>([]);
  const [isLoadingRequests, setIsLoadingRequests] = useState(false);
  const [searchFilter, setSearchFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'todos' | 'pendente' | 'aprovado' | 'consta_informacao'>('todos');

  // Estados de Entidades Locais com Fallback automático
  const [availableShipments, setAvailableShipments] = useState<Shipment[]>(shipments || []);
  const [availableDrivers, setAvailableDrivers] = useState<Driver[]>(drivers || []);
  const [availableVehicles, setAvailableVehicles] = useState<Vehicle[]>(vehicles || []);
  const [availableOwners, setAvailableOwners] = useState<Owner[]>(owners || []);
  const [sigaRequests, setSigaRequests] = useState<SigaRequestRecord[]>([]);
  const [isLoadingCnh, setIsLoadingCnh] = useState(false);

  // Formulário de Nova Solicitação
  const [selectedShipmentId, setSelectedShipmentId] = useState<string>(initialShipmentId || '');
  const [selectedDriverId, setSelectedDriverId] = useState<string>(initialDriverId || '');
  
  const [formData, setFormData] = useState({
    nomeDoCliente: 'TRANSCUNHA TRANSPORTES',
    cpf: '',
    nome: '',
    nomeDaMae: '',
    dataDeNascimento: '',
    documentoDoProprietario: '',
    nomeDoProprietario: '',
    placaDoCavalo: '',
  });

  const [cnhFile, setCnhFile] = useState<File | null>(null);
  const [cnhBase64, setCnhBase64] = useState<string>('');
  const [cnhExtensao, setCnhExtensao] = useState<RdoExtensaoArquivo>('pdf');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);

  // Embarque selecionado computado
  const selectedShipment = useMemo(() => {
    return availableShipments.find(s => s.id === selectedShipmentId);
  }, [availableShipments, selectedShipmentId]);

  // Função Central de Preenchimento Automático Rigoroso a partir do Embarque
  const autoFillFromShipment = async (
    targetShipment: Shipment,
    driverPool = availableDrivers,
    ownerPool = availableOwners,
    vehiclePool = availableVehicles,
    rdoPool = rdoRequests,
    sigaPool = sigaRequests
  ) => {
    if (!targetShipment) return;

    const cleanCpf = cleanDocumentNumber(targetShipment.driverCpf);

    // Identificar Motorista
    const matchedDriver = driverPool.find(d => 
      (cleanCpf && cleanDocumentNumber(d.cpf) === cleanCpf) ||
      (d.name && targetShipment.driverName && d.name.toLowerCase().trim() === targetShipment.driverName.toLowerCase().trim())
    );

    // Identificar Veículo
    const cleanHorsePlate = cleanPlate(targetShipment.horsePlate);
    const matchedVehicle = vehiclePool.find(v => cleanPlate(v.plate) === cleanHorsePlate);

    // Identificar Proprietário
    const cleanOwnerDoc = cleanDocumentNumber(targetShipment.anttOwnerIdentifier);
    const matchedOwner = ownerPool.find(o => 
      (cleanOwnerDoc && cleanDocumentNumber(o.cpfCnpj) === cleanOwnerDoc) ||
      (targetShipment.ownerName && o.name && o.name.toLowerCase().trim() === targetShipment.ownerName.toLowerCase().trim()) ||
      (matchedVehicle?.ownerId && o.id === matchedVehicle.ownerId) ||
      (matchedDriver?.ownerId && o.id === matchedDriver.ownerId)
    );

    // Histórico de análises anteriores e cache local
    const prevRdo = rdoPool.find(r => cleanDocumentNumber(r.cpf) === cleanCpf && (r.nomeDaMae || r.dataDeNascimento || r.cnhUrl));
    const prevSiga = sigaPool.find(r => cleanDocumentNumber(r.driverCpf) === cleanCpf && (r.driverMother || (r as any).mother || r.driverBirthdate || (r as any).birthdate));
    const cachedProfile = getCachedDriverProfile(cleanCpf);

    // Outros embarques do mesmo motorista como fallback
    const otherShipmentWithData = availableShipments.find(s => 
      cleanDocumentNumber(s.driverCpf) === cleanCpf && 
      (s.driverMotherName || (s.documents as any)?.nome_da_mae || s.driverBirthDate || (s.documents as any)?.data_nascimento)
    );

    // 1. Resolução do Nome Completo da Mãe (Cascata de Fontes)
    const resolvedNomeDaMae = (
      targetShipment.driverMotherName ||
      (targetShipment as any).motherName ||
      (targetShipment as any).nomeDaMae ||
      (targetShipment.documents as any)?.driver_mother_name ||
      (targetShipment.documents as any)?.nome_da_mae ||
      (targetShipment.documents as any)?.driver_mother ||
      (targetShipment.documents as any)?.mother_name ||
      (targetShipment.documents as any)?.mae ||
      (targetShipment.documents as any)?.mother ||
      (targetShipment.documents as any)?.cadastro?.mother_name ||
      (targetShipment.documents as any)?.cadastro?.nome_da_mae ||
      matchedDriver?.motherName ||
      (matchedDriver as any)?.mother_name ||
      (matchedDriver as any)?.nome_da_mae ||
      prevRdo?.nomeDaMae ||
      prevSiga?.driverMother ||
      (prevSiga as any)?.mother ||
      otherShipmentWithData?.driverMotherName ||
      (otherShipmentWithData?.documents as any)?.nome_da_mae ||
      cachedProfile?.nomeDaMae ||
      ''
    ).trim().toUpperCase();

    // 2. Resolução da Data de Nascimento (Normalizada para YYYY-MM-DD)
    const rawBirthDate = (
      targetShipment.driverBirthDate ||
      (targetShipment as any).birthDate ||
      (targetShipment as any).dataDeNascimento ||
      (targetShipment.documents as any)?.driver_birth_date ||
      (targetShipment.documents as any)?.data_nascimento ||
      (targetShipment.documents as any)?.dataDeNascimento ||
      (targetShipment.documents as any)?.birthdate ||
      (targetShipment.documents as any)?.birth_date ||
      (targetShipment.documents as any)?.cadastro?.birth_date ||
      (targetShipment.documents as any)?.cadastro?.data_nascimento ||
      matchedDriver?.birthDate ||
      (matchedDriver as any)?.birth_date ||
      (matchedDriver as any)?.data_nascimento ||
      prevRdo?.dataDeNascimento ||
      prevSiga?.driverBirthdate ||
      (prevSiga as any)?.birthdate ||
      otherShipmentWithData?.driverBirthDate ||
      (otherShipmentWithData?.documents as any)?.data_nascimento ||
      cachedProfile?.dataDeNascimento ||
      ''
    );
    const resolvedDataNascimento = normalizeDateToYyyyMmDd(rawBirthDate);

    // 3. Documento do Proprietário
    const rawPropDoc = targetShipment.anttOwnerIdentifier || matchedOwner?.cpfCnpj || (targetShipment.documents as any)?.antt_owner_identifier || '';
    const cleanPropDoc = cleanDocumentNumber(rawPropDoc);
    const formattedPropDoc = cleanPropDoc.length > 11 ? autoFormatInput('cnpj', rawPropDoc) : autoFormatInput('cpf', rawPropDoc);

    // 4. Nome / Razão Social do Proprietário
    const resolvedNomeProp = (targetShipment.ownerName || matchedOwner?.name || (targetShipment.documents as any)?.owner_name || '').trim().toUpperCase();

    // 5. CPF e Nome do Motorista
    const resolvedCpf = autoFormatInput('cpf', cleanCpf || matchedDriver?.cpf || '');
    const resolvedNome = (targetShipment.driverName || matchedDriver?.name || '').trim().toUpperCase();

    // 6. Atualizar os Dados do Formulário
    setFormData(prev => ({
      ...prev,
      nomeDoCliente: config.clientName || 'TRANSCUNHA TRANSPORTES',
      cpf: resolvedCpf,
      nome: resolvedNome,
      nomeDaMae: resolvedNomeDaMae,
      dataDeNascimento: resolvedDataNascimento,
      documentoDoProprietario: formattedPropDoc,
      nomeDoProprietario: resolvedNomeProp,
      placaDoCavalo: cleanHorsePlate,
    }));

    if (matchedDriver) {
      setSelectedDriverId(matchedDriver.id);
    }

    // 7. Auto-recuperação e conversão Base64 da CNH do Embarque
    const foundCnhUrl = extractCnhUrlFromShipment(targetShipment, matchedDriver) || prevRdo?.cnhUrl || cachedProfile?.cnhUrl;
    if (foundCnhUrl) {
      if (foundCnhUrl.startsWith('data:')) {
        try {
          const parts = foundCnhUrl.split(',');
          const pureBase64 = parts[1] || parts[0];
          let extension: RdoExtensaoArquivo = 'pdf';
          if (foundCnhUrl.includes('image/png')) extension = 'png';
          else if (foundCnhUrl.includes('image/jpeg') || foundCnhUrl.includes('image/jpg')) extension = 'jpg';
          setCnhBase64(pureBase64);
          setCnhExtensao(extension);
          const safeName = `CNH_${(resolvedNome || 'Motorista').replace(/\s+/g, '_')}.${extension}`;
          setCnhFile(new File([''], safeName, { type: extension === 'pdf' ? 'application/pdf' : `image/${extension}` }));
        } catch (err) {
          console.warn('Erro ao processar CNH Base64:', err);
        }
      } else {
        setIsLoadingCnh(true);
        urlToBase64(foundCnhUrl)
          .then(({ base64, extension }) => {
            setCnhBase64(base64);
            setCnhExtensao(extension);
            const safeName = `CNH_${(resolvedNome || 'Motorista').replace(/\s+/g, '_')}.${extension}`;
            setCnhFile(new File([''], safeName, { type: extension === 'pdf' ? 'application/pdf' : `image/${extension}` }));
            showToast(`CNH do motorista (${safeName}) vinculada automaticamente do embarque.`, 'info');
          })
          .catch(err => {
            console.warn('Erro ao carregar URL da CNH para RDO:', err);
          })
          .finally(() => {
            setIsLoadingCnh(false);
          });
      }
    }
  };

  // Preenchimento Automático ao Selecionar Motorista da Base
  const autoFillFromDriver = async (
    d: Driver,
    ownerPool = availableOwners,
    vehiclePool = availableVehicles,
    rdoPool = rdoRequests,
    sigaPool = sigaRequests
  ) => {
    if (!d) return;

    const cleanCpf = cleanDocumentNumber(d.cpf);
    const matchedOwner = ownerPool.find(o => o.id === d.ownerId);

    // Tentar encontrar embarque ou veículo deste motorista
    const activeShipment = availableShipments.find(s => cleanDocumentNumber(s.driverCpf) === cleanCpf);
    const cleanHorsePlate = cleanPlate(activeShipment?.horsePlate || '');

    const prevRdo = rdoPool.find(r => cleanDocumentNumber(r.cpf) === cleanCpf && (r.nomeDaMae || r.dataDeNascimento || r.cnhUrl));
    const prevSiga = sigaPool.find(r => cleanDocumentNumber(r.driverCpf) === cleanCpf && (r.driverMother || (r as any).mother || r.driverBirthdate || (r as any).birthdate));
    const cachedProfile = getCachedDriverProfile(cleanCpf);

    const resolvedNomeDaMae = (
      d.motherName ||
      (d as any)?.mother_name ||
      (d as any)?.nome_da_mae ||
      activeShipment?.driverMotherName ||
      (activeShipment?.documents as any)?.nome_da_mae ||
      prevRdo?.nomeDaMae ||
      prevSiga?.driverMother ||
      (prevSiga as any)?.mother ||
      cachedProfile?.nomeDaMae ||
      ''
    ).trim().toUpperCase();

    const rawBirthDate = (
      d.birthDate ||
      (d as any)?.birth_date ||
      (d as any)?.data_nascimento ||
      activeShipment?.driverBirthDate ||
      (activeShipment?.documents as any)?.data_nascimento ||
      prevRdo?.dataDeNascimento ||
      prevSiga?.driverBirthdate ||
      (prevSiga as any)?.birthdate ||
      cachedProfile?.dataDeNascimento ||
      ''
    );
    const resolvedDataNascimento = normalizeDateToYyyyMmDd(rawBirthDate);

    const rawPropDoc = matchedOwner?.cpfCnpj || activeShipment?.anttOwnerIdentifier || '';
    const cleanPropDoc = cleanDocumentNumber(rawPropDoc);
    const formattedPropDoc = cleanPropDoc.length > 11 ? autoFormatInput('cnpj', rawPropDoc) : autoFormatInput('cpf', rawPropDoc);
    const resolvedNomeProp = (matchedOwner?.name || activeShipment?.ownerName || '').trim().toUpperCase();

    setFormData(prev => ({
      ...prev,
      nomeDoCliente: config.clientName || 'TRANSCUNHA TRANSPORTES',
      cpf: autoFormatInput('cpf', cleanCpf),
      nome: (d.name || '').trim().toUpperCase(),
      nomeDaMae: resolvedNomeDaMae,
      dataDeNascimento: resolvedDataNascimento,
      documentoDoProprietario: formattedPropDoc,
      nomeDoProprietario: resolvedNomeProp,
      placaDoCavalo: cleanHorsePlate || prev.placaDoCavalo,
    }));

    if (activeShipment) {
      setSelectedShipmentId(activeShipment.id);
    }

    const foundCnhUrl = d.cnhAttachmentUrl || (d as any)?.cnh_url || (activeShipment ? extractCnhUrlFromShipment(activeShipment, d) : undefined) || prevRdo?.cnhUrl || cachedProfile?.cnhUrl;
    if (foundCnhUrl) {
      if (foundCnhUrl.startsWith('data:')) {
        try {
          const parts = foundCnhUrl.split(',');
          const pureBase64 = parts[1] || parts[0];
          let extension: RdoExtensaoArquivo = 'pdf';
          if (foundCnhUrl.includes('image/png')) extension = 'png';
          else if (foundCnhUrl.includes('image/jpeg') || foundCnhUrl.includes('image/jpg')) extension = 'jpg';
          setCnhBase64(pureBase64);
          setCnhExtensao(extension);
          const safeName = `CNH_${(d.name || 'Motorista').replace(/\s+/g, '_')}.${extension}`;
          setCnhFile(new File([''], safeName, { type: extension === 'pdf' ? 'application/pdf' : `image/${extension}` }));
        } catch {}
      } else {
        setIsLoadingCnh(true);
        urlToBase64(foundCnhUrl)
          .then(({ base64, extension }) => {
            setCnhBase64(base64);
            setCnhExtensao(extension);
            const safeName = `CNH_${(d.name || 'Motorista').replace(/\s+/g, '_')}.${extension}`;
            setCnhFile(new File([''], safeName, { type: extension === 'pdf' ? 'application/pdf' : `image/${extension}` }));
            showToast(`CNH do motorista (${safeName}) vinculada automaticamente.`, 'info');
          })
          .catch(err => {
            console.warn('Erro ao carregar URL da CNH:', err);
          })
          .finally(() => {
            setIsLoadingCnh(false);
          });
      }
    }
  };

  // Carrega configurações, histórico e entidades ausentes ao abrir
  useEffect(() => {
    if (!isOpen) return;

    const loadData = async () => {
      setIsLoadingRequests(true);
      try {
        const loadedConfig = await fetchRdoConfig();
        setConfig(loadedConfig);
        setFormData(prev => ({
          ...prev,
          nomeDoCliente: loadedConfig.clientName || 'TRANSCUNHA TRANSPORTES'
        }));

        const list = await fetchRdoRequests();
        setRdoRequests(list);

        // Carregar entidades auxiliares caso não venham passadas nas props
        let curShipments = shipments;
        if (!curShipments || curShipments.length === 0) {
          curShipments = await fetchShipments();
          if (curShipments && curShipments.length > 0) setAvailableShipments(curShipments);
        } else {
          setAvailableShipments(shipments);
        }

        let curDrivers = drivers;
        if (!curDrivers || curDrivers.length === 0) {
          curDrivers = await fetchDrivers();
          if (curDrivers && curDrivers.length > 0) setAvailableDrivers(curDrivers);
        } else {
          setAvailableDrivers(drivers);
        }

        let curVehicles = vehicles;
        if (!curVehicles || curVehicles.length === 0) {
          curVehicles = await fetchVehicles();
          if (curVehicles && curVehicles.length > 0) setAvailableVehicles(curVehicles);
        } else {
          setAvailableVehicles(vehicles);
        }

        let curOwners = owners;
        if (!curOwners || curOwners.length === 0) {
          curOwners = await fetchOwners();
          if (curOwners && curOwners.length > 0) setAvailableOwners(curOwners);
        } else {
          setAvailableOwners(owners);
        }

        const loadedSiga = await fetchSigaRequests();
        setSigaRequests(loadedSiga || []);

        // Executar auto-preenchimento inicial se houver initialShipmentId ou initialDriverId
        if (initialShipmentId) {
          setSelectedShipmentId(initialShipmentId);
          const s = (curShipments || []).find(item => item.id === initialShipmentId);
          if (s) {
            autoFillFromShipment(s, curDrivers, curOwners, curVehicles, list, loadedSiga);
          }
        } else if (initialDriverId) {
          setSelectedDriverId(initialDriverId);
          const d = (curDrivers || []).find(item => item.id === initialDriverId);
          if (d) {
            autoFillFromDriver(d, curOwners, curVehicles, list, loadedSiga);
          }
        }
      } catch (err) {
        console.warn('Erro ao carregar dados do RDO:', err);
      } finally {
        setIsLoadingRequests(false);
      }
    };

    loadData();

    // Listener realtime de mudanças no RDO
    const handleRdoChanged = () => {
      fetchRdoRequests().then(setRdoRequests);
    };

    window.addEventListener('transcunha:rdo_changed', handleRdoChanged);
    return () => {
      window.removeEventListener('transcunha:rdo_changed', handleRdoChanged);
    };
  }, [isOpen]);

  // Ao trocar o embarque selecionado
  const handleShipmentSelect = (shipmentId: string) => {
    setSelectedShipmentId(shipmentId);
    if (!shipmentId) {
      setFormData(prev => ({
        ...prev,
        cpf: '',
        nome: '',
        nomeDaMae: '',
        dataDeNascimento: '',
        documentoDoProprietario: '',
        nomeDoProprietario: '',
        placaDoCavalo: '',
      }));
      setCnhFile(null);
      setCnhBase64('');
      return;
    }

    const s = availableShipments.find(item => item.id === shipmentId);
    if (s) {
      autoFillFromShipment(s);
    }
  };

  // Ao trocar o motorista selecionado
  const handleDriverSelect = (driverId: string) => {
    setSelectedDriverId(driverId);
    if (!driverId) return;

    const d = availableDrivers.find(item => item.id === driverId);
    if (d) {
      autoFillFromDriver(d);
    }
  };

  // Upload e conversão de arquivo CNH para Base64
  const handleCnhChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const { base64, extension } = await fileToBase64(file);
      setCnhFile(file);
      setCnhBase64(base64);
      setCnhExtensao(extension);
      showToast(`Arquivo "${file.name}" anexado e preparado para envio.`, 'success');
    } catch (err: any) {
      showToast('Erro ao processar o arquivo da CNH: ' + err.message, 'error');
    }
  };

  // Salvar Configurações
  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingConfig(true);
    try {
      await saveRdoConfig(config);
      showToast('Configurações do RDO Nacional salvas com sucesso!', 'success');
    } catch (err: any) {
      showToast('Erro ao salvar configurações: ' + err.message, 'error');
    } finally {
      setIsSavingConfig(false);
    }
  };

  // Testar Conexão com o RDO Nacional
  const handleTestConnection = async () => {
    setIsTestingConnection(true);
    setConnectionStatus('idle');
    setConnectionMessage('');
    try {
      const res = await testRdoConnection(config.apiToken, config.apiUrl);
      if (res.success) {
        setConnectionStatus('success');
        setConnectionMessage(res.message);
        showToast(res.message, 'success');
      } else {
        setConnectionStatus('error');
        setConnectionMessage(res.message);
        showToast(res.message, 'error');
      }
    } catch (err: any) {
      const msg = err?.message || 'Falha ao conectar no servidor do RDO Nacional.';
      setConnectionStatus('error');
      setConnectionMessage(msg);
      showToast(msg, 'error');
    } finally {
      setIsTestingConnection(false);
    }
  };

  // Submeter Solicitação para o RDO Nacional
  const handleSubmitSolicitacao = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!config.apiToken || !config.apiToken.trim()) {
      showToast('Token de Integração não informado! Acesse a aba Configurações e salve seu token.', 'warning');
      setActiveTab('configuracoes');
      return;
    }

    const cleanCpfVal = cleanDocumentNumber(formData.cpf);
    if (!cleanCpfVal || cleanCpfVal.length !== 11) {
      showToast('CPF do motorista inválido! O CPF deve conter 11 dígitos.', 'warning');
      return;
    }

    if (!formData.nome.trim()) {
      showToast('O nome do motorista é obrigatório.', 'warning');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await submitRdoSolicitacao(
        {
          nomeDoCliente: formData.nomeDoCliente || config.clientName,
          cpf: cleanCpfVal,
          nome: formData.nome,
          nomeDaMae: formData.nomeDaMae || undefined,
          dataDeNascimento: formData.dataDeNascimento || undefined,
          documentoDoProprietario: formData.documentoDoProprietario || undefined,
          nomeDoProprietario: formData.nomeDoProprietario || undefined,
          placaDoCavalo: formData.placaDoCavalo || undefined,
          cnhBase64: cnhBase64 || undefined,
          cnhExtensao: cnhBase64 ? cnhExtensao : undefined,
        },
        {
          shipmentId: selectedShipmentId || undefined,
          driverId: selectedDriverId || undefined,
          createdById: currentUser?.id,
          createdByName: currentUser?.name,
        }
      );

      if (res.success && res.data) {
        // Salvar perfil do motorista em cache para consultas futuras
        saveDriverProfileCache(cleanCpfVal, {
          nomeDaMae: formData.nomeDaMae,
          dataDeNascimento: formData.dataDeNascimento,
        });

        // Atualizar o embarque com os dados de mãe e nascimento caso vinculados
        if (selectedShipmentId) {
          const targetS = availableShipments.find(item => item.id === selectedShipmentId);
          if (targetS) {
            const patchDocs: any = { ...(targetS.documents || {}) };
            if (formData.nomeDaMae) {
              patchDocs.nome_da_mae = formData.nomeDaMae.trim().toUpperCase();
              patchDocs.driver_mother_name = formData.nomeDaMae.trim().toUpperCase();
            }
            if (formData.dataDeNascimento) {
              patchDocs.data_nascimento = formData.dataDeNascimento;
              patchDocs.driver_birth_date = formData.dataDeNascimento;
            }
            upsertShipment({
              ...targetS,
              driverMotherName: formData.nomeDaMae ? formData.nomeDaMae.trim().toUpperCase() : targetS.driverMotherName,
              driverBirthDate: formData.dataDeNascimento ? formData.dataDeNascimento : targetS.driverBirthDate,
              documents: patchDocs
            }).catch(err => console.warn('Erro ao atualizar dados complementares do embarque:', err));
          }
        }

        showToast(`✅ Solicitação enviada com sucesso! Código: ${res.data.codigo} | ID: ${res.data.id.slice(0, 8)}...`, 'success', 8000);
        // Atualiza a lista e vai para o histórico
        const updated = await fetchRdoRequests();
        setRdoRequests(updated);
        setActiveTab('historico');
      } else {
        showToast(`❌ Falha no envio: ${res.error || 'Erro desconhecido'}`, 'error', 9000);
      }
    } catch (err: any) {
      showToast(`Erro ao submeter: ${err.message}`, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Copiar URL de Webhook
  const webhookCallbackUrl = typeof window !== 'undefined' 
    ? `${window.location.origin}/api/rdo-nacional/parecer`
    : 'https://seusistema.com.br/api/rdo-nacional/parecer';

  const handleCopyWebhookUrl = () => {
    navigator.clipboard.writeText(webhookCallbackUrl);
    setCopiedUrl(true);
    showToast('URL do Webhook copiada para a área de transferência!', 'success');
    setTimeout(() => setCopiedUrl(false), 3000);
  };

  // Filtragem de Histórico
  const filteredRequests = useMemo(() => {
    return rdoRequests.filter(req => {
      // 1. Status
      if (statusFilter !== 'todos' && req.status !== statusFilter) {
        return false;
      }
      // 2. Busca
      if (searchFilter.trim()) {
        const q = searchFilter.toLowerCase().trim();
        const nomeMatch = req.nome.toLowerCase().includes(q);
        const cpfMatch = req.cpf.includes(q);
        const codigoMatch = String(req.codigo).includes(q);
        const placaMatch = (req.placaDoCavalo || '').toLowerCase().includes(q);
        const idMatch = req.id.toLowerCase().includes(q);
        const obsMatch = (req.observacao || '').toLowerCase().includes(q);
        return nomeMatch || cpfMatch || codigoMatch || placaMatch || idMatch || obsMatch;
      }
      return true;
    });
  }, [rdoRequests, statusFilter, searchFilter]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex justify-center items-center p-2 sm:p-4 animate-in fade-in">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-5xl w-full max-h-[92vh] flex flex-col border border-gray-200 dark:border-gray-800 overflow-hidden">
        
        {/* Cabeçalho do Modal */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-gray-100 dark:border-gray-800 bg-gradient-to-r from-blue-50/60 via-indigo-50/40 to-white dark:from-blue-950/30 dark:via-gray-900 dark:to-gray-900">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-600 text-white shadow-md shadow-blue-500/20">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-black text-gray-900 dark:text-white">
                  RDO Nacional — Análise Cadastral
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-300">
                  MRB Soluções
                </span>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Envio para fila de triagem e recebimento de pareceres cadastrais via Webhook Push
              </p>
            </div>
          </div>

          <button 
            onClick={onClose}
            className="p-2 rounded-xl text-gray-400 hover:text-gray-700 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Barra de Abas */}
        <div className="flex items-center gap-2 px-5 pt-3 border-b border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50">
          <button
            onClick={() => setActiveTab('nova_solicitacao')}
            className={`px-4 py-2.5 text-xs font-bold rounded-t-xl transition-all flex items-center gap-2 border-b-2 ${
              activeTab === 'nova_solicitacao'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400 bg-white dark:bg-gray-800 shadow-xs'
                : 'border-transparent text-gray-500 hover:text-gray-800 dark:text-gray-400 hover:bg-white/50'
            }`}
          >
            <Send className="w-4 h-4" />
            Nova Solicitação
          </button>

          <button
            onClick={() => setActiveTab('historico')}
            className={`px-4 py-2.5 text-xs font-bold rounded-t-xl transition-all flex items-center gap-2 border-b-2 ${
              activeTab === 'historico'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400 bg-white dark:bg-gray-800 shadow-xs'
                : 'border-transparent text-gray-500 hover:text-gray-800 dark:text-gray-400 hover:bg-white/50'
            }`}
          >
            <FileText className="w-4 h-4" />
            Painel de Triagem & Histórico
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300">
              {rdoRequests.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('configuracoes')}
            className={`px-4 py-2.5 text-xs font-bold rounded-t-xl transition-all flex items-center gap-2 border-b-2 ${
              activeTab === 'configuracoes'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400 bg-white dark:bg-gray-800 shadow-xs'
                : 'border-transparent text-gray-500 hover:text-gray-800 dark:text-gray-400 hover:bg-white/50'
            }`}
          >
            <Settings className="w-4 h-4" />
            Configurações da Integração
          </button>
        </div>

        {/* Conteúdo das Abas */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          
          {/* ABA 1: NOVA SOLICITAÇÃO */}
          {activeTab === 'nova_solicitacao' && (
            <form onSubmit={handleSubmitSolicitacao} className="space-y-5">
              
              {/* Barra de Vinculação Rápida */}
              <div className="p-4 rounded-xl bg-blue-50/70 dark:bg-blue-950/20 border border-blue-200/80 dark:border-blue-800/60 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-blue-900 dark:text-blue-300 mb-1 flex items-center gap-1.5">
                    <Truck className="w-3.5 h-3.5 text-blue-600" />
                    Vincular a um Embarque (Preenchimento Automático)
                  </label>
                  <select
                    value={selectedShipmentId}
                    onChange={(e) => handleShipmentSelect(e.target.value)}
                    className="w-full p-2.5 text-xs rounded-xl bg-white dark:bg-gray-800 border border-blue-200 dark:border-blue-700 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                  >
                    <option value="">Nenhum (Preenchimento Avulso)</option>
                    {availableShipments.map(s => (
                      <option key={s.id} value={s.id}>
                        Embarque #{s.id} — {s.driverName || 'Sem motorista'} ({s.horsePlate || 'Sem placa'}) [{s.status}]
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-blue-900 dark:text-blue-300 mb-1 flex items-center gap-1.5">
                    <UserIcon className="w-3.5 h-3.5 text-blue-600" />
                    Ou Selecionar Motorista Cadastrado
                  </label>
                  <select
                    value={selectedDriverId}
                    onChange={(e) => handleDriverSelect(e.target.value)}
                    className="w-full p-2.5 text-xs rounded-xl bg-white dark:bg-gray-800 border border-blue-200 dark:border-blue-700 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                  >
                    <option value="">Selecione um motorista da base...</option>
                    {availableDrivers.map(d => (
                      <option key={d.id} value={d.id}>
                        {d.name} — CPF: {d.cpf} ({d.classification})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Banner de Confirmação do Preenchimento Automático */}
                {selectedShipment && (
                  <div className="md:col-span-2 flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-xl bg-blue-100/70 dark:bg-blue-900/40 border border-blue-200 dark:border-blue-700 text-xs text-blue-900 dark:text-blue-200 gap-2">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                      <span>
                        Embarque <strong>#{selectedShipment.id}</strong> vinculado: Dados do motorista ({formData.nome || 'Identificado'}), veículo ({formData.placaDoCavalo || 'N/A'}) e proprietário preenchidos automaticamente.
                      </span>
                    </div>
                    {isLoadingCnh ? (
                      <span className="flex items-center gap-1.5 text-[11px] text-blue-600 dark:text-blue-300 font-semibold shrink-0">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Carregando CNH...
                      </span>
                    ) : cnhFile ? (
                      <span className="flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-bold shrink-0">
                        <CheckCircle2 className="w-3.5 h-3.5" /> CNH vinculada
                      </span>
                    ) : null}
                  </div>
                )}
              </div>

              {/* Dados Principais do Motorista */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                    Nome da Empresa / Cliente Solicitante
                  </label>
                  <input
                    type="text"
                    value={formData.nomeDoCliente}
                    onChange={e => setFormData({ ...formData, nomeDoCliente: e.target.value })}
                    placeholder="Ex: TRANSCUNHA TRANSPORTES"
                    className="w-full p-2.5 text-xs rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                    CPF do Motorista <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="cpf"
                    value={formData.cpf}
                    onChange={e => setFormData({ ...formData, cpf: autoFormatInput('cpf', e.target.value) })}
                    placeholder="000.000.000-00"
                    className="w-full p-2.5 text-xs rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                    Nome Completo do Motorista <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="nome"
                    value={formData.nome}
                    onChange={e => setFormData({ ...formData, nome: autoFormatInput('nome', e.target.value) })}
                    placeholder="Nome completo do motorista"
                    className="w-full p-2.5 text-xs rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 uppercase"
                    required
                  />
                </div>
              </div>

              {/* Dados Complementares */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                    Nome Completo da Mãe (Opcional)
                  </label>
                  <input
                    type="text"
                    value={formData.nomeDaMae}
                    onChange={e => setFormData({ ...formData, nomeDaMae: e.target.value })}
                    placeholder="Nome da mãe do motorista"
                    className="w-full p-2.5 text-xs rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 uppercase"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                    Data de Nascimento (Opcional)
                  </label>
                  <input
                    type="date"
                    value={formData.dataDeNascimento}
                    onChange={e => setFormData({ ...formData, dataDeNascimento: e.target.value })}
                    className="w-full p-2.5 text-xs rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                    Placa do Veículo / Cavalo (Opcional)
                  </label>
                  <input
                    type="text"
                    name="placa"
                    value={formData.placaDoCavalo}
                    onChange={e => setFormData({ ...formData, placaDoCavalo: autoFormatInput('placa', e.target.value) })}
                    placeholder="ABC1D23"
                    className="w-full p-2.5 text-xs rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 font-mono uppercase"
                  />
                </div>
              </div>

              {/* Dados do Proprietário */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                    Documento do Proprietário (CPF ou CNPJ)
                  </label>
                  <input
                    type="text"
                    value={formData.documentoDoProprietario}
                    onChange={e => setFormData({ ...formData, documentoDoProprietario: e.target.value })}
                    placeholder="CPF ou CNPJ do proprietário"
                    className="w-full p-2.5 text-xs rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                    Nome / Razão Social do Proprietário
                  </label>
                  <input
                    type="text"
                    value={formData.nomeDoProprietario}
                    onChange={e => setFormData({ ...formData, nomeDoProprietario: e.target.value })}
                    placeholder="Nome da empresa ou proprietário"
                    className="w-full p-2.5 text-xs rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 uppercase"
                  />
                </div>
              </div>

              {/* Anexo da CNH */}
              <div className="p-4 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/40">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h4 className="text-xs font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
                      <FileText className="w-4 h-4 text-blue-600" />
                      Anexo da CNH do Motorista (Opcional - PDF, PNG ou JPG)
                    </h4>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">
                      O arquivo será codificado em Base64 e enviado diretamente aos analistas do RDO Nacional
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="file"
                      id="rdo-cnh-upload"
                      accept=".pdf,.png,.jpg,.jpeg"
                      onChange={handleCnhChange}
                      className="hidden"
                    />
                    <label
                      htmlFor="rdo-cnh-upload"
                      className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors shadow-xs"
                    >
                      <Upload className="w-3.5 h-3.5 text-blue-600" />
                      {cnhFile ? 'Substituir CNH' : 'Escolher Arquivo'}
                    </label>

                    {cnhFile && (
                      <button
                        type="button"
                        onClick={() => {
                          setCnhFile(null);
                          setCnhBase64('');
                        }}
                        className="p-2 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40"
                        title="Remover anexo"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                {isLoadingCnh && (
                  <div className="mt-3 flex items-center gap-2 p-2 rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 text-xs text-blue-800 dark:text-blue-300 animate-pulse">
                    <Loader2 className="w-4 h-4 animate-spin text-blue-600 shrink-0" />
                    <span>Recuperando e preparando CNH do embarque em Base64...</span>
                  </div>
                )}

                {cnhFile && !isLoadingCnh && (
                  <div className="mt-3 flex items-center gap-2 p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-800 dark:text-emerald-300">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span className="font-semibold truncate">{cnhFile.name}</span>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 ml-2">
                      Auto do Embarque
                    </span>
                    <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/60 font-bold ml-auto">
                      {cnhExtensao}
                    </span>
                  </div>
                )}
              </div>

              {/* Ações */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100 dark:border-gray-800">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2.5 rounded-xl text-xs font-semibold text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="btn-premium px-6 py-2.5 rounded-xl text-xs font-bold shadow-md flex items-center gap-2 disabled:opacity-50 cursor-pointer active:scale-95"
                >
                  {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  {isSubmitting ? 'Enviando para Triagem...' : 'Submeter para Fila do RDO Nacional'}
                </button>
              </div>
            </form>
          )}

          {/* ABA 2: PAINEL DE TRIAGEM & HISTÓRICO */}
          {activeTab === 'historico' && (
            <div className="space-y-4">
              
              {/* Barra de Filtros */}
              <div className="flex flex-wrap items-center gap-3 p-3 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-200/80 dark:border-gray-700">
                <div className="relative flex-1 min-w-[220px]">
                  <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Filtrar por nome, CPF, placa, código ou ID..."
                    value={searchFilter}
                    onChange={e => setSearchFilter(e.target.value)}
                    className="w-full pl-9 pr-3 py-1.5 text-xs bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setStatusFilter('todos')}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                      statusFilter === 'todos'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                    }`}
                  >
                    Todos ({rdoRequests.length})
                  </button>
                  <button
                    onClick={() => setStatusFilter('pendente')}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1 ${
                      statusFilter === 'pendente'
                        ? 'bg-amber-500 text-white shadow-xs'
                        : 'bg-white dark:bg-gray-700 text-amber-700 dark:text-amber-400'
                    }`}
                  >
                    <Clock className="w-3 h-3" />
                    Em Triagem
                  </button>
                  <button
                    onClick={() => setStatusFilter('aprovado')}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1 ${
                      statusFilter === 'aprovado'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'bg-white dark:bg-gray-700 text-emerald-700 dark:text-emerald-400'
                    }`}
                  >
                    <CheckCircle2 className="w-3 h-3" />
                    Sem Restrição
                  </button>
                  <button
                    onClick={() => setStatusFilter('consta_informacao')}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1 ${
                      statusFilter === 'consta_informacao'
                        ? 'bg-red-600 text-white shadow-xs'
                        : 'bg-white dark:bg-gray-700 text-red-700 dark:text-red-400'
                    }`}
                  >
                    <AlertTriangle className="w-3 h-3" />
                    Consta Informação
                  </button>
                </div>

                <button
                  onClick={() => {
                    setIsLoadingRequests(true);
                    fetchRdoRequests().then(setRdoRequests).finally(() => setIsLoadingRequests(false));
                  }}
                  className="p-2 rounded-lg bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:text-blue-600 border border-gray-200 dark:border-gray-600"
                  title="Atualizar lista"
                >
                  <RefreshCw className={`w-4 h-4 ${isLoadingRequests ? 'animate-spin' : ''}`} />
                </button>
              </div>

              {/* Lista de Registros */}
              {filteredRequests.length === 0 ? (
                <div className="text-center py-12 border-2 border-dashed border-gray-200 dark:border-gray-800 rounded-2xl">
                  <ShieldCheck className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                  <p className="text-sm font-bold text-gray-700 dark:text-gray-300">Nenhuma solicitação encontrada</p>
                  <p className="text-xs text-gray-400">Submeta uma nova análise de motorista para que ela apareça aqui.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredRequests.map(req => {
                    const isApproved = req.status === 'aprovado' || req.parecer === 0;
                    const isReproved = req.status === 'consta_informacao' || req.parecer === 1;
                    const isPending = req.status === 'pendente';

                    return (
                      <div
                        key={req.id}
                        className={`p-4 rounded-xl border transition-all ${
                          isApproved 
                            ? 'bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-200/80 dark:border-emerald-800/60'
                            : isReproved
                            ? 'bg-red-50/50 dark:bg-red-950/20 border-red-200/80 dark:border-red-800/60'
                            : 'bg-white dark:bg-gray-800/80 border-gray-200 dark:border-gray-700'
                        }`}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="flex items-start gap-3">
                            <div className={`p-2 rounded-xl mt-0.5 ${
                              isApproved 
                                ? 'bg-emerald-500 text-white' 
                                : isReproved 
                                ? 'bg-red-600 text-white' 
                                : 'bg-amber-500 text-white animate-pulse'
                            }`}>
                              {isApproved ? <CheckCircle2 className="w-5 h-5" /> : isReproved ? <ShieldAlert className="w-5 h-5" /> : <Clock className="w-5 h-5" />}
                            </div>

                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase">
                                  {req.nome}
                                </h3>
                                <span className="font-mono text-xs px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-bold">
                                  CPF: {req.cpf}
                                </span>
                                {req.placaDoCavalo && (
                                  <span className="font-mono text-xs px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-bold">
                                    🚗 {req.placaDoCavalo}
                                  </span>
                                )}
                              </div>

                              <div className="flex flex-wrap items-center gap-3 text-[11px] text-gray-500 dark:text-gray-400 mt-1">
                                <span>Código: <strong className="text-gray-700 dark:text-gray-200">{req.codigo || 'S/N'}</strong></span>
                                <span>•</span>
                                <span>ID: <code className="font-mono text-[10px]">{req.id.slice(0, 8)}...</code></span>
                                <span>•</span>
                                <span>Enviado: {new Date(req.createdAt).toLocaleString('pt-BR')}</span>
                                {req.shipmentId && (
                                  <>
                                    <span>•</span>
                                    <span className="font-bold text-blue-600 dark:text-blue-400">Embarque #{req.shipmentId}</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Status Badge e Ações */}
                          <div className="flex items-center gap-2">
                            {isApproved && (
                              <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300 flex items-center gap-1">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                Sem Restrição (Aprovado)
                              </span>
                            )}
                            {isReproved && (
                              <span className="px-3 py-1 rounded-full text-xs font-bold bg-red-100 text-red-800 dark:bg-red-950/70 dark:text-red-300 flex items-center gap-1">
                                <AlertTriangle className="w-3.5 h-3.5" />
                                Consta Informação
                              </span>
                            )}
                            {isPending && (
                              <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300 flex items-center gap-1 animate-pulse">
                                <Clock className="w-3.5 h-3.5" />
                                Em Análise na Triagem
                              </span>
                            )}

                            {isApproved && onSelectApprovedCode && (
                              <button
                                onClick={() => {
                                  const code = req.codigo ? `RDO-${req.codigo}` : `RDO-${req.id.slice(0, 8).toUpperCase()}`;
                                  onSelectApprovedCode(code, req.shipmentId || selectedShipmentId);
                                  onClose();
                                }}
                                className="px-3 py-1 text-xs font-bold rounded-lg bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition-all"
                                title="Usar este código de liberação no embarque"
                              >
                                Usar no Embarque
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Observação do Parecer (se houver) */}
                        {req.observacao && (
                          <div className="mt-3 p-3 rounded-lg bg-red-100/70 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-xs text-red-900 dark:text-red-200">
                            <span className="font-bold flex items-center gap-1 mb-0.5">
                              <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                              Parecer do Analista:
                            </span>
                            {req.observacao}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ABA 3: CONFIGURAÇÕES DA INTEGRAÇÃO */}
          {activeTab === 'configuracoes' && (
            <form onSubmit={handleSaveConfig} className="space-y-6 max-w-2xl">
              <div className="p-4 rounded-xl bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/20 border border-blue-200 dark:border-blue-800 space-y-1">
                <h3 className="text-sm font-bold text-blue-900 dark:text-blue-300 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-blue-600" />
                  Configurações Oficiais da API e Webhook RDO Nacional
                </h3>
                <p className="text-xs text-blue-700 dark:text-blue-400">
                  Insira o Token fornecido pela equipe do RDO Nacional (MRB Soluções) e forneça a URL de Callback gerada abaixo para receber os pareceres automáticos.
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                    Host da API do Rdo Nacional
                  </label>
                  <input
                    type="text"
                    value={config.apiUrl}
                    onChange={e => setConfig({ ...config, apiUrl: e.target.value })}
                    className="w-full p-2.5 text-xs rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400 font-mono"
                    readOnly
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                    Token de Integração (Envio de Solicitações) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type={showTokens ? 'text' : 'password'}
                    value={config.apiToken}
                    onChange={e => setConfig({ ...config, apiToken: e.target.value })}
                    placeholder="Cole seu token fornecido pelo Rdo Nacional aqui..."
                    className="w-full p-2.5 text-xs rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-mono focus:ring-2 focus:ring-blue-500 outline-none"
                    required
                  />
                  <p className="text-[11px] text-gray-400 mt-1">
                    Enviado no cabeçalho <code className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">x-access-token</code> para submeter novos motoristas.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                    Token de Callback (Validação do Webhook) <span className="text-gray-400">(Opcional)</span>
                  </label>
                  <input
                    type={showTokens ? 'text' : 'password'}
                    value={config.callbackToken}
                    onChange={e => setConfig({ ...config, callbackToken: e.target.value })}
                    placeholder="Token combinado para validar requisições do webhook..."
                    className="w-full p-2.5 text-xs rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-mono focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>

                {/* URL de Callback para Copiar */}
                <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 space-y-2">
                  <label className="block text-xs font-bold text-gray-800 dark:text-gray-200">
                    URL de Callback para Configurar no RDO Nacional (Webhook):
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={webhookCallbackUrl}
                      readOnly
                      className="flex-1 p-2 text-xs font-mono bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-200"
                    />
                    <button
                      type="button"
                      onClick={handleCopyWebhookUrl}
                      className="px-3.5 py-2 text-xs font-bold rounded-lg bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1.5 shadow-xs transition-all active:scale-95"
                    >
                      {copiedUrl ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      {copiedUrl ? 'Copiado!' : 'Copiar URL'}
                    </button>
                  </div>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">
                    Forneça esta URL para a equipe de suporte do Rdo Nacional cadastrar como o endpoint de recebimento de pareceres.
                  </p>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowTokens(prev => !prev)}
                    className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    {showTokens ? 'Ocultar Tokens' : 'Mostrar Tokens em Texto Claro'}
                  </button>

                  <button
                    type="button"
                    onClick={handleTestConnection}
                    disabled={isTestingConnection || !config.apiToken}
                    className="px-4 py-2 text-xs font-bold rounded-xl border border-blue-500/30 bg-blue-50/70 hover:bg-blue-100 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 text-blue-700 dark:text-blue-300 flex items-center gap-1.5 transition-all disabled:opacity-50"
                  >
                    {isTestingConnection ? <Loader2 className="w-4 h-4 animate-spin text-blue-600" /> : <RefreshCw className="w-4 h-4" />}
                    <span>{isTestingConnection ? 'Testando Conexão...' : 'Testar Conexão com RDO Nacional'}</span>
                  </button>
                </div>

                {connectionStatus === 'success' && (
                  <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 flex items-start gap-2.5 text-xs text-emerald-800 dark:text-emerald-300">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold">Comunicação validada com sucesso!</p>
                      <p className="text-[11px] opacity-90">{connectionMessage}</p>
                    </div>
                  </div>
                )}

                {connectionStatus === 'error' && (
                  <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 flex items-start gap-2.5 text-xs text-red-800 dark:text-red-300">
                    <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold">Falha no teste de conexão:</p>
                      <p className="text-[11px] opacity-90">{connectionMessage}</p>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end pt-4 border-t border-gray-100 dark:border-gray-800">
                <button
                  type="submit"
                  disabled={isSavingConfig}
                  className="btn-premium px-6 py-2.5 rounded-xl text-xs font-bold shadow-md flex items-center gap-2 disabled:opacity-50"
                >
                  {isSavingConfig ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  {isSavingConfig ? 'Salvando Configurações...' : 'Salvar Configurações'}
                </button>
              </div>
            </form>
          )}

        </div>
      </div>
    </div>
  );
};
