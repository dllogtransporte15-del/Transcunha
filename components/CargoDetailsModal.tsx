
import React, { useMemo } from 'react';
import type { Cargo, Client, Product, User, FreightLeg, Shipment } from '../types';
import { FreightCalculationType, ShipmentStatus } from '../types';
import VolumeBar from './VolumeBar';
import { PaperclipIcon } from './icons/PaperclipIcon';
import { StayRecord } from '../utils/toolStorage';
import { DocumentAttachmentCard } from './ImageLightboxModal';
import FormattedObservations from './FormattedObservations';
import { Globe2 } from 'lucide-react';
import { calculateCargoBalance } from '../utils/cargoBalance';

interface CargoDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  cargo: Cargo | null;
  client: Client | undefined;
  product: Product | undefined;
  commercialUser: User | undefined;
  stays?: StayRecord[];
  shipments?: Shipment[];
  currentUser?: User;
}

const DetailItem: React.FC<{ label: string; value?: string | number | null; children?: React.ReactNode; className?: string }> = ({ label, value, children, className }) => (
    <div className={className}>
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</p>
        {children || <p className="text-sm text-gray-800 dark:text-gray-200">{value ?? 'N/A'}</p>}
    </div>
);

const FreightLegDetail: React.FC<{ leg: FreightLeg; index: number; hideSensitiveData?: boolean; isMotorista?: boolean; calculationType?: FreightCalculationType }> = ({ leg, index, hideSensitiveData, isMotorista, calculationType }) => (
    <div className="p-4 border rounded-md dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
        <div className="flex justify-between items-center mb-3">
            <h4 className="font-semibold text-gray-600 dark:text-gray-300">Perna {index + 1}</h4>
            {!isMotorista && (
                <span className={`text-xs font-semibold px-2 py-1 rounded-full ${
                    calculationType === FreightCalculationType.PerTonPlusIcms || leg.hasIcms
                        ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300'
                        : 'bg-gray-200 text-gray-700 dark:bg-gray-600 dark:text-gray-200'
                }`}>
                    {calculationType === FreightCalculationType.PerTonPlusIcms
                        ? `ICMS: ${leg.icmsPercentage || 0}% (+${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((leg.companyFreightValuePerTon || 0) * ((leg.icmsPercentage || 0) / 100))}/t)`
                        : `ICMS: ${leg.hasIcms ? `Sim (${leg.icmsPercentage}%)` : 'Não'}`}
                </span>
            )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
            {!isMotorista && (
                <div>
                    <p className="text-xs text-gray-500">Frete Empresa</p>
                    <p className="font-medium text-gray-800 dark:text-gray-200">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(leg.companyFreightValuePerTon)}
                        {leg.companyFreightHasToll && <span className="ml-1 text-xs font-bold text-emerald-600 dark:text-emerald-400">+ Ped</span>}
                    </p>
                </div>
            )}
            {!hideSensitiveData && (
                <>
                    <div>
                        <p className="text-xs text-gray-500">{isMotorista ? 'Valor do Frete' : 'Frete Motorista PJ'}</p>
                        <p className="font-medium text-gray-800 dark:text-gray-200">
                            {leg.driverFreightValuePerTon > 0 
                                ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(leg.driverFreightValuePerTon)
                                : 'A combinar'}
                            {leg.driverFreightValuePerTon > 0 && leg.driverFreightHasToll && <span className="ml-1 text-xs font-bold text-emerald-600 dark:text-emerald-400">+ Ped</span>}
                        </p>
                    </div>
                    <div>
                        <p className="text-xs text-gray-500">Frete Motorista PF</p>
                        {leg.disablePfFreight ? (
                            <p className="font-medium text-gray-400 dark:text-gray-500 italic">Desabilitado</p>
                        ) : (
                            <p className="font-medium text-gray-800 dark:text-gray-200">
                                {(leg.driverFreightValuePerTonPf ?? leg.driverFreightValuePerTon) > 0
                                    ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(leg.driverFreightValuePerTonPf ?? leg.driverFreightValuePerTon)
                                    : 'A combinar'}
                                {(leg.driverFreightValuePerTonPf ?? leg.driverFreightValuePerTon) > 0 && leg.driverFreightPfHasToll && <span className="ml-1 text-xs font-bold text-orange-600 dark:text-orange-400">+ Ped</span>}
                            </p>
                        )}
                    </div>
                </>
            )}
        </div>
    </div>
);


