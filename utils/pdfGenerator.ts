
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { Shipment, Cargo, Client, Product, Vehicle } from "../types";
import { findExpedidorRecebedorByName } from "./locationStorage";

export const getStoredCompanyLogo = (): string | null => {
  if (typeof window === 'undefined') return null;
  return (
    localStorage.getItem('transcunha_companyLogo') ||
    localStorage.getItem('trancunha_companyLogo') ||
    null
  );
};

export const addImageContain = (
  doc: jsPDF,
  imageData: string,
  boxX: number,
  boxY: number,
  boxW: number,
  boxH: number,
  alignX: 'left' | 'center' | 'right' = 'center',
  alignY: 'top' | 'center' | 'bottom' = 'center'
): { x: number; y: number; w: number; h: number } | null => {
  try {
    const props = doc.getImageProperties(imageData);
    const natW = props?.width || 0;
    const natH = props?.height || 0;
    const format = (props?.fileType || 'PNG').toUpperCase();

    let drawW = boxW;
    let drawH = boxH;

    if (natW > 0 && natH > 0) {
      const scale = Math.min(boxW / natW, boxH / natH);
      drawW = natW * scale;
      drawH = natH * scale;
    }

    let drawX = boxX;
    if (alignX === 'center') drawX = boxX + (boxW - drawW) / 2;
    else if (alignX === 'right') drawX = boxX + (boxW - drawW);

    let drawY = boxY;
    if (alignY === 'center') drawY = boxY + (boxH - drawH) / 2;
    else if (alignY === 'bottom') drawY = boxY + (boxH - drawH);

    doc.addImage(imageData, format, drawX, drawY, drawW, drawH);
    return { x: drawX, y: drawY, w: drawW, h: drawH };
  } catch (e) {
    console.warn("Could not add image preserving aspect ratio to PDF", e);
    return null;
  }
};

export const addPdfLogo = (
  doc: jsPDF,
  logo?: string | null,
  options?: {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    align?: 'left' | 'right' | 'center';
  }
): boolean => {
  const effectiveLogo = logo || getStoredCompanyLogo();
  if (!effectiveLogo) return false;

  const w = options?.width ?? 35;
  const h = options?.height ?? 15;
  const y = options?.y ?? 5;
  const pageWidth = doc.internal.pageSize.getWidth();

  let x = options?.x;
  let alignX: 'left' | 'center' | 'right' = options?.align || 'right';
  if (x === undefined) {
    if (options?.align === 'left') {
      x = 14;
    } else if (options?.align === 'center') {
      x = (pageWidth - w) / 2;
    } else {
      // Default: Top right
      x = pageWidth - 14 - w;
    }
  } else {
    alignX = options?.align || 'center';
  }

  return addImageContain(doc, effectiveLogo, x, y, w, h, alignX, 'center') !== null;
};

/**
 * Informações cadastrais e endereço da Filial Goiás (Catalão/GO)
 */
export const COMPANY_GOIAS_INFO = {
  name: 'TRANSCUNHA TRANSPORTES E LOGISTICA GOIAS',
  cnpj: '36.203.306/0004-35',
  ie: '204719070',
  address: 'RUA 26, 365, VILA MARGON',
  cityState: 'CATALAO/GO',
  cep: '75711-040',
  phone: '(35)99103-0469',
  cnpjLine: 'CNPJ: 36.203.306/0004-35 - IE: 204719070',
  addressLine: 'RUA 26, 365, VILA MARGON - CATALAO/GO - 75711-040 - (35)99103-0469',
  branchLabel: 'FILIAL CATALÃO/GO',
};

/**
 * Informações cadastrais e endereço da Matriz Minas Gerais (Pratápolis/MG)
 */
export const COMPANY_MINAS_INFO = {
  name: 'TRANSCUNHA TRANSPORTES E LOGISTICA LTDA',
  cnpj: '36.203.306/0001-92',
  ie: '36577990000',
  address: 'R PADRE LICINIO, 105, CENTRO',
  cityState: 'PRATAPOLIS/MG',
  cep: '37970-000',
  phone: '(35)99103-0469',
  cnpjLine: 'CNPJ: 36.203.306/0001-92 - IE: 36577990000',
  addressLine1: 'R PADRE LICINIO, 105, CENTRO -',
  addressLine2: 'PRATAPOLIS/MG - 37970-000 - (35)99103-0469',
  addressLine: 'R PADRE LICINIO, 105, CENTRO - PRATAPOLIS/MG - 37970-000 - (35)99103-0469',
  branchLabel: 'MATRIZ PRATÁPOLIS/MG',
};

/**
 * Informações cadastrais e endereço da Filial São Paulo (Ipaussu/SP)
 */
