import { supabase } from '../supabase';
import { extractFiscalDocNumbersFromUrls } from '../utils/fiscalDocParser';
import { isCteApplicableForStatus, getShipmentCte, getShipmentCteEmissionDate, getShipmentCiotNumber } from '../utils';
import { calculateAdvanceAndBalance, ADVANCE_ELIGIBLE_STATUSES } from '../utils/freightCalculation';
import type {
  Client, ClientBranchCnpj, Owner, Driver, Vehicle, Product, Cargo, Shipment, User, Ticket, ProfilePermissions, ShipmentLock, Branch, FreightOffer, RiskQueryOption, LoadingOrderModel, RdoRequestRecord, RdoConfig, SigaConfig, SigaRequestRecord
} from '../types';
import { DEFAULT_RISK_QUERY_OPTIONS, FreightCalculationType, DEFAULT_LOADING_ORDER_MODELS, TicketStatus } from '../types';
import { broadcastShipmentChange, broadcastCargoChange, broadcastTicketChange, broadcastRdoChange, broadcastSigaChange } from '../services/realtimeOperationsHub';


// ─────────────────────────────────────────────
// HELPERS: Map DB rows (snake_case) ↔ App types (camelCase)
// ─────────────────────────────────────────────

export const toFreightOffer = (row: any): FreightOffer => {
  const rawHistory = row.history || [];
  const metaLog = rawHistory.find((h: any) => h.id === 'meta_dest_obs');
  let additionalDestinations = undefined;
  let observations = undefined;
  let attachments = undefined;
  let freightType: 'CIF' | 'FOB' | undefined = row.freight_type || undefined;
  let hasIcms: boolean | undefined = row.has_icms !== undefined ? row.has_icms : undefined;
  let icmsPercentage: number | undefined = row.icms_percentage !== undefined ? Number(row.icms_percentage) : undefined;
  let clientCnpj: string | undefined = row.client_cnpj || undefined;
  let clientBranchId: string | undefined = row.client_branch_id || undefined;
  let originCoords: { lat: number; lng: number } | undefined = undefined;
  let destinationCoords: { lat: number; lng: number } | undefined = undefined;
  let distanceKm: number | undefined = undefined;
  let isExactDistance: boolean | undefined = undefined;

  if (metaLog) {
    try {
      const parsed = JSON.parse(metaLog.description);
      additionalDestinations = parsed.additionalDestinations;
      observations = parsed.observations;
      attachments = parsed.attachments;
      if (parsed.driverId) row.driverId = parsed.driverId;
      if (parsed.cargoId) row.cargoId = parsed.cargoId;
      if (parsed.requestedEmbarcadorId) row.requestedEmbarcadorId = parsed.requestedEmbarcadorId;
      if (parsed.requestTimestamp) row.requestTimestamp = parsed.requestTimestamp;
      if (parsed.freightType) freightType = parsed.freightType;
      if (parsed.hasIcms !== undefined) hasIcms = parsed.hasIcms;
      if (parsed.icmsPercentage !== undefined) icmsPercentage = parsed.icmsPercentage;
      if (parsed.clientCnpj) clientCnpj = parsed.clientCnpj;
      if (parsed.clientBranchId) clientBranchId = parsed.clientBranchId;
      if (parsed.originCoords) originCoords = parsed.originCoords;
      if (parsed.destinationCoords) destinationCoords = parsed.destinationCoords;
      if (parsed.distanceKm !== undefined) distanceKm = Number(parsed.distanceKm);
      if (parsed.isExactDistance !== undefined) isExactDistance = Boolean(parsed.isExactDistance);
    } catch (e) {
      console.error('Error parsing freight offer metadata:', e);
    }
  }

  return {
    id: row.id,
    clientId: row.client_id,
    origin: row.origin,
    originLocation: row.origin_location,
    destination: row.destination,
    destinationLocation: row.destination_location,
    totalTonnage: Number(row.total_tonnage),
    dailySchedule: row.daily_schedule,
    freightValuePerTon: Number(row.freight_value_per_ton),
    productId: row.product_id,
    status: row.status,
    counterOfferValue: row.counter_offer_value ? Number(row.counter_offer_value) : undefined,
    createdAt: row.created_at,
    history: rawHistory.filter((h: any) => h.id !== 'meta_dest_obs'),
    additionalDestinations,
    observations,
    attachments,
    driverId: row.driverId,
    cargoId: row.cargoId,
    requestedEmbarcadorId: row.requestedEmbarcadorId,
    requestTimestamp: row.requestTimestamp,
    freightType,
    hasIcms,
    icmsPercentage,
    clientCnpj,
    clientBranchId,
    originCoords,
    destinationCoords,
    distanceKm,
    isExactDistance,
  };
};

export const fetchFreightOffers = async (): Promise<FreightOffer[]> => {
  try {
    const data = await fetchAllRows('freight_offers', 'created_at', { ascending: true });
    const rawOffers = data.map(toFreightOffer);

    let currentSeq = 1;
    const formattedOffers = rawOffers.map((offer: FreightOffer) => {
      if (offer.id && /^OFR-\d+$/i.test(offer.id)) {
        const match = offer.id.match(/^OFR-(\d+)$/i);
        if (match) {
          const num = parseInt(match[1], 10);
          if (!isNaN(num) && num >= currentSeq) {
            currentSeq = num + 1;
          }
        }
        return { ...offer, displayId: offer.id };
      } else {
        const formattedId = `OFR-${String(currentSeq).padStart(2, '0')}`;
        currentSeq++;
        return { ...offer, displayId: formattedId };
      }
    });

    return formattedOffers.reverse();
  } catch (error: any) {
    if (error.code === '42P01') {
      console.warn('Table freight_offers does not exist yet. Returning empty array.');
      return [];
    }
    console.error('Error fetching freight offers:', error);
    return [];
  }
};

const fromFreightOffer = (o: FreightOffer | Omit<FreightOffer, 'id'>) => {
  const history = [...(o.history || [])].filter(h => h.id !== 'meta_dest_obs');
  
  if ((o.additionalDestinations && o.additionalDestinations.length > 0) || o.observations || (o.attachments && o.attachments.length > 0) || o.driverId || o.cargoId || o.requestedEmbarcadorId || o.requestTimestamp || o.freightType || o.hasIcms !== undefined || o.icmsPercentage !== undefined || o.clientCnpj || o.clientBranchId || o.originCoords || o.destinationCoords || o.distanceKm !== undefined) {
    history.push({
      id: 'meta_dest_obs',
      userId: 'system',
      timestamp: o.createdAt || new Date().toISOString(),
      description: JSON.stringify({
        additionalDestinations: o.additionalDestinations,
        observations: o.observations,
        attachments: o.attachments,
        driverId: o.driverId,
        cargoId: o.cargoId,
        requestedEmbarcadorId: o.requestedEmbarcadorId,
        requestTimestamp: o.requestTimestamp,
        freightType: o.freightType,
        hasIcms: o.hasIcms,
        icmsPercentage: o.icmsPercentage,
        clientCnpj: o.clientCnpj,
        clientBranchId: o.clientBranchId,
        originCoords: o.originCoords,
        destinationCoords: o.destinationCoords,
        distanceKm: o.distanceKm,
        isExactDistance: o.isExactDistance,
      })
    });
  }

  return {
    id: (o as FreightOffer).id,
    client_id: o.clientId,
    origin: o.origin,
    origin_location: o.originLocation,
    destination: o.destination,
    destination_location: o.destinationLocation,
    total_tonnage: o.totalTonnage,
    daily_schedule: o.dailySchedule,
    freight_value_per_ton: o.freightValuePerTon || 0,
    product_id: o.productId,
    status: o.status,
    counter_offer_value: o.counterOfferValue,
    created_at: o.createdAt,
    history,
  };
};

export const upsertFreightOffer = async (offer: FreightOffer | Omit<FreightOffer, 'id' | 'createdAt'>): Promise<void> => {
  const isUuid = 'id' in offer && typeof offer.id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(offer.id);
  const offerUuid = isUuid ? (offer as FreightOffer).id : crypto.randomUUID();

  const row = fromFreightOffer({
    ...offer,
    id: offerUuid,
    createdAt: ('createdAt' in offer && offer.createdAt) ? offer.createdAt : new Date().toISOString()
  });
  
  const { error } = await supabase.from('freight_offers').upsert(row);
  if (error) throw error;
};

export const toClient = (row: any): Client => {
  const modelId = row.loading_order_model_id || row.ordem_carregamento_model_id || undefined;
  return {
    id: row.id,
    razaoSocial: row.razao_social || '',
    nomeFantasia: row.nome_fantasia || '',
    cnpj: row.cnpj || '',
    phone: row.phone || '',
    email: row.email || '',
    address: row.address || '',
    city: row.city || '',
    state: row.state || '',
    paymentMethod: row.payment_method || 'Prazo',
    paymentTerm: typeof row.payment_term === 'number' ? row.payment_term : (parseInt(row.payment_term, 10) || 0),
    requiresExternalOrder: !!row.requires_external_order,
    requiresScheduling: !!row.requires_scheduling,
    salespersonName: row.salesperson_name || '',
    salespersonCommissionPerTon: row.salesperson_commission_per_ton !== undefined && row.salesperson_commission_per_ton !== null ? Number(row.salesperson_commission_per_ton) : 0,
    loadingOrderModelId: modelId,
    ordemCarregamentoModelId: modelId,
  };
};

export const fromClient = (c: Client | Omit<Client, 'id'>) => {
  const modelId = (c as any).loadingOrderModelId || (c as any).ordemCarregamentoModelId || null;
  return {
    id: (c as Client).id,
    razao_social: c.razaoSocial,
    nome_fantasia: c.nomeFantasia,
    cnpj: c.cnpj,
    phone: c.phone || '',
    email: c.email || '',
    address: c.address || '',
    city: c.city || '',
    state: c.state || '',
    payment_method: c.paymentMethod,
    payment_term: c.paymentTerm !== undefined && c.paymentTerm !== null ? String(c.paymentTerm) : '0',
    requires_external_order: c.requiresExternalOrder ?? false,
    requires_scheduling: c.requiresScheduling ?? false,
    salesperson_name: c.salespersonName || null,
    salesperson_commission_per_ton: c.salespersonCommissionPerTon !== undefined && c.salespersonCommissionPerTon !== null ? Number(c.salespersonCommissionPerTon) : 0,
    loading_order_model_id: modelId,
  };
};

export const toOwner = (row: any): Owner => ({
  id: row.id,
  name: row.name,
  cpfCnpj: row.cpf_cnpj,
  phone: row.phone,
  type: row.type,
  bankDetails: row.bank_details,
});

export const fromOwner = (o: Owner | Omit<Owner, 'id'>) => ({
  id: (o as Owner).id,
  name: o.name,
  cpf_cnpj: o.cpfCnpj,
  phone: o.phone,
  type: o.type,
  bank_details: o.bankDetails,
});

export const toDriver = (row: any): Driver => ({
  id: row.id,
  name: row.name,
  cpf: row.cpf,
  cnh: row.cnh,
  phone: row.phone,
  classification: row.classification,
  ownerId: row.owner_id,
  active: row.active ?? true,
  restrictionReason: row.restriction_reason,
  has_app: row.has_app ?? false,
  codigoAtua: row.codigo_atua || row.codg_atua || row.codigoAtua || undefined,
  motherName: row.mother_name || row.nome_da_mae || row.mother || undefined,
  birthDate: row.birth_date || row.data_nascimento || row.birthdate || undefined,
  cnhAttachmentUrl: row.cnh_attachment_url || row.cnh_url || row.cnh_file || undefined,
});

export const fromDriver = (d: Driver | Omit<Driver, 'id'>) => ({
  id: (d as Driver).id,
  name: d.name,
  cpf: d.cpf,
  cnh: d.cnh,
  phone: d.phone,
  classification: d.classification,
  owner_id: d.ownerId || null,
  active: d.active !== undefined ? d.active : true,
  restriction_reason: d.restrictionReason,
  has_app: (d as Driver).has_app ?? false,
});

export const toVehicle = (row: any): Vehicle => ({
  id: row.id,
  plate: row.plate,
  setType: row.set_type,
  bodyType: row.body_type,
  classification: row.classification,
  driverId: row.driver_id,
  ownerId: row.owner_id,
});

export const fromVehicle = (v: Vehicle | Omit<Vehicle, 'id'>) => ({
  id: (v as Vehicle).id,
  plate: v.plate,
  set_type: v.setType,
  body_type: v.bodyType,
  classification: v.classification,
  driver_id: v.driverId || null,
  owner_id: v.ownerId || null,
});

export const toProduct = (row: any): Product => ({
  id: row.id,
  name: row.name,
  unit: row.unit,
  // Retrocompatibilidade: se a coluna for null (antes da migration), assume true (fluxo completo)
  requiresRiskManagement: row.requires_risk_management !== false,
});

const safeParseJson = (val: any, fallback: any) => {
  if (val === null || val === undefined) return fallback;
  if (typeof val === 'string') {
    try {
      return JSON.parse(val);
    } catch {
      return fallback;
    }
  }
  return val;
};

