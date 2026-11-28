import type {
  Cargo,
  Client,
  Product,
  Branch,
  User,
  Shipment,
  Driver,
  Vehicle,
} from '../types';
import { CargoStatus, CargoType, DailyScheduleType, ShipmentStatus, VehicleSetType, VehicleBodyType } from '../types';

/**
 * Gera uma carga fictícia completa para testes no ambiente Demonstração.
 * Nunca é persistida no banco de dados real.
 */
export function createDemoTestCargo(
  clients: Client[],
  products: Product[],
  branches: Branch[],
  currentUser: User
): Omit<Cargo, 'id' | 'history' | 'createdAt' | 'createdById'> {
  const sampleClient = clients[0];
  const sampleProduct = products[0];
  const sampleBranch = branches[0];

  const today = new Date().toISOString().split('T')[0];
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
  const randomSuffix = Math.floor(100 + Math.random() * 900);

  return {
    type: CargoType.Spot,
    sequenceId: 9000 + randomSuffix,
    scheduledVolume: 0,
    loadedVolume: 0,
    clientId: sampleClient?.id || 'DEMO-CLIENT-01',
    clientBranchId: sampleBranch?.id,
    branchId: sampleBranch?.id,
    productId: sampleProduct?.id || 'DEMO-PROD-01',
    origin: 'Uberlândia, MG',
    originLocation: 'Fazenda Modelo Demonstração',
    destination: 'Santos, SP',
    destinationLocation: 'Terminal Portuário Teste',
    packaging: 'Granel',
    totalVolume: 300,
    dailyVolume: 150,
    dailySchedule: [
      { date: today, type: DailyScheduleType.Livre },
      { date: tomorrow, type: DailyScheduleType.Livre },
    ],
    companyFreightValuePerTon: 165,
    companyFreightHasToll: true,
    driverFreightValuePerTon: 130,
    driverFreightHasToll: true,
    driverFreightValuePerTonPf: 125,
    driverFreightPfHasToll: true,
    hasIcms: false,
    icmsPercentage: 0,
    salespersonCommissionPerTon: 0,
    requiresScheduling: false,
    orderNumber: `PED-TESTE-${randomSuffix}`,
    tmsLoteNumber: `LOTE-DEMO-${randomSuffix}`,
    status: CargoStatus.EmAndamento,
    observations: `Carga fictícia criada automaticamente para testes no perfil ${currentUser.name}.`,
  } as unknown as Omit<Cargo, 'id' | 'history' | 'createdAt' | 'createdById'>;
}

/**
 * Gera os dados de um embarque fictício completo para uma carga no ambiente Demonstração.
 */
export function createDemoTestShipment(
  cargo: Cargo,
  drivers: Driver[],
  vehicles: Vehicle[]
): Omit<Shipment, 'id' | 'orderId' | 'status' | 'documents' | 'history' | 'createdAt' | 'createdById' | 'statusHistory'> & { observations?: string } {
  const randomNum = Math.floor(100 + Math.random() * 900);
  const sampleDriver = drivers[0];
  const sampleVehicle = vehicles[0];

  const tonnage = Math.min(37, Math.max(10, Number(cargo.totalVolume) || 37));

  return {
    cargoId: cargo.id,
    embarcadorId: cargo.createdById || 'USR-292',
    driverFreightValue: Number(((cargo.driverFreightValuePerTon || 130) * tonnage).toFixed(2)),
    driverName: sampleDriver?.name || `MOTORISTA TESTE ${randomNum}`,
    driverCpf: sampleDriver?.cpf || '000.000.000-00',
    driverContact: '(34) 99999-0000',
    horsePlate: sampleVehicle?.plate || `DEM${randomNum}A`,
    trailer1Plate: `TRL${randomNum}B`,
    trailer2Plate: `TRL${randomNum}C`,
    vehicleSetType: sampleVehicle?.setType || VehicleSetType.Rodotrem,
    vehicleBodyType: sampleVehicle?.bodyType || VehicleBodyType.Graneleiro,
    shipmentTonnage: tonnage,
    scheduledDate: new Date().toISOString().split('T')[0],
    paymentMethod: 'PIX - E-FRETE',
    advancePercentage: 70,
    pixKey: '00.000.000/0001-00',
    bankDetails: 'Banco Teste (001) • Ag 0001 • CC 12345-6',
    observations: 'Embarque fictício gerado automaticamente no Ambiente Demonstração.',
  };
}

