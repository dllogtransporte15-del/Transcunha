/**
 * Utility to geocode address strings using a resilient multi-tier strategy:
 * 1. Pre-populated offline database for Brazilian logistics hubs & cities (0ms, 100% reliable)
 * 2. LocalStorage persistent cache (0ms)
 * 3. In-flight Promise deduplication (prevents duplicate parallel requests)
 * 4. Photon OpenStreetMap Geocoding API (Fast, CORS-friendly, no restrictive 1 req/sec ban)
 * 5. OpenStreetMap Nominatim API (Fallback)
 */

export interface GeocodeResult {
  lat: number;
  lng: number;
  label?: string;
}

// Normaliza texto de cidade para chave de cache/busca (remove acentos, pontuação e espaços extras)
export function normalizeCityKey(query: string): string {
  if (!query) return '';
  return query
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove acentos
    .replace(/[\-\/,]/g, ' ')       // substitui hífens, barras e vírgulas por espaço
    .replace(/\s+/g, ' ')          // unifica múltiplos espaços
    .trim();
}

/**
 * Base de dados local com centenas de cidades e polos logísticos brasileiros.
 * Garante funcionamento instantâneo e offline para as rotas mais comuns.
 */
const OFFLINE_CITIES: Record<string, { lat: number; lng: number; label: string }> = {
  // Triângulo Mineiro & Alto Paranaíba & MG
  'uberaba mg': { lat: -19.7483, lng: -47.9319, label: 'Uberaba, MG, Brasil' },
  'sacramento mg': { lat: -19.8653, lng: -47.4403, label: 'Sacramento, MG, Brasil' },
  'uberlandia mg': { lat: -18.9186, lng: -48.2772, label: 'Uberlândia, MG, Brasil' },
  'araguari mg': { lat: -18.6472, lng: -48.1872, label: 'Araguari, MG, Brasil' },
  'araxa mg': { lat: -19.5933, lng: -46.9406, label: 'Araxá, MG, Brasil' },
  'patos de minas mg': { lat: -18.5789, lng: -46.5181, label: 'Patos de Minas, MG, Brasil' },
  'patrocinio mg': { lat: -18.9433, lng: -46.9944, label: 'Patrocínio, MG, Brasil' },
  'guarda mor mg': { lat: -17.7769, lng: -47.1042, label: 'Guarda-Mor, MG, Brasil' },
  'passos mg': { lat: -20.7230, lng: -46.6110, label: 'Passos, MG, Brasil' },
  'iturama mg': { lat: -19.7286, lng: -50.1956, label: 'Iturama, MG, Brasil' },
  'frutal mg': { lat: -20.0247, lng: -48.9406, label: 'Frutal, MG, Brasil' },
  'unai mg': { lat: -16.3575, lng: -46.9056, label: 'Unaí, MG, Brasil' },
  'paracatu mg': { lat: -17.2222, lng: -46.8747, label: 'Paracatu, MG, Brasil' },
  'joao pinheiro mg': { lat: -17.7428, lng: -46.1725, label: 'João Pinheiro, MG, Brasil' },
  'monte carmelo mg': { lat: -18.7258, lng: -47.4983, label: 'Monte Carmelo, MG, Brasil' },
  'coromandel mg': { lat: -18.4736, lng: -47.2003, label: 'Coromandel, MG, Brasil' },
  'ituiutaba mg': { lat: -18.9697, lng: -49.4653, label: 'Ituiutaba, MG, Brasil' },
  'nova ponte mg': { lat: -19.1417, lng: -47.6833, label: 'Nova Ponte, MG, Brasil' },
  'santa luzia mg': { lat: -19.7697, lng: -43.8514, label: 'Santa Luzia, MG, Brasil' },
  'lagamar mg': { lat: -18.1750, lng: -46.8083, label: 'Lagamar, MG, Brasil' },
  'presidente olegario mg': { lat: -18.4178, lng: -46.4181, label: 'Presidente Olegário, MG, Brasil' },
  'belo horizonte mg': { lat: -19.9167, lng: -43.9345, label: 'Belo Horizonte, MG, Brasil' },
  'contagem mg': { lat: -19.9322, lng: -44.0539, label: 'Contagem, MG, Brasil' },
  'betim mg': { lat: -19.9678, lng: -44.1983, label: 'Betim, MG, Brasil' },
  'juiz de fora mg': { lat: -21.7642, lng: -43.3497, label: 'Juiz de Fora, MG, Brasil' },
  'montes claros mg': { lat: -16.7281, lng: -43.8617, label: 'Montes Claros, MG, Brasil' },
  'divinopolis mg': { lat: -20.1439, lng: -44.8917, label: 'Divinópolis, MG, Brasil' },
  'governador valadares mg': { lat: -18.8511, lng: -41.9494, label: 'Governador Valadares, MG, Brasil' },
  'ipatinga mg': { lat: -19.4689, lng: -42.5369, label: 'Ipatinga, MG, Brasil' },
  'seto lagoas mg': { lat: -19.4658, lng: -44.2467, label: 'Sete Lagoas, MG, Brasil' },
  'sete lagoas mg': { lat: -19.4658, lng: -44.2467, label: 'Sete Lagoas, MG, Brasil' },
  'pocos de caldas mg': { lat: -21.7878, lng: -46.5614, label: 'Poços de Caldas, MG, Brasil' },
  'pouso alegre mg': { lat: -22.2300, lng: -45.9364, label: 'Pouso Alegre, MG, Brasil' },
  'varginha mg': { lat: -21.5517, lng: -45.4303, label: 'Varginha, MG, Brasil' },

  // Goiás & DF
  'catalao go': { lat: -18.1691, lng: -47.9463, label: 'Catalão, GO, Brasil' },
  'rio verde go': { lat: -17.7915, lng: -50.9202, label: 'Rio Verde, GO, Brasil' },
  'goiania go': { lat: -16.6869, lng: -49.2648, label: 'Goiânia, GO, Brasil' },
  'aparecida de goiania go': { lat: -16.8228, lng: -49.2481, label: 'Aparecida de Goiânia, GO, Brasil' },
  'anapolis go': { lat: -16.3267, lng: -48.9528, label: 'Anápolis, GO, Brasil' },
  'cristalina go': { lat: -16.7686, lng: -47.6133, label: 'Cristalina, GO, Brasil' },
  'jatai go': { lat: -17.8814, lng: -51.7144, label: 'Jataí, GO, Brasil' },
  'itumbiara go': { lat: -18.4189, lng: -49.2153, label: 'Itumbiara, GO, Brasil' },
  'goiatuba go': { lat: -18.0125, lng: -49.3556, label: 'Goiatuba, GO, Brasil' },
  'mineiros go': { lat: -17.5694, lng: -52.5514, label: 'Mineiros, GO, Brasil' },
  'formosa go': { lat: -15.5367, lng: -47.3344, label: 'Formosa, GO, Brasil' },
  'luziania go': { lat: -16.2528, lng: -47.9500, label: 'Luziânia, GO, Brasil' },
  'caldas novas go': { lat: -17.7442, lng: -48.6258, label: 'Caldas Novas, GO, Brasil' },
  'ipora go': { lat: -16.4419, lng: -51.1178, label: 'Iporá, GO, Brasil' },
  'senador canedo go': { lat: -16.7083, lng: -49.0917, label: 'Senador Canedo, GO, Brasil' },
  'trindade go': { lat: -16.6506, lng: -49.4897, label: 'Trindade, GO, Brasil' },
  'santa helena de goias go': { lat: -17.8136, lng: -50.5969, label: 'Santa Helena de Goiás, GO, Brasil' },
  'brasilia df': { lat: -15.7975, lng: -47.8919, label: 'Brasília, DF, Brasil' },

  // São Paulo
  'sao paulo sp': { lat: -23.5505, lng: -46.6333, label: 'São Paulo, SP, Brasil' },
  'santos sp': { lat: -23.9608, lng: -46.3339, label: 'Santos, SP, Brasil' },
  'guaruja sp': { lat: -23.9930, lng: -46.2570, label: 'Guarujá, SP, Brasil' },
  'cubatao sp': { lat: -23.8950, lng: -46.4253, label: 'Cubatão, SP, Brasil' },
  'campinas sp': { lat: -22.9099, lng: -47.0626, label: 'Campinas, SP, Brasil' },
  'ribeirao preto sp': { lat: -21.1767, lng: -47.8208, label: 'Ribeirão Preto, SP, Brasil' },
  'franca sp': { lat: -20.5386, lng: -47.4008, label: 'Franca, SP, Brasil' },
  'sao jose do rio preto sp': { lat: -20.8113, lng: -49.3758, label: 'São José do Rio Preto, SP, Brasil' },
  'sorocaba sp': { lat: -23.5015, lng: -47.4526, label: 'Sorocaba, SP, Brasil' },
  'barretos sp': { lat: -20.5572, lng: -48.5678, label: 'Barretos, SP, Brasil' },
  'pontes gestal sp': { lat: -20.1772, lng: -49.7042, label: 'Pontes Gestal, SP, Brasil' },
  'castilho sp': { lat: -20.8661, lng: -51.4883, label: 'Castilho, SP, Brasil' },
  'pereira barreto sp': { lat: -20.6381, lng: -51.1097, label: 'Pereira Barreto, SP, Brasil' },
  'aracatuba sp': { lat: -21.2089, lng: -50.4328, label: 'Araçatuba, SP, Brasil' },
  'bauru sp': { lat: -22.3147, lng: -49.0606, label: 'Bauru, SP, Brasil' },
  'piracicaba sp': { lat: -22.7338, lng: -47.6476, label: 'Piracicaba, SP, Brasil' },
  'limeira sp': { lat: -22.5647, lng: -47.4017, label: 'Limeira, SP, Brasil' },
  'paulinia sp': { lat: -22.7611, lng: -47.1539, label: 'Paulínia, SP, Brasil' },
  'jundiai sp': { lat: -23.1857, lng: -46.8978, label: 'Jundiaí, SP, Brasil' },
  'sao carlos sp': { lat: -22.0175, lng: -47.8908, label: 'São Carlos, SP, Brasil' },
  'araraquara sp': { lat: -21.7944, lng: -48.1758, label: 'Araraquara, SP, Brasil' },
  'presidente prudente sp': { lat: -22.1256, lng: -51.3889, label: 'Presidente Prudente, SP, Brasil' },
  'marilia sp': { lat: -22.2139, lng: -49.9458, label: 'Marília, SP, Brasil' },
  'oulinhos sp': { lat: -22.9789, lng: -49.8706, label: 'Ourinhos, SP, Brasil' },
  'ourinhos sp': { lat: -22.9789, lng: -49.8706, label: 'Ourinhos, SP, Brasil' },
  'assis sp': { lat: -22.6617, lng: -50.4178, label: 'Assis, SP, Brasil' },
  'guarulhos sp': { lat: -23.4542, lng: -46.5333, label: 'Guarulhos, SP, Brasil' },
  'sao bernardo do campo sp': { lat: -23.6939, lng: -46.5650, label: 'São Bernardo do Campo, SP, Brasil' },

  // Mato Grosso & Mato Grosso do Sul
  'cuiaba mt': { lat: -15.6010, lng: -56.0974, label: 'Cuiabá, MT, Brasil' },
  'varzea grande mt': { lat: -15.6469, lng: -56.1325, label: 'Várzea Grande, MT, Brasil' },
  'rondonopolis mt': { lat: -16.4674, lng: -54.6347, label: 'Rondonópolis, MT, Brasil' },
  'sinop mt': { lat: -11.8598, lng: -55.5031, label: 'Sinop, MT, Brasil' },
  'sorriso mt': { lat: -12.5507, lng: -55.7126, label: 'Sorriso, MT, Brasil' },
  'lucas do rio verde mt': { lat: -13.0645, lng: -55.9103, label: 'Lucas do Rio Verde, MT, Brasil' },
  'nova mutum mt': { lat: -13.8294, lng: -56.0792, label: 'Nova Mutum, MT, Brasil' },
  'primavera do leste mt': { lat: -15.5591, lng: -54.2965, label: 'Primavera do Leste, MT, Brasil' },
  'campo verde mt': { lat: -15.5456, lng: -55.1669, label: 'Campo Verde, MT, Brasil' },
  'campo novo do parecis mt': { lat: -13.6756, lng: -57.8897, label: 'Campo Novo do Parecis, MT, Brasil' },
  'sapezal mt': { lat: -13.5475, lng: -58.8144, label: 'Sapezal, MT, Brasil' },
  'tangara da serra mt': { lat: -14.6228, lng: -57.4933, label: 'Tangará da Serra, MT, Brasil' },
  'barra do garcas mt': { lat: -15.8900, lng: -52.2567, label: 'Barra do Garças, MT, Brasil' },
  'querencia mt': { lat: -12.6078, lng: -52.1906, label: 'Querência, MT, Brasil' },
  'confresa mt': { lat: -10.6439, lng: -51.5694, label: 'Confresa, MT, Brasil' },
  'caceres mt': { lat: -16.0764, lng: -57.6817, label: 'Cáceres, MT, Brasil' },
  'diamantino mt': { lat: -14.4042, lng: -56.4461, label: 'Diamantino, MT, Brasil' },
  'alta floresta mt': { lat: -9.8756, lng: -56.0861, label: 'Alta Floresta, MT, Brasil' },
  'alto araguaia mt': { lat: -17.3147, lng: -53.2158, label: 'Alto Araguaia, MT, Brasil' },

  'campo grande ms': { lat: -20.4697, lng: -54.6201, label: 'Campo Grande, MS, Brasil' },
  'dourados ms': { lat: -22.2235, lng: -54.8064, label: 'Dourados, MS, Brasil' },
  'tres lagoas ms': { lat: -20.7847, lng: -51.7042, label: 'Três Lagoas, MS, Brasil' },
  'rio verde de mato grosso ms': { lat: -18.9181, lng: -54.8442, label: 'Rio Verde de Mato Grosso, MS, Brasil' },
  'maracaju ms': { lat: -21.6144, lng: -55.1683, label: 'Maracaju, MS, Brasil' },
  'ponta pora ms': { lat: -22.5361, lng: -55.7256, label: 'Ponta Porã, MS, Brasil' },
  'navirai ms': { lat: -23.0650, lng: -54.1906, label: 'Naviraí, MS, Brasil' },
  'nova andradina ms': { lat: -22.2397, lng: -53.3431, label: 'Nova Andradina, MS, Brasil' },
  'sao gabriel do oeste ms': { lat: -19.3925, lng: -54.5658, label: 'São Gabriel do Oeste, MS, Brasil' },
  'sidrolandia ms': { lat: -20.9319, lng: -54.9614, label: 'Sidrolândia, MS, Brasil' },
  'corumba ms': { lat: -19.0097, lng: -57.6533, label: 'Corumbá, MS, Brasil' },
  'chapadão do sul ms': { lat: -18.7933, lng: -52.6219, label: 'Chapadão do Sul, MS, Brasil' },
  'chapadao do sul ms': { lat: -18.7933, lng: -52.6219, label: 'Chapadão do Sul, MS, Brasil' },
  'costa rica ms': { lat: -18.5433, lng: -53.1286, label: 'Costa Rica, MS, Brasil' },

  // Paraná & Santa Catarina & Rio Grande do Sul
  'curitiba pr': { lat: -25.4284, lng: -49.2733, label: 'Curitiba, PR, Brasil' },
  'paranagua pr': { lat: -25.5204, lng: -48.5093, label: 'Paranaguá, PR, Brasil' },
  'londrina pr': { lat: -23.3045, lng: -51.1696, label: 'Londrina, PR, Brasil' },
  'maringa pr': { lat: -23.4210, lng: -51.9331, label: 'Maringá, PR, Brasil' },
  'cascavel pr': { lat: -24.9578, lng: -53.4595, label: 'Cascavel, PR, Brasil' },
  'foz do iguacu pr': { lat: -25.5469, lng: -54.5882, label: 'Foz do Iguaçu, PR, Brasil' },
  'ponta grossa pr': { lat: -25.0994, lng: -50.1583, label: 'Ponta Grossa, PR, Brasil' },
  'guarapuava pr': { lat: -25.3906, lng: -51.4628, label: 'Guarapuava, PR, Brasil' },
  'toledo pr': { lat: -24.7139, lng: -53.7431, label: 'Toledo, PR, Brasil' },
  'campo mourao pr': { lat: -24.0458, lng: -52.3789, label: 'Campo Mourão, PR, Brasil' },
  'castro pr': { lat: -24.7911, lng: -50.0119, label: 'Castro, PR, Brasil' },

  'itajai sc': { lat: -26.9078, lng: -48.6619, label: 'Itajaí, SC, Brasil' },
  'florianopolis sc': { lat: -27.5954, lng: -48.5480, label: 'Florianópolis, SC, Brasil' },
  'joinville sc': { lat: -26.3045, lng: -48.8487, label: 'Joinville, SC, Brasil' },
  'blumenau sc': { lat: -26.9194, lng: -49.0661, label: 'Blumenau, SC, Brasil' },
  'chapeco sc': { lat: -27.1004, lng: -52.6152, label: 'Chapecó, SC, Brasil' },
  'sao francisco do sul sc': { lat: -26.2433, lng: -48.6381, label: 'São Francisco do Sul, SC, Brasil' },
  'imbituba sc': { lat: -28.2400, lng: -48.6703, label: 'Imbituba, SC, Brasil' },

  'porto alegre rs': { lat: -30.0346, lng: -51.2177, label: 'Porto Alegre, RS, Brasil' },
  'rio grande rs': { lat: -32.0350, lng: -52.0986, label: 'Rio Grande, RS, Brasil' },
  'passo fundo rs': { lat: -28.2612, lng: -52.4083, label: 'Passo Fundo, RS, Brasil' },
  'caxias do sul rs': { lat: -29.1678, lng: -51.1794, label: 'Caxias do Sul, RS, Brasil' },
  'santa maria rs': { lat: -29.6842, lng: -53.8069, label: 'Santa Maria, RS, Brasil' },
  'pelotas rs': { lat: -31.7654, lng: -52.3376, label: 'Pelotas, RS, Brasil' },
  'ijui rs': { lat: -28.3878, lng: -53.9147, label: 'Ijuí, RS, Brasil' },
  'cruz alta rs': { lat: -28.6389, lng: -53.6064, label: 'Cruz Alta, RS, Brasil' },

  // Bahia, Matopiba & Outros Estados
  'luis eduardo magalhaes ba': { lat: -12.0968, lng: -45.7872, label: 'Luís Eduardo Magalhães, BA, Brasil' },
  'barreiras ba': { lat: -12.1528, lng: -44.9978, label: 'Barreiras, BA, Brasil' },
  'salvador ba': { lat: -12.9777, lng: -38.5016, label: 'Salvador, BA, Brasil' },
  'feira de santana ba': { lat: -12.2664, lng: -38.9663, label: 'Feira de Santana, BA, Brasil' },
  'vitoria da conquista ba': { lat: -14.8661, lng: -40.8394, label: 'Vitória da Conquista, BA, Brasil' },
  'ilheus ba': { lat: -14.7936, lng: -39.0464, label: 'Ilhéus, BA, Brasil' },
  'candeias ba': { lat: -12.6719, lng: -38.5283, label: 'Candeias, BA, Brasil' },
  'palmas to': { lat: -10.1844, lng: -48.3336, label: 'Palmas, TO, Brasil' },
  'porto nacional to': { lat: -10.7083, lng: -48.4172, label: 'Porto Nacional, TO, Brasil' },
  'araguaina to': { lat: -7.1911, lng: -48.2072, label: 'Araguaína, TO, Brasil' },
  'gurupi to': { lat: -11.7297, lng: -49.0686, label: 'Gurupi, TO, Brasil' },
  'balsas ma': { lat: -7.5322, lng: -46.0378, label: 'Balsas, MA, Brasil' },
  'imperatriz ma': { lat: -5.5264, lng: -47.4778, label: 'Imperatriz, MA, Brasil' },
  'sao luis ma': { lat: -2.5307, lng: -44.3068, label: 'São Luís, MA, Brasil' },
  'porto velho ro': { lat: -8.7619, lng: -63.9039, label: 'Porto Velho, RO, Brasil' },
  'vilhena ro': { lat: -12.7406, lng: -60.1458, label: 'Vilhena, RO, Brasil' },
  'ji parana ro': { lat: -10.8828, lng: -61.9458, label: 'Ji-Paraná, RO, Brasil' },
  'ariquemes ro': { lat: -9.9133, lng: -63.0408, label: 'Ariquemes, RO, Brasil' },
  'rio de janeiro rj': { lat: -22.9068, lng: -43.1729, label: 'Rio de Janeiro, RJ, Brasil' },
  'vitoria es': { lat: -20.3155, lng: -40.3128, label: 'Vitória, ES, Brasil' },
  'linhares es': { lat: -19.3911, lng: -40.0722, label: 'Linhares, ES, Brasil' },
  'recife pe': { lat: -8.0578, lng: -34.8829, label: 'Recife, PE, Brasil' },
  'suape pe': { lat: -8.3972, lng: -34.9750, label: 'Suape, PE, Brasil' },
  'aracaju se': { lat: -10.9472, lng: -37.0731, label: 'Aracaju, SE, Brasil' },
  'maceio al': { lat: -9.6658, lng: -35.7353, label: 'Maceió, AL, Brasil' },
  'fortaleza ce': { lat: -3.7319, lng: -38.5267, label: 'Fortaleza, CE, Brasil' },
  'natal rn': { lat: -5.7945, lng: -35.2110, label: 'Natal, RN, Brasil' },
  'joao pessoa pb': { lat: -7.1150, lng: -34.8631, label: 'João Pessoa, PB, Brasil' },
  'teresina pi': { lat: -5.0920, lng: -42.8038, label: 'Teresina, PI, Brasil' },
  'belem pa': { lat: -1.4558, lng: -48.4902, label: 'Belém, PA, Brasil' },
  'barcarena pa': { lat: -1.5058, lng: -48.6258, label: 'Barcarena, PA, Brasil' },
  'santarem pa': { lat: -2.4431, lng: -54.7083, label: 'Santarém, PA, Brasil' },
  'maraba pa': { lat: -5.3686, lng: -49.1178, label: 'Marabá, PA, Brasil' },
  'manaus am': { lat: -3.1190, lng: -60.0217, label: 'Manaus, AM, Brasil' },
};