export const toCargo = (row: any): Cargo => ({
  id: row.id,
  sequenceId: row.sequence_id,
  clientId: row.client_id,
  productId: row.product_id,
  origin: row.origin,
  originLocation: row.origin_location,
  originMapLink: row.origin_map_link,
  destination: row.destination,
  destinationLocation: row.destination_location,
  destinationMapLink: row.destination_map_link,
  totalVolume: Number(row.total_volume),
  scheduledVolume: Number(row.scheduled_volume),
  loadedVolume: Number(row.loaded_volume),
  companyFreightValuePerTon: Number(row.company_freight_value_per_ton),
  companyFreightHasToll: row.company_freight_has_toll ?? (safeParseJson(row.freight_legs, undefined)?.[0]?.companyFreightHasToll || false),
  driverFreightValuePerTon: Number(row.driver_freight_value_per_ton),
  driverFreightHasToll: row.driver_freight_has_toll ?? (safeParseJson(row.freight_legs, undefined)?.[0]?.driverFreightHasToll || false),
  driverFreightPfHasToll: row.driver_freight_pf_has_toll ?? (safeParseJson(row.freight_legs, undefined)?.[0]?.driverFreightPfHasToll || false),
  hasIcms: row.has_icms,
  icmsPercentage: Number(row.icms_percentage),
  requiresScheduling: row.requires_scheduling,
  type: row.type,
  status: row.status,
  createdAt: row.created_at,
  createdById: row.created_by_id,
  history: (() => {
    const raw = safeParseJson(row.history, []);
    return Array.isArray(raw) ? raw.filter((h: any) => !String(h?.id || '').startsWith('meta_')) : [];
  })(),
  loadingDeadline: row.loading_deadline,
  allowedVehicleTypes: safeParseJson(row.allowed_vehicle_types, undefined),
  freightLegs: safeParseJson(row.freight_legs, undefined),
  dailySchedule: safeParseJson(row.daily_schedule, undefined),
  observations: row.observations,
  attachments: safeParseJson(row.attachments, []),
  originCoords: safeParseJson(row.origin_coords, undefined),
  destinationCoords: safeParseJson(row.destination_coords, undefined),
  salespersonName: row.salesperson_name,
  salespersonCommissionPerTon: Number(row.salesperson_commission_per_ton),
  branchId: row.branch_id,
  allowedProfiles: (() => {
    if (row.allowed_profiles) return safeParseJson(row.allowed_profiles, undefined);
    const rawHistory = safeParseJson(row.history, []);
    const metaLog = Array.isArray(rawHistory) ? rawHistory.find((h: any) => h.id === 'meta_allowed_profiles') : null;
    if (metaLog) {
      try {
        return JSON.parse(metaLog.description);
      } catch {
        return undefined;
      }
    }
    return undefined;
  })(),
  allowedUserIds: (() => {
    if (row.allowed_user_ids) return safeParseJson(row.allowed_user_ids, undefined);
    const rawHistory = safeParseJson(row.history, []);
    const metaLog = Array.isArray(rawHistory) ? rawHistory.find((h: any) => h.id === 'meta_allowed_user_ids') : null;
    if (metaLog) {
      try {
        return JSON.parse(metaLog.description);
      } catch {
        return undefined;
      }
    }
    return undefined;
  })(),
  tmsLoteNumber: (() => {
    if (row.tms_lote_number) return row.tms_lote_number;
    const rawHistory = safeParseJson(row.history, []);
    const metaLog = Array.isArray(rawHistory) ? rawHistory.find((h: any) => h.id === 'meta_tms_lote') : null;
    if (metaLog) {
      return metaLog.description || undefined;
    }
    return undefined;
  })(),
  clientCnpj: (() => {
    if (row.client_cnpj) return row.client_cnpj;
    const rawHistory = safeParseJson(row.history, []);
    const metaLog = Array.isArray(rawHistory) ? rawHistory.find((h: any) => h.id === 'meta_client_cnpj') : null;
    if (metaLog) {
      return metaLog.description || undefined;
    }
    return undefined;
  })(),
  clientBranchId: (() => {
    if (row.client_branch_id) return row.client_branch_id;
    const rawHistory = safeParseJson(row.history, []);
    const metaLog = Array.isArray(rawHistory) ? rawHistory.find((h: any) => h.id === 'meta_client_branch_id') : null;
    if (metaLog) {
      return metaLog.description || undefined;
    }
    return undefined;
  })(),
  isExport: (() => {
    if (row.is_export !== null && row.is_export !== undefined) return Boolean(row.is_export);
    const rawHistory = safeParseJson(row.history, []);
    const metaLog = Array.isArray(rawHistory) ? rawHistory.find((h: any) => h.id === 'meta_is_export') : null;
    if (metaLog) {
      return metaLog.description === 'true';
    }
    return undefined;
  })(),
  freightCalculationType: (() => {
    if (row.freight_calculation_type) return row.freight_calculation_type;
    const rawHistory = safeParseJson(row.history, []);
    const metaLog = Array.isArray(rawHistory) ? rawHistory.find((h: any) => h.id === 'meta_freight_calc_type') : null;
    if (metaLog?.description) return metaLog.description as FreightCalculationType;
    return safeParseJson(row.freight_legs, undefined)?.[0]?.freightCalculationType || FreightCalculationType.PerTon;
  })(),
  icmsValue: (() => {
    if (row.icms_value !== null && row.icms_value !== undefined) return Number(row.icms_value);
    const rawHistory = safeParseJson(row.history, []);
    const metaLog = Array.isArray(rawHistory) ? rawHistory.find((h: any) => h.id === 'meta_icms_value') : null;
    if (metaLog?.description) return Number(metaLog.description) || 0;
    return safeParseJson(row.freight_legs, undefined)?.[0]?.icmsValue || 0;
  })(),
  orderNumber: (() => {
    if (row.order_number) return row.order_number;
    const rawHistory = safeParseJson(row.history, []);
    const metaLog = Array.isArray(rawHistory) ? rawHistory.find((h: any) => h.id === 'meta_order_number') : null;
    if (metaLog?.description) return metaLog.description;
    return undefined;
  })(),
  packaging: (() => {
    if (row.packaging) return row.packaging;
    const rawHistory = safeParseJson(row.history, []);
    const metaLog = Array.isArray(rawHistory) ? rawHistory.find((h: any) => h.id === 'meta_packaging') : null;
    if (metaLog?.description) return metaLog.description;
    return undefined;
  })(),
  financialCostEnabled: (() => {
    if (row.financial_cost_enabled !== null && row.financial_cost_enabled !== undefined) return Boolean(row.financial_cost_enabled);
    const rawHistory = safeParseJson(row.history, []);
    const metaLog = Array.isArray(rawHistory) ? rawHistory.find((h: any) => h.id === 'meta_financial_cost_enabled') : null;
    if (metaLog) return metaLog.description === 'true';
    return false;
  })(),
  financialCostMonthlyRate: (() => {
    if (row.financial_cost_monthly_rate !== null && row.financial_cost_monthly_rate !== undefined) return Number(row.financial_cost_monthly_rate);
    const rawHistory = safeParseJson(row.history, []);
    const metaLog = Array.isArray(rawHistory) ? rawHistory.find((h: any) => h.id === 'meta_financial_cost_monthly_rate') : null;
    if (metaLog) return Number(metaLog.description) || 0;
    return undefined;
  })(),
  financialCostDaysTerm: (() => {
    if (row.financial_cost_days_term !== null && row.financial_cost_days_term !== undefined) return Number(row.financial_cost_days_term);
    const rawHistory = safeParseJson(row.history, []);
    const metaLog = Array.isArray(rawHistory) ? rawHistory.find((h: any) => h.id === 'meta_financial_cost_days_term') : null;
    if (metaLog) return Number(metaLog.description) || 0;
    return undefined;
  })(),
  financialCostBaseDays: (() => {
    if (row.financial_cost_base_days !== null && row.financial_cost_base_days !== undefined) return Number(row.financial_cost_base_days);
    const rawHistory = safeParseJson(row.history, []);
    const metaLog = Array.isArray(rawHistory) ? rawHistory.find((h: any) => h.id === 'meta_financial_cost_base_days') : null;
    if (metaLog) return Number(metaLog.description) || 0;
    return undefined;
  })(),
  financialCostEffectiveRate: (() => {
    if (row.financial_cost_effective_rate !== null && row.financial_cost_effective_rate !== undefined) return Number(row.financial_cost_effective_rate);
    const rawHistory = safeParseJson(row.history, []);
    const metaLog = Array.isArray(rawHistory) ? rawHistory.find((h: any) => h.id === 'meta_financial_cost_effective_rate') : null;
    if (metaLog) return Number(metaLog.description) || 0;
    return undefined;
  })(),
  financialCostPerTon: (() => {
    if (row.financial_cost_per_ton !== null && row.financial_cost_per_ton !== undefined) return Number(row.financial_cost_per_ton);
    const rawHistory = safeParseJson(row.history, []);
    const metaLog = Array.isArray(rawHistory) ? rawHistory.find((h: any) => h.id === 'meta_financial_cost_per_ton') : null;
    if (metaLog) return Number(metaLog.description) || 0;
    return undefined;
  })(),
  financialCostTotal: (() => {
    if (row.financial_cost_total !== null && row.financial_cost_total !== undefined) return Number(row.financial_cost_total);
    const rawHistory = safeParseJson(row.history, []);
    const metaLog = Array.isArray(rawHistory) ? rawHistory.find((h: any) => h.id === 'meta_financial_cost_total') : null;
    if (metaLog) return Number(metaLog.description) || 0;
    return undefined;
  })(),
});

const fromCargo = (c: Cargo | Omit<Cargo, 'id'>) => {
  let history = c.history ? [...c.history] : [];
  if (c.allowedProfiles) {
    history = history.filter(h => h.id !== 'meta_allowed_profiles');
    history.push({
      id: 'meta_allowed_profiles',
      userId: 'system',
      timestamp: new Date().toISOString(),
      description: JSON.stringify(c.allowedProfiles)
    });
  }
  if (c.allowedUserIds) {
    history = history.filter(h => h.id !== 'meta_allowed_user_ids');
    history.push({
      id: 'meta_allowed_user_ids',
      userId: 'system',
      timestamp: new Date().toISOString(),
      description: JSON.stringify(c.allowedUserIds)
    });
  }
  if (c.tmsLoteNumber !== undefined) {
    history = history.filter(h => h.id !== 'meta_tms_lote');
    if (c.tmsLoteNumber) {
      history.push({
        id: 'meta_tms_lote',
        userId: 'system',
        timestamp: new Date().toISOString(),
        description: c.tmsLoteNumber
      });
    }
  }
  if (c.clientCnpj !== undefined) {
    history = history.filter(h => h.id !== 'meta_client_cnpj');
    if (c.clientCnpj) {
      history.push({
        id: 'meta_client_cnpj',
        userId: 'system',
        timestamp: new Date().toISOString(),
        description: c.clientCnpj
      });
    }
  }
  if (c.clientBranchId !== undefined) {
    history = history.filter(h => h.id !== 'meta_client_branch_id');
    if (c.clientBranchId) {
      history.push({
        id: 'meta_client_branch_id',
        userId: 'system',
        timestamp: new Date().toISOString(),
        description: c.clientBranchId
      });
    }
  }
  if (c.isExport !== undefined) {
    history = history.filter(h => h.id !== 'meta_is_export');
    history.push({
      id: 'meta_is_export',
      userId: 'system',
      timestamp: new Date().toISOString(),
      description: c.isExport ? 'true' : 'false'
    });
  }
  if (c.freightCalculationType !== undefined) {
    history = history.filter(h => h.id !== 'meta_freight_calc_type');
    history.push({
      id: 'meta_freight_calc_type',
      userId: 'system',
      timestamp: new Date().toISOString(),
      description: c.freightCalculationType
    });
  }
  if (c.icmsValue !== undefined) {
    history = history.filter(h => h.id !== 'meta_icms_value');
    history.push({
      id: 'meta_icms_value',
      userId: 'system',
      timestamp: new Date().toISOString(),
      description: String(c.icmsValue)
    });
  }
  if (c.orderNumber !== undefined) {
    history = history.filter(h => h.id !== 'meta_order_number');
    if (c.orderNumber) {
      history.push({
        id: 'meta_order_number',
        userId: 'system',
        timestamp: new Date().toISOString(),
        description: c.orderNumber
      });
    }
  }
  if (c.packaging !== undefined) {
    history = history.filter(h => h.id !== 'meta_packaging');
    if (c.packaging) {
      history.push({
        id: 'meta_packaging',
        userId: 'system',
        timestamp: new Date().toISOString(),
        description: c.packaging
      });
    }
  }
  if (c.financialCostEnabled !== undefined) {
    history = history.filter(h => h.id !== 'meta_financial_cost_enabled');
    history.push({
      id: 'meta_financial_cost_enabled',
      userId: 'system',
      timestamp: new Date().toISOString(),
      description: c.financialCostEnabled ? 'true' : 'false'
    });
  }
  if (c.financialCostMonthlyRate !== undefined) {
    history = history.filter(h => h.id !== 'meta_financial_cost_monthly_rate');
    history.push({
      id: 'meta_financial_cost_monthly_rate',
      userId: 'system',
      timestamp: new Date().toISOString(),
      description: String(c.financialCostMonthlyRate)
    });
  }
  if (c.financialCostDaysTerm !== undefined) {
    history = history.filter(h => h.id !== 'meta_financial_cost_days_term');
    history.push({
      id: 'meta_financial_cost_days_term',
      userId: 'system',
      timestamp: new Date().toISOString(),
      description: String(c.financialCostDaysTerm)
    });
  }
  if (c.financialCostBaseDays !== undefined) {
    history = history.filter(h => h.id !== 'meta_financial_cost_base_days');
    history.push({
      id: 'meta_financial_cost_base_days',
      userId: 'system',
      timestamp: new Date().toISOString(),
      description: String(c.financialCostBaseDays)
    });
  }
  if (c.financialCostEffectiveRate !== undefined) {
    history = history.filter(h => h.id !== 'meta_financial_cost_effective_rate');
    history.push({
      id: 'meta_financial_cost_effective_rate',
      userId: 'system',
      timestamp: new Date().toISOString(),
      description: String(c.financialCostEffectiveRate)
    });
  }
  if (c.financialCostPerTon !== undefined) {
    history = history.filter(h => h.id !== 'meta_financial_cost_per_ton');
    history.push({
      id: 'meta_financial_cost_per_ton',
      userId: 'system',
      timestamp: new Date().toISOString(),
      description: String(c.financialCostPerTon)
    });
  }
  if (c.financialCostTotal !== undefined) {
    history = history.filter(h => h.id !== 'meta_financial_cost_total');
    history.push({
      id: 'meta_financial_cost_total',
      userId: 'system',
      timestamp: new Date().toISOString(),
      description: String(c.financialCostTotal)
    });
  }

  const cargoId = (c as Cargo).id;
  const isTempId = !cargoId || (typeof cargoId === 'string' && cargoId.startsWith('TEMP-'));

  const payload: any = {
    client_id: c.clientId,
    product_id: c.productId,
    origin: c.origin,
    origin_location: c.originLocation,
    origin_map_link: c.originMapLink,
    destination: c.destination,
    destination_location: c.destinationLocation,
    destination_map_link: c.destinationMapLink,
    total_volume: c.totalVolume,
    scheduled_volume: c.scheduledVolume,
    loaded_volume: c.loadedVolume,
    company_freight_value_per_ton: c.companyFreightValuePerTon,
    driver_freight_value_per_ton: c.driverFreightValuePerTon,
    has_icms: c.hasIcms,
    icms_percentage: c.icmsPercentage,
    requires_scheduling: c.requiresScheduling,
    type: c.type,
    status: c.status,
    created_at: c.createdAt,
    created_by_id: c.createdById,
    history: history,
    loading_deadline: c.loadingDeadline,
    allowed_vehicle_types: c.allowedVehicleTypes,
    freight_legs: c.freightLegs,
    daily_schedule: c.dailySchedule,
    observations: c.observations,
    attachments: c.attachments || [],
    origin_coords: c.originCoords ? (typeof c.originCoords === 'string' ? c.originCoords : JSON.stringify(c.originCoords)) : null,
    destination_coords: c.destinationCoords ? (typeof c.destinationCoords === 'string' ? c.destinationCoords : JSON.stringify(c.destinationCoords)) : null,
    salesperson_name: c.salespersonName,
    salesperson_commission_per_ton: c.salespersonCommissionPerTon,
    branch_id: c.branchId || null,
  };

  if (!isTempId) {
    payload.id = cargoId;
  }
  if (c.sequenceId && typeof c.sequenceId === 'number' && c.sequenceId > 0 && c.sequenceId < 1000000) {
    payload.sequence_id = c.sequenceId;
  }

  return payload;
};

