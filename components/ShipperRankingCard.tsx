
import React, { useMemo } from 'react';
import type { Shipment, Cargo, User } from '../types';
import { UserProfile, ShipmentStatus } from '../types';
import { WhatsAppIcon } from './icons/WhatsAppIcon';
import { calculateShipmentExpenses } from '../utils/operationalExpensesCalculator';
import { getShipmentEffectiveDate, hasCteAttached } from '../utils';

interface ShipperRankingCardProps {
  shipments: Shipment[];
  cargos: Cargo[];
  users: User[];
  currentUser: User | null;
  dateRangeBounds?: { start: number | null; end: number | null };
  periodLabel?: string;
  className?: string;
}

interface ShipperStat {
  id: string;
  name: string;
  vehicleCount: number;
  shipmentCount: number;
  netMargin: number;
  effectiveTonnage: number;
  commission: number;
}

const ShipperRankingCard: React.FC<ShipperRankingCardProps> = ({ 
  shipments, 
  cargos, 
  users, 
  currentUser,
  dateRangeBounds,
  periodLabel,
  className = ''
}) => {
  const canViewCommission = React.useMemo(() => {
    if (!currentUser) return false;
    return [UserProfile.Desenvolvedor, UserProfile.Diretor, UserProfile.Comercial, UserProfile.Admin, UserProfile.GerenciadoraDeRisco, UserProfile.Demonstracao].includes(currentUser.profile);
  }, [currentUser]);

  const getWhatsAppLink = (shipperId: string): string | null => {
    const shipper = users.find(u => u.id === shipperId);
    if (!shipper || !shipper.phone) return null;
    const cleanedPhone = shipper.phone.replace(/\D/g, '');
    if (cleanedPhone.length >= 10) {
      return `https://wa.me/55${cleanedPhone}`;
    }
    return null;
  };

  const shipperStats = useMemo<ShipperStat[]>(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const shipperIds = new Set<string>([
      ...users.filter(u => u.profile === UserProfile.Embarcador).map(u => u.id),
      ...shipments.map(s => s.embarcadorId).filter(Boolean) as string[],
      ...shipments.map(s => s.createdById).filter(Boolean) as string[]
    ]);

    const shippers = users.filter(u => shipperIds.has(u.id));
    // Explicitly type `cargoMap` to ensure correct type inference.
    const cargoMap: Map<string, Cargo> = new Map(cargos.map(c => [c.id, c]));

    const stats = shippers.map(shipper => {
      const shipperShipments = shipments.filter(s => s.embarcadorId === shipper.id || s.createdById === shipper.id);
      
      const uniqueVehicles = new Set<string>();
      let netMargin = 0;
      let effectiveTonnage = 0;
      let shipmentCount = 0;

      shipperShipments.forEach(shipment => {
        const effDateStr = getShipmentEffectiveDate(shipment);
        
        if (effDateStr) {
          let isInPeriod = false;
          let refTime = 0;
          const parts = effDateStr.split('-');
          if (parts.length === 3) {
            refTime = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), 12, 0, 0).getTime();
          } else {
            refTime = new Date(effDateStr).getTime();
          }

          if (dateRangeBounds) {
            if (dateRangeBounds.start === null && dateRangeBounds.end === null) {
              isInPeriod = true;
            } else {
              isInPeriod = (dateRangeBounds.start === null || refTime >= dateRangeBounds.start) &&
                           (dateRangeBounds.end === null || refTime <= dateRangeBounds.end);
            }
          } else {
            const referenceDate = new Date(refTime);
            isInPeriod = referenceDate.getMonth() === currentMonth && referenceDate.getFullYear() === currentYear;
          }

          if (isInPeriod) {
            shipmentCount++;
            if (shipment.horsePlate) {
                uniqueVehicles.add(shipment.horsePlate);
            }

            const cargo = cargoMap.get(shipment.cargoId);
            if (cargo) {
              const expenses = calculateShipmentExpenses(shipment, cargo);
              netMargin += expenses.netProfit;
            }

            if (hasCteAttached(shipment)) {
              effectiveTonnage += (shipment.shipmentTonnage || 0);
            }
          }
        }
      });

      const ratePerTon = Number(shipper.shipperCommissionRatePerTon) || 2;
      const commission = effectiveTonnage * ratePerTon;

      return {
        id: shipper.id,
        name: shipper.name,
        vehicleCount: uniqueVehicles.size,
        shipmentCount,
        netMargin: netMargin,
        effectiveTonnage,
        commission
      };
    });

    return stats.sort((a, b) => b.netMargin - a.netMargin);
  }, [shipments, cargos, users, dateRangeBounds]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  return (
    <div className={`bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md col-span-1 flex flex-col justify-between ${className}`}>
      <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-200 mb-1">Ranking de Embarcadores</h3>
      <p className="text-xs text-gray-500 mb-4">Resultados ({periodLabel || 'Mês Atual'})</p>
      <div className="overflow-x-auto">
        <table className="min-w-full">
          <thead className="border-b dark:border-gray-700">
            <tr>
              <th className="py-2 px-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 tracking-wider">#</th>
              <th className="py-2 px-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 tracking-wider">Embarcador</th>
              <th className="py-2 px-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 tracking-wider">Veículos</th>
              <th className="py-2 px-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 tracking-wider">Embarques</th>
              <th className="py-2 px-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 tracking-wider">T. Efetivas</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {shipperStats.map((stat, index) => {
              const isCurrentUser = stat.id === currentUser?.id;
              if (currentUser?.profile === UserProfile.Embarcador && !isCurrentUser) {
                return null;
              }
              return (
                <tr 
                  key={stat.id} 
                  className={`hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${
                    isCurrentUser 
                      ? 'bg-indigo-50 dark:bg-indigo-950/30 border-l-4 border-indigo-500' 
                      : ''
                  }`}
                >
                  <td className={`py-3 px-3 text-sm font-medium ${isCurrentUser ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-500 dark:text-gray-400'}`}>{index + 1}</td>
                  <td className={`py-3 px-3 text-sm font-medium ${isCurrentUser ? 'text-indigo-900 dark:text-indigo-200 font-bold' : 'text-gray-900 dark:text-white'}`}>
                    <div className="flex items-center gap-1.5">
                      <span>
                        {stat.name} 
                        {isCurrentUser && (
                          <span className="ml-2 px-2 py-0.5 text-[10px] font-semibold bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 rounded-full">
                            Você
                          </span>
                        )}
                      </span>
                      {(() => {
                        const link = getWhatsAppLink(stat.id);
                        if (!link) return null;
                        return (
                          <a
                            href={link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center text-green-500 hover:text-green-600 dark:text-green-400 dark:hover:text-green-300 transition-colors"
                            title="Conversar com o embarcador no WhatsApp"
                          >
                            <WhatsAppIcon className="w-3.5 h-3.5" />
                          </a>
                        );
                      })()}
                    </div>
                  </td>
                <td className="py-3 px-3 text-sm text-center text-gray-500 dark:text-gray-400">{stat.vehicleCount}</td>
                <td className="py-3 px-3 text-sm text-center text-gray-500 dark:text-gray-400">{stat.shipmentCount}</td>
                <td className="py-3 px-3 text-sm text-center font-medium text-gray-700 dark:text-gray-300">{stat.effectiveTonnage.toLocaleString('pt-BR')} t</td>
              </tr>
              );
            })}
            {shipperStats.length === 0 && (
                <tr>
                    <td colSpan={5} className="py-4 px-3 text-center text-sm text-gray-500 dark:text-gray-400">Nenhum embarcador com movimentação.</td>
                </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ShipperRankingCard;
