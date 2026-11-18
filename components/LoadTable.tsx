
import React, { useState, useEffect, useMemo } from 'react';
import type { Cargo, Client, Product, Shipment, User } from '../types';
import { DailyScheduleType, CargoStatus, UserProfile, ShipmentStatus } from '../types';
import VolumeBar from './VolumeBar';
import { Trash2 } from 'lucide-react';
import { PlusIcon } from './icons/PlusIcon';
import { HistoryIcon } from './icons/HistoryIcon';
import { Search, Filter, X, ChevronLeft, ChevronRight, ArrowUpDown, AlertCircle, AlertTriangle, MapPin, ExternalLink } from 'lucide-react';
import MultiSelectDropdown from './MultiSelectDropdown';
import { StayRecord } from '../utils/toolStorage';
import type { Ticket } from '../types';
import { TicketStatus } from '../types';
import { isDemoUser, isDeveloperUser } from '../auth';
import { getCargoMapUrl } from '../utils';
import { calculateCargoBalance } from '../utils/cargoBalance';

interface LoadTableProps {
  loads: Cargo[];
  clients: Client[];
  products: Product[];
  shipments: Shipment[];
  dailyBalanceDate: string;
  onDailyBalanceDateChange: (date: string) => void;
  onCreateShipment?: (load: Cargo) => void;
  onSuspend?: (load: Cargo) => void;
  onReactivate?: (load: Cargo) => void;
  onFinalize?: (load: Cargo) => void;
  onEdit?: (load: Cargo) => void;
  onClose?: (load: Cargo) => void;
  onShowHistory?: (load: Cargo) => void;
  onShowDetails?: (load: Cargo) => void;
  onEditSchedule?: (load: Cargo) => void;
  onShowShipments?: (load: Cargo) => void;
  onRecommendDrivers?: (load: Cargo) => void;
  onDelete?: (cargoId: string) => void;
  onRequestLoadOrder?: (load: Cargo) => void;
  onSaveLoad?: (loadData: Cargo | Omit<Cargo, 'id' | 'history' | 'createdAt' | 'createdById'>) => void;
  currentUser: User;
  stays?: StayRecord[];
  tickets?: Ticket[];
  onFilteredLoadsChange?: (loads: Cargo[]) => void;
}

