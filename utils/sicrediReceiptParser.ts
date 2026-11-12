import { extractTextFromPdfBuffer } from './fiscalDocParser';

export interface SicrediReceiptParsedData {
  isSicredi: boolean;
  bankName: string;
  paymentDate?: string;      // YYYY-MM-DD
  dueDate?: string;          // YYYY-MM-DD
  originalAmount?: number;   // R$ original
  interestAmount?: number;   // R$ juros / mora / encargos / multa
  discountAmount?: number;   // R$ desconto / abatimento
  paidAmount?: number;       // R$ valor real pago / valor cobrado
  authCode?: string;         // Código de autenticação / controle / protocolo
  txId?: string;             // ID da transação Pix (E2E)
  identificador?: string;    // Identificador da transação / DARF / DARE
  controlNumber?: string;    // Número de controle
  beneficiaryName?: string;  // Favorecido / Cedente / Beneficiário / Destinatário
  payerName?: string;        // Pagador (Transcunha...)
  barCode?: string;          // Linha digitável ou código de barras
  operationType?: string;    // 'Boleto' | 'Pix' | 'Transferência' | 'Outro'
  rawText?: string;
}

/**
 * Converte strings monetárias brasileiras (ex: "2.359,46" ou "R$ 1.500,00") em número.
 */
function parseBrlCurrency(str?: string): number | undefined {
  if (!str) return undefined;
  const clean = str
    .replace(/[^\d.,]/g, '')
    .trim();
  if (!clean) return undefined;

  // Se tiver vírgula, substitui pontos de milhar e troca vírgula por ponto
  if (clean.includes(',')) {
    const normalized = clean.replace(/\./g, '').replace(',', '.');
    const num = parseFloat(normalized);
    return isNaN(num) ? undefined : Number(num.toFixed(2));
  }

  const num = parseFloat(clean);
  return isNaN(num) ? undefined : Number(num.toFixed(2));
}

/**
 * Converte data DD/MM/AAAA para YYYY-MM-DD
 */
function parseBrlDate(str?: string): string | undefined {
  if (!str) return undefined;
  const match = str.match(/(\d{2})[\/.-](\d{2})[\/.-](\d{4})/);
  if (!match) return undefined;
  const [, d, m, y] = match;
  return `${y}-${m}-${d}`;
}

/**
 * Analisa o texto extraído de um comprovante para identificar padrões do Sicredi
 * ou comprovantes bancários gerais (Itaú, Bradesco, etc.)
 */
