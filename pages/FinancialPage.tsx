import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Shipment, Cargo, Client, User, FinancialTransaction, BankAccount, FinancialTab, Branch, Product, Vehicle, Owner } from '../types';
import type { StayRecord } from '../utils/toolStorage';
import { FinancialTransactionStatus } from '../types';
import { 
  DollarSign, 
  ArrowDownCircle, 
  ArrowUpCircle, 
  FileSpreadsheet, 
  PieChart, 
  Layers, 
  TrendingUp, 
  Landmark,
  FileText,
  ShieldCheck
} from 'lucide-react';

import { AccountsPayableTab } from '../components/financial/AccountsPayableTab';
import { AccountsReceivableTab } from '../components/financial/AccountsReceivableTab';
import { OfxReconciliationTab } from '../components/financial/OfxReconciliationTab';
import { FirstResultTab } from '../components/financial/FirstResultTab';
import { SecondResultTab } from '../components/financial/SecondResultTab';
import { ThirdResultTab } from '../components/financial/ThirdResultTab';
import { ControlShipmentsTab } from '../components/financial/ControlShipmentsTab';
import { ControlBankingTab } from '../components/financial/ControlBankingTab';
import { ControlFiscalTab } from '../components/financial/ControlFiscalTab';

import { 
  calculateFirstResult, 
  calculateSecondResult, 
  calculateThirdResult, 
  buildShipmentControlSheet 
} from '../utils/financialCalculations';
import { isShipmentFaturado } from '../utils';
import { taxTransactionService } from '../services/taxTransactionService';

interface FinancialPageProps {
  shipments: Shipment[];
  cargos: Cargo[];
  clients: Client[];
  users: User[];
  currentUser?: User | null;
  branches?: Branch[];
  products?: Product[];
  vehicles?: Vehicle[];
  owners?: Owner[];
  stays?: StayRecord[];
}

const STORAGE_TRANSACTIONS_KEY = 'transcunha_financial_transactions';
const STORAGE_ACCOUNTS_KEY = 'transcunha_financial_bank_accounts';

const INITIAL_BANK_ACCOUNTS: BankAccount[] = [];