// Cache dinâmico em memória para resultados de APIs externas durante a sessão
const memoryCache: Record<string, GeocodeResult | null> = {};

// Gerenciamento de Promises em trânsito para evitar chamadas duplicadas simultâneas
const pendingPromises: Record<string, Promise<GeocodeResult | null>> = {};

/**
 * Busca coordenada estática ou no cache de forma síncrona
 */
export function getCoordsSync(query: string): { lat: number; lng: number } | null {
  if (!query || !query.trim()) return null;
  const key = normalizeCityKey(query);

  if (OFFLINE_CITIES[key]) {
    return { lat: OFFLINE_CITIES[key].lat, lng: OFFLINE_CITIES[key].lng };
  }

  // Tenta chave sem sigla se houver
  const firstWord = key.split(' ')[0];
  if (OFFLINE_CITIES[firstWord]) {
    return { lat: OFFLINE_CITIES[firstWord].lat, lng: OFFLINE_CITIES[firstWord].lng };
  }

  if (memoryCache[key]) {
    return { lat: memoryCache[key]!.lat, lng: memoryCache[key]!.lng };
  }

  return null;
}

/**
 * Geocodifica um endereço ou cidade utilizando estratégia multi-tier resiliente
 */
export async function geocodeCity(query: string): Promise<GeocodeResult | null> {
  if (!query || !query.trim()) return null;
  const key = normalizeCityKey(query);

  // 1. Tenta base de dados offline local (0ms, 100% resiliente)
  if (OFFLINE_CITIES[key]) {
    return OFFLINE_CITIES[key];
  }

  // 1.1 Tenta busca parcial na base offline (ex: "uberaba" correspondendo a "uberaba mg")
  const offlineMatchKey = Object.keys(OFFLINE_CITIES).find(
    k => k === key || k.startsWith(key + ' ') || key.startsWith(k + ' ')
  );
  if (offlineMatchKey && OFFLINE_CITIES[offlineMatchKey]) {
    return OFFLINE_CITIES[offlineMatchKey];
  }

  // 2. Cache em memória
  if (memoryCache[key] !== undefined) {
    return memoryCache[key];
  }

  // 3. Cache persistente no LocalStorage do navegador
  try {
    const lsItem = typeof window !== 'undefined' ? localStorage.getItem(`geocache_${key}`) : null;
    if (lsItem) {
      const parsed: GeocodeResult = JSON.parse(lsItem);
      if (parsed && typeof parsed.lat === 'number' && typeof parsed.lng === 'number') {
        memoryCache[key] = parsed;
        return parsed;
      }
    }
  } catch (e) {
    // Ignora erro de localStorage
  }

  // 4. Se já existe uma requisição em andamento para esta mesma query, reaproveita a Promise
  const existingPending = pendingPromises[key];
  if (existingPending) {
    return existingPending;
  }

  // Cria a Promise e registra no gerenciador de requisições pendentes
  const promise = (async (): Promise<GeocodeResult | null> => {
    try {
      const cleanAddress = query.trim().replace(/\s+-\s+Brasil$/i, '').replace(/,\s*Brasil$/i, '');

      // ── TIER A: Photon API (Komoot / OpenStreetMap) ──
      // Altamente confiável, suporte CORS nativo, sem limitação estrita de 1 req/s
      try {
        const photonUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(cleanAddress + ' Brasil')}&limit=3`;
        const resPhoton = await fetch(photonUrl);
        if (resPhoton.ok) {
          const dataPhoton = await resPhoton.json();
          if (dataPhoton && dataPhoton.features && dataPhoton.features.length > 0) {
            // Prioriza resultado com país Brasil ou qualquer resultado válido
            const feature = dataPhoton.features.find(
              (f: any) => f.properties?.country === 'Brasil' || f.properties?.countrycode === 'BR'
            ) || dataPhoton.features[0];

            if (feature?.geometry?.coordinates) {
              const [lon, lat] = feature.geometry.coordinates;
              const label = [
                feature.properties?.name,
                feature.properties?.state,
                feature.properties?.country || 'Brasil'
              ].filter(Boolean).join(', ');

              const result: GeocodeResult = {
                lat: Number(lat),
                lng: Number(lon),
                label: label || query
              };

              saveToCache(key, result);
              return result;
            }
          }
        }
      } catch (errPhoton) {
        console.warn(`Photon geocode falhou para "${query}", tentando Nominatim:`, errPhoton);
      }

      // ── TIER B: Nominatim OSM API (Fallback) ──
      try {
        const nominatimUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(cleanAddress + ', Brasil')}&limit=1&accept-language=pt-br&countrycodes=br`;
        const resNom = await fetch(nominatimUrl, {
          headers: {
            'Accept-Language': 'pt-BR'
          }
        });

        if (resNom.ok) {
          const dataNom = await resNom.json();
          if (dataNom && dataNom.length > 0) {
            const result: GeocodeResult = {
              lat: parseFloat(dataNom[0].lat),
              lng: parseFloat(dataNom[0].lon),
              label: dataNom[0].display_name
            };

            saveToCache(key, result);
            return result;
          }
        }
      } catch (errNom) {
        console.warn(`Nominatim geocode falhou para "${query}":`, errNom);
      }

      // Se nenhum retornou resultado
      memoryCache[key] = null;
      return null;
    } finally {
      delete pendingPromises[key];
    }
  })();

  pendingPromises[key] = promise;
  return promise;
}

/**
 * Salva no cache de memória e LocalStorage
 */
function saveToCache(key: string, result: GeocodeResult) {
  memoryCache[key] = result;
  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem(`geocache_${key}`, JSON.stringify(result));
    }
  } catch (e) {
    // Ignora erro de cota de localStorage
  }
}

/**
 * Alias compatível para fetchCoordinates
 */
export async function fetchCoordinates(query: string): Promise<GeocodeResult | null> {
  return geocodeCity(query);
}