export function parseSicrediReceipt(text: string): SicrediReceiptParsedData {
  const normText = text.replace(/\r\n/g, '\n');
  const upper = normText.toUpperCase();

  // 1. Identificação do Banco Sicredi
  const isSicredi = 
    upper.includes('SICREDI') || 
    upper.includes('748 -') || 
    upper.includes('BANCO COOPERATIVO SICREDI') ||
    upper.includes('COOPERATIVA SICREDI');

  const bankName = isSicredi 
    ? 'Sicredi' 
    : upper.includes('ITAÚ') || upper.includes('ITAU') 
    ? 'Itaú' 
    : upper.includes('BRADESCO') 
    ? 'Bradesco' 
    : upper.includes('SANTANDER') 
    ? 'Santander' 
    : upper.includes('BANCO DO BRASIL') 
    ? 'Banco do Brasil' 
    : upper.includes('CAIXA') 
    ? 'Caixa' 
    : 'Banco';

  // 2. Tipo de Operação
  let operationType = 'Outro';
  if (upper.includes('PAGAMENTO DE TÍTULO') || upper.includes('PAGAMENTO DE TITULO') || upper.includes('BOLETO')) {
    operationType = 'Boleto';
  } else if (upper.includes('PIX') || upper.includes('TRANSFERÊNCIA PIX') || upper.includes('CHAVE PIX')) {
    operationType = 'Pix';
  } else if (upper.includes('TED') || upper.includes('DOC') || upper.includes('TRANSFERÊNCIA')) {
    operationType = 'Transferência';
  }

  // 3. Extração da Data do Pagamento / Débito
  let paymentDate: string | undefined;
  const payDatePatterns = [
    /(?:realizado\s*em)\s*[:=]?\s*(\d{2}[\/.-]\d{2}[\/.-]\d{4})/i,
    /(?:data\s*(?:do\s*)?(?:pagamento|d[eé]bito|opera[cç][aã]o|movimento))\s*[:=]?\s*(\d{2}[\/.-]\d{2}[\/.-]\d{4})/i,
    /(?:pago\s*em|efetivado\s*em|liquidado\s*em)\s*[:=]?\s*(\d{2}[\/.-]\d{2}[\/.-]\d{4})/i,
    /(\d{2}\/\d{2}\/\d{4})\s*-\s*\d{2}:\d{2}:\d{2}/,
    /(?:data)\s*[:=]\s*(\d{2}[\/.-]\d{2}[\/.-]\d{4})/i
  ];

  for (const regex of payDatePatterns) {
    const match = normText.match(regex);
    if (match?.[1]) {
      paymentDate = parseBrlDate(match[1]);
      if (paymentDate) break;
    }
  }

  // 4. Extração da Data de Vencimento
  let dueDate: string | undefined;
  const dueDatePatterns = [
    /(?:data\s*(?:de\s*)?vencimento|vencimento)\s*[:=]?\s*(\d{2}[\/.-]\d{2}[\/.-]\d{4})/i
  ];
  for (const regex of dueDatePatterns) {
    const match = normText.match(regex);
    if (match?.[1]) {
      dueDate = parseBrlDate(match[1]);
      if (dueDate) break;
    }
  }

  // 5. Extração de Valores: Original, Juros, Abatimento e Pago
  let originalAmount: number | undefined;
  let interestAmount = 0;
  let discountAmount = 0;
  let paidAmount: number | undefined;

  // Valor do Título / Documento (Original)
  const origAmountPatterns = [
    /(?:valor\s*original)\s*[:=]?\s*(?:R\$\s*)?([\d.,]+)/i,
    /(?:valor\s*(?:do\s*)?(?:t[ií]tulo|documento|nominal))\s*[:=]?\s*(?:R\$\s*)?([\d.,]+)/i,
    /(?:valor\s*principal)\s*[:=]?\s*(?:R\$\s*)?([\d.,]+)/i
  ];
  for (const regex of origAmountPatterns) {
    const match = normText.match(regex);
    if (match?.[1]) {
      originalAmount = parseBrlCurrency(match[1]);
      if (originalAmount) break;
    }
  }

  // Juros / Multa / Encargos / Mora
  const interestPatterns = [
    /(?:(?:juros|multa|mora|encargos)(?:\s*[\/ e]\s*(?:multa|mora|encargos|acréscimos))?)\s*[:=]?\s*(?:R\$\s*)?([\d.,]+)/i,
    /(?:valor\s*(?:dos\s*)?juros)\s*[:=]?\s*(?:R\$\s*)?([\d.,]+)/i,
    /(?:outros\s*acr[eé]scimos)\s*[:=]?\s*(?:R\$\s*)?([\d.,]+)/i
  ];
  for (const regex of interestPatterns) {
    const match = normText.match(regex);
    if (match?.[1]) {
      const val = parseBrlCurrency(match[1]);
      if (val !== undefined && val > 0) {
        interestAmount = val;
        break;
      }
    }
  }

  // Desconto / Abatimento
  const discountPatterns = [
    /(?:(?:desconto|abatimento|dedu[cç][oõ]es)(?:\s*[\/ e]\s*(?:abatimento|dedu[cç][oõ]es))?)\s*[:=]?\s*(?:R\$\s*)?([\d.,]+)/i,
    /(?:valor\s*(?:do\s*)?desconto)\s*[:=]?\s*(?:R\$\s*)?([\d.,]+)/i,
    /(?:outras\s*dedu[cç][oõ]es)\s*[:=]?\s*(?:R\$\s*)?([\d.,]+)/i
  ];
  for (const regex of discountPatterns) {
    const match = normText.match(regex);
    if (match?.[1]) {
      const val = parseBrlCurrency(match[1]);
      if (val !== undefined && val > 0) {
        discountAmount = val;
        break;
      }
    }
  }

  // Valor Cobrado / Valor Pago / Valor do Débito (Valor Real)
  const paidAmountPatterns = [
    /(?:valor\s*(?:pago|cobrado|do\s*d[eé]bito|total|l[ií]quido))\s*[:=]?\s*(?:R\$\s*)?([\d.,]+)/i,
    /(?:total\s*pago)\s*[:=]?\s*(?:R\$\s*)?([\d.,]+)/i,
    /(?:valor)\s*[:=]\s*(?:R\$\s*)?([\d.,]+)/i
  ];
  for (const regex of paidAmountPatterns) {
    const match = normText.match(regex);
    if (match?.[1]) {
      paidAmount = parseBrlCurrency(match[1]);
      if (paidAmount) break;
    }
  }

  // Regra de Consistência e Recálculo Automático:
  if (originalAmount !== undefined) {
    const calculatedPaid = Number((originalAmount + interestAmount - discountAmount).toFixed(2));
    if (paidAmount === undefined || paidAmount === 0) {
      paidAmount = calculatedPaid;
    } else if (interestAmount === 0 && paidAmount > originalAmount) {
      interestAmount = Number((paidAmount - originalAmount).toFixed(2));
    } else if (discountAmount === 0 && paidAmount < originalAmount) {
      discountAmount = Number((originalAmount - paidAmount).toFixed(2));
    }
  } else if (paidAmount !== undefined && originalAmount === undefined) {
    originalAmount = Number((paidAmount - interestAmount + discountAmount).toFixed(2));
  }

  // 6. Extração do Código de Autenticação / Protocolo / Controle / Transação
  let authCode: string | undefined;
  let txId: string | undefined;
  let identificador: string | undefined;
  let controlNumber: string | undefined;

  const txMatch = normText.match(/(?:id\s*(?:da\s*)?transa[cç][aã]o|e2eid)\s*[:=]?\s*([A-Za-z0-9.\-_]{16,})/i);
  if (txMatch) txId = txMatch[1].trim();

  const identMatch = normText.match(/(?:identificador)\s*[:=]?\s*([0-9.\-_]{10,40})/i);
  if (identMatch) identificador = identMatch[1].trim();

  const ctrlMatch = normText.match(/(?:n[uú]mero\s*de\s*controle|controle(?:\s*sicredi)?)\s*[:=]?\s*([A-Za-z0-9.\-_]{8,})/i);
  if (ctrlMatch) controlNumber = ctrlMatch[1].trim();

  const authPatterns = [
    /(?:autentica[cç][aã]o\s*eletr[oô]nica)\s*[:=]?\s*([A-Za-z0-9.\-_]{12,})/i,
    /(?:autentica[cç][aã]o(?:\s*mec[aâ]nica)?)\s*[:=]?\s*([A-Za-z0-9.\-_]{12,})/i,
    /(?:c[oó]digo\s*(?:de\s*)?autentica[cç][aã]o)\s*[:=]?\s*([A-Za-z0-9.\-_]{12,})/i,
    /(?:protocolo(?:\s*de\s*autoriza[cç][aã]o)?)\s*[:=]?\s*([A-Za-z0-9.\-_]{12,})/i
  ];
  for (const regex of authPatterns) {
    const match = normText.match(regex);
    if (match?.[1]) {
      authCode = match[1].trim();
      break;
    }
  }

  // Se não tem authCode, usa txId ou controlNumber
  if (!authCode) {
    authCode = txId || controlNumber;
  }

  // 7. Favorecido / Beneficiário / Destinatário
  let beneficiaryName: string | undefined;
  const beneficiaryPatterns = [
    /(?:nome\s*(?:do\s*)?destinat[aá]rio)\s*[:=]?\s*([^\n\r]+)/i,
    /(?:benefici[aá]rio|favorecido|cedente|nome\s*fantasia)\s*[:=]?\s*([^\n\r]+)/i,
    /(?:para\s*:)\s*([^\n\r]+)/i
  ];
  for (const regex of beneficiaryPatterns) {
    const match = normText.match(regex);
    if (match?.[1]) {
      const clean = match[1].trim().replace(/\s{2,}/g, ' ');
      if (clean.length > 2 && !clean.toUpperCase().includes('TRANSCUNHA')) {
        beneficiaryName = clean;
        break;
      }
    }
  }

  // 8. Linha Digitável
  let barCode: string | undefined;
  const barCodeMatch = normText.match(/(\d{5}\.\d{5}\s+\d{5}\.\d{6}\s+\d{5}\.\d{6}\s+\d\s+\d{14})/) ||
                        normText.match(/(\d{11,12}[-\s]?\d\s+\d{11,12}[-\s]?\d\s+\d{11,12}[-\s]?\d\s+\d{11,12}[-\s]?\d)/);
  if (barCodeMatch?.[1]) {
    barCode = barCodeMatch[1].replace(/\s+/g, ' ').trim();
  }

  return {
    isSicredi,
    bankName,
    paymentDate,
    dueDate,
    originalAmount,
    interestAmount,
    discountAmount,
    paidAmount,
    authCode,
    txId,
    identificador,
    controlNumber,
    beneficiaryName,
    barCode,
    operationType,
    rawText: text
  };
}

/**
 * Lê um arquivo File (PDF ou Texto) e devolve a extração estruturada do comprovante
 */
export async function parseReceiptFile(file: File): Promise<SicrediReceiptParsedData> {
  let text = '';

  if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
    try {
      const buffer = await file.arrayBuffer();
      text = await extractTextFromPdfBuffer(buffer);
    } catch (err) {
      console.warn('[sicrediReceiptParser] Falha na extração PDF:', err);
    }
  } else {
    // Tenta ler como texto caso seja TXT, CSV ou HTML
    try {
      text = await file.text();
    } catch {
      text = '';
    }
  }

  return parseSicrediReceipt(text);
}

