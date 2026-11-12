// FIX: Moved Page type definition from App.tsx to here so it can be shared across modules.
// FIX: Added 'embarcadores' and 'operational-map' to the page list to resolve type errors.
export type Page = 'dashboard' | 'clients' | 'owners' | 'embarcadores' | 'drivers' | 'vehicles' | 'loads' | 'products' | 'locations' | 'shipments' | 'financial' | 'reports' | 'operational-loads' | 'operational-map' | 'users-register' | 'corporate-email' | 'commissions' | 'appearance' | 'shipment-history' | 'load-history' | 'layover-calculator' | 'freight-quote' | 'atua-reconciliation' | 'ai-assistant' | 'tools-history' | 'branches' | 'system-monitor' | 'freight-offers-history' | 'risk-management' | 'risk-query-types' | 'whatsapp' | 'messenger' | 'apresentacao' | 'apresentacao-comercial' | 'site' | 'website';

export interface ExpedidorRecebedor {
  id: string;
  name: string; // Nome do Local (Fazenda / Galpão / Porto / etc.)
  documentType: 'CNPJ' | 'CPF';
  documentNumber: string; // CNPJ ou CPF
  phone: string; // Número de telefone
  isWhatsapp: boolean; // Se o número é WhatsApp ou não
  classification: 'Ambos'; // Classificação do Local: sempre "Ambos" (Expedidor/Recebedor)
  city?: string;
  state?: string;
  mapLink?: string;
  notes?: string;
  createdAt: string;
}

export type CorporateEmailStatus = 'Ativo' | 'Inativo' | 'Bloqueado' | 'Em Configuração';

export type CorporateEmailDepartment = 
  | 'Operacional'
  | 'Comercial'
  | 'Financeiro'
  | 'Diretoria'
  | 'RH / Administrativo'
  | 'TI / Suporte'
  | 'Geral';