export const toShipment = (row: any): Shipment => {
  const docs = (row.documents && typeof row.documents === 'object') ? row.documents : {};
  const realProfit = row.real_profit_data || docs.real_profit_data;

  const isFederalTaxManual = row.is_federal_tax_manual !== null && row.is_federal_tax_manual !== undefined
    ? Boolean(row.is_federal_tax_manual)
    : (docs.is_federal_tax_manual !== undefined && docs.is_federal_tax_manual !== null
        ? Boolean(docs.is_federal_tax_manual)
        : (realProfit?.isFederalTaxManual !== undefined && realProfit?.isFederalTaxManual !== null
            ? Boolean(realProfit.isFederalTaxManual)
            : undefined));

  const federalTax = row.federal_tax !== null && row.federal_tax !== undefined 
    ? Number(row.federal_tax) 
    : (docs.federal_tax !== undefined && docs.federal_tax !== null
        ? Number(docs.federal_tax)
        : (docs.imposto_federal !== undefined && docs.imposto_federal !== null
            ? Number(docs.imposto_federal)
            : (realProfit?.federalTax !== undefined && realProfit?.federalTax !== null
                ? Number(realProfit.federalTax)
                : undefined)));

  const isGeneratedCreditManual = row.is_generated_credit_manual !== null && row.is_generated_credit_manual !== undefined
    ? Boolean(row.is_generated_credit_manual)
    : (docs.is_generated_credit_manual !== undefined && docs.is_generated_credit_manual !== null
        ? Boolean(docs.is_generated_credit_manual)
        : (realProfit?.isGeneratedCreditManual !== undefined && realProfit?.isGeneratedCreditManual !== null
            ? Boolean(realProfit.isGeneratedCreditManual)
            : undefined));

  const generatedCredit = row.generated_credit !== null && row.generated_credit !== undefined
    ? Number(row.generated_credit)
    : (docs.generated_credit !== undefined && docs.generated_credit !== null
        ? Number(docs.generated_credit)
        : (docs.credito_gerado !== undefined && docs.credito_gerado !== null
            ? Number(docs.credito_gerado)
            : (realProfit?.generatedCredit !== undefined && realProfit?.generatedCredit !== null
                ? Number(realProfit.generatedCredit)
                : undefined)));

  return {
    id: row.id,
    orderId: row.order_id,
    cargoId: row.cargo_id,
    driverName: row.driver_name,
    driverContact: row.driver_contact,
    driverCpf: row.driver_cpf,
    embarcadorId: row.embarcador_id,
    horsePlate: row.horse_plate,
    trailer1Plate: row.trailer1_plate,
    trailer2Plate: row.trailer2_plate,
    trailer3Plate: row.trailer3_plate,
    shipmentTonnage: Number(row.shipment_tonnage),
    driverFreightValue: Number(row.driver_freight_value),
    status: row.status,
    scheduledDate: row.scheduled_date,
    scheduledTime: row.scheduled_time,
    arrivalTime: row.arrival_time,
    documents: docs,
    history: Array.isArray(row.history) ? row.history.filter((h: any) => !String(h?.id || '').startsWith('meta_')) : [],
    createdAt: row.created_at,
    createdById: row.created_by_id,
    statusHistory: row.status_history || [],
    anttOwnerIdentifier: row.antt_owner_identifier,
    paymentMethod: row.payment_method || docs.payment_method,
    pixKey: row.pix_key || docs.pix_key,
    bankDetails: row.bank_details,
    advancePercentage: row.advance_percentage !== null && row.advance_percentage !== undefined ? Number(row.advance_percentage) : (docs.advance_percentage !== undefined ? Number(docs.advance_percentage) : undefined),
    advanceValue: row.advance_value !== null ? Number(row.advance_value) : undefined,
    tollValue: (row.toll_value !== null && !isNaN(Number(row.toll_value)) && Number(row.toll_value) >= 0 && Number(row.toll_value) <= 25000)
      ? Number(row.toll_value)
      : (Number(row.toll_value) > 25000 ? 0 : undefined),
    vehicleTag: row.vehicle_tag,
    companyFreightRateSnapshot: row.company_freight_rate_snapshot !== null ? Number(row.company_freight_rate_snapshot) : undefined,
    driverFreightRateSnapshot: row.driver_freight_rate_snapshot !== null ? Number(row.driver_freight_rate_snapshot) : undefined,
    freightCalculationType: row.freight_calculation_type || docs.freight_calculation_type || undefined,
    icmsValue: (docs.is_icms_exempt || realProfit?.isIcmsExempt || docs.icms_value === 0 || row.icms_value === 0)
      ? 0
      : (row.icms_value !== null && row.icms_value !== undefined ? Number(row.icms_value) : (docs.icms_value !== undefined && docs.icms_value !== null ? Number(docs.icms_value) : undefined)),
    isIcmsExempt: Boolean(row.is_icms_exempt || docs.is_icms_exempt || realProfit?.isIcmsExempt || docs.icms_value === 0 || row.icms_value === 0),
    route: row.route,
    cancellationReason: row.cancellation_reason,
    driverReferences: Array.isArray(row.driver_references) ? row.driver_references.join('\n') : (row.driver_references || ''),
    ownerName: row.owner_name || docs.owner_name || docs.ownerName || undefined,
    ownerContact: row.owner_contact,
    balanceToReceiveValue: row.balance_to_receive_value !== null ? Number(row.balance_to_receive_value) : undefined,
    discountValue: row.discount_value !== null ? Number(row.discount_value) : undefined,
    isBreakageWaived: row.is_breakage_waived !== null && row.is_breakage_waived !== undefined ? Boolean(row.is_breakage_waived) : (docs.is_breakage_waived !== undefined ? Boolean(docs.is_breakage_waived) : undefined),
    netBalanceValue: row.net_balance_value !== null ? Number(row.net_balance_value) : undefined,
    unloadedTonnage: row.unloaded_tonnage !== null ? Number(row.unloaded_tonnage) : undefined,
    vehicleSetType: row.vehicle_set_type,
    vehicleBodyType: row.vehicle_body_type,
    riskReleaseCode: row.risk_release_code || docs.risk_release_code || undefined,
    riskQueryType: row.risk_query_type || docs.risk_query_type || undefined,
    riskQueryCost: row.risk_query_cost !== null && row.risk_query_cost !== undefined ? Number(row.risk_query_cost) : (docs.risk_query_cost !== undefined && docs.risk_query_cost !== null ? Number(docs.risk_query_cost) : undefined),
    anttModality: (row.antt_modality && row.antt_modality !== 'null') ? row.antt_modality : ((docs.antt_modality && docs.antt_modality !== 'null') ? docs.antt_modality : undefined),
    etcTaxRegime: (row.etc_tax_regime && row.etc_tax_regime !== 'null') ? row.etc_tax_regime : ((docs.etc_tax_regime && docs.etc_tax_regime !== 'null') ? docs.etc_tax_regime : undefined),
    driverFreightType: row.driver_freight_type || docs.driver_freight_type || 'PJ',
    cteNumber: row.cte_number || docs.cte_number || (getShipmentCte({ status: row.status, documents: docs }) !== '-' ? getShipmentCte({ status: row.status, documents: docs }) : undefined),
    cteEmissionDate: row.cte_emission_date || docs.cte_emission_date || (getShipmentCteEmissionDate({ status: row.status, documents: docs }) || undefined),
    subCtes: row.sub_ctes || docs.sub_ctes || docs.subCtes || undefined,
    ciotNumber: row.ciot_number || docs.ciot_number || docs.ciot || docs.ciotNumber || (row.ciot && row.ciot !== row.id ? row.ciot : (getShipmentCiotNumber({ id: row.id, documents: docs }) !== '-' ? getShipmentCiotNumber({ id: row.id, documents: docs }) : undefined)),
    ciot: row.ciot || docs.ciot || docs.ciot_number || docs.ciotNumber || (row.ciot_number && row.ciot_number !== row.id ? row.ciot_number : (getShipmentCiotNumber({ id: row.id, documents: docs }) !== '-' ? getShipmentCiotNumber({ id: row.id, documents: docs }) : undefined)),
    nfeNumber: row.nfe_number || docs.nfe_number,
    nfeValue: row.nfe_value !== null && row.nfe_value !== undefined 
      ? Number(row.nfe_value) 
      : (docs.nfe_value !== undefined && docs.nfe_value !== null 
          ? Number(docs.nfe_value) 
          : (docs.valor_mercadoria !== undefined && docs.valor_mercadoria !== null 
              ? Number(docs.valor_mercadoria) 
              : (realProfit?.invoiceValue !== undefined && realProfit?.invoiceValue !== null 
                  ? Number(realProfit.invoiceValue) 
                  : undefined))),
    mdfeNumber: row.mdfe_number || docs.mdfe_number,
    codigoAtua: row.codigo_atua || docs.codigo_atua || docs.codg_atua || docs.codigoAtua || undefined,
    realProfitData: realProfit ? {
      ...realProfit,
      ...(Boolean(row.is_icms_exempt || docs.is_icms_exempt || realProfit?.isIcmsExempt || docs.icms_value === 0 || row.icms_value === 0)
        ? { isIcmsExempt: true, icmsDifference: 0 }
        : {})
    } : realProfit,
    isFederalTaxManual: isFederalTaxManual,
    federalTax: federalTax,
    isGeneratedCreditManual: isGeneratedCreditManual,
    generatedCredit: generatedCredit,
    additionalCost: row.additional_cost || docs.additional_cost || undefined,
    additionalCostValue: row.additional_cost_value !== null && row.additional_cost_value !== undefined 
      ? Number(row.additional_cost_value) 
      : (docs.additional_cost_value !== undefined ? Number(docs.additional_cost_value) : (docs.additional_cost?.value !== undefined ? Number(docs.additional_cost.value) : undefined)),
    additionalCostCategory: row.additional_cost_category || docs.additional_cost_category || docs.additional_cost?.category,
    additionalCostDescription: row.additional_cost_description || docs.additional_cost_description || docs.additional_cost?.description,
    agencyCommissionEnabled: row.agency_commission_enabled !== null && row.agency_commission_enabled !== undefined ? Boolean(row.agency_commission_enabled) : (docs.agency_commission_enabled !== undefined ? Boolean(docs.agency_commission_enabled) : undefined),
    agencyCommissionPercentage: row.agency_commission_percentage !== null && row.agency_commission_percentage !== undefined ? Number(row.agency_commission_percentage) : (docs.agency_commission_percentage !== undefined ? Number(docs.agency_commission_percentage) : 30),
    agencyCommissionValue: row.agency_commission_value !== null && row.agency_commission_value !== undefined ? Number(row.agency_commission_value) : (docs.agency_commission_value !== undefined ? Number(docs.agency_commission_value) : undefined),
    agencyCommissionAgencyName: row.agency_commission_agency_name || docs.agency_commission_agency_name,
    shipperCommissionEnabled: row.shipper_commission_enabled !== null && row.shipper_commission_enabled !== undefined ? Boolean(row.shipper_commission_enabled) : (docs.shipper_commission_enabled !== undefined ? Boolean(docs.shipper_commission_enabled) : undefined),
    shipperCommissionRatePerTon: row.shipper_commission_rate_per_ton !== null && row.shipper_commission_rate_per_ton !== undefined ? Number(row.shipper_commission_rate_per_ton) : (docs.shipper_commission_rate_per_ton !== undefined ? Number(docs.shipper_commission_rate_per_ton) : undefined),
    shipperCommissionValue: row.shipper_commission_value !== null && row.shipper_commission_value !== undefined ? Number(row.shipper_commission_value) : (docs.shipper_commission_value !== undefined ? Number(docs.shipper_commission_value) : undefined),
    driverExtraPayments: row.driver_extra_payments || docs.driver_extra_payments || docs.driverExtraPayments || undefined,
    driverExtraPaymentsTotal: row.driver_extra_payments_total !== null && row.driver_extra_payments_total !== undefined 
      ? Number(row.driver_extra_payments_total) 
      : (docs.driver_extra_payments_total !== undefined ? Number(docs.driver_extra_payments_total) : (docs.driverExtraPaymentsTotal !== undefined ? Number(docs.driverExtraPaymentsTotal) : undefined)),
    financialCostValue: row.financial_cost_value !== null && row.financial_cost_value !== undefined 
      ? Number(row.financial_cost_value) 
      : (docs.financial_cost_value !== undefined && docs.financial_cost_value !== null 
          ? Number(docs.financial_cost_value) 
          : (realProfit?.financialCost !== undefined && realProfit?.financialCost !== null 
              ? Number(realProfit.financialCost) 
              : undefined)),
    financialCostRate: row.financial_cost_rate !== null && row.financial_cost_rate !== undefined 
      ? Number(row.financial_cost_rate) 
      : (docs.financial_cost_rate !== undefined && docs.financial_cost_rate !== null 
          ? Number(docs.financial_cost_rate) 
          : (docs.financial_cost_effective_rate !== undefined && docs.financial_cost_effective_rate !== null 
              ? Number(docs.financial_cost_effective_rate) 
              : undefined)),
    financialCostDaysTerm: row.financial_cost_days_term !== null && row.financial_cost_days_term !== undefined 
      ? Number(row.financial_cost_days_term) 
      : (docs.financial_cost_days_term !== undefined && docs.financial_cost_days_term !== null 
          ? Number(docs.financial_cost_days_term) 
          : undefined),
    financialCostMonthlyRate: row.financial_cost_monthly_rate !== null && row.financial_cost_monthly_rate !== undefined 
      ? Number(row.financial_cost_monthly_rate) 
      : (docs.financial_cost_monthly_rate !== undefined && docs.financial_cost_monthly_rate !== null 
          ? Number(docs.financial_cost_monthly_rate) 
          : undefined),
    statusPendingObservation: row.status_pending_observation || docs.status_pending_observation || docs.statusPendingObservation || undefined,
    driverCnh: row.driver_cnh || docs.driver_cnh || docs.cnh || undefined,
    driverRg: row.driver_rg || docs.driver_rg || docs.rg || undefined,
    driverMotherName: row.driver_mother_name || row.mother_name || docs.driver_mother_name || docs.nome_da_mae || docs.mother_name || undefined,
    driverBirthDate: row.driver_birth_date || row.birth_date || docs.driver_birth_date || docs.data_de_nascimento || docs.data_nascimento || undefined,
  };
};

const fromShipment = (s: Shipment) => {
  const isFederalTaxManual = s.isFederalTaxManual !== undefined 
    ? s.isFederalTaxManual 
    : (s.realProfitData?.isFederalTaxManual !== undefined 
        ? s.realProfitData.isFederalTaxManual 
        : ((s.documents as any)?.is_federal_tax_manual !== undefined 
            ? Boolean((s.documents as any).is_federal_tax_manual) 
            : null));

  const federalTax = s.federalTax !== undefined 
    ? s.federalTax 
    : (s.realProfitData?.federalTax !== undefined 
        ? s.realProfitData.federalTax 
        : ((s.documents as any)?.federal_tax !== undefined 
            ? Number((s.documents as any).federal_tax) 
            : ((s.documents as any)?.imposto_federal !== undefined 
                ? Number((s.documents as any).imposto_federal) 
                : null)));

  const isGeneratedCreditManual = s.isGeneratedCreditManual !== undefined
    ? s.isGeneratedCreditManual
    : (s.realProfitData?.isGeneratedCreditManual !== undefined
        ? s.realProfitData.isGeneratedCreditManual
        : ((s.documents as any)?.is_generated_credit_manual !== undefined
            ? Boolean((s.documents as any).is_generated_credit_manual)
            : null));

  const generatedCredit = s.generatedCredit !== undefined
    ? s.generatedCredit
    : (s.realProfitData?.generatedCredit !== undefined
        ? s.realProfitData.generatedCredit
        : ((s.documents as any)?.generated_credit !== undefined
            ? Number((s.documents as any).generated_credit)
            : ((s.documents as any)?.credito_gerado !== undefined
                ? Number((s.documents as any).credito_gerado)
                : null)));

  const isIcmsExempt = s.isIcmsExempt !== undefined
    ? Boolean(s.isIcmsExempt)
    : ((s.documents as any)?.is_icms_exempt !== undefined
        ? Boolean((s.documents as any).is_icms_exempt)
        : (s.realProfitData?.isIcmsExempt !== undefined
            ? Boolean(s.realProfitData.isIcmsExempt)
            : (s.icmsValue === 0 || (s.documents as any)?.icms_value === 0 ? true : null)));

  const realProfitData = s.realProfitData 
    ? {
        ...s.realProfitData,
        isFederalTaxManual: isFederalTaxManual !== null ? Boolean(isFederalTaxManual) : s.realProfitData.isFederalTaxManual,
        federalTax: federalTax !== null ? Number(federalTax) : s.realProfitData.federalTax,
        isGeneratedCreditManual: isGeneratedCreditManual !== null ? Boolean(isGeneratedCreditManual) : s.realProfitData.isGeneratedCreditManual,
        generatedCredit: generatedCredit !== null ? Number(generatedCredit) : s.realProfitData.generatedCredit,
        ...(isIcmsExempt !== null ? { isIcmsExempt: Boolean(isIcmsExempt), ...(isIcmsExempt ? { icmsDifference: 0 } : {}) } : {})
      } 
    : (isFederalTaxManual !== null || federalTax !== null || isGeneratedCreditManual !== null || generatedCredit !== null || isIcmsExempt !== null
        ? { 
            isFederalTaxManual: Boolean(isFederalTaxManual), 
            federalTax: federalTax !== null ? Number(federalTax) : undefined,
            isGeneratedCreditManual: Boolean(isGeneratedCreditManual),
            generatedCredit: generatedCredit !== null ? Number(generatedCredit) : undefined,
            ...(isIcmsExempt !== null ? { isIcmsExempt: Boolean(isIcmsExempt), ...(isIcmsExempt ? { icmsDifference: 0 } : {}) } : {})
          }
        : null);

  const docs = {
    ...(s.documents || {}),
    risk_release_code: s.riskReleaseCode !== undefined ? s.riskReleaseCode : (s.documents?.risk_release_code ?? null),
    risk_query_type: s.riskQueryType !== undefined ? s.riskQueryType : (s.documents?.risk_query_type ?? null),
    risk_query_cost: s.riskQueryCost !== undefined ? s.riskQueryCost : (s.documents?.risk_query_cost ?? null),
    payment_method: s.paymentMethod !== undefined ? s.paymentMethod : (s.documents?.payment_method ?? null),
    pix_key: s.pixKey !== undefined ? s.pixKey : (s.documents?.pix_key ?? null),
    advance_percentage: s.advancePercentage !== undefined ? s.advancePercentage : (s.documents?.advance_percentage ?? null),
    is_breakage_waived: s.isBreakageWaived !== undefined ? s.isBreakageWaived : (s.documents?.is_breakage_waived ?? null),
    antt_modality: s.anttModality !== undefined ? s.anttModality : (s.documents?.antt_modality ?? null),
    etc_tax_regime: s.etcTaxRegime !== undefined ? s.etcTaxRegime : (s.documents?.etc_tax_regime ?? null),
    driver_freight_type: s.driverFreightType !== undefined ? s.driverFreightType : (s.documents?.driver_freight_type ?? 'PJ'),
    cte_number: s.cteNumber !== undefined ? s.cteNumber : (s.documents?.cte_number ?? null),
    cte_emission_date: s.cteEmissionDate !== undefined ? s.cteEmissionDate : (s.documents?.cte_emission_date ?? null),
    ciot_number: s.ciotNumber !== undefined ? s.ciotNumber : (s.ciot !== undefined ? s.ciot : (s.documents?.ciot_number ?? s.documents?.ciot ?? null)),
    ciot: s.ciot !== undefined ? s.ciot : (s.ciotNumber !== undefined ? s.ciotNumber : (s.documents?.ciot ?? s.documents?.ciot_number ?? null)),
    nfe_number: s.nfeNumber !== undefined ? s.nfeNumber : (s.documents?.nfe_number ?? null),
    driver_cnh: s.driverCnh !== undefined ? s.driverCnh : (s.documents?.driver_cnh ?? null),
    driver_rg: s.driverRg !== undefined ? s.driverRg : (s.documents?.driver_rg ?? null),
    driver_mother_name: s.driverMotherName !== undefined ? s.driverMotherName : (s.documents?.driver_mother_name ?? s.documents?.nome_da_mae ?? null),
    nome_da_mae: s.driverMotherName !== undefined ? s.driverMotherName : (s.documents?.nome_da_mae ?? s.documents?.driver_mother_name ?? null),
    driver_birth_date: s.driverBirthDate !== undefined ? s.driverBirthDate : (s.documents?.driver_birth_date ?? s.documents?.data_nascimento ?? null),
    data_nascimento: s.driverBirthDate !== undefined ? s.driverBirthDate : (s.documents?.data_nascimento ?? s.documents?.driver_birth_date ?? null),
    nfe_value: s.nfeValue !== undefined ? s.nfeValue : (s.documents?.nfe_value ?? s.documents?.valor_mercadoria ?? s.realProfitData?.invoiceValue ?? null),
    valor_mercadoria: s.nfeValue !== undefined ? s.nfeValue : (s.documents?.valor_mercadoria ?? s.documents?.nfe_value ?? s.realProfitData?.invoiceValue ?? null),
    mdfe_number: s.mdfeNumber !== undefined ? s.mdfeNumber : (s.documents?.mdfe_number ?? null),
    codigo_atua: s.codigoAtua !== undefined ? s.codigoAtua : (s.documents?.codigo_atua ?? s.documents?.codg_atua ?? null),
    is_federal_tax_manual: isFederalTaxManual,
    federal_tax: federalTax,
    imposto_federal: federalTax,
    is_generated_credit_manual: isGeneratedCreditManual,
    generated_credit: generatedCredit,
    credito_gerado: generatedCredit,
    is_icms_exempt: isIcmsExempt,
    real_profit_data: realProfitData,
    freight_calculation_type: s.freightCalculationType ?? (s.documents?.freight_calculation_type ?? null),
    icms_value: isIcmsExempt ? 0 : (s.icmsValue !== undefined ? s.icmsValue : (s.documents?.icms_value ?? null)),
    valor_icms: isIcmsExempt ? 0 : (s.documents?.valor_icms ?? null),
    additional_cost: s.additionalCost ?? (s.documents?.additional_cost ?? null),
    additional_cost_value: s.additionalCostValue !== undefined ? s.additionalCostValue : (s.additionalCost?.value ?? s.documents?.additional_cost_value ?? null),
    additional_cost_category: s.additionalCostCategory ?? (s.additionalCost?.category ?? s.documents?.additional_cost_category ?? null),
    additional_cost_description: s.additionalCostDescription ?? (s.additionalCost?.description ?? s.documents?.additional_cost_description ?? null),
    agency_commission_enabled: s.agencyCommissionEnabled !== undefined ? s.agencyCommissionEnabled : (s.documents?.agency_commission_enabled ?? null),
    agency_commission_percentage: s.agencyCommissionPercentage ?? (s.documents?.agency_commission_percentage ?? 30),
    agency_commission_value: s.agencyCommissionValue !== undefined ? s.agencyCommissionValue : (s.documents?.agency_commission_value ?? null),
    agency_commission_agency_name: s.agencyCommissionAgencyName ?? (s.documents?.agency_commission_agency_name ?? null),
    shipper_commission_enabled: s.shipperCommissionEnabled !== undefined ? s.shipperCommissionEnabled : (s.documents?.shipper_commission_enabled ?? null),
    shipper_commission_rate_per_ton: s.shipperCommissionRatePerTon !== undefined ? s.shipperCommissionRatePerTon : (s.documents?.shipper_commission_rate_per_ton ?? null),
    shipper_commission_value: s.shipperCommissionValue !== undefined ? s.shipperCommissionValue : (s.documents?.shipper_commission_value ?? null),
    driver_extra_payments: s.driverExtraPayments ?? (s.documents?.driver_extra_payments ?? null),
    driver_extra_payments_total: s.driverExtraPaymentsTotal !== undefined ? s.driverExtraPaymentsTotal : (s.documents?.driver_extra_payments_total ?? null),
    financial_cost_value: s.financialCostValue !== undefined ? s.financialCostValue : (s.documents?.financial_cost_value ?? null),
    financial_cost_rate: s.financialCostRate !== undefined ? s.financialCostRate : (s.documents?.financial_cost_rate ?? null),
    financial_cost_days_term: s.financialCostDaysTerm !== undefined ? s.financialCostDaysTerm : (s.documents?.financial_cost_days_term ?? null),
    financial_cost_monthly_rate: s.financialCostMonthlyRate !== undefined ? s.financialCostMonthlyRate : (s.documents?.financial_cost_monthly_rate ?? null),
    owner_name: s.ownerName !== undefined ? s.ownerName : (s.documents?.owner_name ?? null),
    owner_contact: s.ownerContact !== undefined ? s.ownerContact : (s.documents?.owner_contact ?? null),
    status_pending_observation: s.statusPendingObservation !== undefined ? (s.statusPendingObservation || null) : (s.documents?.status_pending_observation ?? null),
  };

  return {
    id: s.id,
    order_id: s.orderId,
    cargo_id: s.cargoId,
    driver_name: s.driverName,
    driver_contact: s.driverContact,
    driver_cpf: s.driverCpf,
    embarcador_id: s.embarcadorId,
    horse_plate: s.horsePlate,
    trailer1_plate: s.trailer1Plate,
    trailer2_plate: s.trailer2Plate,
    trailer3_plate: s.trailer3Plate,
    shipment_tonnage: s.shipmentTonnage,
    driver_freight_value: s.driverFreightValue,
    status: s.status,
    scheduled_date: s.scheduledDate,
    scheduled_time: s.scheduledTime,
    arrival_time: s.arrivalTime,
    documents: docs,
    history: s.history,
    created_at: s.createdAt,
    created_by_id: s.createdById,
    status_history: s.statusHistory,
    antt_owner_identifier: s.anttOwnerIdentifier ?? null,
    payment_method: s.paymentMethod ?? null,
    pix_key: s.pixKey ?? null,
    bank_details: s.bankDetails ?? null,
    advance_percentage: s.advancePercentage ?? null,
    advance_value: s.advanceValue ?? null,
    toll_value: (s.tollValue !== undefined && s.tollValue !== null && !isNaN(Number(s.tollValue)) && Number(s.tollValue) >= 0 && Number(s.tollValue) <= 25000)
      ? Number(s.tollValue)
      : (Number(s.tollValue) > 25000 ? 0 : null),
    vehicle_tag: s.vehicleTag ?? null,
    company_freight_rate_snapshot: s.companyFreightRateSnapshot ?? null,
    driver_freight_rate_snapshot: s.driverFreightRateSnapshot ?? null,
    driver_freight_type: s.driverFreightType || 'PJ',
    route: s.route ?? null,
    cancellation_reason: s.cancellationReason ?? null,
    driver_references: s.driverReferences ? (Array.isArray(s.driverReferences) ? s.driverReferences : s.driverReferences.split('\n').filter(Boolean)) : [],
    owner_contact: s.ownerContact ?? null,
    balance_to_receive_value: s.balanceToReceiveValue ?? null,
    discount_value: s.discountValue ?? null,
    net_balance_value: s.netBalanceValue ?? null,
    unloaded_tonnage: s.unloadedTonnage ?? null,
    branch_id: s.branchId || null,
    vehicle_set_type: s.vehicleSetType ?? null,
    vehicle_body_type: s.vehicleBodyType ?? null,
    status_pending_observation: s.statusPendingObservation || null,
  };
};

