import React, { useMemo, useState, useEffect } from 'react';
import type { Shipment, Cargo } from '../types';
import { ShipmentStatus, CargoStatus } from '../types';
import { MapPin, Navigation, Sparkles, Layers } from 'lucide-react';
import { BRAZIL_STATES, REGIONS_CONFIG, UF_TO_REGION, BrazilStateInfo } from './brazilMapData';
import { getCoordsSync, geocodeCity } from '../utils/geocoding';

interface DeliveriesByRegionCardProps {
  shipments: Shipment[];
  cargos: Cargo[];
  dateRangeBounds?: { start: number | null; end: number | null };
  periodLabel?: string;
  className?: string;
}

// Dicionário de polos e cidades comuns para inferência de UF caso não venha expressa
const COMMON_CITY_TO_UF: Record<string, string> = {
  SANTOS: 'SP',
  CAMPINAS: 'SP',
  'RIBEIRAO PRETO': 'SP',
  'RIBEIRÃO PRETO': 'SP',
  'SAO PAULO': 'SP',
  'SÃO PAULO': 'SP',
  'PONTES GESTAL': 'SP',
  BARRETOS: 'SP',
  'PEREIRA BARRETO': 'SP',
  CASTILHO: 'SP',
  PARANAGUA: 'PR',
  'PARANAGUÁ': 'PR',
  CURITIBA: 'PR',
  LONDRINA: 'PR',
  MARINGA: 'PR',
  'MARINGÁ': 'PR',
  UBERABA: 'MG',
  UBERLANDIA: 'MG',
  'UBERLÂNDIA': 'MG',
  'SANTA LUZIA': 'MG',
  'NOVA PONTE': 'MG',
  'PATROCINIO': 'MG',
  'PATROCÍNIO': 'MG',
  LAGAMAR: 'MG',
  'BELO HORIZONTE': 'MG',
  'RIO VERDE': 'GO',
  ITUMBIARA: 'GO',
  GOIANIA: 'GO',
  'GOIÂNIA': 'GO',
  MINEIROS: 'GO',
  CATALAO: 'GO',
  'CATALÃO': 'GO',
  RONDONOPOLIS: 'MT',
  'RONDONÓPOLIS': 'MT',
  CUIABA: 'MT',
  'CUIABÁ': 'MT',
  SORRISO: 'MT',
  'LUCAS DO RIO VERDE': 'MT',
  SINOP: 'MT',
  'CAMPO GRANDE': 'MS',
  DOURADOS: 'MS',
  'TRES LAGOAS': 'MS',
  'TRÊS LAGOAS': 'MS',
  ITAQUI: 'MA',
  'SAO LUIS': 'MA',
  'SÃO LUÍS': 'MA',
  BARCARENA: 'PA',
  BELEM: 'PA',
  'BELÉM': 'PA',
  SUAPE: 'PE',
  RECIFE: 'PE',
  SALVADOR: 'BA',
  'LUIS EDUARDO MAGALHAES': 'BA',
  'LUÍS EDUARDO MAGALHÃES': 'BA',
  'PORTO ALEGRE': 'RS',
  'RIO GRANDE': 'RS',
  'PASSO FUNDO': 'RS',
  ITAJAI: 'SC',
  'ITAJAÍ': 'SC',
  JOINVILLE: 'SC',
  VITORIA: 'ES',
  'VITÓRIA': 'ES',
};

const ALL_UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA',
  'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN',
  'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'
];

// Conversão matemática calibrada entre coordenadas GPS (lat, lng) e o viewBox SVG do Brasil (460 x 465)
export const gpsToSvg = (lat: number, lng: number): { x: number; y: number } => {
  const rawX = 11.9131 * lng - 0.7335 * lat + 830.58;
  const rawY = 0.3895 * lng - 10.9300 * lat + 97.90;
  return {
    x: Math.round(Math.max(18, Math.min(442, rawX))),
    y: Math.round(Math.max(18, Math.min(448, rawY)))
  };
};

// Dicionário de centroides dos estados
const STATE_CENTROIDS: Record<string, { x: number; y: number }> = {};
BRAZIL_STATES.forEach(st => {
  STATE_CENTROIDS[st.id] = { x: st.x, y: st.y };
});