export const COMPANY_SP_INFO = {
  name: 'TRANSCUNHA TRANSPORTES E LOGISTICA FILIAL SP',
  cnpj: '36.203.306/0002-73',
  ie: '357033425116',
  address: 'RUA JOAO OLIMPIO DA SILVA, 20, JARDIM COCAJA II',
  cityState: 'IPAUSSU/SP',
  cep: '18950-546',
  phone: '(35)99103-0469',
  cnpjLine: 'CNPJ: 36.203.306/0002-73 - IE: 357033425116',
  addressLine1: 'RUA JOAO OLIMPIO DA SILVA, 20, JARDIM',
  addressLine2: 'COCAJA II - IPAUSSU/SP - 18950-546 - (35)99103-0469',
  addressLine: 'RUA JOAO OLIMPIO DA SILVA, 20, JARDIM COCAJA II - IPAUSSU/SP - 18950-546 - (35)99103-0469',
  branchLabel: 'FILIAL IPAUSSU/SP',
};

/**
 * Informações cadastrais e endereço padrão da Matriz
 */
export const COMPANY_MATRIZ_INFO = COMPANY_MINAS_INFO;

/**
 * Identifica se a carga possui origem no estado de Goiás (UF GO).
 */
export const isGoiasOrigin = (cargo?: Cargo | null, shipment?: Shipment | null): boolean => {
  if (!cargo && !shipment) return false;

  // Extrair apenas os textos referentes à ORIGEM
  const originParts: string[] = [];
  if (cargo?.origin) originParts.push(cargo.origin);
  if (cargo?.originLocation) originParts.push(cargo.originLocation);
  if ((shipment as any)?.origin) originParts.push((shipment as any).origin);
  if ((shipment as any)?.originLocation) originParts.push((shipment as any).originLocation);

  // Se rota no embarque, pegar apenas o trecho de origem (antes do delimitador)
  const route = (shipment as any)?.route;
  if (route && typeof route === 'string') {
    const originFromRoute = route.split(/->|➔|>|→/)[0]?.trim();
    if (originFromRoute) originParts.push(originFromRoute);
  }

  const originText = originParts.join(' ').trim();
  if (!originText) return false;

  const normalized = originText
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();

  // 1. Verificação explícita por UF GO ou Estado de Goiás
  if (
    /\bGO\b/.test(normalized) ||
    /\bGOIAS\b/.test(normalized) ||
    normalized.includes('/GO') ||
    normalized.includes('-GO') ||
    normalized.includes('(GO)') ||
    normalized.includes('ESTADO DE GOIAS')
  ) {
    return true;
  }

  // Se tiver outra UF explicitada (ex: MT, MS, MG, SP, PR, SC, RS, etc.), não é Goiás
  if (/\b(MT|MS|MG|SP|PR|SC|RS|BA|RJ|ES|TO|PA|MA|PI|CE|RN|PB|PE|AL|SE|AM|RO|AC|RR|AP|DF)\b/.test(normalized)) {
    return false;
  }

  // 2. Principais cidades e polos em Goiás caso a sigla do estado tenha sido omitida
  const goiasCities = [
    'CATALAO',
    'RIO VERDE',
    'JATAI',
    'GOIANIA',
    'ANAPOLIS',
    'ITUMBIARA',
    'CRISTALINA',
    'GOIANIRA',
    'GOIATUBA',
    'MONTIVIDIU',
    'ACREUNA',
    'SANTA HELENA DE GOIAS',
    'MINEIROS',
    'FORMOSA',
    'LUZIANIA',
    'SENADOR CANEDO',
    'TRINDADE',
    'APARECIDA DE GOIANIA',
    'QUIRINOPOLIS',
    'CALDAS NOVAS',
    'MORRINHOS',
    'PIRACANJUBA',
    'BOM JESUS DE GOIAS',
    'IPAMERI',
    'SILVANIA',
    'VIANOPOLIS',
    'ORIZONA',
    'PIRES DO RIO',
    'CHAPADAO DO CEU',
    'SAO SIMAO'
  ];

  for (const city of goiasCities) {
    if (normalized.includes('RIO VERDE DE MATO GROSSO') || normalized.includes('LUCAS DO RIO VERDE')) {
      continue;
    }
    if (new RegExp(`\\b${city}\\b`).test(normalized)) {
      return true;
    }
  }

  return false;
};

/**
 * Identifica se a carga possui origem no estado de Minas Gerais (UF MG).
 */