export const toUser = (row: any): User => {
  const perms = typeof row.permissions === 'object' && row.permissions ? row.permissions : {};
  const branchId = row.branch_id || row.filial_id || row.branchId || undefined;

  return {
    id: row.id,
    name: row.name,
    email: row.email,
    profile: row.profile,
    active: row.active,
    phone: row.phone,
    password: row.password,
    clientId: row.client_id || undefined,
    requirePasswordChange: row.require_password_change,
    authId: row.auth_id,
    passwordUpdatedAt: row.password_updated_at,
    branchId: branchId,
    filialId: branchId,
    customPermissions: row.permissions,
    hasCommercialCommission: perms.hasCommercialCommission ?? row.has_commercial_commission ?? (row.profile === 'Gerente Comercial'),
    commercialFixedSalary: perms.commercialFixedSalary ?? row.commercial_fixed_salary ?? undefined,
    commercialMatrizRate: perms.commercialMatrizRate ?? row.commercial_matriz_rate ?? undefined,
    commercialFiliaisRate: perms.commercialFiliaisRate ?? row.commercial_filiais_rate ?? undefined,
    commercialSelectedBranchIds: perms.commercialSelectedBranchIds ?? row.commercial_selected_branch_ids ?? undefined,
    commercialCalculationMode: perms.commercialCalculationMode ?? row.commercial_calculation_mode ?? 'bruto',
    commercialIsAgencyMode: perms.commercialIsAgencyMode ?? false,
    commercialAgencySharePercent: perms.commercialAgencySharePercent ?? undefined,
    availableForDriverRequests: perms.availableForDriverRequests ?? row.available_for_driver_requests ?? true,
    shipperCommissionRatePerTon: perms.shipperCommissionRatePerTon !== undefined ? Number(perms.shipperCommissionRatePerTon) : (row.shipper_commission_rate_per_ton !== undefined ? Number(row.shipper_commission_rate_per_ton) : undefined),
    agencyCommissionPercentage: perms.agencyCommissionPercentage !== undefined ? Number(perms.agencyCommissionPercentage) : (row.agency_commission_percentage !== undefined ? Number(row.agency_commission_percentage) : undefined),
    operatorCommissionPercentage: perms.operatorCommissionPercentage !== undefined ? Number(perms.operatorCommissionPercentage) : (row.operator_commission_percentage !== undefined ? Number(row.operator_commission_percentage) : undefined),
    agencyRole: perms.agencyRole ?? row.agency_role ?? (row.profile === 'Agenciador' ? 'lider' : undefined),
    agencyLeaderId: perms.agencyLeaderId ?? row.agency_leader_id ?? undefined,
  };
};

export const fromUser = (u: User | Omit<User, 'id'>) => {
  const currentPerms = typeof (u as any).customPermissions === 'object' && (u as any).customPermissions ? (u as any).customPermissions : {};
  const hasComm = u.hasCommercialCommission ?? false;
  const resolvedBranchId = u.branchId || (u as any).filialId || null;

  const permissionsPayload = {
    ...currentPerms,
    hasCommercialCommission: hasComm,
    commercialFixedSalary: u.commercialFixedSalary,
    commercialMatrizRate: u.commercialMatrizRate,
    commercialFiliaisRate: u.commercialFiliaisRate,
    commercialSelectedBranchIds: u.commercialSelectedBranchIds,
    commercialCalculationMode: u.commercialCalculationMode || 'bruto',
    commercialIsAgencyMode: u.commercialIsAgencyMode ?? false,
    commercialAgencySharePercent: u.commercialAgencySharePercent,
    availableForDriverRequests: u.availableForDriverRequests !== undefined ? u.availableForDriverRequests : true,
    shipperCommissionRatePerTon: u.shipperCommissionRatePerTon,
    agencyCommissionPercentage: u.agencyCommissionPercentage,
    operatorCommissionPercentage: u.operatorCommissionPercentage,
    agencyRole: u.agencyRole,
    agencyLeaderId: u.agencyLeaderId,
  };

  return {
    id: (u as User).id,
    name: u.name,
    email: u.email,
    profile: u.profile,
    active: u.active,
    phone: u.phone,
    password: u.password,
    client_id: u.clientId || null,
    require_password_change: u.requirePasswordChange,
    auth_id: u.authId,
    password_updated_at: u.passwordUpdatedAt,
    branch_id: resolvedBranchId || null,
    permissions: permissionsPayload,
  };
};

export const toTicket = (row: any): Ticket => {
  let cleanDesc = row.description || '';
  const cargoMatch = cleanDesc.match(/\[CARGO_ID:\s*(.*?)\]/);
  const shipmentMatch = cleanDesc.match(/\[SHIPMENT_ID:\s*(.*?)\]/);
  const attachmentsJsonMatch = cleanDesc.match(/\[ATTACHMENTS_JSON:\s*(.*?)\]/);
  const attachmentUrlMatch = cleanDesc.match(/\[ATTACHMENT_URL:\s*(.*?)\]/);
  const attachmentNameMatch = cleanDesc.match(/\[ATTACHMENT_NAME:\s*(.*?)\]/);
  const audioUrlMatch = cleanDesc.match(/\[AUDIO_URL:\s*(.*?)\]/);
  const audioDurationMatch = cleanDesc.match(/\[AUDIO_DURATION:\s*(.*?)\]/);
  const startedAtMatch = cleanDesc.match(/\[STARTED_AT:\s*(.*?)\]/);
  const startedByIdMatch = cleanDesc.match(/\[STARTED_BY:\s*(.*?)\]/);
  const resolvedAtMatch = cleanDesc.match(/\[RESOLVED_AT:\s*(.*?)\]/);
  const resolvedByIdMatch = cleanDesc.match(/\[RESOLVED_BY:\s*(.*?)\]/);
  const closedAtMatch = cleanDesc.match(/\[CLOSED_AT:\s*(.*?)\]/);
  const closedByIdMatch = cleanDesc.match(/\[CLOSED_BY:\s*(.*?)\]/);
  
  const cargoId = cargoMatch ? cargoMatch[1] : undefined;
  const shipmentId = shipmentMatch ? shipmentMatch[1] : undefined;
  const attachmentUrl = attachmentUrlMatch ? attachmentUrlMatch[1] : (row.attachment_url || undefined);
  const attachmentName = attachmentNameMatch ? attachmentNameMatch[1] : (row.attachment_name || undefined);
  let attachments: any[] | undefined = undefined;
  if (attachmentsJsonMatch) {
    try {
      attachments = JSON.parse(attachmentsJsonMatch[1]);
    } catch {}
  } else if (attachmentUrl) {
    attachments = [{ url: attachmentUrl, name: attachmentName || 'Anexo' }];
  }

  const audioUrl = audioUrlMatch ? audioUrlMatch[1] : (row.audio_url || undefined);
  const audioDurationSeconds = audioDurationMatch ? Number(audioDurationMatch[1]) : (row.audio_duration_seconds ? Number(row.audio_duration_seconds) : undefined);

  let startedAt = startedAtMatch ? startedAtMatch[1] : undefined;
  let startedById = startedByIdMatch ? startedByIdMatch[1] : undefined;
  let resolvedAt = resolvedAtMatch ? resolvedAtMatch[1] : undefined;
  let resolvedById = resolvedByIdMatch ? resolvedByIdMatch[1] : undefined;
  let closedAt = closedAtMatch ? closedAtMatch[1] : undefined;
  let closedById = closedByIdMatch ? closedByIdMatch[1] : undefined;

  const history = Array.isArray(row.history) ? row.history : [];

  // Fallback / historical extraction from history logs if tags were not present
  if (!startedAt) {
    const attendLog = history.find((h: any) => h.newStatus === TicketStatus.EmAndamento || (h.comment && h.comment.toLowerCase().includes('atendimento')));
    if (attendLog) {
      startedAt = attendLog.timestamp;
      startedById = attendLog.userId;
    }
  }

  if (!resolvedAt) {
    const resolveLog = history.find((h: any) => h.newStatus === TicketStatus.Resolvido || (h.comment && h.comment.toLowerCase().includes('resolvido')));
    if (resolveLog) {
      resolvedAt = resolveLog.timestamp;
      resolvedById = resolveLog.userId;
    }
  }

  if (!closedAt) {
    const closeLog = history.find((h: any) => h.newStatus === TicketStatus.Fechado || (h.comment && h.comment.toLowerCase().includes('fechado')));
    if (closeLog) {
      closedAt = closeLog.timestamp;
      closedById = closeLog.userId;
    }
  }

  // Calculate durations (SLA)
  let timeToAttendMs: number | undefined = undefined;
  let timeToResolveMs: number | undefined = undefined;
  const createdAtMs = row.created_at ? new Date(row.created_at).getTime() : undefined;

  if (createdAtMs && startedAt) {
    const sMs = new Date(startedAt).getTime();
    if (!isNaN(sMs) && sMs >= createdAtMs) {
      timeToAttendMs = sMs - createdAtMs;
    }
  }

  const endMsStr = resolvedAt || closedAt;
  if (createdAtMs && endMsStr) {
    const eMs = new Date(endMsStr).getTime();
    if (!isNaN(eMs) && eMs >= createdAtMs) {
      timeToResolveMs = eMs - createdAtMs;
    }
  }

  // Clean description from metadata tags
  cleanDesc = cleanDesc
    .replace(/\[CARGO_ID:\s*.*?\]/g, '')
    .replace(/\[SHIPMENT_ID:\s*.*?\]/g, '')
    .replace(/\[ATTACHMENTS_JSON:\s*.*?\]/g, '')
    .replace(/\[ATTACHMENT_URL:\s*.*?\]/g, '')
    .replace(/\[ATTACHMENT_NAME:\s*.*?\]/g, '')
    .replace(/\[AUDIO_URL:\s*.*?\]/g, '')
    .replace(/\[AUDIO_DURATION:\s*.*?\]/g, '')
    .replace(/\[STARTED_AT:\s*.*?\]/g, '')
    .replace(/\[STARTED_BY:\s*.*?\]/g, '')
    .replace(/\[RESOLVED_AT:\s*.*?\]/g, '')
    .replace(/\[RESOLVED_BY:\s*.*?\]/g, '')
    .replace(/\[CLOSED_AT:\s*.*?\]/g, '')
    .replace(/\[CLOSED_BY:\s*.*?\]/g, '')
    .trim();

  return {
    id: row.id,
    title: row.title,
    description: cleanDesc,
    status: row.status,
    priority: row.priority,
    createdById: row.created_by_id,
    assignedToId: row.assigned_to_id,
    createdAt: row.created_at,
    history,
    cargoId,
    shipmentId,
    attachmentUrl,
    attachmentName,
    attachments: (attachments && attachments.length > 0) ? attachments : undefined,
    audioUrl,
    audioDurationSeconds,
    startedAt,
    startedById,
    resolvedAt,
    resolvedById,
    closedAt,
    closedById,
    timeToAttendMs,
    timeToResolveMs,
  };
};

