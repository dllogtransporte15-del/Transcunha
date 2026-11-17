import * as pdfjsLib from 'pdfjs-dist';
import type { SubCteRecord } from '../types';
import { FreightBalanceCalculation, calculateFreightBalance } from './freightBalanceCalculator';
import { extractOcNumberFromText } from './ocParser';

export type { FreightBalanceCalculation, SubCteRecord };
export { calculateFreightBalance };

// Configuração do Worker do PDF.js para ambiente de navegador/Vite
if (typeof window !== 'undefined' && pdfjsLib.GlobalWorkerOptions && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
}

export interface DetailedDocumentData {
  documentType: 'CT-e' | 'MDF-e' | 'Carta Frete' | 'Nota Fiscal' | 'CIOT' | 'Outro';
  rawText?: string;
  sourceType: 'xml' | 'pdf' | 'text';
  
  // Identificação
  docNumber?: string;
  series?: string;
  accessKey?: string;
  emissionDate?: string;
  cfop?: string;
  naturezaOperacao?: string;
  ciot?: string;
  protocoloAutorizacao?: string;

  // Cláusula 3.5: Base de Cálculo do Saldo de Frete (PF / PJ)
  calculoSaldoFrete?: FreightBalanceCalculation;

  // Envolvidos
  emitente?: {
    razaoSocial?: string;
    nomeFantasia?: string;
    cnpjCpf?: string;
    inscricaoEstadual?: string;
    municipio?: string;
    uf?: string;
  };
  remetente?: {
    razaoSocial?: string;
    cnpjCpf?: string;
    inscricaoEstadual?: string;
    municipio?: string;
    uf?: string;
  };
  destinatario?: {
    razaoSocial?: string;
    cnpjCpf?: string;
    inscricaoEstadual?: string;
    municipio?: string;
    uf?: string;
  };
  tomador?: {
    razaoSocial?: string;
    cnpjCpf?: string;
    papel?: string; // Remetente, Destinatário, Expedidor, etc.
  };
  motorista?: {
    nome?: string;
    cpf?: string;
    cnh?: string;
    rg?: string;
  };

  // Trajeto e Transporte
  origem?: {
    municipio?: string;
    uf?: string;
    local?: string;
  };
  destino?: {
    municipio?: string;
    uf?: string;
    local?: string;
  };
  veiculo?: {
    placaTrator?: string;
    placasReboque?: string[];
    rntrc?: string;
    tipo?: string;
    ufPlaca?: string;
    totalEixos?: number;
  };

  // Carga e Pesos
  carga?: {
    produtoPredominante?: string;
    valorMercadoria?: number;
    pesoBrutoKg?: number;
    pesoLiquidoKg?: number;
    pesoAferidoKg?: number;
    quantidadeVolumes?: number;
    especie?: string;
    cubagem?: number;
    notasFiscaisVinculadas?: string[];
    previsaoDescarga?: string;
  };

  // Valores Financeiros do Frete / Contrato
  financeiro?: {
    valorTotalFrete?: number;
    valorFretePorTonelada?: number;
    valorTotalServico?: number;
    valorLiquido?: number;
    valorReceber?: number;
    valorAdiantamento?: number;
    porcentagemAdiantamento?: number;
    valorSaldo?: number;
    valorPedagio?: number;
    provedorPedagio?: string;
    numeroPedidoPedagio?: string;
    valorCombustivel?: number;
    descontos?: number;
    baseCalculoIcms?: number;
    valorIcms?: number;
    aliquotaIcms?: number;
    valorPis?: number;
    aliquotaPis?: number;
    valorCofins?: number;
    aliquotaCofins?: number;
    valorPisCofinsFederal?: number;
    valorTributosFederais?: number;
    valorTotalNfe?: number;
    formaPagamento?: string;
    dadosBancarios?: string;
    chavePix?: string;
    valorKgQuebra?: number;
    valorKgFreteFaltante?: number;
  };

  // Seguro
  seguro?: {
    nomeSeguradora?: string;
    numeroApolice?: string;
    numeroAverbacao?: string;
    responsavelSeguro?: string;
  };

  // Observações e Informações Fiscais Adicionais (ex: infAdFisco, infCpl)
  observacoesFiscais?: string;
  suspensaoPercentual?: number;

  // Documentos vinculados
  documentosVinculados?: Array<{
    tipo: string;
    chaveAcesso?: string;
    numero?: string;
    serie?: string;
  }>;
  notasFiscais?: Array<{
    numero?: string;
    chaveAcesso?: string;
    valor?: number;
    serie?: string;
  }>;
}

export function parseAccessKey44(accessKey: string | undefined | null) {
  if (!accessKey) return null;
  const clean = accessKey.replace(/[\s.-]/g, '');
  if (clean.length !== 44) return null;

  const cUF = clean.substring(0, 2);
  const aamm = clean.substring(2, 6);
  const cnpj = clean.substring(6, 20);
  const modelo = clean.substring(20, 22);
  const serieRaw = clean.substring(22, 25);
  const serie = String(parseInt(serieRaw, 10) || serieRaw);
  const docNumberRaw = clean.substring(25, 34);
  const docNumber = String(parseInt(docNumberRaw, 10) || docNumberRaw);

  let docType: 'CT-e' | 'MDF-e' | 'Nota Fiscal' = 'CT-e';
  if (modelo === '58') docType = 'MDF-e';
  else if (modelo === '55' || modelo === '65') docType = 'Nota Fiscal';
  else if (modelo === '57' || modelo === '67') docType = 'CT-e';

  return { cUF, aamm, cnpj, modelo, serie, docNumber, docType };
}

export function isCartaFreteDocType(docType: string): boolean {
  if (!docType) return false;
  const lower = docType.toLowerCase().trim();
  return lower.includes('carta') || lower.includes('frete') || lower.includes('contrato') || lower.includes('efrete') || lower.includes('e-frete') || lower.includes('pamcard') || lower.includes('repom');
}

export function isMdfeDocType(docType: string): boolean {
  if (!docType) return false;
  const lower = docType.toLowerCase().trim();
  return lower.includes('mdfe') || lower.includes('mdf-e') || lower.includes('damdfe') || lower.includes('damfe') || lower.includes('manifesto');
}

export function isStrictNotaFiscalCategory(docType?: string | null): boolean {
  if (!docType) return false;
  const lower = docType.toLowerCase().trim();
  if (
    lower.includes('ticket') ||
    lower.includes('carregamento') ||
    lower.includes('pesagem') ||
    lower.includes('balan') ||
    isCartaFreteDocType(lower) ||
    isMdfeDocType(lower) ||
    isCteDocType(lower) ||
    lower.includes('comprovante') ||
    lower.includes('ordem') ||
    lower.includes('contrato')
  ) {
    return false;
  }
  return lower === 'nfe' || lower === 'nf-e' || lower.includes('danfe') || lower.includes('nota') || lower === 'nf';
}

export function isNfeDocType(docType: string): boolean {
  return isStrictNotaFiscalCategory(docType);
}

export function isCteDocType(docType: string): boolean {
  if (!docType) return false;
  const lower = docType.toLowerCase().trim();
  if (isCartaFreteDocType(lower) || isMdfeDocType(lower)) {
    return false;
  }
  return lower === 'cte' || lower === 'ct-e' || lower.includes('dacte') || lower.includes('conhecimento');
}

export function detectDocumentTypeFromFileName(fileName?: string | null): 'MDF-e' | 'CT-e' | 'Carta Frete' | 'Nota Fiscal' | null {
  if (!fileName) return null;
  const lower = fileName.toLowerCase().trim();

  // 1. Termos inequívocos de Nota Fiscal / DANFE (incluindo NF-e de contratos de grãos como "NOTA FISCAL ... CONTRATO ...")
  const hasNotaFiscalIndicator = (
    lower.includes('danfe') ||
    lower.includes('nota fiscal') ||
    lower.includes('nota_fiscal') ||
    lower.includes('notafiscal') ||
    /\bnfe\b/i.test(lower) ||
    /\bnf-e\b/i.test(lower) ||
    /\bnf\s*\d+/i.test(lower) ||
    /\bnota\s*\d+/i.test(lower)
  );

  // 2. Termos de Conhecimento de Transporte (CT-e / DACTE)
  const hasCteIndicator = (
    lower.includes('dacte') ||
    /\bcte\b/i.test(lower) ||
    /\bct-e\b/i.test(lower) ||
    lower.includes('conhecimento')
  );

  // 3. Termos de Manifesto Eletrônico (MDF-e / DAMDFE)
  const hasMdfeIndicator = (
    lower.includes('damdfe') ||
    lower.includes('damfe') ||
    lower.includes('mdfe') ||
    lower.includes('mdf-e') ||
    lower.includes('manifesto')
  );

  // 4. Termos explícitos e específicos de Carta Frete / Contrato de Transporte / e-Frete
  const hasExplicitCartaFrete = (
    lower.includes('carta frete') ||
    lower.includes('carta-frete') ||
    lower.includes('carta_frete') ||
    lower.includes('carta de frete') ||
    lower.includes('contrato de frete') ||
    lower.includes('contrato de transporte') ||
    lower.includes('contrato de prestação') ||
    lower.includes('contrato de prestacao') ||
    lower.includes('contrato_frete') ||
    lower.includes('contrato_transporte') ||
    lower.includes('contrato frete') ||
    lower.includes('efrete') ||
    lower.includes('e-frete') ||
    lower.includes('pamcard') ||
    lower.includes('repom') ||
    lower.includes('vale pedagio') ||
    lower.includes('vale-pedagio') ||
    lower.includes('vale_pedagio')
  );

  // Se tiver indicação de Nota Fiscal e NÃO for explicitamente um título de Carta Frete/CT-e/MDF-e, é Nota Fiscal
  // (ex: "NOTA FISCAL 11754- BUNGE SANTA LUZIA - CONTRATO 9..." é 100% Nota Fiscal)
  if (hasNotaFiscalIndicator && !hasExplicitCartaFrete && !hasCteIndicator && !hasMdfeIndicator) {
    return 'Nota Fiscal';
  }

  // Carta Frete / e-Frete explícita
  if (hasExplicitCartaFrete && !hasMdfeIndicator && !hasCteIndicator) {
    return 'Carta Frete';
  }

  // MDF-e
  if (hasMdfeIndicator && !hasCteIndicator) {
    return 'MDF-e';
  }

  // CT-e
  if (hasCteIndicator && !hasExplicitCartaFrete) {
    return 'CT-e';
  }

  // Se tiver a palavra "contrato" ou "frete" mas SEM qualquer menção a nota fiscal, nfe, danfe
  if (!hasNotaFiscalIndicator && (
    lower.includes('contrato') ||
    lower.includes('frete') ||
    lower.includes('_cf_') ||
    lower.includes('cf_') ||
    lower.includes('ciot')
  )) {
    return 'Carta Frete';
  }

  // Fallback: se tiver indicador de Nota Fiscal mesmo com outros termos ambíguos
  if (hasNotaFiscalIndicator) {
    return 'Nota Fiscal';
  }

  return null;
}

export interface DocMismatchInfo {
  isMismatch: boolean;
  detectedType: 'MDF-e' | 'CT-e' | 'Carta Frete' | 'Nota Fiscal';
  suggestedCategory: string;
  message: string;
}

export function detectAttachmentMismatch(
  file: { name: string },
  currentCategory: string,
  extractedType?: string
): DocMismatchInfo | null {
  if (!file?.name || !currentCategory) return null;

  const currentCatLower = currentCategory.toLowerCase().trim();
  const fileNameType = detectDocumentTypeFromFileName(file.name);

  // Se o campo atual for Carta Frete:
  // Se o nome do arquivo ou a extração indicar Carta Frete / Contrato, NUNCA considerar mismatch
  if (isCartaFreteDocType(currentCatLower)) {
    if (fileNameType === 'Carta Frete' || extractedType === 'Carta Frete') {
      return null;
    }
  }

  // Se o campo atual for CT-e:
  if (isCteDocType(currentCatLower)) {
    if (fileNameType === 'CT-e' || extractedType === 'CT-e') {
      return null;
    }
  }

  // Se o campo atual for MDF-e:
  if (isMdfeDocType(currentCatLower)) {
    if (fileNameType === 'MDF-e' || extractedType === 'MDF-e') {
      return null;
    }
  }

  // Se o campo atual for Nota Fiscal:
  // Se o arquivo tiver indicação de Nota Fiscal no nome ou conteúdo, NUNCA considerar mismatch
  if (isStrictNotaFiscalCategory(currentCatLower)) {
    if (
      fileNameType === 'Nota Fiscal' || 
      extractedType === 'Nota Fiscal' ||
      /nota|danfe|\bnfe\b|\bnf-e\b/i.test(file.name)
    ) {
      return null;
    }
  }

  // Prioriza o tipo determinado por conteúdo se conhecido e não genérico ('Outro')
  let detected = (extractedType && extractedType !== 'Outro' && extractedType !== 'CIOT')
    ? (extractedType as 'MDF-e' | 'CT-e' | 'Carta Frete' | 'Nota Fiscal')
    : fileNameType;

  if (isCartaFreteDocType(currentCatLower) && fileNameType === 'Carta Frete') {
    detected = 'Carta Frete';
  }

  if (!detected) return null;

  // Campo "Carta Frete"
  if (isCartaFreteDocType(currentCatLower)) {
    // Se for detectado como Carta Frete, tudo certo
    if (detected === 'Carta Frete') {
      return null;
    }
    if (detected === 'MDF-e') {
      return {
        isMismatch: true,
        detectedType: 'MDF-e',
        suggestedCategory: 'MDF-e',
        message: `Arquivo identificado como Manifesto Eletrônico (MDF-e) anexado no campo Carta Frete.`
      };
    }
    if (detected === 'CT-e') {
      return {
        isMismatch: true,
        detectedType: 'CT-e',
        suggestedCategory: 'CT-e',
        message: `Arquivo identificado como Conhecimento de Transporte (CT-e) anexado no campo Carta Frete.`
      };
    }
    if (detected === 'Nota Fiscal') {
      return {
        isMismatch: true,
        detectedType: 'Nota Fiscal',
        suggestedCategory: 'Nota Fiscal',
        message: `Arquivo identificado como Nota Fiscal (NF-e) anexado no campo Carta Frete.`
      };
    }
  }

  // Campo "MDF-e"
  if (isMdfeDocType(currentCatLower)) {
    if (detected === 'MDF-e') {
      return null;
    }
    if (detected === 'Carta Frete') {
      return {
        isMismatch: true,
        detectedType: 'Carta Frete',
        suggestedCategory: 'Carta Frete',
        message: `Arquivo identificado como Carta Frete / Contrato anexado no campo MDF-e.`
      };
    }
    if (detected === 'CT-e') {
      return {
        isMismatch: true,
        detectedType: 'CT-e',
        suggestedCategory: 'CT-e',
        message: `Arquivo identificado como Conhecimento de Transporte (CT-e) anexado no campo MDF-e.`
      };
    }
    if (detected === 'Nota Fiscal') {
      return {
        isMismatch: true,
        detectedType: 'Nota Fiscal',
        suggestedCategory: 'Nota Fiscal',
        message: `Arquivo identificado como Nota Fiscal (NF-e) anexado no campo MDF-e.`
      };
    }
  }

  // Campo "CT-e"
  if (isCteDocType(currentCatLower)) {
    if (detected === 'CT-e') {
      return null;
    }
    if (detected === 'MDF-e') {
      return {
        isMismatch: true,
        detectedType: 'MDF-e',
        suggestedCategory: 'MDF-e',
        message: `Arquivo identificado como Manifesto Eletrônico (MDF-e) anexado no campo CT-e.`
      };
    }
    if (detected === 'Carta Frete') {
      return {
        isMismatch: true,
        detectedType: 'Carta Frete',
        suggestedCategory: 'Carta Frete',
        message: `Arquivo identificado como Carta Frete / Contrato anexado no campo CT-e.`
      };
    }
    if (detected === 'Nota Fiscal') {
      return {
        isMismatch: true,
        detectedType: 'Nota Fiscal',
        suggestedCategory: 'Nota Fiscal',
        message: `Arquivo identificado como Nota Fiscal (NF-e) anexado no campo CT-e.`
      };
    }
  }

  // Campo "Nota Fiscal"
  if (isStrictNotaFiscalCategory(currentCatLower)) {
    if (detected === 'Nota Fiscal') {
      return null;
    }
    if (detected === 'MDF-e') {
      return {
        isMismatch: true,
        detectedType: 'MDF-e',
        suggestedCategory: 'MDF-e',
        message: `Arquivo identificado como Manifesto Eletrônico (MDF-e) anexado no campo Nota Fiscal.`
      };
    }
    if (detected === 'CT-e') {
      return {
        isMismatch: true,
        detectedType: 'CT-e',
        suggestedCategory: 'CT-e',
        message: `Arquivo identificado como Conhecimento de Transporte (CT-e) anexado no campo Nota Fiscal.`
      };
    }
    if (detected === 'Carta Frete') {
      return {
        isMismatch: true,
        detectedType: 'Carta Frete',
        suggestedCategory: 'Carta Frete',
        message: `Arquivo identificado como Carta Frete / Contrato anexado no campo Nota Fiscal.`
      };
    }
  }

  return null;
}



function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve((e.target?.result as string) || '');
    reader.onerror = () => reject(new Error(`Failed to read file: ${file.name}`));
    reader.readAsText(file, 'utf-8');
  });
}