export const isMinasOrigin = (cargo?: Cargo | null, shipment?: Shipment | null): boolean => {
  if (!cargo && !shipment) return false;

  const originParts: string[] = [];
  if (cargo?.origin) originParts.push(cargo.origin);
  if (cargo?.originLocation) originParts.push(cargo.originLocation);
  if ((shipment as any)?.origin) originParts.push((shipment as any).origin);
  if ((shipment as any)?.originLocation) originParts.push((shipment as any).originLocation);

  const route = (shipment as any)?.route;
  if (route && typeof route === 'string') {
    const originFromRoute = route.split(/->|➔|>|→/)[0]?.trim();
    if (originFromRoute) originParts.push(originFromRoute);
  }

  const originText = originParts.join(' ').trim();
  if (!originText) return false;

  const normalized = originText
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();

  // 1. Verificação explícita por UF MG ou Estado de Minas Gerais
  if (
    /\bMG\b/.test(normalized) ||
    /\bMINAS GERAIS\b/.test(normalized) ||
    normalized.includes('/MG') ||
    normalized.includes('-MG') ||
    normalized.includes('(MG)') ||
    normalized.includes('ESTADO DE MINAS')
  ) {
    return true;
  }

  // Se tiver outra UF explicitada (ex: GO, MT, MS, SP, PR, SC, RS, etc.), não é MG
  if (/\b(GO|MT|MS|SP|PR|SC|RS|BA|RJ|ES|TO|PA|MA|PI|CE|RN|PB|PE|AL|SE|AM|RO|AC|RR|AP|DF)\b/.test(normalized)) {
    return false;
  }

  // 2. Principais cidades e polos de Minas Gerais caso UF tenha sido omitida
  const minasCities = [
    'PRATAPOLIS',
    'POCOS DE CALDAS',
    'PASSOS',
    'UBERLANDIA',
    'UBERABA',
    'ARAGUARI',
    'PATOS DE MINAS',
    'ALFENAS',
    'VARGINHA',
    'LAVRAS',
    'BELO HORIZONTE',
    'POUSO ALEGRE',
    'UNAI',
    'PARACATU',
    'IBIA',
    'ARAXA',
    'ITUIUTABA',
    'FRUTAL',
    'CAMPOS ALTOS',
    'SAO SEBASTIAO DO PARAISO',
    'GUAXUPE',
    'MUZAMBINHO',
    'MONTE SANTO DE MINAS',
    'NOVA RESENDE',
    'FORMIGA',
    'DIVINOPOLIS'
  ];

  for (const city of minasCities) {
    if (new RegExp(`\\b${city}\\b`).test(normalized)) {
      return true;
    }
  }

  return false;
};

/**
 * Identifica se a carga possui origem no estado de São Paulo (UF SP).
 */
export const isSpOrigin = (cargo?: Cargo | null, shipment?: Shipment | null): boolean => {
  if (!cargo && !shipment) return false;

  const originParts: string[] = [];
  if (cargo?.origin) originParts.push(cargo.origin);
  if (cargo?.originLocation) originParts.push(cargo.originLocation);
  if ((shipment as any)?.origin) originParts.push((shipment as any).origin);
  if ((shipment as any)?.originLocation) originParts.push((shipment as any).originLocation);

  const route = (shipment as any)?.route;
  if (route && typeof route === 'string') {
    const originFromRoute = route.split(/->|➔|>|→/)[0]?.trim();
    if (originFromRoute) originParts.push(originFromRoute);
  }

  const originText = originParts.join(' ').trim();
  if (!originText) return false;

  const normalized = originText
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();

  // 1. Verificação explícita por UF SP ou Estado de São Paulo
  if (
    /\bSP\b/.test(normalized) ||
    /\bSAO PAULO\b/.test(normalized) ||
    normalized.includes('/SP') ||
    normalized.includes('-SP') ||
    normalized.includes('(SP)') ||
    normalized.includes('ESTADO DE SAO PAULO')
  ) {
    return true;
  }

  // Se tiver outra UF explicitada (ex: GO, MG, MT, MS, PR, SC, RS, etc.), não é SP
  if (/\b(GO|MG|MT|MS|PR|SC|RS|BA|RJ|ES|TO|PA|MA|PI|CE|RN|PB|PE|AL|SE|AM|RO|AC|RR|AP|DF)\b/.test(normalized)) {
    return false;
  }

  // 2. Principais cidades e polos de São Paulo caso UF tenha sido omitida
  const spCities = [
    'IPAUSSU',
    'SANTOS',
    'SAO PAULO',
    'CAMPINAS',
    'RIBEIRAO PRETO',
    'SOROCABA',
    'SAO JOSE DO RIO PRETO',
    'BAURU',
    'PIRACICABA',
    'ARARAQUARA',
    'FRANCA',
    'BARRETOS',
    'OURINHOS',
    'MARILIA',
    'ASSIS',
    'PRESIDENTE PRUDENTE',
    'LIMEIRA',
    'PAULINIA',
    'CUBATAO',
    'GUARULHOS',
    'CATANDUVA',
    'JABOTICABAL',
    'SERTAOZINHO',
    'BEBEDOURO',
    'JAU',
    'BOTUCATU',
    'AVARE',
    'LENCOIS PAULISTA',
    'SANTA CRUZ DO RIO PARDO'
  ];

  for (const city of spCities) {
    if (new RegExp(`\\b${city}\\b`).test(normalized)) {
      return true;
    }
  }

  return false;
};

/**
 * Obtém a informação de endereço e dados cadastrais aplicáveis à carga e embarque.
 */
export const getEffectiveCompanyInfo = (cargo?: Cargo | null, shipment?: Shipment | null) => {
  if (isGoiasOrigin(cargo, shipment)) {
    return { ...COMPANY_GOIAS_INFO, uf: 'GO' as const };
  }
  if (isSpOrigin(cargo, shipment)) {
    return { ...COMPANY_SP_INFO, uf: 'SP' as const };
  }
  // Padrão ou origem MG: Filial/Matriz Minas Gerais (Pratápolis/MG)
  return { ...COMPANY_MINAS_INFO, uf: 'MG' as const };
};

export interface GeneratedPdfPayload {
  filename: string;
  base64: string;
  sizeBytes: number;
}