// Pontos de dispersão simulada quando não houver cargas cadastradas em aberto
const REGION_CLUSTER_GLOW_POINTS: Record<string, Array<{ x: number; y: number; r: number; delay?: string }>> = {
  Sudeste: [
    { x: 300, y: 340, r: 6, delay: '0s' },
    { x: 285, y: 325, r: 8, delay: '0.4s' },
    { x: 320, y: 350, r: 5, delay: '0.8s' },
    { x: 345, y: 300, r: 9, delay: '0.2s' },
    { x: 330, y: 280, r: 6, delay: '0.6s' },
    { x: 360, y: 320, r: 7, delay: '1s' },
    { x: 375, y: 305, r: 5, delay: '0.3s' },
  ],
  Sul: [
    { x: 260, y: 365, r: 7, delay: '0.2s' },
    { x: 280, y: 375, r: 8, delay: '0.7s' },
    { x: 275, y: 395, r: 6, delay: '0.4s' },
    { x: 245, y: 425, r: 7, delay: '0.1s' },
    { x: 235, y: 445, r: 8, delay: '0.9s' },
  ],
  Nordeste: [
    { x: 385, y: 220, r: 7, delay: '0.3s' },
    { x: 410, y: 240, r: 8, delay: '0.8s' },
    { x: 435, y: 195, r: 6, delay: '0.5s' },
    { x: 440, y: 170, r: 8, delay: '0.2s' },
    { x: 430, y: 145, r: 7, delay: '0.6s' },
    { x: 405, y: 130, r: 8, delay: '1.1s' },
    { x: 345, y: 135, r: 6, delay: '0.4s' },
  ],
  Norte: [
    { x: 255, y: 60, r: 7, delay: '0.5s' },
    { x: 270, y: 110, r: 8, delay: '0.1s' },
    { x: 220, y: 130, r: 6, delay: '0.8s' },
    { x: 125, y: 125, r: 7, delay: '0.3s' },
    { x: 135, y: 210, r: 6, delay: '0.7s' },
    { x: 295, y: 190, r: 6, delay: '0.9s' },
  ],
  'Centro-Oeste': [
    { x: 220, y: 230, r: 8, delay: '0.2s' },
    { x: 210, y: 260, r: 7, delay: '0.6s' },
    { x: 280, y: 270, r: 8, delay: '0.4s' },
    { x: 295, y: 252, r: 7, delay: '1.0s' },
    { x: 230, y: 320, r: 7, delay: '0.5s' },
  ]
};

// Constelação de conexões sutis de fundo
const BACKGROUND_NETWORK_LINES = [
  { x1: 285, y1: 332, x2: 331, y2: 288 },
  { x1: 285, y1: 332, x2: 249, y2: 358 },
  { x1: 249, y1: 358, x2: 267, y2: 392 },
  { x1: 267, y1: 392, x2: 233, y2: 419 },
  { x1: 285, y1: 332, x2: 267, y2: 268 },
  { x1: 267, y1: 268, x2: 207, y2: 216 },
  { x1: 267, y1: 268, x2: 218, y2: 305 },
  { x1: 331, y1: 288, x2: 365, y2: 216 },
  { x1: 365, y1: 216, x2: 412, y2: 170 },
  { x1: 412, y1: 170, x2: 395, y2: 126 },
  { x1: 267, y1: 268, x2: 289, y2: 190 },
  { x1: 289, y1: 190, x2: 241, y2: 111 },
  { x1: 241, y1: 111, x2: 249, y2: 45 },
  { x1: 241, y1: 111, x2: 95, y2: 112 },
  { x1: 207, y1: 216, x2: 121, y2: 198 },
];

export interface CargoMapPoint {
  id: string;
  cargoId: string;
  sequenceId: number;
  type: 'origin' | 'destination';
  cityName: string;
  fullRoute: string;
  x: number;
  y: number;
  uf: string | null;
  region: string;
  scheduledVolume: number;
  loadedVolume: number;
  pendingVolume: number;
  status: CargoStatus;
}

export interface CargoMapRoute {
  cargoId: string;
  sequenceId: number;
  origin: CargoMapPoint;
  destination: CargoMapPoint;
  pathD: string;
  pendingVolume: number;
}

