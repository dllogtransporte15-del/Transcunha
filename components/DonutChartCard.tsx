
import React, { useState } from 'react';
import { ChevronDown, Building2, ChevronRight, History } from 'lucide-react';

export interface DonutChartSubItem {
  label: string;
  value: number;
  cnpj?: string;
  city?: string;
  state?: string;
  shipmentsCount?: number;
}

export interface DonutChartData {
  label: string;
  value: number;
  color: string;
  clientId?: string;
  subItems?: DonutChartSubItem[];
}

export interface DonutChartCardBadge {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  colorClass?: string;
}

export interface DonutChartCardProps {
  title: string;
  data: DonutChartData[];
  unit?: string;
  onViewClientHistory?: (clientId: string) => void;
  badge?: DonutChartCardBadge;
  headerExtra?: React.ReactNode;
}

const DonutChartCard: React.FC<DonutChartCardProps> = ({ 
  title, 
  data, 
  unit = '', 
  onViewClientHistory,
  badge,
  headerExtra 
}) => {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const total = data.reduce((sum, item) => sum + item.value, 0);

  const radius = 80;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  const toggleExpand = (index: number) => {
    setExpandedIndex(prev => (prev === index ? null : index));
  };

  return (
    <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md border border-gray-100 dark:border-gray-700/60">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-200">{title}</h3>
        {badge && (
          <div className="flex items-center gap-2.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 px-3 py-1.5 rounded-xl shadow-xs">
            {badge.icon && (
              <div className="w-7 h-7 rounded-lg bg-emerald-500 text-white flex items-center justify-center shrink-0 shadow-xs">
                {badge.icon}
              </div>
            )}
            <div>
              <span className="block text-[10px] uppercase font-bold text-emerald-700 dark:text-emerald-400 leading-tight">
                {badge.label}
              </span>
              <span className="font-extrabold text-sm sm:text-base text-emerald-900 dark:text-emerald-100 font-mono">
                {badge.value}
              </span>
            </div>
          </div>
        )}
        {headerExtra}
      </div>
      <div className="flex flex-col md:flex-row items-center justify-center gap-6">
        <div className="relative w-48 h-48 shrink-0">
          <svg className="w-full h-full" viewBox="-100 -100 200 200" transform="rotate(-90)">
            <circle
                className="stroke-gray-200 dark:stroke-gray-700"
                r={radius}
                cx="0"
                cy="0"
                fill="transparent"
                strokeWidth="25"
              />
            {data.map((item, index) => {
              if (item.value === 0) return null;
              const percentage = total > 0 ? (item.value / total) * 100 : 0;
              const dash = (percentage * circumference) / 100;
              
              // This is a workaround for Tailwind JIT not picking up dynamic classes
              const colorMap: Record<string, string> = {
                'bg-blue-500': 'stroke-blue-500',
                'bg-blue-400': 'stroke-blue-400',
                'bg-blue-300': 'stroke-blue-300',
                'bg-gray-500': 'stroke-gray-500',
                'bg-gray-400': 'stroke-gray-400',
                'bg-emerald-500': 'stroke-emerald-500',
                'bg-orange-500': 'stroke-orange-500',
                'bg-purple-500': 'stroke-purple-500',
                'bg-red-500': 'stroke-red-500',
                'bg-yellow-500': 'stroke-yellow-500',
                'bg-pink-500': 'stroke-pink-500',
                'bg-indigo-500': 'stroke-indigo-500',
              };
              const strokeColor = colorMap[item.color] || 'stroke-gray-500';

              const currentOffset = offset;
              offset += dash;

              return (
                <circle
                  key={index}
                  className={strokeColor}
                  r={radius}
                  cx="0"
                  cy="0"
                  fill="transparent"
                  strokeWidth="25"
                  strokeDasharray={`${dash} ${circumference - dash}`}
                  strokeDashoffset={-currentOffset}
                  style={{ transition: 'stroke-dashoffset 0.5s ease-in-out' }}
                />
              );
            })}
          </svg>
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center">
              <span className="text-xl font-bold text-gray-800 dark:text-white">
                {total.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                {unit && <span className="text-xs ml-0.5">{unit}</span>}
              </span>
              <span className="block text-xs text-gray-500 dark:text-gray-400">Total</span>
            </div>
          </div>
        </div>
        <div className="w-full md:flex-1 min-w-0">
          <ul className="space-y-2">
            {data.map((item, index) => {
              const hasSubItems = item.subItems && item.subItems.length > 0;
              const isExpanded = expandedIndex === index;

              return (
                <li key={index} className="flex flex-col text-sm border-b border-gray-100/70 dark:border-gray-700/50 last:border-b-0 pb-1.5 first:pt-0">
                  <div className="flex items-center justify-between gap-2 w-full">
                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                      <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${item.color}`}></span>
                      <span className="text-gray-700 dark:text-gray-300 font-medium truncate text-xs sm:text-sm" title={item.label}>
                        {item.label}:
                      </span>
                      {hasSubItems ? (
                        <button
                          type="button"
                          onClick={() => toggleExpand(index)}
                          className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold rounded-md transition-all cursor-pointer shadow-2xs shrink-0 whitespace-nowrap ${
                            isExpanded
                              ? 'bg-blue-600 text-white'
                              : 'bg-blue-50 hover:bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:hover:bg-blue-900/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
                          }`}
                          title="Clique para ver o volume e histórico por filial"
                        >
                          <Building2 className="w-2.5 h-2.5" />
                          <span>{isExpanded ? 'Recolher' : 'Filiais'}</span>
                          <ChevronDown className={`w-2.5 h-2.5 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                        </button>
                      ) : (
                        item.clientId && onViewClientHistory && (
                          <button
                            type="button"
                            onClick={() => onViewClientHistory(item.clientId!)}
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700 dark:text-blue-300 hover:text-white bg-blue-50 hover:bg-blue-600 dark:bg-blue-900/40 dark:hover:bg-blue-600 border border-blue-200 dark:border-blue-800 rounded-md transition-all cursor-pointer shadow-2xs shrink-0 whitespace-nowrap group"
                            title={`Ver histórico completo de ${item.label}`}
                          >
                            <History className="w-2.5 h-2.5 group-hover:rotate-[-20deg] transition-transform" />
                            <span>Histórico</span>
                          </button>
                        )
                      )}
                    </div>
                    <span className="font-bold ml-auto text-gray-800 dark:text-gray-200 shrink-0 text-xs sm:text-sm pl-2">
                      {item.value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {unit}
                    </span>
                  </div>

                  {/* Expanded Sub-items (Filiais) */}
                  {isExpanded && hasSubItems && (
                    <div className="mt-2 ml-4 pl-3 border-l-2 border-blue-400 dark:border-blue-500 space-y-1.5 py-1.5 bg-blue-50/40 dark:bg-blue-950/20 rounded-r-lg animate-in fade-in slide-in-from-top-1 duration-150">
                      <div className="text-[10px] uppercase font-bold text-gray-500 dark:text-gray-400 mb-1.5 flex items-center justify-between pr-2">
                        <span className="flex items-center gap-1">
                          <Building2 className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                          Detalhamento por Filial:
                        </span>
                        {item.clientId && onViewClientHistory && (
                          <button
                            type="button"
                            onClick={() => onViewClientHistory(item.clientId!)}
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold text-blue-600 dark:text-blue-400 hover:text-white hover:bg-blue-600 dark:hover:bg-blue-600 bg-white dark:bg-gray-800 border border-blue-200 dark:border-blue-800 rounded-md transition-all cursor-pointer shadow-2xs"
                            title={`Ver histórico completo de ${item.label}`}
                          >
                            <History className="w-2.5 h-2.5" />
                            <span>Histórico Completo</span>
                            <ChevronRight className="w-2.5 h-2.5" />
                          </button>
                        )}
                      </div>

                      {item.subItems!.map((sub, sIdx) => {
                        const branchPct = item.value > 0 ? (sub.value / item.value) * 100 : 0;
                        return (
                          <div key={sIdx} className="flex items-center justify-between text-xs pr-2 py-0.5 hover:bg-blue-100/40 dark:hover:bg-blue-900/30 rounded px-1 transition-colors">
                            <div className="flex items-center gap-1.5 truncate flex-1 mr-2" title={`${sub.label}${sub.cnpj ? ` — CNPJ: ${sub.cnpj}` : ''}`}>
                              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0"></span>
                              <span className="text-gray-700 dark:text-gray-200 font-semibold truncate">{sub.label}</span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0 ml-auto">
                              <span className="text-[10px] text-gray-500 dark:text-gray-400 font-medium">
                                ({branchPct.toFixed(1)}%)
                              </span>
                              <span className="font-bold text-gray-900 dark:text-white">
                                {sub.value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {unit}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
};

export default DonutChartCard;
