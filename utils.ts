export const formatId = (num: number, prefix: string, pad: number = 3): string => {
  return `${prefix}-${String(num).padStart(pad, '0')}`;
};

const numberToWordsPtBr = (num: number, gender: 'm' | 'f' = 'm'): string => {
  if (num === 0) return 'zero';

  const unitsM = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove'];
  const unitsF = ['', 'uma', 'duas', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove'];
  const units = gender === 'm' ? unitsM : unitsF;
  
  const teens = ['dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
  const tens = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
  const hundreds = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];

  const convertThreeDigits = (n: number, currentGender: 'm' | 'f'): string => {
    if (n === 0) return '';
    if (n === 100) return 'cem';
    
    let res = '';
    const h = Math.floor(n / 100);
    const remainder = n % 100;
    const t = Math.floor(remainder / 10);
    const u = remainder % 10;

    if (h > 0) res += hundreds[h];
    if (h > 0 && remainder > 0) res += ' e ';

    if (t === 1) {
      res += teens[u];
    } else {
      if (t > 1) res += tens[t];
      if (t > 1 && u > 0) res += ' e ';
      if (u > 0 || (h === 0 && t === 0)) {
          if (!(h > 0 && t === 0 && u === 0)) {
              res += (currentGender === 'm' ? unitsM[u] : unitsF[u]);
          }
      }
    }
    return res;
  };

  const millions = Math.floor(num / 1000000);
  const thousands = Math.floor((num % 1000000) / 1000);
  const rest = num % 1000;

  let result = '';
  if (millions > 0) {
      result += convertThreeDigits(millions, 'm') + (millions === 1 ? ' milhão' : ' milhões');
      if (thousands > 0 || rest > 0) result += ' e ';
  }

  if (thousands > 0) {
    if (thousands === 1) {
      result += 'mil';
    } else {
      result += convertThreeDigits(thousands, 'm') + ' mil';
    }
    if (rest > 0) result += ' e ';
  }

  if (rest > 0 || (millions === 0 && thousands === 0)) {
    result += convertThreeDigits(rest, gender);
  }

  return result.trim();
};

export const formatWeightPtBr = (num: number): string => {
  const integerPart = Math.floor(num);
  const decimalPart = Math.round((num - integerPart) * 1000);

  let result = '';
  
  if (integerPart > 0) {
    result += numberToWordsPtBr(integerPart, 'f') + (integerPart === 1 ? ' tonelada' : ' toneladas');
  }

  if (decimalPart > 0) {
    if (result) result += ' e ';
    result += numberToWordsPtBr(decimalPart, 'm') + (decimalPart === 1 ? ' quilo' : ' quilos');
  }

  return (result || 'zero toneladas').toUpperCase();
};

import type { FreightOffer, Cargo, Product } from './types';
import { FreightOfferStatus, ShipmentStatus } from './types';

/**
 * Busca uma carga por id ou sequenceId com total tolerância a formatos ('CRG-123', '123', 123, etc.)
 */
export const findCargoById = (cargos?: Cargo[] | null, cargoId?: string | number | null): Cargo | undefined => {
  if (!cargoId || !cargos || cargos.length === 0) return undefined;
  const strId = String(cargoId).trim();
  const cleanNum = strId.replace(/\D/g, '');
  return cargos.find(c => 
    c.id === strId ||
    String(c.id).toLowerCase() === strId.toLowerCase() ||
    (c.sequenceId !== undefined && c.sequenceId !== null && String(c.sequenceId) === strId) ||
    (cleanNum && c.sequenceId !== undefined && c.sequenceId !== null && String(c.sequenceId) === cleanNum) ||
    (c.sequenceId !== undefined && c.sequenceId !== null && `crg-${c.sequenceId}` === strId.toLowerCase())
  );
};

/**
 * Encontra o produto associado a uma carga por ID ou nome
 */
export const findProductForCargo = (products?: Product[] | null, cargo?: Cargo | null): Product | undefined => {
  if (!cargo || !products || products.length === 0) return undefined;
  const prodId = cargo.productId ? String(cargo.productId).trim() : '';
  if (!prodId) return undefined;
  return products.find(p => 
    p.id === prodId ||
    String(p.id).toLowerCase() === prodId.toLowerCase() ||
    (p.name && p.name.trim().toLowerCase() === prodId.toLowerCase())
  );
};

/**
 * Verifica se a carga ou produto exige Gerenciamento de Risco (GR).
 * Se o produto tiver requiresRiskManagement === false ou a carga tiver requiresRiskManagement === false, retorna false.
 */
export const checkRequiresRiskManagement = (cargo?: Cargo | null, product?: Product | null): boolean => {
  if (product && product.requiresRiskManagement === false) return false;
  if (cargo && (cargo as any).requiresRiskManagement === false) return false;
  return true;
};

export const getMatchedCargo = (offer: FreightOffer, cargosList?: Cargo[]): Cargo | null => {
  if (!cargosList || cargosList.length === 0) return null;

  // 1. Direct cargoId link on offer
  if (offer.cargoId) {
    const targetCargoId = offer.cargoId;
    const cleanNum = targetCargoId.replace(/\D/g, '');
    const cargoByDirectId = cargosList.find(c => 
      c.id === targetCargoId || 
      `CRG-${c.sequenceId}` === targetCargoId ||
      (cleanNum ? c.sequenceId?.toString() === cleanNum : false)
    );
    if (cargoByDirectId) return cargoByDirectId;
  }


  // 2. Extract cargo ID / sequenceId from history log description (e.g. "Carga #104 criada a partir da oferta.")
  if (offer.history && offer.history.length > 0) {
    for (const h of offer.history) {
      if (h.description && (h.description.includes('criada a partir da oferta') || h.description.includes('Carga #'))) {
        const match = h.description.match(/Carga\s+#?(CRG-\d+|\d+)/i);
        if (match) {
          const cargoIdOrNum = match[1];
          const cargoByHistory = cargosList.find(c => 
            c.id.toLowerCase() === cargoIdOrNum.toLowerCase() ||
            `CRG-${c.sequenceId}`.toLowerCase() === cargoIdOrNum.toLowerCase() ||
            c.sequenceId?.toString() === cargoIdOrNum.replace(/\D/g, '')
          );
          if (cargoByHistory) return cargoByHistory;
        }
      }
    }
  }

  // 3. Fallback matching by client, product, origin, destination
  const normalize = (str?: string) => str ? str.trim().toLowerCase().replace(/\s+/g, ' ') : '';
  const offerOrigin = normalize(offer.origin);
  const offerDest = normalize(offer.destination);

  return cargosList.find(c => {
    const matchClient = c.clientId === offer.clientId;
    const matchProduct = c.productId === offer.productId;
    const cargoOrigin = normalize(c.origin);
    const cargoDest = normalize(c.destination);
    
    const matchOrigin = cargoOrigin === offerOrigin || (cargoOrigin && offerOrigin && (cargoOrigin.includes(offerOrigin) || offerOrigin.includes(cargoOrigin)));
    const matchDest = cargoDest === offerDest || (cargoDest && offerDest && (cargoDest.includes(offerDest) || offerDest.includes(cargoDest)));

    return matchClient && matchProduct && matchOrigin && matchDest;
  }) || null;
};

export function isCteApplicableForStatus(status?: string | null): boolean {
  if (!status) return true;
  const nonCteStatuses = [
    'Ag. Cadastro',
    'Ag. Seguradora',
    'Ag. Carregamento',
    'Ag. Nota',
    'PreCadastro',
    'AguardandoSeguradora',
    'AguardandoCarregamento',
    'AguardandoNota',
    'Cancelado'
  ];
  return !nonCteStatuses.includes(status);
}

export function getShipmentCte(shipment?: { status?: any; cteNumber?: string; documents?: any } | null): string {
  if (!shipment) return '-';
  if (shipment.status && !isCteApplicableForStatus(shipment.status)) return '-';

  // 1. Extrair lista de números de CT-es cancelados, se houver
  const cancelledNumbers: string[] = [];
  if (Array.isArray(shipment.documents?.cancelled_ctes)) {
    for (const c of shipment.documents.cancelled_ctes) {
      const numStr = String(c?.cteNumber || '').trim();
      if (numStr && !cancelledNumbers.includes(numStr)) {
        cancelledNumbers.push(numStr);
      }
    }
  }

  // 2. Extrair número registrado no embarque
  let directNum = '';
  if (shipment.cteNumber && typeof shipment.cteNumber === 'string' && shipment.cteNumber.trim() !== '') {
    directNum = shipment.cteNumber.trim();
  } else if (shipment.documents?.cte_number && String(shipment.documents.cte_number).trim() !== '') {
    directNum = String(shipment.documents.cte_number).trim();
  }

  // Se directNum já contiver barra (ex: "2211/2233"), já está completo e no formato desejado
  if (directNum && directNum.includes('/')) {
    return directNum;
  }

  // Se houver números cancelados registrados e um número ativo
  if (cancelledNumbers.length > 0) {
    const allNums = [...cancelledNumbers];
    if (directNum && !allNums.includes(directNum)) {
      allNums.push(directNum);
    }
    return allNums.join('/');
  }

  if (directNum) {
    return directNum;
  }

  // 3. Fallback: extração a partir dos anexos (removendo prefixo de timestamp de upload para evitar números falsos)
  const cteDocs = shipment.documents?.['CT-e'] || shipment.documents?.['CT-E'] || shipment.documents?.['cte'] || shipment.documents?.['Cte'];
  if (Array.isArray(cteDocs) && cteDocs.length > 0) {
    const extractedList: string[] = [];
    for (const item of cteDocs) {
      if (typeof item === 'string') {
        const cleanItem = item.replace(/CT[-_]?e_\d{10,14}_/i, '').replace(/DACTE_\d{10,14}_/i, '');
        const match = cleanItem.match(/DACTE_(\d{1,8})/i) || 
                      cleanItem.match(/(?:^|_)CTE_(\d{1,8})/i) || 
                      cleanItem.match(/_(\d{1,8})\.(?:pdf|xml)/i);
        if (match && match[1]) {
          const numStr = match[1];
          if (!numStr.startsWith('178') && !numStr.startsWith('179') && !extractedList.includes(numStr)) {
            extractedList.push(numStr);
          }
        }
      }
    }
    if (extractedList.length > 0) return extractedList.join('/');
  } else if (typeof cteDocs === 'string' && cteDocs.trim() !== '') {
    const cleanItem = cteDocs.replace(/CT[-_]?e_\d{10,14}_/i, '').replace(/DACTE_\d{10,14}_/i, '');
    const match = cleanItem.match(/DACTE_(\d{1,8})/i) || 
                  cleanItem.match(/(?:^|_)CTE_(\d{1,8})/i) || 
                  cleanItem.match(/_(\d{1,8})\.(?:pdf|xml)/i);
    if (match && match[1]) {
      const numStr = match[1];
      if (!numStr.startsWith('178') && !numStr.startsWith('179')) {
        return numStr;
      }
    }
  }

  return '-';
}

export function hasCteAttached(shipment?: { cteNumber?: string; documents?: any; status?: any } | null): boolean {
  if (!shipment) return false;
  if (shipment.cteNumber && typeof shipment.cteNumber === 'string' && shipment.cteNumber.trim() !== '' && shipment.cteNumber.trim() !== '-') {
    return true;
  }
  if (shipment.documents?.cte_number && String(shipment.documents.cte_number).trim() !== '' && String(shipment.documents.cte_number).trim() !== '-') {
    return true;
  }

  const docs = shipment.documents;
  if (docs && typeof docs === 'object') {
    for (const [key, val] of Object.entries(docs)) {
      if (/ct[-_]?e/i.test(key)) {
        if (Array.isArray(val) && val.length > 0) return true;
        if (typeof val === 'string' && val.trim() !== '') return true;
      }
    }
  }

  const cteNum = getShipmentCte(shipment);
  if (cteNum && cteNum !== '-') return true;

  return false;
}

/**
 * Retorna true se o embarque já está faturado com CT-e emitido.
 * Embarques em cadastro, seguradora, carregamento, aguardando nota ou cancelados
 * NÃO são considerados faturados.
 */
export function isShipmentFaturado(shipment?: { status?: any; cteNumber?: string; documents?: any } | null): boolean {
  if (!shipment) return false;
  const statusStr = String(shipment.status || '');
  if (shipment.status === ShipmentStatus.Cancelado || statusStr === 'Cancelado') return false;
  if (!isCteApplicableForStatus(shipment.status)) return false;
  const cteNum = getShipmentCte(shipment);
  return (cteNum !== '-' && cteNum.trim() !== '') || hasCteAttached(shipment);
}

export const getShipmentCteNumber = getShipmentCte;

/**
 * Retorna o Remetente informado no CT-e do embarque.
 * Prioriza com máxima exatidão os dados fiscais extraídos do CT-e (DACTE / XML).
 */
export function getShipmentCteRemetente(shipment?: { documents?: any; [key: string]: any } | null, cargo?: any): string {
  if (!shipment) return '-';

  const docs = shipment.documents;
  if (docs && typeof docs === 'object') {
    const docRem = 
      docs.cte_remetente || 
      docs.remetente_cte || 
      docs.cte_remetente_nome ||
      docs.remetente_nome || 
      docs.remetente?.razaoSocial || 
      docs.remetente?.xNome ||
      docs.remetente || 
      docs.cteRemetente ||
      docs.senderName;
    if (docRem && typeof docRem === 'string' && docRem.trim() && docRem !== '-') {
      return docRem.trim().toUpperCase();
    }
  }

  const directRem = (shipment as any).cteRemetente || (shipment as any).cte_remetente || (shipment as any).remetente;
  if (directRem && typeof directRem === 'string' && directRem.trim() && directRem !== '-') {
    return directRem.trim().toUpperCase();
  }

  // Fallback: empresa de carregamento / remetente cadastrado na carga
  if (cargo) {
    const cargoRem = cargo.loadingCompany || cargo.remetente || cargo.sender;
    if (cargoRem && typeof cargoRem === 'string' && cargoRem.trim()) {
      return cargoRem.trim().toUpperCase();
    }
  }

  return '-';
}

/**
 * Retorna o número do CIOT informado ou extraído no embarque.
 * Se não houver CIOT cadastrado, retorna '-'.
 * Garante que o ID do embarque (ex: CEL-665) não seja erroneamente retornado como CIOT.
 */
export function getShipmentCiotNumber(shipment?: { id?: string; ciot?: string; ciotNumber?: string; documents?: any } | null): string {
  if (!shipment) return '-';
  const sId = shipment.id ? String(shipment.id).trim().toUpperCase() : '';

  const isInvalid = (val: any) => {
    if (!val || typeof val !== 'string') return true;
    const trimmed = val.trim();
    if (!trimmed || trimmed === '-' || trimmed === 'N/A' || trimmed === 'null' || trimmed === 'undefined') return true;
    if (sId && trimmed.toUpperCase() === sId) return true;
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('data:') || trimmed.startsWith('/')) return true;
    return false;
  };

  // Normalização do CIOT preservando obrigatoriamente a barra "/" e os dígitos após a barra (padrão oficial ANTT / e-Frete)
  const normalizeCiot = (val: any): string => {
    if (isInvalid(val)) return '-';
    const clean = String(val).trim();

    // Se o valor contiver uma barra "/", preserva exatamente o número antes e depois da barra (ex: 520.038.012.363/9057 ou 520038012363/9057)
    if (clean.includes('/')) {
      const parts = clean.split('/');
      const prefix = parts[0].trim();
      const suffix = parts.slice(1).join('/').trim();
      if (suffix) {
        return `${prefix}/${suffix}`;
      }
      return prefix;
    }

    // Se tiver 16 dígitos contínuos (padrão 12 dígitos CIOT + 4 dígitos da operação), formata automaticamente com a barra
    const digits = clean.replace(/\D/g, '');
    if (digits.length === 16) {
      return `${digits.slice(0, 12)}/${digits.slice(12)}`;
    }

    return clean;
  };

  const docs = shipment.documents;

  // Lista ordenada de candidatos a CIOT
  const explicitCandidates: string[] = [];
  const docCandidates: string[] = [];

  // 1. Campo explícito no objeto do embarque
  if (!isInvalid(shipment.ciotNumber)) explicitCandidates.push(String(shipment.ciotNumber).trim());
  if (!isInvalid(shipment.ciot)) explicitCandidates.push(String(shipment.ciot).trim());
  if (!isInvalid((shipment as any).ciot_number)) explicitCandidates.push(String((shipment as any).ciot_number).trim());

  // 2. Campo em documents
  if (docs && typeof docs === 'object') {
    if (!isInvalid(docs.ciot_number)) docCandidates.push(String(docs.ciot_number).trim());
    if (!isInvalid(docs.ciotNumber)) docCandidates.push(String(docs.ciotNumber).trim());
    if (!isInvalid(docs.ciot)) docCandidates.push(String(docs.ciot).trim());
    if (!isInvalid(docs.CIOT)) docCandidates.push(String(docs.CIOT).trim());
    if (!isInvalid(docs.mdfe_ciot)) docCandidates.push(String(docs.mdfe_ciot).trim());
    if (!isInvalid(docs.ciot_mdfe)) docCandidates.push(String(docs.ciot_mdfe).trim());
    if (!isInvalid(docs.mdfeCiot)) docCandidates.push(String(docs.mdfeCiot).trim());

    // Buscar em chaves com nome ciot
    for (const [key, val] of Object.entries(docs)) {
      if (/ciot/i.test(key)) {
        if (!isInvalid(val)) {
          docCandidates.push(String(val).trim());
        }
        if (Array.isArray(val) && val.length > 0) {
          for (const item of val) {
            if (typeof item === 'string') {
              const m = item.match(/(\d{3}\.\d{3}\.\d{3}\.\d{3}\/\d{4}|\d{12}\/\d{4}|\d{3}\.\d{3}\.\d{3}\.\d{3}|\b520\d{9,15}\b|\b\d{16}\b|\b\d{12}\b)/i);
              if (m && m[1] && (!sId || m[1].toUpperCase() !== sId)) docCandidates.push(m[1].trim());
            }
          }
        }
      }
    }

    // Buscar em comprovantes / contratos de frete / PEF / Carta Frete
    for (const [key, val] of Object.entries(docs)) {
      if (/carta|contrato|pef/i.test(key)) {
        const items = Array.isArray(val) ? val : (typeof val === 'string' ? [val] : []);
        for (const item of items) {
          if (typeof item === 'string') {
            const m = item.match(/(\d{3}\.\d{3}\.\d{3}\.\d{3}\/\d{4}|\d{12}\/\d{4}|\d{3}\.\d{3}\.\d{3}\.\d{3}|\b520\d{9,15}\b|\b\d{16}\b|\b\d{12}\b)/i);
            if (m && m[1] && (!sId || m[1].toUpperCase() !== sId)) docCandidates.push(m[1].trim());
          }
        }
      }
    }
  }

  const allCandidates = [...explicitCandidates, ...docCandidates];

  // Prioridade 1: Qualquer candidato que contenha "/" ou tenha 16 dígitos (formato completo com sufixo da operação)
  // Isso garante que números informados após a barra (ex: 520.038.012.363/9057) nunca sejam truncados por versões parciais (ex: 12 dígitos)
  const candidateWithSlash = allCandidates.find(c => c.includes('/') || c.replace(/\D/g, '').length === 16);
  if (candidateWithSlash) {
    return normalizeCiot(candidateWithSlash);
  }

  // Prioridade 2: Primeiro candidato explícito válido
  if (explicitCandidates.length > 0) {
    return normalizeCiot(explicitCandidates[0]);
  }

  // Prioridade 3: Primeiro candidato documental válido
  if (docCandidates.length > 0) {
    return normalizeCiot(docCandidates[0]);
  }

  return '-';
}


export function getShipmentCteEmissionDate(shipment?: { status?: any; cteEmissionDate?: string; documents?: any } | null): string | null {
  if (!shipment) return null;

  if (shipment.cteEmissionDate && typeof shipment.cteEmissionDate === 'string' && shipment.cteEmissionDate.trim() !== '' && shipment.cteEmissionDate.trim() !== '-') {
    return shipment.cteEmissionDate.trim();
  }

  const docs = shipment.documents;
  if (docs && typeof docs === 'object') {
    const directFields = [
      docs.cte_emission_date,
      docs.cteEmissionDate,
      docs.data_emissao,
      docs.dataEmissao,
      docs.data_hora_emissao,
      docs.dataHoraEmissao,
      docs.emission_date,
      docs.emissionDate,
      docs.dhEmi,
      docs.dEmi,
    ];
    for (const val of directFields) {
      if (val && typeof val === 'string' && val.trim() !== '' && val.trim() !== '-') {
        return val.trim();
      }
    }
  }

  if (shipment.status && !isCteApplicableForStatus(shipment.status) && !hasCteAttached(shipment as any)) return null;

  if (docs && typeof docs === 'object') {
    for (const [key, val] of Object.entries(docs)) {
      if (/ct[-_]?e|dacte/i.test(key)) {
        const items = Array.isArray(val) ? val : [val];
        for (const item of items) {
          if (typeof item === 'string') {
            const matchPt = item.match(/(?:^|\b|_)(\d{1,2})[-_.](\d{1,2})[-_.](\d{4})(?:[-_.\s]*(\d{1,2})[:_.](\d{2}))?/);
            if (matchPt) {
              const day = matchPt[1].padStart(2, '0');
              const month = matchPt[2].padStart(2, '0');
              const year = matchPt[3];
              const time = matchPt[4] ? ` ${matchPt[4].padStart(2, '0')}:${matchPt[5]}` : '';
              return `${day}/${month}/${year}${time}`;
            }
            const matchIso = item.match(/(?:^|\b|_)(\d{4})[-_.](\d{1,2})[-_.](\d{1,2})(?:[T\s_-]*(\d{1,2})[:_.](\d{2}))?/);
            if (matchIso) {
              const year = matchIso[1];
              const month = matchIso[2].padStart(2, '0');
              const day = matchIso[3].padStart(2, '0');
              const time = matchIso[4] ? ` ${matchIso[4].padStart(2, '0')}:${matchIso[5]}` : '';
              return `${day}/${month}/${year}${time}`;
            }
          }
        }
      }
    }
  }

  return null;
}

export function parseDateToYmd(dateStr?: string | null): string | null {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const trimmed = dateStr.trim();
  if (!trimmed || trimmed === '-' || trimmed === '0') return null;

  // Match DD/MM/YYYY or DD-MM-YYYY or D/M/YYYY (with optional time)
  const dmy = trimmed.match(/(?:^|\b)(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (dmy) {
    const day = dmy[1].padStart(2, '0');
    const month = dmy[2].padStart(2, '0');
    const year = dmy[3];
    return `${year}-${month}-${day}`;
  }

  // Match YYYY-MM-DD or YYYY/M/D (with optional time)
  const ymd = trimmed.match(/(?:^|\b)(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (ymd) {
    const year = ymd[1];
    const month = ymd[2].padStart(2, '0');
    const day = ymd[3].padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // Match DD/MM/YY (2-digit year)
  const dmy2 = trimmed.match(/(?:^|\b)(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2})\b/);
  if (dmy2) {
    const day = dmy2[1].padStart(2, '0');
    const month = dmy2[2].padStart(2, '0');
    let year = parseInt(dmy2[3], 10);
    year = year > 50 ? 1900 + year : 2000 + year;
    return `${year}-${month}-${day}`;
  }

  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().split('T')[0];
  }

  return null;
}

export function getShipmentEffectiveDate(shipment?: { status?: any; cteEmissionDate?: string; documents?: any; statusHistory?: any[]; scheduledDate?: string; createdAt?: string } | null): string | null {
  if (!shipment) return null;

  // 1. Prioritize CT-e Emission Date if CT-e exists and status is applicable
  const cteEmission = getShipmentCteEmissionDate(shipment);
  if (cteEmission) {
    const ymd = parseDateToYmd(cteEmission);
    if (ymd) return ymd;
  }

  // 2. Aguardando Nota status history timestamp (effective loading)
  const effectiveEntry = shipment.statusHistory?.find((h: any) => 
    h.status === 'AguardandoNota' || 
    h.status === 'Ag. Nota' || 
    h.status === 'Aguardando Nota'
  );
  if (effectiveEntry?.timestamp) {
    return effectiveEntry.timestamp.substring(0, 10);
  }

  // 3. Scheduled Date
  if (shipment.scheduledDate) {
    const ymd = parseDateToYmd(shipment.scheduledDate);
    if (ymd) return ymd;
    return shipment.scheduledDate.substring(0, 10);
  }

  // 4. Created At
  if (shipment.createdAt) {
    return shipment.createdAt.substring(0, 10);
  }

  return null;
}

export function isStayForShipment(
  stay?: { shipmentId?: string; shipment_id?: string; plate?: string; driver?: string; invoice?: string; entryDate?: string; date?: string } | null,
  shipment?: { id?: string; orderId?: string; horsePlate?: string; driverName?: string; nfeNumber?: string; documents?: any; scheduledDate?: string; createdAt?: string } | null
): boolean {
  if (!stay || !shipment) return false;

  // 1. Direct match by shipmentId
  const stayShipmentId = stay.shipmentId || (stay as any).shipment_id;
  if (stayShipmentId && typeof stayShipmentId === 'string' && stayShipmentId.trim() !== '') {
    const cleanStayId = stayShipmentId.trim().toLowerCase();
    if (shipment.id && shipment.id.toLowerCase() === cleanStayId) return true;
    if (shipment.orderId && shipment.orderId.toLowerCase() === cleanStayId) return true;
    return false; // If stay has an explicit shipmentId assigned, it strictly belongs to that shipment
  }

  // 2. Match by Plate and Driver if available
  const stayPlate = stay.plate ? stay.plate.replace(/[^a-zA-Z0-9]/g, '').toUpperCase() : '';
  const sPlate = shipment.horsePlate ? shipment.horsePlate.replace(/[^a-zA-Z0-9]/g, '').toUpperCase() : '';

  if (stayPlate && sPlate && stayPlate === sPlate) {
    // If date is available, check month compatibility to avoid cross-month driver trip collisions
    const stayDateStr = stay.entryDate || stay.date;
    const stayYmd = parseDateToYmd(stayDateStr);
    const shipYmd = getShipmentEffectiveDate(shipment as any) || parseDateToYmd(shipment.scheduledDate) || parseDateToYmd(shipment.createdAt);
    if (stayYmd && shipYmd) {
      const stayMonth = stayYmd.substring(0, 7);
      const shipMonth = shipYmd.substring(0, 7);
      if (stayMonth !== shipMonth) {
        return false;
      }
    }

    if (stay.driver && shipment.driverName) {
      const d1 = stay.driver.toLowerCase().trim();
      const d2 = shipment.driverName.toLowerCase().trim();
      if (d1.includes(d2) || d2.includes(d1) || d1.split(' ')[0] === d2.split(' ')[0]) {
        return true;
      }
    } else {
      return true;
    }
  }

  return false;
}

export function findShipmentForStay<T extends { id?: string; orderId?: string; horsePlate?: string; driverName?: string; nfeNumber?: string; documents?: any; scheduledDate?: string; createdAt?: string }>(
  stay?: { shipmentId?: string; plate?: string; invoice?: string; driver?: string; date?: string } | null,
  shipments?: T[] | null
): T | null {
  if (!stay || !shipments || shipments.length === 0) return null;

  // 1. Direct match by shipmentId
  if (stay.shipmentId && typeof stay.shipmentId === 'string' && stay.shipmentId.trim() !== '') {
    const cleanId = stay.shipmentId.trim().toLowerCase();
    const directMatch = shipments.find(s => 
      (s.id && s.id.toLowerCase() === cleanId) || 
      (s.orderId && s.orderId.toLowerCase() === cleanId)
    );
    if (directMatch) return directMatch;
  }

  // 2. Match by Plate
  const stayPlate = stay.plate ? stay.plate.replace(/[^a-zA-Z0-9]/g, '').toUpperCase() : '';
  const stayInvoice = stay.invoice ? stay.invoice.replace(/[^a-zA-Z0-9]/g, '').toUpperCase() : '';

  if (stayPlate) {
    const matchingPlateShipments = shipments.filter(s => {
      const sPlate = s.horsePlate ? s.horsePlate.replace(/[^a-zA-Z0-9]/g, '').toUpperCase() : '';
      return sPlate === stayPlate;
    });

    if (matchingPlateShipments.length === 1) {
      return matchingPlateShipments[0];
    }

    if (matchingPlateShipments.length > 1) {
      // Try NF-e match
      if (stayInvoice) {
        const invMatch = matchingPlateShipments.find(s => {
          const sNfe = (s.nfeNumber || s.documents?.nfe_number || s.documents?.['NF-e'] || '') + '';
          return sNfe.replace(/[^a-zA-Z0-9]/g, '').includes(stayInvoice);
        });
        if (invMatch) return invMatch;
      }

      // Try Driver match
      if (stay.driver) {
        const cleanDriver = stay.driver.toLowerCase().trim();
        const driverMatch = matchingPlateShipments.find(s => 
          s.driverName && (s.driverName.toLowerCase().includes(cleanDriver) || cleanDriver.includes(s.driverName.toLowerCase().trim()))
        );
        if (driverMatch) return driverMatch;
      }

      // Date proximity fallback
      if (stay.date) {
        const stayTime = new Date(stay.date).getTime();
        if (!isNaN(stayTime)) {
          let closest = matchingPlateShipments[0];
          let minDiff = Infinity;
          for (const s of matchingPlateShipments) {
            const sEffDate = getShipmentEffectiveDate(s as any) || s.scheduledDate || s.createdAt;
            if (sEffDate) {
              const diff = Math.abs(new Date(sEffDate).getTime() - stayTime);
              if (diff < minDiff) {
                minDiff = diff;
                closest = s;
              }
            }
          }
          return closest;
        }
      }

      return matchingPlateShipments[0];
    }
  }

  return null;
}

export function getStayEffectiveDate(
  stay?: { shipmentId?: string; plate?: string; invoice?: string; driver?: string; date?: string } | null,
  shipments?: any[] | null
): string | null {
  if (!stay) return null;

  if (shipments && shipments.length > 0) {
    const linkedShipment = findShipmentForStay(stay, shipments);
    if (linkedShipment) {
      const effDate = getShipmentEffectiveDate(linkedShipment);
      if (effDate) return effDate;
      if (linkedShipment.scheduledDate) {
        const ymd = parseDateToYmd(linkedShipment.scheduledDate);
        if (ymd) return ymd;
      }
    }
  }

  // Fallback to stay.date
  if (stay.date) {
    const ymd = parseDateToYmd(stay.date);
    if (ymd) return ymd;
    return String(stay.date).substring(0, 10);
  }

  return null;
}

/**
 * Retorna o link do Google Maps para a origem, destino ou trajeto de uma carga.
 * Prioriza link de mapa salvo > coordenadas geográficas > ponto de coleta/entrega + cidade > cidade/UF.
 */
export function getCargoMapUrl(
  type: 'origin' | 'destination' | 'route',
  cargo?: {
    origin?: string;
    originLocation?: string;
    originMapLink?: string;
    originCoords?: { lat: number; lng: number };
    destination?: string;
    destinationLocation?: string;
    destinationMapLink?: string;
    destinationCoords?: { lat: number; lng: number };
  } | null
): string | null {
  if (!cargo) return null;

  if (type === 'origin') {
    if (cargo.originMapLink && cargo.originMapLink.trim()) {
      return cargo.originMapLink.trim();
    }
    if (cargo.originCoords?.lat && cargo.originCoords?.lng) {
      return `https://www.google.com/maps/search/?api=1&query=${cargo.originCoords.lat},${cargo.originCoords.lng}`;
    }
    const query = [cargo.originLocation, cargo.origin].filter(Boolean).join(', ').trim();
    if (query) {
      return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
    }
    return null;
  }

  if (type === 'destination') {
    if (cargo.destinationMapLink && cargo.destinationMapLink.trim()) {
      return cargo.destinationMapLink.trim();
    }
    if (cargo.destinationCoords?.lat && cargo.destinationCoords?.lng) {
      return `https://www.google.com/maps/search/?api=1&query=${cargo.destinationCoords.lat},${cargo.destinationCoords.lng}`;
    }
    const query = [cargo.destinationLocation, cargo.destination].filter(Boolean).join(', ').trim();
    if (query) {
      return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
    }
    return null;
  }

  if (type === 'route') {
    const originPart = cargo.originMapLink?.trim() ||
      (cargo.originCoords?.lat ? `${cargo.originCoords.lat},${cargo.originCoords.lng}` : [cargo.originLocation, cargo.origin].filter(Boolean).join(', ').trim());
    const destPart = cargo.destinationMapLink?.trim() ||
      (cargo.destinationCoords?.lat ? `${cargo.destinationCoords.lat},${cargo.destinationCoords.lng}` : [cargo.destinationLocation, cargo.destination].filter(Boolean).join(', ').trim());

    if (originPart && destPart) {
      return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(originPart)}&destination=${encodeURIComponent(destPart)}`;
    }
    return null;
  }

  return null;
}

/**
 * Normaliza o peso/tonelagem para Toneladas (t).
 * Corrige automaticamente casos onde o peso foi inserido em kg (ex: 46150 kg -> 46.15 t)
 * ou com pontuações/zeros adicionais de balança/gramas (ex: 46150000 -> 46.15 t).
 */
export function normalizeWeightTonnage(raw: number | string | undefined | null): number {
  if (raw === undefined || raw === null || raw === '') return 0;
  const num = typeof raw === 'string' ? parseFloat(raw.replace(/[^\d.,]/g, '').replace(',', '.')) : Number(raw);
  if (isNaN(num) || num <= 0) return 0;
  
  let val = num;
  if (val >= 1000000) {
    val = val / 1000000;
  } else if (val >= 1000) {
    val = val / 1000;
  }
  return Number(val.toFixed(2));
}

export type FinancialPeriodFilter = 'hoje' | 'semana' | 'mes' | 'ano';

export interface FinancialDateRange {
  startDate: string; // Formato YYYY-MM-DD
  endDate: string;   // Formato YYYY-MM-DD
}

/**
 * Converte um objeto Date para string no formato local YYYY-MM-DD
 */
export function toLocalYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Retorna o intervalo dinâmico de datas para os relatórios financeiros:
 * - "hoje": estritamente o dia atual / de referência (YYYY-MM-DD a YYYY-MM-DD)
 * - "semana": Domingo a Sábado da semana corrente
 * - "mes": 1º ao último dia do mês corrente
 * - "ano": 1º ao último dia do ano corrente
 */
export function getFinancialPeriodRange(filter: FinancialPeriodFilter, refDate: Date = new Date()): FinancialDateRange {
  const y = refDate.getFullYear();
  const m = refDate.getMonth();
  const d = refDate.getDate();

  switch (filter) {
    case 'hoje': {
      const todayStr = toLocalYmd(refDate);
      return { startDate: todayStr, endDate: todayStr };
    }
    case 'semana': {
      const dayOfWeek = refDate.getDay(); // 0 = Domingo, 6 = Sábado
      const sunday = new Date(y, m, d - dayOfWeek);
      const saturday = new Date(y, m, d + (6 - dayOfWeek));
      return { startDate: toLocalYmd(sunday), endDate: toLocalYmd(saturday) };
    }
    case 'mes': {
      const firstDay = new Date(y, m, 1);
      const lastDay = new Date(y, m + 1, 0);
      return { startDate: toLocalYmd(firstDay), endDate: toLocalYmd(lastDay) };
    }
    case 'ano': {
      const firstDay = new Date(y, 0, 1);
      const lastDay = new Date(y, 11, 31);
      return { startDate: toLocalYmd(firstDay), endDate: toLocalYmd(lastDay) };
    }
  }
}


export { 
  COMMISSION_ELIGIBLE_STATUSES,
  END_OF_MONTH_TRANSIT_STATUSES,
  getShipmentEffectiveYmd,
  isShipmentLoadedAtEndOfMonth,
  isShipmentEligibleByEndOfMonthException,
  isShipmentEligibleForCommission,
  canViewPredictedCommission,
  isShipmentPredictedForCommission
} from './utils/financialCalculations';
