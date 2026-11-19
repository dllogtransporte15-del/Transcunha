import React, { useState, useMemo } from 'react';
import type { Shipment, User, Cargo, Branch, Client } from '../../types';
import { ShipmentStatus, UserProfile } from '../../types';
import { isDeveloperUser, isDemoUser } from '../../auth';
import { UsersIcon } from '../icons/UsersIcon';
import { StayRecord } from '../../utils/toolStorage';
import { calculateShipmentExpenses } from '../../utils/operationalExpensesCalculator';
import { getShipmentCte, getShipmentEffectiveDate, isCteApplicableForStatus, isStayForShipment, hasCteAttached, isShipmentEligibleForCommission, COMMISSION_ELIGIBLE_STATUSES, canViewPredictedCommission, isShipmentPredictedForCommission } from '../../utils';
import {
  Building2,
  CheckCircle2,
  XCircle,
  TrendingUp,
  ShieldCheck,
  Briefcase,
  Percent,
  Users,
  UserCheck,
  ChevronDown,
  Eye,
  Download,
  Search,
  X,
  FileSpreadsheet,
  Calendar,
  Truck,
  MapPin,
  DollarSign
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { addPdfLogo } from '../../utils/pdfGenerator';

interface CommercialReportProps {
  shipments: Shipment[];
  cargos: Cargo[];
  users: User[];
  branches?: Branch[];
  stays?: StayRecord[];
  clients?: Client[];
  companyLogo?: string | null;
  startDate?: string;
  endDate?: string;
  onSaveUser?: (user: User) => void;
  currentUser?: User | null;
}

const StatCard: React.FC<{
  title: string;
  value: number;
  subtitle?: string;
  icon: React.ReactElement;
  subtitleColor?: string;
  isCurrency?: boolean;
}> = ({
  title,
  value,
  subtitle,
  icon,
  subtitleColor = "text-blue-600 dark:text-blue-400",
  isCurrency = true
}) => {
    return (
      <div className="flex flex-col justify-between p-5 bg-white dark:bg-gray-800/90 rounded-2xl border border-gray-200/80 dark:border-gray-700/80 shadow-sm transition-all hover:shadow-md">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider leading-snug">{title}</p>
            <p className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white mt-1.5">
              {isCurrency ? value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : `${value} ${value === 1 ? 'embarque' : 'embarques'}`}
            </p>
          </div>
          <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-700/50 border border-gray-100 dark:border-gray-600/50 flex items-center justify-center shrink-0">
            {icon}
          </div>
        </div>
        {subtitle && (
          <div className={`mt-3 pt-2 border-t border-gray-100 dark:border-gray-700/60 text-xs font-semibold ${subtitleColor}`}>
            {subtitle}
          </div>
        )}
      </div>
    );
  };

const SupervisorReport: React.FC<CommercialReportProps> = ({
  shipments,
  cargos,
  users,
  branches = [],
  stays = [],
  clients = [],
  companyLogo,
  startDate,
  endDate,
  currentUser
}) => {
  const [selectedUserForDetails, setSelectedUserForDetails] = useState<User | null>(null);
  const [modalSearchTerm, setModalSearchTerm] = useState('');
  const [modalStatusFilter, setModalStatusFilter] = useState('ALL');
  const [expandedAgencyId, setExpandedAgencyId] = useState<string | null>(null);
  const cargoMap = useMemo(() => new Map(cargos.map(c => [c.id, c])), [cargos]);
  const branchMap = useMemo(() => new Map(branches.map(b => [b.id, b])), [branches]);
  const userBranchMap = useMemo(() => new Map(users.map(u => [u.id, u.branchId])), [users]);
  const userMap = useMemo(() => new Map(users.map(u => [u.id, u])), [users]);

  // Contexto do Usuário Logado
  const isCurrentUserAgenciador = currentUser?.profile === UserProfile.Agenciador;
  const isCurrentUserAgenciadorEmbarque = currentUser?.profile === UserProfile.Agenciador && currentUser?.agencyRole === 'embarque';
  const isCurrentUserAgenciadorLider = currentUser?.profile === UserProfile.Agenciador && currentUser?.agencyRole !== 'embarque';

  // Se o usuário logado for agenciador de embarque, ele tem um líder; se for líder, ele é o próprio líder
  const effectiveLeaderId = useMemo(() => {
    if (!currentUser) return undefined;
    if (currentUser.profile === UserProfile.Agenciador && currentUser.agencyRole === 'embarque' && currentUser.agencyLeaderId) {
      return currentUser.agencyLeaderId;
    }
    return currentUser.id;
  }, [currentUser]);

  const leaderUser = useMemo(() => {
    if (!effectiveLeaderId) return currentUser;
    return userMap.get(effectiveLeaderId) || currentUser;
  }, [effectiveLeaderId, userMap, currentUser]);

  // Operadores de embarque vinculados a este líder (ou o próprio operador logado no modo individual)
  const teamOperators = useMemo(() => {
    if (isCurrentUserAgenciadorEmbarque) {
      return users.filter(u => u.id === currentUser?.id);
    }
    if (!effectiveLeaderId) return [];
    return users.filter(u =>
      u.profile === UserProfile.Agenciador &&
      u.agencyRole === 'embarque' &&
      u.agencyLeaderId === effectiveLeaderId
    );
  }, [effectiveLeaderId, users, isCurrentUserAgenciadorEmbarque, currentUser]);

  // Identificar filial Matriz e demais filiais
  const matrizBranch = useMemo(() => {
    return branches.find(b => b.name.toLowerCase().includes('matriz')) || branches[0];
  }, [branches]);

  const nonMatrizBranches = useMemo(() => {
    return branches.filter(b => !b.name.toLowerCase().includes('matriz'));
  }, [branches]);

  // Mapear faturamento bruto e líquido (margem) por filial
  const {
    fatBrutoMatriz,
    fatLiquidoMatriz,
    branchGrossMap,
    branchNetMap,
    totalFiliaisGross
  } = useMemo(() => {
    let grossMatriz = 0;
    let netMatriz = 0;

    const grossMap = new Map<string, number>();
    const netMap = new Map<string, number>();

    const countableStatuses = COMMISSION_ELIGIBLE_STATUSES;

    shipments.forEach(s => {
      if (!isShipmentEligibleForCommission(s) || s.status === ShipmentStatus.Cancelado || !isCteApplicableForStatus(s.status)) return;

      const cteVal = getShipmentCte(s);
      const hasCte = cteVal !== '-' && cteVal.trim() !== '';

      if (!hasCte) return;

      const cargo = cargoMap.get(s.cargoId);

      const expenses = calculateShipmentExpenses(s, cargo, undefined, stays);

      const shipmentStays = stays.filter(stay => isStayForShipment(stay, s));
      const demurrageRevenue = shipmentStays.reduce((sum, stay) => sum + (stay.approvedValue || 0), 0);
      const demurrageProfit = shipmentStays.reduce((sum, stay) => sum + ((stay.approvedValue || 0) - (stay.driverPaidValue || 0)), 0);

      const shipmentGrossRevenue = expenses.companyFreight + demurrageRevenue;
      const shipmentNetRevenue = expenses.netProfit + demurrageProfit;

      // Resolução de Filial em cascata
      const effectiveBranchId = s.branchId || (s.createdById ? userBranchMap.get(s.createdById) : undefined) || cargo?.branchId || (cargo?.createdById ? userBranchMap.get(cargo.createdById) : undefined);

      const branchObj = effectiveBranchId ? branchMap.get(effectiveBranchId) : null;
      const isMatriz = branchObj
        ? branchObj.name.toLowerCase().includes('matriz')
        : (matrizBranch && effectiveBranchId === matrizBranch.id);

      if (isMatriz) {
        grossMatriz += shipmentGrossRevenue;
        netMatriz += shipmentNetRevenue;
      } else if (effectiveBranchId) {
        grossMap.set(effectiveBranchId, (grossMap.get(effectiveBranchId) || 0) + shipmentGrossRevenue);
        netMap.set(effectiveBranchId, (netMap.get(effectiveBranchId) || 0) + shipmentNetRevenue);
      } else {
        grossMatriz += shipmentGrossRevenue;
        netMatriz += shipmentNetRevenue;
      }
    });

    let totalFilGross = 0;
    grossMap.forEach(val => { totalFilGross += val; });

    let totalFilNet = 0;
    netMap.forEach(val => { totalFilNet += val; });

    return {
      fatBrutoMatriz: grossMatriz,
      fatLiquidoMatriz: netMatriz,
      branchGrossMap: grossMap,
      branchNetMap: netMap,
      totalFiliaisGross: totalFilGross,
      totalFiliaisNet: totalFilNet
    };
  }, [shipments, cargoMap, stays, branchMap, matrizBranch, userBranchMap]);

  // Default rates
  const DEFAULT_FIXED = 5000;
  const DEFAULT_MATRIZ_RATE = 0.20; // 0.20%
  const DEFAULT_FILIAIS_RATE = 0.10; // 0.10%

  const comissaoMatrizDefault = fatBrutoMatriz * (DEFAULT_MATRIZ_RATE / 100);
  const comissaoFiliaisDefault = totalFiliaisGross * (DEFAULT_FILIAIS_RATE / 100);
  const comissaoTotalCalculadaDefault = DEFAULT_FIXED + comissaoMatrizDefault + comissaoFiliaisDefault;

  // Função auxiliar para obter o ID do Agenciador Líder / Agência responsável por um usuário
  const getLeaderIdForUser = (userId?: string): string | undefined => {
    if (!userId) return undefined;
    const user = userMap.get(userId);
    if (!user) {
      const userByName = users.find(u =>
        u.name.toLowerCase() === userId.toLowerCase() ||
        u.email?.toLowerCase() === userId.toLowerCase()
      );
      if (userByName) {
        if (userByName.agencyRole === 'embarque' && userByName.agencyLeaderId) {
          return userByName.agencyLeaderId;
        }
        if (userByName.agencyLeaderId) {
          return userByName.agencyLeaderId;
        }
        return userByName.id;
      }
      return undefined;
    }
    if (user.agencyRole === 'embarque' && user.agencyLeaderId) {
      return user.agencyLeaderId;
    }
    if (user.agencyLeaderId) {
      return user.agencyLeaderId;
    }
    return user.id;
  };

  // Filtrar usuários comerciais e agenciadores líderes (Supervisores, Diretores, Administradores, Embarcadores, Clientes, Motoristas, Fiscal, Financeiro, etc. NUNCA entram no relatório comercial)
  const commercialUsers = useMemo(() => {
    return users.filter(u => {
      if (isDeveloperUser(u) || isDemoUser(u) || u.profile === UserProfile.Demonstracao || (u.profile as string) === 'Demo' || u.name?.toUpperCase().includes('DEMO')) {
        return false;
      }

      // Apenas perfis estritamente comerciais e agenciadores líderes
      const isCommercialProfile =
        u.profile === UserProfile.Comercial ||
        u.profile === UserProfile.GerenteComercial ||
        u.profile === UserProfile.Agenciador;

      if (!isCommercialProfile) {
        return false;
      }

      // Agenciador de Embarque não aparece como linha individual na tabela principal de agências
      if (u.profile === UserProfile.Agenciador && u.agencyRole === 'embarque') {
        return false;
      }

      return true;
    });
  }, [users]);

  const activeCommissionUsers = useMemo(() => {
    return commercialUsers.filter(u =>
      u.hasCommercialCommission === true ||
      u.profile === UserProfile.GerenteComercial ||
      u.profile === UserProfile.Agenciador
    );
  }, [commercialUsers]);

  // Lista de usuários comerciais visíveis na tabela principal
  const displayedCommercialUsers = useMemo(() => {
    if (isCurrentUserAgenciadorEmbarque) {
      // Agenciador de Embarque NÃO deve visualizar a tabela de resultado consolidado da agência
      return [];
    }
    if (isCurrentUserAgenciador) {
      // Agenciador Líder vê apenas o seu próprio registro (líder) consolidado com sua agência
      return commercialUsers.filter(u => u.id === effectiveLeaderId || u.id === currentUser?.id);
    }
    return commercialUsers;
  }, [commercialUsers, isCurrentUserAgenciador, isCurrentUserAgenciadorEmbarque, effectiveLeaderId, currentUser]);

  // Mapear contagem de usuários por agência / filial para divisão da comissão no modo Agência
  const agencyMemberCountsMap = useMemo(() => {
    const counts = new Map<string, number>();

    activeCommissionUsers.forEach(u => {
      if (!u.commercialIsAgencyMode) return;
      const selectedBranches = u.commercialSelectedBranchIds || nonMatrizBranches.map(b => b.id);

      // Chave baseada no grupo de filiais da agência
      const agencyKey = selectedBranches.sort().join('|') || (u.branchId || 'default');
      counts.set(agencyKey, (counts.get(agencyKey) || 0) + 1);
    });

    return counts;
  }, [activeCommissionUsers, nonMatrizBranches]);

  // Mapear Lucro Real Total, Comissão de Agenciamento e Contagem de Embarques por Agência/Agenciador Líder e por Operador Individual
  const {
    userAgencyProfitMap,
    userAgencyCommissionMap,
    userAgencyShipmentCountMap,
    userAgencyPredictedCommissionMap,
    memberProfitMap,
    memberCommissionMap,
    memberShipmentCountMap,
    memberPredictedCommissionMap
  } = useMemo(() => {
    const commMap = new Map<string, number>();
    const profitMap = new Map<string, number>();
    const countMap = new Map<string, number>();

    const predictedCommMap = new Map<string, number>();
    const predictedProfitMap = new Map<string, number>();
    const predictedCountMap = new Map<string, number>();

    const memProfit = new Map<string, number>();
    const memComm = new Map<string, number>();
    const memCount = new Map<string, number>();
    const memPredictedComm = new Map<string, number>();

    shipments.forEach(s => {
      if (s.status === ShipmentStatus.Cancelado) return;
      const isEligible = isShipmentEligibleForCommission(s);
      const isPredicted = isShipmentPredictedForCommission(s);
      if (!isEligible && !isPredicted) return;

      const cteVal = getShipmentCte(s);
      const hasCte = Boolean(cteVal && cteVal !== '-' && cteVal.trim() !== '');
      if (!hasCte) return;

      const cargo = cargoMap.get(s.cargoId);
      const expenses = calculateShipmentExpenses(s, cargo, undefined, stays);
      const shipmentStays = stays.filter(stay => isStayForShipment(stay, s));
      const demurrageProfit = shipmentStays.reduce((sum, stay) => sum + ((stay.approvedValue || 0) - (stay.driverPaidValue || 0)), 0);
      const opProfit = expenses.netProfit + demurrageProfit;

      // Identificar o Agenciador Líder / Agência responsável por este frete (direto ou via operador vinculado)
      let targetLeaderId = getLeaderIdForUser(s.embarcadorId) ||
        getLeaderIdForUser(s.createdById) ||
        (cargo?.createdById ? getLeaderIdForUser(cargo.createdById) : undefined);

      if (!targetLeaderId && s.agencyCommissionAgencyName) {
        const matchedUser = users.find(u =>
          u.name.toLowerCase() === s.agencyCommissionAgencyName?.toLowerCase() ||
          s.agencyCommissionAgencyName?.toLowerCase().includes(u.name.toLowerCase()) ||
          u.email?.toLowerCase() === s.agencyCommissionAgencyName?.toLowerCase()
        );
        if (matchedUser) {
          targetLeaderId = getLeaderIdForUser(matchedUser.id);
        }
      }

      if (!targetLeaderId && s.branchId) {
        const matchedLeaderByBranch = users.find(u =>
          u.profile === UserProfile.Agenciador &&
          u.agencyRole !== 'embarque' &&
          u.branchId === s.branchId
        );
        if (matchedLeaderByBranch) {
          targetLeaderId = matchedLeaderByBranch.id;
        }
      }

      if (!targetLeaderId) return;

      const leader = userMap.get(targetLeaderId);

      const isAgencyEnabled = s.agencyCommissionEnabled !== false && (s.agencyCommissionEnabled === true || Boolean(leader?.profile === UserProfile.Agenciador));
      let calculatedCommVal = 0;
      if (isAgencyEnabled) {
        const pct = s.agencyCommissionPercentage !== undefined
          ? s.agencyCommissionPercentage
          : (leader?.agencyCommissionPercentage ?? 30);
        calculatedCommVal = opProfit > 0 ? Number((opProfit * (pct / 100)).toFixed(2)) : 0;
      }

      if (isEligible) {
        profitMap.set(targetLeaderId, (profitMap.get(targetLeaderId) || 0) + opProfit);
        countMap.set(targetLeaderId, (countMap.get(targetLeaderId) || 0) + 1);
        if (calculatedCommVal > 0) {
          commMap.set(targetLeaderId, (commMap.get(targetLeaderId) || 0) + calculatedCommVal);
        }
      } else if (isPredicted) {
        predictedProfitMap.set(targetLeaderId, (predictedProfitMap.get(targetLeaderId) || 0) + opProfit);
        predictedCountMap.set(targetLeaderId, (predictedCountMap.get(targetLeaderId) || 0) + 1);
        if (calculatedCommVal > 0) {
          predictedCommMap.set(targetLeaderId, (predictedCommMap.get(targetLeaderId) || 0) + calculatedCommVal);
        }
      }

      // Registro individual para o membro/operador que fez o embarque
      const directOperatorId = s.embarcadorId || s.createdById || cargo?.createdById;
      if (directOperatorId) {
        const directUser = userMap.get(directOperatorId);
        const isOperatorRole = directUser?.profile === UserProfile.Agenciador && directUser?.agencyRole === 'embarque';

        let directCommVal = 0;
        if (isOperatorRole) {
          const opRate = directUser.operatorCommissionPercentage !== undefined
            ? directUser.operatorCommissionPercentage
            : (directUser.agencyCommissionPercentage !== undefined && directUser.agencyCommissionPercentage < (leader?.agencyCommissionPercentage ?? 30) ? directUser.agencyCommissionPercentage : 0);
          directCommVal = (opProfit > 0 && opRate > 0) ? Number((opProfit * (opRate / 100)).toFixed(2)) : 0;
        } else {
          directCommVal = calculatedCommVal;
        }

        if (isEligible) {
          memProfit.set(directOperatorId, (memProfit.get(directOperatorId) || 0) + opProfit);
          memCount.set(directOperatorId, (memCount.get(directOperatorId) || 0) + 1);
          if (directCommVal > 0) {
            memComm.set(directOperatorId, (memComm.get(directOperatorId) || 0) + directCommVal);
          }
        } else if (isPredicted && directCommVal > 0) {
          memPredictedComm.set(directOperatorId, (memPredictedComm.get(directOperatorId) || 0) + directCommVal);
        }
      }
    });

    return {
      userAgencyCommissionMap: commMap,
      userAgencyProfitMap: profitMap,
      userAgencyShipmentCountMap: countMap,
      userAgencyPredictedCommissionMap: predictedCommMap,
      userAgencyPredictedProfitMap: predictedProfitMap,
      userAgencyPredictedCountMap: predictedCountMap,
      memberPredictedCommissionMap: memPredictedComm,
      memberProfitMap: memProfit,
      memberCommissionMap: memComm,
      memberShipmentCountMap: memCount
    };
  }, [shipments, cargoMap, stays, users, userMap]);

  // Helper para obter os embarques detalhados de uma agência ou usuário comercial
  const getDetailedShipmentsForUser = (targetUser: User) => {
    const isAgenciador = targetUser.profile === UserProfile.Agenciador;
    const isOperator = isAgenciador && targetUser.agencyRole === 'embarque';
    const isLeader = isAgenciador && targetUser.agencyRole !== 'embarque';

    const userSelectedBranchIds = targetUser.commercialSelectedBranchIds || nonMatrizBranches.map(b => b.id);

    const list: Array<{
      id: string;
      cte: string;
      date: string;
      clientName: string;
      origin: string;
      destination: string;
      driverName: string;
      plate: string;
      operatorName: string;
      grossRevenue: number;
      totalExpenses: number;
      netProfit: number;
      commissionPct: number;
      commissionVal: number;
      status: ShipmentStatus;
      rawShipment: Shipment;
    }> = [];

    shipments.forEach(s => {
      if (s.status === ShipmentStatus.Cancelado || !isShipmentEligibleForCommission(s)) return;

      const cteVal = getShipmentCte(s);
      const hasCte = Boolean(cteVal && cteVal !== '-' && cteVal.trim() !== '');
      if (!hasCte) return;

      const cargo = cargoMap.get(s.cargoId);
      const client = clients.find(c => c.id === cargo?.clientId);
      const clientName = client?.nomeFantasia || client?.razaoSocial || 'N/A';

      let belongsToUser = false;

      if (isLeader) {
        let targetLeaderId = getLeaderIdForUser(s.embarcadorId) ||
          getLeaderIdForUser(s.createdById) ||
          (cargo?.createdById ? getLeaderIdForUser(cargo.createdById) : undefined);

        if (!targetLeaderId && s.agencyCommissionAgencyName) {
          const matchedUser = users.find(u =>
            u.name.toLowerCase() === s.agencyCommissionAgencyName?.toLowerCase() ||
            s.agencyCommissionAgencyName?.toLowerCase().includes(u.name.toLowerCase()) ||
            u.email?.toLowerCase() === s.agencyCommissionAgencyName?.toLowerCase()
          );
          if (matchedUser) {
            targetLeaderId = getLeaderIdForUser(matchedUser.id);
          }
        }

        if (!targetLeaderId && s.branchId) {
          const matchedLeaderByBranch = users.find(u =>
            u.profile === UserProfile.Agenciador &&
            u.agencyRole !== 'embarque' &&
            u.branchId === s.branchId
          );
          if (matchedLeaderByBranch) {
            targetLeaderId = matchedLeaderByBranch.id;
          }
        }

        if (targetLeaderId === targetUser.id) {
          belongsToUser = true;
        }
      } else if (isOperator) {
        const directOperatorId = s.embarcadorId || s.createdById || cargo?.createdById;
        if (directOperatorId === targetUser.id) {
          belongsToUser = true;
        }
      } else {
        // Comercial / Gerente / Supervisor
        const effectiveBranchId = s.branchId || (s.createdById ? userBranchMap.get(s.createdById) : undefined) || cargo?.branchId || (cargo?.createdById ? userBranchMap.get(cargo.createdById) : undefined);
        const isMatriz = effectiveBranchId
          ? (branchMap.get(effectiveBranchId)?.name.toLowerCase().includes('matriz') || effectiveBranchId === matrizBranch?.id)
          : true;

        if (targetUser.commercialIsAgencyMode) {
          if (effectiveBranchId && userSelectedBranchIds.includes(effectiveBranchId)) {
            belongsToUser = true;
          }
        } else {
          const directOperatorId = s.embarcadorId || s.createdById || cargo?.createdById;
          if (directOperatorId === targetUser.id || isMatriz || (effectiveBranchId && userSelectedBranchIds.includes(effectiveBranchId))) {
            belongsToUser = true;
          }
        }
      }

      if (!belongsToUser) return;

      const expenses = calculateShipmentExpenses(s, cargo, undefined, stays);
      const shipmentStays = stays.filter(stay => isStayForShipment(stay, s));
      const demurrageRevenue = shipmentStays.reduce((sum, stay) => sum + (stay.approvedValue || 0), 0);
      const demurrageProfit = shipmentStays.reduce((sum, stay) => sum + ((stay.approvedValue || 0) - (stay.driverPaidValue || 0)), 0);

      const grossRevenue = expenses.companyFreight + demurrageRevenue;
      const netProfit = expenses.netProfit + demurrageProfit;
      const totalExpenses = expenses.totalExpenses + (demurrageRevenue - demurrageProfit);

      const isAgencyEnabled = s.agencyCommissionEnabled !== false && (s.agencyCommissionEnabled === true || Boolean(targetUser.profile === UserProfile.Agenciador));

      let pct = 30;
      if (isOperator) {
        pct = targetUser.operatorCommissionPercentage !== undefined
          ? targetUser.operatorCommissionPercentage
          : (targetUser.agencyCommissionPercentage !== undefined && targetUser.agencyCommissionPercentage < 30 ? targetUser.agencyCommissionPercentage : 0);
      } else {
        pct = s.agencyCommissionPercentage !== undefined
          ? s.agencyCommissionPercentage
          : (targetUser.agencyCommissionPercentage ?? 30);
      }

      const commissionVal = (isAgencyEnabled && netProfit > 0 && pct > 0) ? Number((netProfit * (pct / 100)).toFixed(2)) : 0;

      const operatorUserId = s.embarcadorId || s.createdById || cargo?.createdById;
      const operatorUser = operatorUserId ? userMap.get(operatorUserId) : null;
      const operatorName = operatorUser ? operatorUser.name : (s.agencyCommissionAgencyName || 'N/A');

      const effectiveDate = getShipmentEffectiveDate(s) || (s.createdAt ? new Date(s.createdAt).toLocaleDateString('pt-BR') : '-');

      list.push({
        id: s.id,
        cte: cteVal,
        date: effectiveDate,
        clientName,
        origin: cargo?.originLocation ? `${cargo.origin || ''} - ${cargo.originLocation}` : (cargo?.origin || s.route || 'N/A'),
        destination: cargo?.destinationLocation ? `${cargo.destination || ''} - ${cargo.destinationLocation}` : (cargo?.destination || 'N/A'),
        driverName: s.driverName || 'N/A',
        plate: s.horsePlate ? s.horsePlate.toUpperCase() : '-',
        operatorName,
        grossRevenue,
        totalExpenses,
        netProfit,
        commissionPct: pct,
        commissionVal,
        status: s.status,
        rawShipment: s
      });
    });

    return list;
  };

  const exportUserShipmentsPDF = (targetUser: User, customShipments?: ReturnType<typeof getDetailedShipmentsForUser>) => {
    const rawList = customShipments || getDetailedShipmentsForUser(targetUser);
    const list = rawList.filter(item => {
      const cteVal = item.cte || (item.rawShipment ? getShipmentCte(item.rawShipment) : '');
      return (Boolean(cteVal && cteVal !== '-' && cteVal.trim() !== '')) || (item.rawShipment ? hasCteAttached(item.rawShipment) : false);
    });
    const isAgenciador = targetUser.profile === UserProfile.Agenciador;
    const isOperator = isAgenciador && targetUser.agencyRole === 'embarque';
    const opRate = targetUser.operatorCommissionPercentage !== undefined
      ? targetUser.operatorCommissionPercentage
      : (targetUser.agencyCommissionPercentage !== undefined && targetUser.agencyCommissionPercentage < 30 ? targetUser.agencyCommissionPercentage : 0);

    const doc = new jsPDF('landscape');
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 12;

    // Cabeçalho institucional
    doc.setFillColor(248, 250, 252);
    doc.rect(0, 0, pageWidth, 32, 'F');

    addPdfLogo(doc, companyLogo, { align: 'right', y: 5, width: 35, height: 16 });

    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(11, 102, 228);
    doc.text(isOperator ? "EXTRATO DETALHADO DE EMBARQUES E COMISSÃO DO AGENCIADOR" : "RELATÓRIO DETALHADO DE EMBARQUES POR AGÊNCIA", margin, 12);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    const roleLabel = isAgenciador
      ? (targetUser.agencyRole === 'embarque' ? `Agenciador de Embarque (Comissão: ${opRate}%)` : `Agenciador Líder (${targetUser.agencyCommissionPercentage ?? 30}%)`)
      : (targetUser.profile || 'Comercial');

    doc.text(`${isOperator ? 'Agenciador de Embarque' : 'Agência / Titular'}: ${targetUser.name} (${targetUser.email})`, margin, 18);
    doc.text(`Perfil / Modalidade: ${roleLabel}  |  Emissão: ${new Date().toLocaleString('pt-BR')}`, margin, 24);

    const totalGross = list.reduce((sum, item) => sum + item.grossRevenue, 0);
    const totalExp = list.reduce((sum, item) => sum + item.totalExpenses, 0);
    const totalProfit = list.reduce((sum, item) => sum + item.netProfit, 0);
    const totalComm = list.reduce((sum, item) => sum + item.commissionVal, 0);

    const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    // Tabela Resumo Executivo
    autoTable(doc, {
      startY: 36,
      head: [["Total de Embarques", "Faturamento Bruto (R$)", "Custos & Despesas (R$)", "Lucro Real Total (R$)", isOperator ? "Comissão a Receber (R$)" : "Comissão Total da Agência (R$)"]],
      body: [[
        `${list.length} embarque(s)`,
        fmt(totalGross),
        fmt(totalExp),
        fmt(totalProfit),
        fmt(totalComm)
      ]],
      theme: 'grid',
      headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontSize: 8.5, fontStyle: 'bold', halign: 'center' },
      bodyStyles: { fontSize: 9, fontStyle: 'bold', halign: 'center', textColor: [15, 23, 42] },
      styles: { cellPadding: 3 }
    });

    const startTableY = (doc as any).lastAutoTable.finalY + 6;

    const tableColumns = [
      "CTE",
      "Data",
      "Cliente",
      "Origem -> Destino",
      "Motorista / Placa",
      "Operador",
      "Faturamento",
      "Lucro Real",
      "% Com.",
      "Comissão",
      "Status"
    ];

    const tableRows = list.map(item => [
      item.cte || `#${item.id}`,
      item.date,
      item.clientName,
      `${item.origin} -> ${item.destination}`,
      `${item.driverName}\n(${item.plate})`,
      item.operatorName,
      fmt(item.grossRevenue),
      fmt(item.netProfit),
      `${item.commissionPct}%`,
      fmt(item.commissionVal),
      item.status
    ]);

    tableRows.push([
      "TOTAIS",
      "-",
      "-",
      "-",
      "-",
      `${list.length} emb.`,
      fmt(totalGross),
      fmt(totalProfit),
      "-",
      fmt(totalComm),
      "-"
    ]);

    autoTable(doc, {
      startY: startTableY,
      head: [tableColumns],
      body: tableRows,
      theme: 'striped',
      headStyles: { fillColor: [29, 59, 141], textColor: 255, fontSize: 7.5, fontStyle: 'bold' },
      bodyStyles: { fontSize: 7, cellPadding: 2 },
      columnStyles: {
        0: { halign: 'center', fontStyle: 'bold' },
        1: { halign: 'center' },
        2: { cellWidth: 32 },
        3: { cellWidth: 42 },
        4: { cellWidth: 30 },
        5: { cellWidth: 26 },
        6: { halign: 'right', fontStyle: 'bold' },
        7: { halign: 'right', fontStyle: 'bold', textColor: [5, 150, 105] },
        8: { halign: 'center' },
        9: { halign: 'right', fontStyle: 'bold', textColor: [126, 34, 206] },
        10: { halign: 'center', fontSize: 6.5 }
      },
      didParseCell: (data) => {
        if (data.row.index === tableRows.length - 1) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [241, 245, 249];
          data.cell.styles.textColor = [15, 23, 42];
        }
      },
      didDrawPage: (data) => {
        const pageNumber = (doc as any).internal.getNumberOfPages();
        doc.setFontSize(7);
        doc.setTextColor(148, 163, 184);
        doc.text(
          `Transcunha Logística - Relatório de Agenciamento | Página ${data.pageNumber} de ${pageNumber}`,
          pageWidth / 2,
          pageHeight - 6,
          { align: 'center' }
        );
      }
    });

    const safeName = targetUser.name.replace(/[^a-zA-Z0-9]/g, '_');
    doc.save(`Relatorio_Embarques_Agencia_${safeName}_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  // Dados filtrados do modal de detalhes
  const modalDetailedShipments = useMemo(() => {
    if (!selectedUserForDetails) return [];
    const rawList = getDetailedShipmentsForUser(selectedUserForDetails);

    return rawList.filter(item => {
      if (modalStatusFilter !== 'ALL' && item.status !== modalStatusFilter) return false;
      if (modalSearchTerm.trim()) {
        const q = modalSearchTerm.toLowerCase();
        const match =
          item.cte.toLowerCase().includes(q) ||
          item.clientName.toLowerCase().includes(q) ||
          item.driverName.toLowerCase().includes(q) ||
          item.plate.toLowerCase().includes(q) ||
          item.origin.toLowerCase().includes(q) ||
          item.destination.toLowerCase().includes(q) ||
          item.operatorName.toLowerCase().includes(q) ||
          item.id.toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [selectedUserForDetails, modalSearchTerm, modalStatusFilter, shipments, cargoMap, stays, users, clients]);

  // Totais do modal
  const modalTotals = useMemo(() => {
    const gross = modalDetailedShipments.reduce((sum, item) => sum + item.grossRevenue, 0);
    const exp = modalDetailedShipments.reduce((sum, item) => sum + item.totalExpenses, 0);
    const profit = modalDetailedShipments.reduce((sum, item) => sum + item.netProfit, 0);
    const comm = modalDetailedShipments.reduce((sum, item) => sum + item.commissionVal, 0);
    return { gross, exp, profit, comm };
  }, [modalDetailedShipments]);

  // Total geral de comissões de agenciamento em todos os fretes (para visão executiva)
  const totalGlobalAgencyCommission = useMemo(() => {
    let sum = 0;
    userAgencyCommissionMap.forEach(val => { sum += val; });
    return sum;
  }, [userAgencyCommissionMap]);

  // Percentual individual do operador logado (se for agenciador de embarque)
  const currentOperatorRate = currentUser?.operatorCommissionPercentage !== undefined
    ? currentUser.operatorCommissionPercentage
    : (currentUser?.agencyCommissionPercentage !== undefined && currentUser.agencyCommissionPercentage < 30 ? currentUser.agencyCommissionPercentage : 0);

  // Valores consolidados para o Agenciador logado (Líder da agência ou Operador individual)
  const currentAgencyShipmentCount = isCurrentUserAgenciadorEmbarque
    ? (currentUser?.id ? (memberShipmentCountMap.get(currentUser.id) || 0) : 0)
    : (effectiveLeaderId ? (userAgencyShipmentCountMap.get(effectiveLeaderId) || 0) : 0);

  const currentAgencyProfit = isCurrentUserAgenciadorEmbarque
    ? (currentUser?.id ? (memberProfitMap.get(currentUser.id) || 0) : 0)
    : (effectiveLeaderId ? (userAgencyProfitMap.get(effectiveLeaderId) || 0) : 0);

  const currentAgencyCommission = isCurrentUserAgenciadorEmbarque
    ? (currentUser?.id ? (memberCommissionMap.get(currentUser.id) || 0) : 0)
    : (effectiveLeaderId ? (userAgencyCommissionMap.get(effectiveLeaderId) || 0) : 0);

  const currentAgencyPredictedCommission = isCurrentUserAgenciadorEmbarque
    ? (currentUser?.id ? (memberPredictedCommissionMap.get(currentUser.id) || 0) : 0)
    : (effectiveLeaderId ? (userAgencyPredictedCommissionMap.get(effectiveLeaderId) || 0) : 0);

  return (
    <div className="space-y-6">
      {/* HEADER TITLE */}
      <div className={`flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 rounded-2xl border shadow-sm ${isCurrentUserAgenciador
        ? 'bg-gradient-to-r from-purple-950/70 via-slate-900 to-slate-900 border-purple-800/40'
        : 'bg-gradient-to-r from-blue-900/40 via-slate-900 to-slate-900 border-blue-800/40'
        }`}>
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-3">
            <Briefcase className={`w-7 h-7 ${isCurrentUserAgenciador ? 'text-purple-400' : 'text-blue-400'}`} />
            {isCurrentUserAgenciadorEmbarque
              ? 'Meu Relatório de Agenciamento'
              : (isCurrentUserAgenciador ? 'Relatório Consolidado da Agência' : 'Relatório Comercial & Agenciamento')}
          </h2>
          <p className="text-xs text-gray-400 mt-1">
            {isCurrentUserAgenciadorEmbarque
              ? `Visualização restrita aos seus próprios embarques e comissão individual a receber (${currentUser?.name}).`
              : (isCurrentUserAgenciador
                ? `Visualização restrita ao resultado da sua agência e equipe vinculada (${leaderUser?.name || currentUser?.name}).`
                : 'Desempenho consolidado de faturamento, comissões ativas e lucro real por membro comercial e agenciador.')}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {isCurrentUserAgenciador ? (
            <div className="flex items-center gap-2 bg-purple-950/80 px-4 py-2 rounded-xl border border-purple-700/50 text-xs font-semibold text-purple-200">
              <Users className="w-4 h-4 text-purple-400" />
              {isCurrentUserAgenciadorEmbarque ? (
                <span>Agenciador de Embarque: <b>{currentUser?.name}</b> (Taxa: {currentOperatorRate}% | Líder: {leaderUser?.name})</span>
              ) : (
                <span>Agência: <b>{leaderUser?.name}</b> ({leaderUser?.agencyCommissionPercentage ?? 30}%)</span>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2 bg-blue-950/80 px-4 py-2 rounded-xl border border-blue-700/50 text-xs font-semibold text-blue-200">
              <Building2 className="w-4 h-4 text-blue-400" />
              <span>Matriz Principal: <b>{matrizBranch?.name || 'MATRIZ'}</b></span>
            </div>
          )}
        </div>
      </div>

      {/* STAT CARDS KPI */}
      {isCurrentUserAgenciador ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatCard
            title={isCurrentUserAgenciadorEmbarque ? "Meus Embarques com CT-e" : "Embarques da Agência / Equipe"}
            subtitle={isCurrentUserAgenciadorEmbarque ? "Total de embarques operados diretamente por você" : (teamOperators.length > 0 ? `Consolidando Líder + ${teamOperators.length} operador(es)` : 'Total de embarques com CTE')}
            value={currentAgencyShipmentCount}
            isCurrency={false}
            icon={<Briefcase className="w-6 h-6 text-purple-500 dark:text-purple-400" />}
            subtitleColor="text-purple-600 dark:text-purple-300 font-bold"
          />

          <StatCard
            title={isCurrentUserAgenciadorEmbarque ? "Lucro Real Gerado por Mim" : "Lucro Real Total Gerado"}
            subtitle={isCurrentUserAgenciadorEmbarque ? "Base de cálculo da sua comissão individual" : "Base de cálculo da comissão de agenciamento"}
            value={currentAgencyProfit}
            icon={<TrendingUp className="w-6 h-6 text-emerald-500 dark:text-emerald-400" />}
            subtitleColor="text-emerald-600 dark:text-emerald-300 font-bold"
          />

          <StatCard
            title="Comissão Efetivada"
            subtitle={canViewPredictedCommission(currentUser) && currentAgencyPredictedCommission > 0
              ? `Prevista: ${currentAgencyPredictedCommission.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`
              : (isCurrentUserAgenciadorEmbarque ? `Taxa individual: ${currentOperatorRate}% sobre o lucro real gerado` : `Taxa: ${leaderUser?.agencyCommissionPercentage ?? 30}% sobre o lucro real`)}
            value={currentAgencyCommission}
            icon={<ShieldCheck className="w-6 h-6 text-emerald-500 dark:text-emerald-400" />}
            subtitleColor="text-emerald-600 dark:text-emerald-300 font-bold"
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatCard
            title="Faturamento Matriz"
            subtitle={`Comissão (0,20%): ${comissaoMatrizDefault.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`}
            value={fatBrutoMatriz}
            icon={<Building2 className="w-6 h-6 text-blue-500 dark:text-blue-400" />}
            subtitleColor="text-blue-600 dark:text-blue-300 font-bold"
          />

          <StatCard
            title="Faturamento Filiais"
            subtitle={`Comissão (0,10%): ${comissaoFiliaisDefault.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`}
            value={totalFiliaisGross}
            icon={<TrendingUp className="w-6 h-6 text-indigo-500 dark:text-indigo-400" />}
            subtitleColor="text-indigo-600 dark:text-indigo-300 font-bold"
          />

          <StatCard
            title="Comissão Total Comercial & Agências"
            subtitle={`Comissões Gerência + Agenciamentos (${totalGlobalAgencyCommission.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })})`}
            value={comissaoTotalCalculadaDefault + totalGlobalAgencyCommission}
            icon={<ShieldCheck className="w-6 h-6 text-emerald-500 dark:text-emerald-400" />}
            subtitleColor="text-emerald-600 dark:text-emerald-300 font-bold"
          />
        </div>
      )}

      {/* TABELA DE RESULTADOS DO COMERCIAL / AGENCIADOR (OCULTA PARA OPERADOR DE EMBARQUE) */}
      {!isCurrentUserAgenciadorEmbarque && (
        <div className="bg-white dark:bg-gray-800/90 rounded-2xl shadow-sm border border-gray-200/80 dark:border-gray-700/80 overflow-hidden">
          <div className="p-5 border-b border-gray-200 dark:border-gray-700/80 flex items-center justify-between flex-wrap gap-3">
            <div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                {isCurrentUserAgenciador ? 'Resultado Consolidado da Agência' : 'Equipe Comercial, Agenciadores e Gerentes'}
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {isCurrentUserAgenciador
                  ? 'Desempenho consolidado de faturamento, lucro real e comissão da agência.'
                  : 'Desempenho consolidado de faturamento, comissões ativas e lucro real por membro comercial e agenciador.'}
              </p>
            </div>
            <span className="px-3 py-1 bg-emerald-100 dark:bg-emerald-900/50 text-emerald-800 dark:text-emerald-300 font-bold text-xs rounded-full">
              {isCurrentUserAgenciador ? '1 agência ativa' : `${activeCommissionUsers.length} comissão(ões) ativa(s)`}
            </span>
          </div>

          {displayedCommercialUsers.length === 0 ? (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400 font-medium">
              Nenhum resultado de agenciamento ou comissão encontrado.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-gray-50 dark:bg-gray-700/50 text-gray-500 dark:text-gray-300 uppercase font-semibold">
                  <tr>
                    <th className="p-4">Usuário / Perfil</th>
                    <th className="p-4">Modalidade / Base</th>
                    <th className="p-4">Status Comissão</th>
                    <th className="p-4">Fixo (R$)</th>
                    <th className="p-4">Comissões (%)</th>
                    {canViewPredictedCommission(currentUser) && (
                      <th className="p-4 text-right text-amber-600 dark:text-amber-400 font-bold">Comissão Prevista</th>
                    )}
                    <th className="p-4 text-right">Comissão Efetivada</th>
                    <th className="p-4 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700 text-gray-900 dark:text-gray-100">
                  {displayedCommercialUsers.map(user => {
                    const isAgenciador = user.profile === UserProfile.Agenciador;
                    const isActive = user.hasCommercialCommission === true || user.profile === UserProfile.GerenteComercial || isAgenciador;

                    const totalAgencyShipmentComm = userAgencyCommissionMap.get(user.id) || 0;
                    const totalAgencyShipmentProfit = userAgencyProfitMap.get(user.id) || 0;
                    const agencyShipmentCount = userAgencyShipmentCountMap.get(user.id) || 0;

                    const userFixed = (isAgenciador && !user.hasCommercialCommission)
                      ? 0
                      : (user.commercialFixedSalary !== undefined
                        ? user.commercialFixedSalary
                        : (isAgenciador ? 0 : DEFAULT_FIXED));

                    const userMatrizRate = (isAgenciador && !user.hasCommercialCommission)
                      ? 0
                      : (user.commercialMatrizRate !== undefined
                        ? user.commercialMatrizRate
                        : (isAgenciador ? 0 : DEFAULT_MATRIZ_RATE));

                    const userFiliaisRate = (isAgenciador && !user.hasCommercialCommission)
                      ? 0
                      : (user.commercialFiliaisRate !== undefined
                        ? user.commercialFiliaisRate
                        : (isAgenciador ? 0 : DEFAULT_FILIAIS_RATE));

                    const calcMode = user.commercialCalculationMode || 'bruto';
                    const isAgencyMode = user.commercialIsAgencyMode || isAgenciador;

                    // Filiais selecionadas para este usuário
                    const userSelectedBranchIds = user.commercialSelectedBranchIds || nonMatrizBranches.map(b => b.id);

                    // Calcular membros da agência para divisão da comissão
                    const agencyKey = userSelectedBranchIds.sort().join('|') || (user.branchId || 'default');
                    const agencyMembersCount = agencyMemberCountsMap.get(agencyKey) || 1;

                    // Fator de divisão da agência
                    let shareFactor = 1;
                    if (isAgencyMode && !isAgenciador) {
                      if (user.commercialAgencySharePercent !== undefined && user.commercialAgencySharePercent > 0) {
                        shareFactor = user.commercialAgencySharePercent / 100;
                      } else {
                        shareFactor = 1 / Math.max(1, agencyMembersCount);
                      }
                    }

                    // Escolher entre Bruto e Líquido (Margem)
                    const targetMatrizRevenue = calcMode === 'liquido' ? fatLiquidoMatriz : fatBrutoMatriz;
                    const targetBranchRevenueMap = calcMode === 'liquido' ? branchNetMap : branchGrossMap;

                    // Calcular faturamento das filiais selecionadas
                    const userFiliaisRevenue = userSelectedBranchIds.reduce((sum, bId) => sum + (targetBranchRevenueMap.get(bId) || 0), 0);

                    // Taxas efetivas após divisão da agência
                    const effectiveMatrizRate = userMatrizRate * (isAgencyMode ? shareFactor : 1);
                    const effectiveFiliaisRate = userFiliaisRate * (isAgencyMode ? shareFactor : 1);

                    const matrizForUser = (isActive && effectiveMatrizRate > 0) ? targetMatrizRevenue * (effectiveMatrizRate / 100) : 0;
                    const filiaisForUser = (isActive && effectiveFiliaisRate > 0) ? userFiliaisRevenue * (effectiveFiliaisRate / 100) : 0;
                    const totalCommissionsForUser = isAgenciador
                      ? (totalAgencyShipmentComm + (user.hasCommercialCommission ? (matrizForUser + filiaisForUser) : 0))
                      : (matrizForUser + filiaisForUser);
                    const totalForUser = isActive ? (userFixed + totalCommissionsForUser) : 0;
                    const teamOperatorsForUser = users.filter(u => u.profile === UserProfile.Agenciador && u.agencyRole === 'embarque' && u.agencyLeaderId === user.id);
                    const teamCount = teamOperatorsForUser.length;

                    return (
                      <React.Fragment key={user.id}>
                        <tr className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold shrink-0 ${isAgenciador
                              ? 'bg-purple-100 dark:bg-purple-900/50 text-purple-600 dark:text-purple-400'
                              : 'bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400'
                              }`}>
                              <UsersIcon className="w-4 h-4" />
                            </div>
                            <div>
                              <div className="font-bold text-gray-900 dark:text-white text-sm">{user.name}</div>
                              <div className="text-[11px] text-gray-500 dark:text-gray-400 flex items-center gap-1 flex-wrap">
                                <span>{user.email} •</span>
                                <span className={`font-semibold ${isAgenciador ? 'text-purple-600 dark:text-purple-400' : 'text-blue-500'}`}>
                                  {isAgenciador ? 'Agenciador Líder' : user.profile}
                                </span>
                                {isAgenciador && teamCount > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => setExpandedAgencyId(expandedAgencyId === user.id ? null : user.id)}
                                    className="text-[10px] bg-purple-100 hover:bg-purple-200 dark:bg-purple-950 dark:hover:bg-purple-900 text-purple-800 dark:text-purple-300 px-1.5 py-0.5 rounded font-bold cursor-pointer transition-colors inline-flex items-center gap-0.5"
                                    title={`Clique para ${expandedAgencyId === user.id ? 'ocultar' : 'exibir'} os ${teamCount} operador(es) vinculados`}
                                  >
                                    +{teamCount} {teamCount === 1 ? 'operador' : 'operadores'}
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* MODALIDADE E TIPO DE BASE */}
                        <td className="p-4 font-bold space-y-1">
                          <div className="flex flex-col gap-1 items-start">
                            {isAgenciador ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-purple-100 text-purple-800 dark:bg-purple-950/80 dark:text-purple-300 text-[10px] uppercase font-extrabold border border-purple-300 dark:border-purple-800">
                                <Users className="w-3 h-3" /> Agenciador ({user.agencyCommissionPercentage ?? 30}%)
                              </span>
                            ) : isAgencyMode ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-purple-100 text-purple-800 dark:bg-purple-950/80 dark:text-purple-300 text-[10px] uppercase font-extrabold border border-purple-300 dark:border-purple-800">
                                <Users className="w-3 h-3" /> Agência ({(shareFactor * 100).toFixed(0)}% pool)
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300 text-[10px] uppercase font-bold">
                                Individual
                              </span>
                            )}

                            {calcMode === 'liquido' ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-800 dark:bg-indigo-950/80 dark:text-indigo-300 text-[10px] uppercase font-bold border border-indigo-200 dark:border-indigo-800">
                                <Percent className="w-3 h-3" /> Líquido
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-800 dark:bg-blue-950/80 dark:text-blue-300 text-[10px] uppercase font-bold border border-blue-200 dark:border-blue-800">
                                Bruto
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="p-4">
                          {isActive ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300 text-[11px] font-bold">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Comissão Ativa
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400 text-[11px] font-medium">
                              <XCircle className="w-3.5 h-3.5" />
                              Sem Comissão
                            </span>
                          )}
                        </td>

                        {/* FIXO (R$) */}
                        <td className="p-4 font-mono font-medium">
                          {isActive ? (
                            <span>{userFixed.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                          ) : (
                            <span className="text-gray-400">R$ 0,00</span>
                          )}
                        </td>

                        {/* COMISSÕES (%) */}
                        <td className="p-4 font-mono">
                          {isAgenciador ? (
                            <div>
                              <span className="font-bold text-purple-600 dark:text-purple-400">
                                Agenciamento ({user.agencyCommissionPercentage ?? 30}%)
                              </span>
                              <div className="text-[11px] text-gray-900 dark:text-gray-100 font-bold">
                                {totalAgencyShipmentComm.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                              </div>
                              <div className="text-[10px] text-gray-400 font-sans">
                                Comissão s/ Lucro Real ({totalAgencyShipmentProfit.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })})
                              </div>
                              {effectiveMatrizRate > 0 && matrizForUser > 0 && (
                                <div className="text-[10px] text-blue-500 font-sans">
                                  + Matriz ({effectiveMatrizRate.toFixed(2)}%): {matrizForUser.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                </div>
                              )}
                              {effectiveFiliaisRate > 0 && filiaisForUser > 0 && (
                                <div className="text-[10px] text-blue-500 font-sans">
                                  + Filiais ({effectiveFiliaisRate.toFixed(2)}%): {filiaisForUser.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                </div>
                              )}
                            </div>
                          ) : isActive ? (
                            <div>
                              <span className="font-bold text-blue-600 dark:text-blue-400">
                                Total: {totalCommissionsForUser.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                              </span>
                              <div className="text-[10px] text-gray-500 font-sans mt-0.5">
                                Matriz ({effectiveMatrizRate.toFixed(2)}%): {matrizForUser.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                              </div>
                              {effectiveFiliaisRate > 0 && (
                                <div className="text-[10px] text-indigo-600 dark:text-indigo-400 font-sans">
                                  + Filiais ({effectiveFiliaisRate.toFixed(2)}%): {filiaisForUser.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                </div>
                              )}
                            </div>
                          ) : 'R$ 0,00'}
                        </td>

                        {/* VALOR A RECEBER */}
                        <td className="p-4 text-right font-mono font-black text-sm">
                          {isActive ? (
                            <div className="flex flex-col items-end">
                              <span className="text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-3 py-1 rounded-lg border border-emerald-200 dark:border-emerald-800">
                                {totalForUser.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                              </span>
                              {isAgenciador ? (
                                <span className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5 font-sans font-medium">
                                  {agencyShipmentCount} {agencyShipmentCount === 1 ? 'embarque' : 'embarques'}
                                  {teamCount > 0 ? ` (+${teamCount} op.)` : ''}
                                </span>
                              ) : (
                                <span className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5 font-sans font-medium">
                                  Fixo + Comissões Matriz e Filiais
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-gray-400">R$ 0,00</span>
                          )}
                        </td>

                        {/* AÇÕES: LISTAGEM, PDF E EXIBIR OPERADORES */}
                        <td className="p-4 text-center">
                          <div className="flex items-center justify-center gap-1.5 flex-wrap">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedUserForDetails(user);
                                setModalSearchTerm('');
                                setModalStatusFilter('ALL');
                              }}
                              title="Visualizar listagem detalhada de embarques"
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600 dark:text-slate-200 border border-slate-300/70 dark:border-slate-600 transition-all shadow-2xs hover:shadow-xs active:scale-95 cursor-pointer"
                            >
                              <Eye className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                              <span>Listagem</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => exportUserShipmentsPDF(user)}
                              title="Baixar relatório detalhado de embarques em PDF"
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white border border-purple-500/30 transition-all shadow-xs hover:shadow-sm active:scale-95 cursor-pointer"
                            >
                              <Download className="w-3.5 h-3.5" />
                              <span>PDF</span>
                            </button>

                            {teamCount > 0 && (
                              <button
                                type="button"
                                onClick={() => setExpandedAgencyId(expandedAgencyId === user.id ? null : user.id)}
                                title={expandedAgencyId === user.id ? "Ocultar operadores vinculados" : "Exibir operadores vinculados a esta agência"}
                                className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg transition-all shadow-2xs hover:shadow-xs active:scale-95 cursor-pointer border ${
                                  expandedAgencyId === user.id
                                    ? 'bg-purple-700 text-white border-purple-800 dark:bg-purple-600'
                                    : 'bg-purple-50 hover:bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:hover:bg-purple-900/60 dark:text-purple-300 border-purple-300/80 dark:border-purple-800'
                                }`}
                              >
                                <Users className="w-3.5 h-3.5" />
                                <span>{expandedAgencyId === user.id ? 'Ocultar Operadores' : 'Exibir Operadores'}</span>
                                <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${expandedAgencyId === user.id ? 'rotate-180' : ''}`} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>

                      {expandedAgencyId === user.id && (
                        <tr key={`${user.id}-operators`} className="bg-slate-50/70 dark:bg-slate-900/60 border-b border-gray-200 dark:border-gray-700">
                          <td colSpan={7} className="p-3 sm:p-5">
                            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-purple-200/90 dark:border-purple-800/80 overflow-hidden animate-fade-in">
                              {/* Header dos Operadores da Agência */}
                              <div className="p-4 bg-gradient-to-r from-purple-50 via-slate-50 to-purple-50/40 dark:from-purple-950/40 dark:via-gray-800 dark:to-purple-950/20 border-b border-purple-200/80 dark:border-purple-800/80 flex items-center justify-between flex-wrap gap-3">
                                <div className="flex items-center gap-3">
                                  <div className="w-9 h-9 rounded-xl bg-purple-100 dark:bg-purple-900/60 border border-purple-300 dark:border-purple-700 flex items-center justify-center text-purple-700 dark:text-purple-300 shrink-0">
                                    <UserCheck className="w-5 h-5" />
                                  </div>
                                  <div>
                                    <h4 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                      Operadores de Embarque: <span className="text-purple-600 dark:text-purple-400">{user.name}</span>
                                    </h4>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">
                                      Detalhamento individual dos agenciadores de embarque vinculados a esta agência. Veja o resultado ou baixe o extrato individual em PDF.
                                    </p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="px-3 py-1 bg-purple-100 dark:bg-purple-950 text-purple-800 dark:text-purple-300 font-bold text-xs rounded-full border border-purple-300 dark:border-purple-800">
                                    {teamCount} {teamCount === 1 ? 'operador vinculado' : 'operadores vinculados'}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => setExpandedAgencyId(null)}
                                    className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer"
                                    title="Fechar"
                                  >
                                    <X className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>

                              {/* Tabela dos Operadores */}
                              <div className="overflow-x-auto">
                                <table className="w-full text-left text-xs">
                                  <thead className="bg-gray-50 dark:bg-gray-700/50 text-gray-500 dark:text-gray-300 uppercase font-semibold">
                                    <tr>
                                      <th className="p-3.5">Operador</th>
                                      <th className="p-3.5">Papel / Função</th>
                                      <th className="p-3.5 text-center">Embarques com CTE</th>
                                      <th className="p-3.5 text-right">Lucro Real Gerado</th>
                                      <th className="p-3.5 text-right">Comissão a Receber</th>
                                      <th className="p-3.5 text-center">Ações</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700 text-gray-900 dark:text-gray-100">
                                    {teamOperatorsForUser.map(op => {
                                      const opCount = memberShipmentCountMap.get(op.id) || 0;
                                      const opProfit = memberProfitMap.get(op.id) || 0;
                                      const opComm = memberCommissionMap.get(op.id) || 0;
                                      const opRate = op.operatorCommissionPercentage !== undefined
                                        ? op.operatorCommissionPercentage
                                        : (op.agencyCommissionPercentage !== undefined && op.agencyCommissionPercentage < 30 ? op.agencyCommissionPercentage : 0);

                                      return (
                                        <tr key={op.id} className="hover:bg-purple-50/40 dark:hover:bg-purple-950/20 transition-colors">
                                          <td className="p-3.5">
                                            <div className="font-bold text-gray-900 dark:text-white text-sm">{op.name}</div>
                                            <div className="text-[11px] text-gray-500 dark:text-gray-400">{op.email}</div>
                                          </td>
                                          <td className="p-3.5">
                                            <div className="flex flex-col gap-1 items-start">
                                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 dark:bg-purple-950/80 dark:text-purple-300 text-[10px] uppercase font-bold border border-purple-300 dark:border-purple-800">
                                                Agenciador de Embarque
                                              </span>
                                              {opRate > 0 && (
                                                <span className="text-[10px] font-semibold text-purple-600 dark:text-purple-400">
                                                  Taxa: {opRate}% s/ lucro
                                                </span>
                                              )}
                                            </div>
                                          </td>
                                          <td className="p-3.5 text-center font-bold text-sm">
                                            {opCount} {opCount === 1 ? 'embarque' : 'embarques'}
                                          </td>
                                          <td className="p-3.5 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                                            {opProfit.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                          </td>
                                          <td className="p-3.5 text-right font-mono font-black text-purple-600 dark:text-purple-400">
                                            {opComm.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                          </td>
                                          <td className="p-3.5 text-center">
                                            <div className="flex items-center justify-center gap-1.5 flex-wrap">
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  setSelectedUserForDetails(op);
                                                  setModalSearchTerm('');
                                                  setModalStatusFilter('ALL');
                                                }}
                                                title={`Visualizar listagem detalhada de embarques de ${op.name}`}
                                                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600 dark:text-slate-200 border border-slate-300/70 dark:border-slate-600 transition-all shadow-2xs hover:shadow-xs active:scale-95 cursor-pointer"
                                              >
                                                <Eye className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                                                <span>Listagem</span>
                                              </button>

                                              <button
                                                type="button"
                                                onClick={() => exportUserShipmentsPDF(op)}
                                                title={`Baixar extrato individual de embarques de ${op.name} em PDF`}
                                                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white border border-purple-500/30 transition-all shadow-xs hover:shadow-sm active:scale-95 cursor-pointer"
                                              >
                                                <Download className="w-3.5 h-3.5" />
                                                <span>PDF</span>
                                              </button>
                                            </div>
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                  {/* Linha de Totais da Equipe da Agência */}
                                  {teamOperatorsForUser.length > 1 && (() => {
                                    const totalOpCount = teamOperatorsForUser.reduce((sum, op) => sum + (memberShipmentCountMap.get(op.id) || 0), 0);
                                    const totalOpProfit = teamOperatorsForUser.reduce((sum, op) => sum + (memberProfitMap.get(op.id) || 0), 0);
                                    const totalOpComm = teamOperatorsForUser.reduce((sum, op) => sum + (memberCommissionMap.get(op.id) || 0), 0);
                                    return (
                                      <tfoot className="bg-gray-100/80 dark:bg-gray-700/60 font-bold border-t-2 border-purple-300 dark:border-purple-700">
                                        <tr>
                                          <td colSpan={2} className="p-3.5 text-right font-extrabold uppercase text-[11px] text-gray-700 dark:text-gray-200">
                                            Total dos Operadores ({teamOperatorsForUser.length}):
                                          </td>
                                          <td className="p-3.5 text-center text-sm font-bold text-gray-900 dark:text-white">
                                            {totalOpCount} {totalOpCount === 1 ? 'embarque' : 'embarques'}
                                          </td>
                                          <td className="p-3.5 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                                            {totalOpProfit.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                          </td>
                                          <td className="p-3.5 text-right font-mono font-black text-purple-600 dark:text-purple-400">
                                            {totalOpComm.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                          </td>
                                          <td className="p-3.5 text-center"></td>
                                        </tr>
                                      </tfoot>
                                    );
                                  })()}
                                </table>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TABELA DE OPERADORES DA EQUIPE (SE HOUVER) OU MEU RESULTADO */}
      {((isCurrentUserAgenciador && teamOperators.length > 0) || isCurrentUserAgenciadorEmbarque) && (
        <div className="bg-white dark:bg-gray-800/90 rounded-2xl shadow-sm border border-gray-200/80 dark:border-gray-700/80 overflow-hidden animate-fade-in">
          <div className="p-5 border-b border-gray-200 dark:border-gray-700/80 flex items-center justify-between flex-wrap gap-3">
            <div>
              <h3 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                {isCurrentUserAgenciadorEmbarque ? 'Meu Resultado' : `Operadores Vinculados à Agência (${teamOperators.length})`}
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {isCurrentUserAgenciadorEmbarque
                  ? 'Detalhamento dos seus embarques com CT-e, lucro real gerado e sua comissão individual a receber.'
                  : 'Detalhamento dos operadores de embarque que integram sua equipe e cujos resultados consolidam na sua agência.'}
              </p>
            </div>
            <span className="px-3 py-1 bg-purple-100 dark:bg-purple-950 text-purple-800 dark:text-purple-300 font-bold text-xs rounded-full border border-purple-300 dark:border-purple-800">
              {isCurrentUserAgenciadorEmbarque ? `Comissão: ${currentOperatorRate}%` : `${teamOperators.length} operador(es) ativo(s)`}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50 dark:bg-gray-700/50 text-gray-500 dark:text-gray-300 uppercase font-semibold">
                <tr>
                  <th className="p-4">{isCurrentUserAgenciadorEmbarque ? 'Meu Perfil' : 'Operador'}</th>
                  <th className="p-4">Papel / Função</th>
                  <th className="p-4 text-center">Embarques com CTE</th>
                  <th className="p-4 text-right">Lucro Real Gerado</th>
                  <th className="p-4 text-right">{isCurrentUserAgenciadorEmbarque ? 'Valor a Receber' : 'Comissão Gerada'}</th>
                  <th className="p-4 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700 text-gray-900 dark:text-gray-100">
                {teamOperators.map(op => {
                  const opCount = memberShipmentCountMap.get(op.id) || 0;
                  const opProfit = memberProfitMap.get(op.id) || 0;
                  const opComm = memberCommissionMap.get(op.id) || 0;
                  const opRate = op.operatorCommissionPercentage !== undefined
                    ? op.operatorCommissionPercentage
                    : (op.agencyCommissionPercentage !== undefined && op.agencyCommissionPercentage < 30 ? op.agencyCommissionPercentage : 0);

                  return (
                    <tr key={op.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                      <td className="p-4">
                        <div className="font-bold text-gray-900 dark:text-white text-sm">{op.name}</div>
                        <div className="text-[11px] text-gray-500 dark:text-gray-400">{op.email}</div>
                      </td>
                      <td className="p-4">
                        <div className="flex flex-col gap-1 items-start">
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-purple-100 text-purple-800 dark:bg-purple-950/80 dark:text-purple-300 text-[10px] uppercase font-bold border border-purple-300 dark:border-purple-800">
                            Agenciador de Embarque
                          </span>
                          {opRate > 0 && (
                            <span className="text-[10px] font-semibold text-purple-600 dark:text-purple-400">
                              Taxa: {opRate}% s/ lucro
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-4 text-center font-bold text-sm">
                        {opCount} {opCount === 1 ? 'embarque' : 'embarques'}
                      </td>
                      <td className="p-4 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        {opProfit.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </td>
                      <td className="p-4 text-right font-mono font-black text-purple-600 dark:text-purple-400">
                        {opComm.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </td>
                      <td className="p-4 text-center">
                        <div className="flex items-center justify-center gap-1.5 flex-wrap">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedUserForDetails(op);
                              setModalSearchTerm('');
                              setModalStatusFilter('ALL');
                            }}
                            title={`Visualizar embarques de ${op.name}`}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600 dark:text-slate-200 border border-slate-300/70 dark:border-slate-600 transition-all shadow-2xs hover:shadow-xs active:scale-95 cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                            <span>Listagem</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => exportUserShipmentsPDF(op)}
                            title={`Baixar PDF de ${op.name}`}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white border border-purple-500/30 transition-all shadow-xs hover:shadow-sm active:scale-95 cursor-pointer"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>PDF</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL DE LISTAGEM DETALHADA DE EMBARQUES DA AGÊNCIA */}
      {selectedUserForDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-2 sm:p-4 overflow-y-auto animate-fade-in">
          <div className="bg-white dark:bg-gray-900 w-full max-w-[97vw] 2xl:max-w-[1600px] rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col max-h-[94vh] my-auto">
            {/* Modal Header */}
            <div className="py-3.5 px-4 sm:px-5 border-b border-gray-200 dark:border-gray-700/80 bg-gradient-to-r from-slate-900 via-purple-950 to-slate-900 text-white flex items-center justify-between flex-wrap gap-3 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-purple-600/30 border border-purple-400/40 flex items-center justify-center text-purple-300 shrink-0">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-base sm:text-lg font-bold text-white tracking-tight">
                      Detalhamento de Embarques: <span className="text-purple-300">{selectedUserForDetails.name}</span>
                    </h3>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/30 text-purple-200 border border-purple-400/40 uppercase">
                      {selectedUserForDetails.profile === UserProfile.Agenciador
                        ? (selectedUserForDetails.agencyRole === 'embarque'
                          ? `Operador de Embarque (${selectedUserForDetails.operatorCommissionPercentage ?? (selectedUserForDetails.agencyCommissionPercentage && selectedUserForDetails.agencyCommissionPercentage < 30 ? selectedUserForDetails.agencyCommissionPercentage : 0)}%)`
                          : `Agência Líder (${selectedUserForDetails.agencyCommissionPercentage ?? 30}%)`)
                        : selectedUserForDetails.profile}
                    </span>
                  </div>
                  <p className="text-xs text-gray-300 mt-0.5">
                    {selectedUserForDetails.email} • {modalDetailedShipments.length} embarque(s) com CT-e encontrados
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => exportUserShipmentsPDF(selectedUserForDetails, modalDetailedShipments)}
                  className="inline-flex items-center gap-2 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-xl border border-purple-400/50 shadow-md transition-all active:scale-95 cursor-pointer"
                  title="Baixar a listagem exibida em PDF"
                >
                  <Download className="w-4 h-4" />
                  <span>Baixar Relatório PDF</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedUserForDetails(null)}
                  className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-gray-300 hover:text-white transition-colors cursor-pointer"
                  title="Fechar"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal KPI Mini-Cards */}
            <div className="py-2.5 px-4 bg-gray-50 dark:bg-gray-800/60 border-b border-gray-200 dark:border-gray-700 grid grid-cols-2 sm:grid-cols-4 gap-2.5 shrink-0">
              <div className="p-2.5 bg-white dark:bg-gray-800 rounded-xl border border-gray-200/80 dark:border-gray-700 shadow-2xs">
                <span className="text-[10px] uppercase font-bold text-gray-500 dark:text-gray-400">Total Embarques</span>
                <p className="text-base font-black text-gray-900 dark:text-white mt-0.5">{modalDetailedShipments.length}</p>
              </div>
              <div className="p-2.5 bg-white dark:bg-gray-800 rounded-xl border border-gray-200/80 dark:border-gray-700 shadow-2xs">
                <span className="text-[10px] uppercase font-bold text-blue-600 dark:text-blue-400">Faturamento Bruto</span>
                <p className="text-base font-black text-blue-600 dark:text-blue-400 mt-0.5 font-mono">
                  {modalTotals.gross.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </p>
              </div>
              <div className="p-2.5 bg-white dark:bg-gray-800 rounded-xl border border-gray-200/80 dark:border-gray-700 shadow-2xs">
                <span className="text-[10px] uppercase font-bold text-emerald-600 dark:text-emerald-400">Lucro Real Total</span>
                <p className="text-base font-black text-emerald-600 dark:text-emerald-400 mt-0.5 font-mono">
                  {modalTotals.profit.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </p>
              </div>
              <div className="p-2.5 bg-white dark:bg-gray-800 rounded-xl border border-purple-200 dark:border-purple-800/80 shadow-2xs bg-purple-50/40 dark:bg-purple-950/30">
                <span className="text-[10px] uppercase font-bold text-purple-700 dark:text-purple-300">
                  {selectedUserForDetails.agencyRole === 'embarque' ? 'Comissão a Receber' : 'Comissão da Agência'}
                </span>
                <p className="text-base font-black text-purple-700 dark:text-purple-300 mt-0.5 font-mono">
                  {modalTotals.comm.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </p>
              </div>
            </div>

            {/* Modal Filters Bar */}
            <div className="py-2.5 px-4 border-b border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 shrink-0 bg-gray-50/40 dark:bg-gray-800/30">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Pesquisar por CTE, cliente, motorista, placa, rota ou operador..."
                  value={modalSearchTerm}
                  onChange={e => setModalSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-8 py-1.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-xl text-xs text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 shadow-2xs"
                />
                {modalSearchTerm && (
                  <button
                    type="button"
                    onClick={() => setModalSearchTerm('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xs"
                  >
                    ×
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={modalStatusFilter}
                  onChange={e => setModalStatusFilter(e.target.value)}
                  className="px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-xl text-xs text-gray-900 dark:text-white font-medium focus:outline-none focus:ring-2 focus:ring-purple-500 shadow-2xs"
                >
                  <option value="ALL">Todos os Status</option>
                  <option value={ShipmentStatus.Finalizado}>Finalizado</option>
                  <option value={ShipmentStatus.AguardandoDescarga}>Aguardando Descarga</option>
                  <option value={ShipmentStatus.ValidacaoTicket}>Validação Ticket</option>
                  <option value={ShipmentStatus.AguardandoPagamentoSaldo}>Aguardando Pagamento Saldo</option>
                  <option value={ShipmentStatus.AguardandoAdiantamento}>Aguardando Adiantamento</option>
                  <option value={ShipmentStatus.AguardandoCarregamento}>Aguardando Carregamento</option>
                </select>
              </div>
            </div>

            {/* Modal Table Content */}
            <div className="overflow-x-auto overflow-y-auto flex-1 p-0">
              {modalDetailedShipments.length === 0 ? (
                <div className="p-12 text-center text-gray-500 dark:text-gray-400">
                  <FileSpreadsheet className="w-12 h-12 mx-auto mb-3 opacity-40 text-purple-500" />
                  <p className="font-bold text-sm text-gray-700 dark:text-gray-200">Nenhum embarque encontrado</p>
                  <p className="text-xs text-gray-400 mt-1">Tente ajustar os filtros de busca ou status acima.</p>
                </div>
              ) : (
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="sticky top-0 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 uppercase font-bold text-[10px] tracking-wider border-b border-gray-200 dark:border-gray-700 z-10 shadow-2xs">
                    <tr>
                      <th className="py-2.5 px-2.5">CTE / Carga</th>
                      <th className="py-2.5 px-2.5">Data</th>
                      <th className="py-2.5 px-2.5">Cliente</th>
                      <th className="py-2.5 px-2.5">Origem & Destino</th>
                      <th className="py-2.5 px-2.5">Motorista / Veículo</th>
                      <th className="py-2.5 px-2.5">Operador</th>
                      <th className="py-2.5 px-2.5 text-right">Faturamento</th>
                      <th className="py-2.5 px-2.5 text-right">Lucro Real</th>
                      <th className="py-2.5 px-2.5 text-center">% Com.</th>
                      <th className="py-2.5 px-2.5 text-right">{selectedUserForDetails?.agencyRole === 'embarque' ? 'Comissão Operador' : 'Comissão Agência'}</th>
                      <th className="py-2.5 px-2.5 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700/80 text-gray-900 dark:text-gray-100">
                    {modalDetailedShipments.map(item => (
                      <tr key={item.id} className="hover:bg-purple-50/40 dark:hover:bg-purple-950/20 transition-colors">
                        <td className="py-2 px-2.5 font-mono font-bold text-gray-900 dark:text-white whitespace-nowrap">
                          <span className="bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-300 dark:border-slate-700 text-xs shadow-2xs">
                            {item.cte ? `CT-e ${item.cte}` : `#${item.id}`}
                          </span>
                        </td>
                        <td className="py-2 px-2.5 whitespace-nowrap text-gray-700 dark:text-gray-300 font-medium text-xs">
                          {item.date ? (item.date.includes('-') ? item.date.split('-').reverse().join('/') : item.date) : '---'}
                        </td>
                        <td className="py-2 px-2.5 font-semibold text-gray-900 dark:text-gray-100 max-w-[170px] truncate text-xs" title={item.clientName}>
                          {item.clientName}
                        </td>
                        <td className="py-2 px-2.5 text-[11px] max-w-[200px]">
                          <div className="flex items-center gap-1.5 truncate" title={`Origem: ${item.origin}`}>
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                            <span className="truncate text-gray-800 dark:text-gray-200 font-medium">{item.origin}</span>
                          </div>
                          <div className="flex items-center gap-1.5 truncate mt-0.5" title={`Destino: ${item.destination}`}>
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
                            <span className="truncate text-gray-500 dark:text-gray-400 font-medium">{item.destination}</span>
                          </div>
                        </td>
                        <td className="py-2 px-2.5 text-[11px] max-w-[170px]">
                          <div className="font-bold text-gray-900 dark:text-white truncate" title={item.driverName}>
                            {item.driverName}
                          </div>
                          <div className="font-mono text-[10px] text-gray-500 dark:text-gray-400 font-semibold">
                            {item.plate}
                          </div>
                        </td>
                        <td className="py-2 px-2.5 text-[11px] font-medium text-gray-700 dark:text-gray-300 truncate max-w-[130px]" title={item.operatorName}>
                          {item.operatorName}
                        </td>
                        <td className="py-2 px-2.5 text-right font-mono font-bold text-blue-600 dark:text-blue-400 whitespace-nowrap">
                          {item.grossRevenue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </td>
                        <td className="py-2 px-2.5 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                          {item.netProfit.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </td>
                        <td className="py-2 px-2.5 text-center font-bold text-purple-600 dark:text-purple-400 whitespace-nowrap">
                          {item.commissionPct}%
                        </td>
                        <td className="py-2 px-2.5 text-right font-mono font-black text-purple-700 dark:text-purple-300 whitespace-nowrap">
                          {item.commissionVal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </td>
                        <td className="py-2 px-2.5 text-center whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${item.status === ShipmentStatus.Finalizado
                            ? 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                            : 'bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-300 border border-blue-300 dark:border-blue-800'
                            }`}>
                            {item.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="sticky bottom-0 bg-gray-100 dark:bg-gray-800 border-t-2 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white font-bold text-xs shadow-md">
                    <tr>
                      <td colSpan={6} className="py-2.5 px-3 uppercase tracking-wider text-[11px]">
                        TOTAL GERAL ({modalDetailedShipments.length} EMBARQUES FILTRADOS)
                      </td>
                      <td className="py-2.5 px-2.5 text-right font-mono text-blue-600 dark:text-blue-400 whitespace-nowrap">
                        {modalTotals.gross.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </td>
                      <td className="py-2.5 px-2.5 text-right font-mono text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                        {modalTotals.profit.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </td>
                      <td className="py-2.5 px-2.5 text-center text-gray-400">-</td>
                      <td className="py-2.5 px-2.5 text-right font-mono text-purple-700 dark:text-purple-300 font-black whitespace-nowrap">
                        {modalTotals.comm.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </td>
                      <td className="py-2.5 px-2.5 text-center text-gray-400">-</td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>

            {/* Modal Footer */}
            <div className="py-2.5 px-4 border-t border-gray-200 dark:border-gray-700/80 bg-gray-50 dark:bg-gray-800/80 flex items-center justify-between flex-wrap gap-3 shrink-0">
              <span className="text-xs text-gray-500 dark:text-gray-400">
                Relatório calculado em tempo real com base nos custos, fretes e estadias aprovadas.
              </span>
              <button
                type="button"
                onClick={() => setSelectedUserForDetails(null)}
                className="px-4 py-1.5 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 text-xs font-bold rounded-xl transition-all cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SupervisorReport;
