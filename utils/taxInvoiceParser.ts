import * as pdfjsLib from 'pdfjs-dist';
import { GoogleGenAI } from '@google/genai';
import { extractTextFromPdfBuffer, parseCurrencyPtBr } from './fiscalDocParser';
import { convertBrDateToIso } from './invoiceExtractionService';
import type { TaxType } from '../types';

export interface ExtractedTaxData {
  taxType: TaxType;
  taxTypeName: string;
  taxCode?: string;
  documentNumber?: string;
  period?: string;
  dueDate?: string; // YYYY-MM-DD
  principalAmount?: number;
  fineAmount?: number;
  interestAmount?: number;
  totalAmount: number;
  barcode?: string;
  beneficiary?: string;
  contributorName?: string;
  contributorCnpj?: string;
  description?: string;
  notes?: string;
  rawText?: string;
}

/**
 * Converte valor em formato brasileiro para number
 */
function cleanAndParseAmount(str?: string): number | undefined {
  if (!str) return undefined;
  return parseCurrencyPtBr(str);
}

/**
 * Limpa e formata a linha digitável ou código de barras de arrecadação
 */
function cleanBarcode(raw?: string): string | undefined {
  if (!raw) return undefined;
  const cleaned = raw.replace(/\r?\n/g, ' ').replace(/\s{2,}/g, ' ').trim();
  return cleaned.length >= 20 ? cleaned : undefined;
}

/**
 * Motor local: extrai dados fiscais e tributários do texto do documento
 */