export interface CorporateEmailAccount {
  id: string;
  email: string;
  displayName: string;
  userId?: string;
  userName?: string;
  department: CorporateEmailDepartment;
  password?: string;
  status: CorporateEmailStatus;
  quotaMb: number;
  usedMb: number;
  aliases: string[];
  forwardTo?: string;
  signature?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CorporateEmailServerConfig {
  domain: string;
  webmailUrl: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: 'ssl' | 'tls' | 'none';
  imapHost: string;
  imapPort: number;
  imapSecure: 'ssl' | 'tls' | 'none';
  popHost?: string;
  popPort?: number;
  defaultQuotaMb: number;
  providerPreset: 'cpanel' | 'google_workspace' | 'microsoft_365' | 'zoho' | 'titan' | 'custom';
}

export enum UserProfile {
  Desenvolvedor = "Desenvolvedor",
  Embarcador = "Embarcador",
  Agenciador = "Agenciador",
  Supervisor = "Supervisor",
  Comercial = "Comercial",
  GerenteComercial = "Gerente Comercial",
  Diretor = "Diretor",
  Fiscal = "Fiscal",
  Financeiro = "Financeiro",
  Cliente = "Cliente",
  Admin = "Administrador do Sistema",
  Motorista = "Motorista",
  Demonstracao = "Demonstração",
  GerenciadoraDeRisco = "Gerenciadora de Risco",
}

export const INTERNAL_PROFILES: UserProfile[] = [
  UserProfile.Desenvolvedor,
  UserProfile.Admin,
  UserProfile.Diretor,
  UserProfile.Supervisor,
  UserProfile.GerenteComercial,
  UserProfile.Comercial,
  UserProfile.Financeiro,
  UserProfile.Fiscal,
  UserProfile.GerenciadoraDeRisco,
  UserProfile.Embarcador,
  UserProfile.Agenciador,
  UserProfile.Demonstracao,
];


export interface Branch {
  id: string;
  name: string;
  city: string;
  state: string;
  createdAt: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  username?: string;
  profile: UserProfile;
  active: boolean;
  phone?: string;
  password?: string;
  clientId?: string;
  requirePasswordChange?: boolean;
  isFirstSetup?: boolean;
  authId?: string;
  passwordUpdatedAt?: string;
  branchId?: string;
  filialId?: string;
  hasCommercialCommission?: boolean;
  commercialFixedSalary?: number;
  commercialMatrizRate?: number;
  commercialFiliaisRate?: number;
  commercialSelectedBranchIds?: string[];
  commercialCalculationMode?: 'bruto' | 'liquido';
  commercialIsAgencyMode?: boolean;
  commercialAgencySharePercent?: number;
  availableForDriverRequests?: boolean;
  shipperCommissionRatePerTon?: number;
  agencyCommissionPercentage?: number;
  operatorCommissionPercentage?: number;
  agencyRole?: 'lider' | 'embarque';
  agencyLeaderId?: string;
  customPermissions?: { [key in Page]?: CrudPermissions };
  corporateEmail?: string;
  corporateEmailPassword?: string;
  corporateEmailQuotaMb?: number;
  corporateEmailStatus?: CorporateEmailStatus;
}

export enum PaymentMethod {
  Boleto = "Boleto",
  Pix = "PIX",
  Prazo = "Prazo",
}

export enum DriverPaymentMethod {
  PixEFrete = "PIX - E-FRETE",
  DepositoConta = "DEPOSITO EM CONTA",
  SmsCartaFrete = "SMS CARTA FRETE",
  PagamentoLivre = "PAGAMENTO LIVRE",
}

export interface ClientBranchCnpj {
  id: string;
  cnpj: string;
  razaoSocial?: string;
  nomeFantasia?: string;
  city?: string;
  state?: string;
  address?: string;
  phone?: string;
  email?: string;
  paymentMethod?: PaymentMethod;
  paymentTerm?: number;
  requiresExternalOrder?: boolean;
  requiresScheduling?: boolean;
  salespersonName?: string;
  salespersonCommissionPerTon?: number;
  loadingOrderModelId?: string;
  ordemCarregamentoModelId?: string;
}

export interface Client {
  id: string;
  razaoSocial: string;
  nomeFantasia: string;
  cnpj: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  state: string;
  paymentMethod: PaymentMethod;
  paymentTerm: number; // e.g., 15, 30, 45 days
  requiresExternalOrder: boolean;
  requiresScheduling: boolean;
  secondaryCnpjs?: ClientBranchCnpj[];
  salespersonName?: string;
  salespersonCommissionPerTon?: number;
  loadingOrderModelId?: string;
  ordemCarregamentoModelId?: string;
}

export enum OwnerType {
  PessoaFisica = "Pessoa Física",
  PessoaJuridica = "Pessoa Jurídica",
}

export interface Owner {
  id: string;
  name: string;
  cpfCnpj: string;
  phone: string;
  type: OwnerType;
  bankDetails: string;
}

export enum DriverClassification {
  Frota = "Frota",
  Agregado = "Agregado",
  Terceiro = "Terceiro",
  Proprio = "Próprio",
}

export interface Driver {
  id: string;
  name: string;
  cpf: string;
  cnh: string;
  phone: string;
  classification: DriverClassification;
  ownerId?: string;
  active: boolean;
  restrictionReason?: string;
  has_app?: boolean;
  codigoAtua?: string;
  motherName?: string;
  birthDate?: string;
  cnhAttachmentUrl?: string;
}

export interface DriverLocation {
  driverId: string;
  driverName: string;
  lat: number;
  lng: number;
  speed: number | null;
  heading: number | null;
  timestamp: string;
}

export enum VehicleSetType {
  LSSimples = "LS Simples",
  LSTrucada = "LS Trucada",
  Vanderleia = "Vanderleia",
  Bitrem7e = "Bitrem 7e",
  Bitrem8e = "Bitrem 8e",
  Cavalo4e = "Cavalo 4e",
  Carreta4e = "Carreta 4e",
  Rodotrem3x3 = "Rodotrem (3x3)",
  Rodotrem = "Rodotrem",
  Truck = "Caminhão Truck",
  Bitruck = "Bitruck",
}

export enum VehicleBodyType {
  Basculante = "Basculante",
  Graneleiro = "Graneleiro",
  Sider = "Sider",
  GradeBaixa = "Grade baixa",
  Tanque = "Tanque",
}

export interface Vehicle {
  id: string;
  plate: string;
  setType: VehicleSetType;
  bodyType: VehicleBodyType;
  classification: DriverClassification;
  driverId?: string;
  ownerId: string;
}

export enum ProductUnit {
  Tonelada = "ton",
  MetroCubico = "m³",
  Sacas = "sc",
}

export interface Product {
  id: string;
  name: string;
  unit: ProductUnit;
  /** Se true (padrão), o embarque exige fluxo completo de Gerenciamento de Risco (código + tipo de consulta).
   *  Se false, basta o envio do documento de liberação (Liberação Simplificada). */
  requiresRiskManagement?: boolean;
}

export enum CargoType {
  Fixa = "Fixa",
  Spot = "Spot",
}

export enum CargoStatus {
  EmAndamento = "Em andamento",
  Suspensa = "Suspensa",
  Fechada = "Fechada",
}

export interface HistoryLog {
    id: string;
    userId: string;
    timestamp: string;
    description: string;
}

export enum FreightCalculationType {
  PerTon = "per_ton",                 // Por Tonelada (R$/ton)
  Fixed = "fixed",                   // Frete Fechado (Valor Fixo R$)
  PerTonPlusIcms = "per_ton_plus_icms" // VLR P/ton + ICMS
}

export interface FreightLeg {
  companyFreightValuePerTon: number;
  companyFreightHasToll?: boolean;
  driverFreightValuePerTon: number;
  driverFreightHasToll?: boolean;
  driverFreightValuePerTonPf?: number;
  driverFreightPfHasToll?: boolean;
  disablePfFreight?: boolean;
  hasIcms: boolean;
  icmsPercentage: number;
  freightCalculationType?: FreightCalculationType;
  icmsValue?: number;
  companyFreightTotalFixed?: number;
  driverFreightTotalFixedPj?: number;
  driverFreightTotalFixedPf?: number;
}

export enum DailyScheduleType {
  Livre = "Demanda Livre",
  Fixo = "Demanda Fixa",
  Verificar = "Demanda a Verificar",
}

export interface DailyScheduleEntry {
  date: string; // YYYY-MM-DD
  type: DailyScheduleType;
  tonnage?: number; // Previsto por dia (obrigatório para todos os tipos)
}

export interface Cargo {
  id: string;
  sequenceId: number;
  clientId: string;
  productId: string;
  origin: string;
  originLocation?: string;
  originMapLink?: string;
  destination: string;
  destinationLocation?: string;
  destinationMapLink?: string;
  totalVolume: number; 
  scheduledVolume: number; 
  loadedVolume: number; 
  companyFreightValuePerTon: number;
  companyFreightHasToll?: boolean;
  driverFreightValuePerTon: number;
  driverFreightHasToll?: boolean;
  driverFreightPfHasToll?: boolean;
  hasIcms: boolean;
  icmsPercentage: number;
  freightCalculationType?: FreightCalculationType;
  icmsValue?: number;
  companyFreightTotalFixed?: number;
  driverFreightTotalFixedPj?: number;
  driverFreightTotalFixedPf?: number;
  requiresScheduling: boolean;
  type: CargoType;
  status: CargoStatus;
  createdAt: string;
  createdById: string;
  history: HistoryLog[];
  loadingDeadline?: string;
  allowedVehicleTypes?: { setType: VehicleSetType; bodyTypes: VehicleBodyType[] }[];
  freightLegs?: FreightLeg[];
  dailySchedule?: DailyScheduleEntry[];
  observations?: string;
  attachments?: string[];
  salespersonName?: string;
  salespersonCommissionPerTon?: number;
  // Location simulation for map
  originCoords?: { lat: number; lng: number };
  destinationCoords?: { lat: number; lng: number };
  branchId?: string;
  requiresTracker?: boolean;
  schedulingSystemUrl?: string;
  schedulingUser?: string;
  schedulingPassword?: string;
  allowedProfiles?: UserProfile[];
  allowedUserIds?: string[];
  tmsLoteNumber?: string;
  clientCnpj?: string;
  clientBranchId?: string;
  isExport?: boolean;
  orderNumber?: string;
  packaging?: string;
  ulaNumber?: string;
  loadNum?: string;
  financialCostEnabled?: boolean;
  financialCostMonthlyRate?: number;    // Ex: 2.0 (2% ao mês)
  financialCostDaysTerm?: number;       // Ex: 45 (dias)
  financialCostBaseDays?: number;       // Ex: 30 (dias)
  financialCostEffectiveRate?: number;  // Ex: 3.0 (3%)
  financialCostPerTon?: number;         // R$/ton
  financialCostTotal?: number;          // R$ total
}


export enum OrderStatus {
  Solicitada = "Solicitada",
  Aprovada = "Aprovada",
  Rejeitada = "Rejeitada",
}

export interface LoadingOrder {
  id: string;
  cargoId: string;
  driverId: string;
  vehicleId: string;
  ownerId: string;
  requestDate: Date;
  status: OrderStatus;
}

export enum ShipmentStatus {
  PreCadastro = "Ag. Cadastro",
  AguardandoSeguradora = "Ag. Seguradora",
  AguardandoCarregamento = "Ag. Carregamento",
  AguardandoNota = "Ag. Nota",
  AguardandoFiscal = "Ag. Fiscal",
  AguardandoAdiantamento = "Ag. Adiantamento",
  AguardandoAgendamento = "Ag. Agend. ou Troca/nfe",
  AguardandoDescarga = "Ag. Descarga",
  ValidacaoTicket = "Valid. de Ticket",
  AguardandoPagamentoSaldo = "Ag. Saldo",
  Finalizado = "Finalizado",
  Cancelado = "Cancelado",
}

export enum RiskQueryType {
  Consulta = 'Consulta',
  Siga = 'SIGA',
  ConsultaBiometria = 'Consulta + Biometria',
  CadastroGeralBiometria = 'Cadastro Geral + Biometria',
  CadastroConsultaGeral = 'Cadastro + Consulta Geral',
  Vitimologia = 'Vitimologia',
  LiberacaoSimplificada = 'Liberação Simplificada',
}

export interface RiskQueryOption {
  id: string;
  name: string;
  cost: number;
  active: boolean;
  orderIndex?: number;
  description?: string;
  createdAt?: string;
}

export const DEFAULT_RISK_QUERY_OPTIONS: RiskQueryOption[] = [
  { id: 'consulta', name: 'Consulta', cost: 6.50, active: true, orderIndex: 1, description: 'Consulta padrão SIGA / Consulta' },
  { id: 'consulta_biometria', name: 'Consulta + Biometria', cost: 14.00, active: true, orderIndex: 2, description: 'Consulta com validação biométrica' },
  { id: 'cadastro_geral_biometria', name: 'Cadastro Geral + Biometria', cost: 32.50, active: true, orderIndex: 3, description: 'Cadastro completo e consulta geral com biometria' },
  { id: 'vitimologia', name: 'Vitimologia', cost: 70.00, active: true, orderIndex: 4, description: 'Análise aprofundada de vitimologia' },
  { id: 'liberacao_simplificada', name: 'Liberação Simplificada', cost: 0.00, active: true, orderIndex: 5, description: 'Liberação sem custo / simplificada' },
];

export const RISK_QUERY_COST_MAP: Record<string, number> = {
  [RiskQueryType.Consulta]: 6.50,
  [RiskQueryType.Siga]: 6.50,
  'siga': 6.50,
  'consulta': 6.50,
  [RiskQueryType.ConsultaBiometria]: 14.00,
  'CONSULTA + BIOMETRIA': 14.00,
  'consulta + biometria': 14.00,
  [RiskQueryType.CadastroGeralBiometria]: 32.50,
  [RiskQueryType.CadastroConsultaGeral]: 32.50,
  'CADASTRO GERAL + BIOMETRIA': 32.50,
  'CADASTRO GERAL + BIOMETRIA FACIAL': 32.50,
  'CADASTRO + CONSULTA GERAL': 32.50,
  'Cadastro Geral': 32.50,
  'CADASTRO GERAL': 32.50,
  [RiskQueryType.Vitimologia]: 70.00,
  'VITIMOLOGIA': 70.00,
  'vitimologia': 70.00,
  [RiskQueryType.LiberacaoSimplificada]: 0.00,
  'Liberacao Simplificada': 0.00,
  'LIBERAÇÃO SIMPLIFICADA': 0.00,
  'liberação simplificada': 0.00,
  'liberacao simplificada': 0.00,
};

export const REQUIRED_DOCUMENT_MAP: Partial<Record<ShipmentStatus, string>> = {
    [ShipmentStatus.PreCadastro]: 'Comprovante de Cadastro',
    [ShipmentStatus.AguardandoSeguradora]: 'Comprovação da Liberação da Seguradora',
    [ShipmentStatus.AguardandoCarregamento]: 'Ticket de Carregamento',
    [ShipmentStatus.AguardandoNota]: 'Nota Fiscal (NF-e)',
    [ShipmentStatus.AguardandoFiscal]: 'Documentos de Viagem (CT-e, MDF-e, Contrato)',
    [ShipmentStatus.AguardandoAdiantamento]: 'Comprovante de Adiantamento',
    [ShipmentStatus.AguardandoAgendamento]: 'Comprovante de Agendamento',
    [ShipmentStatus.AguardandoDescarga]: 'Comprovante de Descarga',
    [ShipmentStatus.ValidacaoTicket]: 'Validação de Ticket e Peso',
    [ShipmentStatus.AguardandoPagamentoSaldo]: 'Comprovante de Pagamento de Saldo',
};

export interface OperationalExpenseItem {
  name: string;
  value: number;
  type?: 'positive' | 'negative' | 'neutral'; // (+) or (-)
}

export interface RealProfitData {
  companyFreight: number;
  driverFreight: number;
  freightDifference: number;
  freightDifferenceMarginPercent: number;
  totalExpenses: number;
  netProfit: number;
  profitMarginPercent: number;
  expenseItems: OperationalExpenseItem[];
  complementCharged?: number;
  complementPaid?: number;
  driverSurcharge?: number;
  toll?: number;
  icmsDifference?: number;
  isIcmsExempt?: boolean;
  federalTax?: number;
  isFederalTaxManual?: boolean;
  inssPatronal?: number;
  sestSenat?: number;         // SEST/SENAT retido (PF)
  inssRetido?: number;        // INSS retido (PF)
  ciot?: number;              // 0,20% sobre frete do motorista
  insuranceDifference?: number;
  insuranceAcidente?: number; // 0,0125% do valor da NF
  insuranceRoubo?: number;    // 0,0125% do valor da NF
  insuranceRcv?: number;      // R$ 5,00 por carga
  invoiceValue?: number;      // Valor da NF averbada
  commission?: number;
  brokerFee?: number;
  otherCosts?: number;
  dailyRateDifference?: number;
  generatedCredit?: number;
  isGeneratedCreditManual?: boolean;
  processedAt?: string;
  attachmentUrl?: string;
  rawOcrText?: string;
  additionalCost?: number;
  additionalCostCategory?: string;
  additionalCostDescription?: string;
  agencyCommission?: number;
  agencyCommissionEnabled?: boolean;
  shipperCommission?: number;
  shipperCommissionRatePerTon?: number;
  shipperCommissionEnabled?: boolean;
  driverExtraPaymentsTotal?: number;
  financialCost?: number;
  financialCostRate?: number;
  financialCostDaysTerm?: number;
  financialCostMonthlyRate?: number;
}

export interface CancelledCteRecord {
  cteNumber: string;
  fileUrl?: string;
  fileName?: string;
  cancelledAt: string;
  cancelledBy?: string;
  reason?: string;
  substituteCteNumber?: string;
  substituteFileUrl?: string;
}

export interface DriverExtraPayment {
  id: string;
  amount: number;
  reason: 'Diária / Estadia' | 'Ajuda de Custo' | 'Adicional de Descarga' | 'Bônus Operacional' | 'Reembolso' | 'Outro' | string;
  description?: string;
  receiptUrl?: string;
  receiptFileName?: string;
  receiptFileType?: string;
  paymentMethod?: string;
  paidAt: string;        // Data e hora do pagamento (ISO ou YYYY-MM-DDTHH:mm)
  createdAt: string;     // Data e hora de lançamento
  createdByName: string; // Nome do usuário que lançou
  createdByUserId?: string;
  createdByRole?: string; // Perfil de quem lançou
}

export interface Shipment {
  id: string;
  orderId: string;
  cargoId: string;
  riskReleaseCode?: string;
  riskQueryType?: RiskQueryType | string;
  riskQueryCost?: number;
  driverName: string;
  driverContact?: string;
  driverCpf?: string;
  driverCnpj?: string;
  driverCnh?: string;
  driverCnhRegister?: string;
  driverCnhExpiry?: string;
  driverRg?: string;
  driverMotherName?: string;
  driverBirthDate?: string;
  ulaNumber?: string;
  loadNum?: string;
  embarcadorId: string;
  horsePlate: string;
  trailer1Plate?: string;
  trailer2Plate?: string;
  trailer3Plate?: string;
  shipmentTonnage: number;
  driverFreightValue: number;
  status: ShipmentStatus;
  statusPendingObservation?: string; // Observação específica da pendência do status atual
  scheduledDate: string; // YYYY-MM-DD
  scheduledTime?: string; // HH:MM
  arrivalTime?: string; // ISO String
  documents?: { [key: string]: any };
  history: HistoryLog[];
  createdAt: string;
  createdById: string;
  statusHistory: {
      status: ShipmentStatus;
      timestamp: string;
      userId: string;
  }[];
  anttOwnerIdentifier?: string;
  anttModality?: AnttModality | string;
  etcTaxRegime?: EtcTaxRegime | string;
  paymentMethod?: DriverPaymentMethod | string;
  pixKey?: string;
  advancePercentage?: number;
  advanceValue?: number;
  tollValue?: number;
  bankDetails?: string;
  vehicleTag?: string;
  companyFreightRateSnapshot?: number;
  driverFreightRateSnapshot?: number;
  freightCalculationType?: FreightCalculationType;
  icmsValue?: number;
  isIcmsExempt?: boolean;
  federalTax?: number;
  isFederalTaxManual?: boolean;
  generatedCredit?: number;
  isGeneratedCreditManual?: boolean;
  driverFreightType?: 'PJ' | 'PF';
  route?: string;
  isExport?: boolean;
  commercialCommission?: number;
  cancellationReason?: string;
  driverReferences?: string;
  ownerName?: string;
  ownerContact?: string;
  balanceToReceiveValue?: number;
  discountValue?: number;
  isBreakageWaived?: boolean;
  netBalanceValue?: number;
  loadedTonnage?: number;
  unloadedTonnage?: number;
  vehicleSetType?: VehicleSetType;
  vehicleBodyType?: VehicleBodyType;
  branchId?: string;
  cteNumber?: string;   // Número do CT-e extraído automaticamente do XML/PDF
  cteEmissionDate?: string; // Data e Hora da Emissão do CT-e (ex: 13/08/2026 11:40)
  ciotNumber?: string;  // Número do CIOT informado ou extraído do embarque
  ciot?: string;        // Código Identificador da Operação de Transporte (CIOT)
  nfeNumber?: string;   // Número da Nota Fiscal (NF-e) extraído automaticamente
  nfeValue?: number;    // Valor da Nota Fiscal / Mercadoria averbada
  mdfeNumber?: string;  // Número do MDF-e extraído automaticamente
  codigoAtua?: string;  // Código de Atualização cadastral informado em Ag. Cadastro / Sistema ATUA
  realProfitData?: RealProfitData; // Resumo e detalhamento de despesas extraídos via OCR/IA
  additionalCost?: {
    value: number;
    category: string;
    description: string;
    createdAt?: string;
    createdBy?: string;
  };
  additionalCostValue?: number;
  additionalCostCategory?: string;
  additionalCostDescription?: string;
  agencyCommissionEnabled?: boolean;
  agencyCommissionPercentage?: number;
  agencyCommissionValue?: number;
  agencyCommissionAgencyName?: string;
  shipperCommissionEnabled?: boolean;
  shipperCommissionRatePerTon?: number;
  shipperCommissionValue?: number;
  driverExtraPayments?: DriverExtraPayment[];
  driverExtraPaymentsTotal?: number;
  financialCostValue?: number;
  financialCostRate?: number;
  financialCostDaysTerm?: number;
  financialCostMonthlyRate?: number;
  isComplementar?: boolean;
  parentShipmentId?: string;
  complementarOriginType?: string;
  complementarCteNumber?: string;
  complementarCompanyFreight?: number;
  complementarDriverFreight?: number;
  complementarNfeNumber?: string;
  complementarNfeValue?: number;
}



export type ProfilePermissions = {
  [profile in UserProfile]?: {
    [page in Page]?: CrudPermissions;
  };
} & {
  system_settings?: {
    driver_portal_enabled?: boolean;
    pwa_enabled?: boolean;
  };
};

export interface CrudPermissions {
  read: boolean;
  create: boolean;
  update: boolean;
  delete: boolean;
}

export interface Embarcador {
  id: string;
  name: string;
  shipperCommissionRatePerTon?: number;
}

// Ticket System Types
export enum TicketStatus {
  Aberto = "Aberto",
  EmAndamento = "Em Andamento",
  Resolvido = "Resolvido",
  Fechado = "Fechado",
}

export enum TicketPriority {
  Baixa = "Baixa",
  Media = "Média",
  Alta = "Alta",
  Urgente = "Urgente",
}

export interface TicketHistory {
  userId: string;
  timestamp: string;
  comment: string;
  oldStatus?: TicketStatus;
  newStatus?: TicketStatus;
  durationText?: string;
}

export interface TicketAttachment {
  url: string;
  name: string;
  size?: number;
  type?: string;
}

export interface Ticket {
  id: string;
  title: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  createdById: string;
  assignedToId: string;
  createdAt: string;
  history: TicketHistory[];
  cargoId?: string;
  shipmentId?: string;
  attachmentUrl?: string;
  attachmentName?: string;
  attachments?: TicketAttachment[];
  audioUrl?: string;
  audioDurationSeconds?: number;
  startedAt?: string;
  startedById?: string;
  resolvedAt?: string;
  resolvedById?: string;
  closedAt?: string;
  closedById?: string;
  timeToAttendMs?: number;
  timeToResolveMs?: number;
}

export interface ShipmentLock {
  id: string;
  shipmentId: string;
  userId: string;
  userName: string;
  createdAt: string;
  expiresAt: string;
}

export enum FreightOfferStatus {
  AguardandoPreco = "Aguardando Preço",
  AnaliseCliente = "Em Análise",
  Pendente = "Pendente", // Mantido para retrocompatibilidade
  Aceita = "Aceita",
  Recusada = "Recusada",
  Contraproposta = "Contraproposta",
  ContrapropostaAceita = "Contraproposta Aceita", // Mantido para retrocompatibilidade
  AguardandoFechamento = "Aguardando Fechamento",
  SolicitadoExclusao = "Exclusão Solicitada"
}

export interface FreightOffer {
  id: string;
  displayId?: string;
  clientId: string;
  origin: string;
  originLocation?: string;
  destination: string;
  destinationLocation?: string;
  totalTonnage: number;
  dailySchedule?: string;
  freightValuePerTon?: number;
  productId: string;
  driverId?: string;
  cargoId?: string;
  status: FreightOfferStatus;
  previousStatus?: FreightOfferStatus;
  counterOfferValue?: number;
  createdAt: string;
  history?: HistoryLog[];
  observations?: string;
  additionalDestinations?: { city: string; location?: string }[];
  attachments?: string[];
  requestedEmbarcadorId?: string;
  requestTimestamp?: string;
  freightType?: 'CIF' | 'FOB';
  hasIcms?: boolean;
  icmsPercentage?: number;
  clientCnpj?: string;
  clientBranchId?: string;
  isExport?: boolean;
  originCoords?: { lat: number; lng: number };
  destinationCoords?: { lat: number; lng: number };
  distanceKm?: number;
  isExactDistance?: boolean;
}

export enum AnttModality {
  TAC = 'TAC',
  ETC = 'ETC',
  CTC = 'CTC',
}

export enum EtcTaxRegime {
  MEI = 'MEI',
  SimplesNacional = 'Simples Nacional',
  LucroPresumido = 'Lucro Presumido',
  LucroReal = 'Lucro Real',
}

// ==========================================
// MÓDULO FINANCEIRO
// ==========================================

export type FinancialTab = 
  | 'payables' 
  | 'receivables' 
  | 'invoices'
  | 'ofx' 
  | 'result-1' 
  | 'result-2' 
  | 'result-3' 
  | 'control-shipments' 
  | 'control-banking'
  | 'control-fiscal';

// ==========================================
// CONTROLADORIA FISCAL & GESTÃO DE DOCUMENTOS
// ==========================================

export type FiscalAlertLevel = 'expired' | 'critical' | 'warning' | 'ok';

export interface FiscalDocumentAttachment {
  url: string;
  name: string;
  size?: number;
  type?: string;
}

export interface FiscalDocument {
  id: string;
  title: string;
  typeId: string;
  typeName: string;
  documentNumber?: string;
  issuer?: string;
  issueDate?: string;
  expirationDate: string; // YYYY-MM-DD (obrigatório)
  branchId?: string;
  branchName?: string;
  notes?: string;
  attachments?: FiscalDocumentAttachment[];
  status?: 'active' | 'archived';
  createdByUserId?: string;
  createdByName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FiscalDocumentType {
  id: string;
  name: string;
  description?: string;
  category?: 'seguro' | 'certidao' | 'licenca' | 'fiscal' | 'outros';
  color?: string;
  isDefault?: boolean;
  createdAt: string;
}

export type FinancialTransactionType = 'payable' | 'receivable';

export enum FinancialTransactionStatus {
  Pendente = 'Pendente',
  Pago = 'Pago',
  Recebido = 'Recebido',
  Atrasado = 'Atrasado',
  Conciliado = 'Conciliado',
  Cancelado = 'Cancelado',
}

export enum FinancialCategoryType {
  ReceitaFrete = 'Receita de Fretes',
  CustoMotorista = 'Custos com Motoristas / Terceiros',
  CustoPedagio = 'Pedágios',
  CustoImposto = 'Impostos e Tributos',
  CustoOperacional = 'Despesas Operacionais',
  CustoPessoal = 'Pessoal e Encargos',
  CustoAdministrativo = 'Despesas Administrativas',
  CustoFinanceiro = 'Despesas Financeiras / Tarifas',
  OutrasReceitas = 'Outras Receitas',
}

export interface BankAccount {
  id: string;
  bankName: string;
  bankCode?: string;
  agency: string;
  accountNumber: string;
  accountType: 'corrente' | 'poupanca' | 'aplicacao';
  initialBalance: number;
  currentBalance: number;
  active: boolean;
  pixKey?: string;
  createdAt: string;
}

export type TaxType = 'PIS_COFINS' | 'ICMS' | 'CSLL' | 'IRPJ' | 'FGTS' | 'INSS' | 'OUTROS';

export interface FinancialTransaction {
  id: string;
  type: FinancialTransactionType;
  description: string;
  amount: number;
  dueDate: string;
  paymentDate?: string;
  status: FinancialTransactionStatus;
  category: string;
  costCenter?: string;
  bankAccountId?: string;
  documentNumber?: string;
  supplierOrClientName?: string;
  supplierOrClientCpfCnpj?: string;
  
