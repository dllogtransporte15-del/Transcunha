export const formatCPF = (value: string): string => {
  const numeric = value.replace(/\D/g, '').slice(0, 11);
  return numeric.replace(/(\d{3})(\d{3})?(\d{3})?(\d{2})?/, (_, p1, p2, p3, p4) => {
    let res = p1;
    if (p2) res += `.${p2}`;
    if (p3) res += `.${p3}`;
    if (p4) res += `-${p4}`;
    return res;
  });
};

export const formatPhone = (value: string): string => {
  const numeric = value.replace(/\D/g, '').slice(0, 11);
  if (numeric.length === 0) return '';
  if (numeric.length <= 2) return `(${numeric}`;
  if (numeric.length <= 6) return `(${numeric.slice(0, 2)}) ${numeric.slice(2)}`;
  if (numeric.length <= 10) return `(${numeric.slice(0, 2)}) ${numeric.slice(2, 6)}-${numeric.slice(6)}`;
  return `(${numeric.slice(0, 2)}) ${numeric.slice(2, 7)}-${numeric.slice(7)}`;
};

export const formatName = (value: string): string => {
  const prepositions = ['da', 'de', 'do', 'dos', 'das', 'e'];
  return value
    .split(' ')
    .map((word, index) => {
      if (word.length === 0) return '';
      const lower = word.toLowerCase();
      if (index > 0 && prepositions.includes(lower)) {
        return lower;
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
};

export const formatCityState = (value: string): string => {
  // Try to parse "Cidade, UF"
  const commaIndex = value.indexOf(',');
  if (commaIndex !== -1) {
    const city = formatName(value.slice(0, commaIndex).trim());
    const statePart = value.slice(commaIndex + 1).replace(/[^a-zA-Z]/g, '').slice(0, 2).toUpperCase();
    return statePart ? `${city}, ${statePart}` : `${city}, `;
  }

  return formatName(value);
};

export const formatCpfCnpj = (value: string): string => {
  const numeric = value.replace(/\D/g, '').slice(0, 14);
  if (numeric.length <= 11) {
    return formatCPF(numeric);
  }
  return numeric.replace(/(\d{2})(\d{3})?(\d{3})?(\d{4})?(\d{2})?/, (_, p1, p2, p3, p4, p5) => {
    let res = p1;
    if (p2) res += `.${p2}`;
    if (p3) res += `.${p3}`;
    if (p4) res += `/${p4}`;
    if (p5) res += `-${p5}`;
    return res;
  });
};

export const autoFormatInput = (name: string, value: string): string => {
  if (!value) return value;
  
  const lowerName = name.toLowerCase();
  
  if (lowerName.includes('location') || lowerName.includes('maplink')) {
    return value;
  }

  // Preservação estrita: campos de e-mail e senha nunca sofrem formatação de caixa ou máscara indevida
  if (
    lowerName.includes('email') ||
    lowerName.includes('mail') ||
    lowerName.includes('senha') ||
    lowerName.includes('password') ||
    lowerName.includes('pass')
  ) {
    return value;
  }

  if (lowerName === 'cpf' || lowerName === 'drivercpf' || lowerName === 'ownercpf') {
    return formatCPF(value);
  }
  if (lowerName.includes('cpfcnpj') || lowerName.includes('cnpj')) {
    return formatCpfCnpj(value);
  }
  if (lowerName.includes('phone') || lowerName.includes('telefone')) {
    return formatPhone(value);
  }
  if (lowerName.includes('origem') || lowerName.includes('destino') || lowerName.includes('origin') || lowerName.includes('destination') || lowerName === 'city') {
    return formatCityState(value);
  }
  return value;
};

export const FRETEBRAS_VEHICLE_MAP: Record<string, string | null> = {
  'LS Simples': null,
  'Cavalo 4e': null,
  'Bitrem 8e': null,
  'Rodotrem (3x3)': 'Bitrem 9 eixos',
  'Carreta 4e': 'Carreta 4º eixo',
  'Bitrem 7e': 'Bitrem 7 eixos',
  'LS Trucada': 'Carreta LS',
  'Vanderleia': 'Vanderléia',
  'Caminhão Truck': 'Truck',
};

export const formatFretebrasVehicleTypes = (allowed?: { setType: string }[]): string => {
  if (!allowed || allowed.length === 0) return '';
  const mapped = allowed
    .map(t => {
      const typeStr = t.setType;
      if (Object.prototype.hasOwnProperty.call(FRETEBRAS_VEHICLE_MAP, typeStr)) {
        return FRETEBRAS_VEHICLE_MAP[typeStr];
      }
      return typeStr;
    })
    .filter((t): t is string => t !== null && t !== undefined && t !== '');

  return [...new Set(mapped)].join(', ');
};


