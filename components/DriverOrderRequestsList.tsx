import React, { useState } from 'react';
import type { FreightOffer, Cargo, Driver, User, Client, Product } from '../types';
import { FreightOfferStatus, CargoStatus, UserProfile } from '../types';
import { 
  Truck, 
  User as UserIcon, 
  Phone, 
  MapPin, 
  Package, 
  Calendar, 
  CheckCircle2, 
  XCircle, 
  DollarSign, 
  History, 
  Check, 
  X, 
  Clock, 
  AlertCircle,
  ExternalLink
} from 'lucide-react';
import { WhatsAppIcon } from './icons';
import { isDemoUser } from '../auth';
import OrderRequestDecisionModal from './OrderRequestDecisionModal';

interface DriverOrderRequestsListProps {
  requests: FreightOffer[];
  cargos?: Cargo[];
  drivers?: Driver[];
  users?: User[];
  clients?: Client[];
  products?: Product[];
  currentUser?: User | null;
  title?: string;
  isDriverView?: boolean;
  onAccept: (offer: FreightOffer) => void | Promise<void>;
  onRefuse: (offer: FreightOffer, reason?: string) => void | Promise<void>;
  onShowDriverHistory?: (driverId: string) => void;
}

export const DriverOrderRequestsList: React.FC<DriverOrderRequestsListProps> = ({
  requests,
  cargos = [],
  drivers = [],
  users = [],
  clients = [],
  products = [],
  currentUser,
  title = "Solicitações de Ordem de Carregamento",
  isDriverView = false,
  onAccept,
  onRefuse,
  onShowDriverHistory
}) => {
  const isDemo = isDemoUser(currentUser);
  const [selectedOfferForDecision, setSelectedOfferForDecision] = useState<FreightOffer | null>(null);

  if (!requests || requests.length === 0) {
    return null;
  }

  const getCargo = (cargoId?: string) => {
    if (!cargoId) return undefined;
    return cargos.find(c => c.id === cargoId);
  };

  const getDriver = (driverId?: string) => {
    if (!driverId) return undefined;
    return drivers.find(d => d.id === driverId);
  };

  const getDriverUser = (driverId?: string) => {
    if (!driverId) return undefined;
    return users.find(u => u.id === driverId);
  };

  const getClient = (clientId?: string) => {
    if (!clientId) return undefined;
    return clients.find(c => c.id === clientId);
  };

  const getProduct = (productId?: string) => {
    if (!productId) return undefined;
    return products.find(p => p.id === productId);
  };

  const getEmbarcador = (embarcadorId?: string) => {
    if (!embarcadorId) return undefined;
    return users.find(u => u.id === embarcadorId);
  };

  const formatDateTime = (dateStr?: string) => {
    if (!dateStr) return '-';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('pt-BR', { 
        day: '2-digit', 
        month: '2-digit', 
        year: 'numeric', 
        hour: '2-digit', 
        minute: '2-digit' 
      });
    } catch {
      return dateStr;
    }
  };

  const formatMoney = (val?: number) => {
    return (val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  const getWhatsAppUrl = (phone?: string, driverName?: string, cargoSequence?: string) => {
    if (!phone) return '#';
    const digits = phone.replace(/\D/g, '');
    if (!digits) return '#';
    const finalDigits = (digits.length === 10 || digits.length === 11) ? `55${digits}` : digits;
    const msg = `Olá ${driverName || 'Motorista'}! Estou entrando em contato referente à sua solicitação de ordem de carregamento para a Carga ${cargoSequence || ''}.`;
    return `https://wa.me/${finalDigits}?text=${encodeURIComponent(msg)}`;
  };

  return (
    <>
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-blue-100 dark:border-blue-900/40 overflow-hidden mb-6">
        <div className="p-4 bg-gradient-to-r from-blue-600/10 via-indigo-600/5 to-transparent border-b border-blue-100 dark:border-blue-900/40 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-600 text-white rounded-lg shadow-xs">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900 dark:text-white text-base">
                {title}
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {isDriverView 
                  ? 'Acompanhe as respostas e o status das suas solicitações de ordem'
                  : 'Motoristas aguardando autorização de carregamento e emissão de embarque'
                }
              </p>
            </div>
          </div>
          <span className="px-2.5 py-1 text-xs font-black bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 rounded-full border border-blue-200 dark:border-blue-800">
            {requests.length} {requests.length === 1 ? 'solicitação' : 'solicitações'}
          </span>
        </div>

        <div className="divide-y divide-gray-100 dark:divide-gray-700/60">
          {requests.map(request => {
            const cargo = getCargo(request.cargoId);
            const driver = getDriver(request.driverId);
            const driverUser = getDriverUser(request.driverId);
            const client = getClient(request.clientId || cargo?.clientId);
            const product = getProduct(request.productId || cargo?.productId);
            const targetedEmbarcador = getEmbarcador(request.requestedEmbarcadorId);

            const driverName = driver?.name || driverUser?.name || (request as any).driverName || 'Motorista';
            const driverPhone = driver?.phone || driverUser?.phone || (request as any).driverContact || '';
            const driverCpf = driver?.cpf || (driverUser?.email && driverUser.email.replace(/\D/g, '').length === 11 ? driverUser.email : '') || (request as any).driverCpf || '-';
            const cargoSeq = cargo?.sequenceId ? `#${cargo.sequenceId}` : (request.cargoId ? `#${request.cargoId.slice(0, 8)}` : 'N/A');
            const ratePerTon = request.freightValuePerTon || cargo?.driverFreightValuePerTon || 0;
            const remainingTon = cargo ? Math.max(0, cargo.scheduledVolume - cargo.loadedVolume) : (request.totalTonnage || 0);

            const isPending = request.status === FreightOfferStatus.Pendente;
            const isAccepted = request.status === FreightOfferStatus.Aceita;
            const isRefused = request.status === FreightOfferStatus.Recusada;

            const reqTime = new Date(request.requestTimestamp || request.createdAt || Date.now()).getTime();
            const elapsedMs = Date.now() - reqTime;
            const isExpired = elapsedMs >= 10 * 60 * 1000;
            const remainingMin = Math.max(1, Math.ceil((10 * 60 * 1000 - elapsedMs) / 60000));
            const isExpiredRefusal = isRefused && Boolean(request.history?.some(h => h.description?.includes('Solicitação exp.') || h.description?.includes('expirada')));

            return (
              <div 
                key={request.id} 
                className={`p-4 sm:p-5 transition-all flex flex-col lg:flex-row lg:items-center justify-between gap-4 ${
                  isPending 
                    ? 'bg-blue-50/20 dark:bg-blue-950/10 hover:bg-blue-50/40 dark:hover:bg-blue-950/20' 
                    : 'hover:bg-gray-50 dark:hover:bg-gray-700/30'
                }`}
              >
                {/* INFORMAÇÕES DO MOTORISTA E DA CARGA */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 flex-1">
                  {/* Bloco 1: Motorista */}
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 flex items-center justify-center font-bold text-sm shrink-0 mt-0.5">
                      <UserIcon className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-sm text-gray-900 dark:text-white truncate">
                          {driverName}
                        </h4>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        <span>CPF: {driverCpf}</span>
                      </div>
                      {driverPhone && (
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-gray-600 dark:text-gray-300 flex items-center gap-1 font-mono">
                            <Phone className="w-3 h-3 text-gray-400" />
                            {driverPhone}
                          </span>
                          <a
                            href={getWhatsAppUrl(driverPhone, driverName, cargoSeq)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 rounded text-[11px] font-semibold transition-colors border border-emerald-200 dark:border-emerald-800/60"
                            title="Conversar no WhatsApp"
                          >
                            <WhatsAppIcon className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                            WhatsApp
                          </a>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Bloco 2: Detalhes da Carga */}
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 text-xs font-black bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 rounded-md">
                        Carga {cargoSeq}
                      </span>
                      {product && (
                        <span className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate">
                          {product.name}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-600 dark:text-gray-300 flex items-center gap-1.5 truncate">
                      <MapPin className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                      <span className="truncate">{request.origin} &rarr; {request.destination}</span>
                    </div>
                    {client && (
                      <div className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
                        Cliente: {client.nomeFantasia || client.razaoSocial}
                      </div>
                    )}
                  </div>

                  {/* Bloco 3: Frete do Motorista & Direcionamento */}
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 text-xs">
                      <span className="text-gray-500 dark:text-gray-400">Frete Motorista:</span>
                      <span className="font-bold text-emerald-600 dark:text-emerald-400">
                        {ratePerTon > 0 ? `${formatMoney(ratePerTon)}/ton` : 'A combinar'}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      Saldo Carga: <strong className="text-gray-700 dark:text-gray-200">{remainingTon.toFixed(2)} ton</strong>
                    </div>
                    <div className="text-[11px] text-gray-500 dark:text-gray-400 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      Solicitado em {formatDateTime(request.requestTimestamp || request.createdAt)}
                    </div>
                    {isPending && (
                      <div className={`text-[11px] font-bold flex items-center gap-1 ${
                        isExpired 
                          ? 'text-rose-600 dark:text-rose-400' 
                          : remainingMin <= 3 
                          ? 'text-amber-600 dark:text-amber-400 animate-pulse' 
                          : 'text-blue-600 dark:text-blue-400'
                      }`}>
                        <Clock className="w-3 h-3" />
                        {isExpired ? 'Prazo esgotado (10 min)' : `Expira em ~${remainingMin} min`}
                      </div>
                    )}
                    {targetedEmbarcador && (
                      <div className="text-[11px] text-blue-600 dark:text-blue-400 font-medium truncate">
                        Direcionado para: {targetedEmbarcador.name}
                      </div>
                    )}
                  </div>
                </div>

                {/* STATUS OU BOTÕES DE AÇÃO */}
                <div className="flex items-center gap-2 self-end lg:self-center shrink-0">
                  {isPending && !isDriverView && (
                    <>
                      {onShowDriverHistory && request.driverId && (
                        <button
                          type="button"
                          onClick={() => onShowDriverHistory(request.driverId!)}
                          title="Ver Histórico de Embarques do Motorista"
                          className="p-2 text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
                        >
                          <History className="w-4 h-4" />
                        </button>
                      )}

                      {isExpired ? (
                        <button
                          type="button"
                          onClick={() => onRefuse(request, 'Solicitação exp.')}
                          disabled={isDemo}
                          className="px-3 py-2 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition-all shadow-xs flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                        >
                          <Clock className="w-4 h-4" />
                          Registrar Expiração (10 min)
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setSelectedOfferForDecision(request)}
                          disabled={isDemo}
                          className="px-3 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-all shadow-xs flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          Avaliar Ordem
                        </button>
                      )}
                    </>
                  )}

                  {isPending && isDriverView && (
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border ${
                      isExpired
                        ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border-rose-200 dark:border-rose-800'
                        : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                    }`}>
                      <Clock className="w-4 h-4" />
                      {isExpired ? 'Expirando (10 min sem resposta)' : `Aguardando Aprovação (Expira em ~${remainingMin} min)`}
                    </span>
                  )}

                  {isAccepted && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 rounded-lg border border-emerald-200 dark:border-emerald-800">
                      <CheckCircle2 className="w-4 h-4" />
                      Ordem Aceita
                    </span>
                  )}

                  {isRefused && (
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border ${
                      isExpiredRefusal
                        ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                        : 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border-rose-200 dark:border-rose-800'
                    }`}>
                      {isExpiredRefusal ? (
                        <>
                          <Clock className="w-4 h-4" />
                          Solicitação Expirada (10 min)
                        </>
                      ) : (
                        <>
                          <XCircle className="w-4 h-4" />
                          Ordem Recusada
                        </>
                      )}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* MODAL DE DECISÃO INTEGRADO */}
      {selectedOfferForDecision && (
        <OrderRequestDecisionModal
          isOpen={!!selectedOfferForDecision}
          onClose={() => setSelectedOfferForDecision(null)}
          offer={selectedOfferForDecision}
          cargo={getCargo(selectedOfferForDecision.cargoId)}
          driver={getDriver(selectedOfferForDecision.driverId)}
          driverUser={getDriverUser(selectedOfferForDecision.driverId)}
          client={getClient(selectedOfferForDecision.clientId || getCargo(selectedOfferForDecision.cargoId)?.clientId)}
          product={getProduct(selectedOfferForDecision.productId || getCargo(selectedOfferForDecision.cargoId)?.productId)}
          requestedEmbarcador={getEmbarcador(selectedOfferForDecision.requestedEmbarcadorId)}
          onAccept={async (offer) => {
            setSelectedOfferForDecision(null);
            await onAccept(offer);
          }}
          onRefuse={async (offer, reason) => {
            setSelectedOfferForDecision(null);
            await onRefuse(offer, reason);
          }}
        />
      )}
    </>
  );
};

export default DriverOrderRequestsList;
