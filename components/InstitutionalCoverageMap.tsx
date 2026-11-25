import React, { useState } from 'react';
import { MapPin, Navigation, Sparkles, Filter, CheckCircle2 } from 'lucide-react';
import { BRAZIL_STATES, REGIONS_CONFIG, BrazilStateInfo } from './brazilMapData';

// Linhas de constelação logística de fundo
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

// Polos estratégicos de operação Transcunha
interface StrategicHub {
  id: string;
  name: string;
  uf: string;
  region: 'Sudeste' | 'Sul' | 'Nordeste' | 'Norte' | 'Centro-Oeste';
  x: number;
  y: number;
  type: 'matriz' | 'origin' | 'destination';
  role: string;
}

const STRATEGIC_HUBS: StrategicHub[] = [
  {
    id: 'hub-mg',
    name: 'Triângulo Mineiro & Alto Paranaíba',
    uf: 'MG',
    region: 'Sudeste',
    x: 325,
    y: 290,
    type: 'matriz',
    role: 'Matriz Operacional & Polo de Carga'
  },
  {
    id: 'hub-sp',
    name: 'Porto de Santos & Interior Paulista',
    uf: 'SP',
    region: 'Sudeste',
    x: 318,
    y: 355,
    type: 'destination',
    role: 'Corredor de Exportação & Polo Industrial'
  },
  {
    id: 'hub-go',
    name: 'Rio Verde & Sudoeste Goiano',
    uf: 'GO',
    region: 'Centro-Oeste',
    x: 275,
    y: 268,
    type: 'origin',
    role: 'Polo Graneleiro (Soja, Milho & Farelo)'
  },
  {
    id: 'hub-mt',
    name: 'Rondonópolis & Médio-Norte',
    uf: 'MT',
    region: 'Centro-Oeste',
    x: 215,
    y: 235,
    type: 'origin',
    role: 'Corredor do Agronegócio'
  },
  {
    id: 'hub-ms',
    name: 'Dourados & Sul Fronteira',
    uf: 'MS',
    region: 'Centro-Oeste',
    x: 230,
    y: 318,
    type: 'origin',
    role: 'Polo Agroindustrial & Grãos'
  },
  {
    id: 'hub-pr',
    name: 'Porto de Paranaguá & Campos Gerais',
    uf: 'PR',
    region: 'Sul',
    x: 272,
    y: 388,
    type: 'destination',
    role: 'Corredor Sul de Escoamento Portuário'
  },
  {
    id: 'hub-es',
    name: 'Complexo Portuário de Tubarão / Vitória',
    uf: 'ES',
    region: 'Sudeste',
    x: 372,
    y: 305,
    type: 'destination',
    role: 'Corredor Leste de Insumos & Fertilizantes'
  },
  {
    id: 'hub-ba',
    name: 'Luís Eduardo Magalhães & Oeste Baiano',
    uf: 'BA',
    region: 'Nordeste',
    x: 375,
    y: 215,
    type: 'origin',
    role: 'Fronteira Agrícola MATOPIBA'
  }
];

// Rotas ativas interestaduais
interface StrategicRoute {
  id: string;
  name: string;
  pathD: string;
  region: 'Sudeste' | 'Sul' | 'Nordeste' | 'Norte' | 'Centro-Oeste';
}

const STRATEGIC_ROUTES: StrategicRoute[] = [
  { id: 'r1', name: 'Corredor MT → SP/Santos', pathD: 'M 215,235 Q 260,300 318,355', region: 'Centro-Oeste' },
  { id: 'r2', name: 'Corredor GO → Matriz MG', pathD: 'M 275,268 Q 300,280 325,290', region: 'Centro-Oeste' },
  { id: 'r3', name: 'Corredor Matriz MG → Porto de Santos', pathD: 'M 325,290 Q 330,325 318,355', region: 'Sudeste' },
  { id: 'r4', name: 'Corredor MS → Porto de Paranaguá', pathD: 'M 230,318 Q 250,360 272,388', region: 'Sul' },
  { id: 'r5', name: 'Corredor Matriz MG → Porto de Tubarão/ES', pathD: 'M 325,290 Q 350,295 372,305', region: 'Sudeste' },
  { id: 'r6', name: 'Corredor MATOPIBA BA → Sudeste', pathD: 'M 375,215 Q 350,250 325,290', region: 'Nordeste' }
];

