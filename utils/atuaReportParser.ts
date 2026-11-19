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
 * Compara duas placas de forma inteligente com suporte a:
 * - Placas Mercosul e Tradicionais (cinza)
 * - Mapeamento da conversão oficial Mercosul do 5º dígito (0=A, 1=B, 2=C, 3=D, 4=E, 5=F, 6=G, 7=H, 8=I, 9=J)
 * - Tolerância a erros clássicos de OCR / digitação manual (S <-> 5, O <-> 0, I <-> 1, Z <-> 2, B <-> 8)
 */
export const arePlatesMatching = (p1?: string | null, p2?: string | null): boolean => {
  if (!p1 || !p2) return false;
  const c1 = normalizePlate(p1);
  const c2 = normalizePlate(p2);
  if (!c1 || !c2) return false;
  if (c1 === c2) return true;

  if (c1.length === 7 && c2.length === 7) {
    const fuzzy = (str: string) => str
      .replace(/S/g, '5')
      .replace(/O/g, '0')
      .replace(/I/g, '1')
      .replace(/Z/g, '2')
      .replace(/B/g, '8');
    if (fuzzy(c1) === fuzzy(c2)) return true;

    const mercosulDigitToLetter: Record<string, string> = {
      '0': 'A', '1': 'B', '2': 'C', '3': 'D', '4': 'E',
      '5': 'F', '6': 'G', '7': 'H', '8': 'I', '9': 'J'
    };
    const mercosulLetterToDigit: Record<string, string> = {
      'A': '0', 'B': '1', 'C': '2', 'D': '3', 'E': '4',
      'F': '5', 'G': '6', 'H': '7', 'I': '8', 'J': '9'
    };

    const toMercosulLetter = (plate: string) => {
      const arr = plate.split('');
      if (mercosulDigitToLetter[arr[4]]) arr[4] = mercosulDigitToLetter[arr[4]];
      return arr.join('');
    };

    const toTraditionalDigit = (plate: string) => {
      const arr = plate.split('');
      if (mercosulLetterToDigit[arr[4]]) arr[4] = mercosulLetterToDigit[arr[4]];
      return arr.join('');
    };

    if (toMercosulLetter(c1) === toMercosulLetter(c2)) return true;
    if (toTraditionalDigit(c1) === toTraditionalDigit(c2)) return true;
  }

  return false;
};

/**
 * Normaliza data DD/MM/YY ou DD/MM/YYYY ou YYYY-MM-DD para estritamente YYYY-MM-DD
 */