export function parseTaxDocumentText(text: string): ExtractedTaxData | null {
  if (!text || text.trim().length === 0) return null;

  const upper = text.toUpperCase();
  const normalized = text.replace(/\r\n/g, '\n');

  // Variáveis comuns
  let taxType: TaxType = 'OUTROS';
  let taxTypeName = 'Guia Tributária';
  let taxCode: string | undefined;
  let documentNumber: string | undefined;
  let period: string | undefined;
  let dueDate: string | undefined;
  let principalAmount: number | undefined;
  let fineAmount: number | undefined;
  let interestAmount: number | undefined;
  let totalAmount: number | undefined;
  let barcode: string | undefined;
  let beneficiary: string | undefined;
  let contributorName: string | undefined = 'Transcunha Transportes e Logistica Ltda';
  let contributorCnpj: string | undefined = '36.203.306/0001-92';
  let description: string | undefined;
  let notes: string | undefined;

  // 1. Extração de CNPJ do Contribuinte se presente
  const cnpjMatch = text.match(/\b(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})\b/);
  if (cnpjMatch) {
    contributorCnpj = cnpjMatch[1];
  }

  // 2. Extração de Linha Digitável / Código de Arrecadação (inicia com 8)
  const arrecadacaoBarcodeMatch = text.match(/\b(8\d{10}[-\s]?\d\s+\d{11}[-\s]?\d\s+\d{11}[-\s]?\d\s+\d{11}[-\s]?\d)\b/) ||
    text.match(/\b(8\d{47})\b/) ||
    text.match(/\b(8\d{11}\s+\d{11}\s+\d{11}\s+\d{11})\b/);
  if (arrecadacaoBarcodeMatch) {
    barcode = cleanBarcode(arrecadacaoBarcodeMatch[0]);
  }

  // ==========================================
  // CASO A: DARE-SP / GNRE (ICMS)
  // ==========================================
  if (
    upper.includes('DARE-SP') ||
    upper.includes('GNRE') ||
    upper.includes('DOCUMENTO DE ARRECADAÇÃO DE RECEITAS ESTADUAIS') ||
    upper.includes('GUIA NACIONAL DE RECOLHIMENTO DE TRIBUTOS ESTADUAIS') ||
    upper.includes('SECRETARIA DA FAZENDA E PLANEJAMENTO') ||
    upper.includes('ICMS – TRANSPORTE') ||
    upper.includes('ICMS - TRANSPORTE')
  ) {
    taxType = 'ICMS';
    taxTypeName = 'ICMS Transporte (DARE/GNRE)';
    beneficiary = 'Secretaria da Fazenda e Planejamento - SP';

    // Código de Receita (ex: 111-9 ou 10003-0)
    const codMatch = text.match(/(?:Código\s+de\s+Receita[^\d]*|Receita\s*[:.\s]*)(\d{3}-\d|\d{5}-\d)/i) ||
                     text.match(/\b(111-9)\b/) ||
                     text.match(/\b(10003-0)\b/);
    if (codMatch) taxCode = codMatch[1];

    // Número do DARE (ex: 260590051707152)
    const dareNumMatch = text.match(/(?:Número\s+do\s+DARE|Nº\s+do\s+Documento|Nº\s+do\s+DARE)\s*[:.\s\n]*(\d{10,25})/i) ||
                         text.match(/\b(\d{15})\b/);
    if (dareNumMatch) documentNumber = dareNumMatch[1];

    // Data de Vencimento (ex: 30/03/2026)
    const dueMatch = text.match(/(?:Data\s+de\s+Vencimento|Vencimento)\s*[:.\s\n]*(\d{2}\/\d{2}\/\d{4})/i);
    if (dueMatch) dueDate = convertBrDateToIso(dueMatch[1]);

    // Referência (ex: 02/2026)
    const refMatch = text.match(/(?:Referência|Período\s+de\s+Referência)\s*[:.\s\n]*(\d{2}\/\d{4})/i) ||
                     text.match(/\b(0[1-9]|1[0-2])\/(20\d{2})\b/);
    if (refMatch) period = refMatch[0];

    // Valores
    const recMatch = text.match(/(?:Valor\s+da\s+Receita|Principal)\s*[:.\s\n]*(?:R\$\s*)?([\d.,]+)/i);
    if (recMatch) principalAmount = cleanAndParseAmount(recMatch[1]);

    const jurMatch = text.match(/(?:Juros\s+de\s+Mora|Juros)\s*[:.\s\n]*(?:R\$\s*)?([\d.,]+)/i);
    if (jurMatch) interestAmount = cleanAndParseAmount(jurMatch[1]);

    const mulMatch = text.match(/(?:Multa\s+de\s+Mora|Multa\s+Por\s+Infração|Multa)\s*[:.\s\n]*(?:R\$\s*)?([\d.,]+)/i);
    if (mulMatch) fineAmount = cleanAndParseAmount(mulMatch[1]);

    const totMatch = text.match(/(?:Valor\s+Total|Total)\s*[:.\s\n]*(?:R\$\s*)?([\d.,]+)/i);
    if (totMatch) totalAmount = cleanAndParseAmount(totMatch[1]);

    // Observações
    const obsMatch = text.match(/Observações\s*[:.\s\n]*([\s\S]{5,300}?)(?=(?:Autenticação|Via\s+do|Código|$))/i);
    if (obsMatch) {
      notes = obsMatch[1].replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
    }

    description = `ICMS Transporte${period ? ` (Ref: ${period})` : ''}${documentNumber ? ` • DARE ${documentNumber}` : ''}`;
  }

  // ==========================================
  // CASO B: DARF DCTFWeb / INSS & Previdenciário
  // ==========================================
  else if (
    (upper.includes('DOCUMENTO DE ARRECADAÇÃO DE RECEITAS FEDERAIS') || upper.includes('RECEITA FEDERAL')) &&
    (
      upper.includes('CONTR PREVIDENCIÁRIA') ||
      upper.includes('CONTR PREV') ||
      upper.includes('GILRAT') ||
      upper.includes('SALÁRIO EDUCAÇÃO') ||
      upper.includes('SEST') ||
      upper.includes('SENAT') ||
      upper.includes('INCRA') ||
      upper.includes('COMPOSIÇÃO DO DOCUMENTO DE ARRECADAÇÃO') && upper.includes('PREV') ||
      upper.includes('1138') && upper.includes('1082')
    )
  ) {
    taxType = 'INSS';
    taxTypeName = 'Guia INSS / DCTFWeb';
    beneficiary = 'Receita Federal do Brasil (Previdenciário)';
    taxCode = 'DCTFWeb / Previdenciário';

    // Número do Documento DARF (ex: 07.16.26141.6627546-7)
    const docNumMatch = text.match(/(?:Número\s+do\s+Documento|Número)\s*[:.\s\n]*([0-9.\-]{15,25})/i);
    if (docNumMatch) documentNumber = docNumMatch[1].trim();

    // Data de Vencimento / Pagar até (ex: 21/05/2026)
    const payUntilMatch = text.match(/(?:Pagar\s+este\s+documento\s+at[ée]|Data\s+de\s+Vencimento|Vencimento)\s*[:.\s\n]*(\d{2}\/\d{2}\/\d{4})/i);
    if (payUntilMatch) dueDate = convertBrDateToIso(payUntilMatch[1]);

    // Período de Apuração (ex: Diversos ou MM/AAAA)
    const paMatch = text.match(/(?:Período\s+de\s+Apuração|PA)\s*[:.\s\n]*([A-Za-z0-9\/]+)/i);
    if (paMatch) period = paMatch[1].trim();

    // Valor Total do Documento (ex: 13.049,21)
    const totMatch = text.match(/(?:Valor\s+Total\s+do\s+Documento|Totais|Valor\s+Total)\s*[:.\s\n]*(?:R\$\s*)?([\d.,]+)/i);
    if (totMatch) totalAmount = cleanAndParseAmount(totMatch[1]);

    // Totais discriminados se houver linha "Totais 11.104,43 1.732,33 212,45 13.049,21"
    const totalsLineMatch = text.match(/Totais\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)/i);
    if (totalsLineMatch) {
      principalAmount = cleanAndParseAmount(totalsLineMatch[1]);
      fineAmount = cleanAndParseAmount(totalsLineMatch[2]);
      interestAmount = cleanAndParseAmount(totalsLineMatch[3]);
      totalAmount = cleanAndParseAmount(totalsLineMatch[4]) || totalAmount;
    }

    description = `INSS / DCTFWeb Encargos e Previdenciário${period ? ` (PA: ${period})` : ''}${documentNumber ? ` • DARF ${documentNumber}` : ''}`;
  }

  // ==========================================
  // CASO C: DARF PIS / COFINS (Sicalc Web)
  // ==========================================
  else if (
    (upper.includes('SICALC') || upper.includes('DOCUMENTO DE ARRECADAÇÃO DE RECEITAS FEDERAIS')) &&
    (
      upper.includes('COFINS') ||
      upper.includes('5856') ||
      upper.includes('6912') ||
      upper.includes('PIS - NAO CUMULATIVO') ||
      upper.includes('PIS/PASEP')
    )
  ) {
    taxType = 'PIS_COFINS';
    beneficiary = 'Receita Federal do Brasil';

    const isCofins = upper.includes('COFINS') || upper.includes('5856');
    const isPis = upper.includes('PIS') || upper.includes('6912');

    if (isCofins && !isPis) {
      taxTypeName = 'COFINS Não Cumulativa (DARF 5856)';
      taxCode = '5856';
    } else if (isPis && !isCofins) {
      taxTypeName = 'PIS/PASEP Não Cumulativo (DARF 6912)';
      taxCode = '6912';
    } else {
      taxTypeName = 'PIS / COFINS (DARF Federal)';
      taxCode = '5856 / 6912';
    }

    // Número do Documento (ex: 07.01.26232.2637915-0)
    const docNumMatch = text.match(/(?:Número\s+do\s+Documento|Número)\s*[:.\s\n]*([0-9.\-]{15,25})/i);
    if (docNumMatch) documentNumber = docNumMatch[1].trim();

    // Vencimento / Pagar até
    const payUntilMatch = text.match(/(?:Pagar\s+este\s+documento\s+at[ée]|Data\s+de\s+Vencimento|Vencimento)\s*[:.\s\n]*(\d{2}\/\d{2}\/\d{4})/i);
    if (payUntilMatch) dueDate = convertBrDateToIso(payUntilMatch[1]);

    // Período de Apuração
    const paMatch = text.match(/(?:Período\s+de\s+Apuração|PA)\s*[:.\s\n]*(\d{2}\/\d{2}\/\d{4}|\d{2}\/\d{4})/i);
    if (paMatch) period = paMatch[1].trim();

    // Valores (Principal, Multa, Juros, Total)
    const totMatch = text.match(/(?:Valor\s+Total\s+do\s+Documento|Totais|Valor\s+Total|Valor)\s*[:.\s\n]*(?:R\$\s*)?([\d.,]+)/i);
    if (totMatch) totalAmount = cleanAndParseAmount(totMatch[1]);

    const lineValMatch = text.match(/(?:5856|6912)[^\n\r]*\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)/);
    if (lineValMatch) {
      principalAmount = cleanAndParseAmount(lineValMatch[1]);
      fineAmount = cleanAndParseAmount(lineValMatch[2]);
      interestAmount = cleanAndParseAmount(lineValMatch[3]);
      totalAmount = cleanAndParseAmount(lineValMatch[4]) || totalAmount;
    }

    description = `${taxTypeName}${period ? ` (PA: ${period})` : ''}${documentNumber ? ` • ${documentNumber}` : ''}`;
  }

  // ==========================================
  // CASO D: DARF IRPJ (Lucro Real Estimativa)
  // ==========================================
  else if (
    (upper.includes('IRPJ') || upper.includes('5993')) &&
    (upper.includes('RECEITA FEDERAL') || upper.includes('DOCUMENTO DE ARRECADAÇÃO'))
  ) {
    taxType = 'IRPJ';
    taxTypeName = 'IRPJ - Lucro Real Estimativa Mensal';
    taxCode = '5993';
    beneficiary = 'Receita Federal do Brasil';

    // Número do Documento
    const docNumMatch = text.match(/(?:Número\s+do\s+Documento|Número)\s*[:.\s\n]*([0-9.\-]{15,25})/i);
    if (docNumMatch) documentNumber = docNumMatch[1].trim();

    // Vencimento
    const dueMatch = text.match(/(?:Pagar\s+este\s+documento\s+at[ée]|Data\s+de\s+Vencimento|Vencimento)\s*[:.\s\n]*(\d{2}\/\d{2}\/\d{4})/i);
    if (dueMatch) dueDate = convertBrDateToIso(dueMatch[1]);

    // Período de Apuração (ex: setembro/2026 ou 09/2026)
    const paMatch = text.match(/(?:Período\s+de\s+Apuração|PA)\s*[:.\s\n]*([A-Za-zç0-9\/]+)/i);
    if (paMatch) period = paMatch[1].trim();

    // Valor Total
    const totMatch = text.match(/(?:Valor\s+Total\s+do\s+Documento|Totais|Valor\s+Total|Valor)\s*[:.\s\n]*(?:R\$\s*)?([\d.,]+)/i);
    if (totMatch) totalAmount = cleanAndParseAmount(totMatch[1]);

    const princMatch = text.match(/5993[^\n\r]*\s+([\d.,]+)/);
    if (princMatch) principalAmount = cleanAndParseAmount(princMatch[1]);

    description = `IRPJ Estimativa Mensal${period ? ` (PA: ${period})` : ''}${documentNumber ? ` • ${documentNumber}` : ''}`;
  }

  // ==========================================
  // CASO E: DARF CSLL (Lucro Real Estimativa)
  // ==========================================
  else if (
    (upper.includes('CSLL') || upper.includes('2484')) &&
    (upper.includes('RECEITA FEDERAL') || upper.includes('DOCUMENTO DE ARRECADAÇÃO'))
  ) {
    taxType = 'CSLL';
    taxTypeName = 'CSLL - Lucro Real Estimativa Mensal';
    taxCode = '2484';
    beneficiary = 'Receita Federal do Brasil';

    // Número do Documento
    const docNumMatch = text.match(/(?:Número\s+do\s+Documento|Número)\s*[:.\s\n]*([0-9.\-]{15,25})/i);
    if (docNumMatch) documentNumber = docNumMatch[1].trim();

    // Vencimento
    const dueMatch = text.match(/(?:Pagar\s+este\s+documento\s+at[ée]|Data\s+de\s+Vencimento|Vencimento)\s*[:.\s\n]*(\d{2}\/\d{2}\/\d{4})/i);
    if (dueMatch) dueDate = convertBrDateToIso(dueMatch[1]);

    // Período de Apuração
    const paMatch = text.match(/(?:Período\s+de\s+Apuração|PA)\s*[:.\s\n]*([A-Za-zç0-9\/]+)/i);
    if (paMatch) period = paMatch[1].trim();

    // Valor Total
    const totMatch = text.match(/(?:Valor\s+Total\s+do\s+Documento|Totais|Valor\s+Total|Valor)\s*[:.\s\n]*(?:R\$\s*)?([\d.,]+)/i);
    if (totMatch) totalAmount = cleanAndParseAmount(totMatch[1]);

    const princMatch = text.match(/2484[^\n\r]*\s+([\d.,]+)/);
    if (princMatch) principalAmount = cleanAndParseAmount(princMatch[1]);

    description = `CSLL Estimativa Mensal${period ? ` (PA: ${period})` : ''}${documentNumber ? ` • ${documentNumber}` : ''}`;
  }

  // ==========================================
  // CASO F: FGTS (FGTS Digital / GRF / GFD)
  // ==========================================
  else if (
    upper.includes('FGTS') ||
    upper.includes('FGTS DIGITAL') ||
    upper.includes('GUIA DO FGTS') ||
    upper.includes('FUNDO DE GARANTIA')
  ) {
    taxType = 'FGTS';
    taxTypeName = 'Guia de FGTS (FGTS Digital / GFD)';
    beneficiary = 'Caixa Econômica Federal / FGTS Digital';

    // Competência (ex: 09/2026)
    const compMatch = text.match(/(?:Competência|Mês\/Ano)\s*[:.\s\n]*(\d{2}\/\d{4})/i) ||
                      text.match(/\b(0[1-9]|1[0-2])\/(20\d{2})\b/);
    if (compMatch) period = compMatch[0];

    // Vencimento
    const dueMatch = text.match(/(?:Vencimento|Data\s+de\s+Vencimento|Pagar\s+at[ée])\s*[:.\s\n]*(\d{2}\/\d{2}\/\d{4})/i);
    if (dueMatch) dueDate = convertBrDateToIso(dueMatch[1]);

    // Valor
    const valMatch = text.match(/(?:Valor\s+Total|Total\s+a\s+Recolher|Valor\s+a\s+Pagar|Valor)\s*[:.\s\n]*(?:R\$\s*)?([\d.,]+)/i);
    if (valMatch) totalAmount = cleanAndParseAmount(valMatch[1]);

    description = `Guia de FGTS${period ? ` (Competência: ${period})` : ''}`;
  }

  // Fallback se não foi detectado tipo específico, mas tem indicativos fiscais
  if (taxType === 'OUTROS' && (upper.includes('DARF') || upper.includes('TRIBUTO') || upper.includes('RECEITA'))) {
    const totMatch = text.match(/(?:Valor\s+Total|Total|Valor)\s*[:.\s\n]*(?:R\$\s*)?([\d.,]+)/i);
    if (totMatch) totalAmount = cleanAndParseAmount(totMatch[1]);
    const dueMatch = text.match(/(?:Vencimento|Data\s+de\s+Vencimento|Pagar\s+at[ée])\s*[:.\s\n]*(\d{2}\/\d{2}\/\d{4})/i);
    if (dueMatch) dueDate = convertBrDateToIso(dueMatch[1]);
    description = 'Guia de Recolhimento Tributário';
  }

  // Se não foi possível encontrar o total
  if (!totalAmount || totalAmount <= 0) {
    if (principalAmount && principalAmount > 0) {
      totalAmount = Number((principalAmount + (fineAmount || 0) + (interestAmount || 0)).toFixed(2));
    }
  }

  // Validação mínima: é uma guia válida se temos pelo menos taxType e algum valor ou vencimento
  if (taxType !== 'OUTROS' || (totalAmount && totalAmount > 0) || barcode) {
    return {
      taxType,
      taxTypeName,
      taxCode,
      documentNumber,
      period,
      dueDate,
      principalAmount,
      fineAmount,
      interestAmount,
      totalAmount: totalAmount || 0,
      barcode,
      beneficiary,
      contributorName,
      contributorCnpj,
      description: description || taxTypeName,
      notes,
      rawText: text
    };
  }

  return null;
}