export async function extractTextFromPdfBuffer(arrayBuffer: ArrayBuffer): Promise<string> {
  try {
    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
    const pdf = await loadingTask.promise;
    let fullText = '';

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: any) => item.str || '')
        .join(' ');
      fullText += pageText + '\n';
    }

    return fullText;
  } catch (err) {
    console.warn('[fiscalDocParser] Erro na extração PDF.js:', err);
    try {
      const decoder = new TextDecoder('utf-8');
      return decoder.decode(arrayBuffer);
    } catch {
      return '';
    }
  }
}

function getXmlTagValue(doc: Document | Element, ...tagNames: string[]): string | undefined {
  for (const tag of tagNames) {
    const els = doc.getElementsByTagName(tag);
    if (els.length > 0 && els[0].textContent) {
      return els[0].textContent.trim();
    }
  }
  return undefined;
}

export function formatFiscalDateTime(val: string | undefined): string | undefined {
  if (!val) return undefined;
  const matchIso = val.match(/^(\d{4})-(\d{1,2})-(\d{1,2})[T\s](\d{2}):(\d{2})/);
  if (matchIso) {
    return `${matchIso[3].padStart(2, '0')}/${matchIso[2].padStart(2, '0')}/${matchIso[1]} ${matchIso[4]}:${matchIso[5]}`;
  }
  const matchPt = val.match(/(?:^|\b)(\d{1,2})\/(\d{1,2})\/(\d{4})\s*(\d{2}:\d{2})?/);
  if (matchPt) {
    const d = matchPt[1].padStart(2, '0');
    const m = matchPt[2].padStart(2, '0');
    return matchPt[4] ? `${d}/${m}/${matchPt[3]} ${matchPt[4]}` : `${d}/${m}/${matchPt[3]}`;
  }
  return val;
}

export function parseCurrencyPtBr(str: string | undefined | null): number | undefined {
  if (!str) return undefined;
  const clean = String(str).replace(/[^\d.,]/g, '').trim();
  if (!clean) return undefined;

  if (clean.includes(',') && clean.includes('.')) {
    const normalized = clean.replace(/\./g, '').replace(',', '.');
    const num = parseFloat(normalized);
    return isNaN(num) ? undefined : num;
  } else if (clean.includes(',')) {
    const normalized = clean.replace(',', '.');
    const num = parseFloat(normalized);
    return isNaN(num) ? undefined : num;
  } else if (clean.includes('.')) {
    const parts = clean.split('.');
    if (parts.length === 2 && parts[1].length === 2) {
      const num = parseFloat(clean);
      return isNaN(num) ? undefined : num;
    } else {
      const normalized = clean.replace(/\./g, '');
      const num = parseFloat(normalized);
      return isNaN(num) ? undefined : num;
    }
  } else {
    const num = parseFloat(clean);
    return isNaN(num) ? undefined : num;
  }
}

export function parseWeightKg(str: string | undefined | null): number | undefined {
  if (!str) return undefined;
  const clean = String(str).replace(/[^\d.,]/g, '').trim();
  if (!clean) return undefined;

  let val: number | undefined;
  if (clean.includes(',') && clean.includes('.')) {
    const num = parseFloat(clean.replace(/\./g, '').replace(',', '.'));
    val = isNaN(num) ? undefined : num;
  } else if (clean.includes(',')) {
    const num = parseFloat(clean.replace(',', '.'));
    val = isNaN(num) ? undefined : num;
  } else if (clean.includes('.')) {
    // Se tiver ponto decimal (ex: SEFAZ XML "45.9600" ou "45.960" ou "45.96"):
    const valFloat = parseFloat(clean);
    if (!isNaN(valFloat) && valFloat > 0 && valFloat < 500) {
      val = Math.round(valFloat * 1000);
    } else {
      const numNorm = parseFloat(clean.replace(/\./g, ''));
      val = isNaN(numNorm) ? undefined : numNorm;
    }
  } else {
    const num = parseFloat(clean);
    val = isNaN(num) ? undefined : num;
  }

  if (val !== undefined && val > 0 && val <= 500) {
    return Math.round(val * 1000);
  }
  return val;
}

function cleanLegalEntityName(str: string | undefined | null): string | undefined {
  if (!str) return undefined;
  let clean = str
    .replace(/^(?:NOME\s*\/|RAZ[ÃA]O\s+SOCIAL\s*\/|NOME\s+EMPRESARIAL\s*:?|RAZ[ÃA]O\s+SOCIAL\s*:?|EMITENTE\s*:?|DESTINAT[ÁA]RIO\s*:?|REMETENTE\s*:?|EXPEDIDOR\s*:?|RECEBEDOR\s*:?|TRANSPORTADOR\s*:?)+/i, '')
    .replace(/(?:CNPJ|CPF|INSCRI[ÇC][ÃA]O|IE|FONE|TELEFONE|ENDERE[ÇC]O|LOGRADOURO|BAIRRO|CEP|MUNIC[ÍI]PIO|CIDADE|UF)[\s\S]*/i, '')
    .replace(/[\n\r]+/g, ' ')
    .trim();

  const invalidPrefixes = ['MENCIONADO', 'CONFORME', 'SENDO QUE', 'E AO', 'DE ACORDO', 'ITEM', 'CL[ÁA]USULA', 'OBJETO', 'PRESENTE'];
  const upper = clean.toUpperCase();
  for (const prefix of invalidPrefixes) {
    if (upper.startsWith(prefix)) return undefined;
  }

  return clean.length >= 3 ? clean : undefined;
}

function cleanPersonName(str: string | undefined | null): string | undefined {
  if (!str) return undefined;
  let clean = str
    .replace(/^(?:representado\s+pelo\s+seu\s+motorista\s*:?|NOME\s*\/|NOME\s+DO\s+CONDUTOR\s*:?|CONDUTOR\s*:?|MOTORISTA\s*:?|CONTRATADO\s*:?|PROP\.\s*\/|PROP[.\s]+)+/i, '')
    .replace(/^(?:Sr\.?\s*|Sra\.?\s*)+/i, '')
    .replace(/(?:CPF|CNH|RG|RENAVAM|RNTRC|PLACA|VEICULO|ENDERE[ÇC]O)[\s\S]*/i, '')
    .replace(/[\n\r]+/g, ' ')
    .trim();

  const invalidTokens = ['PLACA', 'RENAVAM', 'RNTRC', 'CONDUTOR', 'MOTORISTA', 'VEICULO', 'TRACAO', 'CARRETA', 'MDF-E', 'DAMDFE', 'DOCUMENTO'];
  const upper = clean.toUpperCase();
  for (const token of invalidTokens) {
    if (upper.includes(token)) return undefined;
  }

  return clean.length >= 3 ? clean : undefined;
}

export function extractAllChavesAcesso(text: string): string[] {
  if (!text) return [];
  const chavesFound: string[] = [];

  // 1. Procura explícita perto do rótulo CHAVE DE ACESSO / DACTE / DAMDFE / DANFE
  const mLabel = text.match(/(?:CHAVE\s+(?:DE\s+)?ACESSO|CHAVE\s+DO\s+CT-?E|CHAVE\s+DACTE|CHAVE\s+DAMDFE|CHAVE\s+DANFE|CHAVE)[\s\S]{0,40}?((?:\d[\s.-]*){44})/i);
  if (mLabel && mLabel[1]) {
    const clean = mLabel[1].replace(/[\s.-]/g, '');
    if (clean.length === 44) {
      chavesFound.push(clean);
    }
  }

  // 2. Procura blocos formatados no texto (ex: 5226 0849 3837 0900 0100 5700 1000 0000 3010 0000 0000)
  const patternBlocos = /\b(?:\d{4}[\s.-]+){10}\d{4}\b/g;
  const matchBlocos = text.match(patternBlocos);
  if (matchBlocos) {
    matchBlocos.forEach(b => {
      const c = b.replace(/[\s.-]/g, '');
      if (c.length === 44) chavesFound.push(c);
    });
  }

  // 3. Procura padrão de 44 dígitos no texto corrido
  const cleanGlobal = text.replace(/[\s.-]/g, '');
  const all44 = cleanGlobal.match(/\d{44}/g);
  if (all44) {
    for (const ch of all44) {
      const modelo = ch.substring(20, 22);
      if (['57', '67', '55', '65', '58'].includes(modelo)) {
        chavesFound.push(ch);
      }
    }
  }

  return Array.from(new Set(chavesFound));
}

const CTE_PATTERNS = [
  /(?:DACTE|Conhecimento\s+de\s+Transporte\s+Eletr[ôo]nico|CT[- ]?e)\s*(?:[Nn][oOº°ú]|N[úu]mero|Número|NÚMERO)\.?\s*:?\s*([\d.]+)/i,
  /(?:DACTE|Conhecimento\s+de\s+Transporte\s+Eletr[ôo]nico)[^\d\n]{1,40}(?:N[º°ú]|N[úu]mero)\.?\s*:?\s*([\d.]+)/i,
  /\bCT[- ]?e\s*(?:Nº|N°|n[º°.]?)\s*([\d.]+)/i,
  /\bDACTE\b[^\d\n]{1,30}(?:Nº|N°|N[º°.]?)\s*([\d.]+)/i,
];

const NFE_PATTERNS = [
  /(?:DANFE|Nota\s+Fiscal\s+Eletr[ôo]nica|NF[- ]?e)\s*(?:[Nn][oOº°ú]|N[úu]mero|Número|NÚMERO)\.?\s*:?\s*([\d.]+)/i,
  /(?:DANFE|Documento\s+Auxiliar\s+da\s+Nota\s+Fiscal)[^\d\n]{1,40}(?:N[º°ú]|N[úu]mero)\.?\s*:?\s*([\d.]+)/i,
  /\bNF[- ]?e\s*(?:Nº|N°|n[º°.]?)\s*([\d.]+)/i,
  /\bDANFE\b[^\d\n]{1,30}(?:Nº|N°|N[º°.]?)\s*([\d.]+)/i,
];

const MDFE_PATTERNS = [
  /(?:DAMDFE|DAMFE|Manifesto\s+Eletr[ôo]nico\s+de\s+Documentos\s+Fiscais|MDF[- ]?e)\s*(?:[Nn][oOº°ú]|N[úu]mero|Número|NÚMERO)\.?\s*:?\s*([\d.]+)/i,
  /\bMDF[- ]?e\s*(?:Nº|N°|n[º°.]?)\s*([\d.]+)/i,
  /\bDAMDFE\b[^\d\n]{1,30}(?:Nº|N°|N[º°.]?)\s*([\d.]+)/i,
];

function matchPatterns(text: string, patterns: RegExp[]): string | undefined {
  for (const re of patterns) {
    const m = text.match(re);
    if (m && m[1]) return m[1].replace(/\./g, '').trim();
  }
  return undefined;
}

function extractCteEmissionDateFromText(text: string): string | undefined {
  const patterns = [
    /DATA\s*(?:E|\/)?\s*HORA\s*(?:DA|DE)?\s*EMISS[ÃA]O[^\d]*(\d{1,2}\/\d{1,2}\/\d{4}(?:\s+\d{2}:\d{2}(?::\d{2})?)?)/i,
    /EMISS[ÃA]O[^\d]*(\d{1,2}\/\d{1,2}\/\d{4}(?:\s+\d{2}:\d{2}(?::\d{2})?)?)/i,
    /DATA\s*(?:DA|DE)?\s*EMISS[ÃA]O[^\d]*(\d{1,2}\/\d{1,2}\/\d{4}(?:\s+\d{2}:\d{2}(?::\d{2})?)?)/i,
    /EMITIDO\s+EM\s*(\d{1,2}\/\d{1,2}\/\d{4})/i,
    /DATA\s+(?:DA\s+)?DECLARA[ÇC][ÃA]O\s*(\d{1,2}\/\d{1,2}\/\d{4})/i,
    /DATA\s*(?:DE\s*)?IMPRESS[ÃA]O\s*(\d{1,2}\/\d{1,2}\/\d{4})/i,
    /EMISS[ÃA]O[^\d]*(\d{4}-\d{1,2}-\d{1,2}[T\s]\d{2}:\d{2}(?::\d{2})?)/i,
    /(\d{1,2}\/\d{1,2}\/\d{4}\s+\d{2}:\d{2}:\d{2})/,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m && m[1]) {
      const formatted = formatFiscalDateTime(m[1].trim());
      if (formatted) return formatted;
    }
  }
  return undefined;
}

/**
 * Extrai com máxima precisão o valor do campo oficial "VALOR TOTAL DO SERVIÇO"
 * (ou "VALOR TOTAL DA PRESTAÇÃO") presente no layout do DACTE / CT-e.
 */
export function extractCteTotalServiceFromText(text: string): number | undefined {
  if (!text) return undefined;

  // 1. Padrão DACTE oficial nacional (grid com componentes):
  // "VALOR TOTAL DO SERVIÇO ... 8.339,40 8.339,40 INFORMAÇÕES RELATIVAS AO IMPOSTO"
  const mDacteGrid = text.match(/VALOR\s+TOTAL\s+DO\s+SERVI[ÇC]O[\s\S]{10,400}?\b([\d]{1,3}(?:\.[\d]{3})*,[\d]{2})\s+([\d]{1,3}(?:\.[\d]{3})*,[\d]{2})\s+(?:INFORMA[ÇC][ÕO]ES\s+RELATIVAS|CLASSIFICA[ÇC][ÃA]O\s+TRIBUT[ÁA]RIA|DADOS\s+DO\s+CT-?E|BASE\s+DE\s+C[ÁA]LCULO)/i);
  if (mDacteGrid && mDacteGrid[1]) {
    const val = parseCurrencyPtBr(mDacteGrid[1]);
    if (val && val > 0) return val;
  }

  // 2. Padrão DACTE direto: "VALOR TOTAL DO SERVIÇO" seguido imediatamente pelo valor numérico
  const mDirect = text.match(/VALOR\s+TOTAL\s+DO\s+SERVI[ÇC]O\s*(?:[:\-–]|\s*R\$\s*)?\s*([\d]{1,3}(?:\.[\d]{3})*,[\d]{2})\b/i);
  if (mDirect && mDirect[1]) {
    const val = parseCurrencyPtBr(mDirect[1]);
    if (val && val > 0) return val;
  }

  // 3. Padrão com quebra de linha: "VALOR TOTAL DO SERVIÇO\n8.339,40"
  const mNewline = text.match(/VALOR\s+TOTAL\s+DO\s+SERVI[ÇC]O[^\d\n\r]{0,20}[\r\n]+\s*(?:R\$\s*)?([\d]{1,3}(?:\.[\d]{3})*,[\d]{2})\b/i);
  if (mNewline && mNewline[1]) {
    const val = parseCurrencyPtBr(mNewline[1]);
    if (val && val > 0) return val;
  }

  // 4. Padrão DACTE alternativo: "VALOR TOTAL DA PRESTAÇÃO" (grid com componentes)
  const mPrestGrid = text.match(/VALOR\s+TOTAL\s+DA\s+PRESTA[ÇC][ÃA]O[\s\S]{10,400}?\b([\d]{1,3}(?:\.[\d]{3})*,[\d]{2})\s+([\d]{1,3}(?:\.[\d]{3})*,[\d]{2})\s+(?:INFORMA[ÇC][ÕO]ES\s+RELATIVAS|CLASSIFICA[ÇC][ÃA]O\s+TRIBUT[ÁA]RIA|DADOS\s+DO\s+CT-?E|BASE\s+DE\s+C[ÁA]LCULO)/i);
  if (mPrestGrid && mPrestGrid[1]) {
    const val = parseCurrencyPtBr(mPrestGrid[1]);
    if (val && val > 0) return val;
  }

  // 5. Padrão DACTE alternativo direto: "VALOR TOTAL DA PRESTAÇÃO" seguido do valor
  const mPrestDirect = text.match(/VALOR\s+TOTAL\s+DA\s+PRESTA[ÇC][ÃA]O\s*(?:[:\-–]|\s*R\$\s*)?\s*([\d]{1,3}(?:\.[\d]{3})*,[\d]{2})\b/i);
  if (mPrestDirect && mPrestDirect[1]) {
    const val = parseCurrencyPtBr(mPrestDirect[1]);
    if (val && val > 0) return val;
  }

  return undefined;
}

/**
 * Extrai com máxima precisão o número do CIOT a partir do texto do documento.
 * Reconhece a seção oficial "DECLARAÇÃO DE OPERAÇÃO DE TRANSPORTE" / "NÚMERO DO CIOT",
 * formatos ANTT com máscara (ex: 520.038.012.363/9057), e códigos numéricos de 12 a 16 dígitos,
 * garantindo que CNPJ, CPF, telefones e outros metadados não sejam confundidos.
 */