  // Vínculos operacionais com Transcunha
  shipmentId?: string;
  cargoId?: string;
  driverId?: string;
  clientId?: string;
  ownerId?: string;
  
  notes?: string;
  attachmentUrl?: string;
  attachmentName?: string;
  holeriteUrl?: string;
  holeriteFileName?: string;
  isReconciled?: boolean;
  reconciledAt?: string;
  ofxCheckNum?: string;
  ofxTransactionId?: string;
  reconciledByUserId?: string;
  reconciledByUserName?: string;
  unreconciledReason?: string;
  unreconciledAt?: string;
  unreconciledByUserName?: string;
  // Anexo do Comprovante de Pagamento / Quitação
  receiptFileUrl?: string;
  receiptFileName?: string;
  receiptFileType?: string;
  receiptFileSize?: number;
  paymentAuthCode?: string;
  interestAmount?: number;
  discountAmount?: number;
  paidAmount?: number;
  bankAccount?: string;

  // Metadados de Impostos e Tributos
  taxType?: TaxType;
  taxCode?: string;          // ex: '111-9', '6912', '5856', '2484', '5993', '1138'
  taxPeriod?: string;        // ex: '02/2026', '30/06/2026', 'setembro/2026'
  taxPrincipalAmount?: number;
  taxFineAmount?: number;
  taxInterestAmount?: number;
  barcode?: string;          // Linha digitável ou código de barras da guia
  