export const generateConsubeLoadingOrderPDF = (
  shipment: Shipment,
  cargo: Cargo,
  clients: Client[],
  products: Product[],
  vehicles: Vehicle[],
  companyLogo?: string | null,
  options?: { returnBase64Only?: boolean }
): GeneratedPdfPayload | void => {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const companyInfo = getEffectiveCompanyInfo(cargo, shipment);
  const isGo = companyInfo.uf === 'GO';
  const isSp = companyInfo.uf === 'SP';

  const client = clients.find((c) => c.id === cargo.clientId);
  const branch = client?.secondaryCnpjs?.find(b => b.id === cargo.clientBranchId || b.cnpj === cargo.clientCnpj);
  const product = products.find((p) => p.id === cargo.productId);
  const normalizePlate = (p: string | undefined | null) => p ? p.replace(/[^a-zA-Z0-9]/g, "").toUpperCase() : "";

  // Geometria da página A4: 210 x 297 mm
  const margin = 10;
  const contentWidth = 190;
  let currentY = 12;

  // Linhas e bordas pretas clássicas do modelo impresso Consube
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.35);

  // ─────────────────────────────────────────────
  // 1. CABEÇALHO SUPERIOR (Logo + Nome da Transportadora)
  // ─────────────────────────────────────────────
  const headerHeight = 24;
  const leftColWidth = 62;
  const rightColWidth = contentWidth - leftColWidth; // 128 mm

  // Caixa da Logo (Esquerda)
  doc.rect(margin, currentY, leftColWidth, headerHeight);
  const effectiveLogo = companyLogo || getStoredCompanyLogo();
  const logoPlaced = effectiveLogo
    ? addImageContain(doc, effectiveLogo, margin + 4, currentY + 3, leftColWidth - 8, headerHeight - 6, 'center', 'center')
    : null;
  if (!logoPlaced) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(60, 60, 60);
    doc.text("LOGO DA TRANSPORTADORA", margin + leftColWidth / 2, currentY + 11, { align: 'center' });
    doc.setFontSize(7.5);
    doc.text("(OPCIONAL)", margin + leftColWidth / 2, currentY + 16, { align: 'center' });
  }

  // Caixa dos Dados da Transportadora (Direita)
  doc.rect(margin + leftColWidth, currentY, rightColWidth, headerHeight);
  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  const centerX = margin + leftColWidth + rightColWidth / 2;

  if (isGo) {
    doc.text(companyInfo.name, centerX, currentY + 8, { align: 'center' });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(companyInfo.cnpjLine, centerX, currentY + 14, { align: 'center' });
    doc.setFontSize(7.5);
    doc.text(companyInfo.addressLine, centerX, currentY + 19, { align: 'center' });
  } else if (isSp) {
    // São Paulo (Ipaussu/SP) - 4 linhas idênticas ao modelo oficial da imagem
    doc.text(companyInfo.name, centerX, currentY + 6.5, { align: 'center' });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.text(companyInfo.cnpjLine, centerX, currentY + 11.5, { align: 'center' });
    doc.text(COMPANY_SP_INFO.addressLine1, centerX, currentY + 16, { align: 'center' });
    doc.text(COMPANY_SP_INFO.addressLine2, centerX, currentY + 20.5, { align: 'center' });
  } else {
    // Minas Gerais (Pratápolis/MG)
    doc.text(companyInfo.name, centerX, currentY + 6.5, { align: 'center' });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.text(companyInfo.cnpjLine, centerX, currentY + 11.5, { align: 'center' });
    doc.text(COMPANY_MINAS_INFO.addressLine1, centerX, currentY + 16, { align: 'center' });
    doc.text(COMPANY_MINAS_INFO.addressLine2, centerX, currentY + 20.5, { align: 'center' });
  }

  currentY += headerHeight;

  // ─────────────────────────────────────────────
  // 2. BARRA DE TÍTULO (Fundo cinza claro)
  // ─────────────────────────────────────────────
  const titleBarHeight = 7;
  doc.setFillColor(225, 228, 232); // cinza suave do documento oficial
  doc.rect(margin, currentY, contentWidth, titleBarHeight, 'FD');

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(0, 0, 0);
  doc.text("ORDEM DE CARREGAMENTO", margin + 3, currentY + 4.8);

  const cleanOcNum = shipment.id.replace(/\D/g, '') || shipment.id || cargo.sequenceId;
  const branchName = branch?.nomeFantasia || branch?.city || companyInfo.branchLabel;
  const emissionDate = new Date().toLocaleDateString('pt-BR');

  doc.setFontSize(8.5);
  doc.text(`Nro: ${cleanOcNum}`, margin + 70, currentY + 4.8);
  doc.text(`Filial: ${branchName.toUpperCase()}`, margin + 105, currentY + 4.8);
  doc.text(`Emissão: ${emissionDate}`, margin + 155, currentY + 4.8);

  currentY += titleBarHeight;

  // ─────────────────────────────────────────────
  // 3. SEÇÃO 1: MOTORISTA E VEÍCULOS
  // ─────────────────────────────────────────────
  const sec1Height = 44;
  doc.rect(margin, currentY, contentWidth, sec1Height);

  // Vencimento da OC (data programada ou +3 dias)
  const vctoOc = shipment.scheduledDate 
    ? new Date(`${shipment.scheduledDate}T00:00:00`).toLocaleDateString('pt-BR') 
    : new Date(Date.now() + 3 * 86400000).toLocaleDateString('pt-BR');

  const driverTypeTag = '[TERCEIRO]';
  const driverName = (shipment.driverName || 'NÃO INFORMADO').toUpperCase();
  const driverCpf = shipment.driverCpf || 'N/A';
  const driverCnh = (shipment as any).driverCnh || (shipment as any).cnh || 'N/A';
  const driverReg = (shipment as any).driverCnhRegister || driverCnh;
  const vctoCnh = (shipment as any).driverCnhExpiry || 'EM DIA';
  const driverRg = (shipment as any).driverRg || 'N/A';
  const horsePlate = normalizePlate(shipment.horsePlate) || 'N/A';
  const trailer1 = normalizePlate(shipment.trailer1Plate) || '-';
  const trailer2 = normalizePlate(shipment.trailer2Plate) || '-';
  const dolly = normalizePlate(shipment.trailer3Plate) || '-';

  doc.setFont("courier", "normal");
  doc.setFontSize(8.5);

  let sY = currentY + 4.5;
  const lineGap = 5.0;

  // Linha 1: Autorizamos o Sr. [TERCEIRO] Vcto O.C. :
  doc.text("Autorizamos o Sr.", margin + 3, sY);
  doc.setFont("courier", "bold");
  doc.text(driverTypeTag, margin + 75, sY);
  doc.setFont("courier", "normal");
  doc.text(`Vcto O.C. : ${vctoOc}`, margin + 125, sY);

  sY += lineGap;
  // Linha 2: Motorista : ... CPF : ...
  doc.text(`Motorista : ${driverName}`, margin + 3, sY);
  doc.text(`CPF      : ${driverCpf}`, margin + 125, sY);

  sY += lineGap;
  // Linha 3: CNH : ... N°Reg: ... Vcto CNH : ...
  doc.text(`CNH       : ${driverCnh}`, margin + 3, sY);
  doc.text(`N°Reg: ${driverReg}`, margin + 65, sY);
  doc.text(`Vcto CNH : ${vctoCnh}`, margin + 125, sY);

  sY += lineGap;
  // Linha 4: RG : ...
  doc.text(`RG        : ${driverRg}`, margin + 3, sY);

  sY += lineGap;
  // Linha 5: Cavalo : ...
  doc.text(`Cavalo    : ${horsePlate}`, margin + 3, sY);

  sY += lineGap;
  // Linha 6: Reboque 1 : ...
  doc.text(`Reboque 1 : ${trailer1}`, margin + 3, sY);

  sY += lineGap;
  // Linha 7: Reboque 2 : ...
  doc.text(`Reboque 2 : ${trailer2}`, margin + 3, sY);

  sY += lineGap;
  // Linha 8: DOLLY : ...
  doc.text(`DOLLY     : ${dolly}`, margin + 3, sY);

  currentY += sec1Height;

  // ─────────────────────────────────────────────
  // 4. SEÇÃO 2: CARGA / PRODUTO
  // ─────────────────────────────────────────────
  const sec2Height = 14;
  doc.rect(margin, currentY, contentWidth, sec2Height);

  const productName = (product?.name || cargo.productId || 'MERCADORIA EM GERAL').toUpperCase();
  const weightTons = Number(shipment.shipmentTonnage) || Number(cargo.totalVolume) || 0;
  const weightKgStr = (weightTons * 1000).toLocaleString('pt-BR', { maximumFractionDigits: 0 });
  const packaging = (cargo.packaging || 'GRANEL').toUpperCase();
  const bags = (packaging.includes('SACO') || packaging.includes('BIG')) ? `${Math.round(weightTons * 1000 / 50)} SC` : '-';
  const natureCargo = (cargo.type || 'SÓLIDOS A GRANEL').toUpperCase();
  const orderNum = (cargo.orderNumber || (cargo as any).numeroPedido || cargo.tmsLoteNumber || shipment.orderId || '-').toUpperCase();

  sY = currentY + 4.8;
  // Linha 1: A retirar : ... Sacos: ... Peso:KG ...
  doc.text(`A retirar : ${productName}`, margin + 3, sY);
  doc.text(`Sacos: ${bags}`, margin + 105, sY);
  doc.text(`Peso:KG ${weightKgStr}`, margin + 140, sY);

  sY += lineGap + 0.5;
  // Linha 2: Espécie : ... Nat. Carga: ... N°Pedido: ...
  doc.text(`Espécie   : ${packaging}`, margin + 3, sY);
  doc.text(`Nat. Carga: ${natureCargo}`, margin + 75, sY);
  doc.text(`N°Pedido: ${orderNum}`, margin + 140, sY);

  currentY += sec2Height;

  // ─────────────────────────────────────────────
  // 5. SEÇÃO 3: REMETENTE / ORIGEM
  // ─────────────────────────────────────────────
  const sec3Height = 18;
  doc.rect(margin, currentY, contentWidth, sec3Height);

  const originLoc = findExpedidorRecebedorByName(cargo.originLocation || '');
  const shipperName = (originLoc?.name || cargo.originLocation || client?.razaoSocial || client?.nomeFantasia || 'REMETENTE CONFORME NOTA FISCAL').toUpperCase();
  const shipperAddress = (originLoc?.city ? `${originLoc.name} - ${originLoc.city}/${originLoc.state || ''}` : (cargo.origin || 'ENDEREÇO CONFORME CADASTRO')).toUpperCase();
  const originCityState = (cargo.origin || `${originLoc?.city || ''}/${originLoc?.state || ''}` || 'ORIGEM NÃO INFORMADA').toUpperCase();

  sY = currentY + 4.5;
  doc.text(`Remetente : ${shipperName}`, margin + 3, sY);
  sY += lineGap;
  doc.text(`Endereço  : ${shipperAddress}`, margin + 3, sY);
  sY += lineGap;
  doc.text(`Origem    : ${originCityState}`, margin + 3, sY);

  currentY += sec3Height;

  // ─────────────────────────────────────────────
  // 6. SEÇÃO 4: DESTINATÁRIO / CLIENTE
  // ─────────────────────────────────────────────
  const sec4Height = 14;
  doc.rect(margin, currentY, contentWidth, sec4Height);

  const clientName = (client?.nomeFantasia || client?.razaoSocial || cargo.clientId || 'CLIENTE DESTINATÁRIO').toUpperCase();
  const clientCnpj = (branch?.cnpj || client?.cnpj || cargo.clientCnpj || 'N/A').toUpperCase();
  const destLoc = findExpedidorRecebedorByName(cargo.destinationLocation || '');
  const destCity = (cargo.destination || `${destLoc?.city || ''}/${destLoc?.state || ''}` || 'DESTINO NÃO INFORMADO').toUpperCase();
  const destDisplay = cargo.destinationLocation ? `${cargo.destinationLocation.toUpperCase()} — ${destCity}` : destCity;

  sY = currentY + 4.8;
  doc.text(`CLIENTE   : ${clientName}`, margin + 3, sY);
  doc.text(`CNPJ: ${clientCnpj}`, margin + 125, sY);
  sY += lineGap + 0.5;
  doc.text(`Destino   : ${destDisplay}`, margin + 3, sY);

  currentY += sec4Height;

  // ─────────────────────────────────────────────
  // 7. SEÇÃO 5: LIBERAÇÃO DA GESTORA DE RISCO & OBSERVAÇÕES
  // ─────────────────────────────────────────────
  const sec5Height = 20;
  doc.rect(margin, currentY, contentWidth, sec5Height);

  const riskProtocol = (shipment.riskReleaseCode || (shipment as any).riskProtocol || 'CONSULTA APROVADA - BUONNY / OPEN TECH').toUpperCase();
  const loadNum = String(cargo.orderNumber || cleanOcNum).toUpperCase();
  const ulaNum = String((cargo as any).ulaNumber || '-').toUpperCase();
  const anttNum = (shipment.anttOwnerIdentifier?.replace(/\D/g, '') || '057359600').toUpperCase();

  sY = currentY + 4.5;
  doc.text(`Liberação da gestora de Risco: ${riskProtocol}`, margin + 3, sY);

  sY += lineGap;
  doc.text(`Load Num/DT: ${loadNum}        ULA: ${ulaNum}        ANTT: ${anttNum}`, margin + 3, sY);

  sY += lineGap;
  doc.setFont("courier", "bold");
  doc.text("Observação :PREENCHER OS DADOS SEM O USO DE PONTUAÇÃO.", margin + 3, sY);

  currentY += sec5Height;

  // ─────────────────────────────────────────────
  // 8. BLOCO DE ASSINATURAS (Rodapé formal)
  // ─────────────────────────────────────────────
  currentY += 12;
  doc.setFont("helvetica", "normal");
  doc.setDrawColor(120, 120, 120);
  doc.setLineWidth(0.3);

  // Assinatura do Motorista
  doc.line(margin + 10, currentY + 12, margin + 85, currentY + 12);
  doc.setFontSize(7.5);
  doc.text("ASSINATURA DO MOTORISTA", margin + 47.5, currentY + 16, { align: 'center' });
  doc.setFontSize(7);
  doc.text(driverName, margin + 47.5, currentY + 20, { align: 'center' });

  // Assinatura da Transcunha
  doc.line(margin + 105, currentY + 12, margin + 180, currentY + 12);
  doc.setFontSize(7.5);
  doc.text(companyInfo.name, margin + 142.5, currentY + 16, { align: 'center' });
  doc.setFontSize(7);
  doc.text("EMISSOR RESPONSÁVEL / AUTORIZADO", margin + 142.5, currentY + 20, { align: 'center' });

  // Rodapé com data/hora e nota de controle
  doc.setFontSize(6.5);
  doc.setTextColor(140, 140, 140);
  doc.text(`Documento emitido via Sistema Transcunha Logística em ${new Date().toLocaleString('pt-BR')} - Modelo Consube`, margin + contentWidth / 2, 287, { align: 'center' });

  const filename = `OC_CONSUBE_${cleanOcNum}_${horsePlate}.pdf`;
  if (options?.returnBase64Only) {
    const dataUri = doc.output('datauristring');
    const rawB64 = dataUri.split(',')[1] || '';
    return {
      filename,
      base64: dataUri,
      sizeBytes: Math.round((rawB64.length * 3) / 4),
    };
  }

  // Salvar PDF
  doc.save(filename);
};