export const normalizeDate = (dateStr: string): string => {
  if (!dateStr) return '';
  const trimmed = dateStr.trim();
  // DD/MM/YYYY or DD/MM/YY (com ou sem hora)
  const dmy = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (dmy) {
    let year = dmy[3];
    if (year.length === 2) {
      year = '20' + year;
    }
    const month = dmy[2].padStart(2, '0');
    const day = dmy[1].padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  // YYYY-MM-DD ou ISO timestamp (com ou sem hora)
  const ymd = trimmed.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (ymd) {
    const year = ymd[1];
    const month = ymd[2].padStart(2, '0');
    const day = ymd[3].padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return dateStr.substring(0, 10);
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
  // "28 CT 23/10/26 ..."
  // Suporta CT-es de 1 a 8 dígitos, com ou sem espaçamento em 'C T' ou 'CT' / 'CE'
  const headerOrPrefix = cleaned.match(/^(\d{1,8})\s*(?:C\s*([TE])|([A-Z]{1,2}))?\b/i);
  if (!headerOrPrefix) return null;

  const cteNumber = headerOrPrefix[1];
  const docType = (headerOrPrefix[2] || headerOrPrefix[3] || 'CT').toUpperCase().includes('E') ? 'CE' : 'CT';

  // Procura data de emissão na linha (DD/MM/AA ou DD/MM/AAAA)
  const allDates = Array.from(cleaned.matchAll(/\b(\d{2}\/\d{2}(?:\/\d{2,4})?)\b/g));
  let emissionDate = '';
  let emissionTime = '';
  let isCanceled = cleaned.includes('CANCELADO') || cleaned.includes('Canc.');
  let cancelDate: string | undefined = undefined;

  if (allDates.length >= 2 && (isCanceled || cleaned.includes('Canc'))) {
    // Se há 2 datas e a coluna é de cancelamento
    cancelDate = normalizeDate(allDates[0][1]);
    emissionDate = normalizeDate(allDates[1][1]);
  } else if (allDates.length > 0) {
    emissionDate = normalizeDate(allDates[0][1]);
  }

  const timeMatch = cleaned.match(/\b(\d{2}:\d{2})\b/);
  if (timeMatch) {
    emissionTime = timeMatch[1];
  }

  // Procura padrão de placa Mercosul ou tradicional (7 caracteres alfanuméricos com 3 letras no início)
  const plateMatch = cleaned.match(/\b([A-Za-z]{3}[0-9][A-Za-z0-9][0-9]{2})\b/) ||
                     cleaned.match(/\b([A-Za-z]{3}-?[0-9]{4})\b/);
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
  const cityRegex = /(?:[A-Za-zÀ-ÿ\s]{3,}\s*\/\s*[A-Za-z]{2})/g;
  const citiesFound = Array.from(afterPlate.matchAll(cityRegex)).map(m => m[0].trim());
  const originCity = citiesFound[0] || '';
  const destinationCity = citiesFound[1] || '';

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

  if (numbersFound.length < 2) {
    return null;
  }

  // Uma linha de CT-e válida do Atua DEVE obrigatoriamente ter uma data de emissão ou placa.
  // Linhas de totalizadores/resumo não possuem data nem placa e NÃO podem ser tratadas como CT-e.
  if (!emissionDate && !plate) {
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
    isCanceled,
    cancelDate,
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
    originCity,
    destinationCity,
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
  const periodMatch = fullText.match(/(?:Emiss[ãa]o\s*(?:CTRC|CT-?e|Documentos)?|Per[íi]odo|Periodo|Data(?:\s+de\s+Emiss[ãa]o)?)\s*:\s*(\d{1,2}\/\d{1,2}\/\d{2,4})\s*(?:[àa]|at[ée]|\-)\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
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

  // Se não encontrou período no cabeçalho, detecta pelos próprios registros do arquivo
  if ((!startDate || !endDate) && records.length > 0) {
    const allDates = records
      .map(r => normalizeDate(r.emissionDate || ''))
      .filter(d => Boolean(d && d.length === 10))
      .sort();
    if (allDates.length > 0) {
      if (!startDate) startDate = allDates[0];
      if (!endDate) endDate = allDates[allDates.length - 1];
      if (!periodText) {
        periodText = `${startDate.split('-').reverse().join('/')} a ${endDate.split('-').reverse().join('/')}`;
      }
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

      // Ignora itens de rodapé que possam compartilhar a mesma linha Y
      const validItems = row.filter(it => 
        !it.str.includes('Desenvolvido') && 
        !it.str.includes('maisfrete') && 
        it.transform[4] < 860
      );

      const lineText = validItems.map(it => it.str).join(' ').trim();
      if (!lineText) continue;

      if (
        lineText.includes('Ambiente de Produção') ||
        lineText.includes('Relatório:') ||
        lineText.startsWith('Número') ||
        lineText.startsWith('T. =') ||
        lineText.startsWith('Vl. Out.') ||
        lineText.startsWith('Vl. Resultado')
      ) {
        continue;
      }

      // Detecção precisa do número do CT-e e tipo
      // NOTA: O número do CT-e fica obrigatoriamente na primeira coluna "Número" (X < 75)
      let cteNumber = '';
      let docType = 'CT';

      const cteItem = row.find(it => it.transform[4] < 75 && /^\d{1,8}$/.test(it.str.trim()) && parseInt(it.str.trim(), 10) > 0);
      if (cteItem) {
        cteNumber = cteItem.str.trim();
        const typeItem = row.find(it => it.transform[4] >= cteItem.transform[4] && it.transform[4] <= 90 && /^[CT|CE]/i.test(it.str.trim()));
        docType = (typeItem?.str || 'CT').toUpperCase().includes('E') ? 'CE' : 'CT';
      } else {
        // Fallback: somente se houver data de emissão ou placa no texto (evita totalizadores como "152 6.203,570...")
        const hasDateOrPlate = /\b\d{2}\/\d{2}(?:\/\d{2,4})?\b/.test(lineText) ||
          /\b([A-Za-z]{3}[0-9][A-Za-z0-9][0-9]{2}|[A-Za-z]{3}-?[0-9]{4})\b/.test(lineText);
        if (hasDateOrPlate) {
          const startTextMatch = lineText.match(/^(\d{1,8})\s*(?:C\s*([TE])|([A-Z]{1,2}))?\b/i);
          if (startTextMatch && parseInt(startTextMatch[1], 10) > 0) {
            cteNumber = startTextMatch[1];
            docType = (startTextMatch[2] || startTextMatch[3] || 'CT').toUpperCase().includes('E') ? 'CE' : 'CT';
          }
        }
      }

      if (!cteNumber) continue;

      // Placa: Busca prioritária por coordenada (240..360), com fallback regex na linha
      let plate = '';
      const plateItem = validItems.find(it => {
        const cleanedStr = it.str.replace(/[^A-Za-z0-9]/g, '');
        return it.transform[4] >= 240 && 
          it.transform[4] <= 360 && 
          (/^[A-Za-z]{3}[0-9][A-Za-z0-9][0-9]{2}$/.test(cleanedStr) || /^[A-Za-z]{3}[0-9]{4}$/.test(cleanedStr));
      });
      if (plateItem) {
        plate = normalizePlate(plateItem.str);
      } else {
        const plateMatch = lineText.match(/\b([A-Za-z]{3}[0-9][A-Za-z0-9][0-9]{2})\b/) ||
                           lineText.match(/\b([A-Za-z]{3}-?[0-9]{4})\b/);
        if (plateMatch) {
          plate = normalizePlate(plateMatch[1]);
        }
      }

      // Filial / Unidade emissora do Atua (X entre 120 e 165, ex: "1 / MATRI", "4 / AGEN")
      const branchItem = validItems.find(it => it.transform[4] >= 120 && it.transform[4] <= 165 && /^\d+\s*\//.test(it.str.trim()));
      const branch = branchItem ? branchItem.str.trim() : 'Transcunha';

      // Pagador / Tomador do Frete (X entre 160 e 285, antecede a placa)
      const payerItem = validItems.find(it => it.transform[4] >= 160 && it.transform[4] < 285 && !/^\d+$/.test(it.str.trim()) && !/\d{2}\/\d{2}/.test(it.str));
      const payer = payerItem ? payerItem.str.trim() : '';

      // Data de Emissão (X entre 60 e 130)
      const dateItem = validItems.find(it => it.transform[4] >= 60 && it.transform[4] <= 130 && /\d{2}\/\d{2}/.test(it.str));
      let emissionDate = dateItem ? normalizeDate(dateItem.str) : '';
      if (!emissionDate) {
        const anyDate = lineText.match(/\b(\d{2}\/\d{2}(?:\/\d{2,4})?)\b/);
        if (anyDate) emissionDate = normalizeDate(anyDate[1]);
      }

      // Regra de Integridade Fiscal: Se a linha não tiver data de emissão nem placa de veículo,
      // trata-se de totalizador de rodapé do relatório (ex: somatório e contagem de 152 CTRCs) e DEVE ser descartada!
      if (!emissionDate && !plate) continue;

      // Verificação de Cancelado (X entre 45 e 70)
      const cancelItem = validItems.find(it => it.transform[4] >= 45 && it.transform[4] <= 70 && /\d{2}\/\d{2}/.test(it.str));
      const isCanceled = Boolean(cancelItem) || lineText.includes('CANCELADO') || lineText.includes('Canc.');
      const cancelDate = cancelItem ? normalizeDate(cancelItem.str) : undefined;

      // Colunas numéricas por coordenada X:
      // Peso: 300..355
      const weightItem = validItems.find(it => it.transform[4] >= 300 && it.transform[4] <= 355 && /^[0-9.,]+$/.test(it.str.trim()));
      let weight = weightItem ? parseBrazilianNumber(weightItem.str) : 0;

      // Frete Empresa: 345..385
      const companyFreightItem = validItems.find(it => it.transform[4] > 345 && it.transform[4] <= 385 && /^[0-9.,]+$/.test(it.str.trim()));
      let companyFreight = companyFreightItem ? parseBrazilianNumber(companyFreightItem.str) : 0;

      // Frete Motorista: 380..425
      const driverFreightItem = validItems.find(it => it.transform[4] > 380 && it.transform[4] <= 425 && /^[0-9.,]+$/.test(it.str.trim()));
      let driverFreight = driverFreightItem ? parseBrazilianNumber(driverFreightItem.str) : 0;

      // Fallback numérico resiliente se colunas coordenadas falharem ou deslocarem
      if (weight === 0 && companyFreight === 0) {
        let afterPlate = lineText;
        if (plate) {
          const pIdx = lineText.indexOf(plate);
          if (pIdx >= 0) afterPlate = lineText.slice(pIdx + plate.length);
        }
        const numRegex = /[-+]?[0-9]{1,3}(?:\.[0-9]{3})*(?:,[0-9]+)?|[-+]?[0-9]+(?:,[0-9]+)?/g;
        const lineNums = (afterPlate.match(numRegex) || []).map(parseBrazilianNumber);
        if (lineNums.length >= 2) {
          weight = lineNums[0];
          companyFreight = lineNums[1];
          if (lineNums.length >= 3) driverFreight = lineNums[2];
        }
      }

      // Tarifa Empresa: 415..448
      const compTariffItem = validItems.find(it => it.transform[4] > 415 && it.transform[4] <= 448);
      const companyTariff = compTariffItem ? parseBrazilianNumber(compTariffItem.str) : (weight > 0 && companyFreight > 0 ? Number((companyFreight / weight).toFixed(2)) : undefined);

      // Tarifa Motorista: 445..475
      const drivTariffItem = validItems.find(it => it.transform[4] > 445 && it.transform[4] <= 475);
      const driverTariff = drivTariffItem ? parseBrazilianNumber(drivTariffItem.str) : (weight > 0 && driverFreight > 0 ? Number((driverFreight / weight).toFixed(2)) : undefined);

      // Dif. Fr. %: 470..495
      const diffFrItem = validItems.find(it => it.transform[4] > 470 && it.transform[4] <= 495);
      const freightDiffPercent = diffFrItem ? parseBrazilianNumber(diffFrItem.str) : undefined;

      // ICMS ISSQN: 515..550
      const icmsItem = validItems.find(it => it.transform[4] >= 515 && it.transform[4] <= 550);
      const icmsIssqn = icmsItem ? parseBrazilianNumber(icmsItem.str) : 0;

      // Vl. Pedágio: 545..590
      const tollItem = validItems.find(it => it.transform[4] > 545 && it.transform[4] <= 590);
      const toll = tollItem ? parseBrazilianNumber(tollItem.str) : 0;

      // Imposto Federal: 645..685
      const fedItem = validItems.find(it => it.transform[4] >= 645 && it.transform[4] <= 685);
      const federalTax = fedItem ? parseBrazilianNumber(fedItem.str) : 0;

      // Outros Custos: 680..715
      const otherCostsItem = validItems.find(it => it.transform[4] > 680 && it.transform[4] <= 715);
      const otherCosts = otherCostsItem ? parseBrazilianNumber(otherCostsItem.str) : 0;

      // Resultado: 710..745
      const resultItem = validItems.find(it => it.transform[4] > 710 && it.transform[4] <= 745);
      const result = resultItem ? parseBrazilianNumber(resultItem.str) : 0;

      // Cidade Origem: 735..785
      const originItem = validItems.find(it => it.transform[4] >= 735 && it.transform[4] < 785);
      let originCity = originItem ? originItem.str.trim() : '';

      // Cidade Destino: >= 780
      const destItem = validItems.find(it => it.transform[4] >= 780 && it.transform[4] < 860);
      let destinationCity = destItem ? destItem.str.trim() : '';

      // Fallback para cidades por regex
      if (!originCity || !destinationCity) {
        const cityMatches = Array.from(lineText.matchAll(/\b([A-Za-zÀ-ÿ\s]{3,})\s*\/\s*([A-Za-z]{2})\b/g));
        if (cityMatches.length >= 2) {
          if (!originCity) originCity = `${cityMatches[0][1].trim()} / ${cityMatches[0][2].toUpperCase()}`;
          if (!destinationCity) destinationCity = `${cityMatches[1][1].trim()} / ${cityMatches[1][2].toUpperCase()}`;
        } else if (cityMatches.length === 1 && !originCity) {
          originCity = `${cityMatches[0][1].trim()} / ${cityMatches[0][2].toUpperCase()}`;
        }
      }

      const isComplementary = (weight === 0 && companyFreight > 0);

      records.push({
        cteNumber,
        docType,
        isCanceled,
        cancelDate,
        emissionDate,
        branch: branch || 'Transcunha',
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
        rawLine: lineText
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

  // Combina extração geométrica por coordenadas com parser textual resiliente para 100% de cobertura
  const coordinateRecords = extractAtuaFromCoordinates(allPagesItems);
  const textResult = parseAtuaTextReport(fullText);
  const textRecords = textResult.records || [];

  // coordinateRecords contém a extração posicional precisa de cada linha física do PDF.
  // ATENÇÃO CRÍTICA: Cada filial/série pode emitir um CT-e com o mesmo número no mesmo mês (homônimos).
  // Portanto, a lista NUNCA pode ser desduplicada apenas por cteNumber! Todos os CT-es reais devem ser preservados.
  const finalRecords: AtuaCteRecord[] = [...coordinateRecords];

  // Completa propriedades que possam estar zeradas nos registros por coordenadas usando dados do parser textual
  for (const tRec of textRecords) {
    if (!tRec.cteNumber) continue;
    const existing = finalRecords.find(r => 
      r.cteNumber === tRec.cteNumber && 
      (r.plate === tRec.plate || arePlatesMatching(r.plate, tRec.plate)) &&
      (r.emissionDate === tRec.emissionDate || !r.emissionDate || !tRec.emissionDate)
    );
    if (existing) {
      if (!existing.plate && tRec.plate) existing.plate = tRec.plate;
      if (existing.weight === 0 && tRec.weight > 0) existing.weight = tRec.weight;
      if (existing.companyFreight === 0 && tRec.companyFreight > 0) existing.companyFreight = tRec.companyFreight;
      if (existing.driverFreight === 0 && tRec.driverFreight > 0) existing.driverFreight = tRec.driverFreight;
      if (!existing.originCity && tRec.originCity) existing.originCity = tRec.originCity;
      if (!existing.destinationCity && tRec.destinationCity) existing.destinationCity = tRec.destinationCity;
      if (!existing.emissionDate && tRec.emissionDate) existing.emissionDate = tRec.emissionDate;
      if (existing.toll === 0 && tRec.toll > 0) existing.toll = tRec.toll;
      if (existing.icmsIssqn === 0 && tRec.icmsIssqn > 0) existing.icmsIssqn = tRec.icmsIssqn;
      if (existing.federalTax === 0 && tRec.federalTax > 0) existing.federalTax = tRec.federalTax;
      if (existing.result === 0 && tRec.result !== 0) existing.result = tRec.result;
    } else {
      // Se porventura uma linha só foi encontrada no parser textual, adiciona se não houver mesmo CT-e e placa
      const alreadyPresent = finalRecords.some(r => 
        r.cteNumber === tRec.cteNumber && arePlatesMatching(r.plate, tRec.plate)
      );
      if (!alreadyPresent && (tRec.emissionDate || tRec.plate)) {
        finalRecords.push(tRec);
      }
    }
  }

  const combinedRecords = finalRecords;
  if (combinedRecords.length > 0) {
    let periodText = '';
    let startDate = '';
    let endDate = '';

    const periodMatch = fullText.match(/(?:Emiss[ãa]o\s*(?:CTRC|CT-?e|Documentos)?|Per[íi]odo|Periodo|Data(?:\s+de\s+Emiss[ãa]o)?)\s*:\s*(\d{1,2}\/\d{1,2}\/\d{2,4})\s*(?:[àa]|at[ée]|\-)\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
    if (periodMatch) {
      startDate = normalizeDate(periodMatch[1]);
      endDate = normalizeDate(periodMatch[2]);
      periodText = `${periodMatch[1]} a ${periodMatch[2]}`;
    }

    // Se não encontrou período no cabeçalho do PDF, detecta pelos próprios registros consolidados
    if ((!startDate || !endDate) && combinedRecords.length > 0) {
      const allDates = combinedRecords
        .map(r => normalizeDate(r.emissionDate || ''))
        .filter(d => Boolean(d && d.length === 10))
        .sort();
      if (allDates.length > 0) {
        if (!startDate) startDate = allDates[0];
        if (!endDate) endDate = allDates[allDates.length - 1];
        if (!periodText) {
          periodText = `${startDate.split('-').reverse().join('/')} a ${endDate.split('-').reverse().join('/')}`;
        }
      }
    }

    return {
      detectedFileType: 'ATUA_CTRC',
      records: combinedRecords,
      periodText,
      startDate,
      endDate,
      totalWeight: combinedRecords.reduce((sum, r) => sum + r.weight, 0),
      totalFreightCompany: combinedRecords.reduce((sum, r) => sum + r.companyFreight, 0),
      totalFreightDriver: combinedRecords.reduce((sum, r) => sum + r.driverFreight, 0),
      totalToll: combinedRecords.reduce((sum, r) => sum + r.toll, 0),
      totalIcms: combinedRecords.reduce((sum, r) => sum + r.icmsIssqn, 0),
      totalFederalTax: combinedRecords.reduce((sum, r) => sum + r.federalTax, 0),
      totalResult: combinedRecords.reduce((sum, r) => sum + r.result, 0),
      errors: []
    };
  }

  // Fallback para parser textual resiliente caso nada tenha sido consolidado
  return textResult;
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