  createdAt: string;
  createdById?: string;
}

export interface PayrollSettlementDoc {
  userId: string;
  monthKey: string; // 'YYYY-MM', ex: '2026-10'
  monthLabel: string; // ex: 'Outubro/2026'
  regime: 'CLT' | 'PJ' | 'Gestor AG';
  
  // Nota Fiscal (PJ / Gestor AG)
  invoiceNumber?: string;
  invoiceIssueDate?: string;
  invoiceFileUrl?: string;
  invoiceFileName?: string;
  
  // Comprovante de Pagamento (CLT / PJ / Gestor AG)
  receiptFileUrl?: string;
  receiptFileName?: string;
  paymentDate?: string;
  paymentAuthCode?: string;
  
  isPaid?: boolean;
  isCompleted?: boolean;
  completedAt?: string;
  notes?: string;
  updatedAt?: string;
}

export interface PayrollAdvanceInstallment {
  installmentNumber: number;
  totalInstallments: number;
  monthKey: string;
  amount: number;
  isSettled?: boolean;
}

export interface PayrollAdvanceItem {
  id: string;
  userId: string;
  description?: string;
  amount: number;
  issueDate: string;
  receiptFileUrl?: string;
  receiptFileName?: string;
  installmentsCount: number;
  startMonthKey: string;
  installments: PayrollAdvanceInstallment[];
  createdAt: string;
  updatedAt?: string;
}

export interface PayrollAdvanceRecord {
  userId: string;
  monthKey: string;
  amount: number;
  date: string; // YYYY-MM-DD
  receiptFileUrl?: string;
  receiptFileName?: string;
  notes?: string;
  updatedAt?: string;
}

export interface OfxTransaction {
  id: string;
  checkNum?: string;
  date: string;
  amount: number;
  description: string;
  type: 'CREDIT' | 'DEBIT' | 'OTHER';
  memo?: string;
  reconciled: boolean;
  matchedTransactionId?: string;
  matchedKind?: 'transaction' | 'invoice';
  reconciledAt?: string;
  reconciledByUserName?: string;
  unreconciledReason?: string;
}

export interface OfxImportLog {
  id: string;
  filename: string;
  importDate: string;
  bankAccountId: string;
  accountNumber?: string;
  startDate?: string;
  endDate?: string;
  totalTransactions: number;
  reconciledCount: number;
  transactions: OfxTransaction[];
}

// ==========================================
// GESTÃO E CONTROLE DE NOTAS FISCAIS
// ==========================================

export type InvoiceCostNature = 
  | 'servico' // Prestação de Serviço
  | 'produto' // Aquisição de Produto / Insumos
  | 'bem'     // Compra de Bem / Ativo
  | 'outros'; // Outros Custos / Despesas em Geral

export type InvoicePaymentStatus = 'Pendente' | 'Pago' | 'Atrasado' | 'Cancelado' | 'Somente Volume';

export type FinancialDocumentType = 'Nota Fiscal' | 'Fatura';

export interface CostType {
  id: string;
  name: string;
  nature: InvoiceCostNature;
  description?: string;
  isDefault?: boolean;
  createdAt: string;
}

export interface CostCenter {
  id: string;
  code?: string;
  name: string;
  description?: string;
  isDefault?: boolean;
  createdAt: string;
}

export interface FinancialInvoice {
  id: string;
  documentType?: FinancialDocumentType; // 'Nota Fiscal' (padrão) ou 'Fatura'
  invoiceNumber: string;
  series?: string;
  accessKey?: string;
  supplierName: string;
  supplierCnpjCpf?: string;
  totalAmount: number;
  payableAmount?: number; // Valor a pagar efetivo (pode diferir do valor total da NF por retenções ou acordos)
  issueDate: string;
  dueDate: string;
  paymentDate?: string;
  status: InvoicePaymentStatus;
  paymentMethod?: 'Boleto' | 'Pix' | 'Transferência' | 'Cartão' | 'Dinheiro' | 'Outro';
  paymentDetails?: string; // Dados para pagamento (Chave Pix, Linha digitável/código de barras, agência/conta, etc.)
  