export function extractCiotFromText(text: string): string | undefined {
  if (!text) return undefined;

  // Helper para normalizar CIOT preservando obrigatoriamente a barra "/" e os dígitos posteriores
  const formatExtractedCiot = (raw: string): string => {
    const clean = raw.trim();
    if (clean.includes('/')) {
      const parts = clean.split('/');
      const prefix = parts[0].trim();
      const suffix = parts.slice(1).join('/').trim();
      if (suffix) {
        return `${prefix}/${suffix}`;
      }
      return prefix;
    }
    const digits = clean.replace(/\D/g, '');
    if (digits.length === 16) {
      return `${digits.slice(0, 12)}/${digits.slice(12)}`;
    }
    return clean;
  };

  // 1. Padrão oficial ANTT / e-Frete com máscara: 520.038.012.363/9057 ou similar (3.3.3.3/4 ou 3.3.3.3)
  const mMasked = text.match(/\b(\d{3}\.\d{3}\.\d{3}\.\d{3}(?:\/\d{4})?)\b/);
  if (mMasked && mMasked[1]) {
    return formatExtractedCiot(mMasked[1]);
  }

  // 2. Extração contextual vinculada a DECLARAÇÃO DE OPERAÇÃO DE TRANSPORTE ou NÚMERO DO CIOT ou CIOT
  const declRegex = /(?:DECLARA[ÇC][ÃA]O\s*(?:DE\s*)?OPERA[ÇC][ÃA]O\s*(?:DE\s*)?TRANSPORTE|N[ÚU]MERO\s*(?:DO\s*)?CIOT|\bCIOT\b)[\s\S]{0,250}?(\d{3}\.\d{3}\.\d{3}\.\d{3}(?:\/\d{4})?|\d{12}\/\d{4}|\b520\d{9,13}(?:\/\d{4})?\b|\b\d{16}\b|\b\d{12}\b)/gi;
  let matchDecl: RegExpExecArray | null;
  while ((matchDecl = declRegex.exec(text)) !== null) {
    const candidate = matchDecl[1]?.trim();
    if (!candidate) continue;
    // Ignorar CNPJs ou CPFs
    if (/^\d{2}\./.test(candidate) || /-\d{2}$/.test(candidate)) continue;
    const digits = candidate.replace(/\D/g, '');
    if (digits.length >= 12 && digits.length <= 16) {
      return formatExtractedCiot(candidate);
    }
  }

  // 3. Padrão direto com barra ou nacional iniciando com 520 (12 a 16 dígitos com ou sem barra)
  const mSlash = text.match(/\b(\d{12}\/\d{4})\b/);
  if (mSlash && mSlash[1]) {
    return mSlash[1];
  }

  const m520 = text.match(/\b(520\d{9}(?:\/\d{4})?|520\d{9,13})\b/);
  if (m520 && m520[1]) {
    return formatExtractedCiot(m520[1]);
  }

  // 4. Fallback: label CIOT seguido de sequência numérica de 12 a 16 dígitos ou formato com barra
  const mFallback = text.match(/\bCIOT[\s\S]{0,60}?(\d{3}\.\d{3}\.\d{3}\.\d{3}(?:\/\d{4})?|\d{12}\/\d{4}|\d{16}|\d{12})\b/i);
  if (mFallback && mFallback[1]) {
    return formatExtractedCiot(mFallback[1]);
  }

  return undefined;
}

export function extractFreightContractValues(text: string): {
  tollValue?: number;
  advanceValue?: number;
  totalFreightValue?: number;
  advancePercentage?: number;
  subtotalSaldoValue?: number;
} {
  const res: {
    tollValue?: number;
    advanceValue?: number;
    totalFreightValue?: number;
    advancePercentage?: number;
    subtotalSaldoValue?: number;
  } = {};

  if (!text) return res;

  // 1. Vale-Pedágio / Pedágio (Prefixo e Sufixo, ex: 'R$ 358,20 pedágio', 'VALE-PEDÁGIO R$ 68,11')
  // 1.1 Cláusulas explícitas de ausência de pedágio ("SEM PEDÁGIO", "PEDÁGIO: ISENTO", "VALE-PEDÁGIO: NÃO HÁ", "PEDÁGIO R$ 0,00")
  const tollExemptPatterns = [
    /\b(?:SEM|N[ÃA]O\s+H[ÁA]|N[ÃA]O\s+POSSUI|N[ÃA]O\s+INCLUS[OA]|ISENT[OA]\s+DE|DISPENSAD[OA])\s+(?:DE\s+)?(?:VALE[- ]?)?PED[ÁA]GIO/i,
    /\b(?:VALE[- ]?)?PED[ÁA]GIO\s*[:\-–]?\s*(?:ISENT[OA]|N[ÃA]O\s+H[ÁA]|N[ÃA]O\s+POSSUI|N[ÃA]O\s+INCLUS[OA]|DISPENSAD[OA]|N[ÃA]O\b|INEXISTENTE|NENHUM)/i,
    /\b(?:VALE[- ]?)?PED[ÁA]GIO[^\d\n]{0,15}?R?\$?\s*0+,00\b/i,
  ];
  const isTollExempt = tollExemptPatterns.some(re => re.test(text));

  // Rótulos de outros campos financeiros: se aparecerem entre a palavra "pedágio" e o valor,
  // o valor capturado pertence a outro campo (frete total, adiantamento, saldo etc.)
  const foreignFinancialLabel = /(FRETE|TOTAL|ADIANTAMENTO|SALDO|L[ÍI]QUIDO|MERCADORIA|NOTA|NF-?E|ICMS|INSS|SEST|SENAT|IRRF|PRESTA[ÇC][ÃA]O|RECEBER|PARCELA|CARGA|SEGURO)/i;

  const tollPatterns = [
    /VALE[- ]?PED[ÁA]GIO([^\d\n]{0,30}?)R?\$\s*([\d.,]+)/i,
    /VALOR\s+(?:DO\s+)?VALE[- ]?PED[ÁA]GIO([^\d\n]{0,30}?)R?\$\s*([\d.,]+)/i,
    /VPO\s*\(VALE[- ]?PED[ÁA]GIO[^\)]*\)[\s\S]{0,120}?TOTAL[:\s]*R?\$\s*([\d.,]+)/i,
    /(?:2\.2\s+)?R?\$?\s*([\d.,]+)\s*ped[áa]gio\s+PAGO/i,
    /\bPED[ÁA]GIO([^\d\n]{0,30}?)R?\$\s*([\d.,]+)/i,
    /R?\$\s*([\d.,]+)\s*(?:referente\s+(?:a[o]?\s+)?)?ped[áa]gio/i,
    /(?:[\d.]+\s+)?R?\$\s*([\d.,]+)\s*ped[áa]gio/i,
    /R?\$\s*([\d.,]+)\s*(?:em\s+tag|de\s+tag|tag\s+ped[áa]gio|vale[- ]?ped[áa]gio)/i,
  ];
  if (isTollExempt) {
    res.tollValue = 0;
  } else {
    for (const re of tollPatterns) {
      const m = text.match(re);
      if (!m) continue;
      // Padrões prefixados têm 2 grupos (gap, valor); padrões sufixados têm 1 grupo (valor)
      const gap = m.length > 2 ? (m[1] || '') : '';
      const rawVal = m.length > 2 ? m[2] : m[1];
      if (!rawVal) continue;
      if (gap && foreignFinancialLabel.test(gap)) continue;
      // Rejeita caso o gap indique CNPJ, Inscrição, CIOT, Número de documento, etc.
      if (gap && /(CNPJ|INSCRI[ÇC]|CPF|N[ºO]|NUM|C[ÓO]D|REGISTRO|CHAVE|FORNECEDOR)/i.test(gap)) continue;
      
      // Rejeita se o valor capturado for na verdade um CNPJ, CIOT ou código (11 ou mais dígitos inteiros)
      const digitsOnly = rawVal.replace(/\D/g, '');
      if (digitsOnly.length >= 11) continue;

      const val = parseCurrencyPtBr(rawVal);
      // Limite de sanidade física: pedágio unitário rodoviário de frete no Brasil não excede R$ 25.000,00
      if (val !== undefined && val >= 0 && val <= 25000) {
        res.tollValue = val;
        break;
      }
    }
  }

  // 2. Adiantamento (Prefixo e Sufixo, ex: 'R$ 4.068,61 referente Adiantamento de viagem', 'Total do Adiantamento pago R$ 4.068,61')
  const advancePatterns = [
    /(?:2\.4|2\.5)\s*R?\$?\s*([\d.,]+)\s*referente\s+Adiantamento(?:\s+de\s+viagem)?/i,
    /Total\s+do\s+Adiantamento\s+pago\s*R?\$?\s*([\d.,]+)/i,
    /efrete:\s*Adiantamento[^\d\n]*R?\$\s*([\d.,]+)/i,
    /R?\$?\s*([\d.,]+)\s*referente\s+Adiantamento\s+de\s+viagem/i,
    /(?:[\d.]+\s+)?R?\$?\s*([\d.,]+)\s*referente\s+Adiantamento/i,
    /(?:efete:|efrete:|e-frete:)?\s*Adiantamento[^\d\n]*R?\$\s*([\d.,]+)/i,
    /Valor\s+(?:do\s+)?Adiantamento[^\d\n]*R?\$\s*([\d.,]+)/i,
    /1[ªa]\s*Parcela[^\d\n]*R?\$\s*([\d.,]+)/i,
    /ADIANTAMENTO[^\d\n]*R?\$\s*([\d.,]+)/i,
    /R?\$\s*([\d.,]+)\s*(?:referente\s+(?:a[o]?\s+)?)?adiantamento/i,
  ];
  for (const re of advancePatterns) {
    const m = text.match(re);
    if (m && m[1]) {
      const val = parseCurrencyPtBr(m[1]);
      if (val !== undefined && val > 0) {
        res.advanceValue = val;
        break;
      }
    }
  }

  // 3. Valor Total do Frete / Prestação (priorizando expressamente o campo VALOR TOTAL DO SERVIÇO / PRESTAÇÃO)
  const explicitCteServiceTotal = extractCteTotalServiceFromText(text);
  if (explicitCteServiceTotal !== undefined && explicitCteServiceTotal > 0) {
    res.totalFreightValue = explicitCteServiceTotal;
  } else {
    const totalFreightPatterns = [
      /1\.1\s+Valor\s+total\s+do\s+frete\s*R?\$?\s*([\d.,]+)/i,
      /(?:VALOR\s+TOTAL\s+(?:DO\s+)?FRETE|VALOR\s+DO\s+FRETE|VALOR\s+TOTAL\s+DA\s+PRESTA[ÇC][ÃA]O|VALOR\s+TOTAL\s+DO\s+SERVI[ÇC]O|VALOR\s+A\s+RECEBER|VLR\s+TOTAL\s+PRESTA[ÇC][ÃA]O|VALOR\s+DA\s+PRESTA[ÇC][ÃA]O|TOTAL\s+DA\s+PRESTA[ÇC][ÃA]O|TOTAL\s+DO\s+SERVI[ÇC]O)[\s\S]{0,35}?(?:R\$\s*)?([\d]{1,3}(?:\.[\d]{3})*,[\d]{2})\b/i,
      /(?:VALOR\s+TOTAL\s+(?:DO\s+)?FRETE|VALOR\s+DO\s+FRETE|VALOR\s+TOTAL\s+DA\s+PRESTA[ÇC][ÃA]O|VALOR\s+TOTAL\s+DO\s+SERVI[ÇC]O|VALOR\s+A\s+RECEBER|VALOR\s+DA\s+PRESTA[ÇC][ÃA]O)[^\d\n]*R?\$\s*([\d.,]+)/i,
      /INFORMA[ÇC][ÕO]ES\s+DO\s+FRETE[\s\S]{0,250}?VALOR\s+TOTAL\s*R?\$\s*([\d.,]+)/i,
      /VALOR\s+TOTAL[^\d\n]*R?\$\s*([\d.,]+)/i,
      /VALOR\s+L[ÍI]QUIDO[^\d\n]*R?\$\s*([\d.,]+)/i,
      /FRETE\s+TOTAL[^\d\n]*R?\$\s*([\d.,]+)/i,
      /TOTAL\s+DO\s+FRETE[^\d\n]*R?\$\s*([\d.,]+)/i,
    ];
    for (const re of totalFreightPatterns) {
      const m = text.match(re);
      if (m && m[1]) {
        const val = parseCurrencyPtBr(m[1]);
        if (val !== undefined && val > 0) {
          res.totalFreightValue = val;
          break;
        }
      }
    }
  }

  // 4. Porcentagem do Adiantamento
  const pctPatterns = [
    /Adiantamento[^\n%]*?(\d{1,3}(?:[.,]\d+)?)\s*%/i,
    /(\d{1,3}(?:[.,]\d+)?)\s*%\s*(?:de\s*)?Adiantamento/i,
    /%\s*(?:de\s*)?Adiantamento[^\d\n]*(\d{1,3}(?:[.,]\d+)?)/i,
    /(\d{1,3}(?:[.,]\d+)?)\s*%\s*(?:do\s+frete|no\s+adiantamento)/i,
    /adiantamento\s*(?:de\s*)?100\s*%/i,
    /100\s*%\s*(?:adiantamento|antecipado|no\s+adiantamento)/i,
    /adiantamento\s*integral/i,
  ];
  for (const re of pctPatterns) {
    const m = text.match(re);
    if (m) {
      if (m[0].toLowerCase().includes('100') || m[0].toLowerCase().includes('integral')) {
        res.advancePercentage = 100;
        break;
      }
      if (m[1]) {
        const pct = parseFloat(m[1].replace(',', '.'));
        if (!isNaN(pct) && pct > 0 && pct <= 100) {
          res.advancePercentage = Math.round(pct);
          break;
        }
      }
    }
  }

  // Se o saldo explícito na Carta Frete for R$ 0,00 e houver adiantamento
  const zeroSaldoMatch = text.match(/Saldo[^\d\n]*R?\$\s*0(?:[.,]00)?(?!\d)/i);
  if (zeroSaldoMatch && (res.advanceValue || res.totalFreightValue)) {
    res.advancePercentage = 100;
    res.subtotalSaldoValue = 0;
  }

  if (!res.advancePercentage && res.advanceValue && res.totalFreightValue && res.totalFreightValue > 0) {
    if (res.advanceValue >= res.totalFreightValue - 2.00 || (res.tollValue && res.advanceValue + res.tollValue >= res.totalFreightValue - 2.00)) {
      res.advancePercentage = 100;
    } else {
      const pct = Math.round((res.advanceValue / res.totalFreightValue) * 100);
      if (pct > 0 && pct <= 100) {
        res.advancePercentage = pct;
      }
    }
  }

  // 5. Falso positivo: pedágio idêntico ao frete total ou ao adiantamento foi capturado de outro campo
  if (res.tollValue !== undefined && res.tollValue > 0) {
    const sameAs = (v?: number) => v !== undefined && Math.abs(v - (res.tollValue as number)) < 0.01;
    if (sameAs(res.totalFreightValue) || sameAs(res.advanceValue)) {
      delete res.tollValue;
    }
  }

  return res;
}

/**
 * Calcula o valor líquido do frete motorista da Carta Frete / Contrato de Transporte (sem pedágio).
 * Por legislação brasileira (Lei nº 10.209/2001 e normas ANTT), o vale-pedágio obrigatório não integra o valor do frete.
 * Em contratos de transporte padrão (ex: MaisFrete / EFRETE / Pamcard), a cláusula "1.1 Valor total do frete"
 * já expressa o valor do frete sem pedágio (o pedágio é antecipado em TAG no item 2.2).
 */
export function calculateNetCartaFreteFreight(params: {
  rawFreight?: number;
  toll?: number;
  advance?: number;
  advancePercentage?: number;
  saldo?: number;
  systemFreightNetOfToll?: number;
  systemFreightWithToll?: number;
}): number | undefined {
  const { rawFreight, toll = 0, advance = 0, advancePercentage = 0, saldo = 0, systemFreightNetOfToll, systemFreightWithToll } = params;
  if (rawFreight === undefined || rawFreight <= 0) return undefined;
  if (!toll || toll <= 0) return rawFreight;

  // 1. Se adiantamento e saldo estão presentes:
  // Se adiantamento + saldo bate com o frete total bruto lido, o valor já é SEM pedágio.
  if (advance > 0 && saldo > 0) {
    if (Math.abs((advance + saldo) - rawFreight) <= 2.00) {
      return rawFreight; // já é sem pedágio
    }
    if (Math.abs((advance + saldo + toll) - rawFreight) <= 2.00) {
      return Number(Math.max(0, rawFreight - toll).toFixed(2)); // continha pedágio
    }
  }

  // 2. Se adiantamento e % adiantamento estão presentes:
  // Ex: adiantamento 4.068,61 com 70% => 4.068,61 / 0.70 = 5.812,30
  if (advance > 0 && advancePercentage > 0 && advancePercentage < 100) {
    const impliedFromAdvance = advance / (advancePercentage / 100);
    if (Math.abs(impliedFromAdvance - rawFreight) <= 2.00) {
      return rawFreight; // já é sem pedágio
    }
    if (Math.abs(impliedFromAdvance - (rawFreight - toll)) <= 2.00) {
      return Number(Math.max(0, rawFreight - toll).toFixed(2)); // continha pedágio
    }
  }

  // 3. Comparação com o Frete do Sistema (se fornecido):
  if (systemFreightNetOfToll !== undefined && systemFreightNetOfToll > 0) {
    if (Math.abs(rawFreight - systemFreightNetOfToll) <= 2.00) {
      return rawFreight; // bate exatamente com o frete do sistema sem pedágio
    }
    if (systemFreightWithToll !== undefined && Math.abs(rawFreight - systemFreightWithToll) <= 2.00) {
      return Number(Math.max(0, rawFreight - toll).toFixed(2)); // bate com o frete com pedágio
    }
  }

  // 4. Padrão Carta Frete / Contrato de Transporte (Lei nº 10.209/2001 e ANTT):
  // O valor total do frete informado no contrato/carta frete é por definição o frete motorista sem pedágio.
  return rawFreight;
}

// -------------------------------------------------------------
// EXTRAÇÃO DETALHADA DE TEXTO / PDF
// -------------------------------------------------------------