export const fromTicket = (t: Ticket | Omit<Ticket, 'id' | 'history' | 'createdAt' | 'createdById'>) => {
  let finalDesc = t.description;
  const ticketObj = t as Ticket;
  if (ticketObj.cargoId) finalDesc += `\n\n[CARGO_ID: ${ticketObj.cargoId}]`;
  if (ticketObj.shipmentId) finalDesc += `\n\n[SHIPMENT_ID: ${ticketObj.shipmentId}]`;
  if (ticketObj.attachments && ticketObj.attachments.length > 0) {
    finalDesc += `\n\n[ATTACHMENTS_JSON: ${JSON.stringify(ticketObj.attachments)}]`;
    if (!ticketObj.attachmentUrl) {
      finalDesc += `\n\n[ATTACHMENT_URL: ${ticketObj.attachments[0].url}]`;
      finalDesc += `\n\n[ATTACHMENT_NAME: ${ticketObj.attachments[0].name}]`;
    }
  }
  if (ticketObj.attachmentUrl && (!ticketObj.attachments || ticketObj.attachments.length === 0)) {
    finalDesc += `\n\n[ATTACHMENT_URL: ${ticketObj.attachmentUrl}]`;
  }
  if (ticketObj.attachmentName && (!ticketObj.attachments || ticketObj.attachments.length === 0)) {
    finalDesc += `\n\n[ATTACHMENT_NAME: ${ticketObj.attachmentName}]`;
  }
  if (ticketObj.audioUrl) finalDesc += `\n\n[AUDIO_URL: ${ticketObj.audioUrl}]`;
  if (ticketObj.audioDurationSeconds) finalDesc += `\n\n[AUDIO_DURATION: ${ticketObj.audioDurationSeconds}]`;
  if (ticketObj.startedAt) finalDesc += `\n\n[STARTED_AT: ${ticketObj.startedAt}]`;
  if (ticketObj.startedById) finalDesc += `\n\n[STARTED_BY: ${ticketObj.startedById}]`;
  if (ticketObj.resolvedAt) finalDesc += `\n\n[RESOLVED_AT: ${ticketObj.resolvedAt}]`;
  if (ticketObj.resolvedById) finalDesc += `\n\n[RESOLVED_BY: ${ticketObj.resolvedById}]`;
  if (ticketObj.closedAt) finalDesc += `\n\n[CLOSED_AT: ${ticketObj.closedAt}]`;
  if (ticketObj.closedById) finalDesc += `\n\n[CLOSED_BY: ${ticketObj.closedById}]`;

  return {
    id: ticketObj.id,
    title: t.title,
    description: finalDesc,
    status: t.status,
    priority: t.priority,
    created_by_id: ticketObj.createdById,
    assigned_to_id: t.assignedToId,
    created_at: ticketObj.createdAt,
    history: ticketObj.history || [],
  };
};

export const toBranch = (row: any): Branch => ({
  id: row.id,
  name: row.name,
  city: row.city,
  state: row.state,
  createdAt: row.created_at,
});

export const fromBranch = (b: Branch | Omit<Branch, 'id' | 'createdAt'>) => ({
  id: (b as Branch).id,
  name: b.name,
  city: b.city,
  state: b.state,
});

export const toRiskQueryOption = (row: any): RiskQueryOption => ({
  id: row.id,
  name: row.name || '',
  cost: Number(row.cost !== undefined && row.cost !== null ? row.cost : 0),
  active: row.active !== false,
  orderIndex: row.order_index !== undefined ? Number(row.order_index) : undefined,
  description: row.description || '',
  createdAt: row.created_at || '',
});

export const fromRiskQueryOption = (opt: RiskQueryOption | Omit<RiskQueryOption, 'id'>) => ({
  id: (opt as RiskQueryOption).id,
  name: opt.name,
  cost: opt.cost,
  active: opt.active !== false,
  order_index: opt.orderIndex ?? 0,
  description: opt.description || '',
});

// ─────────────────────────────────────────────
// FETCH HELPERS: Handle Auth Errors
// ─────────────────────────────────────────────

const handleAuthError = (error: any, defaultValue: any) => {
  if (error.code === 'PGRST116' || error.status === 406 || error.status === 401) {
    console.warn('[DB] Auth/RLS error or no data found:', error.message);
    return defaultValue;
  }
  throw error;
};

// ─────────────────────────────────────────────
// FETCH ALL
// ─────────────────────────────────────────────

async function fetchAllRows(
  tableName: string,
  orderColumn: string,
  orderOptions?: { ascending?: boolean }
): Promise<any[]> {
  let allData: any[] = [];
  let page = 0;
  const pageSize = 1000;
  let hasMore = true;

  while (hasMore) {
    const from = page * pageSize;
    const to = from + pageSize - 1;

    const { data, error } = await supabase
      .from(tableName)
      .select('*')
      .order(orderColumn, orderOptions)
      .range(from, to);

    if (error) {
      throw error;
    }

    if (!data || data.length === 0) {
      break;
    }

    allData = allData.concat(data);

    if (data.length < pageSize) {
      hasMore = false;
    } else {
      page++;
    }
  }

  return allData;
}

export const fetchClientBranches = async (): Promise<Record<string, ClientBranchCnpj[]>> => {
  try {
    const { data } = await supabase.from('profile_permissions').select('permissions').eq('id', 1).single();
    if (data?.permissions?.client_branches) {
      return data.permissions.client_branches;
    }
  } catch (err) {
    console.warn('[DB] Error loading client branches:', err);
  }
  try {
    const local = localStorage.getItem('transcunha_client_branches');
    if (local) return JSON.parse(local);
  } catch {}
  return {};
};

export const saveClientBranches = async (branchesMap: Record<string, ClientBranchCnpj[]>): Promise<void> => {
  try {
    localStorage.setItem('transcunha_client_branches', JSON.stringify(branchesMap));
  } catch {}

  try {
    const { data } = await supabase.from('profile_permissions').select('permissions').eq('id', 1).single();
    const current = data?.permissions || {};
    const updated = {
      ...current,
      client_branches: {
        ...(current.client_branches || {}),
        ...branchesMap
      }
    };
    await supabase.from('profile_permissions').upsert({ id: 1, permissions: updated });
  } catch (err) {
    console.warn('[DB] Error saving client branches:', err);
  }
};

export interface ClientExtraConfig {
  salespersonName?: string;
  salespersonCommissionPerTon?: number;
  loadingOrderModelId?: string;
  ordemCarregamentoModelId?: string;
}

export const fetchClientExtraConfig = async (): Promise<Record<string, ClientExtraConfig>> => {
  try {
    const { data } = await supabase.from('profile_permissions').select('permissions').eq('id', 1).single();
    if (data?.permissions?.client_extra_config) {
      return data.permissions.client_extra_config;
    }
  } catch (err) {
    console.warn('[DB] Error loading client extra config:', err);
  }
  try {
    const local = localStorage.getItem('transcunha_client_extra_config');
    if (local) return JSON.parse(local);
  } catch {}
  return {};
};

export const saveClientExtraConfig = async (configMap: Record<string, ClientExtraConfig>): Promise<void> => {
  try {
    const { data } = await supabase.from('profile_permissions').select('permissions').eq('id', 1).single();
    const current = data?.permissions || {};
    const updated = {
      ...current,
      client_extra_config: configMap
    };
    await supabase.from('profile_permissions').upsert({ id: 1, permissions: updated });
  } catch (err) {
    console.warn('[DB] Error saving client extra config:', err);
  }
  try {
    localStorage.setItem('transcunha_client_extra_config', JSON.stringify(configMap));
  } catch {}
};

export async function fetchClients(): Promise<Client[]> {
  try {
    const [data, branchesMap, extraConfigMap] = await Promise.all([
      fetchAllRows('clients', 'nome_fantasia'),
      fetchClientBranches(),
      fetchClientExtraConfig()
    ]);
    return data.map(toClient).map(c => {
      const extra = extraConfigMap[c.id] || {};
      const modelId = c.loadingOrderModelId || extra.loadingOrderModelId || extra.ordemCarregamentoModelId || undefined;
      return {
        ...c,
        salespersonName: c.salespersonName || extra.salespersonName || '',
        salespersonCommissionPerTon: (c.salespersonCommissionPerTon !== undefined && c.salespersonCommissionPerTon > 0)
          ? c.salespersonCommissionPerTon
          : (extra.salespersonCommissionPerTon || 0),
        loadingOrderModelId: modelId,
        ordemCarregamentoModelId: modelId,
        secondaryCnpjs: (branchesMap[c.id] || []).map(b => ({
          ...b,
          loadingOrderModelId: b.loadingOrderModelId || b.ordemCarregamentoModelId || undefined,
          ordemCarregamentoModelId: b.loadingOrderModelId || b.ordemCarregamentoModelId || undefined,
        }))
      };
    });
  } catch (error) {
    return handleAuthError(error, []);
  }
}

export async function fetchOwners(): Promise<Owner[]> {
  try {
    const data = await fetchAllRows('owners', 'name');
    return data.map(toOwner);
  } catch (error) {
    return handleAuthError(error, []);
  }
}

export async function fetchDrivers(): Promise<Driver[]> {
  try {
    const data = await fetchAllRows('drivers', 'name');
    return data.map(toDriver);
  } catch (error) {
    return handleAuthError(error, []);
  }
}

export async function fetchVehicles(): Promise<Vehicle[]> {
  try {
    const data = await fetchAllRows('vehicles', 'plate');
    return data.map(toVehicle);
  } catch (error) {
    return handleAuthError(error, []);
  }
}

export async function fetchProducts(): Promise<Product[]> {
  try {
    const data = await fetchAllRows('products', 'name');
    return data.map(toProduct);
  } catch (error) {
    return handleAuthError(error, []);
  }
}

export function deduplicateCargos(cargosList: Cargo[]): Cargo[] {
  if (!Array.isArray(cargosList)) return [];
  const seenIds = new Set<string>();
  const seenSeqs = new Set<number>();
  const result: Cargo[] = [];

  // Sort so non-TEMP CRG cargos take priority over any legacy TEMP cargos
  const sorted = [...cargosList].sort((a, b) => {
    const aIsTemp = String(a.id).startsWith('TEMP-') ? 1 : 0;
    const bIsTemp = String(b.id).startsWith('TEMP-') ? 1 : 0;
    return aIsTemp - bIsTemp;
  });

  for (const c of sorted) {
    const id = String(c.id);
    if (seenIds.has(id)) continue;

    if (typeof c.sequenceId === 'number' && c.sequenceId > 0 && c.sequenceId < 1000000) {
      if (seenSeqs.has(c.sequenceId)) continue;
      seenSeqs.add(c.sequenceId);
    }

    seenIds.add(id);
    result.push(c);
  }

  return result;
}

export async function fetchCargos(): Promise<Cargo[]> {
  try {
    const data = await fetchAllRows('cargos', 'created_at', { ascending: false });
    return deduplicateCargos(data.map(toCargo));
  } catch (error) {
    return handleAuthError(error, []);
  }
}

export async function fetchPaginatedCargos(page: number, limit: number, filters?: { status?: string }): Promise<{ data: Cargo[], count: number }> {
  let query = supabase.from('cargos').select('*', { count: 'exact' });
  
  if (filters?.status && filters.status !== 'all') {
    query = query.eq('status', filters.status);
  } else if (filters?.status === 'all') {
    // Optionally exclude 'Fechada' by default if that's the logic
  }
  
  const from = (page - 1) * limit;
  const to = from + limit - 1;
  
  const { data, error, count } = await query.order('created_at', { ascending: false }).range(from, to);
  if (error) {
    console.error('Error fetching paginated cargos:', error);
    return { data: [], count: 0 };
  }
  return { data: deduplicateCargos((data || []).map(toCargo)), count: count || 0 };
}

export async function fetchShipments(): Promise<Shipment[]> {
  try {
    const data = await fetchAllRows('shipments', 'created_at', { ascending: false });
    return data.map(toShipment);
  } catch (error) {
    return handleAuthError(error, []);
  }
}

export async function fetchShipmentById(id: string): Promise<Shipment | null> {
  try {
    const { data, error } = await supabase.from('shipments').select('*').eq('id', id).maybeSingle();
    if (error || !data) return null;
    return toShipment(data);
  } catch (error) {
    console.error('Error fetching shipment by id:', error);
    return null;
  }
}

export async function fetchPaginatedShipments(page: number, limit: number, filters?: { status?: string }): Promise<{ data: Shipment[], count: number }> {
  let query = supabase.from('shipments').select('*', { count: 'exact' });
  
  if (filters?.status && filters.status !== 'all') {
    query = query.eq('status', filters.status);
  } else if (filters?.status === 'all') {
    query = query.neq('status', 'Cancelado').neq('status', 'Finalizado');
  }
  
  const from = (page - 1) * limit;
  const to = from + limit - 1;
  
  const { data, error, count } = await query.order('created_at', { ascending: false }).range(from, to);
  if (error) {
    console.error('Error fetching paginated shipments:', error);
    return { data: [], count: 0 };
  }
  return { data: (data || []).map(toShipment), count: count || 0 };
}

export async function fetchUsers(): Promise<User[]> {
  try {
    const data = await fetchAllRows('app_users', 'name');
    return data.map(toUser);
  } catch (error) {
    return handleAuthError(error, []);
  }
}

export async function fetchTickets(): Promise<Ticket[]> {
  let dbTickets: Ticket[] = [];
  try {
    const data = await fetchAllRows('tickets', 'created_at', { ascending: false });
    dbTickets = data.map(toTicket);
    // Cacheia tickets do banco localmente
    try {
      localStorage.setItem('transcunha_tickets_cache', JSON.stringify(dbTickets));
    } catch {}
  } catch (error) {
    console.warn('[fetchTickets] Falha ao consultar Supabase, recuperando do cache local:', error);
    try {
      const cached = localStorage.getItem('transcunha_tickets_cache');
      if (cached) {
        dbTickets = JSON.parse(cached);
      }
    } catch {}
    if (dbTickets.length === 0) {
      return handleAuthError(error, []);
    }
  }

  // AUDITORIA / RECUPERAÇÃO: Verifica se há chamados no cache de emergência que não constam no Supabase
  try {
    const emergencyRaw = localStorage.getItem('transcunha_emergency_tickets');
    if (emergencyRaw) {
      const emergencyList: Ticket[] = JSON.parse(emergencyRaw);
      const dbIds = new Set(dbTickets.map(t => t.id));
      const missingInDb = emergencyList.filter(t => !dbIds.has(t.id));

      if (missingInDb.length > 0) {
        console.log(`[fetchTickets] Encontrado(s) ${missingInDb.length} chamado(s) no cache de emergência. Sincronizando...`);
        // Junta os chamados para que nunca sumam da interface do usuário
        dbTickets = [...missingInDb, ...dbTickets];
        // Envia para o banco de dados em segundo plano
        missingInDb.forEach(t => {
          upsertTicket(t).catch(e => console.warn(`[fetchTickets] Erro ao sincronizar chamado ${t.id}:`, e));
        });
      }
    }
  } catch (syncErr) {
    console.warn('[fetchTickets] Erro ao inspecionar cache de emergência:', syncErr);
  }

  return dbTickets;
}

export async function fetchBranches(): Promise<Branch[]> {
  try {
    const data = await fetchAllRows('branches', 'name');
    return data.map(toBranch);
  } catch (error) {
    return handleAuthError(error, []);
  }
}

export async function fetchShipmentLocks(): Promise<ShipmentLock[]> {
  const { data, error } = await supabase.from('shipment_locks').select('*');
  if (error) return handleAuthError(error, []);
  return (data || []).map(row => ({
    id: row.id,
    shipmentId: row.shipment_id,
    userId: row.user_id,
    userName: row.user_name,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  }));
}

export async function fetchProfilePermissions(): Promise<ProfilePermissions | null> {
  const { data, error } = await supabase.from('profile_permissions').select('permissions').eq('id', 1).single();
  if (error) return null;
  return data?.permissions || null;
}

export async function fetchAppSettings(): Promise<{ company_logo: string | null; theme_image: string | null } | null> {
  const { data, error } = await supabase.from('app_settings').select('company_logo, theme_image').eq('id', 1).single();
  if (error) return null;
  return data || null;
}