/**
 * Fallback com Gemini AI Multimodal para leitura de imagens ou PDFs escaneados de guias de impostos
 */
async function parseTaxWithGemini(
  base64Data: string,
  mimeType: string,
  extractedText?: string
): Promise<ExtractedTaxData | null> {
  const apiKey =
    (import.meta as any).env?.VITE_GEMINI_API_KEY ||
    localStorage.getItem('gemini_api_key') ||
    '';

  if (!apiKey) {
    return null;
  }

  try {
    const ai = new GoogleGenAI({ apiKey });

    const prompt = `Você é um auditor fiscal especialista em guias de recolhimento tributárias do Brasil (DARE-SP, DARF Sicalc Web, DARF DCTFWeb, Guias de FGTS Digital, ICMS GNRE, CSLL, IRPJ, PIS e COFINS).
Analise o documento tributário anexado e extraia os dados fiscais rigorosamente.

TIPOS PERMITIDOS DE IMPOSTO:
- "PIS_COFINS": PIS (código 6912) ou COFINS (código 5856) emitida no Sicalc Web.
- "ICMS": DARE-SP ou GNRE para ICMS Transporte (código 111-9 / 10003-0).
- "CSLL": Contribuição Social Sobre o Lucro Líquido (código 2484).
- "IRPJ": Imposto de Renda Pessoa Jurídica Lucro Real (código 5993).
- "FGTS": Guia FGTS Digital ou GFD.
- "INSS": DARF Numerado DCTFWeb contendo Contribuição Previdenciária patronal, segurados, GILRAT, terceiros (1138, 1082, 1646, etc.).
- "OUTROS": Outras guias de tributos.

CAMPOS A RETORNAR:
1. "taxType": Um dos tipos acima exatamente.
2. "taxTypeName": Nome legível (ex: "COFINS Não Cumulativa", "ICMS Transporte - DARE-SP", "DARF INSS / DCTFWeb").
3. "taxCode": Código da receita oficial (ex: "5856", "6912", "111-9", "2484", "5993", "1138").
4. "documentNumber": Número do documento DARF ou DARE (ex: "07.01.26232.2637915-0", "260590051707152").
5. "period": Período de apuração / referência (ex: "02/2026", "30/06/2026", "setembro/2026").
6. "dueDate": Data limite de pagamento / vencimento no formato AAAA-MM-DD.
7. "principalAmount": Valor principal em decimal (ex: 9447.14).
8. "fineAmount": Valor de multa se houver (ex: 810.56).
9. "interestAmount": Valor de juros se houver (ex: 94.47).
10. "totalAmount": Valor total do documento em decimal (ex: 10352.17).
11. "barcode": Linha digitável ou código de barras completo de 48 dígitos (iniciando em 8...).
12. "beneficiary": Órgão arrecadador (ex: "Receita Federal do Brasil" ou "Secretaria da Fazenda de São Paulo").
13. "description": Descrição resumida da guia.

${extractedText ? `Texto extraído da camada digital para validação:\n${extractedText.slice(0, 10000)}\n` : ''}

Retorne ESTRITAMENTE um JSON válido no formato abaixo, sem tags markdown:
{
  "taxType": "PIS_COFINS",
  "taxTypeName": "COFINS Não Cumulativa (DARF 5856)",
  "taxCode": "5856",
  "documentNumber": "07.01.26232.2637915-0",
  "period": "30/06/2026",
  "dueDate": "2026-08-21",
  "principalAmount": 9447.14,
  "fineAmount": 810.56,
  "interestAmount": 94.47,
  "totalAmount": 10352.17,
  "barcode": "858100001036521703852625330701262320263791504353",
  "beneficiary": "Receita Federal do Brasil",
  "description": "COFINS Não Cumulativa - PA 30/06/2026"
}`;

    const modelsToTry = [
      'gemini-2.5-flash',
      'gemini-2.5-flash-lite',
      'gemini-3.5-flash-lite',
      'gemini-3.5-flash',
      'gemini-flash-latest'
    ];

    let responseText: string | undefined;

    for (const modelName of modelsToTry) {
      try {
        const response = await ai.models.generateContent({
          model: modelName,
          contents: [
            {
              role: 'user',
              parts: [
                {
                  inlineData: {
                    mimeType,
                    data: base64Data
                  }
                },
                { text: prompt }
              ]
            }
          ]
        });

        if (response && response.text) {
          responseText = response.text;
          break;
        }
      } catch (err) {
        console.warn(`[taxInvoiceParser] Falha no modelo ${modelName}:`, err);
      }
    }

    if (!responseText) return null;

    const cleanedJson = responseText
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .trim();

    const parsed = JSON.parse(cleanedJson);
    return {
      taxType: parsed.taxType || 'OUTROS',
      taxTypeName: parsed.taxTypeName || 'Guia de Imposto',
      taxCode: parsed.taxCode,
      documentNumber: parsed.documentNumber,
      period: parsed.period,
      dueDate: parsed.dueDate,
      principalAmount: parsed.principalAmount ? Number(parsed.principalAmount) : undefined,
      fineAmount: parsed.fineAmount ? Number(parsed.fineAmount) : undefined,
      interestAmount: parsed.interestAmount ? Number(parsed.interestAmount) : undefined,
      totalAmount: Number(parsed.totalAmount || 0),
      barcode: parsed.barcode,
      beneficiary: parsed.beneficiary,
      description: parsed.description || parsed.taxTypeName,
      notes: parsed.notes
    };
  } catch (err) {
    console.warn('[taxInvoiceParser] Erro no Gemini:', err);
    return null;
  }
}

