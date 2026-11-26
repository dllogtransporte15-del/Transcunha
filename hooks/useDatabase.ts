
import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '../supabase';
import type { 
  User, Client, Owner, Driver, Vehicle, Product, Cargo, Shipment, Ticket,
  ProfilePermissions, ShipmentLock, Branch, FreightOffer, RiskQueryOption,
  LoadingOrderModel
} from '../types';
import { INITIAL_PERMISSIONS } from '../auth';
import { DEFAULT_RISK_QUERY_OPTIONS, DEFAULT_LOADING_ORDER_MODELS } from '../types';
import { 
  fetchClients, fetchOwners, fetchDrivers, fetchVehicles, fetchProducts,
  fetchCargos, fetchShipments, fetchShipmentById, fetchUsers, fetchTickets, fetchProfilePermissions,
  fetchAppSettings, fetchShipmentLocks, fetchBranches, fetchFreightOffers,
  fetchRiskQueryOptions, fetchLoadingOrderModels,
  toShipment, toCargo, toTicket, toFreightOffer, toClient, toOwner, toDriver,
  toVehicle, toProduct, toUser, toBranch, toRiskQueryOption,
  backfillShipmentFiscalNumbers,
  backfillAdvanceAndBalanceCalculations
} from '../lib/db';
import { OPERATIONS_REALTIME_CHANNEL } from '../services/realtimeOperationsHub';
import { getAllToolStays, StayRecord } from '../utils/toolStorage';
import { reconcileAllCargos } from '../utils/cargoBalance';

// ─── Module-level helpers (accessible from both loadAllData and realtime handler) ───

function getMaxId(items: any[], startOffset: number): number {
  if (!items || items.length === 0) {
    return startOffset;
  }
  let maxNum = startOffset - 1;
  for (const item of items) {
    if (item?.id && typeof item.id === 'string') {
      // Ignora IDs temporários, logs, anexos, etc.
      if (item.id.startsWith('TEMP') || item.id.startsWith('log_') || item.id.startsWith('branch_') || item.id.startsWith('img_')) {
        continue;
      }
      const match = item.id.match(/-(\d+)$/);
      if (match) {
        const num = parseInt(match[1], 10);
        // IDs sequenciais normais são < 1.000.000 (valores maiores são timestamps Date.now())
        if (!isNaN(num) && num < 1000000 && num > maxNum) maxNum = num;
      }
    }
    // Também valida sequence_id / sequenceId numérico
    if (item?.sequence_id && typeof item.sequence_id === 'number' && item.sequence_id < 1000000 && item.sequence_id > maxNum) {
      maxNum = item.sequence_id;
    }
    if (item?.sequenceId && typeof item.sequenceId === 'number' && item.sequenceId < 1000000 && item.sequenceId > maxNum) {
      maxNum = item.sequenceId;
    }
  }
  const nextId = maxNum + 1;
  return nextId;
}

function calculateNextIds(
  dbClients: any[], dbOwners: any[], dbDrivers: any[], dbVehicles: any[], 
  dbProducts: any[], dbShipments: any[], dbCargos: any[], dbUsers: any[], dbTickets: any[],
  dbBranches: any[], dbOffers: any[] = []
) {
  const result = {
    client: getMaxId(dbClients, 100),
    owner: getMaxId(dbOwners, 100),
    driver: getMaxId(dbDrivers, 100),
    vehicle: getMaxId(dbVehicles, 100),
    product: getMaxId(dbProducts, 100),
    shipment: getMaxId(dbShipments, 100),
    cargo: getMaxId(dbCargos, 100),
    user: getMaxId(dbUsers, 100),
    ticket: getMaxId(dbTickets, 1),
    branch: getMaxId(dbBranches, 10),
    freightOffer: getMaxId(dbOffers, 1),
    history: 9999,
  };
  return result;
}

// ─────────────────────────────────────────────

export type RealtimeStatus = 'connected' | 'connecting' | 'disconnected' | 'error';