export async function fetchRiskQueryOptions(): Promise<RiskQueryOption[]> {
  // 1. Try querying dedicated risk_query_options table
  try {
    const { data, error } = await supabase.from('risk_query_options').select('*').order('order_index', { ascending: true });
    if (!error && data && data.length > 0) {
      const options = data.map(toRiskQueryOption);
      try {
        localStorage.setItem('transcunha_risk_query_options', JSON.stringify(options));
      } catch {}
      return options;
    }
  } catch (err) {
    console.warn('[DB] Could not query risk_query_options table:', err);
  }

  // 2. Try fetching from profile_permissions (id: 1)
  try {
    const { data, error } = await supabase.from('profile_permissions').select('permissions').eq('id', 1).single();
    if (!error && data?.permissions?.risk_query_options && Array.isArray(data.permissions.risk_query_options) && data.permissions.risk_query_options.length > 0) {
      const options: RiskQueryOption[] = data.permissions.risk_query_options.map((opt: any, idx: number) => ({
        id: opt.id || `opt_${idx}`,
        name: opt.name || '',
        cost: Number(opt.cost ?? 0),
        active: opt.active !== false,
        orderIndex: opt.orderIndex !== undefined ? Number(opt.orderIndex) : idx + 1,
        description: opt.description || '',
        createdAt: opt.createdAt || '',
      }));
      try {
        localStorage.setItem('transcunha_risk_query_options', JSON.stringify(options));
      } catch {}
      return options;
    }
  } catch (err) {
    console.warn('[DB] Could not query risk_query_options from profile_permissions:', err);
  }

  // 3. Fallback to localStorage
  try {
    const saved = localStorage.getItem('transcunha_risk_query_options');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch {}

  // 4. Ultimate fallback to DEFAULT_RISK_QUERY_OPTIONS
  return DEFAULT_RISK_QUERY_OPTIONS;
}

export async function saveAllRiskQueryOptions(options: RiskQueryOption[]): Promise<void> {
  // 1. Try dedicated table
  try {
    const payload = options.map(fromRiskQueryOption);
    await supabase.from('risk_query_options').upsert(payload);
  } catch (err) {
    console.warn('[DB] Exception saving to risk_query_options table (may not exist):', err);
  }

  // 2. Save to profile_permissions (id: 1)
  try {
    const { data } = await supabase.from('profile_permissions').select('permissions').eq('id', 1).single();
    const current = data?.permissions || {};
    const updated = {
      ...current,
      risk_query_options: options
    };
    await supabase.from('profile_permissions').upsert({ id: 1, permissions: updated });
  } catch (err) {
    console.warn('[DB] Exception saving risk_query_options to profile_permissions:', err);
  }

  // 3. Save to localStorage
  try {
    localStorage.setItem('transcunha_risk_query_options', JSON.stringify(options));
  } catch {}
}

export async function upsertRiskQueryOption(option: RiskQueryOption | Omit<RiskQueryOption, 'id'>): Promise<RiskQueryOption> {
  const isUuid = 'id' in option && typeof option.id === 'string' && option.id.trim() !== '';
  const optId = isUuid ? (option as RiskQueryOption).id : (option.name.toLowerCase().replace(/[^a-z0-9]/g, '_') || crypto.randomUUID());
  
  const finalOption: RiskQueryOption = {
    ...option,
    id: optId,
    cost: Number(option.cost || 0),
    active: option.active !== false,
    orderIndex: option.orderIndex !== undefined ? Number(option.orderIndex) : 1,
    description: option.description || '',
    createdAt: ('createdAt' in option && option.createdAt) ? (option as RiskQueryOption).createdAt : new Date().toISOString(),
  };

  const current = await fetchRiskQueryOptions();
  const existingIdx = current.findIndex(o => o.id === finalOption.id || o.name.toLowerCase().trim() === finalOption.name.toLowerCase().trim());
  let nextList: RiskQueryOption[];
  if (existingIdx >= 0) {
    nextList = [...current];
    nextList[existingIdx] = finalOption;
  } else {
    nextList = [...current, finalOption];
  }

  await saveAllRiskQueryOptions(nextList);
  return finalOption;
}

export async function deleteRiskQueryOption(id: string): Promise<void> {
  const current = await fetchRiskQueryOptions();
  const nextList = current.filter(o => o.id !== id);
  await saveAllRiskQueryOptions(nextList);
}

// ─────────────────────────────────────────────
// LOADING ORDER MODELS (Modelos de Ordem de Carregamento)
// ─────────────────────────────────────────────

export async function fetchLoadingOrderModels(): Promise<LoadingOrderModel[]> {
  // 1. Try fetching from profile_permissions (id: 1)
  try {
    const { data, error } = await supabase.from('profile_permissions').select('permissions').eq('id', 1).single();
    if (!error && data?.permissions?.loading_order_models && Array.isArray(data.permissions.loading_order_models) && data.permissions.loading_order_models.length > 0) {
      let models: LoadingOrderModel[] = data.permissions.loading_order_models;
      // Garante que modelos padrão de sistema (como o Consube) estejam sempre presentes
      const missingDefaults = DEFAULT_LOADING_ORDER_MODELS.filter(def => !models.some(m => m.id === def.id));
      if (missingDefaults.length > 0) {
        models = [...models, ...missingDefaults];
      }
      try {
        localStorage.setItem('transcunha_loading_order_models', JSON.stringify(models));
      } catch {}
      return models;
    }
  } catch (err) {
    console.warn('[DB] Could not query loading_order_models from profile_permissions:', err);
  }

  // 2. Fallback to localStorage
  try {
    const saved = localStorage.getItem('transcunha_loading_order_models');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const missingDefaults = DEFAULT_LOADING_ORDER_MODELS.filter(def => !parsed.some((m: any) => m.id === def.id));
        if (missingDefaults.length > 0) {
          return [...parsed, ...missingDefaults];
        }
        return parsed;
      }
    }
  } catch {}

  // 3. Fallback to DEFAULT_LOADING_ORDER_MODELS
  return DEFAULT_LOADING_ORDER_MODELS;
}

export async function saveLoadingOrderModels(models: LoadingOrderModel[]): Promise<void> {
  // 1. Save to profile_permissions
  try {
    const { data } = await supabase.from('profile_permissions').select('permissions').eq('id', 1).single();
    const current = data?.permissions || {};
    const updated = {
      ...current,
      loading_order_models: models,
    };
    await supabase.from('profile_permissions').upsert({ id: 1, permissions: updated });
  } catch (err) {
    console.warn('[DB] Error saving loading_order_models to profile_permissions:', err);
  }

  // 2. Save to localStorage
  try {
    localStorage.setItem('transcunha_loading_order_models', JSON.stringify(models));
  } catch {}
}

// ─────────────────────────────────────────────
// UPSERT (insert or update)
// ─────────────────────────────────────────────

export async function upsertClient(client: Client): Promise<void> {
  // 1. Persist branches first so any concurrent fetch reads the updated list
  if (client.secondaryCnpjs !== undefined) {
    try {
      const branchesMap = await fetchClientBranches();
      branchesMap[client.id] = client.secondaryCnpjs;
      await saveClientBranches(branchesMap);
    } catch (err) {
      console.warn('[DB] Error persisting client branches in upsertClient:', err);
    }
  }

  // 2. Persist extra config fallback
  try {
    const extraConfigMap = await fetchClientExtraConfig();
    const modelId = client.loadingOrderModelId || client.ordemCarregamentoModelId || '';
    extraConfigMap[client.id] = {
      salespersonName: client.salespersonName || '',
      salespersonCommissionPerTon: client.salespersonCommissionPerTon || 0,
      loadingOrderModelId: modelId,
      ordemCarregamentoModelId: modelId,
    };
    await saveClientExtraConfig(extraConfigMap);
  } catch (err) {
    console.warn('[DB] Error persisting client extra config in upsertClient:', err);
  }

  // 3. Upsert client row in Supabase
  const payload = fromClient(client);
  let upsertError: any = null;
  try {
    const { error } = await supabase.from('clients').upsert(payload);
    if (error) {
      upsertError = error;
      const safePayload = { ...payload };
      delete (safePayload as any).salesperson_name;
      delete (safePayload as any).salesperson_commission_per_ton;
      delete (safePayload as any).loading_order_model_id;
      const { error: retryError } = await supabase.from('clients').upsert(safePayload);
      if (retryError) throw retryError;
    }
  } catch (err) {
    if (upsertError) {
      const safePayload = { ...payload };
      delete (safePayload as any).salesperson_name;
      delete (safePayload as any).salesperson_commission_per_ton;
      delete (safePayload as any).loading_order_model_id;
      const { error: retryError } = await supabase.from('clients').upsert(safePayload);
      if (retryError) throw retryError;
    } else {
      throw err;
    }
  }
}

export async function upsertOwner(owner: Owner): Promise<void> {
  const { error } = await supabase.from('owners').upsert(fromOwner(owner));
  if (error) throw error;
}

export async function upsertDriver(driver: Driver): Promise<void> {
  const { error } = await supabase.from('drivers').upsert(fromDriver(driver));
  if (error) throw error;
}

export async function upsertVehicle(vehicle: Vehicle): Promise<void> {
  const { error } = await supabase.from('vehicles').upsert(fromVehicle(vehicle));
  if (error) throw error;
}

export async function upsertCargo(cargo: Cargo): Promise<void> {
  if (!cargo.id || cargo.id.startsWith('TEMP-')) {
    await insertCargo(cargo);
    return;
  }
  const payload = fromCargo(cargo);
  console.log('[upsertCargo] Saving cargo:', cargo.id, payload);
  const result = await supabase.from('cargos').update(payload).eq('id', cargo.id);
  if (result.error) {
    console.error('[upsertCargo] Error:', result.error);
    throw result.error;
  }
  console.log('[upsertCargo] Success for cargo:', cargo.id);
  broadcastCargoChange({
    action: 'update',
    cargoId: cargo.id,
    cargo
  });
}

async function executeShipmentOperationWithFallback(
  operation: (payload: any) => PromiseLike<{ error: any }>,
  initialPayload: any
): Promise<void> {
  let currentPayload = { ...initialPayload };
  let attempts = 0;
  const maxAttempts = 25;

  while (attempts < maxAttempts) {
    attempts++;
    const { error } = await operation(currentPayload);
    if (!error) return;

    const msg = error?.message || '';
    // Catch "Could not find the 'xyz' column of 'shipments' in the schema cache"
    const match = msg.match(/Could not find the '([^']+)' column of 'shipments'/i) ||
                  msg.match(/column "?([^"'\s]+)"? of relation "shipments" does not exist/i);

    if (match && match[1] && currentPayload[match[1]] !== undefined) {
      const missingCol = match[1];
      console.warn(`[upsertShipment fallback] Coluna '${missingCol}' ausente no schema de shipments. Movendo para documents e tentando novamente...`);
      currentPayload = { ...currentPayload };
      if (currentPayload.documents && typeof currentPayload.documents === 'object') {
        currentPayload.documents = {
          ...currentPayload.documents,
          [missingCol]: currentPayload[missingCol]
        };
      }
      delete currentPayload[missingCol];
      continue;
    }

    // If it's a different error or column not found in payload
    console.error('[Shipment operation] Error:', error);
    throw error;
  }
}

export async function upsertShipment(shipment: Shipment): Promise<void> {
  const payload = fromShipment(shipment);
  if (shipment.id) {
    await executeShipmentOperationWithFallback(
      (p) => supabase.from('shipments').update(p).eq('id', shipment.id),
      payload
    );
    broadcastShipmentChange({
      action: 'update',
      shipmentId: shipment.id,
      status: shipment.status,
      shipment
    });
  } else {
    await executeShipmentOperationWithFallback(
      (p) => supabase.from('shipments').insert(p),
      payload
    );
    if (shipment.id) {
      broadcastShipmentChange({
        action: 'create',
        shipmentId: shipment.id,
        status: shipment.status,
        shipment
      });
    }
  }
}

/**
 * Backfill: lê os arquivos CT-e, NF-e e MDF-e já armazenados no Storage
 * para embarques antigos que não têm esses números registrados em `documents`.
 * Executa silenciosamente em background — erros individuais são ignorados.
 */
export async function backfillShipmentFiscalNumbers(
  onProgress?: (done: number, total: number) => void,
  forceAll: boolean = false
): Promise<{ updated: number; skipped: number }> {
  // Busca apenas 'id' e 'documents' para evitar erro caso colunas customizadas não existam no SQL
  const { data: rows, error } = await supabase
    .from('shipments')
    .select('id, status, documents')
    .not('documents', 'is', null);

  if (error || !rows) {
    console.warn('[backfill] Falha ao buscar embarques:', error);
    return { updated: 0, skipped: 0 };
  }

  // Filtra embarques que possuem anexos de documentos
  const candidates = rows.filter((row: any) => {
    const docs = row.documents || {};
    const keys = Object.keys(docs);
    const hasFiles = keys.some((key) => Array.isArray(docs[key]) && docs[key].length > 0);
    if (!hasFiles) return false;
    if (forceAll) return true;
    const hasNum = docs.cte_number || row.cte_number;
    const hasDate = docs.cte_emission_date || row.cte_emission_date;
    return !hasNum || !hasDate;
  });

  let updated = 0;
  let skipped = 0;
  const total = candidates.length;

  console.log(`[backfill] ${total} embarques candidatos para backfill de documentos fiscais.`);

  for (let i = 0; i < candidates.length; i++) {
    const row = candidates[i];
    const docs = row.documents || {};

    const urlMap: { [key: string]: string[] } = {};
    for (const key of Object.keys(docs)) {
      if (Array.isArray(docs[key])) urlMap[key] = docs[key];
    }

    try {
      const extracted = await extractFiscalDocNumbersFromUrls(urlMap);
      const canExtractCte = isCteApplicableForStatus(row.status);
      if (!canExtractCte) {
        delete extracted.cteNumber;
        delete extracted.cteEmissionDate;
      }
      const hasAny = extracted.cteNumber || extracted.cteEmissionDate || extracted.nfeNumber || extracted.mdfeNumber || extracted.ciotNumber;

      if (hasAny) {
        const updatedDocs = {
          ...docs,
          ...(extracted.cteNumber ? { cte_number: extracted.cteNumber } : {}),
          ...(extracted.cteEmissionDate ? { cte_emission_date: extracted.cteEmissionDate } : {}),
          ...(extracted.nfeNumber ? { nfe_number: extracted.nfeNumber } : {}),
          ...(extracted.mdfeNumber ? { mdfe_number: extracted.mdfeNumber } : {}),
          ...(extracted.ciotNumber ? { ciot_number: extracted.ciotNumber, ciot: extracted.ciotNumber } : {}),
        };

        const updatePayload: any = { documents: updatedDocs };

        const { error: updateError } = await supabase
          .from('shipments')
          .update(updatePayload)
          .eq('id', row.id);

        if (!updateError) {
          console.log(`[backfill] ✅ ${row.id}: CT-e=${extracted.cteNumber || '-'}, CIOT=${extracted.ciotNumber || '-'}, Emissão=${extracted.cteEmissionDate || '-'}`);
          updated++;
        } else {
          console.warn(`[backfill] ⚠️ Falha ao atualizar ${row.id}:`, updateError.message);
          skipped++;
        }
      } else {
        skipped++;
      }
    } catch (e) {
      console.warn(`[backfill] ⚠️ Erro ao processar ${row.id}:`, e);
      skipped++;
    }

    onProgress?.(i + 1, total);
  }

  console.log(`[backfill] Concluído: ${updated} atualizados, ${skipped} ignorados.`);
  return { updated, skipped };
}

/**
 * Aplica e persiste o cálculo padronizado de adiantamento e saldo de frete
 * para todos os embarques que estão em 'Ag. Adiantamento' ou status anteriores.
 */
export async function backfillAdvanceAndBalanceCalculations(): Promise<{ updated: number; skipped: number }> {
  try {
    const [shipmentsData, cargosData] = await Promise.all([
      fetchAllRows('shipments', 'created_at', { ascending: false }),
      fetchAllRows('cargos', 'created_at', { ascending: false }),
    ]);

    const shipments = (shipmentsData || []).map(toShipment);
    const cargoMap = new Map((cargosData || []).map(toCargo).map(c => [c.id, c]));

    let updated = 0;
    let skipped = 0;

    for (const s of shipments) {
      if (!ADVANCE_ELIGIBLE_STATUSES.includes(s.status)) {
        continue;
      }

      const cargo = cargoMap.get(s.cargoId);
      const rate = s.driverFreightRateSnapshot || cargo?.driverFreightValuePerTon || 0;
      const tonnage = s.shipmentTonnage || cargo?.totalVolume || 0;
      const totalFreight = s.driverFreightValue || (rate * tonnage);
      const toll = s.tollValue || 0;
      const advPct = s.advancePercentage !== undefined ? s.advancePercentage : 70;

      const isPfShipment = (s.driverFreightType === 'PF' || s.anttModality === 'TAC');
      const calc = calculateAdvanceAndBalance({
        driverFreightValue: totalFreight,
        driverFreightRate: rate,
        tonnage,
        tollValue: toll,
        advancePercentage: advPct,
        driverFreightType: isPfShipment ? 'PF' : 'PJ',
      });

      const needsUpdate = 
        s.advancePercentage !== calc.advancePercentage ||
        Math.abs((s.advanceValue || 0) - calc.advanceInAccountValue) > 0.01 ||
        Math.abs((s.balanceToReceiveValue || 0) - calc.balanceToReceiveValue) > 0.01;

      if (needsUpdate) {
        const updatedShipment: Shipment = {
          ...s,
          advancePercentage: calc.advancePercentage,
          advanceValue: calc.advanceInAccountValue,
          tollValue: toll,
          balanceToReceiveValue: calc.balanceToReceiveValue,
        };

        try {
          await upsertShipment(updatedShipment);
          updated++;
        } catch (err) {
          console.warn(`[advanceBackfill] Falha ao atualizar embarque ${s.id}:`, err);
          skipped++;
        }
      } else {
        skipped++;
      }
    }

    console.log(`[advanceBackfill] Concluído: ${updated} embarques atualizados com novo cálculo de adiantamento/saldo.`);
    return { updated, skipped };
  } catch (err) {
    console.error('[advanceBackfill] Erro geral ao executar backfill de adiantamento:', err);
    return { updated: 0, skipped: 0 };
  }
}