  // Categorização e Classificação de Custos
  costNature: InvoiceCostNature;
  costTypeId: string;
  costTypeName: string;
  costCenterId: string;
  costCenterName: string;
  
  // Vinculação de Responsável / Usuário Interno
  responsibleUserId: string;
  responsibleUserName: string;
  responsibleUserProfile?: string;
  
  description: string;
  notes?: string;
  
  // Anexo do documento da Nota Fiscal (PDF ou imagem)
  fileUrl?: string;
  fileName?: string;
  fileType?: string;
  fileSize?: number;

  // Anexo do Boleto Bancário para Pagamento (PDF ou imagem)
  boletoFileUrl?: string;
  boletoFileName?: string;
  boletoFileType?: string;
  boletoFileSize?: number;

  // Anexo do Comprovante de Pagamento (PDF ou imagem)
  receiptFileUrl?: string;
  receiptFileName?: string;
  receiptFileType?: string;
  receiptFileSize?: number;
  paymentAuthCode?: string;

  // Ajustes Financeiros e Baixa Real (OBZ / Sicredi Parser)
  interestAmount?: number; // Juros / Multa / Mora (+ R$)
  discountAmount?: number; // Abatimento / Desconto (- R$)
  paidAmount?: number;     // Valor Real Pago (= Original + Juros - Abatimento)
  bankAccount?: string;    // Banco / Conta utilizada (ex: Sicredi)