export const DeliveriesByRegionCard: React.FC<DeliveriesByRegionCardProps> = ({
  shipments,
  cargos,
  dateRangeBounds,
  periodLabel,
  className = ''
}) => {
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);
  const [hoveredState, setHoveredState] = useState<BrazilStateInfo | null>(null);
  const [hoveredCargoPoint, setHoveredCargoPoint] = useState<CargoMapPoint | null>(null);
  const [asyncCoords, setAsyncCoords] = useState<Record<string, { lat: number; lng: number }>>({});

  const cargoMap = useMemo(() => new Map(cargos.map(c => [c.id, c])), [cargos]);

  // Função de extração de UF
  const extractUfFromDestination = (rawText?: string): string | null => {
    if (!rawText) return null;
    const clean = rawText.toUpperCase().trim();

    // 1. Tentar pegar após vírgula, barra ou hífen (ex: "RIBEIRÃO PRETO, SP" ou "ITUMBIARA / GO")
    const match = clean.match(/(?:,|\/|-|\(|\s)\s*([A-Z]{2})\b/);
    if (match && ALL_UFS.includes(match[1])) {
      return match[1];
    }

    // 2. Se a string inteira é a UF (ex: "SP")
    if (ALL_UFS.includes(clean)) {
      return clean;
    }

    // 3. UF no final da string (ex: "UBERABA MG")
    const endMatch = clean.match(/\b([A-Z]{2})$/);
    if (endMatch && ALL_UFS.includes(endMatch[1])) {
      return endMatch[1];
    }

    // 4. Busca no dicionário de cidades conhecidas
    for (const [city, uf] of Object.entries(COMMON_CITY_TO_UF)) {
      if (clean.includes(city)) {
        return uf;
      }
    }

    return null;
  };

  // Efeito para geocodificar cidades desconhecidas em segundo plano
  useEffect(() => {
    const unfinishedCargos = cargos.filter(c => c.status !== CargoStatus.Fechada);
    unfinishedCargos.forEach(async (c) => {
      const places = [c.origin, c.originLocation, c.destination, c.destinationLocation].filter(Boolean) as string[];
      for (const place of places) {
        if (!getCoordsSync(place) && !asyncCoords[place]) {
          try {
            const res = await geocodeCity(place);
            if (res) {
              setAsyncCoords(prev => ({ ...prev, [place]: { lat: res.lat, lng: res.lng } }));
            }
          } catch {
            // Silently fallback to state centroids
          }
        }
      }
    });
  }, [cargos]);

  // Resolução de coordenadas e região para uma localidade
  const resolveLocationPoint = (
    rawText: string | undefined, 
    coordsFallback: { lat?: number; lng?: number } | undefined,
    seqId: number,
    isOrigin: boolean
  ): { x: number; y: number; lat?: number; lng?: number; uf: string | null; region: string } => {
    // 1. Coordenadas explícitas no cadastro da carga
    if (coordsFallback?.lat && coordsFallback?.lng) {
      const pt = gpsToSvg(coordsFallback.lat, coordsFallback.lng);
      const uf = extractUfFromDestination(rawText);
      const region = (uf && UF_TO_REGION[uf]) ? UF_TO_REGION[uf] : 'Sudeste';
      return { ...pt, lat: coordsFallback.lat, lng: coordsFallback.lng, uf, region };
    }

    // 2. Base de dados offline local ou geocodificação em cache
    if (rawText) {
      const geo = getCoordsSync(rawText) || asyncCoords[rawText];
      if (geo) {
        const pt = gpsToSvg(geo.lat, geo.lng);
        const uf = extractUfFromDestination(rawText);
        const region = (uf && UF_TO_REGION[uf]) ? UF_TO_REGION[uf] : 'Sudeste';
        return { ...pt, lat: geo.lat, lng: geo.lng, uf, region };
      }
    }

    // 3. Fallback inteligente via Centroide do Estado (com pequena dispersão para não sobrepor)
    const uf = extractUfFromDestination(rawText);
    if (uf && STATE_CENTROIDS[uf]) {
      const base = STATE_CENTROIDS[uf];
      const jitter = ((seqId * (isOrigin ? 7 : 13)) % 14) - 7;
      const region = UF_TO_REGION[uf] || 'Sudeste';
      return {
        x: base.x + jitter,
        y: base.y + (isOrigin ? -3 : 3),
        uf,
        region
      };
    }

    // Fallback central
    return { x: 267, y: 268, uf: 'GO', region: 'Centro-Oeste' };
  };

  // Cálculo e agregação dos embarques por Região e Estado
  const regionStats = useMemo(() => {
    const regionCounts: Record<string, { count: number; tonnage: number }> = {
      'Sudeste': { count: 0, tonnage: 0 },
      'Sul': { count: 0, tonnage: 0 },
      'Nordeste': { count: 0, tonnage: 0 },
      'Norte': { count: 0, tonnage: 0 },
      'Centro-Oeste': { count: 0, tonnage: 0 },
    };

    const stateCounts: Record<string, { count: number; tonnage: number }> = {};
    let totalMappedShipments = 0;
    let totalTonnage = 0;

    shipments.forEach(s => {
      if (s.status === ShipmentStatus.Cancelado) return;

      if (dateRangeBounds?.start || dateRangeBounds?.end) {
        const sDate = s.scheduledDate || s.createdAt;
        if (sDate) {
          const time = new Date(sDate).getTime();
          if (dateRangeBounds.start && time < dateRangeBounds.start) return;
          if (dateRangeBounds.end && time > dateRangeBounds.end) return;
        }
      }

      const cargo = cargoMap.get(s.cargoId);
      const destText = s.route || cargo?.destination || (s as any).destination || cargo?.destinationLocation || '';
      const uf = extractUfFromDestination(destText);
      const weight = s.shipmentTonnage || (s as any).loadedWeight || cargo?.scheduledVolume || 0;

      if (uf && UF_TO_REGION[uf]) {
        const region = UF_TO_REGION[uf];
        regionCounts[region].count += 1;
        regionCounts[region].tonnage += weight;
        totalMappedShipments += 1;
        totalTonnage += weight;

        if (!stateCounts[uf]) {
          stateCounts[uf] = { count: 0, tonnage: 0 };
        }
        stateCounts[uf].count += 1;
        stateCounts[uf].tonnage += weight;
      }
    });

    const hasData = totalMappedShipments > 0;
    const fallbackPercentages: Record<string, number> = {
      'Sudeste': 38.6,
      'Sul': 27.4,
      'Nordeste': 20.1,
      'Norte': 8.3,
      'Centro-Oeste': 5.6
    };

    const list = Object.keys(REGIONS_CONFIG).map(regionKey => {
      const config = REGIONS_CONFIG[regionKey];
      const data = regionCounts[regionKey];
      const pct = hasData
        ? Number(((data.count / totalMappedShipments) * 100).toFixed(1))
        : fallbackPercentages[regionKey];

      return {
        id: regionKey,
        name: config.name,
        color: config.color,
        glowColor: config.glowColor,
        textColor: config.textColor,
        dotBg: config.dotBg,
        dotShadow: config.dotShadow,
        count: data.count,
        tonnage: data.tonnage,
        percentage: pct
      };
    });

    list.sort((a, b) => b.percentage - a.percentage);

    return {
      regionsList: list,
      stateCounts,
      totalMappedShipments,
      totalTonnage,
      hasRealData: hasData
    };
  }, [shipments, cargoMap, dateRangeBounds]);

  // CÁLCULO EXATO DOS PONTOS DE ORIGENS E DESTINOS DAS CARGAS NÃO FINALIZADAS
  const activeCargosData = useMemo(() => {
    // Apenas cargas não finalizadas (status !== CargoStatus.Fechada)
    const activeList = cargos.filter(c => c.status !== CargoStatus.Fechada);

    const points: CargoMapPoint[] = [];
    const routes: CargoMapRoute[] = [];

    activeList.forEach(c => {
      const originText = c.originLocation || c.origin || 'Origem';
      const destText = c.destinationLocation || c.destination || 'Destino';
      const scheduled = c.scheduledVolume || c.totalVolume || 0;
      const loaded = c.loadedVolume || 0;
      const pending = Math.max(0, scheduled - loaded);

      const origPt = resolveLocationPoint(originText, c.originCoords, c.sequenceId, true);
      const destPt = resolveLocationPoint(destText, c.destinationCoords, c.sequenceId, false);

      const originPoint: CargoMapPoint = {
        id: `orig-${c.id}`,
        cargoId: c.id,
        sequenceId: c.sequenceId,
        type: 'origin',
        cityName: originText,
        fullRoute: `${originText} ➔ ${destText}`,
        x: origPt.x,
        y: origPt.y,
        uf: origPt.uf,
        region: origPt.region,
        scheduledVolume: scheduled,
        loadedVolume: loaded,
        pendingVolume: pending,
        status: c.status
      };

      const destPoint: CargoMapPoint = {
        id: `dest-${c.id}`,
        cargoId: c.id,
        sequenceId: c.sequenceId,
        type: 'destination',
        cityName: destText,
        fullRoute: `${originText} ➔ ${destText}`,
        x: destPt.x,
        y: destPt.y,
        uf: destPt.uf,
        region: destPt.region,
        scheduledVolume: scheduled,
        loadedVolume: loaded,
        pendingVolume: pending,
        status: c.status
      };

      points.push(originPoint, destPoint);

      // Trajetória curva (arco) elegante entre origem e destino
      const dx = destPoint.x - originPoint.x;
      const dy = destPoint.y - originPoint.y;
      const cx = Math.round((originPoint.x + destPoint.x) / 2 - dy * 0.18);
      const cy = Math.round((originPoint.y + destPoint.y) / 2 + dx * 0.18);
      const pathD = `M ${originPoint.x} ${originPoint.y} Q ${cx} ${cy} ${destPoint.x} ${destPoint.y}`;

      routes.push({
        cargoId: c.id,
        sequenceId: c.sequenceId,
        origin: originPoint,
        destination: destPoint,
        pathD,
        pendingVolume: pending
      });
    });

    return { activeList, points, routes };
  }, [cargos, asyncCoords]);

  // Filtragem de pontos e rotas quando uma região é selecionada
  const visiblePoints = useMemo(() => {
    if (!selectedRegion) return activeCargosData.points;
    return activeCargosData.points.filter(p => p.region === selectedRegion);
  }, [activeCargosData.points, selectedRegion]);

  const visibleRoutes = useMemo(() => {
    if (!selectedRegion) return activeCargosData.routes;
    return activeCargosData.routes.filter(
      r => r.origin.region === selectedRegion || r.destination.region === selectedRegion
    );
  }, [activeCargosData.routes, selectedRegion]);

  const activeRegionConfig = selectedRegion ? REGIONS_CONFIG[selectedRegion] : null;

  return (
    <div className={`bg-white dark:bg-gray-800 p-5 sm:p-6 rounded-lg shadow-md border border-gray-100 dark:border-gray-700/80 flex flex-col justify-between col-span-1 ${className}`}>
      {/* Cabeçalho do Card */}
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-purple-500/20 text-purple-600 dark:text-purple-400 flex items-center justify-center border border-purple-500/30 shadow-[0_0_12px_rgba(168,85,247,0.3)] shrink-0">
            <MapPin className="w-5 h-5 fill-purple-500/30" />
          </div>
          <div>
            <h3 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white tracking-tight flex items-center gap-2">
              <span>Entregas por Região</span>
              {selectedRegion && (
                <span 
                  className="text-xs px-2 py-0.5 rounded-full font-semibold border cursor-pointer hover:opacity-80"
                  style={{ 
                    color: activeRegionConfig?.color, 
                    backgroundColor: `${activeRegionConfig?.color}15`,
                    borderColor: `${activeRegionConfig?.color}40` 
                  }}
                  onClick={() => setSelectedRegion(null)}
                  title="Clique para limpar filtro"
                >
                  {selectedRegion} ✕
                </span>
              )}
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {activeCargosData.activeList.length > 0 
                ? `${activeCargosData.activeList.length} cargas ativas em operação (${periodLabel || 'Mês Atual'})` 
                : regionStats.hasRealData 
                ? `${regionStats.totalMappedShipments} embarques mapeados (${periodLabel || 'Mês Atual'})`
                : `Distribuição Regional (${periodLabel || 'Mês Atual'})`}
            </p>
          </div>
        </div>

        {regionStats.hasRealData && (
          <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-700/60 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600/60">
            {regionStats.totalTonnage.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} t
          </span>
        )}
      </div>

      {/* Conteúdo Principal: Mapa à Esquerda e Legenda à Direita */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 lg:gap-6 items-center flex-1 my-auto">
        
        {/* LADO ESQUERDO: MAPA DO BRASIL HIGH-TECH COM TAMANHO PROPORCIONAL EXPANDIDO */}
        <div className="md:col-span-8 xl:col-span-8 relative flex items-center justify-center min-h-[320px] sm:min-h-[360px] w-full select-none">
          <div className="relative w-full max-w-[440px] sm:max-w-[470px] aspect-[460/465]">
            
            {/* SVG do Mapa */}
            <svg
              viewBox="0 0 460 465"
              className="w-full h-full overflow-visible drop-shadow-[0_10px_20px_rgba(0,0,0,0.25)]"
              xmlns="http://www.w3.org/2000/svg"
            >
              <defs>
                {/* Filtros de brilho neon (Glow) */}
                <filter id="glow-purple" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="3.5" result="coloredBlur" />
                  <feMerge>
                    <feMergeNode in="coloredBlur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <filter id="glow-blue" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="3.5" result="coloredBlur" />
                  <feMerge>
                    <feMergeNode in="coloredBlur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <filter id="glow-green" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="3.5" result="coloredBlur" />
                  <feMerge>
                    <feMergeNode in="coloredBlur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <filter id="glow-orange" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="3.5" result="coloredBlur" />
                  <feMerge>
                    <feMergeNode in="coloredBlur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <filter id="glow-cyan" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="3.5" result="coloredBlur" />
                  <feMerge>
                    <feMergeNode in="coloredBlur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>

                {/* Gradientes para rotas ativas */}
                <linearGradient id="routeGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#10b981" stopOpacity="0.85" />
                  <stop offset="100%" stopColor="#a855f7" stopOpacity="0.9" />
                </linearGradient>
                
                {/* Gradiente radial de fundo sutil para a grade de radar */}
                <radialGradient id="mapRadarGlow" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#818cf8" stopOpacity="0.06" />
                  <stop offset="100%" stopColor="#1e1b4b" stopOpacity="0" />
                </radialGradient>
              </defs>

              {/* Fundo sutil com radar suave */}
              <circle cx="230" cy="232" r="210" fill="url(#mapRadarGlow)" />

              {/* Rede de conexão sutil do fundo (Constelação/Logística) */}
              <g className="opacity-20 dark:opacity-30">
                {BACKGROUND_NETWORK_LINES.map((line, idx) => (
                  <line
                    key={idx}
                    x1={line.x1}
                    y1={line.y1}
                    x2={line.x2}
                    y2={line.y2}
                    stroke="#94a3b8"
                    strokeWidth="0.7"
                    strokeDasharray="2,3"
                  />
                ))}
              </g>

              {/* Camada de Estados do Brasil */}
              <g id="states-layer">
                {BRAZIL_STATES.map((state) => {
                  const regionConfig = REGIONS_CONFIG[state.region];
                  const isRegionSelected = selectedRegion === null || selectedRegion === state.region;
                  const isHovered = hoveredState?.id === state.id;
                  const stateData = regionStats.stateCounts[state.id];
                  const hasStateDeliveries = (stateData?.count || 0) > 0;

                  // Se for DF, desenha círculo
                  if (state.id === 'DF') {
                    return (
                      <circle
                        key={state.id}
                        cx="294"
                        cy="255"
                        r={isHovered ? "5" : "3.5"}
                        fill={isHovered ? "#fff" : regionConfig.color}
                        stroke="#fff"
                        strokeWidth={isHovered ? "1.5" : "0.8"}
                        className="cursor-pointer transition-all duration-200"
                        onMouseEnter={() => setHoveredState(state)}
                        onMouseLeave={() => setHoveredState(null)}
                        onClick={() => setSelectedRegion(selectedRegion === state.region ? null : state.region)}
                      />
                    );
                  }

                  // Cor de preenchimento dinâmico
                  let fillColor = '#1e293b';
                  let fillOpacity = 0.5;
                  let strokeColor = '#334155';
                  let strokeWidth = 0.8;

                  if (isRegionSelected) {
                    fillColor = regionConfig.color;
                    fillOpacity = isHovered ? 0.65 : (hasStateDeliveries ? 0.35 : 0.2);
                    strokeColor = isHovered ? '#ffffff' : regionConfig.color;
                    strokeWidth = isHovered ? 1.8 : 0.9;
                  } else {
                    fillOpacity = 0.12;
                    strokeColor = '#1e293b';
                  }

                  // Destaque alaranjado suave no Amapá/Norte como na imagem de referência
                  if (state.id === 'AP' && (selectedRegion === null || selectedRegion === 'Norte')) {
                    strokeColor = '#f97316';
                    strokeWidth = 1.4;
                    fillOpacity = 0.4;
                  }

                  return (
                    <path
                      key={state.id}
                      d={state.path}
                      fill={fillColor}
                      fillOpacity={fillOpacity}
                      stroke={strokeColor}
                      strokeWidth={strokeWidth}
                      strokeLinejoin="round"
                      className="cursor-pointer transition-all duration-300 ease-out hover:opacity-100"
                      onMouseEnter={() => setHoveredState(state)}
                      onMouseLeave={() => setHoveredState(null)}
                      onClick={() => setSelectedRegion(selectedRegion === state.region ? null : state.region)}
                    />
                  );
                })}
              </g>

              {/* ROTAS ATIVAS ENTRE ORIGENS E DESTINOS DAS CARGAS EM ABERTO */}
              {visibleRoutes.length > 0 && (
                <g id="active-cargo-routes">
                  {visibleRoutes.map((route) => {
                    const isHovered = hoveredCargoPoint?.cargoId === route.cargoId;
                    return (
                      <g key={`route-${route.cargoId}`}>
                        {/* Linha externa de brilho quando hovered */}
                        {isHovered && (
                          <path
                            d={route.pathD}
                            fill="none"
                            stroke="#38bdf8"
                            strokeWidth="3.5"
                            strokeOpacity="0.5"
                            filter="url(#glow-cyan)"
                          />
                        )}
                        {/* Arco animado tracejado do fluxo logístico */}
                        <path
                          d={route.pathD}
                          fill="none"
                          stroke={isHovered ? "#38bdf8" : "url(#routeGradient)"}
                          strokeWidth={isHovered ? 2.2 : 1.3}
                          strokeDasharray="4,3"
                          strokeOpacity={isHovered ? 0.95 : 0.6}
                          className="transition-all duration-200"
                        />
                      </g>
                    );
                  })}
                </g>
              )}

              {/* PONTOS EXATOS DE ORIGENS E DESTINOS DAS CARGAS NÃO FINALIZADAS */}
              {visiblePoints.length > 0 ? (
                <g id="active-cargo-exact-points">
                  {visiblePoints.map((pt) => {
                    const isHovered = hoveredCargoPoint?.id === pt.id;
                    const isOrigin = pt.type === 'origin';
                    const pointColor = isOrigin ? '#10b981' : (REGIONS_CONFIG[pt.region]?.color || '#a855f7');
                    const filterId = isOrigin ? 'glow-green' : 'glow-purple';

                    return (
                      <g 
                        key={pt.id}
                        className="cursor-pointer"
                        onMouseEnter={() => setHoveredCargoPoint(pt)}
                        onMouseLeave={() => setHoveredCargoPoint(null)}
                      >
                        {/* Halo pulsante de radar */}
                        <circle
                          cx={pt.x}
                          cy={pt.y}
                          r={isHovered ? 13 : (isOrigin ? 9 : 8)}
                          fill={pointColor}
                          fillOpacity={isHovered ? 0.45 : 0.22}
                          filter={`url(#${filterId})`}
                          className="animate-pulse"
                          style={{ animationDuration: isOrigin ? '2.2s' : '2.8s' }}
                        />
                        {/* Ponto central luminoso com contorno contrastante */}
                        <circle
                          cx={pt.x}
                          cy={pt.y}
                          r={isHovered ? 4.8 : (isOrigin ? 3.8 : 3.5)}
                          fill={pointColor}
                          stroke="#ffffff"
                          strokeWidth={isHovered ? 1.5 : 0.9}
                          strokeOpacity="0.95"
                          className="transition-transform duration-150"
                        />
                        {/* Ponto branco interno para precisão de alvo */}
                        <circle
                          cx={pt.x}
                          cy={pt.y}
                          r={1.2}
                          fill="#ffffff"
                          className="pointer-events-none"
                        />
                      </g>
                    );
                  })}
                </g>
              ) : (
                /* Fallback para simulação estética caso não haja cargas em aberto */
                <g id="fallback-clusters">
                  {Object.entries(REGION_CLUSTER_GLOW_POINTS).map(([regionKey, points]) => {
                    const cfg = REGIONS_CONFIG[regionKey];
                    const isVisible = selectedRegion === null || selectedRegion === regionKey;
                    if (!isVisible) return null;

                    return (
                      <g key={regionKey}>
                        {points.map((pt, pIdx) => {
                          let filterId = 'glow-purple';
                          if (regionKey === 'Sul') filterId = 'glow-blue';
                          else if (regionKey === 'Nordeste') filterId = 'glow-green';
                          else if (regionKey === 'Norte') filterId = 'glow-orange';
                          else if (regionKey === 'Centro-Oeste') filterId = 'glow-cyan';

                          return (
                            <g key={pIdx}>
                              <circle
                                cx={pt.x}
                                cy={pt.y}
                                r={pt.r * 1.8}
                                fill={cfg.color}
                                fillOpacity="0.22"
                                filter={`url(#${filterId})`}
                                className="animate-pulse"
                                style={{ animationDelay: pt.delay || '0s', animationDuration: '2.5s' }}
                              />
                              <circle
                                cx={pt.x}
                                cy={pt.y}
                                r={pt.r * 0.75}
                                fill={cfg.color}
                                fillOpacity="0.85"
                                stroke="#ffffff"
                                strokeWidth="0.6"
                                strokeOpacity="0.8"
                                className="pointer-events-none"
                              />
                            </g>
                          );
                        })}
                      </g>
                    );
                  })}
                </g>
              )}

              {/* Rótulo UF do estado quando hovered */}
              {hoveredState && !hoveredCargoPoint && (
                <text
                  x={hoveredState.x}
                  y={hoveredState.y}
                  textAnchor="middle"
                  fill="#ffffff"
                  fontSize="10"
                  fontWeight="bold"
                  className="pointer-events-none drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]"
                >
                  {hoveredState.id}
                </text>
              )}
            </svg>

            {/* Tooltip flutuante interativo de Carga Ativa (Origem ou Destino) */}
            {hoveredCargoPoint && (
              <div 
                className="absolute z-40 pointer-events-none bg-slate-900/95 text-white p-2.5 rounded-xl border border-slate-700 shadow-2xl text-xs backdrop-blur-md transition-all duration-150 animate-fade-in max-w-[270px]"
                style={{
                  left: `${Math.min(76, Math.max(16, (hoveredCargoPoint.x / 460) * 100))}%`,
                  top: `${Math.min(76, Math.max(16, (hoveredCargoPoint.y / 465) * 100))}%`,
                  transform: 'translate(-50%, -115%)'
                }}
              >
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                    hoveredCargoPoint.type === 'origin' 
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-[0_0_8px_rgba(16,185,129,0.3)]' 
                      : 'bg-purple-500/20 text-purple-300 border border-purple-500/40 shadow-[0_0_8px_rgba(168,85,247,0.3)]'
                  }`}>
                    {hoveredCargoPoint.type === 'origin' ? '● Origem (Embarque)' : '● Destino (Descarga)'}
                  </span>
                  <span className="font-mono text-[10px] text-gray-400 font-bold">
                    Carga #{hoveredCargoPoint.sequenceId}
                  </span>
                </div>

                <div className="font-bold text-xs text-white mb-1 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                  <span className="truncate">{hoveredCargoPoint.cityName}</span>
                </div>

                <div className="text-[10px] text-gray-300 mb-1.5 flex items-center gap-1">
                  <span className="text-gray-400">Trajeto:</span>
                  <span className="font-medium text-sky-200 truncate">{hoveredCargoPoint.fullRoute}</span>
                </div>

                <div className="pt-1.5 border-t border-slate-700/80 flex items-center justify-between text-[10px]">
                  <span className="text-gray-400">Saldo a carregar:</span>
                  <span className="font-mono font-bold text-amber-400">
                    {hoveredCargoPoint.pendingVolume.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} t
                  </span>
                </div>
              </div>
            )}

            {/* Tooltip flutuante interativo de Estado quando não houver ponto sobreposto */}
            {hoveredState && !hoveredCargoPoint && (
              <div 
                className="absolute z-30 pointer-events-none bg-slate-900/95 text-white p-2.5 rounded-xl border border-slate-700 shadow-2xl text-xs backdrop-blur-md transition-all duration-150 animate-fade-in"
                style={{
                  left: `${Math.min(75, Math.max(10, (hoveredState.x / 460) * 100))}%`,
                  top: `${Math.min(75, Math.max(10, (hoveredState.y / 465) * 100))}%`,
                  transform: 'translate(-50%, -115%)'
                }}
              >
                <div className="flex items-center gap-1.5 font-bold mb-0.5">
                  <span 
                    className="w-2 h-2 rounded-full" 
                    style={{ backgroundColor: REGIONS_CONFIG[hoveredState.region].color }} 
                  />
                  <span>{hoveredState.name} ({hoveredState.id})</span>
                </div>
                <div className="text-[10px] text-gray-300">
                  Região: <span className="font-semibold text-white">{hoveredState.region}</span>
                </div>
                {regionStats.stateCounts[hoveredState.id] ? (
                  <div className="mt-1 pt-1 border-t border-slate-700/80 flex items-center justify-between gap-3 text-[10px]">
                    <span className="text-gray-300">{regionStats.stateCounts[hoveredState.id].count} entregas</span>
                    <span className="font-mono font-bold text-emerald-400">
                      {regionStats.stateCounts[hoveredState.id].tonnage.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} t
                    </span>
                  </div>
                ) : (
                  <div className="text-[10px] text-gray-400 mt-1 italic">
                    {regionStats.hasRealData ? 'Sem entregas no período' : 'Rotas e destinos ativos'}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* LADO DIREITO: LEGENDA DAS 5 REGIÕES (COMPACTA COM NOMES REDUZIDOS) */}
        <div className="md:col-span-4 xl:col-span-4 flex flex-col justify-center space-y-2 pl-0 md:pl-1">
          {regionStats.regionsList.map((reg) => {
            const isSelected = selectedRegion === reg.id;
            const isDimmed = selectedRegion !== null && selectedRegion !== reg.id;

            return (
              <div
                key={reg.id}
                onClick={() => setSelectedRegion(selectedRegion === reg.id ? null : reg.id)}
                className={`group px-2 py-1.5 rounded-lg cursor-pointer transition-all duration-200 border ${
                  isSelected
                    ? 'bg-slate-100/90 dark:bg-slate-700/80 border-slate-300 dark:border-slate-600 shadow-sm'
                    : isDimmed
                    ? 'opacity-40 hover:opacity-75 border-transparent'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-700/40 border-transparent'
                }`}
                title={`Clique para ${isSelected ? 'remover filtro de' : 'filtrar'} ${reg.name}`}
              >
                {/* Linha principal: Ponto colorido, Nome da Região e Percentual */}
                <div className="flex items-center justify-between text-xs sm:text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0 transition-transform group-hover:scale-125"
                      style={{
                        backgroundColor: reg.color,
                        boxShadow: `0 0 8px ${reg.color}`
                      }}
                    />
                    <span className="font-medium text-gray-800 dark:text-gray-200 truncate">
                      {reg.name}
                    </span>
                  </div>

                  <span className="font-semibold text-gray-900 dark:text-gray-100 tabular-nums text-xs">
                    {reg.percentage.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%
                  </span>
                </div>

                {/* Barra de progresso sutil */}
                <div className="w-full bg-gray-200/80 dark:bg-gray-700/90 h-1 rounded-full overflow-hidden mt-1.5">
                  <div
                    className="h-full rounded-full transition-all duration-500 ease-out"
                    style={{
                      width: `${Math.min(100, Math.max(5, reg.percentage))}%`,
                      backgroundColor: reg.color,
                      boxShadow: `0 0 6px ${reg.color}`
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* RODAPÉ DO CARD: LEGENDA DOS PONTOS EXATOS DE ORIGEM E DESTINO */}
      <div className="flex items-center justify-between text-xs px-1 pt-3 border-t border-gray-100 dark:border-gray-700/70 mt-3 text-gray-500 dark:text-gray-400 flex-wrap gap-2">
        <div className="flex items-center gap-3.5 flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]" />
            <span className="text-[11px] font-medium text-gray-700 dark:text-gray-300">Origem (Embarque)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-purple-500 shadow-[0_0_8px_#a855f7]" />
            <span className="text-[11px] font-medium text-gray-700 dark:text-gray-300">Destino (Descarga)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-4 h-0.5 border-t border-dashed border-sky-400" />
            <span className="text-[11px] font-medium text-gray-700 dark:text-gray-300">Rotas em Aberto</span>
          </div>
        </div>

        <div className="text-[11px] font-semibold text-sky-600 dark:text-sky-400 flex items-center gap-1">
          <Navigation className="w-3 h-3" />
          <span>
            {activeCargosData.activeList.length}{' '}
            {activeCargosData.activeList.length === 1 ? 'carga não finalizada' : 'cargas não finalizadas'}
          </span>
        </div>
      </div>
    </div>
  );
};

export default DeliveriesByRegionCard;