function parseDetailedText(text: string, declaredDocType: string = ''): DetailedDocumentData {
  const upper = text.toUpperCase();
  const res: DetailedDocumentData = {
    documentType: 'Outro',
    sourceType: 'pdf',
    rawText: text
  };

  // 1. Chaves de Acesso
  const chaves = extractAllChavesAcesso(text);
  if (chaves.length > 0) {
    res.accessKey = chaves[0];
  }

  const keyMeta = parseAccessKey44(res.accessKey);

  // 2. Determinação Precisa do Tipo de Documento
  // 2.1 Detecta se é oficialmente um CT-e / DACTE (prioridade máxima)
  const isCteOfficial = (
    keyMeta?.docType === 'CT-e' ||
    upper.includes('DOCUMENTO AUXILIAR DO CONHECIMENTO DE TRANSPORTE') ||
    upper.includes('CONHECIMENTO DE TRANSPORTE ELETRÔNICO') ||
    isCteDocType(declaredDocType) ||
    (upper.includes('DACTE') && !upper.includes('CONTRATO DE PRESTAÇÃO DE SERVIÇO') && !upper.includes('CONTRATO DE TRANSPORTE') && !upper.includes('CONTRATO DE FRETE'))
  );

  // 2.2 Detecta se é oficialmente uma Nota Fiscal (NF-e / DANFE)
  // Nunca confunde com Carta Frete, mesmo que a NF contenha dados contratuais de grãos
  const isNfeOfficial = !isCteOfficial && (
    keyMeta?.docType === 'Nota Fiscal' ||
    upper.includes('DOCUMENTO AUXILIAR DA NOTA FISCAL ELETRÔNICA') ||
    upper.includes('DOCUMENTO AUXILIAR DA NOTA FISCAL ELETRONICA') ||
    upper.includes('DANFE') ||
    (upper.includes('NOTA FISCAL ELETRÔNICA') && !upper.includes('CONTRATO DE PRESTAÇÃO') && !upper.includes('CONTRATO DE FRETE')) ||
    isNfeDocType(declaredDocType)
  );

  // 2.3 Detecta se é oficialmente um MDF-e (DAMDFE)
  const isMdfeOfficial = !isCteOfficial && !isNfeOfficial && (
    keyMeta?.docType === 'MDF-e' ||
    upper.includes('DOCUMENTO AUXILIAR DO MANIFESTO') ||
    upper.includes('MANIFESTO ELETRÔNICO DE DOCUMENTOS') ||
    upper.includes('MANIFESTO ELETRONICO DE DOCUMENTOS') ||
    upper.includes('DAMDFE') ||
    upper.includes('DAMFE') ||
    isMdfeDocType(declaredDocType)
  );

  // 2.4 Detecta se o texto é um Contrato de Frete / Carta Frete oficial (layout padrão MaisFrete / e-Frete / NSTECH)
  const isContratoFreteText = !isCteOfficial && !isNfeOfficial && !isMdfeOfficial && (
    upper.includes('CONTRATO DE PRESTAÇÃO DE SERVIÇO DE TRANSPORTE') ||
    upper.includes('CONTRATO DE PRESTACAO DE SERVICO DE TRANSPORTE') ||
    upper.includes('CONTRATO DE PRESTAÇÃO DE SERVIÇO/FRETE') ||
    upper.includes('CONTRATO DE PRESTACAO DE SERVICO/FRETE') ||
    upper.includes('CONTRATO DE PRESTAÇÃO DE SERVIÇO') ||
    upper.includes('CONTRATO DE PRESTACAO DE SERVICO') ||
    upper.includes('CONTRATO DE TRANSPORTE/FRETE') ||
    upper.includes('CONTRATO DE TRANSPORTE') ||
    upper.includes('CONTRATO DE FRETE') ||
    upper.includes('CARTA FRETE') ||
    upper.includes('CARTA DE FRETE') ||
    upper.includes('COMPOSIÇÃO DO ADIANTAMENTO DE FRETE') ||
    upper.includes('COMPOSICAO DO ADIANTAMENTO DE FRETE') ||
    upper.includes('COMPOSIÇÃO DO SALDO DE FRETE') ||
    upper.includes('COMPOSICAO DO SALDO DE FRETE') ||
    upper.includes('CÁLCULO DO SALDO DE FRETE') ||
    upper.includes('CALCULO DO SALDO DE FRETE') ||
    upper.includes('DAS CONDIÇÕES DO FRETE') ||
    upper.includes('DAS CONDICOES DO FRETE') ||
    upper.includes('DECLARAÇÃO DE OPERAÇÃO DE TRANSPORTE') ||
    upper.includes('DECLARACAO DE OPERACAO DE TRANSPORTE') ||
    upper.includes('VALE-PEDÁGIO OBRIGATÓRIO') ||
    upper.includes('VALE-PEDAGIO OBRIGATORIO') ||
    upper.includes('EFRETE PIX') ||
    upper.includes('EFRETE TAG') ||
    upper.includes('MAISFRETE') ||
    isCartaFreteDocType(declaredDocType)
  );

  if (isCteOfficial) {
    res.documentType = 'CT-e';
  } else if (isNfeOfficial) {
    res.documentType = 'Nota Fiscal';
  } else if (isMdfeOfficial) {
    res.documentType = 'MDF-e';
  } else if (isContratoFreteText) {
    res.documentType = 'Carta Frete';
  } else if (declaredDocType && declaredDocType.toUpperCase().includes('CIOT')) {
    res.documentType = 'CIOT';
  } else if (keyMeta) {
    res.documentType = keyMeta.docType;
  }

  // 3. Extração de Números Sequenciais & Séries (priorizando a chave de 44 dígitos oficial)
  if (keyMeta) {
    res.docNumber = keyMeta.docNumber;
    res.series = keyMeta.serie;
  } else {
    if (res.documentType === 'CT-e') {
      res.docNumber = matchPatterns(text, CTE_PATTERNS);
    } else if (res.documentType === 'MDF-e') {
      res.docNumber = matchPatterns(text, MDFE_PATTERNS);
    } else if (res.documentType === 'Nota Fiscal') {
      res.docNumber = matchPatterns(text, NFE_PATTERNS);
    } else if (res.documentType === 'Carta Frete') {
      const mContrato = text.match(/(?:CONTRATO\s+DE\s+PRESTA[ÇC][ÃA]O\s+DE\s+SERVI[ÇC]O\s*(?:\/FRETE)?|CONTRATO\s+DE\s+FRETE|CONDI[ÇC][ÕO]ES\s+DO\s+FRETE)\s*(?:N[º°ú]|N[úu]mero|N°)?\.?\s*([\d]+(?:\/[\d]+)?)/i) ||
                        text.match(/(?:CTRC\/CT-e\/CE|CTRC|CONTRATO)[\s\S]{0,30}?(?:N[º°ú]|N[úu]mero|N°)?\.?\s*([\d]+(?:\/[\d]+)?)/i) ||
                        text.match(/\bDOCUMENTO\s+(\d{3,10})\b/i);
      if (mContrato && mContrato[1]) {
        res.docNumber = mContrato[1].trim();
      } else {
        const mNum = text.match(/(?:CONTRATO|CARTA\s+FRETE|N[º°ú]|N[úu]mero|VIAGEM)[^\d\n]*?(\d{4,12})/i);
        if (mNum && mNum[1]) res.docNumber = mNum[1];
      }
    } else {
      const mNum = text.match(/(?:CONTRATO|CARTA\s+FRETE|N[º°ú]|N[úu]mero|VIAGEM)[^\d\n]*?(\d{4,12})/i);
      if (mNum && mNum[1]) res.docNumber = mNum[1];
    }

    const mSerie = text.match(/S[ée]rie[^\d\n]*?(\d{1,3})/i);
    if (mSerie && mSerie[1]) res.series = mSerie[1];
  }

  // 4. Data de Emissão
  res.emissionDate = extractCteEmissionDateFromText(text);

  // 5. CIOT
  res.ciot = extractCiotFromText(text);

  // 6. CFOP e Natureza da Operação
  const mCfop = text.match(/\bCFOP[^\d\n]*?(\d{4})/i) || text.match(/\b(\d{4})\s*-\s*SERV/i);
  if (mCfop && mCfop[1] && mCfop[1] !== '0000') {
    res.cfop = mCfop[1];
  }

  const mNatOp = text.match(/NATUREZA\s+DA\s+OPERA[ÇC][ÃA]O[:\s]+([^\n\r]{3,60})/i) ||
                  text.match(/(?:CFOP\s*[-–]\s*)?NATUREZA\s+DA\s+OPERA[ÇC][ÃA]O[:\s]*([^\n\r]+)/i);
  if (mNatOp && mNatOp[1]) {
    res.naturezaOperacao = mNatOp[1].replace(/DACTE|DAMDFE|DANFE|Documento\s+Auxil.*|PROTOCOLO\s+DE\s+AUTORIZA[ÇC][ÃA]O.*/i, '').trim();
  }

  // 7. Placas e RNTRC
  const mPlacas = text.match(/\b([A-Z]{3}[0-9][0-9A-Z][0-9]{2}|[A-Z]{3}-\d{4})\b/g);
  if (mPlacas && mPlacas.length > 0) {
    const normalizedPlacas = Array.from(new Set(mPlacas.map(p => p.replace('-', '').toUpperCase())));
    res.veiculo = res.veiculo || {};
    res.veiculo.placaTrator = normalizedPlacas[0];
    if (normalizedPlacas.length > 1) {
      res.veiculo.placasReboque = normalizedPlacas.slice(1);
    }
  }

  const mRntrc = text.match(/RNTRC[^\d\n]*?(\d{6,10})/i);
  if (mRntrc && mRntrc[1]) {
    res.veiculo = res.veiculo || {};
    res.veiculo.rntrc = mRntrc[1];
  }

  // 8. Motorista / Condutor
  const mMotorista = text.match(/(?:NOME\s+DO\s+CONDUTOR|MOTORISTA|CONDUTOR|CONTRATADO)[:\s]+([A-ZÀ-Ú\s]{4,40})(?:\s+CPF|\s+CNH|\s+RG|\n|$)/i);
  const mCpf = text.match(/(?:CPF|CNPJ)[^\d\n]*?(\d{3}\.?\d{3}\.?\d{3}-?\d{2})/i) || text.match(/\b(\d{11})\b/);
  const mCnh = text.match(/CNH[^\d\n]*?(\d{8,12})/i);
  const cleanMotoristaName = cleanPersonName(mMotorista?.[1]);
  if (cleanMotoristaName || mCpf || mCnh) {
    res.motorista = {
      nome: cleanMotoristaName,
      cpf: mCpf?.[1]?.trim(),
      cnh: mCnh?.[1]?.trim(),
    };
  }

  // 9. Origem e Destino
  const mOrigem = text.match(/(?:IN[ÍI]CIO\s+(?:DA\s+)?PRESTA[ÇC][ÃA]O|ORIGEM|UF\s+DE\s+CARREGAMENTO|UF\s+CARREGAMENTO)[\s\S]{0,40}?([A-ZÀ-Ú\s]{3,30})\s*[-/]\s*([A-Z]{2})/i) ||
                  text.match(/(?:IN[ÍI]CIO\s+DA\s+PRESTA[ÇC][ÃA]O|ORIGEM|UF\s+DE\s+CARREGAMENTO)[^\w\n]*([A-Z\s]{3,30})(?:-|\/|\s)([A-Z]{2})/i);
  if (mOrigem) {
    res.origem = { municipio: mOrigem[1].trim(), uf: mOrigem[2].trim() };
  }
  const mDestino = text.match(/(?:FIM\s+(?:DA\s+)?PRESTA[ÇC][ÃA]O|DESTINO|UF\s+DE\s+DESCARREGAMENTO|UF\s+DESCARREGAMENTO)[\s\S]{0,40}?([A-ZÀ-Ú\s]{3,30})\s*[-/]\s*([A-Z]{2})/i) ||
                   text.match(/(?:FIM\s+DA\s+PRESTA[ÇC][ÃA]O|DESTINO|UF\s+DE\s+DESCARREGAMENTO)[^\w\n]*([A-Z\s]{3,30})(?:-|\/|\s)([A-Z]{2})/i);
  if (mDestino) {
    res.destino = { municipio: mDestino[1].trim(), uf: mDestino[2].trim() };
  }

  // 10. Pesos e Cargas
  let extractedPesoBruto: number | undefined;
  let extractedPesoLiquido: number | undefined;

  // 10.1 Padrão Prioritário MDF-e (DAMDFE): "Peso total (Kg)"
  const mPesoMdfe = text.match(/(?:Peso\s+total\s*\(\s*Kg\s*\)|PESO\s+TOTAL\s*\(KG\)|PESO\s+TOTAL\s+KG)[\s\S]{0,35}?\b([\d]{1,3}(?:\.[\d]{3})+(?:,[\d]+)?|[\d]{3,}(?:,[\d]+)?|[\d.,]+)\b/i) ||
                    text.match(/(?:Peso\s+total\s*\(\s*Kg\s*\)|PESO\s+TOTAL\s*\(KG\))[^\d\n]*?([\d.,]+)/i);
  if (mPesoMdfe && mPesoMdfe[1]) {
    const val = parseCurrencyPtBr(mPesoMdfe[1]);
    if (val !== undefined && val > 0) {
      extractedPesoBruto = val;
    }
  }

  // 10.2 Padrões para CT-e e NF-e
  if (extractedPesoBruto === undefined) {
    const pesoBrutoPatterns = [
      /PESO\s+BRUTO\s*\(?\s*KG\s*\)?[\s\S]{0,25}?\b([\d]{1,3}(?:\.[\d]{3})*(?:,[\d]+)?|[\d]+(?:,[\d]+)?)\b/i,
      /PESO\s+BRUTO[^\d\n]*?([\d.,]+)\s*(?:KG|TON|T)?/i,
      /PESO\s+AFERIDO[^\d\n]*?([\d.,]+)\s*(?:KG|TON|T)?/i,
      /PESO\s+DECLARADO[^\d\n]*?([\d.,]+)\s*(?:KG|TON|T)?/i,
      /PESO\s+BASE\s+DE\s+C[ÁA]LCULO[^\d\n]*?([\d.,]+)/i,
    ];

    for (const re of pesoBrutoPatterns) {
      const m = text.match(re);
      if (m && m[1]) {
        const val = parseWeightKg(m[1]);
        if (val !== undefined && val > 0) {
          extractedPesoBruto = val;
          break;
        }
      }
    }
  }

  // 10.3 Peso Líquido
  const mPesoLiquido = text.match(/PESO\s+L[ÍI]QUIDO[\s\S]{0,25}?([\d]{1,3}(?:\.[\d]{3})*(?:,[\d]+)?)\s*(?:KG|TON|T)?/i);
  if (mPesoLiquido && mPesoLiquido[1]) {
    extractedPesoLiquido = parseWeightKg(mPesoLiquido[1]);
  }

  // 10.4 Quantidade de Volumes / Qtd CT-e
  const mVolumes = text.match(/(?:QTD\.?\s*TOTAL\s*DE\s*CT-?E|QTD\.?\s*CT-?E)[^\d\n]*?(\d+)/i) ||
                   text.match(/(?:VOLUMES|QUANTIDADE\s+VOLUMES|QTD\s+VOL)[^\d\n]*?([\d.,]+)/i);

  // 10.5 Valor da Carga / Mercadorias
  const mValCarga = text.match(/(?:VALOR\s+(?:TOTAL\s+)?(?:DA\s+)?CARGA|VALOR\s+(?:TOTAL\s+)?(?:DAS\s+)?MERCADORIAS?|VALOR\s+DECLARADO|VALOR\s+P\/\s*AVERBA[ÇC][ÃA]O|VLR\s+CARGA|VALOR\s+DOS\s+PRODUTOS|VALOR\s+TOTAL\s+DA\s+NOTA)[\s\S]{0,35}?(?:R\$\s*)?([\d]{1,3}(?:\.[\d]{3})*,[\d]{2})\b/i) ||
                    text.match(/(?:VALOR\s+(?:DA\s+)?CARGA|VALOR\s+(?:DOS\s+)?PRODUTOS|TOTAL\s+(?:DOS\s+)?PRODUTOS)[^\d\n]*R?\$\s*([\d.,]+)/i);
  const mEspecie = text.match(/(?:ESP[ÉE]CIE|ESPECIE)[^\w\n]*([A-Z\s]{3,20})/i);
  const mProdPred = text.match(/(?:PRODUTO\s+PREDOMINANTE|CARGA\s+PREDOMINANTE|DESCRIC[ÃA]O\s+DO\s+PRODUTO)[:\s]*([A-ZÀ-Ú0-9\s.,-]{3,40})/i);

  if (extractedPesoBruto || extractedPesoLiquido || mVolumes || mValCarga || mEspecie || mProdPred) {
    res.carga = {
      pesoBrutoKg: extractedPesoBruto,
      pesoLiquidoKg: extractedPesoLiquido,
      quantidadeVolumes: parseCurrencyPtBr(mVolumes?.[1]),
      valorMercadoria: parseCurrencyPtBr(mValCarga?.[1]),
      especie: mEspecie?.[1]?.trim(),
      produtoPredominante: mProdPred?.[1]?.trim(),
    };
  }

  // 11. Valores Financeiros e Frete (Isolado para documentos de frete/transporte: CT-e, MDF-e, Carta Frete)
  const isPureNotaFiscalOrTicket = 
    res.documentType === 'Nota Fiscal' || 
    isNfeDocType(declaredDocType) || 
    declaredDocType.toLowerCase().includes('ticket') || 
    declaredDocType.toLowerCase().includes('carregamento') ||
    declaredDocType.toLowerCase().includes('comprovante') ||
    upper.includes('DANFE') || 
    upper.includes('DOCUMENTO AUXILIAR DA NOTA FISCAL');

  const explicitCteServiceTotal = !isPureNotaFiscalOrTicket ? extractCteTotalServiceFromText(text) : undefined;
  const contractVals = !isPureNotaFiscalOrTicket ? extractFreightContractValues(text) : {};
  const mFreteLiq = !isPureNotaFiscalOrTicket ? text.match(/(?:VALOR\s+L[ÍI]QUIDO|L[ÍI]QUIDO\s+A\s+RECEBER|FRETE\s+L[ÍI]QUIDO)[\s\S]{0,35}?(?:R\$\s*)?([\d]{1,3}(?:\.[\d]{3})*,[\d]{2})\b/i) : null;
  const mSaldo = !isPureNotaFiscalOrTicket ? text.match(/(?:SALDO|VALOR\s+DO\s+SALDO|2[ªa]\s*Parcela)[\s\S]{0,35}?(?:R\$\s*)?([\d]{1,3}(?:\.[\d]{3})*,[\d]{2})\b/i) : null;
  const mCombustivel = !isPureNotaFiscalOrTicket ? text.match(/(?:COMBUST[ÍI]VEL|ABASTECIMENTO|POSTO)[\s\S]{0,35}?(?:R\$\s*)?([\d]{1,3}(?:\.[\d]{3})*,[\d]{2})\b/i) : null;
  
  // Detecção de isenção ou não incidência de ICMS no CT-e
  const isCteIcmsIsento = !isPureNotaFiscalOrTicket && Boolean(
    /(?:ICMS\s+isento|isento\s+de\s+ICMS|ICMS\s*:\s*isento|CST\s*40\b|40\s*-\s*ICMS\s+isento|40\s*-\s*isento|isen[çc][ãa]o\s+de\s+ICMS|n[ãa]o\s+tributad[ao]|41\s*-\s*n[ãa]o\s+tributad[ao]|CST\s*41\b)/i.test(text)
  );

  const mIcms = (!isPureNotaFiscalOrTicket && !isCteIcmsIsento) ? (
    text.match(/(?:VALOR\s+(?:DO\s+)?ICMS|VLR\s+ICMS)[\s\S]{0,35}?(?:R\$\s*)?([\d]{1,3}(?:\.[\d]{3})*,[\d]{2})\b/i) ||
    text.match(/\bICMS\s*(?:R\$\s*)?([\d]{1,3}(?:\.[\d]{3})*,[\d]{2})\b/i)
  ) : null;
  const mBcIcms = (!isPureNotaFiscalOrTicket && !isCteIcmsIsento) ? text.match(/(?:BASE\s+DE\s+C[ÁA]LCULO\s+(?:DO\s+)?ICMS|BC\s+ICMS)[\s\S]{0,35}?(?:R\$\s*)?([\d]{1,3}(?:\.[\d]{3})*,[\d]{2})\b/i) : null;
  const mAliqIcms = (!isPureNotaFiscalOrTicket && !isCteIcmsIsento) ? (
    text.match(/(?:AL[ÍI]QUOTA\s+(?:DO\s+)?ICMS|AL[ÍI]Q\s+ICMS|AL[ÍI]Q\.\s*ICMS)[\s\S]{0,20}?([\d.,]+)\s*%/i) ||
    text.match(/(?:ICMS\s*:\s*|ICMS\s+)([\d.,]+)\s*%/i) ||
    text.match(/AL[ÍI]Q(?:UOTA)?\s*[:=]?\s*([\d.,]+)\s*%/i)
  ) : null;
  const mPix = !isPureNotaFiscalOrTicket ? text.match(/(?:PIX|CHAVE\s+PIX)[:\s]+([^\s\n\r]{4,50})/i) : null;

  res.financeiro = {
    valorTotalFrete: explicitCteServiceTotal || contractVals.totalFreightValue,
    valorTotalServico: explicitCteServiceTotal,
    valorLiquido: parseCurrencyPtBr(mFreteLiq?.[1]),
    valorAdiantamento: contractVals.advanceValue,
    porcentagemAdiantamento: contractVals.advancePercentage,
    valorSaldo: parseCurrencyPtBr(mSaldo?.[1]),
    valorPedagio: contractVals.tollValue,
    valorCombustivel: parseCurrencyPtBr(mCombustivel?.[1]),
    baseCalculoIcms: isCteIcmsIsento ? 0 : parseCurrencyPtBr(mBcIcms?.[1]),
    valorIcms: isCteIcmsIsento ? 0 : parseCurrencyPtBr(mIcms?.[1]),
    aliquotaIcms: isCteIcmsIsento ? 0 : parseCurrencyPtBr(mAliqIcms?.[1]),
    chavePix: mPix?.[1]?.trim(),
  };

  // 12. Seguro
  const mSeg = text.match(/(?:SEGURADORA|NOME\s+DA\s+SEGURADORA)[:\s]+([A-ZÀ-Ú\s]{3,35})/i);
  const mApol = text.match(/(?:AP[ÓO]LICE|N[º°ú]\s+AP[ÓO]LICE)[:\s]+([A-Z0-9.\-\/]{4,30})/i);
  const mAver = text.match(/(?:AVERBA[ÇC][ÃA]O|N[º°ú]\s+AVERBA[ÇC][ÃA]O)[:\s]+([A-Z0-9.\-\/]{4,40})/i);
  if (mSeg || mApol || mAver) {
    res.seguro = {
      nomeSeguradora: mSeg?.[1]?.trim(),
      numeroApolice: mApol?.[1]?.trim(),
      numeroAverbacao: mAver?.[1]?.trim(),
    };
  }

  // 13. Partes Envolvidas (Emitente, Destinatário, Remetente, Tomador)
  const mEmit = text.match(/(?:EMITENTE|TRANSPORTADOR|EMITIDO\s+POR)[:\s]*([A-ZÀ-Ú0-9\s.,&/-]{4,50})(?:\s+CNPJ|\s+CPF|\n|$)/i);
  const mEmitCnpj = text.match(/(?:EMITENTE|TRANSPORTADOR)[\s\S]{0,80}?(?:CNPJ|CPF)[:\s]*([\d./-]{14,18})/i);
  const cleanEmit = cleanLegalEntityName(mEmit?.[1]);
  if (cleanEmit || mEmitCnpj) {
    res.emitente = { 
      razaoSocial: cleanEmit,
      cnpjCpf: mEmitCnpj?.[1]?.trim()
    };
  }

  const mRem = text.match(/REMETENTE[:\s]*([A-ZÀ-Ú0-9\s.,&/-]{4,50})/i);
  const mRemCnpj = text.match(/REMETENTE[\s\S]{0,80}?(?:CNPJ|CPF)[:\s]*([\d./-]{14,18})/i);
  const cleanRem = cleanLegalEntityName(mRem?.[1]);
  if (cleanRem || mRemCnpj) {
    res.remetente = { 
      razaoSocial: cleanRem,
      cnpjCpf: mRemCnpj?.[1]?.trim()
    };
  }

  const mDest = text.match(/DESTINAT[ÁA]RIO[:\s]*([A-ZÀ-Ú0-9\s.,&/-]{4,50})/i);
  const mDestCnpj = text.match(/DESTINAT[ÁA]RIO[\s\S]{0,80}?(?:CNPJ|CPF)[:\s]*([\d./-]{14,18})/i);
  const cleanDest = cleanLegalEntityName(mDest?.[1]);
  if (cleanDest || mDestCnpj) {
    res.destinatario = { 
      razaoSocial: cleanDest,
      cnpjCpf: mDestCnpj?.[1]?.trim()
    };
  }

  const mTomador = text.match(/TOMADOR\s+(?:DO\s+)?SERVI[ÇC]O[:\s]*([A-ZÀ-Ú0-9\s.,&/-]{4,50})/i) ||
                   text.match(/TOMADOR[:\s]*([A-ZÀ-Ú0-9\s.,&/-]{4,50})/i);
  const mTomadorCnpj = text.match(/(?:TOMADOR|PAGADOR)[\s\S]{0,120}?(?:CNPJ|CPF)[:\s]*([\d./-]{11,18})/i) ||
                       text.match(/(?:CNPJ|CPF)[\s\S]{0,40}?(?:TOMADOR|PAGADOR)[:\s]*([\d./-]{11,18})/i);
  const cleanTomador = cleanLegalEntityName(mTomador?.[1]);

  if (upper.includes('TOMADOR: REMETENTE') || upper.includes('TOMADOR DO SERVIÇO: REMETENTE') || upper.includes('TOMADOR: 0 - REMETENTE') || upper.includes('0-REMETENTE')) {
    res.tomador = {
      razaoSocial: res.remetente?.razaoSocial || cleanTomador,
      cnpjCpf: res.remetente?.cnpjCpf || mTomadorCnpj?.[1]?.trim(),
      papel: 'Remetente'
    };
  } else if (upper.includes('TOMADOR: DESTINATÁRIO') || upper.includes('TOMADOR: DESTINATARIO') || upper.includes('TOMADOR DO SERVIÇO: DESTINATÁRIO') || upper.includes('3-DESTINATÁRIO')) {
    res.tomador = {
      razaoSocial: res.destinatario?.razaoSocial || cleanTomador,
      cnpjCpf: res.destinatario?.cnpjCpf || mTomadorCnpj?.[1]?.trim(),
      papel: 'Destinatário'
    };
  } else if (cleanTomador || mTomadorCnpj) {
    res.tomador = {
      razaoSocial: cleanTomador,
      cnpjCpf: mTomadorCnpj?.[1]?.trim()
    };
  }

  // 14. Extração Refinada de Cláusulas de Carta Frete / Contrato de Transporte (Layout MaisFrete / e-Frete / NSTECH)
  if (res.documentType === 'Carta Frete') {
    // 1.1 Valor do Frete por Tonelada (ex: "R$ 154,22 por Tonelada")
    const mFreteTon = text.match(/R\$\s*([\d.,]+)\s*(?:por\s+Tonelada|p\/\s*(?:Ton|Tonelada))/i) ||
                      text.match(/([\d.,]+)\s*(?:por\s+Tonelada|p\/\s*(?:Ton|Tonelada))/i);
    if (mFreteTon && mFreteTon[1]) {
      const vTon = parseCurrencyPtBr(mFreteTon[1]);
      if (vTon && vTon > 0) {
        res.financeiro = res.financeiro || {};
        res.financeiro.valorFretePorTonelada = vTon;
      }
    }

    // 1.2 Local de Carregamento (Origem) e Remetente
    const mCarregamento = text.match(/(?:1\.2\s+)?Local\s+de\s+carregamento[:\s]+([^\n;]+?)(?:\s+na\s+cidade\s+de\s+|\s+em\s+)([A-ZÀ-Ú\s]+)\/([A-Z]{2})/i);
    if (mCarregamento) {
      res.remetente = res.remetente || {};
      res.remetente.razaoSocial = mCarregamento[1].trim();
      res.origem = {
        municipio: mCarregamento[2].trim(),
        uf: mCarregamento[3].trim(),
        local: mCarregamento[1].trim()
      };
    }

    // 1.3 Local de Destino / Descarga e Destinatário
    const mDescarga = text.match(/(?:1\.3\s+)?Local\s+de\s+destino(?:\/descarga)?[:\s]+([^\n;]+?)(?:\s+na\s+cidade\s+de\s+|\s+em\s+)([A-ZÀ-Ú\s]+)\/([A-Z]{2})/i);
    if (mDescarga) {
      res.destinatario = res.destinatario || {};
      res.destinatario.razaoSocial = mDescarga[1].trim();
      res.destino = {
        municipio: mDescarga[2].trim(),
        uf: mDescarga[3].trim(),
        local: mDescarga[1].trim()
      };
    }

    // 1.4 Tomador do Serviço do CTe/CTRC
    const mTomadorContrato = text.match(/(?:1\.4\s+)?Tomador\s+(?:do\s+Servi[çc]o)?(?:\s+do\s+CTe\/CTRC)?[:\s]+(?:(?:\d+)\s*\/\s*)?([^\n;]+)/i);
    if (mTomadorContrato && mTomadorContrato[1]) {
      res.tomador = {
        razaoSocial: cleanLegalEntityName(mTomadorContrato[1]),
        papel: 'Tomador'
      };
    }

    // 1.5 Tipo de Mercadoria / Natureza da Carga
    const mMercadoria = text.match(/(?:1\.5\s+)?Tipo\s+de\s+mercadoria[:\s]+([^\n;]+)/i) ||
                        text.match(/NATUREZA\s+DA\s+CARGA[:\s]*(?:(?:\d+)\s*-\s*)?([^\n;]+)/i);
    if (mMercadoria && mMercadoria[1]) {
      res.carga = res.carga || {};
      res.carga.produtoPredominante = mMercadoria[1].replace(/;.*$/, '').trim();
    }

    // 1.6 Peso Embarcado da Mercadoria
    const mPesoEmbarcado = text.match(/(?:1\.6\s+)?Peso\s+embarcado(?:\s+da\s+mercadoria)?[:\s]*([\d.,]+)\s*Kgs?/i);
    if (mPesoEmbarcado && mPesoEmbarcado[1]) {
      const pEmb = parseWeightKg(mPesoEmbarcado[1]);
      if (pEmb && pEmb > 0) {
        res.carga = res.carga || {};
        res.carga.pesoBrutoKg = pEmb;
      }
    }

    // 1.7 Nota(s) Fiscal(is) da Mercadoria
    const mNfsVinculadas = text.match(/(?:1\.7\s+)?Nota\(?s?\)?\s+fiscal\(?is?\)?(?:\s+da\(?s?\)?\s+mercadoria\(?s?\))?[:\s]*([^\n;]+)/i);
    if (mNfsVinculadas && mNfsVinculadas[1]) {
      const rawNfs = mNfsVinculadas[1].trim();
      const splitNfs = rawNfs.split(/[,;\s]+/).map(s => s.trim()).filter(Boolean);
      res.carga = res.carga || {};
      res.carga.notasFiscaisVinculadas = splitNfs;
      res.notasFiscais = splitNfs.map(num => ({ numero: num }));
    }

    // 1.9 Previsão de Descarga
    const mPrevDescarga = text.match(/(?:1\.9\s+)?Data\/Hora\s+prevista\s+para\s+a\s+descarga[:\s]*([^\n;]+)/i);
    if (mPrevDescarga && mPrevDescarga[1]) {
      res.carga = res.carga || {};
      res.carga.previsaoDescarga = mPrevDescarga[1].trim();
    }

    // 2.2 Provedor de Pedágio e Número de Pedido
    const mPedagioTag = text.match(/ped[áa]gio\s+PAGO\s+NO\s+CARTAO\/CUPOM[^\n]*?emitido\s+por\s+([^\n;]+)/i) ||
                        text.match(/(?:emitido\s+por|PROVEDOR[:\s]+)(EFRETE\s+TAG[^\n;]*|Sem\s*Parar|Veloe|ConectCar|MoveMais)/i);
    if (mPedagioTag && mPedagioTag[1]) {
      res.financeiro = res.financeiro || {};
      res.financeiro.provedorPedagio = mPedagioTag[1].trim();
    }
    const mPedidoPedagio = text.match(/(?:NR\.?\s*PEDIDO|N[º°]\s+Pedido\s+Sem\s+Parar|VPO[^\d\n]*?)[:\s]*(\d{8,16})/i);
    if (mPedidoPedagio && mPedidoPedagio[1]) {
      res.financeiro = res.financeiro || {};
      res.financeiro.numeroPedidoPedagio = mPedidoPedagio[1].trim();
    }

    // Pagamento / Chave PIX
    const mPixContrato = text.match(/PIX\s*(?:\([^\)]*\))?[:\s]*([\d./-]{11,18}|\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b)/i) ||
                         text.match(/CPF\/CNPJ\s+CREDITADO[:\s]*([\d./-]{11,18})/i);
    if (mPixContrato && mPixContrato[1]) {
      res.financeiro = res.financeiro || {};
      res.financeiro.chavePix = mPixContrato[1].trim();
    }
    if (upper.includes('EFRETE PIX')) {
      res.financeiro = res.financeiro || {};
      res.financeiro.formaPagamento = 'EFRETE PIX';
    } else if (upper.includes('EFRETE')) {
      res.financeiro = res.financeiro || {};
      res.financeiro.formaPagamento = 'EFRETE';
    }

    // Motorista Contratado
    const mMotoristaContrato = text.match(/representado\s+pelo\s+seu\s+motorista\s+(?:Sr\.?\s*)?([A-ZÀ-Ú\s]{4,40})(?:,|\s+CPF)/i) ||
                               text.match(/INFORMA[ÇC][ÕO]ES\s+DO\s+MOTORISTA[\s\S]{0,60}?NOME\s+([A-ZÀ-Ú\s]{4,40})/i);
    const mCpfMotorista = text.match(/(?:motorista[^\n]*?CPF|INFORMA[ÇC][ÕO]ES\s+DO\s+MOTORISTA[\s\S]{0,60}?CPF)[^\d\n]*?([\d.-]{11,14})/i);
    const mCnhMotorista = text.match(/Nr\.?\s*CNH[^\d\n]*?(\d{8,12})/i);
    const mRgMotorista = text.match(/RG[^\d\n]*?([A-Z0-9.-]{4,15})/i);

    if (mMotoristaContrato || mCpfMotorista || mCnhMotorista) {
      res.motorista = {
        nome: cleanPersonName(mMotoristaContrato?.[1]) || res.motorista?.nome,
        cpf: mCpfMotorista?.[1]?.trim() || res.motorista?.cpf,
        cnh: mCnhMotorista?.[1]?.trim() || res.motorista?.cnh,
        rg: mRgMotorista?.[1]?.trim() || res.motorista?.rg,
      };
    }

    // Veículo e Reboques na Carta Frete
    const allPlacas = Array.from(new Set((text.match(/\b([A-Z]{3}[0-9][0-9A-Z][0-9]{2}|[A-Z]{3}-\d{4})\b/g) || []).map(p => p.replace('-', '').toUpperCase())));
    if (allPlacas.length > 0) {
      res.veiculo = res.veiculo || {};
      res.veiculo.placaTrator = res.veiculo.placaTrator || allPlacas[0];
      if (allPlacas.length > 1) {
        res.veiculo.placasReboque = allPlacas.filter(p => p !== res.veiculo?.placaTrator);
      }
    }
    const mEixos = text.match(/TOTAL\s+DE\s+EIXOS[:\s]*(\d+)/i) || text.match(/EIXOS[:\s]*(\d+)/i);
    if (mEixos && mEixos[1]) {
      res.veiculo = res.veiculo || {};
      res.veiculo.totalEixos = parseInt(mEixos[1], 10);
    }

    // 3.5 Cláusula 3.5: Cálculo do Saldo de Frete
    // 3.5.1 Saldo Original
    const m351 = text.match(/(?:3\.5\.1|3\.5\s+C[ÁA]LCULO[^\n]*?3\.5\.1|Saldo\s+Original)[^\d\n]*?R?\$\s*([\d.,]+)/i);
    const val351 = parseCurrencyPtBr(m351?.[1]);

    // 3.5.2 INSS Retido
    const m352 = text.match(/(?:3\.5\.2|INSS\s+retido)[^\d\n]*?R?\$\s*([\d.,]+)/i);
    const val352 = parseCurrencyPtBr(m352?.[1]);

    // 3.5.3 SEST/SENAT
    const m353 = text.match(/(?:3\.5\.3|SEST\s*[\/-]?\s*SENAT)[^\d\n]*?R?\$\s*([\d.,]+)/i);
    const val353 = parseCurrencyPtBr(m353?.[1]);

    // 3.5.4 IRRF
    const m354 = text.match(/(?:3\.5\.4|Imposto\s+de\s+Renda|IRRF)[^\d\n]*?R?\$\s*([\d.,]+)/i);
    const val354 = parseCurrencyPtBr(m354?.[1]);

    // 3.5.10 Subtotal
    const m3510 = text.match(/(?:3\.5\.10|Subtotal)[^\d\n]*?R?\$\s*([\d.,]+)/i);
    const val3510 = parseCurrencyPtBr(m3510?.[1]);

    // 3.5.11 Pesos
    const m3511Saida = text.match(/(?:3\.5\.11[^\n]*?Peso\s+Sa[íi]da|Peso\s+Sa[íi]da)[:\s]*([\d.,]+)/i);
    const m3511Chegada = text.match(/Peso\s+Chegada[:\s]*([\d.,]+)/i);

    // 3.5.12 Valor Quebra por Kg
    const m3512Kg = text.match(/(?:3\.5\.12|Quebra\s*\/?\s*Avaria)[^\n]*?x\s*R?\$\s*([\d.,]+)/i);
    const val3512Kg = parseCurrencyPtBr(m3512Kg?.[1]);
    if (val3512Kg) {
      res.financeiro = res.financeiro || {};
      res.financeiro.valorKgQuebra = val3512Kg;
    }

    // 3.5.13 Valor Frete Faltante por Kg
    const m3513Kg = text.match(/(?:3\.5\.13|Diferen[çc]a\s+do\s+Frete)[^\n]*?x\s*R?\$\s*([\d.,]+)/i);
    const val3513Kg = parseCurrencyPtBr(m3513Kg?.[1]);
    if (val3513Kg) {
      res.financeiro = res.financeiro || {};
      res.financeiro.valorKgFreteFaltante = val3513Kg;
    }

    // Detecta se é PJ (CNPJ contratado ou indicação de ETC / PJ) ou PF
    const isPj = upper.includes('PESSOA JURÍDICA') ||
                 upper.includes('PESSOA JURIDICA') ||
                 upper.includes('TIPO: PJ') ||
                 upper.includes('TIPO CONTRATADO ETC') ||
                 upper.includes('TIPO CONTRATADO: ETC') ||
                 upper.includes('EQUIPARADO A TAC NÃO') ||
                 upper.includes('EQUIPARADO A TAC: NÃO') ||
                 !!text.match(/CONTRATADO[\s\S]{0,60}?CNPJ[^\d\n]*?\d{2}\.\d{3}\.\d{3}/i);

    const tipoPessoa = isPj ? 'PJ' : 'PF';

    res.calculoSaldoFrete = calculateFreightBalance({
      tipoPessoa,
      freteBruto: res.financeiro?.valorTotalFrete,
      tollValue: res.financeiro?.valorPedagio,
      adiantamento: res.financeiro?.valorAdiantamento,
      saldoOriginal: val351 || res.financeiro?.valorSaldo,
      inssRetido: val352,
      sestSenat: val353,
      irrf: val354,
      pesoSaidaKg: parseWeightKg(m3511Saida?.[1]) || res.carga?.pesoBrutoKg,
      pesoChegadaKg: parseWeightKg(m3511Chegada?.[1]),
      valorKgQuebra: val3512Kg,
      valorKgFreteFaltante: val3513Kg,
    });
  }

  return res;
}