const LoadTable: React.FC<LoadTableProps> = ({ loads, clients, products, shipments, dailyBalanceDate, onDailyBalanceDateChange, onCreateShipment, onSuspend, onReactivate, onFinalize, onEdit, onClose, onShowHistory, onShowDetails, onEditSchedule, onShowShipments, onRecommendDrivers, onDelete, onRequestLoadOrder, onSaveLoad, currentUser, stays = [], tickets = [], onFilteredLoadsChange }) => {
  const isDemo = isDemoUser(currentUser);
  const [openActionMenu, setOpenActionMenu] = useState<string | null>(null);
  const [tmsModalCargo, setTmsModalCargo] = useState<Cargo | null>(null);
  const [tmsLoteInput, setTmsLoteInput] = useState<string>('');

  const handleOpenTmsModal = (cargo: Cargo) => {
    if (isDemo) return;
    setTmsModalCargo(cargo);
    setTmsLoteInput(cargo.tmsLoteNumber || '');
  };

  const handleSaveTmsLote = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!tmsModalCargo || isDemo) return;
    const updatedCargo: Cargo = {
      ...tmsModalCargo,
      tmsLoteNumber: tmsLoteInput.trim() || undefined,
    };
    if (onSaveLoad) {
      onSaveLoad(updatedCargo);
    }
    setTmsModalCargo(null);
  };
  
  const [showFilters, setShowFilters] = useState(false);
  const [filterId, setFilterId] = useState<string[]>([]);
  const [filterClient, setFilterClient] = useState<string[]>([]);
  const [filterProduct, setFilterProduct] = useState<string[]>([]);
  const [filterOrigin, setFilterOrigin] = useState<string[]>([]);
  const [filterDest, setFilterDest] = useState<string[]>([]);
  const [sortKey, setSortKey] = useState<string>('default');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const getClientName = (clientId: string) => clients.find(c => c.id === clientId)?.nomeFantasia || 'N/A';
  const getProductName = (productId: string) => products.find(p => p.id === productId)?.name || 'N/A';

  const getPayerBranchInfo = (load: Cargo) => {
    const client = clients.find(c => c.id === load.clientId);
    if (!client) return null;

    const branches = client.secondaryCnpjs || [];
    // Apenas exibe se o cliente possuir múltiplas filiais/CNPJs secundários ou filial/CNPJ específico na carga
    if (branches.length === 0 && !load.clientBranchId && !load.clientCnpj) {
      return null;
    }

    let branch = undefined;
    if (load.clientBranchId) {
      branch = branches.find(b => b.id === load.clientBranchId);
    }
    if (!branch && load.clientCnpj) {
      const cleanLoadCnpj = load.clientCnpj.replace(/\D/g, '');
      branch = branches.find(b => b.cnpj.replace(/\D/g, '') === cleanLoadCnpj);
    }

    if (branch) {
      const branchName = branch.nomeFantasia || branch.razaoSocial || 'Filial';
      return {
        isBranch: true,
        name: branchName,
        cnpj: branch.cnpj,
        city: branch.city,
        state: branch.state,
      };
    }

    // Se possui filiais cadastradas mas a carga é da Matriz
    if (branches.length > 0) {
      return {
        isBranch: false,
        name: client.nomeFantasia ? `${client.nomeFantasia} (Matriz)` : 'Matriz',
        cnpj: client.cnpj,
        city: client.city,
        state: client.state,
      };
    }

    return null;
  };

  // Opções únicas baseadas nas cargas listadas
  const idOptions = Array.from(new Set(loads.map(l => l.sequenceId?.toString() || ''))).filter(Boolean).sort();
  const clientOptions = Array.from(new Set(loads.map(l => getClientName(l.clientId)))).filter(Boolean).sort();
  const productOptions = Array.from(new Set(loads.map(l => getProductName(l.productId)))).filter(Boolean).sort();
  const originOptions = Array.from(new Set(loads.map(l => l.origin))).filter(Boolean).sort();
  const destOptions = Array.from(new Set(loads.map(l => l.destination))).filter(Boolean).sort();

  const filteredLoads = useMemo(() => {
    const filtered = loads.filter(load => {
      if (currentUser.profile === UserProfile.Motorista && load.status !== CargoStatus.EmAndamento) return false;
      if (filterId.length > 0 && !filterId.includes(load.sequenceId?.toString() || '')) return false;
      if (filterClient.length > 0 && !filterClient.includes(getClientName(load.clientId))) return false;
      if (filterProduct.length > 0 && !filterProduct.includes(getProductName(load.productId))) return false;
      if (filterOrigin.length > 0 && !filterOrigin.includes(load.origin)) return false;
      if (filterDest.length > 0 && !filterDest.includes(load.destination)) return false;
      return true;
    });

    if (sortKey === 'default') return filtered;

    return [...filtered].sort((a, b) => {
      let valA = '';
      let valB = '';
      if (sortKey === 'id') { valA = (a.sequenceId ?? 0).toString().padStart(10, '0'); valB = (b.sequenceId ?? 0).toString().padStart(10, '0'); }
      else if (sortKey === 'client') { valA = getClientName(a.clientId); valB = getClientName(b.clientId); }
      else if (sortKey === 'product') { valA = getProductName(a.productId); valB = getProductName(b.productId); }
      else if (sortKey === 'origin') { valA = a.origin; valB = b.origin; }
      else if (sortKey === 'destination') { valA = a.destination; valB = b.destination; }
      else if (sortKey === 'createdAt') { valA = a.createdAt || ''; valB = b.createdAt || ''; }
      const cmp = valA.localeCompare(valB, 'pt-BR', { numeric: true });
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [loads, filterId, filterClient, filterProduct, filterOrigin, filterDest, clients, products, sortKey, sortDir]);

  useEffect(() => {
    onFilteredLoadsChange?.(filteredLoads);
  }, [filteredLoads, onFilteredLoadsChange]);

  const activeFiltersCount = (filterId.length > 0 ? 1 : 0) + (filterClient.length > 0 ? 1 : 0) + (filterProduct.length > 0 ? 1 : 0) + (filterOrigin.length > 0 ? 1 : 0) + (filterDest.length > 0 ? 1 : 0);

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;

  useEffect(() => {
    setCurrentPage(1);
  }, [filteredLoads]);

  const totalPages = Math.ceil(filteredLoads.length / itemsPerPage) || 1;
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedLoads = filteredLoads.slice((safeCurrentPage - 1) * itemsPerPage, safeCurrentPage * itemsPerPage);

  const clearFilters = () => {
      setFilterId([]);
      setFilterClient([]);
      setFilterProduct([]);
      setFilterOrigin([]);
      setFilterDest([]);
      setSortKey('default');
      setSortDir('asc');
  };
  
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  }

  const formatNumber = (value: number) => {
    return new Intl.NumberFormat('pt-BR').format(value);
  }

  const statusSymbols: { [key in DailyScheduleType]: string } = {
    [DailyScheduleType.Livre]: 'L',
    [DailyScheduleType.Fixo]: 'F',
    [DailyScheduleType.Verificar]: 'V',
  };

  const statusSymbolColors: { [key in DailyScheduleType]: string } = {
    [DailyScheduleType.Livre]: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
    [DailyScheduleType.Fixo]: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
    [DailyScheduleType.Verificar]: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-100 dark:border-gray-700">
        <div className="flex flex-col md:flex-row items-center justify-between p-4 gap-4">
          {/* Toggle Filters Button */}
          <div className="w-full md:w-auto">
            <button 
                onClick={() => setShowFilters(!showFilters)}
                className={`flex items-center gap-2 px-4 py-2 rounded-md transition-colors ${showFilters || activeFiltersCount > 0 ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border border-blue-200 dark:border-blue-800' : 'bg-gray-50 text-gray-700 dark:bg-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600'}`}
            >
                <Filter className="w-4 h-4" />
                <span className="text-sm font-medium">Filtros Avançados {activeFiltersCount > 0 && `(${activeFiltersCount})`}</span>
            </button>
          </div>

          {/* Existing Controls */}
          <div className="flex items-center gap-4 w-full md:w-auto justify-end">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Balanço Diário para:</span>
              <input
                type="date"
                value={dailyBalanceDate}
                onChange={(e) => onDailyBalanceDateChange(e.target.value)}
                className="p-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 text-sm focus:ring-2 focus:ring-primary outline-none"
              />
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 font-medium whitespace-nowrap hidden sm:block">
              {filteredLoads.length !== loads.length ? `${filteredLoads.length} de ` : ''}{loads.length} cargas cadastradas
            </div>
          </div>
        </div>

        {/* Expandable Filters Section */}
        {showFilters && (
            <div className="p-4 border-t border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                    <MultiSelectDropdown label="ID da Carga" options={idOptions} selectedValues={filterId} onChange={setFilterId} placeholder="Todos os IDs..." />
                    <MultiSelectDropdown label="Nome do Cliente" options={clientOptions} selectedValues={filterClient} onChange={setFilterClient} placeholder="Todos os Clientes..." />
                    <MultiSelectDropdown label="Nome do Produto" options={productOptions} selectedValues={filterProduct} onChange={setFilterProduct} placeholder="Todos os Produtos..." />
                    <MultiSelectDropdown label="Cidade de Origem" options={originOptions} selectedValues={filterOrigin} onChange={setFilterOrigin} placeholder="Todas as Origens..." />
                    <MultiSelectDropdown label="Cidade de Destino" options={destOptions} selectedValues={filterDest} onChange={setFilterDest} placeholder="Todos os Destinos..." />
                </div>
                {/* Ordenação */}
                <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-600 flex flex-wrap items-end gap-4">
                    <div className="flex items-center gap-2">
                        <ArrowUpDown className="w-4 h-4 text-gray-500" />
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Ordenar por:</span>
                    </div>
                    <div className="flex flex-wrap gap-3">
                        <select
                            value={sortKey}
                            onChange={e => setSortKey(e.target.value)}
                            className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 focus:ring-2 focus:ring-primary outline-none"
                        >
                            <option value="default">Padrão (sem ordenação)</option>
                            <option value="id">ID da Carga</option>
                            <option value="client">Nome do Cliente</option>
                            <option value="product">Nome do Produto</option>
                            <option value="origin">Cidade de Origem</option>
                            <option value="destination">Cidade de Destino</option>
                            <option value="createdAt">Data de Criação</option>
                        </select>
                        {sortKey !== 'default' && (
                            <select
                                value={sortDir}
                                onChange={e => setSortDir(e.target.value as 'asc' | 'desc')}
                                className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 focus:ring-2 focus:ring-primary outline-none"
                            >
                                <option value="asc">Crescente (A → Z)</option>
                                <option value="desc">Decrescente (Z → A)</option>
                            </select>
                        )}
                    </div>
                    {(activeFiltersCount > 0 || sortKey !== 'default') && (
                        <button onClick={clearFilters} className="ml-auto text-sm flex items-center gap-1 text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300">
                            <X className="w-4 h-4" /> Limpar Tudo
                        </button>
                    )}
                </div>
            </div>
        )}
      </div>

      <div className="space-y-3">
        {paginatedLoads.map((load) => {
          const cargoBalance = calculateCargoBalance(load, shipments);
          const scheduledButNotLoaded = cargoBalance.scheduledPendingVolume;
          const dailyScheduledTonnage = shipments
            .filter(s => (s.cargoId === load.id || (load.sequenceId && s.cargoId === String(load.sequenceId)) || (load.sequenceId && s.cargoId === `CRG-${load.sequenceId}`)) && s.scheduledDate === dailyBalanceDate && s.status !== ShipmentStatus.Cancelado)
            .reduce((sum, s) => sum + s.shipmentTonnage, 0);
          const dailyScheduleInfo = load.dailySchedule?.find(ds => ds.date === dailyBalanceDate);

          const freightLegsToDisplay = (load.freightLegs && load.freightLegs.length > 0)
            ? load.freightLegs
            : [{
                companyFreightValuePerTon: load.companyFreightValuePerTon,
                companyFreightHasToll: load.companyFreightHasToll,
                driverFreightValuePerTon: load.driverFreightValuePerTon,
                driverFreightHasToll: load.driverFreightHasToll,
                driverFreightValuePerTonPf: load.driverFreightValuePerTon,
                driverFreightPfHasToll: load.driverFreightPfHasToll,
                hasIcms: load.hasIcms,
                icmsPercentage: load.icmsPercentage,
              }];
              
          const totalDriverFreightPj = freightLegsToDisplay.reduce((sum, leg) => sum + (leg.driverFreightValuePerTon || 0), 0);
          const totalDriverFreightPf = freightLegsToDisplay.reduce((sum, leg) => {
              if (leg.disablePfFreight) return sum;
              return sum + (leg.driverFreightValuePerTonPf ?? (leg.driverFreightValuePerTon || 0));
          }, 0);
          const isPfDisabled = freightLegsToDisplay.every(leg => leg.disablePfFreight);

          const hasCompanyToll = freightLegsToDisplay.some(leg => leg.companyFreightHasToll) || load.companyFreightHasToll;
          const hasDriverPjToll = freightLegsToDisplay.some(leg => leg.driverFreightHasToll) || load.driverFreightHasToll;
          const hasDriverPfToll = freightLegsToDisplay.some(leg => leg.driverFreightPfHasToll) || load.driverFreightPfHasToll;

          const totalNetCompanyValue = freightLegsToDisplay.reduce((sum, leg) => {
              const icmsRate = leg.hasIcms ? (leg.icmsPercentage || 0) / 100 : 0;
              return sum + ((leg.companyFreightValuePerTon || 0) * (1 - icmsRate));
          }, 0);

          const totalCommission = load.salespersonCommissionPerTon || 0;
          
          // Calculate average demurrage profit per ton for this load's shipments
          const loadShipments = shipments.filter(s => s.cargoId === load.id && s.status !== ShipmentStatus.Cancelado);
          const loadShipmentIds = new Set(loadShipments.map(s => s.id));
          const totalDemurrageProfit = stays
              .filter(s => s.shipmentId && loadShipmentIds.has(s.shipmentId))
              .reduce((sum, s) => sum + ((s.approvedValue || 0) - (s.driverPaidValue || 0)), 0);
          const totalDemurrageRevenue = stays
              .filter(s => s.shipmentId && loadShipmentIds.has(s.shipmentId))
              .reduce((sum, s) => sum + (s.approvedValue || 0), 0);
              
          const loadedTonnage = loadShipments.reduce((sum, s) => sum + (s.shipmentTonnage || 1), 0);
          
          const demurrageProfitPerTon = loadedTonnage > 0 ? (totalDemurrageProfit / loadedTonnage) : 0;
          const demurrageRevenuePerTon = loadedTonnage > 0 ? (totalDemurrageRevenue / loadedTonnage) : 0;
          
          const totalCompanyFreightWithEstadias = totalNetCompanyValue + demurrageRevenuePerTon;

          const financialCostPerTon = (load.financialCostPerTon !== undefined && load.financialCostPerTon > 0)
            ? load.financialCostPerTon
            : (load.financialCostEnabled && (load.financialCostEffectiveRate || 0) > 0)
              ? (totalNetCompanyValue * ((load.financialCostEffectiveRate || 0) / 100))
              : 0;

          // PJ Margin
          const netProfitPj = totalNetCompanyValue - totalDriverFreightPj - totalCommission - financialCostPerTon + demurrageProfitPerTon;
          const marginPj = (totalCompanyFreightWithEstadias > 0) ? (netProfitPj / totalCompanyFreightWithEstadias) * 100 : 0;
          const netMarginPercentagePj = isNaN(marginPj) || !isFinite(marginPj) ? '0,00%' : `${marginPj.toFixed(2).replace('.', ',')}%`;

          // PF Margin
          const netProfitPf = totalNetCompanyValue - totalDriverFreightPf - totalCommission - financialCostPerTon + demurrageProfitPerTon;
          const marginPf = (totalCompanyFreightWithEstadias > 0) ? (netProfitPf / totalCompanyFreightWithEstadias) * 100 : 0;
          const netMarginPercentagePf = isNaN(marginPf) || !isFinite(marginPf) ? '0,00%' : `${marginPf.toFixed(2).replace('.', ',')}%`;

          return (
            <div key={load.id} className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-100 dark:border-gray-700 hover:border-primary/30 transition-colors">
              <div className="flex flex-col lg:flex-row lg:items-center p-4 gap-4">
                {/* ID and Status */}
                <div className="flex items-center gap-3 min-w-[120px]">
                  <div className="flex flex-col">
                    <div className="flex items-center gap-1.5">
                      <button 
                        onClick={() => onShowDetails?.(load)}
                        className="text-sm font-bold text-primary dark:text-blue-400 hover:underline text-left"
                      >
                        #{load.sequenceId}
                      </button>

                      {/* TMS Lote indicator */}
                      {load.tmsLoteNumber ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenTmsModal(load);
                          }}
                          className="inline-flex items-center justify-center w-4 h-4 rounded bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-transform hover:scale-110 cursor-pointer"
                          title={`Lote TMS: ${load.tmsLoteNumber}`}
                        >
                          <svg className="w-2.5 h-2.5 fill-current" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenTmsModal(load);
                          }}
                          className="inline-flex items-center justify-center text-amber-500 hover:text-amber-600 transition-transform hover:scale-110 cursor-pointer"
                          title="Criação de Lote TMS Pendente"
                        >
                          <AlertTriangle className="w-4 h-4 fill-amber-400 text-amber-600 dark:text-amber-300" />
                        </button>
                      )}

                      {currentUser?.profile !== UserProfile.Cliente && tickets.some(t => t.cargoId === load.id && t.status !== TicketStatus.Fechado && t.status !== TicketStatus.Resolvido) && (
                        <span className="text-red-500 ml-0.5 inline-flex items-center" title="Chamado(s) Aberto(s)">
                          <AlertCircle className="w-4 h-4" />
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-gray-400 font-mono truncate w-20" title={load.id}>{load.id.substring(0, 8)}...</span>
                  </div>
                  <span 
                    className={`inline-flex items-center justify-center h-6 w-6 text-[11px] font-bold rounded-full shadow-sm transition-colors ${
                      load.status === CargoStatus.Suspensa ? 'bg-yellow-100 text-yellow-800' :
                      load.status === CargoStatus.Fechada ? 'bg-gray-100 text-gray-800' :
                      (() => {
                        const today = new Date().toISOString().split('T')[0];
                        const hasCurrentOrFutureSchedule = load.dailySchedule?.some(ds => ds.date >= today);
                        if (load.status === CargoStatus.EmAndamento && !hasCurrentOrFutureSchedule) {
                          return 'bg-red-100 text-red-800 border border-red-200';
                        }
                        return dailyScheduleInfo ? statusSymbolColors[dailyScheduleInfo.type] : 'bg-gray-100 text-gray-400';
                      })()
                    }`}
                    title={
                      load.status === CargoStatus.Suspensa ? 'Carga Suspensa' :
                      load.status === CargoStatus.Fechada ? 'Carga Fechada' :
                      (() => {
                        const today = new Date().toISOString().split('T')[0];
                        const hasCurrentOrFutureSchedule = load.dailySchedule?.some(ds => ds.date >= today);
                        if (load.status === CargoStatus.EmAndamento && !hasCurrentOrFutureSchedule) {
                          return 'Sem Programação (Lançar programação para liberar)';
                        }
                        if (dailyScheduleInfo) {
                          const meanings: Record<string, string> = { 'L': 'Livre', 'F': 'Fixo', 'V': 'Verificar' };
                          return `Programação: ${meanings[statusSymbols[dailyScheduleInfo.type]] || statusSymbols[dailyScheduleInfo.type]}`;
                        }
                        return 'Sem programação para esta data';
                      })()
                    }
                  >
                    {(() => {
                      const today = new Date().toISOString().split('T')[0];
                      const hasCurrentOrFutureSchedule = load.dailySchedule?.some(ds => ds.date >= today);
                      if (load.status === CargoStatus.Suspensa) return 'S';
                      if (load.status === CargoStatus.Fechada) return 'F';
                      if (load.status === CargoStatus.EmAndamento && !hasCurrentOrFutureSchedule) return 'SP';
                      return dailyScheduleInfo ? statusSymbols[dailyScheduleInfo.type] : '-';
                    })()}
                  </span>

                </div>

                {/* Client and Product */}
                <div className="flex-1 xl:flex-none xl:w-[260px] min-w-[200px] flex flex-col justify-center">
                  <div className="text-sm font-bold text-gray-900 dark:text-white truncate" title={getClientName(load.clientId)}>{getClientName(load.clientId)}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 truncate" title={getProductName(load.productId)}>{getProductName(load.productId)}</div>
                  {(() => {
                    const payerInfo = getPayerBranchInfo(load);
                    if (!payerInfo) return null;
                    return (
                      <div 
                        className={`mt-1 inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded border max-w-full truncate ${
                          payerInfo.isBranch
                            ? 'bg-blue-50/80 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border-blue-200/80 dark:border-blue-800/60'
                            : 'bg-gray-50 text-gray-700 dark:bg-gray-700/60 dark:text-gray-300 border-gray-200 dark:border-gray-600'
                        }`}
                        title={`CNPJ / Filial Pagadora: ${payerInfo.name} — CNPJ: ${payerInfo.cnpj}${payerInfo.city ? ` (${payerInfo.city}/${payerInfo.state || ''})` : ''}`}
                      >
                        <span className="text-[9px] uppercase font-bold tracking-wider opacity-75 shrink-0">Pagadora:</span>
                        <span className="font-semibold truncate">{payerInfo.name}</span>
                      </div>
                    );
                  })()}
                </div>

                {/* Programação Futura (Calendário) */}
                <div 
                  className={`flex flex-col flex-1 min-w-[170px] gap-1 pt-3 xl:pt-0 mt-1 xl:mt-0 xl:px-4 border-t xl:border-t-0 xl:border-l xl:border-r border-gray-100 dark:border-gray-700/50 ${onEditSchedule ? 'hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors cursor-pointer group py-1 xl:rounded-md xl:-my-1 relative xl:top-1 xl:bottom-1' : ''}`}
                  onClick={onEditSchedule ? () => onEditSchedule(load) : undefined}
                  role={onEditSchedule ? "button" : undefined}
                  title={onEditSchedule ? "Editar Programação da Carga" : undefined}
                >
                  <span className={`text-[9px] uppercase font-bold text-gray-400 w-full text-left ${onEditSchedule ? 'group-hover:text-primary dark:group-hover:text-blue-400 transition-colors' : ''}`}>Programação</span>
                  <div className="flex flex-wrap gap-1.5 w-full justify-start">
                    {(() => {
                      const today = new Date().toISOString().split('T')[0];
                      const upcoming = (load.dailySchedule || [])
                        .filter(ds => ds.date >= today)
                        .sort((a, b) => a.date.localeCompare(b.date));
                        
                      const toShow = upcoming.slice(0, 3);
                      if (upcoming.length === 0) {
                         return <span className={`text-[11px] text-gray-400 font-medium italic mt-1 pb-1 ${onEditSchedule ? 'group-hover:text-gray-500 dark:group-hover:text-gray-300' : ''}`}>Sem lançamentos</span>;
                      }

                      return (
                        <>
                          {toShow.map((ds, idx) => {
                             const d = new Date(ds.date + 'T12:00:00Z');
                             const dayStr = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
                             const weekday = d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '').toUpperCase();
                             const typeDisplay = ds.type === DailyScheduleType.Fixo ? `F ${ds.tonnage || 0}t` : (statusSymbols[ds.type as DailyScheduleType] || ds.type);
                             
                             return (
                               <div key={idx} className="flex flex-col items-center overflow-hidden bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-md shadow-sm w-[46px] h-[36px] shrink-0" title={`Data: ${ds.date} | Tipo: ${ds.type} | Vol: ${ds.tonnage || 'Livre'}`}>
                                  <div className="bg-indigo-50 dark:bg-indigo-900/40 border-b border-indigo-100 dark:border-indigo-800 w-full text-center h-[13px] flex items-center justify-center">
                                    <span className="text-[8px] text-indigo-700 dark:text-indigo-300 font-bold uppercase tracking-wider">{weekday}</span>
                                  </div>
                                  <div className="w-full flex-1 flex flex-col items-center justify-center bg-white dark:bg-gray-800">
                                    <span className="text-[10px] font-bold text-gray-800 dark:text-gray-100 leading-none tracking-tighter">{dayStr}</span>
                                    <span className="text-[7px] font-bold text-gray-500 dark:text-gray-400 leading-none mt-[2px]">{typeDisplay}</span>
                                  </div>
                               </div>
                             );
                          })}
                          {upcoming.length > 3 && (
                             <div className="flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-md w-[32px] h-[36px] shrink-0" title={`Mais ${upcoming.length - 3} lançamentos`}>
                               <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400">+{upcoming.length - 3}</span>
                             </div>
                          )}
                        </>
                      );
                    })()}
                  </div>
                </div>

                {/* Route */}
                {(() => {
                  const originUrl = getCargoMapUrl('origin', load);
                  const destUrl = getCargoMapUrl('destination', load);
                  const routeUrl = getCargoMapUrl('route', load);
                  const hasCustomOriginMap = Boolean(load.originMapLink || load.originLocation || load.originCoords);
                  const hasCustomDestMap = Boolean(load.destinationMapLink || load.destinationLocation || load.destinationCoords);

                  return (
                    <div className="flex items-center gap-2 min-w-[190px] sm:min-w-[260px] md:min-w-[300px] lg:min-w-[340px] xl:min-w-[380px] text-xs py-2 lg:py-0 border-t border-gray-50 lg:border-t-0 dark:border-gray-700/50">
                      {/* Origem */}
                      <div className="text-left lg:text-right flex-1 min-w-0">
                        <div className="text-gray-400 text-[9px] uppercase font-bold flex items-center lg:justify-end gap-1">
                          {hasCustomOriginMap && <MapPin className="w-2.5 h-2.5 text-emerald-500 shrink-0" />}
                          <span>Origem</span>
                        </div>
                        {originUrl ? (
                          <a
                            href={originUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center lg:justify-end gap-1 font-medium text-gray-700 dark:text-gray-200 hover:text-emerald-600 dark:hover:text-emerald-400 hover:underline truncate sm:overflow-visible sm:whitespace-normal max-w-full group/orig transition-colors"
                            title={`Abrir localização de Origem no Google Maps${load.originLocation ? ` (${load.originLocation})` : ''}: ${load.origin}`}
                          >
                            <span className="truncate sm:overflow-visible sm:whitespace-normal sm:break-words">{load.origin}</span>
                            <ExternalLink className="w-3 h-3 opacity-0 group-hover/orig:opacity-100 shrink-0 transition-opacity text-emerald-500" />
                          </a>
                        ) : (
                          <div className="font-medium text-gray-700 dark:text-gray-300 truncate sm:overflow-visible sm:whitespace-normal sm:break-words" title={load.origin}>
                            {load.origin}
                          </div>
                        )}
                        {load.originLocation && (
                          <div className="text-[10px] text-gray-400 dark:text-gray-500 truncate sm:overflow-visible sm:whitespace-normal" title={`Local de Coleta: ${load.originLocation}`}>
                            {load.originLocation}
                          </div>
                        )}
                      </div>

                      {/* Trajeto / Rota Arrow */}
                      {routeUrl ? (
                        <a
                          href={routeUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="px-1 py-0.5 rounded text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-all shrink-0 hover:scale-110"
                          title="Traçar rota no Google Maps (Origem → Destino)"
                        >
                          →
                        </a>
                      ) : (
                        <div className="text-gray-300 shrink-0">→</div>
                      )}

                      {/* Destino */}
                      <div className="text-left flex-1 min-w-0">
                        <div className="text-gray-400 text-[9px] uppercase font-bold flex items-center gap-1">
                          <span>Destino</span>
                          {hasCustomDestMap && <MapPin className="w-2.5 h-2.5 text-rose-500 shrink-0" />}
                        </div>
                        {destUrl ? (
                          <a
                            href={destUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1 font-medium text-gray-700 dark:text-gray-200 hover:text-rose-600 dark:hover:text-rose-400 hover:underline truncate sm:overflow-visible sm:whitespace-normal max-w-full group/dest transition-colors"
                            title={`Abrir localização de Destino no Google Maps${load.destinationLocation ? ` (${load.destinationLocation})` : ''}: ${load.destination}`}
                          >
                            <span className="truncate sm:overflow-visible sm:whitespace-normal sm:break-words">{load.destination}</span>
                            <ExternalLink className="w-3 h-3 opacity-0 group-hover/dest:opacity-100 shrink-0 transition-opacity text-rose-500" />
                          </a>
                        ) : (
                          <div className="font-medium text-gray-700 dark:text-gray-300 truncate sm:overflow-visible sm:whitespace-normal sm:break-words" title={load.destination}>
                            {load.destination}
                          </div>
                        )}
                        {load.destinationLocation && (
                          <div className="text-[10px] text-gray-400 dark:text-gray-500 truncate sm:overflow-visible sm:whitespace-normal" title={`Local de Entrega: ${load.destinationLocation}`}>
                            {load.destinationLocation}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}


                {/* Balanço Geral */}
                <div className="min-w-[180px] space-y-1">
                  <div className="flex justify-between items-start text-[10px] font-bold text-gray-500 uppercase">
                    <span>Geral</span>
                    <div className="text-right">
                      <div className="text-gray-700 dark:text-gray-300">{formatNumber(cargoBalance.loadedVolume)} / {formatNumber(load.totalVolume)}</div>
                      <div className="text-emerald-600 dark:text-emerald-400 font-bold mt-0.5">Disp: {formatNumber(cargoBalance.availableVolume)} ton</div>
                    </div>
                  </div>
                  <VolumeBar
                    loaded={cargoBalance.loadedVolume}
                    scheduled={cargoBalance.scheduledPendingVolume}
                    total={load.totalVolume}
                    onClick={onShowShipments ? () => onShowShipments(load) : undefined}
                  />
                </div>

                {/* Balanço Diário */}
                <div className="min-w-[180px] space-y-1 bg-gray-50 dark:bg-gray-700/30 p-2 rounded-md border border-gray-100 dark:border-gray-600">
                  <div className="flex justify-between text-[10px] font-bold text-gray-500 uppercase">
                    <span>Diário {dailyScheduleInfo?.type ? `(${dailyScheduleInfo.type})` : ''}</span>
                    <span className="text-blue-600 dark:text-blue-400">
                      {dailyScheduleInfo?.tonnage 
                        ? `${formatNumber(dailyScheduledTonnage)} / ${formatNumber(dailyScheduleInfo.tonnage)} ton`
                        : `${formatNumber(dailyScheduledTonnage)} ton`}
                    </span>
                  </div>
                  <VolumeBar
                    loaded={dailyScheduledTonnage}
                    total={dailyScheduleInfo?.tonnage ? dailyScheduleInfo.tonnage : (dailyScheduledTonnage > 0 ? dailyScheduledTonnage : 1)}
                    scheduled={0}
                    loadedColor="bg-blue-500"
                    onClick={onShowShipments ? () => onShowShipments(load) : undefined}
                  />
                </div>

                {/* Freight and Actions */}
                <div className="flex items-center justify-between lg:justify-end gap-3 min-w-[175px]">
                  <div className="text-right flex flex-col items-end space-y-0.5">
                    <div className="text-[9px] text-gray-400 uppercase font-bold tracking-wider">FRETE</div>
                    {currentUser.profile === UserProfile.Cliente ? (
                      <div className="text-sm font-bold text-primary dark:text-blue-400">
                        {load.companyFreightValuePerTon > 0 
                          ? `${formatCurrency(load.companyFreightValuePerTon)}${hasCompanyToll ? ' + Ped' : ''}` 
                          : 'A combinar'}
                      </div>
                    ) : (
                      <div className="flex flex-col items-end gap-1">
                        {/* PJ Freight */}
                        <div className="flex items-center justify-end gap-1">
                          <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">PJ</span>
                          <span className="text-xs font-extrabold text-emerald-700 dark:text-emerald-300">
                            {totalDriverFreightPj > 0 
                              ? `${formatCurrency(totalDriverFreightPj)}${hasDriverPjToll ? ' + Ped' : ''}` 
                              : 'A combinar'}
                          </span>
                          {totalDriverFreightPj > 0 && (
                            <span className="bg-emerald-100 dark:bg-emerald-900/50 text-emerald-800 dark:text-emerald-300 text-[9px] font-black px-1.5 py-0.5 rounded-md">
                              {netMarginPercentagePj}
                            </span>
                          )}
                        </div>

                        {/* PF Freight */}
                        <div className="flex items-center justify-end gap-1">
                          <span className="text-[10px] font-bold text-orange-600 dark:text-orange-400">PF</span>
                          {isPfDisabled ? (
                            <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 italic">Desabilitado</span>
                          ) : (
                            <>
                              <span className="text-xs font-extrabold text-orange-700 dark:text-orange-300">
                                {totalDriverFreightPf > 0 
                                  ? `${formatCurrency(totalDriverFreightPf)}${hasDriverPfToll ? ' + Ped' : ''}` 
                                  : 'A combinar'}
                              </span>
                              {totalDriverFreightPf > 0 && (
                                <span className="bg-emerald-100 dark:bg-emerald-900/50 text-emerald-800 dark:text-emerald-300 text-[9px] font-black px-1.5 py-0.5 rounded-md">
                                  {netMarginPercentagePf}
                                </span>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="relative">
                    <button
                      onClick={() => setOpenActionMenu(openActionMenu === load.id ? null : load.id)}
                      className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 transition-colors border border-gray-200 dark:border-gray-600"
                    >
                      <PlusIcon className="h-4 w-4" />
                    </button>
                    
                    {openActionMenu === load.id && (
                      <div className="absolute right-0 mt-2 w-48 rounded-lg shadow-xl bg-white dark:bg-gray-800 ring-1 ring-black ring-opacity-5 z-20 overflow-hidden border border-gray-100 dark:border-gray-700">
                        <div className="py-1">
                          {onShowHistory && (
                            <button onClick={() => { onShowHistory(load); setOpenActionMenu(null); }} className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2">
                              <HistoryIcon className="h-4 w-4" /> Histórico
                            </button>
                          )}
                          {onEdit && (
                            <button onClick={() => { onEdit(load); setOpenActionMenu(null); }} className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700">
                              Editar Carga
                            </button>
                          )}
                          {onEditSchedule && (
                            <button onClick={() => { onEditSchedule(load); setOpenActionMenu(null); }} className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700">
                              Editar Programação
                            </button>
                          )}
                          {onCreateShipment && load.status === CargoStatus.EmAndamento && (
                            <button onClick={() => { onCreateShipment(load); setOpenActionMenu(null); }} className="w-full text-left px-4 py-2 text-sm text-primary dark:text-blue-400 font-medium hover:bg-gray-100 dark:hover:bg-gray-700">
                              Novo Embarque
                            </button>
                          )}
                          {onRequestLoadOrder && currentUser.profile === UserProfile.Motorista && load.status === CargoStatus.EmAndamento && (
                            <button onClick={() => { onRequestLoadOrder(load); setOpenActionMenu(null); }} className="w-full text-left px-4 py-2 text-sm text-blue-600 dark:text-blue-400 font-bold hover:bg-gray-100 dark:hover:bg-gray-700">
                              Solicitar Embarque
                            </button>
                          )}
                          {onRecommendDrivers && load.status === CargoStatus.EmAndamento && (
                            <button onClick={() => { onRecommendDrivers(load); setOpenActionMenu(null); }} className="w-full text-left px-4 py-2 text-sm text-indigo-600 dark:text-indigo-400 font-medium hover:bg-gray-100 dark:hover:bg-gray-700">
                              Motoristas Indicados
                            </button>
                          )}
                          {onSuspend && load.status === CargoStatus.EmAndamento && (
                            <button onClick={() => { onSuspend(load); setOpenActionMenu(null); }} className="w-full text-left px-4 py-2 text-sm text-yellow-600 dark:text-yellow-400 hover:bg-gray-100 dark:hover:bg-gray-700">
                              Suspender Carga
                            </button>
                          )}
                          {onReactivate && (load.status === CargoStatus.Suspensa || load.status === CargoStatus.Fechada) && (
                            <button onClick={() => { onReactivate(load); setOpenActionMenu(null); }} className="w-full text-left px-4 py-2 text-sm text-green-600 dark:text-green-400 hover:bg-gray-100 dark:hover:bg-gray-700">
                              Reativar Carga
                            </button>
                          )}
                          {onFinalize && (
                            <button onClick={() => { onFinalize(load); setOpenActionMenu(null); }} className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700">
                              Finalizar Carga
                            </button>
                          )}
                          {onClose && (
                            <button onClick={() => { onClose(load); setOpenActionMenu(null); }} className="w-full text-left px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700">
                              Fechar Carga
                            </button>
                          )}
                          {onDelete && (currentUser.profile === UserProfile.Admin || isDeveloperUser(currentUser)) && (
                            <button onClick={() => { onDelete(load.id); setOpenActionMenu(null); }} className="w-full text-left px-4 py-2 text-sm text-red-700 dark:text-red-500 font-bold hover:bg-red-50 dark:hover:bg-red-900/50 flex items-center gap-2">
                              <Trash2 className="h-4 w-4" /> Excluir Carga
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {totalPages > 1 && (
        <div className="px-6 py-4 flex flex-col sm:flex-row items-center justify-between border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 gap-4 rounded-lg shadow-sm border mt-4">
          <div className="text-sm text-gray-500 dark:text-gray-400">
            Mostrando <span className="font-medium">{(safeCurrentPage - 1) * itemsPerPage + 1}</span> a <span className="font-medium">{Math.min(safeCurrentPage * itemsPerPage, filteredLoads.length)}</span> de <span className="font-medium">{filteredLoads.length}</span> cargas
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              disabled={safeCurrentPage === 1}
              className="p-2 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Página {safeCurrentPage} de {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
              disabled={safeCurrentPage === totalPages}
              className="p-2 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Modal para Informar Lote TMS */}
      {tmsModalCargo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6 border border-gray-200 dark:border-gray-700">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">
              Informe o número do lote criado no TMS:
            </h3>
            <form onSubmit={handleSaveTmsLote}>
              <div className="mb-5">
                <input
                  type="text"
                  value={tmsLoteInput}
                  onChange={(e) => setTmsLoteInput(e.target.value)}
                  placeholder="Número do lote TMS..."
                  autoFocus
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setTmsModalCargo(null)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-md transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-medium text-white bg-primary hover:bg-primary-dark rounded-md shadow-sm transition-colors"
                >
                  OK
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default LoadTable;