// Distribuição regional de atuação Transcunha
const REGIONAL_STATS = [
  { id: 'Sudeste', name: 'Sudeste', percentage: 42, color: '#a855f7', statesCount: 4, desc: 'Matriz, polos industriais e Portos de Santos/Tubarão' },
  { id: 'Centro-Oeste', name: 'Centro-Oeste', percentage: 28, color: '#06b6d4', statesCount: 4, desc: 'Corredor central de grãos (MT, GO, MS, DF)' },
  { id: 'Sul', name: 'Sul', percentage: 18, color: '#3b82f6', statesCount: 3, desc: 'Porto de Paranaguá e polos agropecuários' },
  { id: 'Nordeste', name: 'Nordeste', percentage: 8, color: '#22c55e', statesCount: 9, desc: 'Fronteira MATOPIBA e polos de insumos' },
  { id: 'Norte', name: 'Norte', percentage: 4, color: '#f97316', statesCount: 7, desc: 'Corredor Norte e Arco Norte' }
];

// Informações estratégicas por UF
const STATE_HIGHLIGHTS: Record<string, string> = {
  MG: 'Matriz Operacional & Triângulo Mineiro',
  SP: 'Porto de Santos & Polo Industrial',
  GO: 'Polo Graneleiro & Fertilizantes (Rio Verde/Jataí)',
  MT: 'Corredor da Soja & Milho (Rondonópolis/Sorriso)',
  MS: 'Granéis & Bioenergia (Dourados/Maracaju)',
  PR: 'Porto de Paranaguá & Corredor Sul',
  ES: 'Complexo Portuário de Tubarão (Fertilizantes)',
  BA: 'Oeste Baiano & MATOPIBA',
  DF: 'Conexão e Entroncamento Federal'
};