// -------------------------------------------------------------
// EXTRAÇÃO DETALHADA DE XML
// -------------------------------------------------------------

function parseDetailedXml(xmlText: string): DetailedDocumentData | null {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, 'application/xml');
    if (doc.querySelector('parsererror')) return null;

    const rootTag = doc.documentElement?.tagName?.toLowerCase() || '';

    // ================= CT-e =================
    if (rootTag.includes('cte') || rootTag === 'cteproc') {
      const res: DetailedDocumentData = {
        documentType: 'CT-e',
        sourceType: 'xml',
        docNumber: getXmlTagValue(doc, 'nCT'),
        series: getXmlTagValue(doc, 'serie'),
        emissionDate: formatFiscalDateTime(getXmlTagValue(doc, 'dhEmi', 'dEmi')),
        cfop: getXmlTagValue(doc, 'CFOP', 'cfop'),
        naturezaOperacao: getXmlTagValue(doc, 'natOp'),
        protocoloAutorizacao: getXmlTagValue(doc, 'nProt'),
        accessKey: getXmlTagValue(doc, 'chCTe') || doc.getElementsByTagName('infCte')[0]?.getAttribute('Id')?.replace('CTe', '') || undefined,
        emitente: {
          razaoSocial: getXmlTagValue(doc.getElementsByTagName('emit')[0] || doc, 'xNome'),
          nomeFantasia: getXmlTagValue(doc.getElementsByTagName('emit')[0] || doc, 'xFant'),
          cnpjCpf: getXmlTagValue(doc.getElementsByTagName('emit')[0] || doc, 'CNPJ', 'CPF'),
          inscricaoEstadual: getXmlTagValue(doc.getElementsByTagName('emit')[0] || doc, 'IE'),
          municipio: getXmlTagValue(doc.getElementsByTagName('emit')[0] || doc, 'xMun'),
          uf: getXmlTagValue(doc.getElementsByTagName('emit')[0] || doc, 'UF'),
        },
        remetente: {
          razaoSocial: getXmlTagValue(doc.getElementsByTagName('rem')[0] || doc, 'xNome'),
          cnpjCpf: getXmlTagValue(doc.getElementsByTagName('rem')[0] || doc, 'CNPJ', 'CPF'),
          inscricaoEstadual: getXmlTagValue(doc.getElementsByTagName('rem')[0] || doc, 'IE'),
          municipio: getXmlTagValue(doc.getElementsByTagName('rem')[0] || doc, 'xMun'),
          uf: getXmlTagValue(doc.getElementsByTagName('rem')[0] || doc, 'UF'),
        },
        destinatario: {
          razaoSocial: getXmlTagValue(doc.getElementsByTagName('dest')[0] || doc, 'xNome'),
          cnpjCpf: getXmlTagValue(doc.getElementsByTagName('dest')[0] || doc, 'CNPJ', 'CPF'),
          inscricaoEstadual: getXmlTagValue(doc.getElementsByTagName('dest')[0] || doc, 'IE'),
          municipio: getXmlTagValue(doc.getElementsByTagName('dest')[0] || doc, 'xMun'),
          uf: getXmlTagValue(doc.getElementsByTagName('dest')[0] || doc, 'UF'),
        },
        origem: {
          municipio: getXmlTagValue(doc, 'xMunIni'),
          uf: getXmlTagValue(doc, 'UFIni'),
        },
        destino: {
          municipio: getXmlTagValue(doc, 'xMunFim'),
          uf: getXmlTagValue(doc, 'UFFim'),
        },
        veiculo: {
          rntrc: getXmlTagValue(doc, 'RNTRC', 'rntrc'),
          placaTrator: getXmlTagValue(doc, 'placa'),
          ufPlaca: getXmlTagValue(doc.getElementsByTagName('veic')[0] || doc, 'UF'),
        },
        motorista: {
          nome: getXmlTagValue(doc.getElementsByTagName('moto')[0] || doc, 'xNome'),
          cpf: getXmlTagValue(doc.getElementsByTagName('moto')[0] || doc, 'CPF'),
        },
        carga: (() => {
          // Extração precisa do peso do CT-e XML priorizando PESO BRUTO / PESO AFERIDO sobre peso base de cálculo
          let extractedCteWeight: number | undefined;
          const infQEls = doc.getElementsByTagName('infQ');
          let fallbackWeight: number | undefined;

          for (let i = 0; i < infQEls.length; i++) {
            const el = infQEls[i];
            const tpMed = (getXmlTagValue(el, 'tpMed') || '').toUpperCase();
            const cUnid = getXmlTagValue(el, 'cUnid')?.trim();
            const qCargaStr = getXmlTagValue(el, 'qCarga');
            if (!qCargaStr) continue;

            const val = parseFloat(qCargaStr.replace(',', '.'));
            if (isNaN(val) || val <= 0) continue;

            const wKg = (cUnid === '02' || val <= 500) ? Math.round(val * 1000) : val;

            if (tpMed.includes('BRUTO')) {
              extractedCteWeight = wKg;
              break;
            } else if (tpMed.includes('AFERIDO') || tpMed.includes('REAL') || tpMed.includes('LIQUIDO')) {
              if (!extractedCteWeight) extractedCteWeight = wKg;
            } else if (!fallbackWeight && !tpMed.includes('BASE') && !tpMed.includes('BC')) {
              fallbackWeight = wKg;
            } else if (!fallbackWeight) {
              fallbackWeight = wKg;
            }
          }

          if (!extractedCteWeight) {
            extractedCteWeight = fallbackWeight || parseWeightKg(getXmlTagValue(doc, 'pesoB', 'qCarga'));
          }

          return {
            produtoPredominante: getXmlTagValue(doc, 'proPred', 'xOutCat'),
            valorMercadoria: parseCurrencyPtBr(getXmlTagValue(doc, 'vCarga')),
            pesoBrutoKg: extractedCteWeight,
            quantidadeVolumes: parseCurrencyPtBr(getXmlTagValue(doc, 'qVol')),
          };
        })(),
        financeiro: {
          valorTotalFrete: parseCurrencyPtBr(getXmlTagValue(doc, 'vTPrest', 'vRec')),
          valorTotalServico: parseCurrencyPtBr(getXmlTagValue(doc, 'vTPrest')),
          valorReceber: parseCurrencyPtBr(getXmlTagValue(doc, 'vRec')),
          baseCalculoIcms: parseCurrencyPtBr(getXmlTagValue(doc, 'vBC')),
          valorIcms: parseCurrencyPtBr(getXmlTagValue(doc, 'vICMS', 'vIcms')),
          aliquotaIcms: parseCurrencyPtBr(getXmlTagValue(doc, 'pICMS', 'pIcms')),
          valorPis: parseCurrencyPtBr(getXmlTagValue(doc, 'vPIS', 'vPis')),
          aliquotaPis: parseCurrencyPtBr(getXmlTagValue(doc, 'pPIS', 'pPis')),
          valorCofins: parseCurrencyPtBr(getXmlTagValue(doc, 'vCOFINS', 'vCofins')),
          aliquotaCofins: parseCurrencyPtBr(getXmlTagValue(doc, 'pCOFINS', 'pCofins')),
          valorPisCofinsFederal: (
            (parseCurrencyPtBr(getXmlTagValue(doc, 'vPIS', 'vPis')) || 0) +
            (parseCurrencyPtBr(getXmlTagValue(doc, 'vCOFINS', 'vCofins')) || 0)
          ) || undefined,
          valorTributosFederais: parseCurrencyPtBr(getXmlTagValue(doc, 'vTotTrib', 'vTribFed')),
          valorPedagio: (() => {
            const val = parseCurrencyPtBr(getXmlTagValue(doc, 'vPed', 'vValePed'));
            return (val !== undefined && val >= 0 && val <= 25000) ? val : undefined;
          })(),
        },
        seguro: {
          nomeSeguradora: getXmlTagValue(doc, 'xSeg'),
          numeroApolice: getXmlTagValue(doc, 'nApol'),
          numeroAverbacao: getXmlTagValue(doc, 'nAver'),
          responsavelSeguro: getXmlTagValue(doc, 'respSeg'),
        },
        observacoesFiscais: [
          getXmlTagValue(doc, 'infAdFisco'),
          getXmlTagValue(doc, 'infCpl'),
          getXmlTagValue(doc, 'xObs')
        ].filter(Boolean).join(' | ') || undefined,
      };

      // Identificação oficial do Tomador do Serviço no CT-e XML
      const tomaTag = getXmlTagValue(doc, 'toma');
      const toma4El = doc.getElementsByTagName('toma4')[0] || doc.getElementsByTagName('toma04')[0];
      if (toma4El) {
        res.tomador = {
          razaoSocial: getXmlTagValue(toma4El, 'xNome'),
          cnpjCpf: getXmlTagValue(toma4El, 'CNPJ', 'CPF'),
          papel: 'Outros'
        };
      } else if (tomaTag === '0') {
        res.tomador = {
          razaoSocial: res.remetente?.razaoSocial,
          cnpjCpf: res.remetente?.cnpjCpf,
          papel: 'Remetente'
        };
      } else if (tomaTag === '3') {
        res.tomador = {
          razaoSocial: res.destinatario?.razaoSocial,
          cnpjCpf: res.destinatario?.cnpjCpf,
          papel: 'Destinatário'
        };
      } else if (tomaTag === '1') {
        const expedEl = doc.getElementsByTagName('exped')[0];
        res.tomador = {
          razaoSocial: expedEl ? getXmlTagValue(expedEl, 'xNome') : undefined,
          cnpjCpf: expedEl ? getXmlTagValue(expedEl, 'CNPJ', 'CPF') : undefined,
          papel: 'Expedidor'
        };
      } else if (tomaTag === '2') {
        const recebEl = doc.getElementsByTagName('receb')[0];
        res.tomador = {
          razaoSocial: recebEl ? getXmlTagValue(recebEl, 'xNome') : undefined,
          cnpjCpf: recebEl ? getXmlTagValue(recebEl, 'CNPJ', 'CPF') : undefined,
          papel: 'Recebedor'
        };
      } else if (res.remetente?.cnpjCpf) {
        res.tomador = {
          razaoSocial: res.remetente.razaoSocial,
          cnpjCpf: res.remetente.cnpjCpf,
          papel: 'Remetente'
        };
      }

      const allObsText = res.observacoesFiscais || '';
      const matchSusp = allObsText.match(/(?:impostos?\s+suspensos?|suspens[aã]o(?:\s+tribut[aá]ria)?)\s*:\s*(\d+(?:[.,]\d+)?)\s*%/i);
      if (matchSusp) {
        res.suspensaoPercentual = parseFloat(matchSusp[1].replace(',', '.'));
      }

      // Documentos vinculados (ex: NFe vinculada ao CTe)
      const chNFeEls = doc.getElementsByTagName('chNFe');
      if (chNFeEls.length > 0) {
        res.documentosVinculados = [];
        for (let i = 0; i < chNFeEls.length; i++) {
          const ch = chNFeEls[i].textContent?.trim();
          if (ch) {
            res.documentosVinculados.push({ tipo: 'NF-e', chaveAcesso: ch });
          }
        }
      }

      return res;
    }

    // ================= MDF-e =================
    if (rootTag.includes('mdfe') || rootTag.includes('mdfeproc')) {
      const res: DetailedDocumentData = {
        documentType: 'MDF-e',
        sourceType: 'xml',
        docNumber: getXmlTagValue(doc, 'nMDF'),
        series: getXmlTagValue(doc, 'serie'),
        emissionDate: formatFiscalDateTime(getXmlTagValue(doc, 'dhEmi', 'dEmi')),
        protocoloAutorizacao: getXmlTagValue(doc, 'nProt'),
        accessKey: getXmlTagValue(doc, 'chMDFe') || doc.getElementsByTagName('infMDFe')[0]?.getAttribute('Id')?.replace('MDFe', '') || undefined,
        origem: {
          uf: getXmlTagValue(doc, 'UFIni', 'ufIni'),
        },
        destino: {
          uf: getXmlTagValue(doc, 'UFFim', 'ufFim'),
        },
        emitente: {
          razaoSocial: getXmlTagValue(doc.getElementsByTagName('emit')[0] || doc, 'xNome'),
          nomeFantasia: getXmlTagValue(doc.getElementsByTagName('emit')[0] || doc, 'xFant'),
          cnpjCpf: getXmlTagValue(doc.getElementsByTagName('emit')[0] || doc, 'CNPJ', 'CPF'),
          inscricaoEstadual: getXmlTagValue(doc.getElementsByTagName('emit')[0] || doc, 'IE'),
          municipio: getXmlTagValue(doc.getElementsByTagName('emit')[0] || doc, 'xMun'),
          uf: getXmlTagValue(doc.getElementsByTagName('emit')[0] || doc, 'UF'),
        },
        veiculo: {
          placaTrator: getXmlTagValue(doc.getElementsByTagName('veicTracao')[0] || doc, 'placa'),
          rntrc: getXmlTagValue(doc, 'RNTRC', 'rntrc'),
          ufPlaca: getXmlTagValue(doc.getElementsByTagName('veicTracao')[0] || doc, 'UF'),
        },
        motorista: {
          nome: getXmlTagValue(doc.getElementsByTagName('condutor')[0] || doc, 'xNome'),
          cpf: getXmlTagValue(doc.getElementsByTagName('condutor')[0] || doc, 'CPF'),
        },
        carga: {
          valorMercadoria: parseCurrencyPtBr(getXmlTagValue(doc, 'vCarga')),
          pesoBrutoKg: parseWeightKg(getXmlTagValue(doc, 'qCarga')),
          quantidadeVolumes: parseCurrencyPtBr(getXmlTagValue(doc, 'qCTe', 'qNFe', 'qMDFe')),
        },
        seguro: {
          nomeSeguradora: getXmlTagValue(doc, 'xSeg'),
          numeroApolice: getXmlTagValue(doc, 'nApol'),
          numeroAverbacao: getXmlTagValue(doc, 'nAver'),
        },
        ciot: getXmlTagValue(doc, 'CIOT', 'ciot'),
      };

      // Placas de reboque
      const veicReboqueEls = doc.getElementsByTagName('veicReboque');
      if (veicReboqueEls.length > 0) {
        res.veiculo = res.veiculo || {};
        res.veiculo.placasReboque = [];
        for (let i = 0; i < veicReboqueEls.length; i++) {
          const placa = getXmlTagValue(veicReboqueEls[i], 'placa');
          if (placa) res.veiculo.placasReboque.push(placa);
        }
      }

      return res;
    }

    // ================= NF-e =================
    if (rootTag.includes('nfe') || rootTag.includes('nfproc')) {
      const res: DetailedDocumentData = {
        documentType: 'Nota Fiscal',
        sourceType: 'xml',
        docNumber: getXmlTagValue(doc, 'nNF'),
        series: getXmlTagValue(doc, 'serie'),
        emissionDate: formatFiscalDateTime(getXmlTagValue(doc, 'dhEmi', 'dEmi')),
        naturezaOperacao: getXmlTagValue(doc, 'natOp'),
        protocoloAutorizacao: getXmlTagValue(doc, 'nProt'),
        accessKey: getXmlTagValue(doc, 'chNFe') || doc.getElementsByTagName('infNFe')[0]?.getAttribute('Id')?.replace('NFe', '') || undefined,
        emitente: {
          razaoSocial: getXmlTagValue(doc.getElementsByTagName('emit')[0] || doc, 'xNome'),
          nomeFantasia: getXmlTagValue(doc.getElementsByTagName('emit')[0] || doc, 'xFant'),
          cnpjCpf: getXmlTagValue(doc.getElementsByTagName('emit')[0] || doc, 'CNPJ', 'CPF'),
          inscricaoEstadual: getXmlTagValue(doc.getElementsByTagName('emit')[0] || doc, 'IE'),
          municipio: getXmlTagValue(doc.getElementsByTagName('emit')[0] || doc, 'xMun'),
          uf: getXmlTagValue(doc.getElementsByTagName('emit')[0] || doc, 'UF'),
        },
        destinatario: {
          razaoSocial: getXmlTagValue(doc.getElementsByTagName('dest')[0] || doc, 'xNome'),
          cnpjCpf: getXmlTagValue(doc.getElementsByTagName('dest')[0] || doc, 'CNPJ', 'CPF'),
          inscricaoEstadual: getXmlTagValue(doc.getElementsByTagName('dest')[0] || doc, 'IE'),
          municipio: getXmlTagValue(doc.getElementsByTagName('dest')[0] || doc, 'xMun'),
          uf: getXmlTagValue(doc.getElementsByTagName('dest')[0] || doc, 'UF'),
        },
        carga: {
          valorMercadoria: parseCurrencyPtBr(getXmlTagValue(doc, 'vProd', 'vNF')),
          pesoBrutoKg: parseWeightKg(getXmlTagValue(doc, 'pesoB')),
          pesoLiquidoKg: parseWeightKg(getXmlTagValue(doc, 'pesoL')),
          quantidadeVolumes: parseCurrencyPtBr(getXmlTagValue(doc, 'qVol')),
          especie: getXmlTagValue(doc, 'esp'),
        },
        financeiro: {
          valorTotalFrete: parseCurrencyPtBr(getXmlTagValue(doc, 'vFrete')),
          baseCalculoIcms: parseCurrencyPtBr(getXmlTagValue(doc, 'vBC')),
          valorIcms: parseCurrencyPtBr(getXmlTagValue(doc, 'vICMS')),
        },
        veiculo: {
          placaTrator: getXmlTagValue(doc.getElementsByTagName('transporta')[0] || doc, 'placa'),
          rntrc: getXmlTagValue(doc.getElementsByTagName('transporta')[0] || doc, 'RNTRC'),
        }
      };

      return res;
    }
  } catch (e) {
    console.warn('[fiscalDocParser] Error in parseDetailedXml:', e);
  }
  return null;
}