/**
 * Preenche automaticamente informações fictícias para que o embarque de teste
 * possa avançar por qualquer etapa ao clicar em "Salvar e Avançar".
 */
export function buildDemoAdvancePayload(
  shipment: Shipment,
  cargo: Cargo | undefined,
  currentInputs: {
    codigoAtua?: string;
    riskReleaseCode?: string;
    riskQueryType?: string;
    route?: string;
    loadedTonnage?: number | string;
    bankDetails?: string;
    unloadedTonnage?: number | string;
    advanceValue?: number | string;
    tollValue?: number | string;
    balanceToReceiveValue?: number | string;
  }
) {
  const randomCode = Math.floor(10000 + Math.random() * 89999);
  const baseTonnage = Number(currentInputs.loadedTonnage) || Number(shipment.loadedTonnage) || Number(shipment.shipmentTonnage) || 37;
  const driverTotal = Number(shipment.driverFreightValue) || (Number(cargo?.driverFreightValuePerTon || 130) * baseTonnage);
  const advPct = shipment.advancePercentage ?? 70;
  const computedAdv = Number(((driverTotal * advPct) / 100).toFixed(2));
  const computedBalance = Number((driverTotal - computedAdv).toFixed(2));

  const payload: { filesToAttach: { [key: string]: File[] }; [key: string]: any } = {
    filesToAttach: {},
  };

  switch (shipment.status) {
    case ShipmentStatus.PreCadastro:
      payload.codigoAtua = currentInputs.codigoAtua?.trim() || `ATUA-DEMO-${randomCode}`;
      break;
    case ShipmentStatus.AguardandoSeguradora:
      payload.grStatus = 'aprovado';
      payload.riskReleaseCode = currentInputs.riskReleaseCode?.trim() || `LIB-GR-${randomCode}`;
      payload.riskQueryType = currentInputs.riskQueryType || 'Gratuita';
      payload.riskQueryCost = 0;
      break;
    case ShipmentStatus.AguardandoCarregamento:
      payload.route = currentInputs.route?.trim() || `${cargo?.origin || 'Uberlândia, MG'} → ${cargo?.destination || 'Santos, SP'} (Rota Teste)`;
      payload.loadedTonnage = baseTonnage;
      break;
    case ShipmentStatus.AguardandoNota:
      payload.bankDetails = currentInputs.bankDetails?.trim() || shipment.bankDetails || 'Banco Teste (001) • Ag 0001 • CC 12345-6';
      break;
    case ShipmentStatus.AguardandoFiscal:
      payload.advancePercentage = advPct;
      payload.icmsValue = 0;
      break;
    case ShipmentStatus.AguardandoAdiantamento:
      payload.advancePercentage = advPct;
      payload.advanceValue = Number(currentInputs.advanceValue) || computedAdv;
      payload.tollValue = Number(currentInputs.tollValue) || 0;
      payload.demoVirtualReceipt = true;
      break;
    case ShipmentStatus.AguardandoAgendamento:
      payload.scheduledDateTime = new Date(Date.now() + 86400000).toISOString();
      break;
    case ShipmentStatus.AguardandoDescarga:
    case ShipmentStatus.ValidacaoTicket:
      payload.unloadedTonnage = Number(currentInputs.unloadedTonnage) || baseTonnage;
      break;
    case ShipmentStatus.AguardandoPagamentoSaldo:
      payload.balanceToReceiveValue = Number(currentInputs.balanceToReceiveValue) || computedBalance;
      payload.isBreakageWaived = true;
      payload.discountValue = 0;
      break;
  }

  return payload;
}