export const InstitutionalCoverageMap: React.FC<{ className?: string; compact?: boolean }> = ({
  className = '',
  compact = false
}) => {
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);
  const [hoveredState, setHoveredState] = useState<BrazilStateInfo | null>(null);
  const [hoveredHub, setHoveredHub] = useState<StrategicHub | null>(null);

  const activeRegionConfig = selectedRegion ? REGIONS_CONFIG[selectedRegion] : null;

  // Filtragem dinâmica de rotas e polos conforme região selecionada
  const visibleRoutes = selectedRegion
    ? STRATEGIC_ROUTES.filter(r => r.region === selectedRegion || (selectedRegion === 'Sudeste' && (r.id === 'r3' || r.id === 'r5')))
    : STRATEGIC_ROUTES;

  const visibleHubs = selectedRegion
    ? STRATEGIC_HUBS.filter(h => h.region === selectedRegion)
    : STRATEGIC_HUBS;

  return (
    <div className={`w-full flex flex-col justify-between ${className}`}>
      {/* Barra de Filtro de Regiões */}
      <div className={`flex items-center justify-between gap-1.5 flex-wrap ${compact ? 'mb-2' : 'mb-4'}`}>
        <div className="flex items-center gap-1 flex-wrap">
          <button
            type="button"
            onClick={() => setSelectedRegion(null)}
            className={`rounded-full font-semibold transition-all cursor-pointer ${
              compact ? 'text-[10px] px-2 py-0.5' : 'text-xs px-2.5 py-1'
            } ${
              selectedRegion === null
                ? 'bg-sky-500 text-white shadow-[0_0_12px_rgba(14,165,233,0.4)]'
                : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700 border border-slate-700/60'
            }`}
          >
            Todas
          </button>
          {REGIONAL_STATS.map(reg => {
            const isSelected = selectedRegion === reg.id;
            return (
              <button
                key={reg.id}
                type="button"
                onClick={() => setSelectedRegion(isSelected ? null : reg.id)}
                className={`rounded-full font-semibold transition-all flex items-center gap-1 cursor-pointer ${
                  compact ? 'text-[10px] px-2 py-0.5' : 'text-xs px-2.5 py-1'
                } ${
                  isSelected
                    ? 'text-white shadow-md'
                    : 'bg-slate-800/60 text-slate-400 hover:text-white border border-slate-700/50'
                }`}
                style={
                  isSelected
                    ? {
                        backgroundColor: `${reg.color}35`,
                        borderColor: reg.color,
                        boxShadow: `0 0 10px ${reg.color}40`,
                        color: '#fff'
                      }
                    : undefined
                }
              >
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ backgroundColor: reg.color, boxShadow: `0 0 5px ${reg.color}` }}
                />
                <span>{reg.name}</span>
                <span className="text-[9px] opacity-75">({reg.percentage}%)</span>
              </button>
            );
          })}
        </div>

        {selectedRegion && (
          <span
            onClick={() => setSelectedRegion(null)}
            className="text-[10px] font-semibold text-sky-400 hover:text-sky-300 cursor-pointer flex items-center gap-1"
          >
            ✕ Limpar
          </span>
        )}
      </div>

      {/* Conteúdo Principal: Mapa do Brasil à Esquerda e Indicadores Regionais à Direita */}
      <div className={`grid grid-cols-1 ${compact ? 'md:grid-cols-12 gap-3' : 'md:grid-cols-12 gap-5'} items-center flex-1 my-auto`}>
        {/* LADO ESQUERDO: MAPA DO BRASIL HIGH-TECH */}
        <div className={`${compact ? 'md:col-span-7' : 'md:col-span-7 xl:col-span-7'} relative flex items-center justify-center ${compact ? 'min-h-[220px]' : 'min-h-[300px] sm:min-h-[340px]'} w-full select-none`}>
          <div className={`relative w-full ${compact ? 'max-w-[260px]' : 'max-w-[390px] sm:max-w-[420px]'} aspect-[460/465]`}>
            <svg
              viewBox="0 0 460 465"
              className="w-full h-full overflow-visible drop-shadow-[0_10px_25px_rgba(0,0,0,0.5)]"
              xmlns="http://www.w3.org/2000/svg"
            >
              <defs>
                {/* Filtros de brilho neon (Glow) */}
                <filter id="inst-glow-purple" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="3.5" result="coloredBlur" />
                  <feMerge>
                    <feMergeNode in="coloredBlur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <filter id="inst-glow-blue" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="3.5" result="coloredBlur" />
                  <feMerge>
                    <feMergeNode in="coloredBlur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <filter id="inst-glow-green" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="3.5" result="coloredBlur" />
                  <feMerge>
                    <feMergeNode in="coloredBlur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <filter id="inst-glow-orange" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="3.5" result="coloredBlur" />
                  <feMerge>
                    <feMergeNode in="coloredBlur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <filter id="inst-glow-cyan" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="3.5" result="coloredBlur" />
                  <feMerge>
                    <feMergeNode in="coloredBlur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>

                {/* Gradiente para rotas logísticas */}
                <linearGradient id="instRouteGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#10b981" stopOpacity="0.9" />
                  <stop offset="50%" stopColor="#38bdf8" stopOpacity="0.9" />
                  <stop offset="100%" stopColor="#a855f7" stopOpacity="0.95" />
                </linearGradient>

                {/* Gradiente radial de fundo para o radar */}
                <radialGradient id="instMapRadarGlow" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.08" />
                  <stop offset="100%" stopColor="#0f172a" stopOpacity="0" />
                </radialGradient>
              </defs>

              {/* Fundo sutil com radar suave */}
              <circle cx="230" cy="232" r="210" fill="url(#instMapRadarGlow)" />

              {/* Constelação de conexões sutis de fundo */}
              <g className="opacity-25">
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
                {BRAZIL_STATES.map(state => {
                  const regionConfig = REGIONS_CONFIG[state.region];
                  const isRegionSelected = selectedRegion === null || selectedRegion === state.region;
                  const isHovered = hoveredState?.id === state.id;
                  const isKeyPresence = !!STATE_HIGHLIGHTS[state.id];

                  // Se for DF, desenha círculo
                  if (state.id === 'DF') {
                    return (
                      <circle
                        key={state.id}
                        cx="294"
                        cy="255"
                        r={isHovered ? '5' : '3.5'}
                        fill={isHovered ? '#fff' : regionConfig.color}
                        stroke="#fff"
                        strokeWidth={isHovered ? '1.5' : '0.8'}
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
                    fillOpacity = isHovered ? 0.75 : isKeyPresence ? 0.42 : 0.22;
                    strokeColor = isHovered ? '#ffffff' : isKeyPresence ? '#e2e8f0' : regionConfig.color;
                    strokeWidth = isHovered ? 1.8 : isKeyPresence ? 1.1 : 0.8;
                  } else {
                    fillOpacity = 0.1;
                    strokeColor = '#1e293b';
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

              {/* Rotas Estratégicas com animação fluida */}
              <g id="strategic-corridors">
                {visibleRoutes.map(route => (
                  <g key={route.id}>
                    {/* Linha externa de halo brilhante */}
                    <path
                      d={route.pathD}
                      fill="none"
                      stroke="#38bdf8"
                      strokeWidth="3"
                      strokeOpacity="0.3"
                      filter="url(#inst-glow-cyan)"
                    />
                    {/* Linha tracejada em fluxo */}
                    <path
                      d={route.pathD}
                      fill="none"
                      stroke="url(#instRouteGradient)"
                      strokeWidth="1.8"
                      strokeDasharray="4,3"
                      strokeOpacity="0.9"
                      className="transition-all duration-200"
                    />
                  </g>
                ))}
              </g>

              {/* Polos Estratégicos (Hubs de Origem, Matriz e Destino) */}
              <g id="strategic-hubs">
                {visibleHubs.map(hub => {
                  const isHovered = hoveredHub?.id === hub.id;
                  const isMatriz = hub.type === 'matriz';
                  const isOrigin = hub.type === 'origin';
                  const pointColor = isMatriz ? '#38bdf8' : isOrigin ? '#10b981' : '#a855f7';
                  const filterId = isMatriz ? 'inst-glow-cyan' : isOrigin ? 'inst-glow-green' : 'inst-glow-purple';

                  return (
                    <g
                      key={hub.id}
                      className="cursor-pointer"
                      onMouseEnter={() => setHoveredHub(hub)}
                      onMouseLeave={() => setHoveredHub(null)}
                    >
                      {/* Halo pulsante de radar */}
                      <circle
                        cx={hub.x}
                        cy={hub.y}
                        r={isHovered ? 13 : isMatriz ? 10 : 8}
                        fill={pointColor}
                        fillOpacity={isHovered ? 0.5 : 0.25}
                        filter={`url(#${filterId})`}
                        className="animate-pulse"
                        style={{ animationDuration: isMatriz ? '1.8s' : '2.6s' }}
                      />
                      {/* Ponto central */}
                      <circle
                        cx={hub.x}
                        cy={hub.y}
                        r={isHovered ? 5 : isMatriz ? 4.5 : 3.6}
                        fill={pointColor}
                        stroke="#ffffff"
                        strokeWidth={isHovered ? 1.6 : 1}
                        strokeOpacity="0.95"
                      />
                      {/* Ponto branco de mira interna */}
                      <circle cx={hub.x} cy={hub.y} r={1.2} fill="#ffffff" className="pointer-events-none" />
                    </g>
                  );
                })}
              </g>

              {/* Rótulo UF do estado quando hovered */}
              {hoveredState && !hoveredHub && (
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

            {/* Tooltip flutuante de Polo Estratégico */}
            {hoveredHub && (
              <div
                className="absolute z-40 pointer-events-none bg-slate-900/95 text-white p-2.5 rounded-xl border border-slate-700 shadow-2xl text-xs backdrop-blur-md transition-all duration-150 animate-fade-in max-w-[260px]"
                style={{
                  left: `${Math.min(76, Math.max(16, (hoveredHub.x / 460) * 100))}%`,
                  top: `${Math.min(76, Math.max(16, (hoveredHub.y / 465) * 100))}%`,
                  transform: 'translate(-50%, -115%)'
                }}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span
                    className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                      hoveredHub.type === 'matriz'
                        ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                        : hoveredHub.type === 'origin'
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                        : 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                    }`}
                  >
                    {hoveredHub.type === 'matriz'
                      ? '★ Matriz Transcunha'
                      : hoveredHub.type === 'origin'
                      ? '● Polo de Origem'
                      : '● Polo de Descarga'}
                  </span>
                  <span className="font-mono text-[10px] text-gray-400 font-bold">
                    {hoveredHub.uf}
                  </span>
                </div>
                <div className="font-bold text-xs text-white mb-0.5 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                  <span className="truncate">{hoveredHub.name}</span>
                </div>
                <div className="text-[10px] text-sky-300 font-medium">
                  {hoveredHub.role}
                </div>
              </div>
            )}

            {/* Tooltip flutuante de Estado */}
            {hoveredState && !hoveredHub && (
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
                    style={{ backgroundColor: REGIONS_CONFIG[hoveredState.region]?.color || '#38bdf8' }}
                  />
                  <span>
                    {hoveredState.name} ({hoveredState.id})
                  </span>
                </div>
                <div className="text-[10px] text-gray-300">
                  Região: <span className="font-semibold text-white">{hoveredState.region}</span>
                </div>
                {STATE_HIGHLIGHTS[hoveredState.id] && (
                  <div className="mt-1 pt-1 border-t border-slate-700/80 text-[10px] text-sky-300 font-medium">
                    {STATE_HIGHLIGHTS[hoveredState.id]}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* LADO DIREITO: LEGENDA DAS REGIÕES & PARTICIPAÇÃO */}
        <div className={`${compact ? 'md:col-span-5 space-y-1.5 pl-0 md:pl-1' : 'md:col-span-5 xl:col-span-5 space-y-2.5 pl-0 md:pl-2'} flex flex-col justify-center`}>
          {REGIONAL_STATS.map(reg => {
            const isSelected = selectedRegion === reg.id;
            const isDimmed = selectedRegion !== null && selectedRegion !== reg.id;

            return (
              <div
                key={reg.id}
                onClick={() => setSelectedRegion(selectedRegion === reg.id ? null : reg.id)}
                className={`group ${compact ? 'px-2 py-1 rounded-lg' : 'px-3 py-2 rounded-xl'} cursor-pointer transition-all duration-200 border ${
                  isSelected
                    ? 'bg-slate-800/90 border-slate-600 shadow-lg'
                    : isDimmed
                    ? 'opacity-40 hover:opacity-75 border-transparent bg-slate-900/40'
                    : 'bg-slate-900/60 hover:bg-slate-800/60 border-slate-800/70'
                }`}
                title={`Clique para ${isSelected ? 'remover filtro de' : 'destacar'} ${reg.name}`}
              >
                <div className={`flex items-center justify-between ${compact ? 'text-[11px] mb-0.5' : 'text-xs mb-1'}`}>
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span
                      className="w-2 h-2 rounded-full shrink-0 transition-transform group-hover:scale-125"
                      style={{
                        backgroundColor: reg.color,
                        boxShadow: `0 0 6px ${reg.color}`
                      }}
                    />
                    <span className="font-bold text-white truncate">{reg.name}</span>
                  </div>
                  <span className="font-bold text-sky-400 tabular-nums text-[11px]">
                    {reg.percentage}%
                  </span>
                </div>

                {/* Descrição curta da operação regional (ocultada no modo compact) */}
                {!compact && <p className="text-[10px] text-slate-400 line-clamp-1 mb-1.5">{reg.desc}</p>}

                {/* Barra de progresso */}
                <div className="w-full bg-slate-800 h-1 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500 ease-out"
                    style={{
                      width: `${reg.percentage}%`,
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

      {/* RODAPÉ DO CARD: LEGENDA DOS POLOS E STATUS */}
      <div className={`flex items-center justify-between text-xs px-2 border-t border-slate-800/80 ${compact ? 'mt-2 pt-2' : 'mt-4 pt-3'} text-slate-400 flex-wrap gap-2`}>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-sky-400 shadow-[0_0_6px_#38bdf8]" />
            <span className="text-[10px] font-medium text-slate-300">Matriz MG</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_6px_#10b981]" />
            <span className="text-[10px] font-medium text-slate-300">Origem (Agro)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-purple-500 shadow-[0_0_6px_#a855f7]" />
            <span className="text-[10px] font-medium text-slate-300">Portos & Indústria</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3.5 h-0.5 border-t border-dashed border-sky-400" />
            <span className="text-[10px] font-medium text-slate-300">Rotas</span>
          </div>
        </div>

        <div className="text-[10px] font-semibold text-sky-400 flex items-center gap-1">
          <Navigation className="w-3 h-3 text-sky-400" />
          <span>Rastreamento 24h</span>
        </div>
      </div>
    </div>
  );
};

export default InstitutionalCoverageMap;