/**
 * Função principal para extrair todos os dados estruturados de um arquivo ou URL.
 */
export async function extractDetailedDocData(
  input: File | string,
  declaredDocType: string = ''
): Promise<DetailedDocumentData> {
  try {
    let text = '';
    let isXml = false;
    let fileName = '';

    if (typeof input === 'string') {
      // É uma URL
      fileName = input.split('/').pop()?.split('?')[0] || '';
      const response = await fetch(input);
      if (!response.ok) {
        throw new Error(`Falha ao carregar documento da URL (HTTP ${response.status})`);
      }
      const buffer = await response.arrayBuffer();
      const urlLower = input.toLowerCase();
      const isPdf = urlLower.includes('.pdf');

      const decoder = new TextDecoder('utf-8');
      const rawHead = decoder.decode(buffer.slice(0, 100));
      isXml = urlLower.endsWith('.xml') || rawHead.trimStart().startsWith('<');

      if (isPdf || rawHead.includes('%PDF')) {
        text = await extractTextFromPdfBuffer(buffer);
      } else {
        text = decoder.decode(buffer);
      }
    } else {
      // É um File do navegador
      fileName = input.name;
      const fileNameLower = input.name.toLowerCase();
      const isPdf = fileNameLower.endsWith('.pdf') || input.type.includes('pdf');
      isXml = fileNameLower.endsWith('.xml') || input.type.includes('xml');

      if (isPdf) {
        const buffer = await input.arrayBuffer();
        text = await extractTextFromPdfBuffer(buffer);
      } else {
        text = await readFileAsText(input);
      }
    }

    const isXmlText = isXml || text.trimStart().startsWith('<');
    if (isXmlText) {
      const xmlResult = parseDetailedXml(text);
      if (xmlResult) {
        xmlResult.rawText = text;
        return xmlResult;
      }
    }

    const detailed = parseDetailedText(text, declaredDocType || fileName);
    return detailed;
  } catch (error: any) {
    console.warn('[fiscalDocParser] Erro em extractDetailedDocData:', error);
    return {
      documentType: 'Outro',
      sourceType: 'text',
      rawText: `Não foi possível extrair dados automaticamente: ${error?.message || error}`
    };
  }
}

