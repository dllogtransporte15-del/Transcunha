import * as pdfjsLib from 'pdfjs-dist';
import * as XLSX from 'xlsx';

// Configuração resiliente do Worker do PDF.js para navegador
const setupPdfWorker = () => {
  if (typeof window === 'undefined' || !pdfjsLib.GlobalWorkerOptions) return;
  if (pdfjsLib.GlobalWorkerOptions.workerSrc) return;

  try {
    // 1. Tenta carregar o worker local empacotado pelo Vite
    const localWorker = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
    pdfjsLib.GlobalWorkerOptions.workerSrc = localWorker;
  } catch {
    // 2. Fallback para CDN
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version || '6.2.108'}/pdf.worker.min.mjs`;
  }
};

setupPdfWorker();

export interface AtuaCteRecord {
  cteNumber: string;
  docType: string;
  isCanceled: boolean;
  cancelDate?: string;
  emissionDate: string; // YYYY-MM-DD
  emissionTime?: string;
  branch: string;
  agency?: string;
  shipper?: string;
  recipient?: string;
  payer?: string;
  plate: string;
  weight: number;
  companyFreight: number;
  driverFreight: number;
  companyTariff?: number;
  driverTariff?: number;
  freightDiffPercent?: number;
  driverAdvancePercent?: number;
  otherDriverDiscounts?: number;
  icmsIssqn: number;
  toll: number;
  brokerFreight?: number;
  commissionBaseValue?: number;
  commissionValue?: number;
  federalTax: number;
  otherCosts: number;
  result: number;
  originCity?: string;
  destinationCity?: string;
  isComplementary: boolean;
  rawLine?: string;
}

export interface TranscunhaReportRecord {
  shipmentId: string;
  cteNumber: string;
  date: string;
  clientName: string;
  plate: string;
  weight: number;
  companyFreight: number;
  driverFreight: number;
  toll: number;
  icms: number;
  federalTax: number;
  netProfit: number;
  rawLine?: string;
}

export interface AtuaReportParseResult {
  detectedFileType: 'ATUA_CTRC' | 'TRANSCUNHA_PROFIT' | 'UNKNOWN';
  records: AtuaCteRecord[];
  transcunhaRecords?: TranscunhaReportRecord[];
  periodText?: string;
  startDate?: string;
  endDate?: string;
  generatedDate?: string;
  totalFreightCompany?: number;
  totalFreightDriver?: number;
  totalToll?: number;
  totalIcms?: number;
  totalFederalTax?: number;
  totalResult?: number;
  totalWeight?: number;
  errors: string[];
}

/**
 * Normaliza valores numéricos com vírgula ou ponto (ex: "8.655,50" -> 8655.50)
 */
export const parseBrazilianNumber = (val: any): number => {
  if (val === undefined || val === null || val === '') return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  const s = String(val).trim().replace(/\s/g, '').replace(/^R\$/, '');
  if (!s || s === '-' || s === '---') return 0;
  
  if (s.includes('.') && s.includes(',')) {
    const clean = s.replace(/\./g, '').replace(',', '.');
    const n = parseFloat(clean);
    return isNaN(n) ? 0 : n;
  }
  if (s.includes(',')) {
    const clean = s.replace(',', '.');
    const n = parseFloat(clean);
    return isNaN(n) ? 0 : n;
  }
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
};

/**
 * Normaliza placa de veículo (remove traços, espaços, converte para maiúsculo
 * e resolve confusões clássicas de OCR/digitação no padrão Mercosul LLLNLNN)
 */
export const normalizePlate = (plate: string): string => {
  if (!plate) return '';
  const clean = plate.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  if (clean.length === 7) {
    const p = clean.split('');
    const ocrToDigit: Record<string, string> = { S: '5', O: '0', I: '1', B: '8', Z: '2', G: '6' };
    const ocrToLetter: Record<string, string> = { '5': 'S', '0': 'O', '1': 'I', '8': 'B', '2': 'Z', '6': 'G' };

    // Se os 3 primeiros são letras (padrão Brasil/Mercosul):
    if (/[A-Z]/.test(p[0]) && /[A-Z]/.test(p[1]) && /[A-Z]/.test(p[2])) {
      // 4º caractere em padrão Mercosul (LLLNLNN) é obrigatoriamente dígito
      if (/[A-Z]/.test(p[3]) && ocrToDigit[p[3]]) {
        p[3] = ocrToDigit[p[3]];
      }
      // 5º caractere em padrão Mercosul é obrigatoriamente letra (se o 6º e 7º forem dígitos)
      if (/[0-9]/.test(p[4]) && /[0-9]/.test(p[5]) && /[0-9]/.test(p[6]) && ocrToLetter[p[4]]) {
        p[4] = ocrToLetter[p[4]];
      }
    }
    return p.join('');
  }
  return clean;
};

/**
 * Normaliza data DD/MM/YY ou DD/MM/YYYY para YYYY-MM-DD
 */
export const normalizeDate = (dateStr: string): string => {
  if (!dateStr) return '';
  const match = dateStr.trim().match(/^(\d{2})\/(\d{2})\/(\d{2,4})/);
  if (match) {
    let year = match[3];
    if (year.length === 2) {
      year = '20' + year;
    }
    const month = match[2].padStart(2, '0');
    const day = match[1].padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return dateStr;
};

/**
 * Analisador de linha textual do relatório do Atua CTRC
 */
export const parseAtuaTextLine = (line: string): AtuaCteRecord | null => {
  const trimmed = line.trim();
  if (!trimmed) return null;

  // Linhas de cabeçalho ou rodapé que devem ser ignoradas
  if (
    trimmed.startsWith('Relatório') ||
    trimmed.startsWith('Ambiente') ||
    trimmed.startsWith('TRANSCUNHA') ||
    trimmed.startsWith('Usuário') ||
    trimmed.startsWith('Número') ||
    trimmed.startsWith('Desenvolvido') ||
    trimmed.startsWith('T. =') ||
    trimmed.startsWith('Vl. Out.') ||
    trimmed.startsWith('Vl. Resultado')
  ) {
    return null;
  }

  // Remove texto de rodapé se grudado no final da linha (ex: Desenvolvido por maisfrete...)
  const cleaned = trimmed.replace(/Desenvolvido\s+por.*/i, '').trim();

  // Padrão do início de linha:
  // "2053 C T 01/10/26 09:49 T R 1 / MATRI ..."
  // "2053 CT 01/10/26 09:49 TR 1 / MATRI ..."
  // "1 C T 02/10/26 16:24 ..."
  const startMatch = cleaned.match(/^(\d+)\s+C\s*([TE])\s+(?:(\d{2}\/\d{2})\s+)?(\d{2}\/\d{2}\/\d{2,4})(?:\s+(\d{2}:\d{2}))?/i);
  let cteNumber = '';
  let docType = 'CT';
  let emissionDate = '';
  let emissionTime = '';

  if (startMatch) {
    cteNumber = startMatch[1];
    docType = 'C' + startMatch[2].toUpperCase();
    emissionDate = normalizeDate(startMatch[4]);
    emissionTime = startMatch[5] || '';
  } else {
    // Tenta formato condensado ou alternativo
    const altMatch = cleaned.match(/^(\d+)\s+(?:C\s*([TE])\s+)?(\d{2}\/\d{2}\/\d{2,4})/i);
    if (!altMatch) return null;
    cteNumber = altMatch[1];
    docType = altMatch[2] ? 'C' + altMatch[2].toUpperCase() : 'CT';
    emissionDate = normalizeDate(altMatch[3]);
  }

  // Procura padrão de placa Mercosul ou tradicional (7 caracteres alfanuméricos com 3 letras no início)
  const plateMatch = cleaned.match(/\b([A-Z]{3}[A-Z0-9]{4})\b/i);
  const plate = plateMatch ? normalizePlate(plateMatch[1]) : '';

  // Extração do Pagador (Tomador do frete) que antecede a placa no relatório
  let payer = '';
  if (plateMatch && plateMatch.index !== undefined && plateMatch.index > 0) {
    const beforePlate = cleaned.substring(0, plateMatch.index).trim();
    const tokens = beforePlate.split(/\s{2,}|\t/);
    if (tokens.length >= 2) {
      payer = tokens[tokens.length - 1].trim();
    }
  }

  // Procura números decimais após a placa
  let afterPlate = '';
  if (plateMatch && plateMatch.index !== undefined) {
    afterPlate = cleaned.slice(plateMatch.index + plateMatch[0].length);
  } else {
    afterPlate = cleaned;
  }

  // Remove nomes de cidades do final para não confundir com números
  const cityRegex = /(?:[A-Z\s]{4,}\s*\/\s*[A-Z]{2})/g;
  const withoutCities = afterPlate.replace(cityRegex, '');

  const numbersFound: number[] = [];
  const numRegex = /[-+]?[0-9]{1,3}(?:\.[0-9]{3})*(?:,[0-9]+)?|[-+]?[0-9]+(?:,[0-9]+)?/g;
  let m: RegExpExecArray | null;
  while ((m = numRegex.exec(withoutCities)) !== null) {
    const rawVal = m[0];
    if (rawVal !== '/' && rawVal !== '-') {
      numbersFound.push(parseBrazilianNumber(rawVal));
    }
  }

  if (numbersFound.length < 3) {
    return null;
  }

  const weight = numbersFound[0] ?? 0;
  const companyFreight = numbersFound[1] ?? 0;
  const driverFreight = numbersFound[2] ?? 0;
  const companyTariff = numbersFound[3];
  const driverTariff = numbersFound[4];
  const freightDiffPercent = numbersFound[5];

  let icmsIssqn = 0;
  let toll = 0;
  let federalTax = 0;
  let otherCosts = 0;
  let result = 0;

  if (numbersFound.length >= 14) {
    // Formato completo com 15 números
    icmsIssqn = numbersFound[8] ?? 0;
    toll = numbersFound[9] ?? 0;
    federalTax = numbersFound[numbersFound.length - 3] ?? 0;
    otherCosts = numbersFound[numbersFound.length - 2] ?? 0;
    result = numbersFound[numbersFound.length - 1] ?? 0;
  } else if (numbersFound.length >= 10) {
    icmsIssqn = numbersFound[6] ?? 0;
    toll = numbersFound[7] ?? 0;
    federalTax = numbersFound[numbersFound.length - 3] ?? 0;
    otherCosts = numbersFound[numbersFound.length - 2] ?? 0;
    result = numbersFound[numbersFound.length - 1] ?? 0;
  } else {
    result = numbersFound[numbersFound.length - 1] ?? 0;
  }

  const isComplementary = (weight === 0 && companyFreight > 0) || cleaned.includes('Estadia') || cleaned.includes('Diária');

  return {
    cteNumber,
    docType,
    isCanceled: cleaned.includes('CANCELADO') || cleaned.includes('Canc.'),
    emissionDate,
    emissionTime,
    branch: 'Transcunha',
    payer,
    plate,
    weight,
    companyFreight,
    driverFreight,
    companyTariff,
    driverTariff,
    freightDiffPercent,
    icmsIssqn,
    toll,
    federalTax,
    otherCosts,
    result,
    isComplementary,
    rawLine: trimmed
  };
};

/**
 * Parser de texto extraído do PDF
 */
export const parseAtuaTextReport = (fullText: string): AtuaReportParseResult => {
  const lines = fullText.split('\n');
  const records: AtuaCteRecord[] = [];
  const errors: string[] = [];

  let periodText = '';
  let startDate = '';
  let endDate = '';

  // Detecção de tipo de arquivo
  const isTranscunha = fullText.includes('Relatório: Lucro Real da Operação de Embarque') || fullText.includes('Lucro Real da Operação');
  if (isTranscunha) {
    return parseTranscunhaTextReport(fullText);
  }

  // Tenta extrair período do cabeçalho
  // "Emissão CTRC: 01/10/26 à 27/10/26"
  const periodMatch = fullText.match(/Emiss[ãa]o\s+CTRC:\s*(\d{2}\/\d{2}\/\d{2,4})\s*(?:[àa]|at[ée])\s*(\d{2}\/\d{2}\/\d{2,4})/i);
  if (periodMatch) {
    startDate = normalizeDate(periodMatch[1]);
    endDate = normalizeDate(periodMatch[2]);
    periodText = `${periodMatch[1]} a ${periodMatch[2]}`;
  }

  for (const line of lines) {
    try {
      const rec = parseAtuaTextLine(line);
      if (rec && rec.cteNumber) {
        records.push(rec);
      }
    } catch (e: any) {
      errors.push(`Erro na linha: ${line.slice(0, 50)}... -> ${e?.message}`);
    }
  }

  return {
    detectedFileType: 'ATUA_CTRC',
    records,
    periodText,
    startDate,
    endDate,
    totalWeight: records.reduce((sum, r) => sum + r.weight, 0),
    totalFreightCompany: records.reduce((sum, r) => sum + r.companyFreight, 0),
    totalFreightDriver: records.reduce((sum, r) => sum + r.driverFreight, 0),
    totalToll: records.reduce((sum, r) => sum + r.toll, 0),
    totalIcms: records.reduce((sum, r) => sum + r.icmsIssqn, 0),
    totalFederalTax: records.reduce((sum, r) => sum + r.federalTax, 0),
    totalResult: records.reduce((sum, r) => sum + r.result, 0),
    errors
  };
};

/**
 * Parser para o Relatório de Lucro Real da Transcunha
 */
export const parseTranscunhaTextReport = (fullText: string): AtuaReportParseResult => {
  const lines = fullText.split('\n');
  const transcunhaRecords: TranscunhaReportRecord[] = [];
  const atuaConvertedRecords: AtuaCteRecord[] = [];
  const errors: string[] = [];

  let periodText = '';
  let startDate = '';
  let endDate = '';

  const periodMatch = fullText.match(/Per[íi]odo:\s*(\d{2}\/\d{2}\/\d{4})\s*(?:[àa]|at[ée])\s*(\d{2}\/\d{2}\/\d{4})/i);
  if (periodMatch) {
    startDate = normalizeDate(periodMatch[1]);
    endDate = normalizeDate(periodMatch[2]);
    periodText = `${periodMatch[1]} a ${periodMatch[2]}`;
  }

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('Relatório:') || trimmed.startsWith('Período:') || trimmed.startsWith('ID Embarque') || trimmed.includes('T O T A I S')) {
      continue;
    }

    // Ex: "RAF-852 47 2026-10-27 ORGANICS ( Sudoeste) (FXF2G16) 46,38 t R$ 5.797,50 R$ 4.638,00 R$ 0,00 (20.0%) R$ 0,00 R$ 214,50 1.130,61 --- (0.5%) (0.3%) Sim (IA)"
    const match = trimmed.match(/^([A-Z]{3}-\d+)\s+(\d+)\s+(\d{4}-\d{2}-\d{2})\s+(.*?)\s+\(([A-Z]{3}[0-9][A-Z0-9][0-9]{2})\)\s+(\d+(?:,\d+)?)\s*t/i);
    if (match) {
      const shipmentId = match[1];
      const cteNumber = match[2];
      const date = match[3];
      const clientName = match[4].trim();
      const plate = match[5].toUpperCase();
      const weight = parseBrazilianNumber(match[6]);

      const after = trimmed.slice(match[0].length);
      const numRegex = /[-+]?[0-9]{1,3}(?:\.[0-9]{3})*(?:,[0-9]+)?|[-+]?[0-9]+(?:,[0-9]+)?/g;
      const nums: number[] = [];
      let m: RegExpExecArray | null;
      while ((m = numRegex.exec(after)) !== null) {
        nums.push(parseBrazilianNumber(m[0]));
      }

      const companyFreight = nums[0] ?? 0;
      const driverFreight = nums[1] ?? 0;
      const toll = nums[2] ?? 0;
      const icms = nums[4] ?? 0;
      const federalTax = nums[5] ?? 0;
      const netProfit = nums[6] ?? 0;

      transcunhaRecords.push({
        shipmentId,
        cteNumber,
        date,
        clientName,
        plate,
        weight,
        companyFreight,
        driverFreight,
        toll,
        icms,
        federalTax,
        netProfit,
        rawLine: trimmed
      });

      // Também converte para o formato AtuaCteRecord para viabilizar conciliação mútua
      atuaConvertedRecords.push({
        cteNumber,
        docType: 'CT',
        isCanceled: false,
        emissionDate: date,
        branch: 'Transcunha',
        payer: clientName,
        plate,
        weight,
        companyFreight,
        driverFreight,
        icmsIssqn: icms,
        toll,
        federalTax,
        otherCosts: 0,
        result: netProfit,
        isComplementary: (weight === 0 && companyFreight > 0),
        rawLine: trimmed
      });
    }
  }

  return {
    detectedFileType: 'TRANSCUNHA_PROFIT',
    records: atuaConvertedRecords,
    transcunhaRecords,
    periodText,
    startDate,
    endDate,
    totalWeight: atuaConvertedRecords.reduce((sum, r) => sum + r.weight, 0),
    totalFreightCompany: atuaConvertedRecords.reduce((sum, r) => sum + r.companyFreight, 0),
    totalFreightDriver: atuaConvertedRecords.reduce((sum, r) => sum + r.driverFreight, 0),
    totalToll: atuaConvertedRecords.reduce((sum, r) => sum + r.toll, 0),
    totalIcms: atuaConvertedRecords.reduce((sum, r) => sum + r.icmsIssqn, 0),
    totalFederalTax: atuaConvertedRecords.reduce((sum, r) => sum + r.federalTax, 0),
    totalResult: atuaConvertedRecords.reduce((sum, r) => sum + r.result, 0),
    errors
  };
};

/**
 * Extração de alta precisão baseada em coordenadas X/Y do PDF do Atua CTRC
 */
const extractAtuaFromCoordinates = (allPagesItems: any[][]): AtuaCteRecord[] => {
  const records: AtuaCteRecord[] = [];

  for (const pageItems of allPagesItems) {
    const items = pageItems.filter(it => it.str && it.str.trim());
    const rowsMap = new Map<number, any[]>();

    for (const item of items) {
      const y = Math.round(item.transform[5]);
      let foundKey: number | null = null;
      for (const existingY of rowsMap.keys()) {
        if (Math.abs(existingY - y) <= 3) {
          foundKey = existingY;
          break;
        }
      }
      if (foundKey !== null) {
        rowsMap.get(foundKey)!.push(item);
      } else {
        rowsMap.set(y, [item]);
      }
    }

    const sortedY = Array.from(rowsMap.keys()).sort((a, b) => b - a);
    for (const y of sortedY) {
      const row = rowsMap.get(y)!;
      row.sort((a, b) => a.transform[4] - b.transform[4]);

      // Verifica se é uma linha de CT-e: número antes de X=45 e 'C'/'CT' em X 35..60
      const cteItem = row.find(it => it.transform[4] < 45 && /^\d+$/.test(it.str.trim()));
      const typeItem = row.find(it => it.transform[4] >= 35 && it.transform[4] <= 60 && /^[CT|CE]/i.test(it.str.trim()));

      if (!cteItem || !typeItem) continue;

      // Ignora itens de rodapé que possam compartilhar a mesma linha Y
      const validItems = row.filter(it => 
        !it.str.includes('Desenvolvido') && 
        !it.str.includes('maisfrete') && 
        it.transform[4] < 840
      );

      const cteNumber = cteItem.str.trim();

      // Placa (X entre 270 e 325)
      const plateItem = validItems.find(it => {
        const cleanedStr = it.str.replace(/[^A-Za-z0-9]/g, '');
        return it.transform[4] >= 270 && 
          it.transform[4] <= 325 && 
          /^[A-Za-z]{3}[A-Za-z0-9]{4}$/.test(cleanedStr);
      });
      const plate = plateItem ? normalizePlate(plateItem.str) : '';

      // Pagador / Tomador do Frete (X entre 160 e 270, antecede a placa)
      const payerItem = validItems.find(it => it.transform[4] >= 160 && it.transform[4] < 270 && !/^\d+$/.test(it.str.trim()));
      const payer = payerItem ? payerItem.str.trim() : '';

      // Data de Emissão (X entre 65 e 115)
      const dateItem = validItems.find(it => it.transform[4] >= 65 && it.transform[4] <= 115 && /\d{2}\/\d{2}/.test(it.str));
      const emissionDate = dateItem ? normalizeDate(dateItem.str) : '';

      // Verificação de Cancelado (X entre 48 e 68)
      const cancelItem = validItems.find(it => it.transform[4] >= 48 && it.transform[4] <= 68 && /\d{2}\/\d{2}/.test(it.str));
      const isCanceled = Boolean(cancelItem);
      const cancelDate = cancelItem ? normalizeDate(cancelItem.str) : undefined;

      // Colunas numéricas por coordenada X:
      // Peso: 315..348
      const weightItem = validItems.find(it => it.transform[4] >= 315 && it.transform[4] <= 348);
      const weight = weightItem ? parseBrazilianNumber(weightItem.str) : 0;

      // Frete Empresa: 348..382
      const companyFreightItem = validItems.find(it => it.transform[4] > 348 && it.transform[4] <= 382);
      const companyFreight = companyFreightItem ? parseBrazilianNumber(companyFreightItem.str) : 0;

      // Frete Motorista: 382..418
      const driverFreightItem = validItems.find(it => it.transform[4] > 382 && it.transform[4] <= 418);
      const driverFreight = driverFreightItem ? parseBrazilianNumber(driverFreightItem.str) : 0;

      // Tarifa Empresa: 418..445
      const compTariffItem = validItems.find(it => it.transform[4] > 418 && it.transform[4] <= 445);
      const companyTariff = compTariffItem ? parseBrazilianNumber(compTariffItem.str) : undefined;

      // Tarifa Motorista: 445..470
      const drivTariffItem = validItems.find(it => it.transform[4] > 445 && it.transform[4] <= 470);
      const driverTariff = drivTariffItem ? parseBrazilianNumber(drivTariffItem.str) : undefined;

      // Dif. Fr. %: 470..488
      const diffFrItem = validItems.find(it => it.transform[4] > 470 && it.transform[4] <= 488);
      const freightDiffPercent = diffFrItem ? parseBrazilianNumber(diffFrItem.str) : undefined;

      // ICMS ISSQN: 520..548
      const icmsItem = validItems.find(it => it.transform[4] >= 520 && it.transform[4] <= 548);
      const icmsIssqn = icmsItem ? parseBrazilianNumber(icmsItem.str) : 0;

      // Vl. Pedágio: 548..585
      const tollItem = validItems.find(it => it.transform[4] > 548 && it.transform[4] <= 585);
      const toll = tollItem ? parseBrazilianNumber(tollItem.str) : 0;

      // Imposto Federal: 650..682
      const fedItem = validItems.find(it => it.transform[4] >= 650 && it.transform[4] <= 682);
      const federalTax = fedItem ? parseBrazilianNumber(fedItem.str) : 0;

      // Outros Custos: 682..712
      const otherCostsItem = validItems.find(it => it.transform[4] > 682 && it.transform[4] <= 712);
      const otherCosts = otherCostsItem ? parseBrazilianNumber(otherCostsItem.str) : 0;

      // Resultado: 712..742
      const resultItem = validItems.find(it => it.transform[4] > 712 && it.transform[4] <= 742);
      const result = resultItem ? parseBrazilianNumber(resultItem.str) : 0;

      // Cidade Origem: 740..780
      const originItem = validItems.find(it => it.transform[4] >= 740 && it.transform[4] < 780);
      const originCity = originItem ? originItem.str.trim() : '';

      // Cidade Destino: >= 780
      const destItem = validItems.find(it => it.transform[4] >= 780 && it.transform[4] < 840);
      const destinationCity = destItem ? destItem.str.trim() : '';

      const isComplementary = (weight === 0 && companyFreight > 0);

      records.push({
        cteNumber,
        docType: typeItem.str.includes('E') ? 'CE' : 'CT',
        isCanceled,
        cancelDate,
        emissionDate,
        branch: 'Transcunha',
        payer,
        plate,
        weight,
        companyFreight,
        driverFreight,
        companyTariff,
        driverTariff,
        freightDiffPercent,
        icmsIssqn,
        toll,
        federalTax,
        otherCosts,
        result,
        originCity,
        destinationCity,
        isComplementary,
        rawLine: validItems.map(i => i.str).join(' ')
      });
    }
  }

  return records;
};

/**
 * Lê e analisa arquivo PDF do Atua TMS ou Transcunha diretamente no navegador
 */
export const parseAtuaPdfFile = async (file: File): Promise<AtuaReportParseResult> => {
  setupPdfWorker();
  const arrayBuffer = await file.arrayBuffer();

  let pdf: any;
  try {
    pdf = await pdfjsLib.getDocument({
      data: arrayBuffer,
      useSystemFonts: true,
      disableFontFace: true
    }).promise;
  } catch (err: any) {
    console.warn('Tentativa com worker falhou, tentando fallback inline...', err);
    try {
      // Cria blob URL para worker caso haja bloqueio por CORS no ambiente do navegador
      const workerUrl = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version || '6.2.108'}/pdf.worker.min.mjs`;
      const resp = await fetch(workerUrl);
      const blob = await resp.blob();
      pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(blob);
      pdf = await pdfjsLib.getDocument({
        data: arrayBuffer,
        useSystemFonts: true,
        disableFontFace: true
      }).promise;
    } catch (secondErr: any) {
      throw new Error(`Erro ao abrir documento PDF: ${err?.message || secondErr?.message || 'Arquivo corrompido ou formato não suportado'}`);
    }
  }

  let fullText = '';
  const allPagesItems: any[][] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const items = content.items as any[];
    allPagesItems.push(items);

    // Organiza linhas textuais
    const rowsMap = new Map<number, any[]>();
    for (const item of items) {
      if (!item.str || !item.transform) continue;
      const y = Math.round(item.transform[5]);
      let foundKey: number | null = null;
      for (const existingY of rowsMap.keys()) {
        if (Math.abs(existingY - y) <= 3) {
          foundKey = existingY;
          break;
        }
      }
      if (foundKey !== null) {
        rowsMap.get(foundKey)!.push(item);
      } else {
        rowsMap.set(y, [item]);
      }
    }

    const sortedY = Array.from(rowsMap.keys()).sort((a, b) => b - a);
    for (const y of sortedY) {
      const rowItems = rowsMap.get(y)!;
      rowItems.sort((a, b) => a.transform[4] - b.transform[4]);
      const rowLine = rowItems.map(i => i.str).join(' ');
      fullText += rowLine + '\n';
    }
  }

  // Se o documento é o "Relatório: Lucro Real da Operação de Embarque" da Transcunha
  if (fullText.includes('Relatório: Lucro Real da Operação de Embarque') || fullText.includes('Lucro Real da Operação')) {
    return parseTranscunhaTextReport(fullText);
  }

  // Tenta primeiro a extração geométrica por coordenadas (100% de acurácia no CTRC do Atua)
  const coordinateRecords = extractAtuaFromCoordinates(allPagesItems);
  if (coordinateRecords.length > 0) {
    let periodText = '';
    let startDate = '';
    let endDate = '';

    const periodMatch = fullText.match(/Emiss[ãa]o\s+CTRC:\s*(\d{2}\/\d{2}\/\d{2,4})\s*(?:[àa]|at[ée])\s*(\d{2}\/\d{2}\/\d{2,4})/i);
    if (periodMatch) {
      startDate = normalizeDate(periodMatch[1]);
      endDate = normalizeDate(periodMatch[2]);
      periodText = `${periodMatch[1]} a ${periodMatch[2]}`;
    }

    return {
      detectedFileType: 'ATUA_CTRC',
      records: coordinateRecords,
      periodText,
      startDate,
      endDate,
      totalWeight: coordinateRecords.reduce((sum, r) => sum + r.weight, 0),
      totalFreightCompany: coordinateRecords.reduce((sum, r) => sum + r.companyFreight, 0),
      totalFreightDriver: coordinateRecords.reduce((sum, r) => sum + r.driverFreight, 0),
      totalToll: coordinateRecords.reduce((sum, r) => sum + r.toll, 0),
      totalIcms: coordinateRecords.reduce((sum, r) => sum + r.icmsIssqn, 0),
      totalFederalTax: coordinateRecords.reduce((sum, r) => sum + r.federalTax, 0),
      totalResult: coordinateRecords.reduce((sum, r) => sum + r.result, 0),
      errors: []
    };
  }

  // Fallback para parser textual resiliente
  return parseAtuaTextReport(fullText);
};