export async function upsertUser(user: User): Promise<void> {
  const { error } = await supabase.from('app_users').upsert(fromUser(user));
  if (error) throw error;
}

export async function upsertBranch(branch: Branch): Promise<void> {
  const { error } = await supabase.from('branches').upsert(fromBranch(branch));
  if (error) throw error;
}

export async function insertUniqueTicket(ticketData: Omit<Ticket, 'id' | 'history' | 'createdAt'> & { id?: string; createdAt?: string; history?: any[] }): Promise<Ticket> {
  // 1. Inspeciona tickets existentes no Supabase para garantir sequência única absoluta
  let maxSeq = 0;
  try {
    const { data: dbTickets } = await supabase.from('tickets').select('id');
    if (dbTickets && Array.isArray(dbTickets)) {
      dbTickets.forEach(r => {
        const num = parseInt(String(r.id).replace(/\D/g, ''), 10);
        if (!isNaN(num) && num > maxSeq) maxSeq = num;
      });
    }
  } catch (err) {
    console.warn('[insertUniqueTicket] Aviso ao consultar tickets existentes no banco:', err);
  }

  // Também verifica cache de emergência local
  try {
    const cachedStr = localStorage.getItem('transcunha_emergency_tickets');
    if (cachedStr) {
      const cached = JSON.parse(cachedStr);
      if (Array.isArray(cached)) {
        cached.forEach((t: any) => {
          const num = parseInt(String(t.id).replace(/\D/g, ''), 10);
          if (!isNaN(num) && num > maxSeq) maxSeq = num;
        });
      }
    }
  } catch {}

  let candidateSeq = Math.max(maxSeq + 1, 1);
  const nowIso = ticketData.createdAt || new Date().toISOString();

  // Retry com incremento progressivo para garantir que NENHUM chamado sobrescreva outro
  for (let attempt = 0; attempt < 5; attempt++) {
    const generatedId = `TCK-${String(candidateSeq).padStart(3, '0')}`;
    const newTicket: Ticket = {
      ...ticketData,
      id: generatedId,
      createdAt: nowIso,
      history: ticketData.history && ticketData.history.length > 0 ? ticketData.history : [{
        userId: ticketData.createdById,
        timestamp: nowIso,
        comment: 'Chamado aberto e registrado na auditoria.'
      }]
    };

    const payload = fromTicket(newTicket);

    // Salva cópia de emergência local ANTES da chamada de rede
    try {
      const emergencyRaw = localStorage.getItem('transcunha_emergency_tickets');
      const emergencyList: Ticket[] = emergencyRaw ? JSON.parse(emergencyRaw) : [];
      const updatedEmergency = [newTicket, ...emergencyList.filter(e => e.id !== newTicket.id)];
      localStorage.setItem('transcunha_emergency_tickets', JSON.stringify(updatedEmergency));
    } catch {}

    const { error } = await supabase.from('tickets').insert(payload);
    if (!error) {
      console.log(`[insertUniqueTicket] Chamado ${generatedId} gravado com sucesso no Supabase.`);
      // Atualiza também o cache geral
      try {
        const cacheRaw = localStorage.getItem('transcunha_tickets_cache');
        const list: Ticket[] = cacheRaw ? JSON.parse(cacheRaw) : [];
        localStorage.setItem('transcunha_tickets_cache', JSON.stringify([newTicket, ...list.filter(t => t.id !== newTicket.id)]));
      } catch {}

      // Dispara broadcast instantâneo WebSocket para todos os usuários
      broadcastTicketChange({
        action: 'create',
        ticketId: generatedId,
        ticket: newTicket
      });

      return newTicket;
    }

    // Se houve conflito de ID (já existente), tenta próximo número
    if (error.code === '23505' || error.message?.includes('duplicate key') || error.message?.includes('already exists')) {
      console.warn(`[insertUniqueTicket] Conflito de ID ${generatedId}. Incrementando número para tentativa ${attempt + 1}...`);
      candidateSeq++;
      continue;
    }

    console.error('[insertUniqueTicket] Erro crítico ao inserir chamado:', error);
    throw error;
  }

  throw new Error('Não foi possível gerar um identificador único para o chamado após 5 tentativas.');
}

export async function upsertTicket(ticket: Ticket): Promise<void> {
  const payload = fromTicket(ticket);
  
  // Atualiza cache de emergência local imediatamente
  try {
    const emergencyRaw = localStorage.getItem('transcunha_emergency_tickets');
    const emergencyList: Ticket[] = emergencyRaw ? JSON.parse(emergencyRaw) : [];
    const updatedEmergency = [ticket, ...emergencyList.filter(e => e.id !== ticket.id)];
    localStorage.setItem('transcunha_emergency_tickets', JSON.stringify(updatedEmergency));

    const cacheRaw = localStorage.getItem('transcunha_tickets_cache');
    const list: Ticket[] = cacheRaw ? JSON.parse(cacheRaw) : [];
    localStorage.setItem('transcunha_tickets_cache', JSON.stringify([ticket, ...list.filter(t => t.id !== ticket.id)]));
  } catch {}

  const { error } = await supabase.from('tickets').upsert(payload);
  if (error) {
    console.error('[upsertTicket] Error details:', error);
    throw error;
  }

  // Notifica instantaneamente todos os usuários e abas abertas
  broadcastTicketChange({
    action: 'update',
    ticketId: ticket.id,
    status: ticket.status,
    ticket
  });
}

export async function deleteTicket(id: string): Promise<void> {
  try {
    // Remove do cache local
    const emergencyRaw = localStorage.getItem('transcunha_emergency_tickets');
    if (emergencyRaw) {
      const emergencyList: Ticket[] = JSON.parse(emergencyRaw);
      localStorage.setItem('transcunha_emergency_tickets', JSON.stringify(emergencyList.filter(e => e.id !== id)));
    }
    const cacheRaw = localStorage.getItem('transcunha_tickets_cache');
    if (cacheRaw) {
      const list: Ticket[] = JSON.parse(cacheRaw);
      localStorage.setItem('transcunha_tickets_cache', JSON.stringify(list.filter(t => t.id !== id)));
    }
  } catch {}

  const { error } = await supabase.from('tickets').delete().eq('id', id);
  if (error) {
    console.error('[deleteTicket] Error details:', error);
    throw error;
  }

  broadcastTicketChange({
    action: 'delete',
    ticketId: id
  });
}

export async function insertCargo(cargo: Cargo | Omit<Cargo, 'id'>): Promise<Cargo> {
  let sequenceId = (cargo as any).sequenceId;
  let id = (cargo as any).id;

  if (!sequenceId || typeof sequenceId !== 'number' || sequenceId <= 0 || sequenceId >= 1000000) {
    try {
      const { data } = await supabase
        .from('cargos')
        .select('sequence_id')
        .lt('sequence_id', 1000000)
        .order('sequence_id', { ascending: false })
        .limit(1);
      const dbMaxSeq = data?.[0]?.sequence_id ? Number(data[0].sequence_id) : 100;
      sequenceId = Math.max(dbMaxSeq + 1, 101);
    } catch (err) {
      console.warn('[insertCargo] Error querying max sequence_id:', err);
      sequenceId = 101;
    }
  }

  if (!id || (typeof id === 'string' && id.startsWith('TEMP-'))) {
    id = `CRG-${sequenceId}`;
  }

  const cargoWithId = {
    ...cargo,
    id,
    sequenceId
  } as Cargo;

  const payload = fromCargo(cargoWithId);
  payload.id = id;
  payload.sequence_id = sequenceId;

  console.log('[insertCargo] Upserting new cargo:', payload.id, 'sequence_id:', payload.sequence_id);
  const { data, error } = await supabase.from('cargos').upsert(payload, { onConflict: 'id' }).select().single();
  if (error) {
    console.error('[insertCargo] Error:', error);
    throw error;
  }
  console.log('[insertCargo] Success for cargo:', data.id);
  const createdCargo = toCargo(data);
  broadcastCargoChange({
    action: 'create',
    cargoId: createdCargo.id,
    cargo: createdCargo
  });
  return createdCargo;
}

export async function insertShipment(shipment: Shipment): Promise<void> {
  const payload = fromShipment(shipment);
  await executeShipmentOperationWithFallback(
    (p) => supabase.from('shipments').insert(p),
    payload
  );
  if (shipment.id) {
    broadcastShipmentChange({
      action: 'create',
      shipmentId: shipment.id,
      status: shipment.status,
      shipment
    });
  }
}

export async function saveProfilePermissions(permissions: ProfilePermissions): Promise<void> {
  const { error } = await supabase.from('profile_permissions').upsert({ id: 1, permissions });
  if (error) throw error;
}

export async function saveAppSettings(settings: { company_logo?: string | null; theme_image?: string | null }): Promise<void> {
  const { error } = await supabase.from('app_settings').update(settings).eq('id', 1);
  if (error) throw error;
}

// ─────────────────────────────────────────────
// BULK UPSERT (used during shipment creation)
// ─────────────────────────────────────────────

export async function upsertManyDrivers(drivers: Driver[]): Promise<void> {
  if (drivers.length === 0) return;
  const { error } = await supabase.from('drivers').upsert(drivers.map(fromDriver));
  if (error) throw error;
}

export async function upsertManyVehicles(vehicles: Vehicle[]): Promise<void> {
  if (vehicles.length === 0) return;
  const { error } = await supabase.from('vehicles').upsert(vehicles.map(fromVehicle));
  if (error) throw error;
}

export async function upsertManyShipments(shipments: Shipment[]): Promise<void> {
  if (shipments.length === 0) return;
  const { error } = await supabase.from('shipments').upsert(shipments.map(fromShipment));
  if (error) throw error;
  for (const s of shipments) {
    broadcastShipmentChange({
      action: 'update',
      shipmentId: s.id,
      status: s.status,
      shipment: s
    });
  }
}

export async function upsertManyCargos(cargos: Cargo[]): Promise<void> {
  if (cargos.length === 0) return;
  const { error } = await supabase.from('cargos').upsert(cargos.map(fromCargo));
  if (error) throw error;
}

// ─────────────────────────────────────────────
// STORAGE (Attachments)
// ─────────────────────────────────────────────

export async function uploadShipmentAttachment(shipmentId: string, docType: string, file: File): Promise<string> {
  // To avoid naming collisions and special character issues, we create a safe filename
  const safeDocType = docType.replace(/[^a-zA-Z0-9_-]/g, '_');
  const safeFileName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
  const filePath = `${shipmentId}/${safeDocType}_${Date.now()}_${safeFileName}`;
  
  const { data, error } = await supabase.storage
    .from('shipment_attachments')
    .upload(filePath, file, { upsert: true });

  if (error) {
    console.error(`[uploadShipmentAttachment] Error uploading ${docType} for shipment ${shipmentId}:`, error);
    throw error;
  }
  
  return data.path;
}

export function getShipmentAttachmentUrl(path: string): string {
  const { data } = supabase.storage
    .from('shipment_attachments')
    .getPublicUrl(path);
    
  return data.publicUrl;
}

export async function deleteShipmentAttachmentFromStorage(url: string): Promise<void> {
  if (!url) return;
  try {
    let path = url;
    if (url.includes('/shipment_attachments/')) {
      const parts = url.split('/shipment_attachments/');
      path = decodeURIComponent(parts[1]);
    } else {
      path = decodeURIComponent(url);
    }
    
    // Clean query parameters if present
    path = path.split('?')[0];

    const { error } = await supabase.storage
      .from('shipment_attachments')
      .remove([path]);

    if (error) {
      console.warn(`[deleteShipmentAttachmentFromStorage] Supabase storage deletion warning for path ${path}:`, error);
    }
  } catch (err) {
    console.warn('[deleteShipmentAttachmentFromStorage] Exception when attempting storage deletion:', err);
  }
}

// ─────────────────────────────────────────────
// DELETE
// ─────────────────────────────────────────────

export async function deleteCargo(id: string): Promise<void> {
  const { error } = await supabase.from('cargos').delete().eq('id', id);
  if (error) throw error;
  broadcastCargoChange({
    action: 'delete',
    cargoId: id
  });
}

export async function deleteShipment(id: string): Promise<void> {
  const { error } = await supabase.from('shipments').delete().eq('id', id);
  if (error) throw error;
  broadcastShipmentChange({
    action: 'delete',
    shipmentId: id
  });
}

export async function deleteUser(id: string): Promise<void> {
  const { error } = await supabase.from('app_users').delete().eq('id', id);
  if (error) throw error;
}

export async function deleteBranch(id: string): Promise<void> {
  const { error } = await supabase.from('branches').delete().eq('id', id);
  if (error) throw error;
}

export async function upsertProduct(product: Product): Promise<void> {
  const { error } = await supabase.from('products').upsert({
    id: product.id,
    name: product.name,
    unit: product.unit,
    requires_risk_management: product.requiresRiskManagement !== false, // default true
  });
  if (error) throw error;
}

export async function deleteClient(id: string): Promise<void> {
  const { error } = await supabase.from('clients').delete().eq('id', id);
  if (error) throw error;
  try {
    const branchesMap = await fetchClientBranches();
    if (branchesMap[id]) {
      delete branchesMap[id];
      await saveClientBranches(branchesMap);
    }
  } catch (err) {
    console.warn('[DB] Error removing client branches in deleteClient:', err);
  }
}