// -------------------------------------------------------------
// COMPATIBILIDADE COM CÓDIGO EXISTENTE
// -------------------------------------------------------------

export interface FiscalDocNumbers {
  cteNumber?: string;
  cteEmissionDate?: string;
  cteWeightKg?: number;
  cteTotalServiceValue?: number;
  subCtes?: SubCteRecord[];
  nfeNumber?: string;
  nfeValue?: number;
  mdfeNumber?: string;
  ciotNumber?: string;
  advancePercentage?: number;
  advanceValue?: number;
  tollValue?: number;
  totalFreightValue?: number;
  driverFreightValue?: number;
  icmsValue?: number;
  sestSenatValue?: number;
  inssRetidoValue?: number;
  subtotalSaldoValue?: number;
  ordemCarregamentoNumero?: string;
  cteTomadorNome?: string;
  cteTomadorCnpj?: string;
  cteRemetente?: string;
  cartaFreteDocNumber?: string;
  pixKey?: string;
  loadedTonnage?: number;
  driverFreightRatePerTon?: number;
  valorKgQuebra?: number;
  valorKgFreteFaltante?: number;
  driverName?: string;
  driverCpf?: string;
  driverCnh?: string;
  truckPlate?: string;
  trailerPlates?: string[];
  carrierRntrc?: string;
}

export async function extractFiscalDocNumbers(
  filesToAttach: { [docType: string]: File[] }
): Promise<FiscalDocNumbers> {
  const result: FiscalDocNumbers = {};
  const extractedSubCtes: SubCteRecord[] = [];

  const docTypes = Object.keys(filesToAttach);
  for (const docType of docTypes) {
    const files = filesToAttach[docType];
    if (!Array.isArray(files) || files.length === 0) continue;

    for (const file of files) {
      try {
        const detailed = await extractDetailedDocData(file, docType);
        
        const isCteField = isCteDocType(docType);
        const isCartaFreteField = isCartaFreteDocType(docType);

        const isCteDoc = (isCteField || detailed.documentType === 'CT-e') && !isCartaFreteField && detailed.documentType !== 'MDF-e';
        if (isCteDoc) {
          const numStr = detailed.docNumber ? String(detailed.docNumber).trim() : '';
          const singleWeightKg = detailed.carga?.pesoBrutoKg !== undefined
            ? detailed.carga.pesoBrutoKg
            : detailed.carga?.pesoLiquidoKg;
          const singleWeightTon = (singleWeightKg !== undefined && singleWeightKg > 0)
            ? (singleWeightKg >= 1000 ? Number((singleWeightKg / 1000).toFixed(3)) : singleWeightKg)
            : undefined;
          const singleServiceVal = detailed.financeiro?.valorTotalServico !== undefined
            ? detailed.financeiro.valorTotalServico
            : detailed.financeiro?.valorTotalFrete;
          const singleIcms = detailed.financeiro?.valorIcms || 0;
          const singleToll = detailed.financeiro?.valorPedagio || 0;

          if (numStr) {
            const existingIdx = extractedSubCtes.findIndex(c => c.cteNumber === numStr);
            if (existingIdx >= 0) {
              extractedSubCtes[existingIdx] = {
                ...extractedSubCtes[existingIdx],
                weight: singleWeightTon ?? extractedSubCtes[existingIdx].weight,
                weightKg: singleWeightKg ?? extractedSubCtes[existingIdx].weightKg,
                companyFreight: singleServiceVal ?? extractedSubCtes[existingIdx].companyFreight,
                icms: singleIcms || extractedSubCtes[existingIdx].icms,
                toll: singleToll || extractedSubCtes[existingIdx].toll,
                emissionDate: detailed.emissionDate || extractedSubCtes[existingIdx].emissionDate,
                tomadorNome: detailed.tomador?.razaoSocial || extractedSubCtes[existingIdx].tomadorNome,
                tomadorCnpj: detailed.tomador?.cnpjCpf || extractedSubCtes[existingIdx].tomadorCnpj,
                remetente: (detailed.remetente?.razaoSocial || detailed.remetente?.cnpjCpf) || extractedSubCtes[existingIdx].remetente,
              };
            } else {
              extractedSubCtes.push({
                cteNumber: numStr,
                weight: singleWeightTon,
                weightKg: singleWeightKg,
                companyFreight: singleServiceVal,
                icms: singleIcms,
                toll: singleToll,
                emissionDate: detailed.emissionDate,
                fileName: file.name,
                tomadorNome: detailed.tomador?.razaoSocial,
                tomadorCnpj: detailed.tomador?.cnpjCpf,
                remetente: detailed.remetente?.razaoSocial || detailed.remetente?.cnpjCpf,
              });
            }
          }

          if (detailed.docNumber && !result.cteNumber) result.cteNumber = detailed.docNumber;
          if (detailed.emissionDate && !result.cteEmissionDate) result.cteEmissionDate = detailed.emissionDate;
          if (detailed.carga?.pesoBrutoKg !== undefined && !result.cteWeightKg) {
            result.cteWeightKg = detailed.carga.pesoBrutoKg;
          } else if (detailed.carga?.pesoLiquidoKg !== undefined && !result.cteWeightKg) {
            result.cteWeightKg = detailed.carga.pesoLiquidoKg;
          }
          if (detailed.financeiro?.valorIcms !== undefined && result.icmsValue === undefined) {
            result.icmsValue = detailed.financeiro.valorIcms;
          }
          const cteServiceVal = detailed.financeiro?.valorTotalServico !== undefined
            ? detailed.financeiro.valorTotalServico
            : detailed.financeiro?.valorTotalFrete;
          if (cteServiceVal !== undefined && result.cteTotalServiceValue === undefined) {
            result.cteTotalServiceValue = cteServiceVal;
          }
          if (detailed.tomador) {
            if (detailed.tomador.razaoSocial && !result.cteTomadorNome) result.cteTomadorNome = detailed.tomador.razaoSocial;
            if (detailed.tomador.cnpjCpf && !result.cteTomadorCnpj) result.cteTomadorCnpj = detailed.tomador.cnpjCpf;
          }
          if (detailed.remetente && !result.cteRemetente) {
            result.cteRemetente = detailed.remetente.razaoSocial || detailed.remetente.cnpjCpf || '';
          }
        }
        const isCartaFreteDoc = (isCartaFreteField || detailed.documentType === 'Carta Frete') && !isCteField && detailed.documentType !== 'MDF-e' && detailed.documentType !== 'CT-e' && detailed.documentType !== 'Nota Fiscal';
        if (isCartaFreteDoc) {
          const rawFreight = detailed.financeiro?.valorTotalFrete !== undefined ? detailed.financeiro.valorTotalFrete : detailed.financeiro?.valorLiquido;
          const toll = detailed.financeiro?.valorPedagio !== undefined ? detailed.financeiro.valorPedagio : (result.tollValue || 0);
          const advance = detailed.financeiro?.valorAdiantamento !== undefined ? detailed.financeiro.valorAdiantamento : result.advanceValue;
          const advancePct = detailed.financeiro?.porcentagemAdiantamento !== undefined ? detailed.financeiro.porcentagemAdiantamento : result.advancePercentage;
          const saldo = detailed.financeiro?.valorSaldo || detailed.calculoSaldoFrete?.saldoOriginal || detailed.calculoSaldoFrete?.subtotal || result.subtotalSaldoValue;

          // Frete motorista configurado para considerar sempre o valor sem o pedágio
          const netDriverFreight = calculateNetCartaFreteFreight({
            rawFreight,
            toll,
            advance,
            advancePercentage: advancePct,
            saldo,
          });

          if (netDriverFreight !== undefined && result.driverFreightValue === undefined) {
            result.driverFreightValue = netDriverFreight;
          }

          if (detailed.docNumber && !result.cartaFreteDocNumber) {
            result.cartaFreteDocNumber = detailed.docNumber;
          }
          if (detailed.carga?.pesoBrutoKg && !result.loadedTonnage) {
            result.loadedTonnage = Number((detailed.carga.pesoBrutoKg / 1000).toFixed(3));
          }
          if (detailed.financeiro?.valorFretePorTonelada && !result.driverFreightRatePerTon) {
            result.driverFreightRatePerTon = detailed.financeiro.valorFretePorTonelada;
          }
          if (detailed.financeiro?.chavePix && !result.pixKey) {
            result.pixKey = detailed.financeiro.chavePix;
          }
          if (detailed.motorista?.nome && !result.driverName) {
            result.driverName = detailed.motorista.nome;
          }
          if (detailed.motorista?.cpf && !result.driverCpf) {
            result.driverCpf = detailed.motorista.cpf;
          }
          if (detailed.motorista?.cnh && !result.driverCnh) {
            result.driverCnh = detailed.motorista.cnh;
          }
          if (detailed.veiculo?.placaTrator && !result.truckPlate) {
            result.truckPlate = detailed.veiculo.placaTrator;
          }
          if (detailed.veiculo?.placasReboque && (!result.trailerPlates || result.trailerPlates.length === 0)) {
            result.trailerPlates = detailed.veiculo.placasReboque;
          }
          if (detailed.veiculo?.rntrc && !result.carrierRntrc) {
            result.carrierRntrc = detailed.veiculo.rntrc;
          }
          if (detailed.calculoSaldoFrete?.valorKgQuebra && !result.valorKgQuebra) {
            result.valorKgQuebra = detailed.calculoSaldoFrete.valorKgQuebra;
          }
          if (detailed.calculoSaldoFrete?.valorKgFreteFaltante && !result.valorKgFreteFaltante) {
            result.valorKgFreteFaltante = detailed.calculoSaldoFrete.valorKgFreteFaltante;
          }
        }
        if (isStrictNotaFiscalCategory(docType)) {
          if (detailed.docNumber) {
            if (!result.nfeNumber) {
              result.nfeNumber = detailed.docNumber;
            } else if (!result.nfeNumber.includes(detailed.docNumber)) {
              result.nfeNumber = `${result.nfeNumber}, ${detailed.docNumber}`;
            }
          }
        }
        const isMdfe = detailed.documentType === 'MDF-e' || (isMdfeDocType(docType) && detailed.documentType !== 'CT-e' && detailed.documentType !== 'Carta Frete');
        if (isMdfe) {
          if (detailed.docNumber && !result.mdfeNumber) result.mdfeNumber = detailed.docNumber;
          if (detailed.ciot) {
            result.ciotNumber = detailed.ciot;
          }
        }
        if (detailed.ciot && !result.ciotNumber) {
          result.ciotNumber = detailed.ciot;
        } else if ((detailed.documentType === 'CIOT' || docType.toUpperCase().includes('CIOT')) && detailed.docNumber && !result.ciotNumber) {
          result.ciotNumber = detailed.docNumber;
        }
        if (detailed.carga?.valorMercadoria !== undefined && detailed.carga.valorMercadoria > 0) {
          if (detailed.documentType === 'CT-e' || detailed.documentType === 'MDF-e') {
            result.nfeValue = detailed.carga.valorMercadoria;
          } else if (isStrictNotaFiscalCategory(docType)) {
            if (result.nfeValue === undefined) {
              result.nfeValue = detailed.carga.valorMercadoria;
            } else {
              result.nfeValue = Number((result.nfeValue + detailed.carga.valorMercadoria).toFixed(2));
            }
          }
        }
        if (docType.toLowerCase().includes('ordem') || docType.toLowerCase().includes('oc')) {
          if (detailed.rawText) {
            const ocNum = extractOcNumberFromText(detailed.rawText);
            if (ocNum && !result.ordemCarregamentoNumero) {
              result.ordemCarregamentoNumero = ocNum;
            }
          }
        }
        const isPureNfe = (detailed.documentType === 'Nota Fiscal' || isNfeDocType(docType) || docType.toLowerCase().includes('ticket') || docType.toLowerCase().includes('carregamento') || docType.toLowerCase().includes('comprovante')) && !isCteDocType(docType) && !isMdfeDocType(docType) && !isCartaFreteDocType(docType);
        if (!isPureNfe) {
          if (detailed.financeiro?.valorPedagio !== undefined && result.tollValue === undefined) {
            result.tollValue = detailed.financeiro.valorPedagio;
          }
          if (detailed.financeiro?.valorAdiantamento !== undefined && result.advanceValue === undefined) {
            result.advanceValue = detailed.financeiro.valorAdiantamento;
          }
          if (detailed.financeiro?.valorTotalFrete !== undefined && result.totalFreightValue === undefined) {
            result.totalFreightValue = detailed.financeiro.valorTotalFrete;
          }
          if (detailed.financeiro?.porcentagemAdiantamento !== undefined && result.advancePercentage === undefined) {
            result.advancePercentage = detailed.financeiro.porcentagemAdiantamento;
          }
          if (detailed.calculoSaldoFrete?.sestSenat !== undefined && result.sestSenatValue === undefined) {
            result.sestSenatValue = detailed.calculoSaldoFrete.sestSenat;
          }
          if (detailed.calculoSaldoFrete?.inssRetido !== undefined && result.inssRetidoValue === undefined) {
            result.inssRetidoValue = detailed.calculoSaldoFrete.inssRetido;
          }
          if (detailed.calculoSaldoFrete?.subtotal !== undefined && result.subtotalSaldoValue === undefined) {
            result.subtotalSaldoValue = detailed.calculoSaldoFrete.subtotal;
          }
        }
      } catch (e) {
        console.warn(`[fiscalDocParser] Could not read file "${file.name}":`, e);
      }
    }
  }

  if (extractedSubCtes.length > 0) {
    result.subCtes = extractedSubCtes;
    if (extractedSubCtes.length > 1) {
      result.cteNumber = extractedSubCtes.map(c => c.cteNumber).filter(Boolean).join('/');
      const totalWeightKg = extractedSubCtes.reduce((sum, c) => sum + (c.weightKg || (c.weight ? c.weight * 1000 : 0)), 0);
      if (totalWeightKg > 0) {
        result.cteWeightKg = totalWeightKg;
      }
      const totalServiceVal = extractedSubCtes.reduce((sum, c) => sum + (c.companyFreight || 0), 0);
      if (totalServiceVal > 0) {
        result.cteTotalServiceValue = totalServiceVal;
      }
      const totalIcms = extractedSubCtes.reduce((sum, c) => sum + (c.icms || 0), 0);
      if (totalIcms > 0) {
        result.icmsValue = totalIcms;
      }
    }
  }

  console.log('[fiscalDocParser] Extracted fiscal and contract numbers:', result);
  return result;
}

