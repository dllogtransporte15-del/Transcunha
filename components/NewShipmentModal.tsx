import React, { useState, useEffect, useMemo, useRef } from 'react';
import type { Cargo, Driver, Shipment, Client, Vehicle, User, Owner } from '../types';
import { UserProfile, DailyScheduleType, VehicleSetType, VehicleBodyType, DriverPaymentMethod, ShipmentStatus, AnttModality, EtcTaxRegime, FreightCalculationType } from '../types';
import { supabase } from '../supabase';
import { useToast } from '../hooks/useToast';
import { toCargo } from '../lib/db';
import { calculateAdvanceAndBalance } from '../utils/freightCalculation';
import { autoFormatInput } from '../utils/formatters';
import { AlertTriangle, CheckCircle2, X, RefreshCw, ShieldCheck, Zap, Building2, User as UserIcon, Search, Loader2, Edit3 } from 'lucide-react';
import { calculateCargoBalance } from '../utils/cargoBalance';
import { isDemoUser } from '../auth';
import { createDemoTestShipment } from '../utils/demoSandbox';


interface NewShipmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (shipmentData: any) => void;
  cargo: Cargo | null;
  drivers: Driver[];
  clients: Client[];
  vehicles: Vehicle[];
  currentUser: User | null;
  shipments: Shipment[];
  users: User[];
  owners?: Owner[];
  offer?: any;
}

