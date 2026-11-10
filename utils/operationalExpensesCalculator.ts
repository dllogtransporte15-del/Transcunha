import { Shipment, Cargo, OperationalExpenseItem, RealProfitData, RISK_QUERY_COST_MAP, ShipmentStatus } from '../types';
import { calculateTacTaxDeductions } from './freightCalculation';
import { StayRecord, extractCteNumberFromStay } from './toolStorage';
import { isStayForShipment } from '../utils';

export interface OperationalExpensesConfig {
  insuranceAcidenteRate: number; // 0.0125% -> 0.000125
  insuranceRouboRate: number;    // 0.0125% -> 0.000125
  insuranceRcvPerLoad: number;   // R$ 5,00 por carga
  patronalPfRate: number;        // 4% sobre (Frete Motorista - Pedágio) se PF (CPRB) -> 0.04
  ciotRate: number;              // 0.20% sobre frete do motorista -> 0.0020
  custoFixoRate: number;         // 0.35% sobre frete bruto -> 0.0035
  comissaoComercialRate: number; // 0.20% sobre frete bruto -> 0.0020
  simplesNacionalFederalRate: number; // 3.40% sobre Frete Empresa Bruto (Anexo III) -> 0.0340
}

export const DEFAULT_EXPENSES_CONFIG: OperationalExpensesConfig = {
  insuranceAcidenteRate: 0.000125, // 0.0125%
  insuranceRouboRate: 0.000125,    // 0.0125%
  insuranceRcvPerLoad: 5.00,       // R$ 5,00 por carga
  patronalPfRate: 0.04,            // 4% de INSS Patronal / CPRB sobre (Frete Motorista - Pedágio) se PF
  ciotRate: 0.0020,                // 0,20% sobre o Frete Motorista
  custoFixoRate: 0.0035,           // 0,35% sobre Frete Bruto
  comissaoComercialRate: 0.0020,   // 0,20% sobre Frete Bruto
  simplesNacionalFederalRate: 0.0340, // 3,40% sobre Frete Empresa Bruto (Anexo III)
};

export interface CalculatedOperationalExpenses {
  companyFreight: number;
  driverFreight: number;
  invoiceValue: number;
  insuranceBaseValue: number;
  insuranceAcidente: number;
  insuranceRoubo: number;
  insuranceRcv: number;
  totalInsurance: number;
  icmsPercentage: number;
  icmsBruto: number;
  icms: number;
  freteLiquidoIcms: number;
  freightDifference: number;
  freightDifferenceMarginPercent: number;
  impostoFederal: number;
  inssPatronal: number;
  ciot: number;
  custoFixo: number;
  comissaoComercial: number;
  salespersonCommission: number;
  shipperCommission: number;
  agencyCommission: number;
  driverExtraPayments?: number;
  demurrageRevenue?: number;
  demurrageDriverPaid?: number;
  demurrageProfit?: number;
  stayIcmsTotal?: number;
  stayFederalTaxTotal?: number;
  riskCost: number;
  financialCostValue: number;
  financialCostEffectiveRate: number;
  financialCostMonthlyRate: number;
  financialCostDaysTerm: number;
  generatedCredit: number;
  expenseItems: OperationalExpenseItem[];
  totalExpenses: number; // Total deduções sem frete motorista
  totalDeducoesComFrete: number; // Total deduções com frete motorista
  netProfit: number;
  profitMarginPercent: number;
}

/**
 * Calcula todas as despesas operacionais e tributárias com a lógica exata da "Automatização do CT-e":
 * 1. Frete Empresa Bruto e Frete Motorista
 * 2. ICMS Destacado Integral
 * 3. Frete Empresa Líquido (Frete Bruto - ICMS Destacado)
 * 4. Diferença de Frete / Spread Comercial (Frete Líquido - Frete Motorista)
 * 5. Imposto Federal (Exportação: R$ 0 | Mercado Interno PF: 3,655% s/ Líquido | PJ: 9,25% s/ Spread)
 * 6. INSS Patronal / CPRB (PF: 3% s/ Bruto | PJ: R$ 0 Isento)
 * 7. Seguros Averbados (RCV R$ 5,00 + Acidente e Roubo 0,025% s/ NF+18%)
 * 8. CIOT (0,20% s/ Frete Motorista)
 * 9. Custo Fixo (0,35% s/ Frete Bruto)
 * 10. Comissão Comercial (0,20% s/ Frete Bruto)
 * 11. Comissão Vendedor Externo (se informada)
 * 12. Gerenciadora de Risco (GR)
 * 13. Fechamento do Lucro Líquido Real e Margem %
 */