const ensureRequiredBranches = (dbBranches: Branch[]): Branch[] => {
  const list = Array.isArray(dbBranches) ? [...dbBranches] : [];
  const hasPrFilial = list.some(b => {
    const upper = (b?.name || '').toUpperCase();
    return upper.includes('TRANSCUNHA PR') || upper.includes('PR FILIAL') || upper.includes('FILIAL PR') || (b?.state || '').toUpperCase() === 'PR';
  });
  if (!hasPrFilial) {
    list.push({
      id: 'branch_transcunha_pr',
      name: 'TRANSCUNHA PR FILIAL',
      city: 'Curitiba',
      state: 'PR',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
  }
  return list;
};

export function useDatabase(currentUser: User | null) {
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatus>('connecting');
  const [lastSyncTime, setLastSyncTime] = useState<Date>(() => new Date());
  const [clients, setClients] = useState<Client[]>([]);
  const [owners, setOwners] = useState<Owner[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [cargos, setCargos] = useState<Cargo[]>([]);
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [freightOffers, setFreightOffers] = useState<FreightOffer[]>([]);
  const [stays, setStays] = useState<StayRecord[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [riskQueryOptions, setRiskQueryOptions] = useState<RiskQueryOption[]>(() => {
    try {
      const saved = localStorage.getItem('transcunha_risk_query_options');
      if (saved) return JSON.parse(saved);
    } catch {}
    return DEFAULT_RISK_QUERY_OPTIONS;
  });
  const [loadingOrderModels, setLoadingOrderModels] = useState<LoadingOrderModel[]>(() => {
    try {
      const saved = localStorage.getItem('transcunha_loading_order_models');
      if (saved) return JSON.parse(saved);
    } catch {}
    return DEFAULT_LOADING_ORDER_MODELS;
  });
  const [activeLocks, setActiveLocks] = useState<ShipmentLock[]>([]);
  const [profilePermissions, setProfilePermissions] = useState<ProfilePermissions>(INITIAL_PERMISSIONS);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  
  const [companyLogo, setCompanyLogo] = useState<string | null>(() => {
    try {
      return localStorage.getItem('transcunha_companyLogo') || localStorage.getItem('trancunha_companyLogo');
    } catch { return null; }
  });
  const [themeImage, setThemeImage] = useState<string | null>(() => {
    try {
      return localStorage.getItem('transcunha_themeImage') || localStorage.getItem('trancunha_themeImage');
    } catch { return null; }
  });

  const [nextIds, setNextIds] = useState(() => {
    try {
      const saved = localStorage.getItem('transcunha_nextIds') || localStorage.getItem('trancunha_nextIds');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.cargo && parsed.cargo > 1000000) parsed.cargo = 100;
        if (parsed.shipment && parsed.shipment > 1000000) parsed.shipment = 100;
        return parsed;
      }
    } catch {}
    return { client: 100, owner: 100, driver: 100, vehicle: 100, product: 100, shipment: 100, cargo: 100, user: 100, ticket: 1, branch: 10, freightOffer: 1, history: 1000 };
  });

  const isAnyModalActiveRef = useRef(false);
  const backfillRanRef = useRef(false);

  const loadAllData = useCallback(async (isBackground = false) => {
    if (!isBackground) setIsLoading(true);
    setLoadError(null);
    
    // Safety net: if loading takes more than 15 seconds, force it to stop
    const timeoutId = setTimeout(() => {
      console.error('[useDatabase] loadAllData timed out after 15s. Forcing isLoading=false.');
      setIsLoading(false);
    }, 15000);

    try {
      if (!currentUser) {
        console.warn('[DB] Tentativa de carga sem usuário logado.');
        setIsLoading(false);
        return;
      }

      console.log('[DB] Carregando dados para:', currentUser.email);

      const isMotorista = currentUser.profile === 'Motorista';

      if (isMotorista) {
        const [
          dbCargos, dbShipments, dbSettings, dbPermissions,
          dbProducts, dbClients, dbFreightOffers, dbUsers, dbRiskOptions, dbLoadingModels
        ] = await Promise.all([
          fetchCargos(), fetchShipments(), fetchAppSettings(), fetchProfilePermissions(),
          fetchProducts(), fetchClients(), fetchFreightOffers(), fetchUsers(), fetchRiskQueryOptions(),
          fetchLoadingOrderModels()
        ]);

        const { reconciledCargos } = reconcileAllCargos(dbCargos, dbShipments);
        setCargos(reconciledCargos);
        setShipments(dbShipments);
        setProducts(dbProducts);
        setClients(dbClients);
        setFreightOffers(dbFreightOffers);
        setUsers(dbUsers);
        if (dbRiskOptions && dbRiskOptions.length > 0) setRiskQueryOptions(dbRiskOptions);
        if (dbLoadingModels && dbLoadingModels.length > 0) setLoadingOrderModels(dbLoadingModels);

        if (dbPermissions) setProfilePermissions({ ...INITIAL_PERMISSIONS, ...dbPermissions });
        if (dbSettings) {
          setCompanyLogo(dbSettings.company_logo || null);
          setThemeImage(dbSettings.theme_image || null);
        }

      } else {
        const [
          dbClients, dbOwners, dbDrivers, dbVehicles, dbProducts, dbCargos, 
          dbShipments, dbUsers, dbTickets, dbPermissions, dbSettings, dbLocks, dbBranches,
          dbStays, dbFreightOffers, dbRiskOptions, dbLoadingModels
        ] = await Promise.all([
          fetchClients(), fetchOwners(), fetchDrivers(), fetchVehicles(), fetchProducts(),
          fetchCargos(), fetchShipments(), fetchUsers(), fetchTickets(),
          fetchProfilePermissions(), fetchAppSettings(), fetchShipmentLocks(),
          fetchBranches(), getAllToolStays(), fetchFreightOffers(), fetchRiskQueryOptions(),
          fetchLoadingOrderModels()
        ]);

        // Filtra proprietários dummy/padrão legados
        const cleanOwners = dbOwners.filter(o => 
          o && 
          o.name !== 'PROPRIETÁRIO PADRÃO TERCEIRO' && 
          o.cpfCnpj !== '00.000.000/0000-00'
        );

        // Reconciliação inteligente de veículos:
        // Se o veículo possui ownerId de um registro dummy (OWN-100) ou inexistente:
        // Tenta encontrar se o veículo pertence a algum proprietário real através dos embarques realizados.
        // Caso contrário, remove o ownerId (deixa sem proprietário).
        const cleanVehicles = dbVehicles.map(v => {
          if (!v.ownerId) return v;
          const ownerExists = cleanOwners.some(o => o.id === v.ownerId);
          if (!ownerExists || v.ownerId === 'OWN-100') {
            const matchingShipment = dbShipments.find(s => 
              (s.horsePlate === v.plate || s.trailer1Plate === v.plate || s.trailer2Plate === v.plate || s.trailer3Plate === v.plate) &&
              s.anttOwnerIdentifier && s.anttOwnerIdentifier.replace(/\D/g, '').length >= 11
            );
            if (matchingShipment) {
              const cleanAntt = matchingShipment.anttOwnerIdentifier!.replace(/\D/g, '');
              const realOwner = cleanOwners.find(o => o.cpfCnpj && o.cpfCnpj.replace(/\D/g, '') === cleanAntt);
              if (realOwner) {
                return { ...v, ownerId: realOwner.id };
              }
            }
            return { ...v, ownerId: '' };
          }
          return v;
        });

        // Limpeza assíncrona no Supabase de registros legados dummy
        if (dbOwners.some(o => o.name === 'PROPRIETÁRIO PADRÃO TERCEIRO' || o.id === 'OWN-100')) {
          Promise.resolve(supabase.from('owners').delete().or('name.eq.PROPRIETÁRIO PADRÃO TERCEIRO,id.eq.OWN-100')).catch(() => {});
          Promise.resolve(supabase.from('vehicles').update({ owner_id: null }).eq('owner_id', 'OWN-100')).catch(() => {});
        }

        setClients(dbClients);
        setOwners(cleanOwners);
        setDrivers(dbDrivers);
        setVehicles(cleanVehicles);
        setProducts(dbProducts);
        const { reconciledCargos, updatedCargoIds } = reconcileAllCargos(dbCargos, dbShipments);
        setCargos(reconciledCargos);
        setShipments(dbShipments);
        if (updatedCargoIds.length > 0) {
          reconciledCargos
            .filter(c => updatedCargoIds.includes(c.id))
            .forEach(c => {
              supabase.from('cargos').update({
                scheduled_volume: c.scheduledVolume,
                loaded_volume: c.loadedVolume,
              }).eq('id', c.id).then(() => {});
            });
        }
        setUsers(dbUsers);
        setTickets(dbTickets);
        setFreightOffers(dbFreightOffers);
        setStays(dbStays);
        setBranches(ensureRequiredBranches(dbBranches));
        setActiveLocks(dbLocks);
        if (dbRiskOptions && dbRiskOptions.length > 0) setRiskQueryOptions(dbRiskOptions);
        if (dbLoadingModels && dbLoadingModels.length > 0) setLoadingOrderModels(dbLoadingModels);

        if (dbPermissions) setProfilePermissions({ ...INITIAL_PERMISSIONS, ...dbPermissions });
        if (dbSettings) {
          setCompanyLogo(dbSettings.company_logo || null);
          setThemeImage(dbSettings.theme_image || null);
        }

        setNextIds(calculateNextIds(
          dbClients, cleanOwners, dbDrivers, cleanVehicles,
          dbProducts, dbShipments, dbCargos, dbUsers, dbTickets, dbBranches, dbFreightOffers
        ));

      }

    } catch (err) {
      console.error('Erro ao carregar dados:', err);
      setLoadError('Erro ao conectar ao banco de dados.');
    } finally {
      clearTimeout(timeoutId);
      setIsLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    if (currentUser) {
      loadAllData();
    } else {
      setIsLoading(false);
      fetchAppSettings().then(settings => {
        if (settings) {
          setCompanyLogo(settings.company_logo || null);
          setThemeImage(settings.theme_image || null);
        }
      });
    }
  }, [currentUser, loadAllData]);

  // Real-time integration — com delta síncrono instantâneo, canais múltiplos dedicados e heartbeat ultra-rápido
  useEffect(() => {
    if (!currentUser) return;

    let isSubscribed = true;
    let reconnectTimeoutId: any = null;
    let channelRef: ReturnType<typeof supabase.channel> | null = null;
    let lastShipmentCheckFp: string | null = null;
    let lastCargoCheckFp: string | null = null;

    const handlePostgresChange = async (payload: any) => {
      if (!isSubscribed) return;
      const { table, eventType } = payload;
      console.log(`[Realtime] ⚡ Mudança detectada em ${table} (${eventType}):`, payload.new?.id || payload.old?.id);

      // Marca o timestamp da última atualização em tempo real recebida
      setLastSyncTime(new Date());

      // Permite atualizações em tempo real mesmo com modais abertos para fluxos principais
      const alwaysUpdateTables = ['tickets', 'cargos', 'shipments', 'freight_offers', 'shipment_locks'];
      if (isAnyModalActiveRef.current && !alwaysUpdateTables.includes(table)) return;

      try {
        switch (table) {
          case 'shipments': {
            if (payload.new && eventType === 'INSERT') {
              const newShipment = toShipment(payload.new);
              setShipments(prev => {
                const exists = prev.some(s => s.id === newShipment.id);
                if (exists) return prev.map(s => s.id === newShipment.id ? newShipment : s);
                return [newShipment, ...prev];
              });
              setNextIds((prev: any) => ({ ...prev, shipment: Math.max(prev.shipment || 100, getMaxId([newShipment], 100)) }));
            } else if (payload.new && eventType === 'UPDATE') {
              const updatedShipment = toShipment(payload.new);
              setShipments(prev => {
                const exists = prev.find(s => s.id === updatedShipment.id);
                if (exists) {
                  // Merge dos dados recebidos com os dados existentes para garantir integridade completa
                  const merged = { ...exists, ...updatedShipment };
                  return prev.map(s => s.id === updatedShipment.id ? merged : s);
                }
                return [updatedShipment, ...prev];
              });
            } else if (eventType === 'DELETE') {
              const targetId = payload.old?.id || payload.new?.id;
              if (targetId) {
                setShipments(prev => prev.filter(s => s.id !== targetId));
              }
            } else {
              const dbShipments = await fetchShipments();
              if (isSubscribed) {
                setShipments(dbShipments);
                setNextIds((prev: any) => ({ ...prev, shipment: getMaxId(dbShipments, 100) }));
              }
            }
            break;
          }
          case 'cargos': {
            if (payload.new && eventType === 'INSERT') {
              const newCargo = toCargo(payload.new);
              setCargos(prev => {
                const exists = prev.some(c => c.id === newCargo.id);
                if (exists) return prev.map(c => c.id === newCargo.id ? newCargo : c);
                return [newCargo, ...prev];
              });
              setNextIds((prev: any) => ({ ...prev, cargo: Math.max(prev.cargo || 100, getMaxId([newCargo], 100)) }));
            } else if (payload.new && eventType === 'UPDATE') {
              const updatedCargo = toCargo(payload.new);
              setCargos(prev => {
                const exists = prev.find(c => c.id === updatedCargo.id);
                if (exists) {
                  const merged = { ...exists, ...updatedCargo };
                  return prev.map(c => c.id === updatedCargo.id ? merged : c);
                }
                return [updatedCargo, ...prev];
              });
            } else if (eventType === 'DELETE') {
              const targetId = payload.old?.id || payload.new?.id;
              if (targetId) {
                setCargos(prev => prev.filter(c => c.id !== targetId));
              }
            } else {
              const dbCargos = await fetchCargos();
              if (isSubscribed) {
                setCargos(dbCargos);
                setNextIds((prev: any) => ({ ...prev, cargo: getMaxId(dbCargos, 100) }));
              }
            }
            break;
          }
          case 'tickets': {
            if (payload.new && (eventType === 'INSERT' || eventType === 'UPDATE')) {
              const ticket = toTicket(payload.new);
              setTickets(prev => {
                const exists = prev.some(t => t.id === ticket.id);
                if (exists) return prev.map(t => t.id === ticket.id ? ticket : t);
                return [ticket, ...prev];
              });
            } else if (eventType === 'DELETE') {
              const targetId = payload.old?.id || payload.new?.id;
              if (targetId) setTickets(prev => prev.filter(t => t.id !== targetId));
            } else {
              const dbTickets = await fetchTickets();
              if (isSubscribed) setTickets(dbTickets);
            }
            break;
          }
          case 'freight_offers': {
            const dbOffers = await fetchFreightOffers();
            if (isSubscribed) {
              setFreightOffers(dbOffers);
              setNextIds((prev: any) => ({ ...prev, freightOffer: getMaxId(dbOffers, 1) }));
            }
            break;
          }
          case 'shipment_locks': {
            const dbLocks = await fetchShipmentLocks();
            if (isSubscribed) setActiveLocks(dbLocks);
            break;
          }
          case 'clients': {
            if (payload.new && (eventType === 'INSERT' || eventType === 'UPDATE')) {
              const client = toClient(payload.new);
              setClients(prev => {
                const exists = prev.some(c => c.id === client.id);
                if (exists) return prev.map(c => c.id === client.id ? client : c);
                return [...prev, client];
              });
            } else if (eventType === 'DELETE') {
              const targetId = payload.old?.id || payload.new?.id;
              if (targetId) setClients(prev => prev.filter(c => c.id !== targetId));
            } else {
              const dbClients = await fetchClients();
              if (isSubscribed) setClients(dbClients);
            }
            break;
          }
          case 'drivers': {
            if (payload.new && (eventType === 'INSERT' || eventType === 'UPDATE')) {
              const driver = toDriver(payload.new);
              setDrivers(prev => {
                const exists = prev.some(d => d.id === driver.id);
                if (exists) return prev.map(d => d.id === driver.id ? driver : d);
                return [...prev, driver];
              });
            } else if (eventType === 'DELETE') {
              const targetId = payload.old?.id || payload.new?.id;
              if (targetId) setDrivers(prev => prev.filter(d => d.id !== targetId));
            } else {
              const dbDrivers = await fetchDrivers();
              if (isSubscribed) setDrivers(dbDrivers);
            }
            break;
          }
          case 'vehicles': {
            if (payload.new && (eventType === 'INSERT' || eventType === 'UPDATE')) {
              const vehicle = toVehicle(payload.new);
              setVehicles(prev => {
                const exists = prev.some(v => v.id === vehicle.id);
                if (exists) return prev.map(v => v.id === vehicle.id ? vehicle : v);
                return [...prev, vehicle];
              });
            } else if (eventType === 'DELETE') {
              const targetId = payload.old?.id || payload.new?.id;
              if (targetId) setVehicles(prev => prev.filter(v => v.id !== targetId));
            } else {
              const dbVehicles = await fetchVehicles();
              if (isSubscribed) setVehicles(dbVehicles);
            }
            break;
          }
          case 'owners': {
            if (payload.new && (eventType === 'INSERT' || eventType === 'UPDATE')) {
              const owner = toOwner(payload.new);
              setOwners(prev => {
                const exists = prev.some(o => o.id === owner.id);
                if (exists) return prev.map(o => o.id === owner.id ? owner : o);
                return [...prev, owner];
              });
            } else if (eventType === 'DELETE') {
              const targetId = payload.old?.id || payload.new?.id;
              if (targetId) setOwners(prev => prev.filter(o => o.id !== targetId));
            } else {
              const dbOwners = await fetchOwners();
              if (isSubscribed) setOwners(dbOwners);
            }
            break;
          }
          case 'products': {
            if (payload.new && (eventType === 'INSERT' || eventType === 'UPDATE')) {
              const product = toProduct(payload.new);
              setProducts(prev => {
                const exists = prev.some(p => p.id === product.id);
                if (exists) return prev.map(p => p.id === product.id ? product : p);
                return [...prev, product];
              });
            } else if (eventType === 'DELETE') {
              const targetId = payload.old?.id || payload.new?.id;
              if (targetId) setProducts(prev => prev.filter(p => p.id !== targetId));
            } else {
              const dbProducts = await fetchProducts();
              if (isSubscribed) setProducts(dbProducts);
            }
            break;
          }
          case 'app_users': {
            const dbUsers = await fetchUsers();
            if (isSubscribed) {
              setUsers(dbUsers);
              setNextIds((prev: any) => ({ ...prev, user: getMaxId(dbUsers, 100) }));
            }
            break;
          }
          case 'branches': {
            const dbBranches = await fetchBranches();
            if (isSubscribed) {
              setBranches(ensureRequiredBranches(dbBranches));
              setNextIds((prev: any) => ({ ...prev, branch: getMaxId(dbBranches, 10) }));
            }
            break;
          }
          case 'tool_stays': {
            const dbStays = await getAllToolStays();
            if (isSubscribed) setStays(dbStays);
            break;
          }
          case 'profile_permissions': {
            const dbPermissions = await fetchProfilePermissions();
            if (isSubscribed && dbPermissions) setProfilePermissions(dbPermissions);
            const dbRiskOptions = await fetchRiskQueryOptions();
            if (isSubscribed && dbRiskOptions && dbRiskOptions.length > 0) {
              setRiskQueryOptions(dbRiskOptions);
            }
            if (isSubscribed && dbPermissions && (dbPermissions as any).client_branches) {
              const bMap = (dbPermissions as any).client_branches;
              setClients(prev => prev.map(c => ({
                ...c,
                secondaryCnpjs: bMap[c.id] !== undefined ? bMap[c.id] : (c.secondaryCnpjs || [])
              })));
            }
            break;
          }
          case 'app_settings': {
            const dbSettings = await fetchAppSettings();
            if (isSubscribed && dbSettings) {
              setCompanyLogo(dbSettings.company_logo || null);
              setThemeImage(dbSettings.theme_image || null);
            }
            break;
          }
          case 'risk_query_options': {
            const dbRiskOptions = await fetchRiskQueryOptions();
            if (isSubscribed && dbRiskOptions && dbRiskOptions.length > 0) {
              setRiskQueryOptions(dbRiskOptions);
            }
            break;
          }
          default:
            if (isSubscribed) loadAllData(true);
        }
      } catch (err) {
        console.error(`[Realtime] Erro ao atualizar ${table}:`, err);
      }
    };

    const subscribeChannel = () => {
      if (!isSubscribed) return;
      if (channelRef) {
        try { supabase.removeChannel(channelRef); } catch {}
        channelRef = null;
      }

      const highPriorityTables = [
        'shipments', 'cargos', 'tickets', 'freight_offers', 
        'shipment_locks', 'app_users', 'clients', 'drivers', 
        'vehicles', 'owners', 'products', 'branches', 
        'profile_permissions', 'app_settings', 'risk_query_options'
      ];

      // Canal central compartilhado entre todos os clientes
      let ch = supabase.channel(OPERATIONS_REALTIME_CHANNEL, {
        config: {
          broadcast: { ack: false, self: false },
        }
      });

      // 1. Broadcast instantâneo WebSocket (recebe alterações diretas de outros usuários em ~50ms)
      ch = ch.on('broadcast', { event: 'shipment_changed' }, async ({ payload }) => {
        if (!isSubscribed) return;
        console.log('[Realtime Hub] ⚡ Broadcast de embarque recebido de outro usuário:', payload);
        setLastSyncTime(new Date());

        const { action, shipmentId, shipment } = payload || {};
        if (action === 'delete') {
          if (shipmentId) {
            setShipments(prev => prev.filter(s => s.id !== shipmentId));
          }
          return;
        }

        if (shipment && shipment.id) {
          setShipments(prev => {
            const exists = prev.find(s => s.id === shipment.id);
            if (exists) {
              const merged = { ...exists, ...shipment };
              return prev.map(s => s.id === shipment.id ? merged : s);
            }
            return [shipment, ...prev];
          });
        } else if (shipmentId) {
          const single = await fetchShipmentById(shipmentId);
          if (single && isSubscribed) {
            setShipments(prev => {
              const exists = prev.find(s => s.id === single.id);
              if (exists) {
                const merged = { ...exists, ...single };
                return prev.map(s => s.id === single.id ? merged : s);
              }
              return [single, ...prev];
            });
          } else if (isSubscribed) {
            const all = await fetchShipments();
            setShipments(all);
          }
        }
      });

      ch = ch.on('broadcast', { event: 'cargo_changed' }, async ({ payload }) => {
        if (!isSubscribed) return;
        console.log('[Realtime Hub] ⚡ Broadcast de carga recebido de outro usuário:', payload);
        setLastSyncTime(new Date());

        const { action, cargoId, cargo } = payload || {};
        if (action === 'delete') {
          if (cargoId) {
            setCargos(prev => prev.filter(c => c.id !== cargoId));
          }
          return;
        }

        if (cargo && cargo.id) {
          setCargos(prev => {
            const exists = prev.find(c => c.id === cargo.id);
            if (exists) {
              const merged = { ...exists, ...cargo };
              return prev.map(c => c.id === cargo.id ? merged : c);
            }
            return [cargo, ...prev];
          });
        } else if (isSubscribed) {
          const all = await fetchCargos();
          setCargos(all);
        }
      });

      ch = ch.on('broadcast', { event: 'ticket_changed' }, async ({ payload }) => {
        if (!isSubscribed) return;
        console.log('[Realtime Hub] ⚡ Broadcast de chamado recebido de outro usuário:', payload);
        setLastSyncTime(new Date());

        const { action, ticketId, ticket } = payload || {};
        if (action === 'delete') {
          if (ticketId) {
            setTickets(prev => prev.filter(t => t.id !== ticketId));
          }
          return;
        }

        if (ticket && ticket.id) {
          setTickets(prev => {
            const exists = prev.find(t => t.id === ticket.id);
            if (exists) {
              const merged = { ...exists, ...ticket };
              return prev.map(t => t.id === ticket.id ? merged : t);
            }
            return [ticket, ...prev];
          });
        } else if (isSubscribed) {
          const all = await fetchTickets();
          setTickets(all);
        }
      });

      // 2. Listeners dedicados por tabela do Postgres Changes
      for (const t of highPriorityTables) {
        ch = ch.on('postgres_changes', { event: '*', schema: 'public', table: t }, (payload) => {
          handlePostgresChange({ ...payload, table: payload.table || t });
        });
      }

      channelRef = ch.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('[Realtime] ✅ Conexão Realtime ativa — sincronização instantânea pronta');
          setRealtimeStatus('connected');
          setLastSyncTime(new Date());
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          console.warn(`[Realtime] ⚠️ Canal ${status} — reconectando em 3s...`);
          setRealtimeStatus('connecting');
          if (isSubscribed) {
            if (reconnectTimeoutId) clearTimeout(reconnectTimeoutId);
            reconnectTimeoutId = setTimeout(() => {
              subscribeChannel();
            }, 3000);
          }
        }
      });
    };

    subscribeChannel();

    // ── Ouvintes de eventos no mesmo navegador (BroadcastChannel entre abas e CustomEvent) ──
    const handleLocalBroadcast = (e: any) => {
      if (!isSubscribed) return;
      const data = e.data || e.detail;
      if (!data) return;
      const type = data.type || (e.type === 'transcunha:shipment_changed' ? 'shipment_changed' : 'cargo_changed');
      const payload = data.payload || data;
      if (type === 'shipment_changed') {
        const { action, shipmentId, shipment } = payload;
        if (action === 'delete' && shipmentId) {
          setShipments(prev => prev.filter(s => s.id !== shipmentId));
        } else if (shipment && shipment.id) {
          setShipments(prev => {
            const exists = prev.find(s => s.id === shipment.id);
            if (exists) return prev.map(s => s.id === shipment.id ? { ...exists, ...shipment } : s);
            return [shipment, ...prev];
          });
        }
        setLastSyncTime(new Date());
      } else if (type === 'cargo_changed') {
        const { action, cargoId, cargo } = payload;
        if (action === 'delete' && cargoId) {
          setCargos(prev => prev.filter(c => c.id !== cargoId));
        } else if (cargo && cargo.id) {
          setCargos(prev => {
            const exists = prev.find(c => c.id === cargo.id);
            if (exists) return prev.map(c => c.id === cargo.id ? { ...exists, ...cargo } : c);
            return [cargo, ...prev];
          });
        }
        setLastSyncTime(new Date());
      }
    };

    const localBc = typeof window !== 'undefined' && 'BroadcastChannel' in window 
      ? new BroadcastChannel('transcunha_operations_sync') 
      : null;
    if (localBc) {
      localBc.onmessage = handleLocalBroadcast;
    }
    window.addEventListener('transcunha:shipment_changed', handleLocalBroadcast);
    window.addEventListener('transcunha:cargo_changed', handleLocalBroadcast);

    // ── Heartbeat inteligente ultraleve e sincronização no foco da janela ──
    const checkTimestampAndSync = async () => {
      if (!isSubscribed || (typeof document !== 'undefined' && document.visibilityState === 'hidden') || isAnyModalActiveRef.current) {
        return;
      }

      try {
        // Consulta ultraleve de contagem e fingerprint dos embarques ativos (apenas id e status, ~24 linhas)
        const [shipmentsHeadRes, activeShipmentsRes] = await Promise.all([
          supabase.from('shipments').select('*', { count: 'exact', head: true }),
          supabase.from('shipments').select('id, status').neq('status', 'Finalizado').neq('status', 'Cancelado')
        ]);

        const sCount = shipmentsHeadRes.count || 0;
        const sActive = activeShipmentsRes.data || [];
        const currentShipmentFp = `${sCount}__${sActive.map((r: any) => `${r.id}:${r.status}`).sort().join('|')}`;

        if (currentShipmentFp && lastShipmentCheckFp && currentShipmentFp !== lastShipmentCheckFp) {
          console.log('[Heartbeat Sync] 🔄 Alteração detectada em status/embarques — sincronizando...');
          lastShipmentCheckFp = currentShipmentFp;
          const dbShipments = await fetchShipments();
          if (isSubscribed) {
            setShipments(dbShipments);
            setNextIds((prev: any) => ({ ...prev, shipment: getMaxId(dbShipments, 100) }));
            setLastSyncTime(new Date());
          }
        } else if (currentShipmentFp) {
          lastShipmentCheckFp = currentShipmentFp;
        }

        // Consulta ultraleve de contagem e fingerprint das cargas em andamento
        const [cargosHeadRes, activeCargosRes] = await Promise.all([
          supabase.from('cargos').select('*', { count: 'exact', head: true }),
          supabase.from('cargos').select('id, status, scheduled_volume, loaded_volume').neq('status', 'Fechada')
        ]);

        const cCount = cargosHeadRes.count || 0;
        const cActive = activeCargosRes.data || [];
        const currentCargoFp = `${cCount}__${cActive.map((r: any) => `${r.id}:${r.status}:${r.loaded_volume}`).sort().join('|')}`;

        if (currentCargoFp && lastCargoCheckFp && currentCargoFp !== lastCargoCheckFp) {
          console.log('[Heartbeat Sync] 🔄 Alteração detectada em cargas — sincronizando...');
          lastCargoCheckFp = currentCargoFp;
          const dbCargos = await fetchCargos();
          if (isSubscribed) {
            setCargos(dbCargos);
            setNextIds((prev: any) => ({ ...prev, cargo: getMaxId(dbCargos, 100) }));
            setLastSyncTime(new Date());
          }
        } else if (currentCargoFp) {
          lastCargoCheckFp = currentCargoFp;
        }
      } catch (err) {
        console.warn('[Heartbeat Sync] Erro na verificação:', err);
      }
    };

    // Heartbeat regular a cada 4 segundos
    const HEARTBEAT_INTERVAL_MS = 4000;
    const pollInterval = setInterval(checkTimestampAndSync, HEARTBEAT_INTERVAL_MS);

    // Sincronização imediata ao reativar a aba ou focar na janela
    const handleFocusOrVisibility = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        checkTimestampAndSync();
      }
    };

    const handleOnline = () => {
      console.log('[Realtime] 🌐 Conexão de internet restabelecida — reconectando canais em tempo real');
      setRealtimeStatus('connecting');
      subscribeChannel();
      loadAllData(true);
    };

    const handleOffline = () => {
      console.warn('[Realtime] ⚠️ Conexão de rede offline detectada');
      setRealtimeStatus('disconnected');
    };

    window.addEventListener('focus', handleFocusOrVisibility);
    document.addEventListener('visibilitychange', handleFocusOrVisibility);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      isSubscribed = false;
      if (reconnectTimeoutId) clearTimeout(reconnectTimeoutId);
      clearInterval(pollInterval);
      window.removeEventListener('focus', handleFocusOrVisibility);
      document.removeEventListener('visibilitychange', handleFocusOrVisibility);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (localBc) {
        localBc.close();
      }
      window.removeEventListener('transcunha:shipment_changed', handleLocalBroadcast);
      window.removeEventListener('transcunha:cargo_changed', handleLocalBroadcast);
      if (channelRef) {
        try { supabase.removeChannel(channelRef); } catch {}
        channelRef = null;
      }
    };
  }, [currentUser, loadAllData]);

  return {
    clients, setClients,
    owners, setOwners,
    drivers, setDrivers,
    vehicles, setVehicles,
    products, setProducts,
    cargos, setCargos,
    shipments, setShipments,
    users, setUsers,
    tickets, setTickets,
    freightOffers, setFreightOffers,
    stays, setStays,
    branches, setBranches,
    riskQueryOptions, setRiskQueryOptions,
    loadingOrderModels, setLoadingOrderModels,
    activeLocks, setActiveLocks,
    profilePermissions, setProfilePermissions,
    isLoading, loadError,
    companyLogo, setCompanyLogo,
    themeImage, setThemeImage,
    nextIds, setNextIds,
    loadAllData,
    refreshData: loadAllData,
    realtimeStatus,
    setRealtimeStatus,
    lastSyncTime,
    setLastSyncTime,
    isAnyModalActiveRef
  };
}