/**
 * Lê e analisa arquivo Excel (.xlsx, .xls) ou CSV exportado do Atua TMS ou Transcunha
 */
export const parseAtuaExcelFile = async (file: File): Promise<AtuaReportParseResult> => {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const rawRows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

  const records: AtuaCteRecord[] = [];
  const errors: string[] = [];

  // Se o Excel for texto livre ou formatado
  const asText = rawRows.map(r => r.join(' ')).join('\n');
  if (asText.includes('Relatório: Lucro Real da Operação de Embarque') || asText.includes('Lucro Real da Operação')) {
    return parseTranscunhaTextReport(asText);
  }

  let headerIndex = -1;
  let colIndexMap: Record<string, number> = {};

  // Localiza a linha de cabeçalho
  for (let i = 0; i < Math.min(rawRows.length, 25); i++) {
    const row = rawRows[i];
    const joined = row.map(c => String(c).toLowerCase()).join(' ');
    if (
      joined.includes('número') || 
      joined.includes('numero') || 
      joined.includes('ctrc') || 
      joined.includes('ct-e') ||
      (joined.includes('ct') && joined.includes('placa'))
    ) {
      headerIndex = i;
      row.forEach((colName, idx) => {
        const c = String(colName).toLowerCase().trim();
        if (c.includes('número') || c.includes('numero') || c.includes('ct-e') || c.includes('ctrc')) colIndexMap['cte'] = idx;
        else if (c === 't.' || c === 'tipo') colIndexMap['type'] = idx;
        else if (c.includes('emissão') || c.includes('emissao') || c.includes('data')) colIndexMap['date'] = idx;
        else if (c.includes('placa')) colIndexMap['plate'] = idx;
        else if (c.includes('peso')) colIndexMap['weight'] = idx;
        else if (c.includes('frete empr') || c.includes('fr. empr') || c.includes('frete empresa')) colIndexMap['freightCompany'] = idx;
        else if (c.includes('frete mot') || c.includes('fr. mot') || c.includes('frete motorista')) colIndexMap['freightDriver'] = idx;
        else if (c.includes('tarifa empr') || c.includes('tarifa empresa') || c.includes('tar. empr')) colIndexMap['companyTariff'] = idx;
        else if (c.includes('tarifa mot') || c.includes('tarifa motorista') || c.includes('tar. mot')) colIndexMap['driverTariff'] = idx;
        else if (c.includes('icms') || c.includes('issqn')) colIndexMap['icms'] = idx;
        else if (c.includes('ped.') || c.includes('pedagio') || c.includes('pedágio')) colIndexMap['toll'] = idx;
        else if (c.includes('imp. fed') || c.includes('fed. imp') || c.includes('imposto federal')) colIndexMap['federalTax'] = idx;
        else if (c.includes('outros custos') || c.includes('custos')) colIndexMap['otherCosts'] = idx;
        else if (c.includes('result') || c.includes('resultado')) colIndexMap['result'] = idx;
        else if (c.includes('origem')) colIndexMap['origin'] = idx;
        else if (c.includes('destino')) colIndexMap['destination'] = idx;
        else if (c.includes('pagador') || c.includes('tomador') || c.includes('cliente') || c.includes('remetente')) colIndexMap['client'] = idx;
      });
      break;
    }
  }

  // Se não achou cabeçalho clássico em tabela, tenta ler via parser de linha textual
  if (headerIndex === -1) {
    return parseAtuaTextReport(asText);
  }

  // Itera sobre as linhas de dados
  for (let r = headerIndex + 1; r < rawRows.length; r++) {
    const row = rawRows[r];
    if (!row || row.length === 0) continue;

    const cteRaw = colIndexMap['cte'] !== undefined ? String(row[colIndexMap['cte']]).trim() : '';
    if (!cteRaw || cteRaw.toLowerCase().includes('total') || isNaN(Number(cteRaw.replace(/[^0-9]/g, '')))) {
      continue;
    }

    const cteNumber = cteRaw.replace(/[^0-9]/g, '');
    const emissionDate = colIndexMap['date'] !== undefined ? normalizeDate(String(row[colIndexMap['date']])) : '';
    const plate = colIndexMap['plate'] !== undefined ? normalizePlate(String(row[colIndexMap['plate']])) : '';
    const weight = colIndexMap['weight'] !== undefined ? parseBrazilianNumber(row[colIndexMap['weight']]) : 0;
    const companyFreight = colIndexMap['freightCompany'] !== undefined ? parseBrazilianNumber(row[colIndexMap['freightCompany']]) : 0;
    const driverFreight = colIndexMap['freightDriver'] !== undefined ? parseBrazilianNumber(row[colIndexMap['freightDriver']]) : 0;
    const companyTariff = colIndexMap['companyTariff'] !== undefined ? parseBrazilianNumber(row[colIndexMap['companyTariff']]) : undefined;
    const driverTariff = colIndexMap['driverTariff'] !== undefined ? parseBrazilianNumber(row[colIndexMap['driverTariff']]) : undefined;
    const payer = colIndexMap['client'] !== undefined ? String(row[colIndexMap['client']]).trim() : '';
    const icmsIssqn = colIndexMap['icms'] !== undefined ? parseBrazilianNumber(row[colIndexMap['icms']]) : 0;
    const toll = colIndexMap['toll'] !== undefined ? parseBrazilianNumber(row[colIndexMap['toll']]) : 0;
    const federalTax = colIndexMap['federalTax'] !== undefined ? parseBrazilianNumber(row[colIndexMap['federalTax']]) : 0;
    const otherCosts = colIndexMap['otherCosts'] !== undefined ? parseBrazilianNumber(row[colIndexMap['otherCosts']]) : 0;
    const result = colIndexMap['result'] !== undefined ? parseBrazilianNumber(row[colIndexMap['result']]) : 0;
    const originCity = colIndexMap['origin'] !== undefined ? String(row[colIndexMap['origin']]) : '';
    const destinationCity = colIndexMap['destination'] !== undefined ? String(row[colIndexMap['destination']]) : '';

    const isComplementary = (weight === 0 && companyFreight > 0);

    records.push({
      cteNumber,
      docType: 'CT',
      isCanceled: false,
      emissionDate,
      branch: 'Transcunha',
      payer,
      plate,
      weight,
      companyFreight,
      driverFreight,
      companyTariff,
      driverTariff,
      icmsIssqn,
      toll,
      federalTax,
      otherCosts,
      result,
      originCity,
      destinationCity,
      isComplementary,
      rawLine: row.join(' | ')
    });
  }

  return {
    detectedFileType: 'ATUA_CTRC',
    records,
    totalWeight: records.reduce((sum, r) => sum + r.weight, 0),
    totalFreightCompany: records.reduce((sum, r) => sum + r.companyFreight, 0),
    totalFreightDriver: records.reduce((sum, r) => sum + r.driverFreight, 0),
    totalToll: records.reduce((sum, r) => sum + r.toll, 0),
    totalIcms: records.reduce((sum, r) => sum + r.icmsIssqn, 0),
    totalFederalTax: records.reduce((sum, r) => sum + r.federalTax, 0),
    totalResult: records.reduce((sum, r) => sum + r.result, 0),
    errors
  };
};