const NewShipmentModal: React.FC<NewShipmentModalProps> = ({ isOpen, onClose, onSave, cargo, drivers, clients, vehicles, currentUser, shipments, users, owners = [], offer }) => {
  const [activeCargo, setActiveCargo] = useState<Cargo | null>(cargo);
  const [isUpdatingCargoPermission, setIsUpdatingCargoPermission] = useState(false);
  const [isSyncingCargo, setIsSyncingCargo] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [driverName, setDriverName] = useState('');
  const [driverCpf, setDriverCpf] = useState('');
  const [codigoAtua, setCodigoAtua] = useState('');
  const [hasPreloadedAtua, setHasPreloadedAtua] = useState(false);
  const [ownerName, setOwnerName] = useState('');
  const [ownerAutoFillSource, setOwnerAutoFillSource] = useState('');
  const [ownerContact, setOwnerContact] = useState('');
  const [horsePlate, setHorsePlate] = useState('');
  const [trailer1Plate, setTrailer1Plate] = useState('');
  const [trailer2Plate, setTrailer2Plate] = useState('');
  const [trailer3Plate, setTrailer3Plate] = useState('');
  const [shipmentTonnage, setShipmentTonnage] = useState<number>(0);
  const [driverContact, setDriverContact] = useState('');
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [embarcadorId, setEmbarcadorId] = useState('');
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [vehicleSetType, setVehicleSetType] = useState<VehicleSetType | ''>('');
  const [vehicleBodyType, setVehicleBodyType] = useState<VehicleBodyType | ''>('');
  const [paymentMethod, setPaymentMethod] = useState<DriverPaymentMethod | string>(DriverPaymentMethod.PixEFrete);
  const [pixKey, setPixKey] = useState('');
  const [bankDetails, setBankDetails] = useState('');
  const [advancePercentage, setAdvancePercentage] = useState<number>(70);
  const [vehicleTag, setVehicleTag] = useState('');
  const [filesToAttach, setFilesToAttach] = useState<File[]>([]);
  const [anttModality, setAnttModality] = useState<AnttModality | ''>('');
  const [anttOwnerIdentifier, setAnttOwnerIdentifier] = useState('');
  const [etcTaxRegime, setEtcTaxRegime] = useState<EtcTaxRegime | ''>('');
  const [isManualEtcRegime, setIsManualEtcRegime] = useState(false);
  const [driverFreightType, setDriverFreightType] = useState<'PJ' | 'PF'>('PJ');
  const [isSearchingCnpj, setIsSearchingCnpj] = useState(false);
  const [cnpjSearchResult, setCnpjSearchResult] = useState<{ razaoSocial?: string; status?: string; regimeFound?: string } | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [activeShipmentsFound, setActiveShipmentsFound] = useState<Shipment[]>([]);
  const [pendingPayload, setPendingPayload] = useState<any>(null);
  const { showToast } = useToast();
  const isDemo = isDemoUser(currentUser);

  useEffect(() => {
    if (cargo) {
      setActiveCargo(cargo);
    }
  }, [cargo]);

  // No perfil Demonstração, pré-preenche a Tela de Solicitação de Embarque com dados fictícios de teste
  useEffect(() => {
    if (!isOpen || !isDemo || !cargo) return;
    const demoData = createDemoTestShipment(cargo, drivers, vehicles);
    setDriverName(demoData.driverName);
    setDriverCpf(demoData.driverCpf || '000.000.000-00');
    setDriverContact(demoData.driverContact || '(34) 99999-0000');
    setHorsePlate(demoData.horsePlate);
    setTrailer1Plate(demoData.trailer1Plate || '');
    setTrailer2Plate(demoData.trailer2Plate || '');
    setVehicleSetType(demoData.vehicleSetType || VehicleSetType.Rodotrem);
    setVehicleBodyType(demoData.vehicleBodyType || VehicleBodyType.Graneleiro);
    setShipmentTonnage(demoData.shipmentTonnage);
    setScheduledDate(demoData.scheduledDate || new Date().toISOString().split('T')[0]);
    setScheduledTime('23:59');
    setEmbarcadorId(currentUser?.id || users[0]?.id || 'USR-292');
    setPaymentMethod(demoData.paymentMethod || DriverPaymentMethod.PixEFrete);
    setAdvancePercentage(demoData.advancePercentage ?? 70);
    setPixKey(demoData.pixKey || '00.000.000/0001-00');
    setBankDetails(demoData.bankDetails || 'Banco Teste (001) • Ag 0001 • CC 12345-6');
    setOwnerName('PROPRIETÁRIO TESTE DEMO');
    setOwnerContact('(34) 99999-0000');
    setAnttModality(AnttModality.TAC);
    setAnttOwnerIdentifier('000.000.000-00');
  }, [isOpen, isDemo, cargo, currentUser, drivers, vehicles, users]);

  const handleScanDocument = async (files: File[]) => {
    if (files.length === 0) {
        showToast('Selecione um arquivo primeiro.', 'warning');
        return;
    }
    
    setIsScanning(true);
    try {
        for (const file of files) {
            const reader = new FileReader();
            const base64Promise = new Promise<string>((resolve) => {
                reader.onload = () => {
                    const base64 = (reader.result as string).split(',')[1];
                    resolve(base64);
                };
            });
            reader.readAsDataURL(file);
            const base64Image = await base64Promise;

            const { data, error } = await supabase.functions.invoke('process-document', {
                body: { image: base64Image, fileType: file.type }
            });

            if (error) throw error;

            if (data) {
                if (data.driverName) setDriverName(data.driverName);
                if (data.driverCpf) setDriverCpf(data.driverCpf);
                if (data.horsePlate) setHorsePlate(data.horsePlate.toUpperCase());
                if (data.trailerPlates && Array.isArray(data.trailerPlates)) {
                    if (data.trailerPlates[0]) setTrailer1Plate(data.trailerPlates[0].toUpperCase());
                    if (data.trailerPlates[1]) setTrailer2Plate(data.trailerPlates[1].toUpperCase());
                    if (data.trailerPlates[2]) setTrailer3Plate(data.trailerPlates[2].toUpperCase());
                }
            }
        }
        showToast('Digitalização concluída! Por favor, revise os campos preenchidos.', 'success');
    } catch (err: any) {
        console.error('Erro ao digitalizar:', err);
        showToast(`Erro na Digitalização: ${err.message || 'Ocorreu um erro ao processar o documento.'}\n\nCertifique-se de que a GEMINI_API_KEY está configurada no Supabase.`, 'error');
    } finally {
        setIsScanning(false);
    }
  };

  const embarcadores = useMemo(() => {
    return users
      .filter(u => u.active !== false && u.profile !== UserProfile.Motorista && u.profile !== UserProfile.Cliente)
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }, [users]);

  // Helper para buscar código ATUA existente do motorista no cadastro ou histórico de embarques
  const findDriverExistingAtua = (cpf?: string, name?: string, phone?: string, driverObj?: Driver): string => {
    if (driverObj?.codigoAtua && String(driverObj.codigoAtua).trim() !== '') {
      return String(driverObj.codigoAtua).trim();
    }
    const cleanCpf = cpf ? cpf.replace(/\D/g, '') : '';
    const cleanName = name ? name.trim().toLowerCase() : '';
    const cleanPhone = phone ? phone.replace(/\D/g, '') : '';

    for (const s of (shipments || [])) {
      const sCpf = s.driverCpf ? s.driverCpf.replace(/\D/g, '') : '';
      const sName = s.driverName ? s.driverName.trim().toLowerCase() : '';
      const sPhone = s.driverContact ? s.driverContact.replace(/\D/g, '') : '';

      const matchesCpf = cleanCpf.length === 11 && sCpf === cleanCpf;
      const matchesName = cleanName.length > 0 && sName === cleanName;
      const matchesPhone = cleanPhone.length >= 10 && sPhone === cleanPhone;

      if (matchesCpf || matchesName || matchesPhone) {
        const atua = s.codigoAtua || (s.documents as any)?.codigo_atua || (s.documents as any)?.codg_atua || (s.documents as any)?.codigoAtua;
        if (atua && String(atua).trim() !== '' && String(atua).trim() !== '-') {
          return String(atua).trim();
        }
      }
    }
    return '';
  };

  const prevIsOpen = React.useRef(isOpen);

  useEffect(() => {
    if (isOpen && !prevIsOpen.current) {
      // Find driver user or driver directly
      const driverUser = users.find(u => u.id === offer?.driverId);
      const cleanUserCpf = (driverUser?.email || '').replace(/\D/g, '');
      const cleanUserPhone = (driverUser?.phone || '').replace(/\D/g, '');
      
      // Locate in drivers table by: ID, CPF, Phone or Name
      const driverInDb = drivers.find(d => {
        if (offer?.driverId && d.id === offer.driverId) return true;
        if (cleanUserCpf.length === 11 && d.cpf && d.cpf.replace(/\D/g, '') === cleanUserCpf) return true;
        if (cleanUserPhone.length >= 10 && d.phone && d.phone.replace(/\D/g, '') === cleanUserPhone) return true;
        if (driverUser?.name && d.name.trim().toLowerCase() === driverUser.name.trim().toLowerCase()) return true;
        if (offer?.driverName && d.name.trim().toLowerCase() === offer.driverName.trim().toLowerCase()) return true;
        return false;
      });

      const initialDriverName = driverInDb?.name || offer?.driverName || driverUser?.name || '';
      const initialDriverCpf = driverInDb?.cpf || (cleanUserCpf.length === 11 ? driverUser?.email : '') || offer?.driverCpf || '';
      const initialDriverContact = driverInDb?.phone || offer?.driverContact || driverUser?.phone || '';

      setDriverName(initialDriverName);
      setDriverCpf(initialDriverCpf);
      setDriverContact(initialDriverContact);

      const existingAtua = findDriverExistingAtua(initialDriverCpf, initialDriverName, initialDriverContact, driverInDb);
      if (existingAtua) {
        setCodigoAtua(existingAtua);
        setHasPreloadedAtua(true);
      } else {
        setCodigoAtua('');
        setHasPreloadedAtua(false);
      }

      // Now search for driver's last shipment across ALL available identifiers
      const cleanTargetCpf = initialDriverCpf.replace(/\D/g, '');
      const cleanTargetName = initialDriverName.trim().toLowerCase();
      const cleanTargetPhone = initialDriverContact.replace(/\D/g, '');

      let lastShipment = shipments
        .filter(s => {
          if (cleanTargetCpf.length === 11 && s.driverCpf && s.driverCpf.replace(/\D/g, '') === cleanTargetCpf) return true;
          if (cleanTargetName && s.driverName && s.driverName.trim().toLowerCase() === cleanTargetName) return true;
          if (cleanTargetPhone.length >= 10 && s.driverContact && s.driverContact.replace(/\D/g, '') === cleanTargetPhone) return true;
          return false;
        })
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

      // Vehicle lookup fallback from vehicles table if not found in lastShipment
      const linkedVehicle = driverInDb?.id 
        ? vehicles.find(v => v.driverId === driverInDb.id) 
        : undefined;

      const horsePlateVal = lastShipment?.horsePlate || linkedVehicle?.plate || '';
      const trailer1Val = lastShipment?.trailer1Plate || '';
      const trailer2Val = lastShipment?.trailer2Plate || '';
      const trailer3Val = lastShipment?.trailer3Plate || '';

      setHorsePlate(horsePlateVal);
      setTrailer1Plate(trailer1Val);
      setTrailer2Plate(trailer2Val);
      setTrailer3Plate(trailer3Val);

      setOwnerContact(lastShipment?.ownerContact || '');
      setShipmentTonnage(offer?.totalTonnage || (cargo ? Math.max(0, cargo.scheduledVolume - cargo.loadedVolume) : 0) || 0);
      setScheduledDate(offer?.scheduledDate || cargo?.loadingDeadline || new Date().toISOString().split('T')[0]);
      setScheduledTime(offer?.scheduledTime || '');
      setSelectedVehicle(linkedVehicle || null);
      setVehicleSetType(lastShipment?.vehicleSetType || linkedVehicle?.setType || '');
      setVehicleBodyType(lastShipment?.vehicleBodyType || linkedVehicle?.bodyType || '');
      setPaymentMethod(lastShipment?.paymentMethod || DriverPaymentMethod.PixEFrete);
      setPixKey(lastShipment?.pixKey || '');
      setBankDetails(lastShipment?.bankDetails || '');
      setAdvancePercentage(lastShipment?.advancePercentage !== undefined ? lastShipment.advancePercentage : 70);
      setVehicleTag(lastShipment?.vehicleTag || '');
      setFilesToAttach([]);

      const initialAntt = (lastShipment?.anttModality as AnttModality) || (lastShipment?.driverFreightType === 'PF' ? AnttModality.TAC : (lastShipment?.driverFreightType === 'PJ' ? AnttModality.ETC : ''));
      setAnttModality(initialAntt || '');
      const initialOwnerId = lastShipment?.anttOwnerIdentifier || (initialAntt === AnttModality.TAC ? (initialDriverCpf || '') : '');
      setAnttOwnerIdentifier(initialOwnerId);

      let initialOwnerName = lastShipment?.ownerName || '';
      let initialOwnerSource = '';
      if (!initialOwnerName && initialOwnerId) {
        const cleanId = initialOwnerId.replace(/\D/g, '');
        if (cleanId === cleanTargetCpf && initialDriverName) {
          initialOwnerName = initialDriverName;
          initialOwnerSource = 'Motorista do Embarque';
        } else {
          const ownerMatch = (owners || []).find(o => o.cpfCnpj && o.cpfCnpj.replace(/\D/g, '') === cleanId);
          if (ownerMatch) {
            initialOwnerName = ownerMatch.name;
            initialOwnerSource = 'Proprietário Cadastrado';
          }
        }
      }
      setOwnerName(initialOwnerName);
      setOwnerAutoFillSource(initialOwnerSource);

      setCnpjSearchResult(null);
      setEtcTaxRegime((lastShipment?.etcTaxRegime as EtcTaxRegime) || '');
      setDriverFreightType(lastShipment?.driverFreightType || (initialAntt === AnttModality.TAC ? 'PF' : 'PJ'));

      setEmbarcadorId(currentUser?.id || '');
      setShowConfirmModal(false);
      setActiveShipmentsFound([]);
      setPendingPayload(null);
      setIsSubmitting(false);
    }
    prevIsOpen.current = isOpen;
  }, [isOpen, currentUser, offer, cargo, drivers, shipments, users, vehicles, owners]);

  // Driver & Plate Suggestions State
  const [showDriverSuggestions, setShowDriverSuggestions] = useState(false);
  const [showPlateSuggestions, setShowPlateSuggestions] = useState(false);
  const driverInputContainerRef = useRef<HTMLDivElement>(null);
  const plateInputContainerRef = useRef<HTMLDivElement>(null);
  const [lastAlertedDriverId, setLastAlertedDriverId] = useState<string>('');

  // Close suggestion dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (driverInputContainerRef.current && !driverInputContainerRef.current.contains(e.target as Node)) {
        setShowDriverSuggestions(false);
      }
      if (plateInputContainerRef.current && !plateInputContainerRef.current.contains(e.target as Node)) {
        setShowPlateSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Efficient lookup for owner or driver details across system
  const lookupOwnerInfo = (identifier: string, modality: AnttModality | '') => {
    const clean = (identifier || '').replace(/\D/g, '');
    if (!clean) return null;

    // Check if clean is CPF (11 digits) or modality is TAC (Pessoa Física)
    if (clean.length === 11 || modality === AnttModality.TAC) {
      const cleanDriverCpf = driverCpf.replace(/\D/g, '');
      // 1. Match current driver in modal
      if (cleanDriverCpf && clean === cleanDriverCpf && driverName.trim()) {
        return {
          name: driverName.trim(),
          phone: driverContact || '',
          bankDetails: bankDetails || '',
          pixKey: pixKey || '',
          paymentMethod: paymentMethod || '',
          source: 'Motorista do Embarque Atual',
        };
      }

      // 2. Match any driver in drivers list
      const matchingDriver = drivers.find(d => d.cpf && d.cpf.replace(/\D/g, '') === clean);
      if (matchingDriver) {
        return {
          name: matchingDriver.name,
          phone: matchingDriver.phone || '',
          bankDetails: '',
          pixKey: '',
          paymentMethod: '',
          source: 'Motorista Cadastrado na Plataforma',
        };
      }

      // 3. Match any owner in owners list
      const matchingOwner = (owners || []).find(o => o.cpfCnpj && o.cpfCnpj.replace(/\D/g, '') === clean);
      if (matchingOwner) {
        return {
          name: matchingOwner.name,
          phone: matchingOwner.phone || '',
          bankDetails: matchingOwner.bankDetails || '',
          pixKey: '',
          paymentMethod: '',
          source: 'Proprietário Cadastrado',
        };
      }

      // 4. Match past shipments
      const pastShipment = shipments.find(s => {
        const sOwnerId = (s.anttOwnerIdentifier || '').replace(/\D/g, '');
        const sDriverCpf = (s.driverCpf || '').replace(/\D/g, '');
        return (sOwnerId === clean && (s.ownerName || s.driverName)) || (sDriverCpf === clean && s.driverName);
      });
      if (pastShipment) {
        return {
          name: pastShipment.ownerName || (pastShipment.driverCpf?.replace(/\D/g, '') === clean ? pastShipment.driverName : ''),
          phone: pastShipment.ownerContact || pastShipment.driverContact || '',
          bankDetails: pastShipment.bankDetails || '',
          pixKey: pastShipment.pixKey || '',
          paymentMethod: pastShipment.paymentMethod || '',
          source: 'Histórico de Embarques',
        };
      }
    }

    // Check if clean is CNPJ (14 digits) or modality is ETC (Pessoa Jurídica)
    if (clean.length === 14 || modality === AnttModality.ETC) {
      // 1. Match owners list
      const matchingOwner = (owners || []).find(o => o.cpfCnpj && o.cpfCnpj.replace(/\D/g, '') === clean);
      if (matchingOwner) {
        return {
          name: matchingOwner.name,
          phone: matchingOwner.phone || '',
          bankDetails: matchingOwner.bankDetails || '',
          pixKey: '',
          paymentMethod: '',
          source: 'Proprietário PJ Cadastrado',
        };
      }

      // 2. Match past shipments
      const pastShipment = shipments.find(s => (s.anttOwnerIdentifier || '').replace(/\D/g, '') === clean && s.ownerName);
      if (pastShipment) {
        return {
          name: pastShipment.ownerName || '',
          phone: pastShipment.ownerContact || '',
          bankDetails: pastShipment.bankDetails || '',
          pixKey: pastShipment.pixKey || '',
          paymentMethod: pastShipment.paymentMethod || '',
          source: 'Histórico de Embarques',
        };
      }
    }

    return null;
  };

  // Efficient single-pass search for driver's latest shipment
  const findLastShipmentForDriver = (targetCpf?: string, targetName?: string, targetPhone?: string) => {
    const cleanCpf = (targetCpf || '').replace(/\D/g, '');
    const cleanName = (targetName || '').trim().toLowerCase();
    const cleanPhone = (targetPhone || '').replace(/\D/g, '');

    let latest: Shipment | null = null;
    let latestTime = 0;

    for (let i = 0; i < (shipments || []).length; i++) {
      const s = shipments[i];
      const sCpf = s.driverCpf ? s.driverCpf.replace(/\D/g, '') : '';
      const sName = s.driverName ? s.driverName.trim().toLowerCase() : '';
      const sPhone = s.driverContact ? s.driverContact.replace(/\D/g, '') : '';

      const matchesCpf = cleanCpf.length === 11 && sCpf === cleanCpf;
      const matchesName = cleanName.length > 0 && sName === cleanName;
      const matchesPhone = cleanPhone.length >= 10 && sPhone === cleanPhone;

      if (matchesCpf || matchesName || matchesPhone) {
        const time = s.createdAt ? new Date(s.createdAt).getTime() : 0;
        if (time >= latestTime) {
          latestTime = time;
          latest = s;
        }
      }
    }
    return latest;
  };

  // Efficient single-pass search for last shipment by vehicle plate
  const findLastShipmentByPlate = (plate: string) => {
    const cleanPlate = plate.trim().toUpperCase();
    if (!cleanPlate) return null;

    let latest: Shipment | null = null;
    let latestTime = 0;

    for (let i = 0; i < (shipments || []).length; i++) {
      const s = shipments[i];
      if (s.horsePlate && s.horsePlate.trim().toUpperCase() === cleanPlate) {
        const time = s.createdAt ? new Date(s.createdAt).getTime() : 0;
        if (time >= latestTime) {
          latestTime = time;
          latest = s;
        }
      }
    }
    return latest;
  };

  // Batch autofill driver and historical vehicle / bank info safely without render loops
  const applyDriverAutofill = (selectedDriver: Driver) => {
    setDriverName(selectedDriver.name || '');
    if (selectedDriver.cpf) setDriverCpf(selectedDriver.cpf);
    if (selectedDriver.phone) setDriverContact(selectedDriver.phone);

    const existingAtua = findDriverExistingAtua(selectedDriver.cpf, selectedDriver.name, selectedDriver.phone, selectedDriver);
    if (existingAtua) {
      setCodigoAtua(existingAtua);
      setHasPreloadedAtua(true);
    } else {
      setCodigoAtua('');
      setHasPreloadedAtua(false);
    }

    if (!selectedDriver.active) {
      if (lastAlertedDriverId !== selectedDriver.id) {
        showToast(`ATENÇÃO: Este motorista encontra-se RESTRITO! Motivo: ${selectedDriver.restrictionReason || 'Sem motivo especificado'}. O sistema impedirá a criação desta ordem.`, 'error', 10000);
        setLastAlertedDriverId(selectedDriver.id);
      }
    } else {
      setLastAlertedDriverId('');
    }

    if (!selectedDriver.active) return;

    const lastShipment = findLastShipmentForDriver(selectedDriver.cpf, selectedDriver.name, selectedDriver.phone);
    const linkedVehicle = vehicles.find(v => v.driverId === selectedDriver.id);

    if (lastShipment) {
      if (lastShipment.horsePlate) setHorsePlate(lastShipment.horsePlate);
      if (lastShipment.trailer1Plate) setTrailer1Plate(lastShipment.trailer1Plate);
      if (lastShipment.trailer2Plate) setTrailer2Plate(lastShipment.trailer2Plate);
      if (lastShipment.trailer3Plate) setTrailer3Plate(lastShipment.trailer3Plate);
      if (lastShipment.ownerContact) setOwnerContact(lastShipment.ownerContact);
      if (lastShipment.driverContact && !selectedDriver.phone) setDriverContact(lastShipment.driverContact);
      if (lastShipment.paymentMethod) setPaymentMethod(lastShipment.paymentMethod);
      if (lastShipment.pixKey) setPixKey(lastShipment.pixKey);
      if (lastShipment.bankDetails) setBankDetails(lastShipment.bankDetails);
      if (lastShipment.advancePercentage !== undefined) setAdvancePercentage(lastShipment.advancePercentage);
      if (lastShipment.vehicleTag) setVehicleTag(lastShipment.vehicleTag);
      if (lastShipment.vehicleSetType) setVehicleSetType(lastShipment.vehicleSetType);
      if (lastShipment.vehicleBodyType) setVehicleBodyType(lastShipment.vehicleBodyType);
      
      const targetOwnerId = lastShipment.anttOwnerIdentifier || selectedDriver.cpf || '';
      if (targetOwnerId) {
        setAnttOwnerIdentifier(targetOwnerId);
      }
      
      if (lastShipment.ownerName) {
        setOwnerName(lastShipment.ownerName);
        setOwnerAutoFillSource('Histórico de Embarques');
      } else if (targetOwnerId && selectedDriver.cpf && targetOwnerId.replace(/\D/g, '') === selectedDriver.cpf.replace(/\D/g, '')) {
        setOwnerName(selectedDriver.name || '');
        setOwnerAutoFillSource('Motorista do Embarque');
      }

      if (lastShipment.anttModality) {
        setAnttModality(lastShipment.anttModality as AnttModality);
        setDriverFreightType(lastShipment.anttModality === AnttModality.TAC ? 'PF' : 'PJ');
      } else if (lastShipment.driverFreightType) {
        setDriverFreightType(lastShipment.driverFreightType);
        setAnttModality(lastShipment.driverFreightType === 'PF' ? AnttModality.TAC : AnttModality.ETC);
      }
      if (lastShipment.etcTaxRegime) {
        setEtcTaxRegime(lastShipment.etcTaxRegime as EtcTaxRegime);
      }
    } else if (linkedVehicle) {
      if (linkedVehicle.plate) setHorsePlate(linkedVehicle.plate);
      if (linkedVehicle.setType) setVehicleSetType(linkedVehicle.setType);
      if (linkedVehicle.bodyType) setVehicleBodyType(linkedVehicle.bodyType);
      setSelectedVehicle(linkedVehicle);
      if (selectedDriver.cpf) {
        if (!anttModality || anttModality === AnttModality.TAC) {
          setAnttOwnerIdentifier(selectedDriver.cpf);
          setOwnerName(selectedDriver.name || '');
          setOwnerAutoFillSource('Motorista do Embarque');
        }
      }
    } else if (selectedDriver.cpf) {
      if (!anttModality || anttModality === AnttModality.TAC) {
        setAnttOwnerIdentifier(selectedDriver.cpf);
        setOwnerName(selectedDriver.name || '');
        setOwnerAutoFillSource('Motorista do Embarque');
      }
    }
  };

  // Plate autofill helper
  const applyPlateAutofill = (plateVal: string) => {
    const cleanPlate = plateVal.trim().toUpperCase();
    setHorsePlate(cleanPlate);

    const vehicle = vehicles.find(v => v.plate.trim().toUpperCase() === cleanPlate);
    if (vehicle) {
      setSelectedVehicle(vehicle);
      if (vehicle.setType) setVehicleSetType(vehicle.setType);
      if (vehicle.bodyType) setVehicleBodyType(vehicle.bodyType);
      
      // If vehicle has ownerId, try to find owner
      if (vehicle.ownerId) {
        const vehicleOwner = (owners || []).find(o => o.id === vehicle.ownerId);
        if (vehicleOwner) {
          if (!anttOwnerIdentifier) {
            setAnttOwnerIdentifier(vehicleOwner.cpfCnpj);
            setOwnerName(vehicleOwner.name);
            setOwnerAutoFillSource('Proprietário do Veículo');
            if (vehicleOwner.phone && !ownerContact) setOwnerContact(vehicleOwner.phone);
            if (vehicleOwner.bankDetails && !bankDetails) setBankDetails(vehicleOwner.bankDetails);
          }
        }
      }
    } else {
      setSelectedVehicle(null);
    }

    if (cleanPlate.length >= 7) {
      const lastShipment = findLastShipmentByPlate(cleanPlate);
      if (lastShipment) {
        if (lastShipment.trailer1Plate) setTrailer1Plate(lastShipment.trailer1Plate);
        if (lastShipment.trailer2Plate) setTrailer2Plate(lastShipment.trailer2Plate);
        if (lastShipment.trailer3Plate) setTrailer3Plate(lastShipment.trailer3Plate);
        if (lastShipment.vehicleSetType && !vehicleSetType) setVehicleSetType(lastShipment.vehicleSetType);
        if (lastShipment.vehicleBodyType && !vehicleBodyType) setVehicleBodyType(lastShipment.vehicleBodyType);
        if (lastShipment.anttOwnerIdentifier && !anttOwnerIdentifier) {
          setAnttOwnerIdentifier(lastShipment.anttOwnerIdentifier);
          if (lastShipment.ownerName) setOwnerName(lastShipment.ownerName);
          if (lastShipment.anttModality) setAnttModality(lastShipment.anttModality as AnttModality);
        }
      }
    }
  };

  // Safe input handlers with debounced match checks
  const handleDriverNameChange = (val: string) => {
    setDriverName(val);
    setShowDriverSuggestions(true);
    const clean = val.trim().toLowerCase();
    if (clean.length >= 3) {
      const exactDriver = drivers.find(d => d.name.trim().toLowerCase() === clean);
      if (exactDriver) {
        applyDriverAutofill(exactDriver);
      } else {
        const atuaFound = findDriverExistingAtua(driverCpf, val, driverContact);
        if (atuaFound) {
          setCodigoAtua(atuaFound);
          setHasPreloadedAtua(true);
        }
      }
    }
  };

  const handleDriverCpfChange = (val: string) => {
    const formatted = autoFormatInput('cpf', val);
    setDriverCpf(formatted);
    const clean = formatted.replace(/\D/g, '');
    if (clean.length === 11) {
      const exactDriver = drivers.find(d => d.cpf && d.cpf.replace(/\D/g, '') === clean);
      if (exactDriver) {
        applyDriverAutofill(exactDriver);
      } else {
        const atuaFound = findDriverExistingAtua(formatted, driverName, driverContact);
        if (atuaFound) {
          setCodigoAtua(atuaFound);
          setHasPreloadedAtua(true);
        }
        if (anttModality === AnttModality.TAC && (!anttOwnerIdentifier || anttOwnerIdentifier === driverCpf)) {
          setAnttOwnerIdentifier(formatted);
          if (driverName) {
            setOwnerName(driverName);
            setOwnerAutoFillSource('Motorista do Embarque');
          }
        }
      }
    }
  };

  const handleHorsePlateChange = (val: string) => {
    const upper = val.toUpperCase();
    setHorsePlate(upper);
    setShowPlateSuggestions(true);
    const cleanPlate = upper.trim();
    if (cleanPlate.length >= 7) {
      applyPlateAutofill(cleanPlate);
    } else {
      const vehicle = vehicles.find(v => v.plate.trim().toUpperCase() === cleanPlate);
      setSelectedVehicle(vehicle || null);
      if (vehicle) {
        if (vehicle.setType) setVehicleSetType(vehicle.setType);
        if (vehicle.bodyType) setVehicleBodyType(vehicle.bodyType);
      }
    }
  };

  // Fast filtered suggestions (capped to 8 results for ultra-smooth mobile rendering)
  const driverSuggestions = useMemo(() => {
    const clean = driverName.trim().toLowerCase();
    if (!clean || clean.length < 2) return [];
    return drivers
      .filter(d => (d.name && d.name.toLowerCase().includes(clean)) || (d.cpf && d.cpf.replace(/\D/g, '').includes(clean)))
      .slice(0, 8);
  }, [driverName, drivers]);

  const plateSuggestions = useMemo(() => {
    const clean = horsePlate.trim().toUpperCase();
    if (!clean || clean.length < 2) return [];
    return vehicles
      .filter(v => v.plate && v.plate.toUpperCase().includes(clean))
      .slice(0, 8);
  }, [horsePlate, vehicles]);

  // Automatic CNPJ Tax Regime Lookup
  const searchCnpjTaxRegime = async (cnpjInput: string) => {
    const clean = cnpjInput.replace(/\D/g, '');
    if (clean.length !== 14) {
      showToast('Digite os 14 dígitos do CNPJ para realizar a pesquisa.', 'warning');
      return;
    }
    setIsSearchingCnpj(true);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 9000);
      let data: any = null;

      try {
        const resp = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${clean}`, {
          signal: controller.signal
        });
        if (resp.ok) {
          data = await resp.json();
        }
      } catch (e) {
        console.warn('Consulta BrasilAPI falhou, tentando fallback...', e);
      }

      if (!data) {
        try {
          const respFallback = await fetch(`https://minhareceita.org/${clean}`, {
            signal: controller.signal
          });
          if (respFallback.ok) {
            data = await respFallback.json();
          }
        } catch (e) {
          console.warn('Fallback também falhou:', e);
        }
      }

      clearTimeout(timeoutId);

      if (!data) {
        throw new Error('CNPJ não localizado na base da Receita Federal.');
      }

      let detectedRegime: EtcTaxRegime = EtcTaxRegime.SimplesNacional;
      let desc = '';

      if (data.opcao_pelo_mei === true) {
        detectedRegime = EtcTaxRegime.MEI;
        desc = 'MEI (Microempreendedor Individual)';
      } else if (data.opcao_pelo_simples === true) {
        detectedRegime = EtcTaxRegime.SimplesNacional;
        desc = 'Simples Nacional';
      } else {
        detectedRegime = EtcTaxRegime.LucroPresumido;
        desc = 'Regime Normal (Lucro Presumido / Real)';
      }

      setAnttModality(AnttModality.ETC);
      setEtcTaxRegime(detectedRegime);
      setDriverFreightType('PJ');
      setIsManualEtcRegime(false);

      const companyName = data.razao_social || data.nome_fantasia || '';
      setCnpjSearchResult({
        razaoSocial: companyName,
        status: data.descricao_situacao_cadastral || data.situacao_cadastral || 'Ativa',
        regimeFound: desc
      });

      if (companyName) {
        setOwnerName(companyName);
        setOwnerAutoFillSource('Receita Federal / BrasilAPI');
      }

      showToast(`CNPJ Identificado: ${companyName} (${desc})`, 'success');
    } catch (err: any) {
      console.warn('Erro na busca do CNPJ:', err);
      setIsManualEtcRegime(true);
      showToast(`CNPJ não localizado na Receita Federal: ${err.message || 'Verifique o CNPJ digitado'}. Você pode selecionar o regime tributário manualmente abaixo.`, 'warning');
    } finally {
      setIsSearchingCnpj(false);
    }
  };

  const handleAnttOwnerIdentifierChange = (value: string) => {
    if (anttModality === AnttModality.TAC) {
      const formatted = autoFormatInput('cpf', value);
      setAnttOwnerIdentifier(formatted);
      const clean = formatted.replace(/\D/g, '');
      if (clean.length === 11) {
        const found = lookupOwnerInfo(formatted, AnttModality.TAC);
        if (found && found.name) {
          setOwnerName(found.name);
          setOwnerAutoFillSource(found.source);
          if (found.phone && !ownerContact) setOwnerContact(found.phone);
          if (found.bankDetails && !bankDetails) setBankDetails(found.bankDetails);
          if (found.pixKey && !pixKey) setPixKey(found.pixKey);
          if (found.paymentMethod && !paymentMethod) setPaymentMethod(found.paymentMethod);
        } else {
          setOwnerAutoFillSource('');
        }
      }
    } else {
      const formatted = autoFormatInput('cnpj', value);
      setAnttOwnerIdentifier(formatted);
      const clean = formatted.replace(/\D/g, '');
      if (clean.length === 14) {
        const found = lookupOwnerInfo(formatted, AnttModality.ETC);
        if (found && found.name) {
          setOwnerName(found.name);
          setOwnerAutoFillSource(found.source);
          if (found.phone && !ownerContact) setOwnerContact(found.phone);
          if (found.bankDetails && !bankDetails) setBankDetails(found.bankDetails);
          if (found.pixKey && !pixKey) setPixKey(found.pixKey);
          if (found.paymentMethod && !paymentMethod) setPaymentMethod(found.paymentMethod);
        }
        if (!isSearchingCnpj) {
          searchCnpjTaxRegime(formatted);
        }
      }
    }
  };

  const currentCargo = activeCargo || cargo;

  // Live Vehicle Compatibility Validator
  const vehicleValidationInfo = useMemo(() => {
    const setType = vehicleSetType || selectedVehicle?.setType || '';
    const bodyType = vehicleBodyType || selectedVehicle?.bodyType || '';

    if (!currentCargo?.allowedVehicleTypes || currentCargo.allowedVehicleTypes.length === 0) {
      return { hasRules: false, isAllowed: true, setType, bodyType };
    }

    if (!setType || !bodyType) {
      return { hasRules: true, isAllowed: true, setType, bodyType };
    }

    const isAllowed = currentCargo.allowedVehicleTypes.some(allowed => 
      allowed.setType === setType && allowed.bodyTypes.includes(bodyType as VehicleBodyType)
    );

    return { hasRules: true, isAllowed, setType, bodyType };
  }, [currentCargo, vehicleSetType, vehicleBodyType, selectedVehicle]);

  // Sync Cargo Data on Demand without losing form state
  const handleSyncCargo = async () => {
    const target = currentCargo;
    if (!target?.id) return;
    setIsSyncingCargo(true);
    try {
      const { data, error } = await supabase
        .from('cargos')
        .select('*')
        .eq('id', target.id)
        .single();
      if (error) throw error;
      if (data) {
        const updated = toCargo(data);
        setActiveCargo(updated);
        showToast('Dados e permissões da carga sincronizados com sucesso!', 'success');
      }
    } catch (err: any) {
      console.error('Erro ao sincronizar carga:', err);
      showToast(`Erro ao sincronizar carga: ${err.message || err}`, 'error');
    } finally {
      setIsSyncingCargo(false);
    }
  };

  const canAllowVehicleOnCargo = useMemo(() => {
    if (!currentUser) return false;
    const profile = currentUser.profile;
    // Oculta e bloqueia para Embarcador e Agenciador / Agenciador de Embarque
    if (profile === UserProfile.Embarcador || (profile as string) === 'Embarcador') {
      return false;
    }
    if (profile === UserProfile.Agenciador || (profile as string) === 'Agenciador') {
      return false;
    }
    if ((currentUser as any).agencyRole === 'embarque') {
      return false;
    }
    if (profile === UserProfile.Motorista || profile === UserProfile.Cliente) {
      return false;
    }
    return true;
  }, [currentUser]);

  // 1-Click Allow Vehicle Type on Cargo
  const handleAllowCurrentVehicleOnCargo = async () => {
    if (!canAllowVehicleOnCargo) {
      showToast('Apenas a equipe interna possui permissão para liberar novos tipos de veículos na carga.', 'warning');
      return;
    }

    const target = currentCargo;
    if (!target) return;
    const currentSetType = vehicleSetType || selectedVehicle?.setType;
    const currentBodyType = vehicleBodyType || selectedVehicle?.bodyType;

    if (!currentSetType || !currentBodyType) {
      showToast('Selecione primeiro o Tipo de Veículo e Carroceria.', 'warning');
      return;
    }

    setIsUpdatingCargoPermission(true);
    try {
      const existingAllowed = [...(target.allowedVehicleTypes || [])];
      const existingIndex = existingAllowed.findIndex(item => item.setType === currentSetType);

      if (existingIndex >= 0) {
        const bodyTypes = [...existingAllowed[existingIndex].bodyTypes];
        if (!bodyTypes.includes(currentBodyType as VehicleBodyType)) {
          bodyTypes.push(currentBodyType as VehicleBodyType);
          existingAllowed[existingIndex] = {
            ...existingAllowed[existingIndex],
            bodyTypes
          };
        }
      } else {
        existingAllowed.push({
          setType: currentSetType as VehicleSetType,
          bodyTypes: [currentBodyType as VehicleBodyType]
        });
      }

      const { error } = await supabase
        .from('cargos')
        .update({
          allowed_vehicle_types: existingAllowed
        })
        .eq('id', target.id);

      if (error) throw error;

      const updatedCargo: Cargo = {
        ...target,
        allowedVehicleTypes: existingAllowed
      };
      setActiveCargo(updatedCargo);
      showToast(`Veículo (${currentSetType} - ${currentBodyType}) permitido nesta carga com sucesso!`, 'success');
    } catch (err: any) {
      console.error('Erro ao atualizar permissão de veículo na carga:', err);
      showToast(`Erro ao atualizar carga: ${err.message || err}`, 'error');
    } finally {
      setIsUpdatingCargoPermission(false);
    }
  };

  // Freight Rate Calculations for PJ and PF
  const leg1 = currentCargo?.freightLegs?.[0] || {
    companyFreightValuePerTon: currentCargo?.companyFreightValuePerTon || 0,
    driverFreightValuePerTon: currentCargo?.driverFreightValuePerTon || 0,
    driverFreightValuePerTonPf: currentCargo?.driverFreightValuePerTon || 0,
    disablePfFreight: false,
    hasIcms: currentCargo?.hasIcms || false,
    icmsPercentage: currentCargo?.icmsPercentage || 0,
  };

  const ratePj = leg1.driverFreightValuePerTon || currentCargo?.driverFreightValuePerTon || 0;
  const isPfDisabled = leg1.disablePfFreight || false;
  const ratePf = isPfDisabled ? 0 : (leg1.driverFreightValuePerTonPf ?? (leg1.driverFreightValuePerTon || currentCargo?.driverFreightValuePerTon || 0));

  const hasPjToll = leg1.driverFreightHasToll ?? currentCargo?.driverFreightHasToll ?? false;
  const hasPfToll = leg1.driverFreightPfHasToll ?? currentCargo?.driverFreightPfHasToll ?? false;

  const currentFreightRate = (driverFreightType === 'PF' && !isPfDisabled) ? ratePf : ratePj;
  const isFixedFreight = currentCargo?.freightCalculationType === FreightCalculationType.Fixed || leg1.freightCalculationType === FreightCalculationType.Fixed;

  const calculatedFreight = useMemo(() => {
    if (!currentCargo) return 0;
    if (isFixedFreight) {
      return currentFreightRate;
    }
    if (shipmentTonnage <= 0) return 0;
    return currentFreightRate * shipmentTonnage;
  }, [currentCargo, shipmentTonnage, currentFreightRate, isFixedFreight]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    if (!currentCargo) {
      showToast('Esta carga não existe mais no sistema ou foi removida. Não é possível criar o embarque.', 'error');
      return;
    }

    // Check for Restricted Driver
    const selectedDriverObj = drivers.find(d => 
        (d.name.trim().toLowerCase() === driverName.trim().toLowerCase() && driverName.trim() !== '') || 
        (d.cpf.replace(/\D/g, '') === driverCpf.replace(/\D/g, '') && driverCpf.trim() !== '')
    );

    if (selectedDriverObj && !selectedDriverObj.active) {
        showToast(`Motorista com Restrição: ${selectedDriverObj.restrictionReason || 'Sem motivo especificado'}. Não é permitido criar ordens para este motorista.`, 'error');
        return;
    }

    if (!driverName || !horsePlate || shipmentTonnage <= 0 || !scheduledDate || !embarcadorId || !scheduledTime) {
        showToast('Por favor, preencha todos os campos obrigatórios do formulário.', 'warning');
        return;
    }

    if (driverFreightType === 'PF' && isPfDisabled) {
        showToast('O frete PF (Pessoa Física) foi desabilitado nesta carga. Selecione o frete PJ (Pessoa Jurídica).', 'warning');
        return;
    }
    
    const isNewDriver = !drivers.find(d => d.name.trim().toLowerCase() === driverName.trim().toLowerCase());
    if (isNewDriver && !driverCpf) {
        showToast('Para novos motoristas, o CPF é obrigatório.', 'warning');
        return;
    }
    
    let vehicleInfo: { setType?: VehicleSetType | '', bodyType?: VehicleBodyType | '' };

    if (selectedVehicle) {
        vehicleInfo = selectedVehicle;
    } else {
        if (!vehicleSetType || !vehicleBodyType) {
            showToast('Para novos veículos, o Tipo de Veículo e Carroceria são obrigatórios.', 'warning');
            return;
        }
        vehicleInfo = { setType: vehicleSetType, bodyType: vehicleBodyType };
    }

    if (currentCargo?.allowedVehicleTypes && currentCargo.allowedVehicleTypes.length > 0 && vehicleInfo.setType && vehicleInfo.bodyType) {
        const isAllowed = currentCargo.allowedVehicleTypes.some(allowed => 
            allowed.setType === vehicleInfo.setType && allowed.bodyTypes.includes(vehicleInfo.bodyType as VehicleBodyType)
        );
        if (!isAllowed) {
            const msg = canAllowVehicleOnCargo
                ? `O tipo do veículo selecionado (${vehicleInfo.setType} - ${vehicleInfo.bodyType}) não é permitido para esta carga. Use o botão "Permitir Este Veículo" acima para liberar.`
                : `O tipo do veículo selecionado (${vehicleInfo.setType} - ${vehicleInfo.bodyType}) não é permitido para esta carga. Solicite a autorização à equipe interna.`;
            showToast(msg, 'error');
            return;
        }
    }

    // 1. TETO SOBERANO: Verificação do Saldo Total do Lote
    // Independentemente de quanto esteja configurado na cadência diária (Fixo, Limite Diário ou Demanda Livre),
    // o volume do embarque NUNCA pode ultrapassar o saldo total disponível do lote.
    const cargoBalance = calculateCargoBalance(currentCargo, shipments);
    const availableBalance = cargoBalance.availableVolume;
    if (shipmentTonnage > (availableBalance + 0.001)) {
        showToast(`SALDO TOTAL INSUFICIENTE: O lote possui apenas ${availableBalance.toLocaleString('pt-BR')} ton disponíveis no saldo total. Não é permitido criar embarques acima desse saldo (tentativa: ${shipmentTonnage.toLocaleString('pt-BR')} ton), independente da cadência diária.`, 'error');
        return;
    }

    if (!isDemo && currentCargo?.dailySchedule) {
        const scheduleRule = currentCargo.dailySchedule.find(rule => rule.date === scheduledDate);
        if (!scheduleRule) {
            showToast('Não é permitido criar ordens para datas sem programação lançada na carga. Verifique a Data Programada.', 'error');
            return;
        }

        if (scheduleRule.type === DailyScheduleType.Verificar) {
            showToast('Atenção: A programação para este dia exige verificação com o comercial antes de marcar.', 'warning');
        } else if (scheduleRule.type === DailyScheduleType.Fixo && scheduleRule.tonnage) {
            const alreadyScheduledTonnage = shipments
                .filter(s => (s.cargoId === currentCargo.id || (currentCargo.sequenceId && s.cargoId === String(currentCargo.sequenceId)) || (currentCargo.sequenceId && s.cargoId === `CRG-${currentCargo.sequenceId}`)) && s.scheduledDate === scheduledDate && s.status !== ShipmentStatus.Cancelado)
                .reduce((sum, s) => sum + s.shipmentTonnage, 0);
            
            if (alreadyScheduledTonnage + shipmentTonnage > scheduleRule.tonnage + 0.001) {
                showToast(`LIMITE DIÁRIO EXCEDIDO: A tonelagem para este dia excede o limite programado na cadência diária de ${scheduleRule.tonnage} ton. Já existem ${alreadyScheduledTonnage.toLocaleString('pt-BR')} ton programadas.`, 'error');
                return;
            }
        }
    }

    // Validation: Only allow future date/time
    if (!isDemo) {
      const now = new Date();
      const inputDateTime = new Date(`${scheduledDate}T${scheduledTime}`);
      if (inputDateTime <= now) {
          showToast('Data/Hora Inválida: A data e hora programada deve ser posterior ao momento atual.', 'warning');
          return;
      }
    }

    if (paymentMethod === DriverPaymentMethod.PixEFrete && !pixKey.trim()) {
        showToast('Para pagamento via PIX - E-FRETE, a Chave Pix é obrigatória.', 'warning');
        return;
    }

    if (paymentMethod === DriverPaymentMethod.DepositoConta && !bankDetails.trim()) {
        showToast('Para depósito em conta, os Dados Bancários são obrigatórios.', 'warning');
        return;
    }

    if (!anttModality) {
        showToast('A Modalidade da ANTT (TAC ou ETC) é obrigatória para solicitar o embarque.', 'warning');
        return;
    }

    if (!anttOwnerIdentifier.trim()) {
        showToast(`O ${anttModality === AnttModality.TAC ? 'CPF' : 'CNPJ'} do Titular da ANTT é obrigatório.`, 'warning');
        return;
    }

    const cleanAnttId = anttOwnerIdentifier.replace(/\D/g, '');
    if (anttModality === AnttModality.TAC && cleanAnttId.length !== 11) {
        showToast('CPF do Titular da ANTT inválido (deve conter 11 dígitos).', 'warning');
        return;
    }

    if (anttModality === AnttModality.ETC && cleanAnttId.length !== 14) {
        showToast('CNPJ do Titular da ANTT inválido (deve conter 14 dígitos).', 'warning');
        return;
    }

    if (anttModality === AnttModality.ETC && !etcTaxRegime) {
        showToast('Para a modalidade ETC (Pessoa Jurídica), realize a consulta do CNPJ ou selecione o Regime Tributário manualmente.', 'warning');
        return;
    }

    if (anttModality === AnttModality.TAC && isPfDisabled) {
        showToast('O frete PF (Pessoa Física / TAC) foi desabilitado nesta carga. Selecione a modalidade ETC (Pessoa Jurídica).', 'warning');
        return;
    }



    const calc = calculateAdvanceAndBalance({
      driverFreightValue: calculatedFreight,
      driverFreightRate: currentFreightRate,
      tonnage: shipmentTonnage,
      tollValue: 0,
      advancePercentage: advancePercentage !== undefined ? advancePercentage : 70,
      driverFreightType: anttModality === AnttModality.TAC ? 'PF' : 'PJ',
    });

    const companyFreightRate = currentCargo.companyFreightValuePerTon || 0;

    const shipmentData = {
      cargoId: currentCargo.id,
      driverName,
      driverCpf,
      driverContact,
      codigoAtua: codigoAtua ? codigoAtua.trim() : undefined,
      ownerName: ownerName.trim() || undefined,
      ownerContact: ownerContact || undefined,
      horsePlate,
      trailer1Plate,
      trailer2Plate,
      trailer3Plate,
      shipmentTonnage,
      driverFreightValue: calculatedFreight,
      driverFreightRateSnapshot: currentFreightRate,
      companyFreightRateSnapshot: companyFreightRate,
      freightCalculationType: currentCargo.freightCalculationType || leg1.freightCalculationType,
      icmsValue: currentCargo.icmsValue || leg1.icmsValue,
      driverFreightType: anttModality === AnttModality.TAC ? 'PF' : 'PJ',
      anttOwnerIdentifier: anttOwnerIdentifier.trim(),
      anttModality: anttModality,
      etcTaxRegime: anttModality === AnttModality.ETC ? (etcTaxRegime || undefined) : undefined,
      embarcadorId: embarcadorId,
      scheduledDate,
      scheduledTime,
      vehicleSetType: vehicleSetType || undefined,
      vehicleBodyType: vehicleBodyType || undefined,
      paymentMethod,
      pixKey: (paymentMethod === DriverPaymentMethod.PixEFrete || paymentMethod === DriverPaymentMethod.PagamentoLivre) ? (pixKey.trim() || undefined) : undefined,
      bankDetails: (paymentMethod === DriverPaymentMethod.DepositoConta || paymentMethod === DriverPaymentMethod.PagamentoLivre || bankDetails) ? (bankDetails.trim() || undefined) : undefined,
      advancePercentage: calc.advancePercentage,
      advanceValue: calc.advanceInAccountValue,
      tollValue: 0,
      balanceToReceiveValue: calc.balanceToReceiveValue,
      vehicleTag: vehicleTag || undefined,
      filesToAttach: filesToAttach.length > 0 ? filesToAttach : undefined,
      financialCostMonthlyRate: currentCargo.financialCostEnabled ? (currentCargo.financialCostMonthlyRate || 0) : undefined,
      financialCostDaysTerm: currentCargo.financialCostEnabled ? (currentCargo.financialCostDaysTerm || 30) : undefined,
      financialCostRate: currentCargo.financialCostEnabled ? (currentCargo.financialCostEffectiveRate || (currentCargo.financialCostBaseDays && currentCargo.financialCostBaseDays > 0 ? Number((((currentCargo.financialCostMonthlyRate || 0) * (currentCargo.financialCostDaysTerm || 30)) / currentCargo.financialCostBaseDays).toFixed(4)) : 0)) : undefined,
      financialCostValue: (currentCargo.financialCostEnabled && companyFreightRate > 0 && shipmentTonnage > 0)
        ? Number(((companyFreightRate * shipmentTonnage) * ((currentCargo.financialCostEffectiveRate || 0) / 100)).toFixed(2))
        : undefined,
    };

    // Check for active shipments for this driver
    const cleanCpf = driverCpf.replace(/\D/g, '');
    const cleanName = driverName.trim().toLowerCase();

    const activeShipments = (shipments || []).filter(s => {
      if (s.status === ShipmentStatus.Finalizado || s.status === ShipmentStatus.Cancelado) {
        return false;
      }
      const sCpf = s.driverCpf ? s.driverCpf.replace(/\D/g, '') : '';
      const sName = s.driverName ? s.driverName.trim().toLowerCase() : '';

      const matchesCpf = cleanCpf.length === 11 && sCpf === cleanCpf;
      const matchesName = cleanName.length > 0 && sName === cleanName;

      return matchesCpf || matchesName;
    });

    if (activeShipments.length > 0) {
      setPendingPayload(shipmentData);
      setActiveShipmentsFound(activeShipments);
      setShowConfirmModal(true);
      return;
    }

    try {
      setIsSubmitting(true);
      await onSave(shipmentData);
      onClose();
    } catch (err: any) {
      console.error('Falha ao salvar embarque:', err);
      const msg = err?.message || 'Erro ao processar solicitação de embarque.';
      showToast(msg, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmSave = async () => {
    if (pendingPayload) {
      try {
        setIsSubmitting(true);
        await onSave(pendingPayload);
        setPendingPayload(null);
        setShowConfirmModal(false);
        setActiveShipmentsFound([]);
        onClose();
      } catch (err: any) {
        console.error('Falha ao confirmar embarque:', err);
        const msg = err?.message || 'Erro ao processar solicitação de embarque.';
        showToast(msg, 'error');
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  if (!isOpen) return null;

  if (!currentCargo) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-8 max-w-md w-full">
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center">
              <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-1">Carga Não Encontrada</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                A carga vinculada a esta solicitação foi removida do sistema ou não está mais disponível. Não é possível criar o embarque.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-medium transition-colors"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    );
  }

  const clientName = clients.find(c => c.id === currentCargo.clientId)?.nomeFantasia || 'Cliente não encontrado';
  const isExistingDriver = !!drivers.find(d => d.name.trim().toLowerCase() === driverName.trim().toLowerCase() && driverName.trim() !== '');

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex justify-center items-center p-4 overscroll-contain">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-6 md:p-8 max-w-6xl w-full max-h-[92vh] overflow-y-auto overscroll-contain border border-gray-100 dark:border-gray-700">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Solicitação de Embarque</h2>
          <button
            type="button"
            onClick={handleSyncCargo}
            disabled={isSyncingCargo}
            className="px-3 py-1.5 bg-gray-100 dark:bg-gray-700/80 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all shadow-xs"
            title="Atualizar dados da carga direto do banco sem perder o que digitou"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncingCargo ? 'animate-spin text-primary' : 'text-gray-500'}`} />
            <span>{isSyncingCargo ? 'Atualizando...' : 'Atualizar Carga'}</span>
          </button>
        </div>
        <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-900/50 rounded-xl border border-gray-200 dark:border-gray-700">
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <p className="text-gray-600 dark:text-gray-400">Cliente: <span className="font-bold text-gray-900 dark:text-gray-100">{clientName}</span></p>
            <p className="text-gray-600 dark:text-gray-400">Rota: <span className="font-bold text-gray-900 dark:text-gray-100">{currentCargo.origin} → {currentCargo.destination}</span></p>
            <p className="text-gray-600 dark:text-gray-400">Saldo Disponível: <span className="font-bold text-emerald-600 dark:text-emerald-400">{calculateCargoBalance(currentCargo, shipments).availableVolume.toLocaleString('pt-BR')} ton</span></p>
          </div>
          {currentCargo.allowedVehicleTypes && currentCargo.allowedVehicleTypes.length > 0 ? (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                Veículos Permitidos: <span className="font-semibold text-gray-700 dark:text-gray-300">{currentCargo.allowedVehicleTypes.map(vt => `${vt.setType} (${vt.bodyTypes.join('/')})`).join(', ')}</span>
              </p>
          ) : (
              <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-2 font-medium">
                ✓ Todos os tipos de veículos são permitidos nesta carga
              </p>
          )}
        </div>
        
        <form 
          onSubmit={handleSubmit} 
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'TEXTAREA') {
              e.preventDefault();
            }
          }}
          className="space-y-5"
        >
            {isDemo && (
              <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300/70 dark:border-amber-700/60 text-xs text-amber-800 dark:text-amber-200 font-medium">
                🧪 <strong>Ambiente Demonstração:</strong> os campos desta solicitação de embarque foram pré-preenchidos com dados fictícios de teste. Você pode revisar todos os campos e confirmar para gerar o embarque de teste sem impactar o sistema real.
              </div>
            )}
            {/* Date & Time */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Data Programada</label>
                  <input type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} className="p-3 w-full border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white" required />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Horário Previsto</label>
                  <input type="time" value={scheduledTime} onChange={(e) => setScheduledTime(e.target.value)} className="p-3 w-full border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white" required />
                </div>
            </div>
            
            {/* Embarcador */}
            <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Embarcador Responsável</label>
                <select
                    value={embarcadorId}
                    onChange={(e) => setEmbarcadorId(e.target.value)}
                    className="p-3 w-full border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    required
                >
                    <option value="" disabled>Selecione um responsável...</option>
                    {embarcadores.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
            </div>

            {/* Driver info */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  CPF do Motorista <span className="text-red-500">*</span>
                </label>
                <input 
                  type="text" 
                  value={driverCpf} 
                  onChange={(e) => handleDriverCpfChange(e.target.value)} 
                  placeholder="Digite o CPF do motorista" 
                  className="p-3 w-full border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white" 
                  required 
                />
              </div>
              <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Contato (WhatsApp) <span className="text-red-500">*</span>
                  </label>
                  <input 
                    type="text" 
                    value={driverContact} 
                    onChange={(e) => setDriverContact(autoFormatInput('phone', e.target.value))} 
                    placeholder="Contato (WhatsApp)" 
                    className="p-3 w-full border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white" 
                    required 
                  />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <span>Código ATUA</span>
                    <span className="text-xs font-normal text-gray-500">(Cadastro ATUA)</span>
                  </span>
                  {hasPreloadedAtua ? (
                    <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-1.5 py-0.5 rounded border border-emerald-200 dark:border-emerald-800">
                      ✓ Vinculado
                    </span>
                  ) : (
                    <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/50 px-1.5 py-0.5 rounded border border-amber-200 dark:border-amber-800">
                      Obrigatório em Ag. Cadastro
                    </span>
                  )}
                </label>
                <input 
                  type="text" 
                  value={codigoAtua} 
                  onChange={(e) => {
                    setCodigoAtua(e.target.value);
                    setHasPreloadedAtua(false);
                  }} 
                  placeholder="Ex: 104523 ou Cód. Cadastro" 
                  className={`p-3 w-full border rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-medium ${
                    !codigoAtua.trim()
                      ? 'border-amber-300 dark:border-amber-600'
                      : 'border-emerald-400 dark:border-emerald-500'
                  }`} 
                />
                {!codigoAtua.trim() && (
                  <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1 font-medium">
                    ℹ️ Se não informado agora, o embarque parará em "Ag. Cadastro" para inclusão obrigatória do código.
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="relative" ref={driverInputContainerRef}>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Motorista</label>
                  <input 
                    value={driverName} 
                    onChange={(e) => handleDriverNameChange(e.target.value)} 
                    onFocus={() => { if (driverSuggestions.length > 0) setShowDriverSuggestions(true); }}
                    placeholder="Digite o nome do motorista" 
                    className="p-3 w-full border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white" 
                    required 
                    autoComplete="off"
                  />
                  {showDriverSuggestions && driverSuggestions.length > 0 && (
                    <div className="absolute z-50 left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl max-h-56 overflow-y-auto overflow-x-hidden divide-y divide-gray-100 dark:divide-gray-700/60">
                      {driverSuggestions.map((d) => (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => {
                            applyDriverAutofill(d);
                            setShowDriverSuggestions(false);
                          }}
                          className="w-full text-left px-3.5 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700/60 transition-colors flex items-center justify-between gap-2 cursor-pointer"
                        >
                          <div className="truncate">
                            <p className="text-sm font-bold text-gray-900 dark:text-white truncate">{d.name}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">CPF: {d.cpf || 'Não cadastrado'} {d.phone ? `• ${d.phone}` : ''}</p>
                          </div>
                          {!d.active && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300 shrink-0">
                              Restrito
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Contato do Proprietário</label>
                <input 
                  type="text" 
                  value={ownerContact} 
                  onChange={(e) => setOwnerContact(autoFormatInput('phone', e.target.value))} 
                  placeholder="Telefone/WhatsApp do proprietário" 
                  className="p-3 w-full border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white" 
                />
              </div>
            </div>

            {/* Vehicle Plates & Types */}
            <div className="relative" ref={plateInputContainerRef}>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Placa Cavalo</label>
                <input 
                  value={horsePlate} 
                  onChange={(e) => handleHorsePlateChange(e.target.value)} 
                  onFocus={() => { if (plateSuggestions.length > 0) setShowPlateSuggestions(true); }}
                  placeholder="AAA-1234 ou ABC1D23" 
                  className="p-3 w-full border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white uppercase" 
                  required 
                  autoComplete="off"
                />
                {showPlateSuggestions && plateSuggestions.length > 0 && (
                  <div className="absolute z-50 left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl max-h-56 overflow-y-auto overflow-x-hidden divide-y divide-gray-100 dark:divide-gray-700/60">
                    {plateSuggestions.map((v) => (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => {
                          applyPlateAutofill(v.plate);
                          setShowPlateSuggestions(false);
                        }}
                        className="w-full text-left px-3.5 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700/60 transition-colors flex items-center justify-between gap-2 cursor-pointer"
                      >
                        <div>
                          <p className="text-sm font-mono font-bold text-gray-900 dark:text-white">{v.plate}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">{v.setType || 'Cavalo'} {v.bodyType ? `• ${v.bodyType}` : ''}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
            </div>
          
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Tipo de Veículo</label>
                    <select value={vehicleSetType} onChange={(e) => setVehicleSetType(e.target.value as VehicleSetType)} className="p-3 w-full border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white" required={!selectedVehicle} disabled={!!selectedVehicle}>
                        <option value="" disabled>Selecione...</option>
                        {Object.values(VehicleSetType).map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                </div>
                <div>
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Tipo de Carroceria</label>
                    <select value={vehicleBodyType} onChange={(e) => setVehicleBodyType(e.target.value as VehicleBodyType)} className="p-3 w-full border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white" required={!selectedVehicle} disabled={!!selectedVehicle}>
                        <option value="" disabled>Selecione...</option>
                        {Object.values(VehicleBodyType).map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                </div>
            </div>

            {/* Live Vehicle Compatibility & 1-Click Permission Banner */}
            {vehicleValidationInfo.hasRules && (
              <div>
                {!vehicleValidationInfo.isAllowed ? (
                  <div className="p-3.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700/60 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shadow-xs">
                    <div className="flex items-start gap-2.5">
                      <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-bold text-amber-900 dark:text-amber-200">
                          Veículo não permitido na carga: {vehicleValidationInfo.setType} - {vehicleValidationInfo.bodyType}
                        </p>
                        <p className="text-amber-700 dark:text-amber-400 mt-0.5 text-[11px]">
                          Permitidos atualmente: {currentCargo?.allowedVehicleTypes?.map(vt => `${vt.setType} (${vt.bodyTypes.join('/')})`).join(', ')}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={handleSyncCargo}
                        disabled={isSyncingCargo}
                        className="px-2.5 py-1.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 text-gray-700 dark:text-gray-200 rounded-lg font-semibold flex items-center gap-1 shadow-xs transition-all text-xs"
                        title="Verificar se outra pessoa já atualizou a carga"
                      >
                        <RefreshCw className={`w-3 h-3 ${isSyncingCargo ? 'animate-spin text-primary' : ''}`} />
                        <span>{isSyncingCargo ? 'Checando...' : 'Sincronizar'}</span>
                      </button>
                      {canAllowVehicleOnCargo && (
                        <button
                          type="button"
                          onClick={handleAllowCurrentVehicleOnCargo}
                          disabled={isUpdatingCargoPermission}
                          className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold flex items-center gap-1.5 shadow-xs transition-all text-xs"
                          title="Adiciona este tipo de veículo nas regras da carga agora sem recarregar a tela"
                        >
                          <Zap className="w-3.5 h-3.5" />
                          <span>{isUpdatingCargoPermission ? 'Liberando...' : 'Permitir Este Veículo'}</span>
                        </button>
                      )}
                    </div>
                  </div>
                ) : (vehicleValidationInfo.setType && vehicleValidationInfo.bodyType ? (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/40 rounded-lg text-xs text-emerald-700 dark:text-emerald-300 font-medium">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span>Tipo de veículo compatível com as regras desta carga</span>
                  </div>
                ) : null)}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div><label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Placa Carreta 1</label><input type="text" value={trailer1Plate} onChange={(e) => setTrailer1Plate(e.target.value.toUpperCase())} placeholder="Obrigatório" className="p-3 w-full border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white" required /></div>
              <div><label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Placa Carreta 2</label><input type="text" value={trailer2Plate} onChange={(e) => setTrailer2Plate(e.target.value.toUpperCase())} placeholder="Opcional" className="p-3 w-full border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white" /></div>
              <div><label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Placa Carreta 3</label><input type="text" value={trailer3Plate} onChange={(e) => setTrailer3Plate(e.target.value.toUpperCase())} placeholder="Opcional" className="p-3 w-full border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white" /></div>
            </div>
            
            {/* Formas de Pagamento & Adiantamento */}
            <div className="p-4 bg-gray-50 dark:bg-gray-900/40 rounded-2xl border border-gray-200 dark:border-gray-700 space-y-4">
                <div className="flex items-center justify-between">
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider">
                      FORMA DE PAGAMENTO & ADIANTAMENTO <span className="text-red-500">*</span>
                    </label>
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 dark:text-gray-300">
                        <span>Adiantamento:</span>
                        <div className="relative w-24">
                            <input 
                                type="number" 
                                value={advancePercentage} 
                                onChange={(e) => setAdvancePercentage(parseFloat(e.target.value) || 0)} 
                                className="p-1.5 pr-6 w-full text-right font-bold text-emerald-600 dark:text-emerald-400 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm focus:ring-2 focus:ring-emerald-500"
                                min="0"
                                max="100"
                                required
                            />
                            <span className="absolute right-2 top-1.5 text-xs font-bold text-gray-400">%</span>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <button
                        type="button"
                        onClick={() => setPaymentMethod(DriverPaymentMethod.PixEFrete)}
                        className={`p-3 rounded-xl border text-center transition-all text-xs font-bold flex flex-col items-center justify-center gap-1 ${
                            paymentMethod === DriverPaymentMethod.PixEFrete
                            ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 ring-2 ring-emerald-500/20'
                            : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:border-gray-300'
                        }`}
                    >
                        <span className="text-sm">⚡ PIX - E-FRETE</span>
                        <span className="text-[10px] font-normal text-gray-500 dark:text-gray-400">Via Chave Pix</span>
                    </button>

                    <button
                        type="button"
                        onClick={() => setPaymentMethod(DriverPaymentMethod.DepositoConta)}
                        className={`p-3 rounded-xl border text-center transition-all text-xs font-bold flex flex-col items-center justify-center gap-1 ${
                            paymentMethod === DriverPaymentMethod.DepositoConta
                            ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 ring-2 ring-blue-500/20'
                            : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:border-gray-300'
                        }`}
                    >
                        <span className="text-sm">🏦 DEPÓSITO CONTA</span>
                        <span className="text-[10px] font-normal text-gray-500 dark:text-gray-400">Dados Bancários</span>
                    </button>

                    <button
                        type="button"
                        onClick={() => setPaymentMethod(DriverPaymentMethod.SmsCartaFrete)}
                        className={`p-3 rounded-xl border text-center transition-all text-xs font-bold flex flex-col items-center justify-center gap-1 ${
                            paymentMethod === DriverPaymentMethod.SmsCartaFrete
                            ? 'border-purple-600 bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 ring-2 ring-purple-500/20'
                            : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:border-gray-300'
                        }`}
                    >
                        <span className="text-sm">📱 SMS CARTA FRETE</span>
                        <span className="text-[10px] font-normal text-gray-500 dark:text-gray-400">Carta Frete</span>
                    </button>

                    <button
                        type="button"
                        onClick={() => setPaymentMethod(DriverPaymentMethod.PagamentoLivre)}
                        className={`p-3 rounded-xl border text-center transition-all text-xs font-bold flex flex-col items-center justify-center gap-1 ${
                            paymentMethod === DriverPaymentMethod.PagamentoLivre
                            ? 'border-amber-600 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 ring-2 ring-amber-500/20'
                            : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:border-gray-300'
                        }`}
                    >
                        <span className="text-sm">🔓 PAGAMENTO LIVRE</span>
                        <span className="text-[10px] font-normal text-gray-500 dark:text-gray-400">Negociação Direta</span>
                    </button>
                </div>

                {paymentMethod === DriverPaymentMethod.PixEFrete && (
                    <div>
                        <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                            Chave Pix <span className="text-red-500">*</span>
                        </label>
                        <input 
                            type="text" 
                            value={pixKey} 
                            onChange={(e) => setPixKey(e.target.value)} 
                            placeholder="CPF, CNPJ, Telefone, E-mail ou Chave Aleatória" 
                            className="p-3 w-full border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                            required
                        />
                    </div>
                )}

                {paymentMethod === DriverPaymentMethod.DepositoConta && (
                    <div>
                        <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                            Dados Bancários <span className="text-red-500">*</span>
                        </label>
                        <textarea 
                            value={bankDetails} 
                            onChange={(e) => setBankDetails(e.target.value)} 
                            placeholder="Banco, Agência, Conta Corrente/Poupança, Favorecido, CPF/CNPJ..." 
                            className="p-3 w-full border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-y text-sm" 
                            rows={2} 
                            required
                        />
                    </div>
                )}

                {paymentMethod === DriverPaymentMethod.SmsCartaFrete && (
                    <div className="p-3 bg-purple-50/50 dark:bg-purple-900/20 border border-purple-100 dark:border-purple-800 rounded-xl text-xs text-purple-800 dark:text-purple-300 flex items-center gap-2">
                        <span>ℹ️ Pagamento via SMS Carta Frete para o condutor.</span>
                    </div>
                )}

                {paymentMethod === DriverPaymentMethod.PagamentoLivre && (
                    <div className="space-y-3">
                        <div className="p-3 bg-amber-50/50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl text-xs text-amber-800 dark:text-amber-300 flex items-center gap-2">
                            <span>ℹ️ Pagamento Livre: modalidade flexível / negociada diretamente com o motorista. Chave Pix e dados bancários são opcionais.</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                                    Chave Pix (Opcional)
                                </label>
                                <input 
                                    type="text" 
                                    value={pixKey} 
                                    onChange={(e) => setPixKey(e.target.value)} 
                                    placeholder="Chave Pix se houver..." 
                                    className="p-2.5 w-full border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm font-mono"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                                    Dados Bancários / Observações (Opcional)
                                </label>
                                <input 
                                    type="text" 
                                    value={bankDetails} 
                                    onChange={(e) => setBankDetails(e.target.value)} 
                                    placeholder="Banco/conta ou obs..." 
                                    className="p-2.5 w-full border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                                />
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Document Attachment & Scan */}
            <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Anexar Documentos</label>
                <div className="mt-1 flex items-center h-full">
                    <label className="cursor-pointer bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 py-2.5 px-4 rounded-xl inline-flex items-center transition-colors font-medium text-sm border border-gray-300 dark:border-gray-600">
                        <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"></path></svg>
                        Anexar
                        <input type="file" multiple className="hidden" onChange={(e) => {
                            if (e.target.files) {
                                setFilesToAttach(Array.from(e.target.files));
                            }
                        }} />
                    </label>
                    <span className="ml-3 text-xs text-gray-500 dark:text-gray-400">
                        {filesToAttach.length > 0 ? `${filesToAttach.length} arquivo(s) selecionado(s)` : 'Nenhum'}
                    </span>
                    {filesToAttach.length > 0 && (
                        <button
                            type="button"
                            onClick={() => handleScanDocument(filesToAttach)}
                            disabled={isScanning}
                            className={`ml-3 text-xs font-bold uppercase py-1.5 px-3 rounded-lg border transition-all ${
                                isScanning 
                                ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed' 
                                : 'bg-indigo-50 text-indigo-600 border-indigo-200 hover:bg-indigo-600 hover:text-white'
                            }`}
                        >
                            {isScanning ? 'Processando...' : 'Digitalizar com IA'}
                        </button>
                    )}
                </div>
            </div>
          
            {/* Target Layout from Screenshot: 2-Column Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-3">
                
                {/* Left Column: Toneladas & Tipo de Embarque */}
                <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Toneladas do Embarque</label>
                      <input 
                        type="number" 
                        value={shipmentTonnage || ''} 
                        onChange={(e) => setShipmentTonnage(parseFloat(e.target.value) || 0)} 
                        placeholder="Ex: 35.5" 
                        className="p-3 w-full border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-600" 
                        step="0.01" 
                        required 
                      />
                    </div>

                    {/* Dashed Box for TIPO DE EMBARQUE (Somente Leitura / Definido pela ANTT) */}
                    <div className="p-4 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-2xl bg-gray-50/50 dark:bg-gray-900/30 space-y-3">
                        <div className="flex items-center justify-between">
                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider">
                              TIPO DE EMBARQUE <span className="text-red-500">*</span>
                            </label>
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-gray-200/80 dark:bg-gray-700 text-gray-700 dark:text-gray-300 flex items-center gap-1">
                              <span>🔒</span> Definido pela ANTT
                            </span>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            {/* PJ Card (Read-only display) */}
                            <div
                              className={`p-4 rounded-2xl border-2 text-center transition-all duration-200 flex flex-col items-center justify-center relative select-none ${
                                driverFreightType === 'PJ' && anttModality === AnttModality.ETC
                                  ? 'border-emerald-600 bg-white dark:bg-gray-800 shadow-md ring-2 ring-emerald-500/20'
                                  : 'border-gray-200 dark:border-gray-700 bg-gray-50/70 dark:bg-gray-800/40 opacity-40'
                              }`}
                            >
                                <span className="text-xl font-black text-gray-900 dark:text-white">PJ</span>
                                <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 mt-0.5">Pessoa Jurídica</span>
                                <span className="text-base font-black text-gray-900 dark:text-white mt-2">
                                  {formatCurrency(ratePj)}{hasPjToll ? ' + Ped' : ''} <span className="text-xs font-normal text-gray-400">{isFixedFreight ? 'fixo' : '/ton'}</span>
                                </span>
                                {anttModality === AnttModality.ETC && (
                                  <span className="mt-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300">
                                    ETC {etcTaxRegime ? `• ${etcTaxRegime}` : ''}
                                  </span>
                                )}
                            </div>

                            {/* PF Card (Read-only display) */}
                            <div
                              className={`p-4 rounded-2xl border-2 text-center transition-all duration-200 flex flex-col items-center justify-center relative select-none ${
                                isPfDisabled
                                  ? 'border-gray-200 bg-gray-100 dark:bg-gray-900/50 opacity-30 cursor-not-allowed'
                                  : driverFreightType === 'PF' && anttModality === AnttModality.TAC
                                  ? 'border-orange-500 bg-white dark:bg-gray-800 shadow-md ring-2 ring-orange-500/20'
                                  : 'border-gray-200 dark:border-gray-700 bg-gray-50/70 dark:bg-gray-800/40 opacity-40'
                              }`}
                            >
                                <span className="text-xl font-black text-gray-900 dark:text-white">PF</span>
                                <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 mt-0.5">Pessoa Física</span>
                                <span className="text-base font-black text-gray-900 dark:text-white mt-2">
                                  {isPfDisabled ? (
                                    <span className="text-xs text-red-500 italic">Desabilitado</span>
                                  ) : (
                                    <>{formatCurrency(ratePf)}{hasPfToll ? ' + Ped' : ''} <span className="text-xs font-normal text-gray-400">{isFixedFreight ? 'fixo' : '/ton'}</span></>
                                  )}
                                </span>
                                {anttModality === AnttModality.TAC && (
                                  <span className="mt-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-800 dark:bg-orange-900/60 dark:text-orange-300">
                                    TAC • Autônomo
                                  </span>
                                )}
                            </div>
                        </div>

                        <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 text-center flex items-center justify-center gap-1 pt-0.5">
                          {anttModality === AnttModality.TAC ? (
                            <span className="text-orange-600 dark:text-orange-400">👤 Frete PF selecionado automaticamente (TAC)</span>
                          ) : anttModality === AnttModality.ETC ? (
                            <span className="text-emerald-600 dark:text-emerald-400">🏢 Frete PJ selecionado automaticamente (ETC)</span>
                          ) : (
                            <span className="text-amber-600 dark:text-amber-400">⚠️ Selecione a Modalidade ANTT ao lado</span>
                          )}
                        </p>
                    </div>
                </div>

                {/* Right Column: Tag & Modalidade ANTT */}
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Tag do Veículo</label>
                        <input 
                          type="text" 
                          value={vehicleTag} 
                          onChange={(e) => setVehicleTag(e.target.value)} 
                          placeholder="Obrigatório" 
                          className="p-3 w-full border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-600" 
                          required 
                        />
                    </div>

                    {/* MODALIDADE DA ANTT */}
                    <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-2xl bg-gray-50/70 dark:bg-gray-900/40 space-y-3.5 shadow-xs">
                        <div className="flex items-center justify-between">
                            <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider flex items-center gap-1.5">
                              <ShieldCheck className="w-4 h-4 text-primary" />
                              <span>MODALIDADE DA ANTT <span className="text-red-500">*</span></span>
                            </label>
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300">
                              Obrigatório
                            </span>
                        </div>

                        {/* TAC vs ETC selection buttons */}
                        <div className="grid grid-cols-2 gap-3">
                            {/* TAC Button */}
                            <button
                              type="button"
                              onClick={() => {
                                setAnttModality(AnttModality.TAC);
                                setEtcTaxRegime('');
                                setIsManualEtcRegime(false);
                                setCnpjSearchResult(null);
                                if (!anttOwnerIdentifier || anttOwnerIdentifier.replace(/\D/g, '').length > 11) {
                                  setAnttOwnerIdentifier(driverCpf || '');
                                }
                                if (!isPfDisabled) {
                                  setDriverFreightType('PF');
                                } else {
                                  showToast('Atenção: Frete PF está desabilitado nesta carga.', 'warning');
                                }
                              }}
                              className={`p-3.5 rounded-xl border-2 text-left transition-all duration-200 flex flex-col justify-between ${
                                anttModality === AnttModality.TAC
                                  ? 'border-orange-500 bg-orange-50/60 dark:bg-orange-950/40 text-orange-950 dark:text-orange-100 ring-2 ring-orange-500/20 shadow-sm'
                                  : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:border-gray-300'
                              }`}
                            >
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-1.5">
                                    <UserIcon className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                                    <span className="font-extrabold text-base">TAC</span>
                                  </div>
                                  <span className="text-[10px] uppercase font-black px-1.5 py-0.5 rounded bg-orange-200/80 dark:bg-orange-900/70 text-orange-800 dark:text-orange-200">
                                    PF
                                  </span>
                                </div>
                                <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1.5 leading-tight font-medium">
                                  Transportador Autônomo de Cargas (Pessoa Física)
                                </p>
                            </button>

                            {/* ETC Button */}
                            <button
                              type="button"
                              onClick={() => {
                                setAnttModality(AnttModality.ETC);
                                setDriverFreightType('PJ');
                                if (anttOwnerIdentifier.replace(/\D/g, '').length === 11) {
                                  setAnttOwnerIdentifier('');
                                  setEtcTaxRegime('');
                                  setIsManualEtcRegime(false);
                                  setCnpjSearchResult(null);
                                }
                              }}
                              className={`p-3.5 rounded-xl border-2 text-left transition-all duration-200 flex flex-col justify-between ${
                                anttModality === AnttModality.ETC
                                  ? 'border-emerald-600 bg-emerald-50/60 dark:bg-emerald-950/40 text-emerald-950 dark:text-emerald-100 ring-2 ring-emerald-500/20 shadow-sm'
                                  : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:border-gray-300'
                              }`}
                            >
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-1.5">
                                    <Building2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                                    <span className="font-extrabold text-base">ETC</span>
                                  </div>
                                  <span className="text-[10px] uppercase font-black px-1.5 py-0.5 rounded bg-emerald-200/80 dark:bg-emerald-900/70 text-emerald-800 dark:text-emerald-200">
                                    PJ
                                  </span>
                                </div>
                                <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1.5 leading-tight font-medium">
                                  Empresa de Transporte Rodoviário (Pessoa Jurídica)
                                </p>
                            </button>
                        </div>

                        {/* When TAC is selected: CPF do Titular & Nome do Proprietário */}
                        {anttModality === AnttModality.TAC && (
                            <div className="pt-2 space-y-3 animate-fade-in border-t border-gray-200 dark:border-gray-700/80">
                                <div className="space-y-1.5">
                                    <label className="block text-[11px] font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                                        CPF do Titular da ANTT (TAC) <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={anttOwnerIdentifier}
                                        onChange={(e) => handleAnttOwnerIdentifierChange(e.target.value)}
                                        placeholder="000.000.000-00"
                                        className="p-2.5 w-full border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm font-medium focus:ring-2 focus:ring-orange-500"
                                        required
                                    />
                                    <p className="text-[10px] text-gray-500 dark:text-gray-400">
                                        CPF do transportador autônomo titular do RNTRC
                                    </p>
                                </div>

                                <div className="space-y-1.5">
                                    <div className="flex items-center justify-between">
                                        <label className="block text-[11px] font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                                            Nome do Proprietário / Titular da ANTT <span className="text-red-500">*</span>
                                        </label>
                                        {ownerAutoFillSource && (
                                            <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                                                ✓ {ownerAutoFillSource}
                                            </span>
                                        )}
                                    </div>
                                    <input
                                        type="text"
                                        value={ownerName}
                                        onChange={(e) => {
                                            setOwnerName(e.target.value);
                                            setOwnerAutoFillSource('');
                                        }}
                                        placeholder="Nome completo do proprietário"
                                        className="p-2.5 w-full border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm font-medium focus:ring-2 focus:ring-orange-500"
                                        required
                                    />
                                </div>
                            </div>
                        )}

                        {/* When ETC is selected: CNPJ with Lookup, Nome da Empresa and Regime Tributário */}
                        {anttModality === AnttModality.ETC && (
                            <div className="pt-2 space-y-3 animate-fade-in border-t border-gray-200 dark:border-gray-700/80">
                                <div className="space-y-1.5">
                                    <div className="flex items-center justify-between">
                                        <label className="block text-[11px] font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                                            CNPJ da Transportadora (ETC) <span className="text-red-500">*</span>
                                        </label>
                                        {isSearchingCnpj && (
                                            <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                                                <Loader2 className="w-3 h-3 animate-spin" /> Buscando na Receita...
                                            </span>
                                        )}
                                    </div>
                                    
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="text"
                                            value={anttOwnerIdentifier}
                                            onChange={(e) => handleAnttOwnerIdentifierChange(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                    e.preventDefault();
                                                    searchCnpjTaxRegime(anttOwnerIdentifier);
                                                }
                                            }}
                                            placeholder="00.000.000/0000-00"
                                            className="p-2.5 flex-1 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm font-medium focus:ring-2 focus:ring-emerald-600"
                                            required
                                        />
                                        <button
                                            type="button"
                                            onClick={() => searchCnpjTaxRegime(anttOwnerIdentifier)}
                                            disabled={isSearchingCnpj || anttOwnerIdentifier.replace(/\D/g, '').length !== 14}
                                            className="px-3 py-2.5 bg-emerald-50 dark:bg-emerald-950/50 hover:bg-emerald-100 dark:hover:bg-emerald-900 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                                            title="Consultar CNPJ na Receita Federal para identificar o regime tributário"
                                        >
                                            {isSearchingCnpj ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                                            <span>Consultar</span>
                                        </button>
                                    </div>

                                    {cnpjSearchResult && (
                                        <div className="p-2.5 bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/50 rounded-xl text-xs space-y-0.5 animate-fade-in">
                                            <p className="font-bold text-emerald-950 dark:text-emerald-100 truncate">
                                                🏢 {cnpjSearchResult.razaoSocial}
                                            </p>
                                            <p className="text-[11px] text-emerald-700 dark:text-emerald-300">
                                                Regime Identificado: <strong>{cnpjSearchResult.regimeFound}</strong>
                                            </p>
                                        </div>
                                    )}
                                </div>

                                <div className="space-y-1.5">
                                    <div className="flex items-center justify-between">
                                        <label className="block text-[11px] font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                                            Razão Social / Nome do Proprietário (PJ) <span className="text-red-500">*</span>
                                        </label>
                                        {ownerAutoFillSource && (
                                            <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                                                ✓ {ownerAutoFillSource}
                                            </span>
                                        )}
                                    </div>
                                    <input
                                        type="text"
                                        value={ownerName}
                                        onChange={(e) => {
                                            setOwnerName(e.target.value);
                                            setOwnerAutoFillSource('');
                                        }}
                                        placeholder="Razão Social ou Nome Fantasia da Empresa"
                                        className="p-2.5 w-full border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm font-medium focus:ring-2 focus:ring-emerald-600"
                                        required
                                    />
                                </div>

                                {/* Regime Tributário (ETC) - Consulta ou Informação Manual */}
                                <div className="space-y-1.5 animate-fade-in">
                                    <div className="flex items-center justify-between">
                                        <label className="block text-[11px] font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                                            Regime Tributário (ETC) <span className="text-red-500">*</span>
                                        </label>
                                        <button
                                            type="button"
                                            onClick={() => setIsManualEtcRegime(!isManualEtcRegime)}
                                            className="text-[10px] text-emerald-600 dark:text-emerald-400 hover:underline font-bold"
                                        >
                                            {isManualEtcRegime ? '🔍 Consultar CNPJ' : '✏️ Informar Manualmente'}
                                        </button>
                                    </div>

                                    {isManualEtcRegime ? (
                                        <div className="space-y-2 p-3 bg-amber-50/70 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700/60 rounded-xl">
                                            <p className="text-[11px] font-bold text-amber-900 dark:text-amber-200">
                                                Selecione o Regime Tributário da transportadora:
                                            </p>
                                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                                {[
                                                    { regime: EtcTaxRegime.SimplesNacional, label: 'Simples Nacional' },
                                                    { regime: EtcTaxRegime.LucroPresumido, label: 'Lucro Presumido' },
                                                    { regime: EtcTaxRegime.LucroReal, label: 'Lucro Real' },
                                                    { regime: EtcTaxRegime.MEI, label: 'MEI' },
                                                ].map((item) => (
                                                    <button
                                                        key={item.regime}
                                                        type="button"
                                                        onClick={() => setEtcTaxRegime(item.regime)}
                                                        className={`p-2 rounded-lg border text-center transition-all ${
                                                            etcTaxRegime === item.regime
                                                                ? 'border-emerald-600 bg-emerald-600 text-white font-black shadow-xs ring-2 ring-emerald-500/20'
                                                                : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:border-gray-400 font-semibold'
                                                        }`}
                                                    >
                                                        <div className="text-xs leading-tight">{item.label}</div>
                                                    </button>
                                                ))}
                                            </div>
                                            {etcTaxRegime && (
                                                <p className="text-[10px] text-emerald-700 dark:text-emerald-300 font-semibold flex items-center gap-1">
                                                    ✓ Regime selecionado: <strong>{etcTaxRegime}</strong> (Informado Manualmente)
                                                </p>
                                            )}
                                        </div>
                                    ) : etcTaxRegime ? (
                                        <div className="p-3 bg-emerald-50/90 dark:bg-emerald-950/50 border border-emerald-300 dark:border-emerald-700/60 rounded-xl flex items-center justify-between shadow-sm">
                                            <div className="flex items-center gap-2.5">
                                                <div className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold text-xs shadow-sm">
                                                    ✓
                                                </div>
                                                <div>
                                                    <p className="text-xs font-black text-emerald-950 dark:text-emerald-100">
                                                        {etcTaxRegime}
                                                    </p>
                                                    <p className="text-[10px] text-emerald-700 dark:text-emerald-300">
                                                        Obtido automaticamente via Receita Federal
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-[10px] uppercase font-black px-2 py-0.5 rounded-full bg-emerald-200/80 dark:bg-emerald-900/80 text-emerald-900 dark:text-emerald-200">
                                                    Confirmado
                                                </span>
                                                <button
                                                    type="button"
                                                    onClick={() => setIsManualEtcRegime(true)}
                                                    className="text-[10px] text-emerald-700 dark:text-emerald-300 hover:underline font-semibold"
                                                >
                                                    Alterar
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="p-3 bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 rounded-xl space-y-2 text-xs">
                                            <div className="flex items-start gap-2 text-amber-800 dark:text-amber-200">
                                                <span className="text-sm shrink-0">ℹ️</span>
                                                <div>
                                                    <p className="font-semibold text-[11px]">Identificação do Regime Tributário</p>
                                                    <p className="text-[10px] text-amber-700/90 dark:text-amber-300/80 mt-0.5">
                                                        Informe o CNPJ acima e clique em <strong>Consultar</strong>. Se o serviço da Receita estiver fora do ar ou o CNPJ não for localizado, você pode informar manualmente.
                                                    </p>
                                                </div>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => setIsManualEtcRegime(true)}
                                                className="w-full py-2 px-3 bg-amber-200 hover:bg-amber-300 dark:bg-amber-900/60 dark:hover:bg-amber-800 text-amber-950 dark:text-amber-100 rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 transition-colors shadow-xs"
                                            >
                                                <Edit3 className="w-3.5 h-3.5" />
                                                <span>Não localizou na Receita? Informar Regime Manualmente</span>
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Footer buttons */}
            <div className="mt-8 flex justify-end space-x-4 border-t dark:border-gray-700 pt-4">
              <button 
                type="button" 
                onClick={onClose} 
                disabled={isSubmitting}
                className="py-2.5 px-6 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-gray-800 dark:text-gray-200 font-semibold rounded-xl transition-all"
              >
                Cancelar
              </button>
              <button 
                type="submit" 
                disabled={isSubmitting}
                className="py-2.5 px-6 bg-[#0F5132] hover:bg-[#0B3C21] disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl shadow-lg shadow-emerald-950/20 transition-all active:scale-95 flex items-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Solicitando Embarque...</span>
                  </>
                ) : (
                  <span>Solicitar Embarque</span>
                )}
              </button>
            </div>
        </form>
      </div>

      {/* Confirmation Modal: Driver has Active Shipment */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[70] flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white dark:bg-gray-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-amber-300 dark:border-amber-700/60 relative space-y-5 transform transition-all scale-100">
            
            {/* Header */}
            <div className="flex items-start gap-4">
              <div className="p-3 bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 rounded-2xl flex-shrink-0">
                <AlertTriangle className="w-7 h-7" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                  Atenção: Motorista com Embarque Ativo
                </h3>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mt-0.5">
                  Este motorista já possui viagem em andamento no sistema.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Driver & Active Shipments Details */}
            <div className="bg-amber-50/70 dark:bg-amber-950/30 rounded-xl p-4 border border-amber-200/80 dark:border-amber-800/40 space-y-3">
              <div className="text-sm text-gray-800 dark:text-gray-200 font-medium">
                <strong>Motorista:</strong> {driverName} {driverCpf ? `(CPF: ${driverCpf})` : ''}
              </div>
              
              <div className="space-y-2">
                <div className="text-xs font-semibold text-amber-900 dark:text-amber-300 uppercase tracking-wider">
                  Embarque(s) ativo(s) localizado(s):
                </div>
                <div className="max-h-40 overflow-y-auto space-y-2 pr-1">
                  {activeShipmentsFound.map((s) => (
                    <div 
                      key={s.id} 
                      className="bg-white dark:bg-gray-800 p-3 rounded-xl border border-amber-200 dark:border-gray-700 text-xs flex items-center justify-between shadow-sm"
                    >
                      <div>
                        <span className="font-bold text-gray-900 dark:text-white">{s.id}</span>
                        {s.horsePlate && <span className="ml-2 font-mono text-gray-500 dark:text-gray-400">({s.horsePlate})</span>}
                        <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                          Data Programada: {s.scheduledDate ? `${s.scheduledDate} ${s.scheduledTime || ''}` : 'N/A'}
                        </div>
                      </div>
                      <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300 border border-amber-300 dark:border-amber-700/50">
                        {s.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              Deseja confirmar a criação deste novo embarque mesmo assim?
            </p>

            {/* Buttons */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                disabled={isSubmitting}
                className="px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 disabled:opacity-50 text-gray-700 dark:text-gray-300 font-semibold text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmSave}
                disabled={isSubmitting}
                className="px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-bold text-sm shadow-lg shadow-amber-600/30 transition-all flex items-center gap-2 active:scale-95"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Criando Embarque...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Sim, Criar Embarque</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default NewShipmentModal;