/**
 * Função principal para ler e processar arquivo de guia de imposto (PDF ou Imagem)
 */
export async function extractDataFromTaxInvoiceFile(file: File): Promise<ExtractedTaxData> {
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  let extractedText = '';
  let localResult: ExtractedTaxData | null = null;

  if (isPdf) {
    try {
      const buffer = await file.arrayBuffer();
      extractedText = await extractTextFromPdfBuffer(buffer);
      localResult = parseTaxDocumentText(extractedText);
    } catch (e) {
      console.warn('[taxInvoiceParser] Falha na extração local de texto do PDF:', e);
    }
  }

  // Se o leitor local conseguiu extrair com alta confiança (tem tipo definido e valor total), retorna direto
  if (localResult && localResult.taxType !== 'OUTROS' && localResult.totalAmount > 0) {
    return localResult;
  }

  // Fallback para IA Gemini Multimodal (para scans, imagens ou PDFs rasterizados)
  try {
    const base64Data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const res = reader.result as string;
        const base64 = res.split(',')[1] || res;
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    const geminiResult = await parseTaxWithGemini(
      base64Data,
      file.type || (isPdf ? 'application/pdf' : 'image/jpeg'),
      extractedText
    );

    if (geminiResult && geminiResult.totalAmount > 0) {
      return {
        ...geminiResult,
        barcode: geminiResult.barcode || localResult?.barcode,
        documentNumber: geminiResult.documentNumber || localResult?.documentNumber,
        period: geminiResult.period || localResult?.period,
        dueDate: geminiResult.dueDate || localResult?.dueDate
      };
    }
  } catch (err) {
    console.warn('[taxInvoiceParser] Erro na chamada do Gemini:', err);
  }

  // Retorno final com o melhor dado possível
  if (localResult) return localResult;

  return {
    taxType: 'OUTROS',
    taxTypeName: 'Guia Tributária Não Identificada',
    totalAmount: 0,
    description: file.name.replace(/\.[^/.]+$/, '')
  };
}