const CargoDetailsModal: React.FC<CargoDetailsModalProps> = ({ isOpen, onClose, cargo, client, product, commercialUser, stays = [], shipments = [], currentUser }) => {
  if (!isOpen || !cargo) return null;
  const isClient = currentUser?.profile === 'Cliente';

  const balance = calculateCargoBalance(cargo, shipments);
  const loadedVol = balance.loadedVolume;
  const totalVol = Number(cargo.totalVolume) || 0;
  const scheduledButNotLoaded = balance.scheduledPendingVolume;
  const availableVol = balance.availableVolume;
  
  const formatCurrency = (value?: number | null) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0);
  const formatDate = (dateString?: string | null) => {
    if (!dateString) return 'N/A';
    const d = new Date(dateString);
    return isNaN(d.getTime()) ? String(dateString) : d.toLocaleString('pt-BR');
  };

  const freightLegsToDisplay = (cargo.freightLegs && cargo.freightLegs.length > 0)
    ? cargo.freightLegs
    : [{
        companyFreightValuePerTon: Number(cargo.companyFreightValuePerTon) || 0,
        companyFreightHasToll: cargo.companyFreightHasToll,
        driverFreightValuePerTon: Number(cargo.driverFreightValuePerTon) || 0,
        driverFreightHasToll: cargo.driverFreightHasToll,
        driverFreightValuePerTonPf: Number(cargo.driverFreightValuePerTon) || 0,
        driverFreightPfHasToll: cargo.driverFreightPfHasToll,
        hasIcms: !!cargo.hasIcms,
        icmsPercentage: Number(cargo.icmsPercentage) || 0,
      }];
      
  const { totalCompanyFreight, totalDriverFreight, netMarginPercentage, financialCostPerTon } = useMemo(() => {
    const activeLegs = freightLegsToDisplay;

    const totalCompanyFreight = activeLegs.reduce((sum, leg) => sum + (Number(leg.companyFreightValuePerTon) || 0), 0);
    const totalDriverFreight = activeLegs.reduce((sum, leg) => sum + (Number(leg.driverFreightValuePerTon) || 0), 0);
    
    const totalNetCompanyValue = activeLegs.reduce((sum, leg) => {
        const icmsRate = leg.hasIcms ? (Number(leg.icmsPercentage) || 0) / 100 : 0;
        const compVal = Number(leg.companyFreightValuePerTon) || 0;
        const netValue = compVal * (1 - icmsRate);
        return sum + netValue;
    }, 0);

    const totalCommission = Number(cargo.salespersonCommissionPerTon) || 0;
    
    // Average demurrage
    const loadShipments = (shipments || []).filter(s => s.cargoId === cargo.id && s.status !== ShipmentStatus.Cancelado);
    const loadShipmentIds = new Set(loadShipments.map(s => s.id));
    const totalDemurrageProfit = (stays || [])
        .filter(s => s.shipmentId && loadShipmentIds.has(s.shipmentId))
        .reduce((sum, s) => sum + ((Number(s.approvedValue) || 0) - (Number(s.driverPaidValue) || 0)), 0);
    const totalDemurrageRevenue = (stays || [])
        .filter(s => s.shipmentId && loadShipmentIds.has(s.shipmentId))
        .reduce((sum, s) => sum + (Number(s.approvedValue) || 0), 0);
        
    const loadedTonnage = loadShipments.reduce((sum, s) => sum + (Number(s.shipmentTonnage) || 1), 0);
    const demurrageProfitPerTon = loadedTonnage > 0 ? (totalDemurrageProfit / loadedTonnage) : 0;
    const demurrageRevenuePerTon = loadedTonnage > 0 ? (totalDemurrageRevenue / loadedTonnage) : 0;

    const financialCostPerTon = (cargo.financialCostPerTon !== undefined && cargo.financialCostPerTon > 0)
      ? cargo.financialCostPerTon
      : (cargo.financialCostEnabled && (cargo.financialCostEffectiveRate || 0) > 0)
        ? (totalNetCompanyValue * ((cargo.financialCostEffectiveRate || 0) / 100))
        : 0;

    const netProfit = totalNetCompanyValue - totalDriverFreight - totalCommission - financialCostPerTon + demurrageProfitPerTon;
    const totalCompanyFreightWithEstadias = totalNetCompanyValue + demurrageRevenuePerTon;

    const margin = (totalCompanyFreightWithEstadias > 0) ? (netProfit / totalCompanyFreightWithEstadias) * 100 : 0;
    
    const netMarginPercentage = isNaN(margin) || !isFinite(margin)
        ? '0,00%'
        : `${margin.toFixed(2).replace('.', ',')}%`;

    return { totalCompanyFreight, totalDriverFreight, netMarginPercentage, financialCostPerTon };
  }, [freightLegsToDisplay, cargo.salespersonCommissionPerTon, cargo.financialCostPerTon, cargo.financialCostEnabled, cargo.financialCostEffectiveRate, stays, shipments, cargo.id]);


  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-4xl w-full max-h-[90vh] flex flex-col">
        <div className="flex justify-between items-start mb-4">
            <div>
                <h2 className="text-2xl font-bold text-gray-800 dark:text-white">Detalhes da Carga: {cargo.sequenceId}</h2>
                <p className="text-xs text-gray-400 font-mono">{cargo.id}</p>
            </div>
            <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700">&times;</button>
        </div>
        
        <div className="flex-1 overflow-y-auto space-y-6 pr-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
                <DetailItem label="Cliente" value={client?.nomeFantasia || client?.razaoSocial} />
                {(() => {
                  const branches = client?.secondaryCnpjs || [];
                  let branch = undefined;
                  if (cargo.clientBranchId) {
                    branch = branches.find(b => b.id === cargo.clientBranchId);
                  }
                  if (!branch && cargo.clientCnpj) {
                    const cleanCnpj = cargo.clientCnpj.replace(/\D/g, '');
                    branch = branches.find(b => b.cnpj.replace(/\D/g, '') === cleanCnpj);
                  }

                  if (branch) {
                    return (
                      <DetailItem label="CNPJ / Filial Pagadora">
                        <p className="text-sm font-semibold text-blue-700 dark:text-blue-400">
                          {branch.nomeFantasia || branch.razaoSocial || 'Filial'}
                          <span className="font-mono text-xs text-gray-600 dark:text-gray-400 ml-1.5 font-normal">({branch.cnpj})</span>
                          {branch.city && <span className="text-xs text-gray-500 ml-1 font-normal">[{branch.city}/{branch.state}]</span>}
                        </p>
                      </DetailItem>
                    );
                  }
                  if (branches.length > 0) {
                    return (
                      <DetailItem label="CNPJ / Filial Pagadora">
                        <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                          Matriz
                          <span className="font-mono text-xs text-gray-600 dark:text-gray-400 ml-1.5 font-normal">({client?.cnpj})</span>
                          {client?.city && <span className="text-xs text-gray-500 ml-1 font-normal">[{client.city}/{client.state}]</span>}
                        </p>
                      </DetailItem>
                    );
                  }
                  return (
                    <DetailItem label="CNPJ Principal" value={client?.cnpj} />
                  );
                })()}
                <DetailItem label="Produto" value={product?.name || (cargo as any)?.productName || 'GRÃOS'} />
                <DetailItem label="Embalagem (Tipo)" value={cargo.packaging || 'Granel'} />
                <DetailItem label="Nº do Pedido">
                    {cargo.orderNumber ? (
                        <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="inline-flex items-center justify-center w-4 h-4 rounded bg-blue-600 text-white shadow-sm text-[10px]">✓</span>
                            <span className="text-sm font-semibold text-blue-700 dark:text-blue-400">{cargo.orderNumber}</span>
                        </div>
                    ) : (
                        <span className="text-sm text-gray-500 dark:text-gray-400">Não informado</span>
                    )}
                </DetailItem>
                <DetailItem label="Origem" value={cargo.origin} className="uppercase" />
                <DetailItem label="Destino" value={cargo.destination} className="uppercase" />
                <DetailItem label="Lote TMS">
                    {cargo.tmsLoteNumber ? (
                        <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="inline-flex items-center justify-center w-4 h-4 rounded bg-emerald-600 text-white shadow-sm text-[10px]">✓</span>
                            <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">{cargo.tmsLoteNumber}</span>
                        </div>
                    ) : (
                        <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-amber-500 font-bold">⚠️</span>
                            <span className="text-sm text-amber-600 dark:text-amber-400 font-medium">Pendente (Não informado)</span>
                        </div>
                    )}
                </DetailItem>
                <DetailItem label="Tipo de Operação">
                    {cargo.isExport ? (
                        <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                                <Globe2 className="w-3.5 h-3.5" />
                                <span>Exportação</span>
                            </span>
                        </div>
                    ) : (
                        <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                                <span>Mercado Interno</span>
                            </span>
                        </div>
                    )}
                </DetailItem>
                {cargo.originMapLink && <DetailItem label="Link Mapa (Origem)"><a href={cargo.originMapLink} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 dark:text-blue-400 underline truncate">Abrir link</a></DetailItem>}
                {cargo.destinationMapLink && <DetailItem label="Link Mapa (Destino)"><a href={cargo.destinationMapLink} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 dark:text-blue-400 underline truncate">Abrir link</a></DetailItem>}
            </div>

            <div className="border-t dark:border-gray-700 pt-4">
                 <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">Balanço de Volume (ton)</h3>
                 <VolumeBar
                    loaded={loadedVol}
                    scheduled={scheduledButNotLoaded}
                    total={totalVol}
                />
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2 text-center">
                    <div className="p-2 bg-green-100/50 dark:bg-green-900/20 rounded">
                        <p className="text-xs text-green-700 dark:text-green-300">Carregado</p>
                        <p className="font-bold text-green-800 dark:text-green-200">{loadedVol.toLocaleString('pt-BR')} t</p>
                    </div>
                     <div className="p-2 bg-orange-100/50 dark:bg-orange-900/20 rounded">
                        <p className="text-xs text-orange-700 dark:text-orange-300">Agendado</p>
                        <p className="font-bold text-orange-800 dark:text-orange-200">{scheduledButNotLoaded.toLocaleString('pt-BR')} t</p>
                    </div>
                     <div className="p-2 bg-emerald-100/50 dark:bg-emerald-900/20 rounded">
                        <p className="text-xs text-emerald-700 dark:text-emerald-300">Disponível</p>
                        <p className="font-bold text-emerald-800 dark:text-emerald-200">{availableVol.toLocaleString('pt-BR')} t</p>
                    </div>
                     <div className="p-2 bg-gray-100 dark:bg-gray-700 rounded">
                        <p className="text-xs text-gray-500">Total Lote</p>
                        <p className="font-bold text-gray-800 dark:text-gray-200">{totalVol.toLocaleString('pt-BR')} t</p>
                    </div>
                </div>
            </div>

            <div className="border-t dark:border-gray-700 pt-4">
                <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    Valores de Frete {cargo.freightCalculationType === FreightCalculationType.Fixed ? '(Frete Fechado)' : cargo.freightCalculationType === FreightCalculationType.PerTonPlusIcms ? '(P/ton + ICMS)' : '(por Tonelada)'}
                </h3>
                <div className="space-y-3">
                    {freightLegsToDisplay.map((leg, index) => (
                        <FreightLegDetail 
                            key={index} 
                            leg={leg} 
                            index={index} 
                            hideSensitiveData={isClient} 
                            isMotorista={currentUser?.profile === 'Motorista'} 
                            calculationType={cargo.freightCalculationType}
                        />
                    ))}
                </div>
                 <div className={`mt-4 grid grid-cols-1 ${financialCostPerTon > 0 ? 'md:grid-cols-2 lg:grid-cols-4' : 'md:grid-cols-3'} gap-4`}>
                    {currentUser?.profile === 'Motorista' ? (
                        <div className="p-3 bg-gray-100 dark:bg-gray-700 rounded-md col-span-3">
                            <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Valor do Frete (Final)</label>
                            <p className="text-lg font-bold text-gray-800 dark:text-gray-200">
                                {formatCurrency(totalDriverFreight)}
                                {(freightLegsToDisplay.some(leg => leg.driverFreightHasToll) || cargo.driverFreightHasToll) && <span className="ml-1 text-sm font-bold text-emerald-600 dark:text-emerald-400">+ Ped</span>}
                            </p>
                        </div>
                    ) : (
                        <>
                            <div className="p-3 bg-gray-100 dark:bg-gray-700 rounded-md">
                                <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Frete Empresa (Final)</label>
                                <p className="text-lg font-bold text-gray-800 dark:text-gray-200">
                                    {formatCurrency(totalCompanyFreight)}
                                    {(freightLegsToDisplay.some(leg => leg.companyFreightHasToll) || cargo.companyFreightHasToll) && <span className="ml-1 text-sm font-bold text-emerald-600 dark:text-emerald-400">+ Ped</span>}
                                </p>
                            </div>
                            {!isClient && (
                                <>
                                    <div className="p-3 bg-gray-100 dark:bg-gray-700 rounded-md">
                                        <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Frete Motorista (Final)</label>
                                        <p className="text-lg font-bold text-gray-800 dark:text-gray-200">
                                            {formatCurrency(totalDriverFreight)}
                                            {(freightLegsToDisplay.some(leg => leg.driverFreightHasToll) || cargo.driverFreightHasToll) && <span className="ml-1 text-sm font-bold text-emerald-600 dark:text-emerald-400">+ Ped</span>}
                                        </p>
                                    </div>
                                    {financialCostPerTon > 0 && (
                                        <div className="p-3 bg-purple-50 dark:bg-purple-900/30 rounded-md border border-purple-200 dark:border-purple-800">
                                            <label className="text-xs font-medium text-purple-600 dark:text-purple-400">Custo Financeiro ({cargo.financialCostEffectiveRate || 0}%)</label>
                                            <p className="text-lg font-bold text-purple-700 dark:text-purple-300">
                                                - {formatCurrency(financialCostPerTon)}
                                                <span className="text-xs font-normal text-gray-500 ml-1">/ ton</span>
                                            </p>
                                        </div>
                                    )}
                                    <div className="p-3 bg-blue-50 dark:bg-blue-900/50 rounded-md border border-blue-200 dark:border-blue-800">
                                        <label className="text-xs font-medium text-blue-500 dark:text-blue-400">Margem Líquida (%)</label>
                                        <p className="text-lg font-bold text-primary dark:text-blue-300">{netMarginPercentage}</p>
                                    </div>
                                </>
                            )}
                        </>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t dark:border-gray-700 pt-4">
                <DetailItem label="Exige Agendamento" value={cargo.requiresScheduling ? 'Sim' : 'Não'} />
                <DetailItem label="Precisa de Rastreador" value={cargo.requiresTracker ? 'Sim' : 'Não'} />
                <DetailItem label="Tipo de Carga" value={cargo.type} />
                <DetailItem label="Status da Carga" value={cargo.status} />
                <DetailItem label="Prazo de Carregamento" value={cargo.loadingDeadline ? new Date(cargo.loadingDeadline).toLocaleDateString('pt-BR') : 'N/A'} />
                <DetailItem label="Comercial Responsável" value={commercialUser?.name} />
                <DetailItem label="Data de Criação" value={formatDate(cargo.createdAt)} />
            </div>

            {cargo.observations && (
                <div className="border-t dark:border-gray-700 pt-4">
                    <DetailItem label="Observações">
                        <FormattedObservations text={cargo.observations} className="text-sm text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-700/50 p-3 rounded-md" />
                    </DetailItem>
                </div>
            )}

            {cargo.attachments && cargo.attachments.length > 0 && (
                <div className="border-t dark:border-gray-700 pt-4">
                    <DetailItem label="Anexos e Documentos">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                            {cargo.attachments.map((fileName, index) => (
                                <DocumentAttachmentCard
                                    key={index}
                                    attachment={fileName}
                                    index={index}
                                    label="Roteiro / Imagem da Carga"
                                />
                            ))}
                        </div>
                    </DetailItem>
                </div>
            )}

            {cargo.allowedVehicleTypes && cargo.allowedVehicleTypes.length > 0 && (
                <div className="border-t dark:border-gray-700 pt-4">
                    <DetailItem label="Tipos de Veículos Permitidos">
                        <div className="flex flex-wrap gap-2 mt-1">
                            {cargo.allowedVehicleTypes.map((vt, idx) => (
                                <span key={idx} className="px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 border border-blue-200 dark:border-blue-800/50">
                                    {vt.setType} ({vt.bodyTypes.join('/')})
                                </span>
                            ))}
                        </div>
                    </DetailItem>
                </div>
            )}




        </div>
        
        <div className="mt-6 flex justify-end border-t dark:border-gray-700 pt-4">
          <button type="button" onClick={onClose} className="py-2 px-4 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 dark:bg-gray-600 dark:text-gray-200 dark:hover:bg-gray-500">
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};

export default CargoDetailsModal;