  // Encargos de Boleto Bancário por Atraso (Multa e Juros)
  fineAmount?: number;     // Valor da multa por atraso identificada/calculada
  dailyInterestAmount?: number; // Valor dos juros de mora diário
  overdueTotalAmount?: number;  // Valor total com encargos em caso de atraso
  overdueDays?: number;         // Quantidade de dias de atraso calculados
  overdueCalculationExplanation?: string; // Detalhamento da regra de juros e multa
  
  // Conciliação Bancária & Trava Contábil
  isReconciled?: boolean;
  reconciledAt?: string;
  ofxCheckNum?: string;
  ofxTransactionId?: string;
  reconciledByUserId?: string;
  reconciledByUserName?: string;
  unreconciledReason?: string;
  unreconciledAt?: string;
  unreconciledByUserName?: string;
  
  createdAt: string;
  updatedAt?: string;
}

export type LoadingOrderModelStatus = 'ativo' | 'inativo';

export interface LoadingOrderModel {
  id: string;
  nome: string;
  descricao?: string;
  status: LoadingOrderModelStatus;
  isDefault?: boolean;
  camposObrigatorios?: string[];
  observacoesPadrao?: string;
  layoutTipo?: 'padrao' | 'simplificado' | 'graos' | 'fertilizantes' | 'personalizado' | 'consube';
  createdAt?: string;
  updatedAt?: string;
}

export const DEFAULT_LOADING_ORDER_MODELS: LoadingOrderModel[] = [
  {
    id: 'mod_consube',
    nome: 'Consube',
    descricao: 'Modelo Consube com cabeçalho oficial, autorização de terceiro/motorista, composição (Cavalo, Reboque 1 e 2, Dolly), dados de retirada/sacos/peso em KG, natureza da carga, remetente, cliente e liberação da gestora de risco.',
    status: 'ativo',
    layoutTipo: 'consube',
    observacoesPadrao: 'PREENCHER OS DADOS SEM O USO DE PONTUAÇÃO.',
    camposObrigatorios: [
      'motorista',
      'cpf',
      'cnh',
      'cavalo',
      'reboque1',
      'pesoKg',
      'remetente',
      'cliente',
      'liberacaoRisco'
    ]
  },
  {
    id: 'mod_padrao_transcunha',
    nome: 'Modelo Padrão Transcunha',
    descricao: 'Ordem de carregamento completa com dados de transportadora, motorista, veículo, carga e instruções gerais.',
    status: 'ativo',
    isDefault: true,
    layoutTipo: 'padrao',
  },
  {
    id: 'mod_graos_granel',
    nome: 'Modelo Grãos / Granel',
    descricao: 'Otimizado para embarque de soja, milho e farelo com campos de classificação, umidade e tolerância de quebra.',
    status: 'ativo',
    layoutTipo: 'graos',
  },
  {
    id: 'mod_fertilizantes_ensacados',
    nome: 'Modelo Fertilizantes & Ensacados',
    descricao: 'Direcionado a fertilizantes, químicos e carga ensacada com checklist de amarração e lona.',
    status: 'ativo',
    layoutTipo: 'fertilizantes',
  },
  {
    id: 'mod_bunge_export',
    nome: 'Modelo Trading / Exportação (Porto)',
    descricao: 'Modelo com instruções de agendamento em porto, terminal de descarga e número de booking/DI.',
    status: 'ativo',
    layoutTipo: 'personalizado',
  },
  {
    id: 'mod_simplificado_ticket',
    nome: 'Modelo Simplificado (Ticket / Minuta)',
    descricao: 'Impressão compacta tipo ticket com dados essenciais para conferência em balança.',
    status: 'ativo',
    layoutTipo: 'simplificado',
  },
];

export function getLoadingOrderModelById(
  id?: string,
  customModels?: LoadingOrderModel[]
): LoadingOrderModel | undefined {
  if (!id) return undefined;
  const list = customModels && customModels.length > 0 ? customModels : DEFAULT_LOADING_ORDER_MODELS;
  return list.find((m) => m.id === id) || DEFAULT_LOADING_ORDER_MODELS.find((m) => m.id === id);
}

export function getLoadingOrderModelName(
  id?: string,
  customModels?: LoadingOrderModel[]
): string {
  const model = getLoadingOrderModelById(id, customModels);
  return model ? model.nome : 'Padrão do Sistema';
}

// ==========================================
// RDO NACIONAL (INTEGRAÇÃO DE ANÁLISE CADASTRAL)
// ==========================================

export type RdoExtensaoArquivo = 'pdf' | 'png' | 'jpg' | 'jpeg';

export type RdoStatus = 'pendente' | 'aprovado' | 'consta_informacao' | 'erro';

export interface RdoSolicitacaoPayload {
  nomeDoCliente?: string;
  cpf: string;
  nome: string;
  nomeDaMae?: string;
  dataDeNascimento?: string; // AAAA-MM-DD
  documentoDoProprietario?: string;
  nomeDoProprietario?: string;
  placaDoCavalo?: string;
  cnhBase64?: string;
  cnhExtensao?: RdoExtensaoArquivo;
}

export interface RdoSolicitacaoResponse {
  id: string; // GUID da solicitação
  codigo: number; // Código sequencial
  message?: string;
}

export interface RdoParecerWebhookPayload {
  idSolicitacao: string;
  parecer: 0 | 1; // 0: Sem restrição, 1: Consta informação
  observacao?: string | null;
  cpf: string;
  nome: string;
  documentoDoProprietario?: string;
  nomeDoProprietario?: string;
  placa?: string;
}

export interface RdoRequestRecord {
  id: string; // GUID
  codigo: number;
  shipmentId?: string;
  driverId?: string;
  cpf: string;
  nome: string;
  nomeDaMae?: string;
  dataDeNascimento?: string;
  documentoDoProprietario?: string;
  nomeDoProprietario?: string;
  placaDoCavalo?: string;
  status: RdoStatus;
  parecer?: number; // 0 ou 1
  observacao?: string;
  cnhUrl?: string;
  createdAt: string;
  updatedAt?: string;
  concludedAt?: string;
  createdById?: string;
  createdByName?: string;
  rawResponse?: any;
  rawWebhookPayload?: any;
}

export interface RdoConfig {
  apiToken: string;
  callbackToken: string;
  apiUrl: string;
  clientName: string;
  enabled: boolean;
  autoApproveInRisk?: boolean;
}

// Re-export dos tipos do módulo SIGA GR
export * from './types/sigaGr';

// Re-export de StayRecord para gestão de estadias
export type { StayRecord } from './utils/toolStorage';