export async function mergeClients(
  targetClientId: string,
  sourceClientIds: string[],
  clients?: Client[],
  cargos?: Cargo[],
  freightOffers?: FreightOffer[],
  users?: User[]
): Promise<{
  mergedClient: Client;
  updatedClients: Client[];
  updatedCargos: Cargo[];
  updatedOffers: FreightOffer[];
  updatedUsers: User[];
}> {
  const allClients = (clients && clients.length > 0) ? clients : await fetchClients();
  const allCargos = (cargos && cargos.length > 0) ? cargos : await fetchCargos();
  const allOffers = freightOffers ? freightOffers : await fetchFreightOffers();
  const allUsers = users ? users : await fetchUsers();

  const targetClient = allClients.find(c => c.id === targetClientId);
  if (!targetClient) throw new Error(`Cliente principal (${targetClientId}) não encontrado`);

  const sourceClients = allClients.filter(c => sourceClientIds.includes(c.id) && c.id !== targetClientId);
  if (sourceClients.length === 0) throw new Error('Nenhum cliente selecionado para unificação');

  // 1. Gather all secondary CNPJs from source clients and from existing targetClient
  const currentSecondaries = targetClient.secondaryCnpjs ? [...targetClient.secondaryCnpjs] : [];
  
  for (const src of sourceClients) {
    // Add the source client itself as a secondary CNPJ if its CNPJ is not yet registered
    const exists = currentSecondaries.some(b => b.cnpj.replace(/\D/g, '') === src.cnpj.replace(/\D/g, '')) ||
                   targetClient.cnpj.replace(/\D/g, '') === src.cnpj.replace(/\D/g, '');
    if (!exists && src.cnpj) {
      currentSecondaries.push({
        id: `branch_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        cnpj: src.cnpj,
        razaoSocial: src.razaoSocial,
        nomeFantasia: src.nomeFantasia || `${src.razaoSocial} (${src.city || 'Filial'})`,
        city: src.city,
        state: src.state,
        address: src.address,
        phone: src.phone,
        email: src.email,
        paymentMethod: src.paymentMethod,
        paymentTerm: src.paymentTerm,
        requiresExternalOrder: src.requiresExternalOrder,
        requiresScheduling: src.requiresScheduling,
      });
    }

    // Also add any secondary CNPJs that the source client had
    if (src.secondaryCnpjs && src.secondaryCnpjs.length > 0) {
      for (const sec of src.secondaryCnpjs) {
        const secExists = currentSecondaries.some(b => b.cnpj.replace(/\D/g, '') === sec.cnpj.replace(/\D/g, '')) ||
                          targetClient.cnpj.replace(/\D/g, '') === sec.cnpj.replace(/\D/g, '');
        if (!secExists && sec.cnpj) {
          currentSecondaries.push(sec);
        }
      }
    }
  }

  const updatedTargetClient: Client = {
    ...targetClient,
    secondaryCnpjs: currentSecondaries
  };

  // 2. Re-link Cargos belonging to source clients
  const updatedCargos: Cargo[] = [];
  for (const cargo of allCargos) {
    if (sourceClientIds.includes(cargo.clientId)) {
      const src = sourceClients.find(c => c.id === cargo.clientId);
      const updatedCargo: Cargo = {
        ...cargo,
        clientId: targetClientId,
        clientCnpj: cargo.clientCnpj || src?.cnpj || undefined,
        history: [
          ...(cargo.history || []),
          {
            id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            userId: 'system',
            timestamp: new Date().toISOString(),
            description: `Cliente tomador unificado: ${src?.nomeFantasia || cargo.clientId} -> ${targetClient.nomeFantasia} (${targetClientId}).`
          }
        ]
      };
      await upsertCargo(updatedCargo);
      updatedCargos.push(updatedCargo);
    }
  }

  // 3. Re-link Freight Offers belonging to source clients
  const updatedOffers: FreightOffer[] = [];
  for (const offer of allOffers) {
    if (sourceClientIds.includes(offer.clientId)) {
      const src = sourceClients.find(c => c.id === offer.clientId);
      const updatedOffer: FreightOffer = {
        ...offer,
        clientId: targetClientId,
        clientCnpj: offer.clientCnpj || src?.cnpj || undefined,
      };
      await upsertFreightOffer(updatedOffer);
      updatedOffers.push(updatedOffer);
    }
  }

  // 4. Re-link Users linked to source clients
  const updatedUsers: User[] = [];
  for (const user of allUsers) {
    if (user.clientId && sourceClientIds.includes(user.clientId)) {
      const updatedUser: User = {
        ...user,
        clientId: targetClientId
      };
      await upsertUser(updatedUser);
      updatedUsers.push(updatedUser);
    }
  }

  // 5. Delete source clients
  for (const src of sourceClients) {
    await deleteClient(src.id);
  }

  // 6. Save target client with merged CNPJs
  await upsertClient(updatedTargetClient);

  const updatedClients = allClients
    .filter(c => !sourceClientIds.includes(c.id) || c.id === targetClientId)
    .map(c => c.id === targetClientId ? updatedTargetClient : c);

  return {
    mergedClient: updatedTargetClient,
    updatedClients,
    updatedCargos,
    updatedOffers,
    updatedUsers
  };
}

export async function deleteProduct(id: string): Promise<void> {
  const { error } = await supabase.from('products').delete().eq('id', id);
  if (error) throw error;
}

export async function deleteFreightOffer(id: string): Promise<void> {
  const { error } = await supabase.from('freight_offers').delete().eq('id', id);
  if (error) throw error;
}

// ─────────────────────────────────────────────
// LOCKING
// ─────────────────────────────────────────────

export async function tryAcquireShipmentLock(shipmentId: string, userId: string, userName: string): Promise<{ success: boolean; lockedBy?: string }> {
  const { data, error } = await supabase.rpc('acquire_shipment_lock', {
    p_shipment_id: shipmentId,
    p_user_id: userId,
    p_user_name: userName
  });

  if (error) {
    console.error('Error in acquire_shipment_lock:', error);
    throw error;
  }

  return {
    success: data.success,
    lockedBy: data.locked_by
  };
}

export async function releaseShipmentLock(shipmentId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('shipment_locks')
    .delete()
    .eq('shipment_id', shipmentId)
    .eq('user_id', userId);

  if (error) {
    console.error('Error in releaseShipmentLock:', error);
    throw error;
  }
}

// ─────────────────────────────────────────────
// RDO NACIONAL: ANÁLISE CADASTRAL & PARECERES
// ─────────────────────────────────────────────

export const toRdoRequest = (row: any): RdoRequestRecord => ({
  id: row.id,
  codigo: Number(row.codigo || 0),
  shipmentId: row.shipment_id || undefined,
  driverId: row.driver_id || undefined,
  cpf: row.cpf || '',
  nome: row.nome || '',
  nomeDaMae: row.nome_da_mae || undefined,
  dataDeNascimento: row.data_nascimento || undefined,
  documentoDoProprietario: row.documento_proprietario || undefined,
  nomeDoProprietario: row.nome_proprietario || undefined,
  placaDoCavalo: row.placa_cavalo || undefined,
  status: (row.status as any) || 'pendente',
  parecer: row.parecer !== null && row.parecer !== undefined ? Number(row.parecer) : undefined,
  observacao: row.observacao || undefined,
  cnhUrl: row.cnh_url || undefined,
  createdAt: row.created_at || new Date().toISOString(),
  updatedAt: row.updated_at || undefined,
  concludedAt: row.concluded_at || undefined,
  createdById: row.created_by || undefined,
  createdByName: row.created_by_name || undefined,
  rawResponse: row.raw_response || undefined,
  rawWebhookPayload: row.raw_webhook_payload || undefined,
});

export const fromRdoRequest = (req: RdoRequestRecord): any => ({
  id: req.id,
  codigo: req.codigo,
  shipment_id: req.shipmentId || null,
  driver_id: req.driverId || null,
  cpf: req.cpf,
  nome: req.nome,
  nome_da_mae: req.nomeDaMae || null,
  data_nascimento: req.dataDeNascimento || null,
  documento_proprietario: req.documentoDoProprietario || null,
  nome_proprietario: req.nomeDoProprietario || null,
  placa_cavalo: req.placaDoCavalo || null,
  status: req.status,
  parecer: req.parecer !== undefined && req.parecer !== null ? req.parecer : null,
  observacao: req.observacao || null,
  cnh_url: req.cnhUrl || null,
  created_at: req.createdAt,
  updated_at: req.updatedAt || new Date().toISOString(),
  concluded_at: req.concludedAt || null,
  created_by: req.createdById || null,
  created_by_name: req.createdByName || null,
  raw_response: req.rawResponse || null,
  raw_webhook_payload: req.rawWebhookPayload || null,
});

const DEFAULT_RDO_CONFIG: RdoConfig = {
  apiToken: '',
  callbackToken: '',
  apiUrl: 'https://painel.mrbsolucoes.com.br',
  clientName: 'TRANSCUNHA TRANSPORTES',
  enabled: true,
  autoApproveInRisk: true,
};

export async function fetchRdoConfig(): Promise<RdoConfig> {
  // 1. Try profile_permissions (id: 1)
  try {
    const { data, error } = await supabase.from('profile_permissions').select('permissions').eq('id', 1).single();
    if (!error && data?.permissions?.rdo_config) {
      const config = { ...DEFAULT_RDO_CONFIG, ...data.permissions.rdo_config };
      try {
        localStorage.setItem('transcunha_rdo_config', JSON.stringify(config));
      } catch {}
      return config;
    }
  } catch (err) {
    console.warn('[DB] Could not fetch rdo_config from profile_permissions:', err);
  }

  // 2. Fallback to localStorage
  try {
    const saved = localStorage.getItem('transcunha_rdo_config');
    if (saved) {
      return { ...DEFAULT_RDO_CONFIG, ...JSON.parse(saved) };
    }
  } catch {}

  return DEFAULT_RDO_CONFIG;
}

export async function saveRdoConfig(config: RdoConfig): Promise<void> {
  // 1. Save to profile_permissions (id: 1)
  try {
    const { data } = await supabase.from('profile_permissions').select('permissions').eq('id', 1).single();
    const current = data?.permissions || {};
    const updated = {
      ...current,
      rdo_config: config,
    };
    await supabase.from('profile_permissions').upsert({ id: 1, permissions: updated });
  } catch (err) {
    console.warn('[DB] Error saving rdo_config to profile_permissions:', err);
  }

  // 2. Save to localStorage
  try {
    localStorage.setItem('transcunha_rdo_config', JSON.stringify(config));
  } catch {}
}

export async function fetchRdoRequests(): Promise<RdoRequestRecord[]> {
  try {
    const { data, error } = await supabase
      .from('rdo_requests')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data) {
      const records = data.map(toRdoRequest);
      try {
        localStorage.setItem('transcunha_rdo_requests', JSON.stringify(records));
      } catch {}
      return records;
    }
  } catch (err) {
    console.warn('[DB] Could not fetch rdo_requests table:', err);
  }

  // Fallback to localStorage
  try {
    const saved = localStorage.getItem('transcunha_rdo_requests');
    if (saved) {
      return JSON.parse(saved);
    }
  } catch {}

  return [];
}

export async function upsertRdoRequest(record: RdoRequestRecord): Promise<void> {
  try {
    const payload = fromRdoRequest(record);
    const { error } = await supabase.from('rdo_requests').upsert(payload);
    if (error) {
      console.warn('[DB] Warning upserting rdo_requests:', error);
    }
  } catch (err) {
    console.warn('[DB] Exception upserting rdo_requests:', err);
  }

  // Update local storage
  try {
    const current = await fetchRdoRequests();
    const idx = current.findIndex(r => r.id === record.id);
    let nextList: RdoRequestRecord[];
    if (idx >= 0) {
      nextList = [...current];
      nextList[idx] = record;
    } else {
      nextList = [record, ...current];
    }
    localStorage.setItem('transcunha_rdo_requests', JSON.stringify(nextList));
  } catch {}

  // Broadcast realtime update
  broadcastRdoChange({
    action: record.parecer !== undefined ? 'parecer_received' : 'update',
    idSolicitacao: record.id,
    codigo: record.codigo,
    cpf: record.cpf,
    status: record.status,
    parecer: record.parecer,
    observacao: record.observacao,
    shipmentId: record.shipmentId,
  });
}

export async function updateRdoRequestParecer(
  idSolicitacao: string, 
  parecer: 0 | 1, 
  observacao?: string | null, 
  rawPayload?: any
): Promise<RdoRequestRecord | null> {
  const currentRequests = await fetchRdoRequests();
  const existing = currentRequests.find(r => r.id === idSolicitacao || (rawPayload?.cpf && r.cpf.replace(/\D/g, '') === String(rawPayload.cpf).replace(/\D/g, '')));

  const updatedRecord: RdoRequestRecord = existing ? {
    ...existing,
    parecer,
    status: parecer === 0 ? 'aprovado' : 'consta_informacao',
    observacao: observacao || undefined,
    concludedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    rawWebhookPayload: rawPayload,
  } : {
    id: idSolicitacao,
    codigo: 0,
    cpf: rawPayload?.cpf || '',
    nome: rawPayload?.nome || '',
    documentoDoProprietario: rawPayload?.documentoDoProprietario,
    nomeDoProprietario: rawPayload?.nomeDoProprietario,
    placaDoCavalo: rawPayload?.placa,
    status: parecer === 0 ? 'aprovado' : 'consta_informacao',
    parecer,
    observacao: observacao || undefined,
    createdAt: new Date().toISOString(),
    concludedAt: new Date().toISOString(),
    rawWebhookPayload: rawPayload,
  };

  await upsertRdoRequest(updatedRecord);
  return updatedRecord;
}

// ─────────────────────────────────────────────
// SIGA GR (Gerenciadora de Risco REST/JSON v1)
// ─────────────────────────────────────────────

export const DEFAULT_SIGA_CONFIG: SigaConfig = {
  environment: 'staging',
  apiUrl: 'https://api.staging.sigagr.com.br',
  email: '',
  password: '',
  requesterEmail: '',
  businessUnit: '',
  customerBranch: '',
  enabled: true,
  autoApproveInRisk: true,
};

export async function fetchSigaConfig(): Promise<SigaConfig> {
  // 1. Tenta carregar de profile_permissions (id: 1)
  try {
    const { data, error } = await supabase.from('profile_permissions').select('permissions').eq('id', 1).single();
    if (!error && data?.permissions?.siga_config) {
      const config = { ...DEFAULT_SIGA_CONFIG, ...data.permissions.siga_config };
      try {
        localStorage.setItem('transcunha_siga_config', JSON.stringify(config));
      } catch {}
      return config;
    }
  } catch (err) {
    console.warn('[DB] Could not fetch siga_config from profile_permissions:', err);
  }

  // 2. Fallback para localStorage
  try {
    const saved = localStorage.getItem('transcunha_siga_config');
    if (saved) {
      return { ...DEFAULT_SIGA_CONFIG, ...JSON.parse(saved) };
    }
  } catch {}

  return DEFAULT_SIGA_CONFIG;
}

export async function saveSigaConfig(config: SigaConfig): Promise<void> {
  // 1. Salva em profile_permissions (id: 1)
  try {
    const { data } = await supabase.from('profile_permissions').select('permissions').eq('id', 1).single();
    const current = data?.permissions || {};
    const updated = {
      ...current,
      siga_config: config,
    };
    await supabase.from('profile_permissions').upsert({ id: 1, permissions: updated });
  } catch (err) {
    console.warn('[DB] Error saving siga_config to profile_permissions:', err);
  }

  // 2. Salva em localStorage
  try {
    localStorage.setItem('transcunha_siga_config', JSON.stringify(config));
  } catch {}
}

export async function fetchSigaRequests(): Promise<SigaRequestRecord[]> {
  try {
    const { data, error } = await supabase
      .from('siga_requests')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data) {
      const records = data.map((r: any): SigaRequestRecord => ({
        id: r.id,
        processNumber: r.process_number,
        state: r.state,
        productName: r.product_name,
        shipmentId: r.shipment_id || undefined,
        driverId: r.driver_id || undefined,
        driverName: r.driver_name,
        driverCpf: r.driver_cpf,
        truckPlate: r.truck_plate,
        vehicleType: r.vehicle_type,
        origin: r.origin || undefined,
        destination: r.destination || undefined,
        loadCost: r.load_cost !== null && r.load_cost !== undefined ? Number(r.load_cost) : undefined,
        denialReason: r.denial_reason || undefined,
        issuesCount: r.issues_count || 0,
        unsolvedIssuesCount: r.unsolved_issues_count || 0,
        commentsCount: r.comments_count || 0,
        expiresAt: r.expires_at || undefined,
        createdAt: r.created_at,
        updatedAt: r.updated_at || r.created_at,
        concludedAt: r.concluded_at || undefined,
        createdById: r.created_by_id || undefined,
        createdByName: r.created_by_name || undefined,
        rawAnalysis: r.raw_analysis || undefined,
      }));
      try {
        localStorage.setItem('transcunha_siga_requests', JSON.stringify(records));
      } catch {}
      return records;
    }
  } catch (err) {
    console.warn('[DB] Could not fetch siga_requests table, falling back to localStorage:', err);
  }

  // Fallback para localStorage
  try {
    const saved = localStorage.getItem('transcunha_siga_requests');
    if (saved) {
      return JSON.parse(saved);
    }
  } catch {}

  return [];
}

export async function upsertSigaRequest(record: SigaRequestRecord): Promise<void> {
  try {
    const payload = {
      id: record.id,
      process_number: record.processNumber,
      state: record.state,
      product_name: record.productName,
      shipment_id: record.shipmentId || null,
      driver_id: record.driverId || null,
      driver_name: record.driverName,
      driver_cpf: record.driverCpf,
      truck_plate: record.truckPlate,
      vehicle_type: record.vehicleType,
      origin: record.origin || null,
      destination: record.destination || null,
      load_cost: record.loadCost ?? null,
      denial_reason: record.denialReason || null,
      issues_count: record.issuesCount || 0,
      unsolved_issues_count: record.unsolvedIssuesCount || 0,
      comments_count: record.commentsCount || 0,
      expires_at: record.expiresAt || null,
      created_at: record.createdAt,
      updated_at: record.updatedAt || new Date().toISOString(),
      concluded_at: record.concludedAt || null,
      created_by_id: record.createdById || null,
      created_by_name: record.createdByName || null,
      raw_analysis: record.rawAnalysis || null,
    };
    const { error } = await supabase.from('siga_requests').upsert(payload);
    if (error) {
      console.warn('[DB] Note: Could not upsert into siga_requests table (using local/state storage):', error.message);
    }
  } catch (err) {
    console.warn('[DB] Exception upserting siga_requests:', err);
  }

  // Atualiza local storage
  try {
    const current = await fetchSigaRequests();
    const idx = current.findIndex(r => r.id === record.id || r.processNumber === record.processNumber);
    let nextList: SigaRequestRecord[];
    if (idx >= 0) {
      nextList = [...current];
      nextList[idx] = record;
    } else {
      nextList = [record, ...current];
    }
    localStorage.setItem('transcunha_siga_requests', JSON.stringify(nextList));
  } catch {}

  // Broadcast realtime update
  broadcastSigaChange({
    action: record.state === 'approved' || record.state === 'denied' || record.state === 'authorized_by_manager' ? 'status_change' : 'update',
    processNumber: record.processNumber,
    state: record.state,
    driverCpf: record.driverCpf,
    truckPlate: record.truckPlate,
    shipmentId: record.shipmentId,
    driverId: record.driverId,
  });
}

export async function deleteSigaRequest(idOrProcessNumber: string): Promise<void> {
  try {
    await supabase.from('siga_requests').delete().or(`id.eq.${idOrProcessNumber},process_number.eq.${idOrProcessNumber}`);
  } catch {}

  try {
    const current = await fetchSigaRequests();
    const filtered = current.filter(r => r.id !== idOrProcessNumber && r.processNumber !== idOrProcessNumber);
    localStorage.setItem('transcunha_siga_requests', JSON.stringify(filtered));
  } catch {}

  broadcastSigaChange({
    action: 'delete',
    processNumber: idOrProcessNumber
  });
}