export async function extractFiscalDocNumbersFromUrls(
  docsByType: { [docType: string]: string[] }
): Promise<FiscalDocNumbers> {
  const result: FiscalDocNumbers = {};
  const extractedSubCtes: SubCteRecord[] = [];

  for (const [docType, urls] of Object.entries(docsByType)) {
    if (!Array.isArray(urls) || urls.length === 0) continue;

    for (const url of urls) {
      try {
        const detailed = await extractDetailedDocData(url, docType);
        const isCteField = isCteDocType(docType);
        const isCartaFreteField = isCartaFreteDocType(docType);

        const isCteDoc = (isCteField || detailed.documentType === 'CT-e') && !isCartaFreteField && detailed.documentType !== 'MDF-e';
        if (isCteDoc) {
          const numStr = detailed.docNumber ? String(detailed.docNumber).trim() : '';
          const singleWeightKg = detailed.carga?.pesoBrutoKg !== undefined
            ? detailed.carga.pesoBrutoKg
            : detailed.carga?.pesoLiquidoKg;
          const singleWeightTon = (singleWeightKg !== undefined && singleWeightKg > 0)
            ? (singleWeightKg >= 1000 ? Number((singleWeightKg / 1000).toFixed(3)) : singleWeightKg)
            : undefined;
          const singleServiceVal = detailed.financeiro?.valorTotalServico !== undefined
            ? detailed.financeiro.valorTotalServico
            : detailed.financeiro?.valorTotalFrete;
          const singleIcms = detailed.financeiro?.valorIcms || 0;
          const singleToll = detailed.financeiro?.valorPedagio || 0;

          if (numStr) {
            const existingIdx = extractedSubCtes.findIndex(c => c.cteNumber === numStr);
            if (existingIdx >= 0) {
              extractedSubCtes[existingIdx] = {
                ...extractedSubCtes[existingIdx],
                weight: singleWeightTon ?? extractedSubCtes[existingIdx].weight,
                weightKg: singleWeightKg ?? extractedSubCtes[existingIdx].weightKg,
                companyFreight: singleServiceVal ?? extractedSubCtes[existingIdx].companyFreight,
                icms: singleIcms || extractedSubCtes[existingIdx].icms,
                toll: singleToll || extractedSubCtes[existingIdx].toll,
                emissionDate: detailed.emissionDate || extractedSubCtes[existingIdx].emissionDate,
                fileUrl: url,
                fileName: url.split('/').pop()?.split('?')[0],
                tomadorNome: detailed.tomador?.razaoSocial || extractedSubCtes[existingIdx].tomadorNome,
                tomadorCnpj: detailed.tomador?.cnpjCpf || extractedSubCtes[existingIdx].tomadorCnpj,
                remetente: (detailed.remetente?.razaoSocial || detailed.remetente?.cnpjCpf) || extractedSubCtes[existingIdx].remetente,
              };
            } else {
              extractedSubCtes.push({
                cteNumber: numStr,
                weight: singleWeightTon,
                weightKg: singleWeightKg,
                companyFreight: singleServiceVal,
                icms: singleIcms,
                toll: singleToll,
                emissionDate: detailed.emissionDate,
                fileUrl: url,
                fileName: url.split('/').pop()?.split('?')[0],
                tomadorNome: detailed.tomador?.razaoSocial,
                tomadorCnpj: detailed.tomador?.cnpjCpf,
                remetente: detailed.remetente?.razaoSocial || detailed.remetente?.cnpjCpf,
              });
            }
          }

          if (detailed.docNumber && !result.cteNumber) result.cteNumber = detailed.docNumber;
          if (detailed.emissionDate && !result.cteEmissionDate) result.cteEmissionDate = detailed.emissionDate;
          if (detailed.carga?.pesoBrutoKg !== undefined && !result.cteWeightKg) {
            result.cteWeightKg = detailed.carga.pesoBrutoKg;
          } else if (detailed.carga?.pesoLiquidoKg !== undefined && !result.cteWeightKg) {
            result.cteWeightKg = detailed.carga.pesoLiquidoKg;
          }
          if (detailed.financeiro?.valorIcms !== undefined && result.icmsValue === undefined) {
            result.icmsValue = detailed.financeiro.valorIcms;
          }
          const cteServiceVal = detailed.financeiro?.valorTotalServico !== undefined
            ? detailed.financeiro.valorTotalServico
            : detailed.financeiro?.valorTotalFrete;
          if (cteServiceVal !== undefined && result.cteTotalServiceValue === undefined) {
            result.cteTotalServiceValue = cteServiceVal;
          }
          if (detailed.tomador) {
            if (detailed.tomador.razaoSocial && !result.cteTomadorNome) result.cteTomadorNome = detailed.tomador.razaoSocial;
            if (detailed.tomador.cnpjCpf && !result.cteTomadorCnpj) result.cteTomadorCnpj = detailed.tomador.cnpjCpf;
          }
          if (detailed.remetente && !result.cteRemetente) {
            result.cteRemetente = detailed.remetente.razaoSocial || detailed.remetente.cnpjCpf || '';
          }
        }
        const isCartaFreteDoc = (isCartaFreteField || detailed.documentType === 'Carta Frete') && !isCteField && detailed.documentType !== 'MDF-e' && detailed.documentType !== 'CT-e' && detailed.documentType !== 'Nota Fiscal';
        if (isCartaFreteDoc) {
          const rawFreight = detailed.financeiro?.valorTotalFrete !== undefined ? detailed.financeiro.valorTotalFrete : detailed.financeiro?.valorLiquido;
          const toll = detailed.financeiro?.valorPedagio !== undefined ? detailed.financeiro.valorPedagio : (result.tollValue || 0);
          const advance = detailed.financeiro?.valorAdiantamento !== undefined ? detailed.financeiro.valorAdiantamento : result.advanceValue;
          const advancePct = detailed.financeiro?.porcentagemAdiantamento !== undefined ? detailed.financeiro.porcentagemAdiantamento : result.advancePercentage;
          const saldo = detailed.financeiro?.valorSaldo || detailed.calculoSaldoFrete?.saldoOriginal || detailed.calculoSaldoFrete?.subtotal || result.subtotalSaldoValue;

          // Frete motorista configurado para considerar sempre o valor sem o pedágio
          const netDriverFreight = calculateNetCartaFreteFreight({
            rawFreight,
            toll,
            advance,
            advancePercentage: advancePct,
            saldo,
          });

          if (netDriverFreight !== undefined && result.driverFreightValue === undefined) {
            result.driverFreightValue = netDriverFreight;
          }

          if (detailed.docNumber && !result.cartaFreteDocNumber) {
            result.cartaFreteDocNumber = detailed.docNumber;
          }
          if (detailed.carga?.pesoBrutoKg && !result.loadedTonnage) {
            result.loadedTonnage = Number((detailed.carga.pesoBrutoKg / 1000).toFixed(3));
          }
          if (detailed.financeiro?.valorFretePorTonelada && !result.driverFreightRatePerTon) {
            result.driverFreightRatePerTon = detailed.financeiro.valorFretePorTonelada;
          }
          if (detailed.financeiro?.chavePix && !result.pixKey) {
            result.pixKey = detailed.financeiro.chavePix;
          }
          if (detailed.motorista?.nome && !result.driverName) {
            result.driverName = detailed.motorista.nome;
          }
          if (detailed.motorista?.cpf && !result.driverCpf) {
            result.driverCpf = detailed.motorista.cpf;
          }
          if (detailed.motorista?.cnh && !result.driverCnh) {
            result.driverCnh = detailed.motorista.cnh;
          }
          if (detailed.veiculo?.placaTrator && !result.truckPlate) {
            result.truckPlate = detailed.veiculo.placaTrator;
          }
          if (detailed.veiculo?.placasReboque && (!result.trailerPlates || result.trailerPlates.length === 0)) {
            result.trailerPlates = detailed.veiculo.placasReboque;
          }
          if (detailed.veiculo?.rntrc && !result.carrierRntrc) {
            result.carrierRntrc = detailed.veiculo.rntrc;
          }
          if (detailed.calculoSaldoFrete?.valorKgQuebra && !result.valorKgQuebra) {
            result.valorKgQuebra = detailed.calculoSaldoFrete.valorKgQuebra;
          }
          if (detailed.calculoSaldoFrete?.valorKgFreteFaltante && !result.valorKgFreteFaltante) {
            result.valorKgFreteFaltante = detailed.calculoSaldoFrete.valorKgFreteFaltante;
          }
        }
        if (isStrictNotaFiscalCategory(docType)) {
          if (detailed.docNumber) {
            if (!result.nfeNumber) {
              result.nfeNumber = detailed.docNumber;
            } else if (!result.nfeNumber.includes(detailed.docNumber)) {
              result.nfeNumber = `${result.nfeNumber}, ${detailed.docNumber}`;
            }
          }
        }
        const isMdfe = detailed.documentType === 'MDF-e' || isMdfeDocType(docType);
        if (isMdfe) {
          if (detailed.docNumber && !result.mdfeNumber) result.mdfeNumber = detailed.docNumber;
          if (detailed.ciot) {
            result.ciotNumber = detailed.ciot;
          }
        }
        if (detailed.ciot && !result.ciotNumber) {
          result.ciotNumber = detailed.ciot;
        } else if ((detailed.documentType === 'CIOT' || docType.toUpperCase().includes('CIOT')) && detailed.docNumber && !result.ciotNumber) {
          result.ciotNumber = detailed.docNumber;
        }
        if (detailed.carga?.valorMercadoria !== undefined && detailed.carga.valorMercadoria > 0) {
          if (detailed.documentType === 'CT-e' || detailed.documentType === 'MDF-e') {
            result.nfeValue = detailed.carga.valorMercadoria;
          } else if (isStrictNotaFiscalCategory(docType)) {
            if (result.nfeValue === undefined) {
              result.nfeValue = detailed.carga.valorMercadoria;
            } else {
              result.nfeValue = Number((result.nfeValue + detailed.carga.valorMercadoria).toFixed(2));
            }
          }
        }
        if (docType.toLowerCase().includes('ordem') || docType.toLowerCase().includes('oc')) {
          if (detailed.rawText) {
            const ocNum = extractOcNumberFromText(detailed.rawText);
            if (ocNum && !result.ordemCarregamentoNumero) {
              result.ordemCarregamentoNumero = ocNum;
            }
          }
        }
        const isPureNfe = (detailed.documentType === 'Nota Fiscal' || isNfeDocType(docType) || docType.toLowerCase().includes('ticket') || docType.toLowerCase().includes('carregamento') || docType.toLowerCase().includes('comprovante')) && !isCteDocType(docType) && !isMdfeDocType(docType) && !isCartaFreteDocType(docType);
        if (!isPureNfe) {
          if (detailed.financeiro?.valorPedagio !== undefined && result.tollValue === undefined) {
            result.tollValue = detailed.financeiro.valorPedagio;
          }
          if (detailed.financeiro?.valorAdiantamento !== undefined && result.advanceValue === undefined) {
            result.advanceValue = detailed.financeiro.valorAdiantamento;
          }
          if (detailed.financeiro?.valorTotalFrete !== undefined && result.totalFreightValue === undefined) {
            result.totalFreightValue = detailed.financeiro.valorTotalFrete;
          }
          if (detailed.financeiro?.porcentagemAdiantamento !== undefined && result.advancePercentage === undefined) {
            result.advancePercentage = detailed.financeiro.porcentagemAdiantamento;
          }
          if (detailed.calculoSaldoFrete?.sestSenat !== undefined && result.sestSenatValue === undefined) {
            result.sestSenatValue = detailed.calculoSaldoFrete.sestSenat;
          }
          if (detailed.calculoSaldoFrete?.inssRetido !== undefined && result.inssRetidoValue === undefined) {
            result.inssRetidoValue = detailed.calculoSaldoFrete.inssRetido;
          }
          if (detailed.calculoSaldoFrete?.subtotal !== undefined && result.subtotalSaldoValue === undefined) {
            result.subtotalSaldoValue = detailed.calculoSaldoFrete.subtotal;
          }
        }
      } catch (e) {
        console.warn(`[fiscalDocParser] Could not fetch URL "${url}":`, e);
      }
    }
  }

  if (extractedSubCtes.length > 0) {
    result.subCtes = extractedSubCtes;
    if (extractedSubCtes.length > 1) {
      result.cteNumber = extractedSubCtes.map(c => c.cteNumber).filter(Boolean).join('/');
      const totalWeightKg = extractedSubCtes.reduce((sum, c) => sum + (c.weightKg || (c.weight ? c.weight * 1000 : 0)), 0);
      if (totalWeightKg > 0) {
        result.cteWeightKg = totalWeightKg;
      }
      const totalServiceVal = extractedSubCtes.reduce((sum, c) => sum + (c.companyFreight || 0), 0);
      if (totalServiceVal > 0) {
        result.cteTotalServiceValue = totalServiceVal;
      }
      const totalIcms = extractedSubCtes.reduce((sum, c) => sum + (c.icms || 0), 0);
      if (totalIcms > 0) {
        result.icmsValue = totalIcms;
      }
    }
  }

  return result;
}