export const FinancialPage: React.FC<FinancialPageProps> = ({
  shipments,
  cargos,
  clients,
  users,
  currentUser: _currentUser,
  branches = [],
  products = [],
  vehicles = [],
  owners = [],
  stays = [],
}) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlTab = searchParams.get('tab') as FinancialTab | null;

  const validTabs: FinancialTab[] = [
    'payables', 
    'receivables', 
    'invoices', 
    'ofx', 
    'result-1', 
    'result-2', 
    'result-3', 
    'control-shipments', 
    'control-fiscal',
    'control-banking'
  ];

  const activeTab: FinancialTab = (urlTab && validTabs.includes(urlTab)) ? urlTab : 'payables';

  const handleTabChange = (tab: FinancialTab) => {
    setSearchParams({ tab });
  };

  // State: Bank Accounts - Apenas saldos reais vindo do banco/integração (R$ 0,00 caso vazio)
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_ACCOUNTS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          // Remove contas mockadas legadas para garantir fidelidade de saldos
          return parsed.filter((a: any) => 
            a && a.id !== 'acc_bradesco_1' && a.id !== 'acc_santander_2' && a.id !== 'acc_itau_3'
          );
        }
      }
    } catch (e) {
      console.error('Erro ao ler contas bancárias do localStorage', e);
    }
    return INITIAL_BANK_ACCOUNTS;
  });

  // State: Transactions
  const [transactions, setTransactions] = useState<FinancialTransaction[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_TRANSACTIONS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          // Filtra o Contas a Pagar para manter estritamente embarques já faturados
          return parsed.filter((t: FinancialTransaction) => {
            if (t.type === 'payable' && shipments && shipments.length > 0) {
              let shipId = t.shipmentId;
              if (!shipId && t.description) {
                const match = t.description.match(/Embarque\s+([A-Za-z0-9\-]+)/i);
                if (match && match[1]) {
                  shipId = match[1].trim();
                }
              }
              if (shipId) {
                const ship = shipments.find(s => s.id === shipId || String((s as any).sequenceId) === String(shipId));
                if (ship) {
                  return isShipmentFaturado(ship);
                }
              }
            }
            return true;
          });
        }
      }
    } catch (e) {
      console.error('Erro ao ler transações financeiras do localStorage', e);
    }

    // Seed initial financial transactions from existing shipments (apenas embarques já faturados com CT-e)
    const initialT: FinancialTransaction[] = [];
    const now = new Date();
    
    // Add real shipment-derived receivables & payables (apenas embarques faturados)
    const faturadoShipments = shipments.filter(s => isShipmentFaturado(s));
    faturadoShipments.slice(0, 15).forEach((s, idx) => {
      const cargo = cargos.find(c => c.id === s.cargoId);
      const client = clients.find(c => c.id === (cargo?.clientId || s.embarcadorId));
      const clientName = client?.razaoSocial || client?.nomeFantasia || 'Cliente Operacional';
      const ton = s.shipmentTonnage || 0;
      const compValue = (cargo?.companyFreightValuePerTon || 0) * ton;
      const driverValue = s.driverFreightValue || ((cargo?.driverFreightValuePerTon || 0) * ton);
      const isPaid = idx % 2 === 0;

      // Receivable (Client freight invoice)
      if (compValue > 0) {
        initialT.push({
          id: `tx_rec_ship_${s.id}`,
          type: 'receivable',
          description: `Faturamento Frete Embarque ${s.id} - ${clientName}`,
          amount: compValue,
          dueDate: new Date(now.getTime() + (idx * 2 - 5) * 86400000).toISOString().split('T')[0],
          paymentDate: isPaid ? new Date().toISOString().split('T')[0] : undefined,
          status: isPaid ? FinancialTransactionStatus.Pago : (idx < 3 ? FinancialTransactionStatus.Atrasado : FinancialTransactionStatus.Pendente),
          category: 'Receita Operacional de Frete',
          supplierOrClientName: clientName,
          documentNumber: s.cteNumber || `FAT-${1000 + idx}`,
          shipmentId: s.id,
          costCenter: 'Operacional',
          createdAt: new Date().toISOString()
        });
      }

      // Payable (Driver freight payment)
      if (driverValue > 0) {
        initialT.push({
          id: `tx_pay_ship_${s.id}`,
          type: 'payable',
          description: `Frete Motorista Embarque ${s.id} - ${s.driverName || 'Motorista Terceiro'}`,
          amount: driverValue,
          dueDate: new Date(now.getTime() + (idx * 2 - 4) * 86400000).toISOString().split('T')[0],
          paymentDate: isPaid ? new Date().toISOString().split('T')[0] : undefined,
          status: isPaid ? FinancialTransactionStatus.Pago : FinancialTransactionStatus.Pendente,
          category: 'Custos com Motoristas / Terceiros',
          supplierOrClientName: s.driverName || 'Motorista Terceiro',
          documentNumber: `CTE-${s.cteNumber || (2000 + idx)}`,
          shipmentId: s.id,
          costCenter: 'Operacional',
          createdAt: new Date().toISOString()
        });
      }
    });

    // Add baseline overhead costs
    initialT.push(
      {
        id: 'tx_pay_folha_1',
        type: 'payable',
        description: 'Folha de Pagamento Salarial e Encargos - Equipe Operacional',
        amount: 34500.00,
        dueDate: new Date(now.getFullYear(), now.getMonth(), 5).toISOString().split('T')[0],
        paymentDate: new Date(now.getFullYear(), now.getMonth(), 5).toISOString().split('T')[0],
        status: FinancialTransactionStatus.Pago,
        category: 'Despesas com Pessoal / Salários',
        supplierOrClientName: 'Colaboradores Transcunha',
        documentNumber: 'FOLHA-01',
        costCenter: 'Operacional',
        createdAt: new Date().toISOString()
      },
      {
        id: 'tx_pay_ti_2',
        type: 'payable',
        description: 'Sistemas TMS, Rastreamento e Infraestrutura em Nuvem',
        amount: 4200.00,
        dueDate: new Date(now.getFullYear(), now.getMonth(), 15).toISOString().split('T')[0],
        status: FinancialTransactionStatus.Pendente,
        category: 'Tecnologia / Sistemas TMS',
        supplierOrClientName: 'Provedores de Tecnologia & Nuvem',
        documentNumber: 'NF-8921',
        costCenter: 'Administrativo',
        createdAt: new Date().toISOString()
      },
      {
        id: 'tx_pay_gr_3',
        type: 'payable',
        description: 'Mensalidade Gerenciamento de Risco e Consultas ANTT/Seguradora',
        amount: 6850.00,
        dueDate: new Date(now.getFullYear(), now.getMonth(), 20).toISOString().split('T')[0],
        status: FinancialTransactionStatus.Pendente,
        category: 'Seguros e Gerenciamento de Risco',
        supplierOrClientName: 'Buonny / Brasil Risk',
        documentNumber: 'FAT-9901',
        costCenter: 'Operacional',
        createdAt: new Date().toISOString()
      }
    );

    return initialT;
  });

  // Sync to local storage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_ACCOUNTS_KEY, JSON.stringify(bankAccounts));
    } catch (e) {
      console.error(e);
    }
  }, [bankAccounts]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_TRANSACTIONS_KEY, JSON.stringify(transactions));
    } catch (e) {
      console.error(e);
    }
  }, [transactions]);

  // Carrega transações compartilhadas na nuvem (Supabase row 890) e escuta em Tempo Real
  useEffect(() => {
    let isMounted = true;

    const loadRemoteTransactions = async () => {
      try {
        const res = await taxTransactionService.fetchRemoteTaxTransactions();
        if (isMounted && res.success && Array.isArray(res.transactions)) {
          setTransactions(prev => {
            const remoteMap = new Map<string, FinancialTransaction>();
            res.transactions.forEach(t => remoteMap.set(t.id, t));

            // Transações na nuvem são prioritárias; mantém transações locais que ainda não estejam na nuvem
            const merged = [...res.transactions];
            prev.forEach(p => {
              if (!remoteMap.has(p.id)) {
                merged.push(p);
              }
            });
            return merged;
          });
        }
      } catch (err) {
        console.warn('[FinancialPage] Erro ao sincronizar tributos remotos:', err);
      }
    };

    loadRemoteTransactions();

    // Sincronização em tempo real instantânea (WebSocket Broadcast + Postgres Changes)
    const unsubscribe = taxTransactionService.subscribeToTaxTransactions(() => {
      loadRemoteTransactions();
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  // Financial Handlers
  const handleAddTransaction = (t: Omit<FinancialTransaction, 'id' | 'createdAt'>) => {
    const isTax = (t as any).taxType || (t.category && t.category.toLowerCase().includes('imposto'));
    const prefix = isTax ? 'tax' : 'tx';
    const newTx: FinancialTransaction = {
      ...t,
      id: `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      createdAt: new Date().toISOString()
    };
    setTransactions(prev => [newTx, ...prev]);

    // Persiste imediatamente na nuvem Supabase e notifica outros usuários via Realtime
    taxTransactionService.saveTaxTransaction(newTx, _currentUser).catch(err => {
      console.warn('[FinancialPage] Erro ao persistir transação na nuvem:', err);
    });
  };

  const handleUpdateStatus = (id: string, status: FinancialTransactionStatus) => {
    const paymentDate = status === FinancialTransactionStatus.Pago ? new Date().toISOString().split('T')[0] : undefined;
    setTransactions(prev => prev.map(t => {
      if (t.id === id) {
        return {
          ...t,
          status,
          paymentDate
        };
      }
      return t;
    }));

    // Sincroniza atualização de status na nuvem e em tempo real
    taxTransactionService.updateTaxTransaction(id, { status, paymentDate }).catch(err => {
      console.warn('[FinancialPage] Erro ao atualizar status na nuvem:', err);
    });
  };

  const handleUpdateTransaction = (id: string, updates: Partial<FinancialTransaction>) => {
    setTransactions(prev => prev.map(t => {
      if (t.id === id) {
        return {
          ...t,
          ...updates
        };
      }
      return t;
    }));

    // Sincroniza campos atualizados na nuvem e em tempo real
    taxTransactionService.updateTaxTransaction(id, updates).catch(err => {
      console.warn('[FinancialPage] Erro ao atualizar transação na nuvem:', err);
    });
  };

  const handleDeleteTransaction = (id: string) => {
    setTransactions(prev => prev.filter(t => t.id !== id));

    // Exclui na nuvem Supabase e propaga para todos os usuários
    taxTransactionService.deleteTaxTransaction(id).catch(err => {
      console.warn('[FinancialPage] Erro ao excluir transação na nuvem:', err);
    });
  };

  const handleAddBankAccount = (acc: Omit<BankAccount, 'id' | 'createdAt'>) => {
    const newAcc: BankAccount = {
      ...acc,
      id: `acc_${Date.now()}`,
      createdAt: new Date().toISOString()
    };
    setBankAccounts(prev => [...prev, newAcc]);
  };

  const handleUpdateAccountBalance = (id: string, newBalance: number) => {
    setBankAccounts(prev => prev.map(a => a.id === id ? { ...a, currentBalance: newBalance } : a));
  };

  // High level Financial KPIs
  const summaryKpis = useMemo(() => {
    const totalBankBalance = bankAccounts.reduce((sum, a) => sum + (a.active ? a.currentBalance : 0), 0);
    
    const pendingReceivables = transactions
      .filter(t => t.type === 'receivable' && t.status !== FinancialTransactionStatus.Cancelado && t.status !== FinancialTransactionStatus.Pago)
      .reduce((sum, t) => sum + t.amount, 0);

    const pendingPayables = transactions
      .filter(t => t.type === 'payable' && t.status !== FinancialTransactionStatus.Cancelado && t.status !== FinancialTransactionStatus.Pago)
      .reduce((sum, t) => sum + t.amount, 0);

    const projectedCashBalance = totalBankBalance + pendingReceivables - pendingPayables;

    return {
      totalBankBalance,
      pendingReceivables,
      pendingPayables,
      projectedCashBalance
    };
  }, [bankAccounts, transactions]);

  // Calculations for 1st, 2nd, and 3rd Results + Control Shipments
  const firstLevelResult = useMemo(() => {
    return calculateFirstResult(shipments, cargos);
  }, [shipments, cargos]);

  const secondLevelResult = useMemo(() => {
    return calculateSecondResult(firstLevelResult, transactions);
  }, [firstLevelResult, transactions]);

  const thirdLevelResult = useMemo(() => {
    return calculateThirdResult(secondLevelResult, transactions);
  }, [secondLevelResult, transactions]);

  const shipmentControlItems = useMemo(() => {
    return buildShipmentControlSheet(shipments, cargos, clients);
  }, [shipments, cargos, clients]);

  // Tab definitions
  const tabsConfig: { id: FinancialTab; label: string; icon: React.ElementType; badge?: string; group?: string }[] = [
    { id: 'payables', label: 'Contas a Pagar', icon: ArrowDownCircle },
    { id: 'receivables', label: 'Contas a Receber', icon: ArrowUpCircle },
    { id: 'ofx', label: 'Conciliação Bancária OFX', icon: FileSpreadsheet, badge: 'OFX' },
    { id: 'result-1', label: '1º Resultado', icon: PieChart },
    { id: 'result-2', label: '2º Resultado', icon: Layers },
    { id: 'result-3', label: '3º Resultado', icon: TrendingUp },
    { id: 'control-shipments', label: 'Planilha Embarque', icon: FileSpreadsheet, group: 'Controladoria' },
    { id: 'control-fiscal', label: 'Controladoria Fiscal', icon: ShieldCheck, badge: 'Apólices & Docs', group: 'Controladoria' },
    { id: 'control-banking', label: 'Controladoria Bancária', icon: Landmark, group: 'Controladoria' }
  ];

  return (
    <div className="space-y-6">
      {/* Top Banner / Header with Gradient Glassmorphism */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 border border-blue-900/40 p-6 sm:p-8 shadow-2xl text-white">
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-3">
              <div className="p-3 bg-gradient-to-tr from-blue-600 to-sky-500 rounded-2xl shadow-lg shadow-blue-500/30">
                <DollarSign className="w-8 h-8 text-white" />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white flex items-center gap-2">
                  Módulo Financeiro & Controladoria
                </h1>
                <p className="text-sm text-slate-300 mt-0.5">
                  Gestão integrada de contas a pagar, receber, conciliação OFX, DREs em 3 níveis e auditoria de embarques.
                </p>
              </div>
            </div>
          </div>

          {/* Quick Realtime KPI Badges */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-white/5 border border-white/10 rounded-2xl p-3 backdrop-blur-md">
            <div className="px-3 py-1.5">
              <span className="text-[11px] font-semibold text-slate-400 block uppercase tracking-wider">Saldo Bancário</span>
              <span className="text-base sm:text-lg font-black text-emerald-400">
                R$ {summaryKpis.totalBankBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            <div className="px-3 py-1.5 border-l border-white/10">
              <span className="text-[11px] font-semibold text-slate-400 block uppercase tracking-wider">A Receber</span>
              <span className="text-base sm:text-lg font-black text-sky-400">
                R$ {summaryKpis.pendingReceivables.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            <div className="px-3 py-1.5 border-l border-white/10">
              <span className="text-[11px] font-semibold text-slate-400 block uppercase tracking-wider">A Pagar</span>
              <span className="text-base sm:text-lg font-black text-rose-400">
                R$ {summaryKpis.pendingPayables.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            <div className="px-3 py-1.5 border-l border-white/10">
              <span className="text-[11px] font-semibold text-slate-400 block uppercase tracking-wider">Saldo Projetado</span>
              <span className="text-base sm:text-lg font-black text-amber-400">
                R$ {summaryKpis.projectedCashBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        </div>

        {/* Tab Selector Navigation Bar */}
        <div className="mt-8 pt-5 border-t border-slate-700/60 flex items-center justify-start overflow-x-auto gap-2 scrollbar-none pb-1">
          {tabsConfig.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all duration-200 whitespace-nowrap cursor-pointer ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/40 scale-[1.02]'
                    : 'bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/5'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                <span>{tab.label}</span>
                {tab.badge && (
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] font-extrabold bg-sky-400/20 text-sky-300 border border-sky-400/30">
                    {tab.badge}
                  </span>
                )}
                {tab.group && (
                  <span className="hidden xl:inline text-[10px] uppercase font-bold text-slate-400 bg-slate-800/80 px-1.5 py-0.5 rounded">
                    {tab.group}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Content Display */}
      <div className="transition-all duration-200">
        {(activeTab === 'payables' || activeTab === 'invoices') && (
          <AccountsPayableTab
            transactions={transactions}
            onAddTransaction={handleAddTransaction}
            onUpdateStatus={handleUpdateStatus}
            onUpdateTransaction={handleUpdateTransaction}
            onDeleteTransaction={handleDeleteTransaction}
            shipments={shipments}
            cargos={cargos}
            clients={clients}
            users={users}
            branches={branches}
            currentUser={_currentUser}
            initialSection={urlTab === 'invoices' ? 'invoices' : 'all'}
          />
        )}

        {activeTab === 'receivables' && (
          <AccountsReceivableTab
            transactions={transactions}
            onAddTransaction={handleAddTransaction}
            onUpdateStatus={handleUpdateStatus}
            shipments={shipments}
            cargos={cargos}
            clients={clients}
            users={users}
            currentUser={_currentUser}
          />
        )}

        {activeTab === 'ofx' && (
          <OfxReconciliationTab
            transactions={transactions}
            bankAccounts={bankAccounts}
            currentUser={_currentUser}
            onUpdateTransaction={handleUpdateTransaction}
            onAddTransaction={handleAddTransaction}
            onReconcileTransaction={(ofxId) => {
              console.log('Reconciled OFX trn:', ofxId);
            }}
          />
        )}

        {activeTab === 'result-1' && (
          <FirstResultTab
            data={firstLevelResult}
            shipments={shipments}
            cargos={cargos}
            clients={clients}
            users={users}
            branches={branches}
          />
        )}

        {activeTab === 'result-2' && (
          <SecondResultTab
            data={secondLevelResult}
            shipments={shipments}
            cargos={cargos}
            transactions={transactions}
          />
        )}

        {activeTab === 'result-3' && (
          <ThirdResultTab
            data={thirdLevelResult}
            shipments={shipments}
            cargos={cargos}
            transactions={transactions}
          />
        )}

        {activeTab === 'control-shipments' && (
          <ControlShipmentsTab
            items={shipmentControlItems}
            shipments={shipments}
            cargos={cargos}
            clients={clients}
            users={users}
            currentUser={_currentUser}
            products={products}
            vehicles={vehicles}
            owners={owners}
            branches={branches}
            stays={stays}
            onNavigateToFiscal={() => handleTabChange('control-fiscal')}
          />
        )}

        {activeTab === 'control-fiscal' && (
          <ControlFiscalTab
            branches={branches}
            currentUser={_currentUser}
          />
        )}

        {activeTab === 'control-banking' && (
          <ControlBankingTab
            accounts={bankAccounts}
            onAddAccount={handleAddBankAccount}
            onUpdateAccountBalance={handleUpdateAccountBalance}
          />
        )}
      </div>
    </div>
  );
};

export default FinancialPage;