export const generateLoadingOrderPDF = (
  shipment: Shipment,
  cargo: Cargo,
  clients: Client[],
  products: Product[],
  vehicles: Vehicle[],
  companyLogo?: string | null,
  modelIdOverride?: string,
  options?: { returnBase64Only?: boolean }
): GeneratedPdfPayload | void => {
  const client = clients.find((c) => c.id === cargo.clientId);
  const branch = client?.secondaryCnpjs?.find(b => b.id === cargo.clientBranchId || b.cnpj === cargo.clientCnpj);
  const effectiveModelId = modelIdOverride || branch?.loadingOrderModelId || branch?.ordemCarregamentoModelId || client?.loadingOrderModelId || client?.ordemCarregamentoModelId;

  if (effectiveModelId === 'mod_consube') {
    return generateConsubeLoadingOrderPDF(shipment, cargo, clients, products, vehicles, companyLogo, options);
  }

  const doc = new jsPDF();
  const product = products.find((p) => p.id === cargo.productId);
  const normalizePlate = (p: string | undefined | null) => p ? p.replace(/[^a-zA-Z0-9]/g, "").toLowerCase() : "";
  const mainVehicle = vehicles.find((v) => normalizePlate(v.plate) === normalizePlate(shipment.horsePlate));

  // Brand Colors
  const primaryBlue: [number, number, number] = [11, 102, 228]; // #0B66E4 Transcunha Vivid Electric Blue
  const accentBlue: [number, number, number] = [2, 132, 199];  // #0284C7 Transcunha Sky Accent
  const secondaryGray: [number, number, number] = [100, 116, 139]; // #64748B

  // Constants
  const margin = 14;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Draw Header background for branding
  doc.setFillColor(248, 250, 252); // light slate
  doc.rect(0, 0, pageWidth, 40, 'F');
  
  // Logo
  const effectiveLogo = companyLogo || getStoredCompanyLogo();
  if (effectiveLogo) {
      addImageContain(doc, effectiveLogo, margin, 5, 35, 20, 'left', 'center');
  }

  // Company Info Header (Under the logo)
  const companyInfo = getEffectiveCompanyInfo(cargo, shipment);

  doc.setFontSize(8);
  doc.setTextColor(secondaryGray[0], secondaryGray[1], secondaryGray[2]);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.text(companyInfo.name, margin, 27);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.text(companyInfo.cnpjLine, margin, 31);
  doc.text(companyInfo.addressLine, margin, 35);

  // Document ID & Date (Top Right)
  doc.setFontSize(10);
  doc.setTextColor(0);
  doc.setFont("helvetica", "bold");
  doc.text(`OC Nº: ${shipment.id}`, pageWidth - margin, 18, { align: 'right' });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(`Emissão: ${new Date().toLocaleString('pt-BR')}`, pageWidth - margin, 24, { align: 'right' });
  doc.setFont("helvetica", "bold");
  doc.text(`Filial: ${companyInfo.branchLabel}`, pageWidth - margin, 30, { align: 'right' });
  doc.setFont("helvetica", "normal");

  // Divider
  doc.setDrawColor(accentBlue[0], accentBlue[1], accentBlue[2]);
  doc.setLineWidth(1.5);
  doc.line(margin, 40, pageWidth - margin, 40);

  // Title Section
  doc.setFontSize(16);
  doc.setTextColor(primaryBlue[0], primaryBlue[1], primaryBlue[2]);
  doc.setFont("helvetica", "bold");
  doc.text("ORDEM DE CARREGAMENTO", pageWidth / 2, 53, { align: 'center' });

  // --- Carga Info ---
  doc.setFontSize(11);
  doc.setTextColor(primaryBlue[0], primaryBlue[1], primaryBlue[2]);
  doc.text("1. INFORMAÇÕES DA CARGA", margin, 68);

  const originLoc = findExpedidorRecebedorByName(cargo.originLocation || '');
  const originDocInfo = originLoc?.documentNumber ? ` [${originLoc.documentType || 'DOC'}: ${originLoc.documentNumber}]` : '';
  const originDisplay = cargo.originLocation
    ? `${cargo.origin ? cargo.origin.toUpperCase() + ' - ' : ''}LOCAL / EXPEDIDOR: ${cargo.originLocation.toUpperCase()}${originDocInfo}`
    : (cargo.origin || '').toUpperCase();

  const destLoc = findExpedidorRecebedorByName(cargo.destinationLocation || '');
  const destDocInfo = destLoc?.documentNumber ? ` [${destLoc.documentType || 'DOC'}: ${destLoc.documentNumber}]` : '';
  const destDisplay = cargo.destinationLocation
    ? `${cargo.destination ? cargo.destination.toUpperCase() + ' - ' : ''}LOCAL / RECEBEDOR: ${cargo.destinationLocation.toUpperCase()}${destDocInfo}`
    : (cargo.destination || '').toUpperCase();

  autoTable(doc, {
    startY: 71,
    head: [["Descrição do Requisito", "Informações Detalhadas"]],
    body: [
      ["CLIENTE / EMBARCADOR", (client?.nomeFantasia || client?.razaoSocial || cargo.clientId || '').toUpperCase()],
      ["Nº DO PEDIDO", (cargo.orderNumber || (cargo as any).numeroPedido || cargo.tmsLoteNumber || 'N/A').toUpperCase()],
      ["PRODUTO / MERCADORIA", (product?.name || cargo.productId || '').toUpperCase()],
      ["TIPO DE EMBALAGEM", (cargo.packaging || 'GRANEL').toUpperCase()],
      ["PESO / TONELAGEM", `${(Number(shipment.shipmentTonnage) || 0).toLocaleString("pt-BR")} TON`],
      ["ORIGEM DO CARREGAMENTO", originDisplay],
      ["DESTINO DA CARGA", destDisplay],
      ["DATA PROGRAMADA", shipment.scheduledDate ? new Date(`${shipment.scheduledDate}T00:00:00`).toLocaleDateString('pt-BR') : 'N/A'],
    ],
    theme: "striped",
    headStyles: { fillColor: primaryBlue, fontSize: 10, fontStyle: 'bold' },
    bodyStyles: { fontSize: 9 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 55, textColor: primaryBlue } }
  });

  const driverY = (doc as any).lastAutoTable.finalY + 12;

  // --- Motorista & Veiculo Info ---
  doc.setFontSize(11);
  doc.setTextColor(primaryBlue[0], primaryBlue[1], primaryBlue[2]);
  doc.text("2. INFORMAÇÕES DO TRANSPORTADOR", margin, driverY);

  autoTable(doc, {
    startY: driverY + 3,
    head: [["Descrição", "Dados do Condutor e Veículo"]],
    body: [
      ["MOTORISTA", shipment.driverName.toUpperCase()],
      ["CPF DO CONDUTOR", shipment.driverCpf || "N/A"],
      ["PLACA (CAVALO)", shipment.horsePlate.toUpperCase()],
      ["TIPO DE VEÍCULO", (mainVehicle?.setType || shipment.vehicleSetType || "N/A").toUpperCase()],
      ["CARROCERIA", (mainVehicle?.bodyType || shipment.vehicleBodyType || "N/A").toUpperCase()],
      ["PLACA(S) CARRETA(S)", [shipment.trailer1Plate, shipment.trailer2Plate, shipment.trailer3Plate].filter(Boolean).join(" / ").toUpperCase() || "N/A"],
      ["PROPRIETÁRIO / TITULAR", (shipment.anttOwnerIdentifier || shipment.ownerContact || "N/A").toUpperCase()],
    ],
    theme: "striped",
    headStyles: { fillColor: primaryBlue, fontSize: 10, fontStyle: 'bold' },
    bodyStyles: { fontSize: 9 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 55, textColor: primaryBlue } }
  });

  let currentY = (doc as any).lastAutoTable.finalY + 8;

  // Espaço antes do rodapé
  currentY += 5;


  // --- Footer / Signatures ---
  const footerY = Math.max(currentY + 25, pageHeight - 55);

  // Signature lines
  doc.setLineWidth(0.5);
  doc.setDrawColor(secondaryGray[0], secondaryGray[1], secondaryGray[2]);
  
  // Driver signature
  doc.line(margin, footerY, margin + 80, footerY);
  doc.setFontSize(8);
  doc.setTextColor(secondaryGray[0], secondaryGray[1], secondaryGray[2]);
  doc.text("ASSINATURA DO MOTORISTA", margin + 40, footerY + 5, { align: 'center' });
  doc.setFontSize(7);
  doc.text(shipment.driverName.toUpperCase(), margin + 40, footerY + 9, { align: 'center' });

  // Authority signature
  doc.line(pageWidth - margin - 80, footerY, pageWidth - margin, footerY);
  doc.setFontSize(8);
  doc.text(companyInfo.name, pageWidth - margin - 40, footerY + 5, { align: 'center' });
  doc.setFontSize(7);
  doc.text("AUTORIZAÇÃO DE CARREGAMENTO", pageWidth - margin - 40, footerY + 9, { align: 'center' });

  // Final Footer Note
  doc.setFontSize(7);
  doc.setTextColor(150);
  const footerText = `Este documento é exclusivo para controle interno de carregamento da ${companyInfo.name}. As informações aqui contidas são confidenciais.`;
  doc.text(footerText, pageWidth / 2, pageHeight - 10, { align: 'center' });

  const filename = `OC_${shipment.id}_${shipment.horsePlate.toUpperCase()}.pdf`;
  if (options?.returnBase64Only) {
    const dataUri = doc.output('datauristring');
    const rawB64 = dataUri.split(',')[1] || '';
    return {
      filename,
      base64: dataUri,
      sizeBytes: Math.round((rawB64.length * 3) / 4),
    };
  }

  // Save PDF
  doc.save(filename);
};

