import React, { useState, useEffect } from 'react';
import type { FreightOffer, Cargo, Driver, User, Client, Product } from '../types';
import { 
  X, 
  Truck, 
  User as UserIcon, 
  Phone, 
  MapPin, 
  Package, 
  Building2, 
  Calendar, 
  CheckCircle2, 
  XCircle, 
  DollarSign, 
  MessageSquare,
  AlertTriangle,
  Clock
} from 'lucide-react';
import { calculateCargoBalance } from '../utils/cargoBalance';

interface OrderRequestDecisionModalProps {
  isOpen: boolean;
  onClose: () => void;
  offer: FreightOffer | null;
  cargo?: Cargo;
  driver?: Driver;
  driverUser?: User;
  client?: Client;
  product?: Product;
  requestedEmbarcador?: User;
  onAccept: (offer: FreightOffer) => void | Promise<void>;
  onRefuse: (offer: FreightOffer, reason?: string) => void | Promise<void>;
}

const OrderRequestDecisionModal: React.FC<OrderRequestDecisionModalProps> = ({
  isOpen,
  onClose,
  offer,
  cargo,
  driver,
  driverUser,
  client,
  product,
  requestedEmbarcador,
  onAccept,
  onRefuse
}) => {
  const [isRefusing, setIsRefusing] = useState(false);
  const [refusalReason, setRefusalReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentTime, setCurrentTime] = useState(Date.now());

  useEffect(() => {
    if (!isOpen || !offer) return;
    setCurrentTime(Date.now());
    const timer = setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [isOpen, offer]);

  if (!isOpen || !offer) return null;

  const anyOffer = offer as any;
  const driverName = driver?.name || driverUser?.name || anyOffer.driverName || 'Motorista';
  const driverCpf = driver?.cpf || (driverUser?.email && driverUser.email.replace(/\D/g, '').length === 11 ? driverUser.email : '') || anyOffer.driverCpf || '-';
  const driverPhone = driver?.phone || driverUser?.phone || anyOffer.driverContact || '';
  const cargoSequence = cargo?.sequenceId ? `#${cargo.sequenceId}` : (offer.cargoId ? `#${offer.cargoId.slice(0, 8)}` : 'N/A');

  const reqTime = offer.requestTimestamp 
    ? new Date(offer.requestTimestamp).getTime() 
    : (offer.createdAt ? new Date(offer.createdAt).getTime() : Date.now());
  const elapsedMs = currentTime - reqTime;
  const remainingMs = Math.max(0, 10 * 60 * 1000 - elapsedMs);
  const remainingMinutes = Math.floor(remainingMs / 60000);
  const remainingSeconds = Math.floor((remainingMs % 60000) / 1000);
  const isExpired = remainingMs <= 0;

  const ratePerTon = offer.freightValuePerTon || cargo?.driverFreightValuePerTon || 0;
  const cargoBal = cargo ? calculateCargoBalance(cargo) : null;
  const tonnage = offer.totalTonnage || cargoBal?.availableVolume || 0;
  const estimatedTotal = ratePerTon * tonnage;

  const formatDateTime = (dateStr?: string) => {
    if (!dateStr) return '-';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch {
      return dateStr;
    }
  };

  const formatMoney = (val: number) => {
    return (val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  const getWhatsAppUrl = (phone: string) => {
    const digits = phone.replace(/\D/g, '');
    if (!digits) return '#';
    const finalDigits = (digits.length === 10 || digits.length === 11) ? `55${digits}` : digits;
    const msg = `Olá ${driverName}! Estou respondendo sobre sua solicitação de ordem de carregamento para a Carga ${cargoSequence}.`;
    return `https://wa.me/${finalDigits}?text=${encodeURIComponent(msg)}`;
  };

  const handleConfirmAccept = async () => {
    setIsSubmitting(true);
    try {
      await onAccept(offer);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmRefuse = async () => {
    setIsSubmitting(true);
    try {
      await onRefuse(offer, refusalReason.trim());
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
      <div 
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden border border-gray-100 dark:border-gray-700 relative flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-gray-700 bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/20 text-blue-400 border border-blue-400/30 flex items-center justify-center">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Solicitação de Ordem de Carregamento
              </h2>
              <p className="text-xs text-blue-200/80 font-mono">
                Carga {cargoSequence} • Solicitado por <strong className="text-white">{driverName}</strong>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-300 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1 text-xs">
          {/* Alerta de Tempo Limite (10 minutos) */}
          <div className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 ${
            isExpired 
              ? 'bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800' 
              : remainingMinutes < 3 
              ? 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800 animate-pulse'
              : 'bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800'
          }`}>
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 shrink-0" />
              <div>
                <span className="font-bold">
                  {isExpired 
                    ? 'Prazo esgotado (10 minutos)' 
                    : `Tempo limite de aceite/recusa: 10 min`}
                </span>
                <p className="text-[11px] opacity-90 mt-0.5">
                  {isExpired
                    ? 'Esta solicitação expirou e deve ser direcionada para o histórico de cancelados (Motivo: Solicitação exp.).'
                    : 'A solicitação expirará automaticamente se não for aceita ou recusada.'}
                </p>
              </div>
            </div>
            <div className="shrink-0 font-mono font-black text-sm px-2.5 py-1 rounded-lg bg-white/80 dark:bg-black/30 border border-current">
              {isExpired ? 'EXPIRADA' : `${String(remainingMinutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`}
            </div>
          </div>
          {/* Card Motorista */}
          <div className="bg-gray-50 dark:bg-gray-700/40 rounded-xl p-4 border border-gray-200/80 dark:border-gray-600">
            <div className="flex items-center justify-between mb-3 border-b border-gray-200 dark:border-gray-600 pb-2">
              <span className="font-bold text-gray-800 dark:text-gray-200 flex items-center gap-1.5 uppercase tracking-wider text-[11px]">
                <UserIcon className="w-4 h-4 text-primary dark:text-blue-400" />
                Dados do Motorista Solicitante
              </span>
              {driverPhone && (
                <a
                  href={getWhatsAppUrl(driverPhone)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-700 rounded-lg hover:bg-emerald-100 font-semibold transition"
                >
                  <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
                  WhatsApp
                </a>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <span className="text-[10px] text-gray-400 font-semibold block">NOME COMPLETO</span>
                <span className="font-bold text-gray-900 dark:text-white text-sm">{driverName}</span>
              </div>
              <div>
                <span className="text-[10px] text-gray-400 font-semibold block">CPF</span>
                <span className="font-mono text-gray-800 dark:text-gray-200">{driverCpf}</span>
              </div>
              <div>
                <span className="text-[10px] text-gray-400 font-semibold block">TELEFONE / CONTATO</span>
                <span className="font-mono text-gray-800 dark:text-gray-200 flex items-center gap-1">
                  <Phone className="w-3 h-3 text-gray-400" /> {driverPhone || 'Não informado'}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-gray-400 font-semibold block">HORÁRIO DA SOLICITAÇÃO</span>
                <span className="text-gray-700 dark:text-gray-300 flex items-center gap-1">
                  <Calendar className="w-3 h-3 text-gray-400" /> 
                  {formatDateTime(offer.requestTimestamp || offer.createdAt)}
                </span>
              </div>
            </div>
          </div>

          {/* Card Carga */}
          <div className="bg-blue-50/40 dark:bg-blue-950/20 rounded-xl p-4 border border-blue-100 dark:border-blue-800/50">
            <div className="flex items-center justify-between mb-3 border-b border-blue-100 dark:border-blue-800/50 pb-2">
              <span className="font-bold text-blue-950 dark:text-blue-200 flex items-center gap-1.5 uppercase tracking-wider text-[11px]">
                <Package className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                Dados da Carga Vinculada ({cargoSequence})
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300 border border-blue-200 dark:border-blue-700">
                {client?.nomeFantasia || client?.razaoSocial || 'Cliente'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <span className="text-[10px] text-gray-400 font-semibold block">PRODUTO</span>
                <span className="font-bold text-gray-900 dark:text-white">{product?.name || cargo?.productId || 'N/A'}</span>
              </div>
              <div>
                <span className="text-[10px] text-gray-400 font-semibold block">CLIENTE (DESTINATÁRIO)</span>
                <span className="text-gray-800 dark:text-gray-200 flex items-center gap-1 font-medium">
                  <Building2 className="w-3 h-3 text-gray-400" /> {client?.nomeFantasia || client?.razaoSocial || 'N/A'}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-gray-400 font-semibold block">ORIGEM</span>
                <span className="text-gray-800 dark:text-gray-200 flex items-center gap-1">
                  <MapPin className="w-3 h-3 text-blue-500" /> {offer.origin || cargo?.origin || 'N/A'}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-gray-400 font-semibold block">DESTINO</span>
                <span className="text-gray-800 dark:text-gray-200 flex items-center gap-1">
                  <MapPin className="w-3 h-3 text-emerald-500" /> {offer.destination || cargo?.destination || 'N/A'}
                </span>
              </div>
            </div>

            {/* Valores e Toneladas */}
            <div className="mt-3 pt-3 border-t border-blue-100 dark:border-blue-800/40 grid grid-cols-3 gap-2 text-center">
              <div className="p-2 rounded-lg bg-white/70 dark:bg-gray-800/60 border border-blue-100 dark:border-blue-800">
                <span className="text-[10px] text-gray-500 block font-semibold">VOLUME</span>
                <span className="font-bold font-mono text-gray-900 dark:text-white text-xs">{tonnage > 0 ? `${tonnage} TON` : 'A definir'}</span>
              </div>
              <div className="p-2 rounded-lg bg-white/70 dark:bg-gray-800/60 border border-blue-100 dark:border-blue-800">
                <span className="text-[10px] text-gray-500 block font-semibold">FRETE MOTORISTA</span>
                <span className="font-bold font-mono text-primary dark:text-blue-400 text-xs">
                  {formatMoney(ratePerTon)}/t
                </span>
              </div>
              <div className="p-2 rounded-lg bg-white/70 dark:bg-gray-800/60 border border-blue-100 dark:border-blue-800">
                <span className="text-[10px] text-gray-500 block font-semibold">TOTAL ESTIMADO</span>
                <span className="font-bold font-mono text-emerald-600 dark:text-emerald-400 text-xs">
                  {formatMoney(estimatedTotal)}
                </span>
              </div>
            </div>
          </div>

          {/* Seção de Motivo de Recusa (caso aberta) */}
          {isRefusing && (
            <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 animate-in fade-in duration-150">
              <label className="block font-bold text-red-800 dark:text-red-300 mb-1.5 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-red-600" />
                Motivo da Recusa (Opcional):
              </label>
              <textarea
                value={refusalReason}
                onChange={e => setRefusalReason(e.target.value)}
                placeholder="Ex: Motorista não possui a documentação necessária, carga já atingiu o limite agendado, etc."
                rows={2}
                className="w-full p-2.5 text-xs bg-white dark:bg-gray-800 border border-red-200 dark:border-red-700 rounded-lg text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-red-500"
              />
              <div className="flex justify-end gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => setIsRefusing(false)}
                  className="px-3 py-1.5 text-xs font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-200/60 dark:hover:bg-gray-700 rounded-lg"
                >
                  Voltar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmRefuse}
                  disabled={isSubmitting}
                  className="px-3.5 py-1.5 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg transition shadow-sm flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isSubmitting ? 'Recusando...' : 'Confirmar Recusa'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-gray-100 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-800/80 flex items-center justify-between gap-3">
          {isExpired ? (
            <div className="w-full flex items-center justify-between gap-3">
              <span className="text-xs text-rose-600 dark:text-rose-400 font-semibold flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                Tempo limite atingido. Solicitação expirada.
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isSubmitting}
                  className="px-4 py-2 text-xs font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-200/60 dark:hover:bg-gray-700 rounded-xl transition cursor-pointer"
                >
                  Fechar
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    setIsSubmitting(true);
                    try {
                      await onRefuse(offer, 'Solicitação exp.');
                      onClose();
                    } finally {
                      setIsSubmitting(false);
                    }
                  }}
                  disabled={isSubmitting}
                  className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition-all shadow-md flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Clock className="w-4 h-4" />
                  {isSubmitting ? 'Registrando...' : 'Registrar Cancelamento (Solicitação exp.)'}
                </button>
              </div>
            </div>
          ) : !isRefusing ? (
            <>
              <button
                type="button"
                onClick={() => setIsRefusing(true)}
                disabled={isSubmitting}
                className="px-4 py-2 text-xs font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 border border-red-200 dark:border-red-800/60 rounded-xl transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
              >
                <XCircle className="w-4 h-4" />
                Recusar Solicitação
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isSubmitting}
                  className="px-4 py-2 text-xs font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-200/60 dark:hover:bg-gray-700 rounded-xl transition cursor-pointer"
                >
                  Fechar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmAccept}
                  disabled={isSubmitting || isExpired}
                  className="px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-all shadow-md shadow-emerald-600/20 flex items-center gap-2 disabled:opacity-50 cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  {isSubmitting ? 'Processando...' : 'Aceitar e Criar Embarque'}
                </button>
              </div>
            </>
          ) : (
            <div className="w-full text-right text-xs text-gray-500">
              Confirme a recusa ou clique em Voltar para retornar.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default OrderRequestDecisionModal;