export function calculateShipmentExpenses(
  shipment: Shipment,
  cargo?: Cargo,
  config: OperationalExpensesConfig = DEFAULT_EXPENSES_CONFIG,
  stays?: StayRecord[]
): CalculatedOperationalExpenses {
  const companyFreightRate = shipment.companyFreightRateSnapshot || cargo?.companyFreightValuePerTon || 0;
  const tonnage = shipment.shipmentTonnage || cargo?.totalVolume || 0;

  // 1. Frete Empresa Bruto
  const calculatedCompanyFreight = (companyFreightRate > 0 && tonnage > 0) ? Number((companyFreightRate * tonnage).toFixed(2)) : 0;
  const companyFreight = (calculatedCompanyFreight > 0 && shipment.realProfitData?.companyFreight && Math.abs(shipment.realProfitData.companyFreight - calculatedCompanyFreight) > 5.00 && (shipment.companyFreightRateSnapshot || cargo?.companyFreightValuePerTon))
    ? calculatedCompanyFreight
    : (shipment.realProfitData?.companyFreight !== undefined && shipment.realProfitData.companyFreight > 0
        ? shipment.realProfitData.companyFreight
        : (calculatedCompanyFreight > 0 ? calculatedCompanyFreight : (shipment.driverFreightValue || 0)));

  // 2. Frete Motorista
  const driverRate = shipment.driverFreightRateSnapshot || cargo?.driverFreightValuePerTon || 0;
  const calculatedDriverFreight = (driverRate > 0 && tonnage > 0) ? Number((driverRate * tonnage).toFixed(2)) : 0;
  const driverFreight = shipment.realProfitData?.driverFreight !== undefined && shipment.realProfitData.driverFreight > 0
    ? shipment.realProfitData.driverFreight 
    : ((calculatedDriverFreight > 0 && shipment.driverFreightValue && Math.abs(Number(shipment.driverFreightValue) - calculatedDriverFreight) > 5.00 && shipment.driverFreightRateSnapshot)
        ? calculatedDriverFreight
        : (Number(shipment.driverFreightValue) || calculatedDriverFreight));

  // Perfil PF vs PJ (PJ / ETC é 100% isento de INSS Patronal / CPRB)
  const isExplicitPj = shipment.driverFreightType === 'PJ' || 
    shipment.anttModality === 'ETC' || 
    (shipment as any)?.selectedRegime === 'PJ' || 
    (shipment as any)?.selectedRegime === 'ETC' || 
    (shipment as any)?.selectedRegime === 'Lucro Real / Presumido' || 
    (shipment as any)?.selectedRegime === 'Lucro Real' || 
    (shipment as any)?.selectedRegime === 'Lucro Presumido' || 
    (shipment as any)?.selectedRegime === 'Simples Nacional' || 
    (shipment as any)?.selectedRegime === 'MEI';

  const isShipmentPf = !isExplicitPj && (
    shipment.driverFreightType === 'PF' || 
    shipment.anttModality === 'TAC' || 
    (shipment as any)?.selectedRegime === 'PF' || 
    (shipment as any)?.selectedRegime === 'TAC'
  );

  // Verificação de Carga Exportação (Destino Porto, Terminal Retroportuário, EADI, Armazém Alfandegado, CFOP 6353, CST 40)
  const isExportCargo = cargo?.isExport !== undefined
    ? cargo.isExport
    : (shipment.isExport !== undefined
        ? shipment.isExport
        : Boolean(
            (cargo?.observations && /export|cfop\s*6353|cst\s*40/i.test(cargo.observations)) ||
            (cargo?.destination && /(porto|terminal|retroportu[aá]rio|eadi|alfandeg|armaz[eé]m|embarque portu[aá]rio|santos|paranagu[aá]|itaqui|rio grande|barcarena|suape|vit[oó]ria)/i.test(cargo.destination)) ||
            ((shipment as any)?.observations && /export|cfop\s*6353|cst\s*40/i.test((shipment as any).observations)) ||
            ((shipment as any)?.destination && /(porto|terminal|retroportu[aá]rio|eadi|alfandeg|armaz[eé]m|embarque portu[aá]rio|santos|paranagu[aá]|itaqui|rio grande|barcarena|suape|vit[oó]ria)/i.test((shipment as any).destination)) ||
            ((shipment.documents as any)?.cfop === '6353' || (shipment.documents as any)?.cst === '40')
          ));

  // 3. ICMS Destacado Completo
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

  // Prioridade 1: Carga sem ICMS, isenção explícita ou ICMS zerado
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

  const icmsDocExplicit = !isIcmsExemptExplicit && (shipment.realProfitData?.icmsDifference !== undefined && shipment.realProfitData.icmsDifference !== null && Number(shipment.realProfitData.icmsDifference) > 0)
    ? Number(shipment.realProfitData.icmsDifference)
    : (!isIcmsExemptExplicit ? (Number((shipment.documents as any)?.icms_value) || Number(shipment.icmsValue) || 0) : 0);

  const icmsPercentage = isIcmsExemptExplicit ? 0 : (cargo?.icmsPercentage || (cargo?.hasIcms ? 7 : ((shipment as any)?.icmsPercentage || 0)));
  const icmsCalculado = (!isIcmsExemptExplicit && cargo?.hasIcms && icmsPercentage > 0)
    ? Number((companyFreight * (icmsPercentage / 100)).toFixed(2))
    : 0;

  const icms = isIcmsExemptExplicit ? 0 : (icmsDocExplicit > 0 ? icmsDocExplicit : icmsCalculado);
  const icmsBruto = icms;

  // 4. Frete Empresa Líquido de ICMS
  const freteLiquidoIcms = Math.max(0, companyFreight - icms);

  // 5. Diferença de Frete / Spread Comercial
  const freightDifference = Number((freteLiquidoIcms - driverFreight).toFixed(2));
  const freightDifferenceMarginPercent = freteLiquidoIcms > 0
    ? Number(((freightDifference / freteLiquidoIcms) * 100).toFixed(2))
    : 0;

  // 6. Imposto Federal (Simples Nacional 3,40% s/ Frete Bruto | PF: 3,655% s/ Líquido | PJ Normal: 9,25% s/ Spread)
  const isSimplesNacional = Boolean(
    shipment.etcTaxRegime === 'Simples Nacional' ||
    shipment.etcTaxRegime === 'MEI' ||
    (shipment as any)?.isSimplesNacional ||
    (cargo as any)?.isSimplesNacional ||
    (shipment.documents as any)?.etc_tax_regime === 'Simples Nacional' ||
    (shipment.documents as any)?.etc_tax_regime === 'MEI' ||
    (shipment.documents as any)?.crt === '1' ||
    (shipment.documents as any)?.crt === '2'
  );

  const simplesFederalRate = config.simplesNacionalFederalRate ?? 0.0340;
  const impostoFederalSimples = Number((companyFreight * simplesFederalRate).toFixed(2));
  const impostoFederalPf = Number((freteLiquidoIcms * 0.03655).toFixed(2));
  const impostoFederalPjSpread = Number((Math.max(0, freightDifference) * 0.0925).toFixed(2));

  let impostoFederalMercadoInterno = 0;
  if (isSimplesNacional) {
    impostoFederalMercadoInterno = impostoFederalSimples;
  } else if (isShipmentPf) {
    impostoFederalMercadoInterno = impostoFederalPf;
  } else {
    impostoFederalMercadoInterno = impostoFederalPjSpread;
  }

  const isFederalTaxManual = Boolean(
    shipment.isFederalTaxManual === true ||
    shipment.realProfitData?.isFederalTaxManual === true ||
    (shipment.documents as any)?.is_federal_tax_manual === true
  );

  const manualFederalTax = isFederalTaxManual
    ? ((shipment.realProfitData?.federalTax !== undefined && shipment.realProfitData.federalTax !== null)
        ? Number(shipment.realProfitData.federalTax)
        : ((shipment.federalTax !== undefined && shipment.federalTax !== null)
            ? Number(shipment.federalTax)
            : ((shipment.documents as any)?.federal_tax !== undefined && (shipment.documents as any)?.federal_tax !== null
                ? Number((shipment.documents as any).federal_tax)
                : ((shipment.documents as any)?.imposto_federal !== undefined && (shipment.documents as any)?.imposto_federal !== null
                    ? Number((shipment.documents as any).imposto_federal)
                    : ((shipment.documents as any)?.real_profit_data?.federalTax !== undefined && (shipment.documents as any)?.real_profit_data?.federalTax !== null
                        ? Number((shipment.documents as any).real_profit_data.federalTax)
                        : undefined)))))
    : undefined;

  const impostoFederal = manualFederalTax !== undefined
    ? manualFederalTax
    : (isExportCargo ? 0 : impostoFederalMercadoInterno);

  const isComplementar = Boolean(
    shipment.isComplementar || 
    (shipment.documents as any)?.is_complementar || 
    (shipment.documents as any)?.isComplementar
  );

  // 7. INSS Patronal / CPRB (4% sobre Frete Motorista - Pedágio se PF, Isento se PJ)
  // No complementar, pedágio é sempre 0 e NÃO é descontado
  const rawToll = isComplementar
    ? 0
    : (shipment.tollValue !== undefined && shipment.tollValue !== null && !isNaN(Number(shipment.tollValue))
        ? Number(shipment.tollValue)
        : (Number(shipment.realProfitData?.toll) ||
           Number((shipment.documents as any)?.toll_value) ||
           Number((shipment.documents as any)?.valor_pedagio) ||
           Number((shipment.documents as any)?.financeiro?.valorPedagio) ||
           0));
  const toll = (!isNaN(rawToll) && rawToll >= 0 && rawToll <= 25000) ? rawToll : 0;
  const baseInssPatronal = Math.max(0, driverFreight - toll);
  const inssPatronal = isShipmentPf && baseInssPatronal > 0 
    ? Number((baseInssPatronal * config.patronalPfRate).toFixed(2)) 
    : 0;

  // 8. Valor da NF e Base de Seguro (+18% somente em carga de exportação)
  const invoiceValue = shipment.nfeValue || 
                       shipment.realProfitData?.invoiceValue || 
                       (shipment.documents as any)?.nfe_value ||
                       (shipment.documents as any)?.valor_mercadoria ||
                       (shipment.documents as any)?.vMerc ||
                       (shipment.documents as any)?.invoice_value ||
                       (shipment.documents as any)?.carga?.valorMercadoria ||
                       0;
  const insuranceBaseValue = invoiceValue > 0 
    ? Number((invoiceValue * (isExportCargo ? 1.18 : 1.00)).toFixed(2)) 
    : 0;

  // 9. Seguros Averbados
  const insuranceAcidente = insuranceBaseValue > 0 
    ? Number((insuranceBaseValue * config.insuranceAcidenteRate).toFixed(2)) 
    : 0;
  const insuranceRoubo = insuranceBaseValue > 0 
    ? Number((insuranceBaseValue * config.insuranceRouboRate).toFixed(2)) 
    : 0;
  const insuranceRcv = isComplementar ? 0 : config.insuranceRcvPerLoad;
  const totalInsurance = Number((insuranceAcidente + insuranceRoubo + insuranceRcv).toFixed(2));

  // 10. CIOT (0,20% s/ Frete Líquido do Motorista: deduz pedágio e, para TAC/PF, retenções de INSS e SEST/SENAT)
  let baseCiot = Math.max(0, driverFreight - toll);
  if (isShipmentPf && baseCiot > 0) {
    const tacTaxes = calculateTacTaxDeductions(driverFreight, toll);
    baseCiot = Math.max(0, baseCiot - tacTaxes.inss - tacTaxes.sestSenat);
  }
  const isCiotManual = Boolean((shipment.realProfitData as any)?.isCiotManual);
  const manualCiot = (shipment.realProfitData as any)?.ciot;
  // No complementar, CIOT é SEMPRE R$ 0,00 (NÃO é descontado no Complementar)
  const ciot = isComplementar
    ? 0
    : (isCiotManual && manualCiot !== undefined
        ? Number(manualCiot)
        : (baseCiot > 0 ? Number((baseCiot * config.ciotRate).toFixed(2)) : 0));

  // 11. Custo Fixo (0,35% s/ Frete Bruto)
  const custoFixo = companyFreight > 0 
    ? (shipment.realProfitData?.otherCosts !== undefined && shipment.realProfitData.otherCosts > 0 
        ? shipment.realProfitData.otherCosts 
        : Number((companyFreight * config.custoFixoRate).toFixed(2)))
    : 0;

  // 12. Comissão Comercial (0,20% s/ Frete Bruto)
  const comissaoComercial = shipment.commercialCommission !== undefined && shipment.commercialCommission > 0
    ? shipment.commercialCommission
    : (shipment.realProfitData?.commission !== undefined && shipment.realProfitData.commission > 0
        ? shipment.realProfitData.commission
        : (companyFreight > 0 ? Number((companyFreight * config.comissaoComercialRate).toFixed(2)) : 0));

  // 13. Comissão Vendedor Externo (se houver na carga)
  const salespersonRate = Number(cargo?.salespersonCommissionPerTon) || 0;
  const salespersonCommission = (salespersonRate > 0 && tonnage > 0)
    ? Number((salespersonRate * tonnage).toFixed(2))
    : 0;

  // 14. Gerenciadora de Risco (GR)
  const isRiskRequired = Boolean(
    (cargo as any)?.requiresRiskManagement !== false &&
    (shipment as any)?.requiresRiskManagement !== false &&
    (cargo as any)?.product?.requiresRiskManagement !== false
  );

  let historyRiskType: string | undefined;
  let historyRiskCost: number | undefined;

  if (Array.isArray(shipment.history)) {
    for (const h of shipment.history) {
      const msg = typeof h === 'string' ? h : ((h as any)?.description || (h as any)?.message || '');
      const matchGr = msg.match(/Libera[çc][ãa]o\s+de\s+Seguradora:\s*(?:C[óo]d\s*)?([^\(\n]+?)\s*\(([^-\)]+?)(?:\s*-\s*R\$\s*([\d.,]+))?\)/i);
      if (matchGr) {
        if (matchGr[2] && matchGr[2].trim()) historyRiskType = matchGr[2].trim();
        if (matchGr[3] && matchGr[3].trim()) {
          const c = parseFloat(matchGr[3].replace('.', '').replace(',', '.'));
          if (!isNaN(c)) historyRiskCost = c;
        }
      }
    }
  }

  const effectiveRiskType = shipment.riskQueryType || historyRiskType;
  
  const isPreCadastroOrSeguradora = shipment.status === ShipmentStatus.PreCadastro || 
    shipment.status === ShipmentStatus.AguardandoSeguradora || 
    (shipment.status as string) === 'Ag. Cadastro' || 
    (shipment.status as string) === 'Aguardando Cadastro' ||
    (shipment.status as string) === 'Ag. Seguradora';

  let riskCost = 0;
  if (isComplementar) {
    riskCost = 0; // Consulta GR já realizada no embarque principal
  } else if (!isRiskRequired) {
    riskCost = (shipment.riskQueryCost !== undefined && shipment.riskQueryCost !== null && Number(shipment.riskQueryCost) > 0) ? Number(shipment.riskQueryCost) : 0;
  } else if (shipment.riskQueryCost !== undefined && shipment.riskQueryCost !== null && Number(shipment.riskQueryCost) > 0) {
    riskCost = Number(shipment.riskQueryCost);
  } else if (historyRiskCost !== undefined && historyRiskCost !== null && Number(historyRiskCost) > 0) {
    riskCost = historyRiskCost;
  } else if (effectiveRiskType && effectiveRiskType !== 'Pendente de Definição') {
    riskCost = (RISK_QUERY_COST_MAP[effectiveRiskType] ?? RISK_QUERY_COST_MAP[effectiveRiskType.toLowerCase().trim()] ?? 6.50);
  } else if (shipment.riskReleaseCode && !isPreCadastroOrSeguradora) {
    riskCost = 6.50;
  } else if ((shipment.status === ShipmentStatus.Cancelado || (shipment as any)?.releaseStatus === 'Reprovado') && !isPreCadastroOrSeguradora) {
    const inferredType = effectiveRiskType || 'Cadastro Geral + Biometria';
    riskCost = RISK_QUERY_COST_MAP[inferredType] ?? RISK_QUERY_COST_MAP[inferredType.toLowerCase().trim()] ?? 31.50;
  } else {
    riskCost = 0;
  }

  // 14.1 Crédito Gerado (Exportação):
  // - PF (TAC / Terceiro PF): 6,52834% s/ BC Serviço (ICMS 12% * 54,39%)
  // - PJ (Lucro Real / Presumido / Simples Nacional / MEI): 6,5136% s/ BC Crédito (ICMS 12% * 54,28%)
  const baseCompanyFreightNoToll = Math.max(0, companyFreight - toll);
  const baseDriverFreightNoToll = Math.max(0, driverFreight - toll);
  const exportCreditRate = isShipmentPf ? 0.0652834 : 0.065136;
  const isCreditManual = Boolean(
    shipment.isGeneratedCreditManual === true ||
    shipment.realProfitData?.isGeneratedCreditManual === true ||
    (shipment.documents as any)?.is_generated_credit_manual === true
  );
  const manualCreditVal = isCreditManual
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
  const autoCredit = isExportCargo ? shipment.realProfitData?.generatedCredit : 0;
  const calculatedCredit = (isExportCargo && baseCompanyFreightNoToll > 0)
    ? Number((baseCompanyFreightNoToll * exportCreditRate).toFixed(2))
    : (isExportCargo && baseDriverFreightNoToll > 0 ? Number((baseDriverFreightNoToll * exportCreditRate).toFixed(2)) : 0);
  const generatedCredit = isCreditManual && manualCreditVal !== undefined 
    ? manualCreditVal 
    : ((autoCredit !== undefined && autoCredit > 0) ? autoCredit : (isExportCargo ? calculatedCredit : 0));

  // 15. Montagem discriminada dos itens de despesa operacionais
  const expenseItems: OperationalExpenseItem[] = [];

  if (icms > 0) {
    expenseItems.push({
      name: `ICMS Destacado (${icmsPercentage}% CT-e)`,
      value: icms,
      type: 'negative'
    });
  }

  if (impostoFederal > 0) {
    const federalLabel = isSimplesNacional
      ? `Imposto Federal (${(simplesFederalRate * 100).toFixed(2).replace('.', ',')}% Simples Nacional Anexo III)`
      : isShipmentPf
        ? 'Imposto Federal (3,655% s/ Líq.)'
        : 'Imposto Federal (9,25% s/ Spread)';

    expenseItems.push({
      name: federalLabel,
      value: impostoFederal,
      type: 'negative'
    });
  }

  if (inssPatronal > 0) {
    expenseItems.push({
      name: `INSS Patronal / CPRB (4% s/ Frete Mot. - Pedágio)`,
      value: inssPatronal,
      type: 'negative'
    });
  }

  if (insuranceAcidente > 0) {
    expenseItems.push({
      name: `Seguro Averbado - Acidente (0,0125% s/ ${isExportCargo ? 'NF+18%' : 'NF'})`,
      value: insuranceAcidente,
      type: 'negative'
    });
  }

  if (insuranceRoubo > 0) {
    expenseItems.push({
      name: `Seguro Averbado - Roubo (0,0125% s/ ${isExportCargo ? 'NF+18%' : 'NF'})`,
      value: insuranceRoubo,
      type: 'negative'
    });
  }

  if (insuranceRcv > 0) {
    expenseItems.push({
      name: `Seguro Averbado - RCV (R$ 5,00 / carga)`,
      value: insuranceRcv,
      type: 'negative'
    });
  }

  if (ciot > 0) {
    const ciotLabel = isShipmentPf
      ? `CIOT (0,20% s/ Frete Mot. - Pedágio - INSS - SEST/SENAT)`
      : (toll > 0 ? `CIOT (0,20% s/ Frete Mot. - Pedágio)` : `CIOT (0,20% s/ Frete Motorista)`);
    expenseItems.push({
      name: ciotLabel,
      value: ciot,
      type: 'negative'
    });
  }

  if (custoFixo > 0) {
    expenseItems.push({
      name: `Custo Fixo (0,35% s/ Frete Bruto)`,
      value: custoFixo,
      type: 'negative'
    });
  }

  if (comissaoComercial > 0) {
    expenseItems.push({
      name: `Comissão Comercial (0,20% s/ Frete Bruto)`,
      value: comissaoComercial,
      type: 'negative'
    });
  }

  if (salespersonCommission > 0) {
    expenseItems.push({
      name: `Comissão Vendedor (${cargo?.salespersonName || 'Externo'})`,
      value: salespersonCommission,
      type: 'negative'
    });
  }

  if (riskCost > 0) {
    expenseItems.push({
      name: `Gerenciadora de Risco (GR${shipment.riskQueryType ? ` - ${shipment.riskQueryType}` : ''})`,
      value: riskCost,
      type: 'negative'
    });
  }

  // 14.1.1 Custo Financeiro (pro rata s/ Frete Empresa conforme taxa mensal e prazo)
  const isFinancialCostActive = Boolean(
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

  const calculatedFinancialCost = (financialCostEffectiveRate > 0 && companyFreight > 0)
    ? Number((companyFreight * (financialCostEffectiveRate / 100)).toFixed(2))
    : 0;

  const financialCostValue = calculatedFinancialCost > 0
    ? calculatedFinancialCost
    : ((shipment.financialCostValue !== undefined && shipment.financialCostValue !== null && Number(shipment.financialCostValue) > 0)
        ? Number(shipment.financialCostValue)
        : (isFinancialCostActive ? calculatedFinancialCost : 0));

  if (financialCostValue > 0) {
    expenseItems.push({
      name: `Custo Financeiro (${financialCostEffectiveRate.toFixed(2).replace('.', ',')}% - ${financialCostDaysTerm} dias a ${financialCostMonthlyRate}% a.m.)`,
      value: financialCostValue,
      type: 'negative'
    });
  }

  // 14.2 Comissão do Embarcador (Informativo - não deduz do Resultado (=))
  const isShipperCommEnabled = Boolean(
    shipment.shipperCommissionEnabled === true ||
    (shipment.documents as any)?.shipper_commission_enabled === true ||
    shipment.realProfitData?.shipperCommissionEnabled === true
  );

  const shipperCommRate = shipment.shipperCommissionRatePerTon !== undefined && shipment.shipperCommissionRatePerTon !== null
    ? Number(shipment.shipperCommissionRatePerTon)
    : ((shipment.documents as any)?.shipper_commission_rate_per_ton !== undefined && (shipment.documents as any)?.shipper_commission_rate_per_ton !== null
        ? Number((shipment.documents as any).shipper_commission_rate_per_ton)
        : (shipment.realProfitData?.shipperCommissionRatePerTon !== undefined && shipment.realProfitData?.shipperCommissionRatePerTon !== null
            ? Number(shipment.realProfitData.shipperCommissionRatePerTon)
            : 0));

  const shipperCommission = (isShipperCommEnabled && shipperCommRate > 0 && tonnage > 0)
    ? Number((shipperCommRate * tonnage).toFixed(2))
    : (isShipperCommEnabled && shipment.shipperCommissionValue !== undefined && shipment.shipperCommissionValue !== null
        ? Number(shipment.shipperCommissionValue)
        : (isShipperCommEnabled && shipment.realProfitData?.shipperCommission !== undefined && shipment.realProfitData?.shipperCommission !== null
            ? Number(shipment.realProfitData.shipperCommission)
            : 0));

  // 14.3 Comissão de Agência (Informativo - não deduz do Resultado (=))
  const isAgencyCommEnabled = Boolean(
    shipment.agencyCommissionEnabled === true ||
    (shipment.documents as any)?.agency_commission_enabled === true ||
    shipment.realProfitData?.agencyCommissionEnabled === true
  );

  const agencyCommPercentage = shipment.agencyCommissionPercentage !== undefined && shipment.agencyCommissionPercentage !== null
    ? Number(shipment.agencyCommissionPercentage)
    : ((shipment.documents as any)?.agency_commission_percentage !== undefined && (shipment.documents as any)?.agency_commission_percentage !== null
        ? Number((shipment.documents as any).agency_commission_percentage)
        : 30);

  // Despesas adicionais que já estavam no realProfitData
  const existingItems = shipment.realProfitData?.expenseItems || [];
  for (const item of existingItems) {
    const lower = item.name.toLowerCase();
    const isDuplicate = 
      lower.includes('icms') ||
      lower.includes('imposto federal') ||
      lower.includes('inss patronal') ||
      lower.includes('cprb') ||
      lower.includes('acidente') ||
      lower.includes('roubo') ||
      lower.includes('rcv') ||
      lower.includes('ciot') ||
      lower.includes('custo fixo') ||
      lower.includes('comissão comercial') ||
      lower.includes('comissao comercial') ||
      lower.includes('comissão vendedor') ||
      lower.includes('comissao vendedor') ||
      lower.includes('comissão embarcador') ||
      lower.includes('comissao embarcador') ||
      lower.includes('comissão agência') ||
      lower.includes('comissao agencia') ||
      lower.includes('comissão de agência') ||
      lower.includes('comissao de agencia') ||
      lower.includes('agenciamento') ||
      lower.includes('agenciador') ||
      lower.includes('custo financeiro') ||
      lower.includes('gr') ||
      lower.includes('gerenciadora') ||
      lower.includes('estadia') ||
      lower.includes('diária') ||
      lower.includes('diaria');

    if (!isDuplicate && Number(item.value) > 0) {
      expenseItems.push(item);
    }
  }

  // 14.4 Acréscimo Avulso ao Motorista (Diárias, Estadia, Bônus, Ajuda de Custo)
  // Identifica se há estadias vinculadas (via parâmetro stays ou shipment.stays)
  const linkedStays = (stays && stays.length > 0)
    ? stays.filter(st => isStayForShipment(st, shipment))
    : ((shipment as any).stays && Array.isArray((shipment as any).stays) ? (shipment as any).stays.filter((st: any) => isStayForShipment(st, shipment)) : []);

  const demurrageRevenue = linkedStays.reduce((sum: number, st: any) => sum + (Number(st.approvedValue ?? st.approved_value) || 0), 0);
  const demurrageDriverPaid = linkedStays.reduce((sum: number, st: any) => sum + (Number(st.driverPaidValue ?? st.driver_paid_value) || 0), 0);
  const demurrageProfit = demurrageRevenue - demurrageDriverPaid;

  // Tributos do CT-e Complementar de Estadia (ICMS e Imposto Federal)
  let stayIcmsTotal = 0;
  let stayFederalTaxTotal = 0;

  if (linkedStays.length > 0) {
    for (const st of linkedStays) {
      const cteNum = st.cteNumber || extractCteNumberFromStay(st) || 'S/N';
      const stApproved = Number(st.approvedValue ?? st.approved_value) || 0;

      // ICMS do CT-e Complementar
      const stIcmsPct = st.icmsPercentage !== undefined && st.icmsPercentage !== null
        ? Number(st.icmsPercentage)
        : (icmsPercentage > 0 && !isIcmsExemptExplicit ? icmsPercentage : 0);

      const stIcmsVal = st.icmsValue !== undefined && st.icmsValue !== null
        ? Number(st.icmsValue)
        : ((isIcmsExemptExplicit || stIcmsPct <= 0 || stApproved <= 0)
            ? 0
            : Number(((stApproved * (stIcmsPct / 100))).toFixed(2)));

      if (stIcmsVal > 0) {
        stayIcmsTotal += stIcmsVal;
        expenseItems.push({
          name: `ICMS CT-e Comp. Estadia (CT-e nº ${cteNum}) (${stIcmsPct}%)`,
          value: stIcmsVal,
          type: 'negative'
        });
      }

      // Imposto Federal do CT-e Complementar
      const defaultFedRate = isSimplesNacional ? simplesFederalRate : (isShipmentPf ? 0.03655 : 0.0925);
      const stFedTaxVal = st.federalTaxValue !== undefined && st.federalTaxValue !== null
        ? Number(st.federalTaxValue)
        : (isExportCargo ? 0 : (defaultFedRate > 0 && stApproved > 0 ? Number((stApproved * defaultFedRate).toFixed(2)) : 0));

      if (stFedTaxVal > 0) {
        stayFederalTaxTotal += stFedTaxVal;
        expenseItems.push({
          name: `Imposto Federal CT-e Comp. Estadia (CT-e nº ${cteNum})`,
          value: stFedTaxVal,
          type: 'negative'
        });
      }
    }
  }

  const rawExtraPayments = Array.isArray(shipment.driverExtraPayments) ? shipment.driverExtraPayments : [];
  let stayExtraPayments = 0;
  let otherExtraPayments = 0;

  if (rawExtraPayments.length > 0) {
    for (const p of rawExtraPayments) {
      const amt = Number(p.amount) || 0;
      if (/di[aá]ria|estadia/i.test(p.reason || '')) {
        stayExtraPayments += amt;
      } else {
        otherExtraPayments += amt;
      }
    }
  } else {
    const totalExtra = Number(shipment.driverExtraPaymentsTotal || 0) || Number(shipment.realProfitData?.driverSurcharge || 0) || 0;
    if (demurrageDriverPaid > 0 && Math.abs(totalExtra - demurrageDriverPaid) < 1.0) {
      stayExtraPayments = totalExtra;
    } else {
      otherExtraPayments = totalExtra;
    }
  }

  // Se o pagamento de estadia ao motorista já está computado nas estadias vinculadas
  // (demurrageDriverPaid > 0) ou se houver receita de CT-e complementar (demurrageRevenue > 0):
  // o valor pago ao motorista já é integrado na apuração de estadias (demurrageProfit = demurrageRevenue - demurrageDriverPaid).
  // Abater novamente o valor da estadia como "Acréscimo Avulso" duplicaria o desconto ao motorista sem a contrapartida da receita!
  const stayAlreadyAccountedFor = demurrageDriverPaid > 0
    ? Math.min(demurrageDriverPaid, stayExtraPayments)
    : (demurrageRevenue > 0 ? Math.min(demurrageRevenue, stayExtraPayments) : 0);

  const effectiveStayExtra = Math.max(0, stayExtraPayments - stayAlreadyAccountedFor);
  const effectiveDriverExtra = Number((otherExtraPayments + effectiveStayExtra).toFixed(2));

  if (effectiveDriverExtra > 0) {
    const hasExistingExtra = expenseItems.some(i => i.name.toLowerCase().includes('acréscimo avulso') || i.name.toLowerCase().includes('acrescimo avulso'));
    if (!hasExistingExtra) {
      expenseItems.push({
        name: otherExtraPayments > 0 && effectiveStayExtra > 0
          ? 'Acréscimo Avulso Motorista (Bônus / Diária Excedente)'
          : (effectiveStayExtra > 0 ? 'Acréscimo Avulso (Estadia não Faturada)' : 'Acréscimo Avulso Motorista (Bônus / Ajuda de Custo)'),
        value: Number(effectiveDriverExtra.toFixed(2)),
        type: 'negative'
      });
    }
  }

  // Total das deduções operacionais (sem frete motorista)
  const totalExpenses = Number(
    expenseItems.reduce((acc, curr) => acc + (Number(curr.value) || 0), 0).toFixed(2)
  );

  // Total com frete motorista
  const totalDeducoesComFrete = Number((totalExpenses + driverFreight).toFixed(2));

  // Resultado / Lucro Líquido Real da Operação (SEM somar Crédito Fiscal Gerado, que é estritamente informativo)
  const netProfit = Number((companyFreight - totalDeducoesComFrete).toFixed(2));

  const agencyCommission = (isAgencyCommEnabled && netProfit > 0)
    ? Number((netProfit * (agencyCommPercentage / 100)).toFixed(2))
    : (isAgencyCommEnabled && shipment.agencyCommissionValue !== undefined && shipment.agencyCommissionValue !== null
        ? Number(shipment.agencyCommissionValue)
        : (isAgencyCommEnabled && shipment.realProfitData?.agencyCommission !== undefined && shipment.realProfitData?.agencyCommission !== null
            ? Number(shipment.realProfitData.agencyCommission)
            : 0));

  // Margem Efetiva sobre Frete Bruto
  const profitMarginPercent = companyFreight > 0 
    ? Number(((netProfit / companyFreight) * 100).toFixed(2)) 
    : 0;

  return {
    companyFreight,
    driverFreight,
    invoiceValue,
    insuranceBaseValue,
    insuranceAcidente,
    insuranceRoubo,
    insuranceRcv,
    totalInsurance,
    icmsPercentage,
    icmsBruto,
    icms,
    freteLiquidoIcms,
    freightDifference,
    freightDifferenceMarginPercent,
    impostoFederal,
    inssPatronal,
    ciot,
    custoFixo,
    comissaoComercial,
    salespersonCommission,
    shipperCommission,
    agencyCommission,
    driverExtraPayments: effectiveDriverExtra,
    demurrageRevenue,
    demurrageDriverPaid,
    demurrageProfit,
    stayIcmsTotal: Number(stayIcmsTotal.toFixed(2)),
    stayFederalTaxTotal: Number(stayFederalTaxTotal.toFixed(2)),
    riskCost,
    financialCostValue,
    financialCostEffectiveRate,
    financialCostMonthlyRate,
    financialCostDaysTerm,
    generatedCredit,
    expenseItems,
    totalExpenses,
    totalDeducoesComFrete,
    netProfit,
    profitMarginPercent,
  };
}
