import React, { useState, useEffect } from 'react';
import type { Client, ClientBranchCnpj, LoadingOrderModel } from '../types';
import { PaymentMethod, DEFAULT_LOADING_ORDER_MODELS, getLoadingOrderModelById } from '../types';
import { autoFormatInput } from '../utils/formatters';
import { Building2, Plus, Trash2, Edit2, Check, X, MapPin, Phone, Mail, ShieldAlert, Sparkles, UserPlus, FileText, CheckCircle2 } from 'lucide-react';

interface ClientFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (client: Client | Omit<Client, 'id'>) => void;
  clientToEdit: Client | null;
  loadingOrderModels?: LoadingOrderModel[];
}

const ClientFormModal: React.FC<ClientFormModalProps> = ({
  isOpen,
  onClose,
  onSave,
  clientToEdit,
  loadingOrderModels
}) => {
  const [activeTab, setActiveTab] = useState<'main' | 'branches'>('main');
  const [showSalesperson, setShowSalesperson] = useState(false);
  
  const availableModels = (loadingOrderModels && loadingOrderModels.length > 0)
    ? loadingOrderModels
    : DEFAULT_LOADING_ORDER_MODELS;

  const [client, setClient] = useState<Omit<Client, 'id'>>({
    razaoSocial: '',
    nomeFantasia: '',
    cnpj: '',
    phone: '',
    email: '',
    address: '',
    city: '',
    state: '',
    paymentMethod: PaymentMethod.Prazo,
    paymentTerm: 30,
    requiresExternalOrder: false,
    requiresScheduling: false,
    salespersonName: '',
    salespersonCommissionPerTon: 0,
    loadingOrderModelId: 'mod_padrao_transcunha',
    ordemCarregamentoModelId: 'mod_padrao_transcunha',
    secondaryCnpjs: [],
  });

  // Branch creation / editing state
  const [isAddingBranch, setIsAddingBranch] = useState(false);
  const [editingBranchId, setEditingBranchId] = useState<string | null>(null);
  const [branchForm, setBranchForm] = useState<ClientBranchCnpj>({
    id: '',
    cnpj: '',
    razaoSocial: '',
    nomeFantasia: '',
    city: '',
    state: '',
    address: '',
    phone: '',
    email: '',
    paymentMethod: PaymentMethod.Prazo,
    paymentTerm: 30,
    requiresExternalOrder: false,
    requiresScheduling: false,
    salespersonName: '',
    salespersonCommissionPerTon: 0,
    loadingOrderModelId: '',
    ordemCarregamentoModelId: '',
  });

  useEffect(() => {
    if (clientToEdit) {
      const selectedModelId = clientToEdit.loadingOrderModelId || clientToEdit.ordemCarregamentoModelId || 'mod_padrao_transcunha';
      setClient({
        ...clientToEdit,
        salespersonName: clientToEdit.salespersonName || '',
        salespersonCommissionPerTon: clientToEdit.salespersonCommissionPerTon || 0,
        loadingOrderModelId: selectedModelId,
        ordemCarregamentoModelId: selectedModelId,
        secondaryCnpjs: clientToEdit.secondaryCnpjs || [],
      });
      setShowSalesperson(Boolean(clientToEdit.salespersonName || (clientToEdit.salespersonCommissionPerTon && clientToEdit.salespersonCommissionPerTon > 0)));
    } else {
      setClient({
        razaoSocial: '',
        nomeFantasia: '',
        cnpj: '',
        phone: '',
        email: '',
        address: '',
        city: '',
        state: '',
        paymentMethod: PaymentMethod.Prazo,
        paymentTerm: 30,
        requiresExternalOrder: false,
        requiresScheduling: false,
        salespersonName: '',
        salespersonCommissionPerTon: 0,
        loadingOrderModelId: 'mod_padrao_transcunha',
        ordemCarregamentoModelId: 'mod_padrao_transcunha',
        secondaryCnpjs: [],
      });
      setShowSalesperson(false);
    }
    setActiveTab('main');
    setIsAddingBranch(false);
    setEditingBranchId(null);
  }, [clientToEdit, isOpen]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    const formattedValue = autoFormatInput(name, value);
    if (type === 'checkbox') {
      const checked = (e.target as HTMLInputElement).checked;
      setClient(prev => ({ ...prev, [name]: checked }));
    } else if (name === 'loadingOrderModelId' || name === 'ordemCarregamentoModelId') {
      setClient(prev => ({
        ...prev,
        loadingOrderModelId: value,
        ordemCarregamentoModelId: value
      }));
    } else {
      setClient(prev => ({ ...prev, [name]: formattedValue }));
    }
  };

  const handleBranchChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    const formattedValue = autoFormatInput(name, value);
    if (type === 'checkbox') {
      const checked = (e.target as HTMLInputElement).checked;
      setBranchForm(prev => ({ ...prev, [name]: checked }));
    } else if (name === 'loadingOrderModelId' || name === 'ordemCarregamentoModelId') {
      setBranchForm(prev => ({
        ...prev,
        loadingOrderModelId: value,
        ordemCarregamentoModelId: value
      }));
    } else {
      setBranchForm(prev => ({ ...prev, [name]: formattedValue }));
    }
  };

  const handleStartAddBranch = () => {
    setBranchForm({
      id: `branch_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      cnpj: '',
      razaoSocial: client.razaoSocial || '',
      nomeFantasia: '',
      city: '',
      state: '',
      address: '',
      phone: client.phone || '',
      email: client.email || '',
      paymentMethod: client.paymentMethod || PaymentMethod.Prazo,
      paymentTerm: client.paymentTerm || 30,
      requiresExternalOrder: client.requiresExternalOrder || false,
      requiresScheduling: client.requiresScheduling || false,
      loadingOrderModelId: '',
      ordemCarregamentoModelId: '',
    });
    setEditingBranchId(null);
    setIsAddingBranch(true);
  };

  const handleStartEditBranch = (branch: ClientBranchCnpj) => {
    const branchModelId = branch.loadingOrderModelId || branch.ordemCarregamentoModelId || '';
    setBranchForm({
      ...branch,
      loadingOrderModelId: branchModelId,
      ordemCarregamentoModelId: branchModelId,
    });
    setEditingBranchId(branch.id);
    setIsAddingBranch(true);
  };

  const handleSaveBranch = () => {
    if (!branchForm.cnpj || !branchForm.cnpj.trim()) {
      alert('Informe o CNPJ da filial.');
      return;
    }

    const currentBranches = client.secondaryCnpjs ? [...client.secondaryCnpjs] : [];

    if (editingBranchId) {
      const updated = currentBranches.map(b => b.id === editingBranchId ? { ...branchForm, id: editingBranchId } : b);
      setClient(prev => ({ ...prev, secondaryCnpjs: updated }));
    } else {
      const newBranch: ClientBranchCnpj = {
        ...branchForm,
        id: branchForm.id || `branch_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
      };
      setClient(prev => ({ ...prev, secondaryCnpjs: [...currentBranches, newBranch] }));
    }

    setIsAddingBranch(false);
    setEditingBranchId(null);
  };

  const handleBranchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      handleSaveBranch();
    }
  };

  const handleRemoveBranch = (id: string) => {
    if (window.confirm('Tem certeza que deseja remover este CNPJ / Filial?')) {
      setClient(prev => ({
        ...prev,
        secondaryCnpjs: (prev.secondaryCnpjs || []).filter(b => b.id !== id)
      }));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    let finalSecondaryCnpjs = client.secondaryCnpjs ? [...client.secondaryCnpjs] : [];

    // Se o usuário estiver com o formulário de filial aberto e preencheu o CNPJ, inclui automaticamente
    if (isAddingBranch && branchForm.cnpj && branchForm.cnpj.trim()) {
      if (editingBranchId) {
        finalSecondaryCnpjs = finalSecondaryCnpjs.map(b => b.id === editingBranchId ? { ...branchForm, id: editingBranchId } : b);
      } else {
        const newBranch: ClientBranchCnpj = {
          ...branchForm,
          id: branchForm.id || `branch_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
        };
        finalSecondaryCnpjs.push(newBranch);
      }
    }

    const payloadToSave = {
      ...client,
      secondaryCnpjs: finalSecondaryCnpjs
    };

    if (clientToEdit) {
      onSave({
        ...payloadToSave,
        id: clientToEdit.id,
      });
    } else {
      onSave(payloadToSave);
    }
  };

  if (!isOpen) return null;

  const branchCount = (client.secondaryCnpjs || []).length;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex justify-center items-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden border border-gray-100 dark:border-gray-700">
        
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between bg-gray-50/50 dark:bg-gray-800/50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-primary/10 text-primary rounded-xl dark:bg-primary/20">
              <Building2 className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2.5">
                {clientToEdit ? 'Editar Cadastro de Cliente' : 'Novo Cadastro de Cliente'}
                {clientToEdit && (
                  <span className="text-xs font-mono font-bold px-2.5 py-0.5 bg-blue-50 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300 rounded-md border border-blue-200 dark:border-blue-800">
                    {clientToEdit.id}
                  </span>
                )}
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Gerencie os dados da empresa matriz e vincule múltiplos CNPJs (filiais e unidades).
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="px-6 pt-3 border-b border-gray-100 dark:border-gray-700 flex gap-4 bg-gray-50/30 dark:bg-gray-850/40">
          <button
            type="button"
            onClick={() => setActiveTab('main')}
            className={`pb-3 px-2 text-sm font-semibold border-b-2 flex items-center gap-2 transition-all ${
              activeTab === 'main'
                ? 'border-primary text-primary dark:text-primary-light'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            <Building2 className="w-4 h-4" />
            Dados da Matriz (Principal)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('branches')}
            className={`pb-3 px-2 text-sm font-semibold border-b-2 flex items-center gap-2 transition-all ${
              activeTab === 'branches'
                ? 'border-primary text-primary dark:text-primary-light'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            Filiais / CNPJs Vinculados
            <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
              branchCount > 0 
                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300' 
                : 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
            }`}>
              {branchCount}
            </span>
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          {activeTab === 'main' ? (
            <div className="space-y-6">
              <div className="bg-blue-50/50 dark:bg-blue-900/20 border border-blue-200/60 dark:border-blue-800/50 rounded-xl p-4 text-xs text-blue-800 dark:text-blue-300 flex items-start gap-2.5">
                <Building2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">Cadastro Principal (Matriz)</p>
                  <p className="mt-0.5 text-blue-700 dark:text-blue-400">
                    Estes são os dados principais do grupo empresarial. Você pode adicionar outros CNPJs na aba "Filiais / CNPJs Vinculados".
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
                    Razão Social <span className="text-red-500">*</span>
                  </label>
                  <input
                    name="razaoSocial"
                    value={client.razaoSocial}
                    onChange={handleChange}
                    placeholder="Ex: EMPRESA BRASILEIRA DE ALIMENTOS LTDA"
                    className="w-full p-2.5 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 text-sm font-medium text-gray-900 dark:text-white focus:ring-2 focus:ring-primary shadow-xs"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
                    Nome Fantasia
                  </label>
                  <input
                    name="nomeFantasia"
                    value={client.nomeFantasia}
                    onChange={handleChange}
                    placeholder="Ex: ALIMENTOS BRASIL"
                    className="w-full p-2.5 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 text-sm font-medium text-gray-900 dark:text-white focus:ring-2 focus:ring-primary shadow-xs"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
                    CNPJ Principal <span className="text-red-500">*</span>
                  </label>
                  <input
                    name="cnpj"
                    value={client.cnpj}
                    onChange={handleChange}
                    placeholder="00.000.000/0001-00"
                    className="w-full p-2.5 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 text-sm font-mono font-medium text-gray-900 dark:text-white focus:ring-2 focus:ring-primary shadow-xs"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
                    Telefone de Contato
                  </label>
                  <input
                    name="phone"
                    value={client.phone}
                    onChange={handleChange}
                    placeholder="(00) 00000-0000"
                    className="w-full p-2.5 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-primary shadow-xs"
                  />
                </div>

                <div className="space-y-1 md:col-span-2">
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
                    E-mail
                  </label>
                  <input
                    name="email"
                    value={client.email}
                    onChange={handleChange}
                    type="email"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    data-no-uppercase="true"
                    placeholder="contato@empresa.com.br"
                    className="w-full p-2.5 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-primary shadow-xs normal-case"
                  />
                </div>

                <div className="space-y-1 md:col-span-2">
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
                    Endereço
                  </label>
                  <input
                    name="address"
                    value={client.address}
                    onChange={handleChange}
                    placeholder="Rua, Avenida, Número, Bairro"
                    className="w-full p-2.5 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-primary shadow-xs"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
                    Cidade
                  </label>
                  <input
                    name="city"
                    value={client.city}
                    onChange={handleChange}
                    placeholder="Ex: Goiânia"
                    className="w-full p-2.5 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-primary shadow-xs"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
                    Estado (UF)
                  </label>
                  <input
                    name="state"
                    value={client.state}
                    onChange={handleChange}
                    placeholder="Ex: GO"
                    maxLength={2}
                    className="w-full p-2.5 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 text-sm font-bold uppercase text-gray-900 dark:text-white focus:ring-2 focus:ring-primary shadow-xs"
                  />
                </div>
              </div>

              {/* Regras Comerciais */}
              <div className="pt-4 border-t border-gray-100 dark:border-gray-700">
                <h3 className="text-sm font-bold text-gray-800 dark:text-white uppercase tracking-wide mb-4">
                  Regras Comerciais Padrão
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
                      Forma de Pagamento
                    </label>
                    <select
                      name="paymentMethod"
                      value={client.paymentMethod}
                      onChange={handleChange}
                      className="w-full p-2.5 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-primary shadow-xs"
                    >
                      {Object.values(PaymentMethod).map(method => (
                        <option key={method} value={method}>{method}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
                      Prazo de Pagamento (dias)
                    </label>
                    <input
                      name="paymentTerm"
                      value={client.paymentTerm}
                      onChange={handleChange}
                      type="number"
                      placeholder="Ex: 30"
                      className="w-full p-2.5 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-primary shadow-xs"
                    />
                  </div>

                  <div className="md:col-span-2 flex flex-wrap items-center gap-6 mt-2">
                    <label className="flex items-center space-x-2.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        name="requiresExternalOrder"
                        checked={client.requiresExternalOrder}
                        onChange={handleChange}
                        className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary dark:bg-gray-700 dark:border-gray-600"
                      />
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Exige Ordem Externa</span>
                    </label>
                    
                    <label className="flex items-center space-x-2.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        name="requiresScheduling"
                        checked={client.requiresScheduling}
                        onChange={handleChange}
                        className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary dark:bg-gray-700 dark:border-gray-600"
                      />
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Exige Agendamento</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Vendedor Vinculado & Comissão por Tonelada */}
              <div className="pt-4 border-t border-gray-100 dark:border-gray-700 space-y-3">
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="text-sm font-bold text-gray-800 dark:text-white uppercase tracking-wide">
                      Vendedor & Comissão por Tonelada
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Vincule um vendedor para que todas as cargas geradas com este cliente herdem a comissão automaticamente.
                    </p>
                  </div>
                  {!showSalesperson && (
                    <button 
                      type="button" 
                      onClick={() => setShowSalesperson(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 border border-emerald-200 dark:border-emerald-800/60 rounded-xl transition-all shadow-2xs cursor-pointer"
                    >
                      <UserPlus className="h-3.5 w-3.5" />
                      <span>Adicionar Vendedor</span>
                    </button>
                  )}
                </div>

                {showSalesperson && (
                  <div className="p-4 border border-emerald-200/80 dark:border-emerald-800/60 rounded-xl bg-emerald-50/30 dark:bg-emerald-950/20 shadow-xs space-y-3 animate-fadeIn">
                    <div className="flex justify-between items-center pb-2 border-b border-emerald-100 dark:border-emerald-900/40">
                      <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300 uppercase tracking-wider flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                        Dados do Vendedor do Cliente
                      </span>
                      <button 
                        type="button" 
                        onClick={() => {
                          setShowSalesperson(false);
                          setClient(prev => ({ ...prev, salespersonName: '', salespersonCommissionPerTon: 0 }));
                        }}
                        className="text-xs font-bold text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 cursor-pointer"
                      >
                        Remover Vendedor
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
                          Nome do Vendedor
                        </label>
                        <input 
                          name="salespersonName" 
                          value={client.salespersonName || ''} 
                          onChange={handleChange} 
                          placeholder="Ex: João da Silva" 
                          className="w-full p-2.5 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 text-sm font-medium text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-600 shadow-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
                          Comissão por Tonelada (R$/Ton)
                        </label>
                        <div className="relative">
                          <span className="absolute left-3 top-2.5 text-sm font-bold text-gray-400">R$</span>
                          <input 
                            name="salespersonCommissionPerTon" 
                            value={client.salespersonCommissionPerTon !== undefined && client.salespersonCommissionPerTon !== null && client.salespersonCommissionPerTon !== 0 ? client.salespersonCommissionPerTon : (client.salespersonCommissionPerTon === 0 ? '' : '')} 
                            onChange={handleChange} 
                            type="number" 
                            step="0.01"
                            placeholder="0,00" 
                            className="w-full pl-9 pr-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 text-sm font-mono font-bold text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-600 shadow-xs"
                          />
                        </div>
                      </div>
                    </div>

                    <p className="text-[11px] text-emerald-700 dark:text-emerald-400 font-medium">
                      💡 Ao salvar, todas as novas cargas geradas tendo este cliente como tomador/pagador herdarão este vendedor e comissão automaticamente.
                    </p>
                  </div>
                )}
              </div>

              {/* Modelo de Ordem de Carregamento */}
                <div className="pt-4 border-t border-gray-100 dark:border-gray-700">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="text-sm font-bold text-gray-800 dark:text-white uppercase tracking-wide flex items-center gap-1.5">
                        <FileText className="w-4 h-4 text-primary dark:text-primary-light" />
                        Modelo de Ordem de Carregamento
                      </h3>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        Defina o modelo operacional e layout de impressão para as ordens de carregamento deste cliente.
                      </p>
                    </div>
                    {(() => {
                      const selModel = availableModels.find(m => m.id === client.loadingOrderModelId) || availableModels.find(m => m.id === 'mod_padrao_transcunha');
                      return selModel ? (
                        <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider flex items-center gap-1 shrink-0 ${
                          selModel.status === 'ativo'
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300'
                            : 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300'
                        }`}>
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          {selModel.status === 'ativo' ? 'Modelo Ativo' : 'Modelo Inativo'}
                        </span>
                      ) : null;
                    })()}
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-1">
                        Modelo Selecionado para o Cliente
                      </label>
                      <select
                        name="loadingOrderModelId"
                        value={client.loadingOrderModelId || 'mod_padrao_transcunha'}
                        onChange={handleChange}
                        className="w-full p-2.5 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-semibold text-gray-900 dark:text-white focus:ring-2 focus:ring-primary shadow-xs"
                      >
                        {availableModels.map((model) => (
                          <option key={model.id} value={model.id}>
                            {model.nome} {model.isDefault ? '★ (Padrão do Sistema)' : ''} — [{model.status.toUpperCase()}]
                          </option>
                        ))}
                      </select>
                    </div>

                    {(() => {
                      const selModel = availableModels.find(m => m.id === client.loadingOrderModelId) || availableModels.find(m => m.id === 'mod_padrao_transcunha');
                      if (!selModel) return null;
                      return (
                        <div className="p-3.5 bg-gradient-to-r from-blue-50/70 to-indigo-50/70 dark:from-blue-950/30 dark:to-indigo-950/30 border border-blue-200/80 dark:border-blue-800/60 rounded-xl space-y-1.5 text-xs animate-fadeIn">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-blue-900 dark:text-blue-200 flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full bg-blue-600 dark:bg-blue-400"></span>
                              {selModel.nome}
                            </span>
                            <span className="font-mono text-[10px] text-gray-500 dark:text-gray-400">
                              Código: {selModel.id}
                            </span>
                          </div>
                          {selModel.descricao && (
                            <p className="text-gray-600 dark:text-gray-300 leading-relaxed">
                              {selModel.descricao}
                            </p>
                          )}
                          {selModel.observacoesPadrao && (
                            <div className="pt-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-amber-800 dark:text-amber-300">
                              <span className="px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/50 font-bold text-[10px]">OBS. PADRÃO</span>
                              <span>{selModel.observacoesPadrao}</span>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>
          ) : (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-gray-900 dark:text-white">
                    CNPJs Secundários e Filiais
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Vincule múltiplos CNPJs desta empresa para selecionar individualmente como tomador/pagador nas cargas e cotações.
                  </p>
                </div>
                {!isAddingBranch && (
                  <button
                    type="button"
                    onClick={handleStartAddBranch}
                    className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    Adicionar CNPJ / Filial
                  </button>
                )}
              </div>

              {/* Branch Add/Edit Sub-Form */}
              {isAddingBranch && (
                <div className="p-5 bg-gray-50 dark:bg-gray-750 border border-gray-200 dark:border-gray-600 rounded-2xl space-y-4 animate-fadeIn">
                  <div className="flex items-center justify-between pb-3 border-b border-gray-200 dark:border-gray-600">
                    <h4 className="text-sm font-bold text-gray-800 dark:text-gray-200 flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-emerald-600" />
                      {editingBranchId ? 'Editar Filial / CNPJ' : 'Cadastrar Nova Filial / CNPJ'}
                    </h4>
                    <button
                      type="button"
                      onClick={() => setIsAddingBranch(false)}
                      className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                    <div className="space-y-1">
                      <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
                        CNPJ da Filial <span className="text-red-500">*</span>
                      </label>
                      <input
                        name="cnpj"
                        value={branchForm.cnpj}
                        onChange={handleBranchChange}
                        onKeyDown={handleBranchKeyDown}
                        placeholder="00.000.000/0002-00"
                        className="w-full p-2.5 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 text-sm font-mono font-medium text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-600 shadow-xs"
                        required
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
                        Identificação da Filial / Nome Fantasia
                      </label>
                      <input
                        name="nomeFantasia"
                        value={branchForm.nomeFantasia || ''}
                        onChange={handleBranchChange}
                        onKeyDown={handleBranchKeyDown}
                        placeholder="Ex: Filial Catalão, Unidade 02"
                        className="w-full p-2.5 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 text-sm font-medium text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-600 shadow-xs"
                      />
                    </div>

                    <div className="space-y-1 md:col-span-2">
                      <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
                        Razão Social da Filial (Opcional se igual à Matriz)
                      </label>
                      <input
                        name="razaoSocial"
                        value={branchForm.razaoSocial || ''}
                        onChange={handleBranchChange}
                        onKeyDown={handleBranchKeyDown}
                        placeholder={client.razaoSocial || 'Razão Social'}
                        className="w-full p-2.5 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-600 shadow-xs"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
                        Cidade
                      </label>
                      <input
                        name="city"
                        value={branchForm.city || ''}
                        onChange={handleBranchChange}
                        onKeyDown={handleBranchKeyDown}
                        placeholder="Cidade da Filial"
                        className="w-full p-2.5 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-600 shadow-xs"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
                        Estado (UF)
                      </label>
                      <input
                        name="state"
                        value={branchForm.state || ''}
                        onChange={handleBranchChange}
                        onKeyDown={handleBranchKeyDown}
                        placeholder="UF"
                        maxLength={2}
                        className="w-full p-2.5 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 text-sm font-bold uppercase text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-600 shadow-xs"
                      />
                    </div>

                    <div className="space-y-1 md:col-span-2">
                      <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
                        Endereço Completo
                      </label>
                      <input
                        name="address"
                        value={branchForm.address || ''}
                        onChange={handleBranchChange}
                        onKeyDown={handleBranchKeyDown}
                        placeholder="Endereço da unidade"
                        className="w-full p-2.5 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-600 shadow-xs"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
                        Telefone
                      </label>
                      <input
                        name="phone"
                        value={branchForm.phone || ''}
                        onChange={handleBranchChange}
                        onKeyDown={handleBranchKeyDown}
                        placeholder="(00) 00000-0000"
                        className="w-full p-2.5 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-600 shadow-xs"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
                        E-mail
                      </label>
                      <input
                        name="email"
                        value={branchForm.email || ''}
                        onChange={handleBranchChange}
                        onKeyDown={handleBranchKeyDown}
                        type="email"
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        data-no-uppercase="true"
                        placeholder="filial@empresa.com.br"
                        className="w-full p-2.5 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-600 shadow-xs normal-case"
                      />
                    </div>

                    <div className="space-y-1 md:col-span-2">
                      <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5 text-emerald-600" />
                        Modelo de Ordem de Carregamento da Filial
                      </label>
                      <select
                        name="loadingOrderModelId"
                        value={branchForm.loadingOrderModelId || ''}
                        onChange={handleBranchChange}
                        className="w-full p-2.5 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 text-sm font-medium text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-600 shadow-xs"
                      >
                        <option value="">Herdar da Matriz ({availableModels.find(m => m.id === client.loadingOrderModelId)?.nome || 'Padrão do Sistema'})</option>
                        {availableModels.map((model) => (
                          <option key={model.id} value={model.id}>
                            {model.nome} ({model.status.toUpperCase()})
                          </option>
                        ))}
                      </select>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400">
                        Opcional: deixe vazio para que esta filial utilize o mesmo modelo configurado na Matriz.
                      </p>
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setIsAddingBranch(false)}
                      className="px-3.5 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-700 dark:bg-gray-600 dark:hover:bg-gray-500 dark:text-gray-200 rounded-lg text-xs font-bold transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveBranch}
                      className="flex items-center gap-1 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-xs transition-colors"
                    >
                      <Check className="w-3.5 h-3.5" />
                      {editingBranchId ? 'Atualizar Filial' : 'Salvar Filial'}
                    </button>
                  </div>
                </div>
              )}

              {/* Branches List */}
              <div className="space-y-3">
                {/* Matriz reference card */}
                <div className="p-4 bg-blue-50/40 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-xl flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-100 dark:bg-blue-800 text-blue-700 dark:text-blue-300 rounded-lg">
                      <Building2 className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-blue-700 dark:text-blue-400 uppercase tracking-wider">Matriz</span>
                        <span className="text-sm font-bold text-gray-900 dark:text-white">{client.nomeFantasia || client.razaoSocial || 'Matriz'}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-gray-600 dark:text-gray-300 mt-0.5">
                        <span className="font-mono">{client.cnpj || 'CNPJ não informado'}</span>
                        {(client.city || client.state) && (
                          <span className="flex items-center gap-1 text-gray-500">
                            <MapPin className="w-3 h-3" />
                            {client.city}{client.state ? ` - ${client.state}` : ''}
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex items-center gap-1.5">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-200">
                          <FileText className="w-3 h-3" />
                          Mod. Ordem: {availableModels.find(m => m.id === client.loadingOrderModelId)?.nome || 'Padrão do Sistema'}
                        </span>
                      </div>
                    </div>
                  </div>
                  <span className="text-[11px] font-semibold px-2 py-0.5 bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 rounded-md">
                    CNPJ Principal
                  </span>
                </div>

                {/* Secondary branches */}
                {(!client.secondaryCnpjs || client.secondaryCnpjs.length === 0) ? (
                  <div className="text-center py-8 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl">
                    <Building2 className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
                      Nenhuma filial ou CNPJ secundário vinculado ainda.
                    </p>
                    <button
                      type="button"
                      onClick={handleStartAddBranch}
                      className="mt-3 text-xs font-bold text-primary hover:underline inline-flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Clique aqui para adicionar a primeira filial
                    </button>
                  </div>
                ) : (
                  client.secondaryCnpjs.map((branch, idx) => (
                    <div
                      key={branch.id || idx}
                      className="p-4 bg-white dark:bg-gray-750 border border-gray-200 dark:border-gray-650 rounded-xl flex items-center justify-between shadow-xs hover:border-gray-300 dark:hover:border-gray-550 transition-all"
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-lg">
                          <Building2 className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Filial #{idx + 1}</span>
                            <span className="text-sm font-bold text-gray-900 dark:text-white">{branch.nomeFantasia || branch.razaoSocial || `Filial ${idx + 1}`}</span>
                          </div>
                          <div className="flex flex-wrap items-center gap-3 text-xs text-gray-600 dark:text-gray-300 mt-0.5">
                            <span className="font-mono font-medium text-primary dark:text-primary-light">{branch.cnpj}</span>
                            {(branch.city || branch.state) && (
                              <span className="flex items-center gap-1 text-gray-500">
                                <MapPin className="w-3 h-3" />
                                {branch.city}{branch.state ? ` - ${branch.state}` : ''}
                              </span>
                            )}
                            {branch.phone && (
                              <span className="flex items-center gap-1 text-gray-500">
                                <Phone className="w-3 h-3" />
                                {branch.phone}
                              </span>
                            )}
                          </div>
                          <div className="mt-1 flex items-center gap-1.5">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                              <FileText className="w-3 h-3" />
                              Mod. Ordem: {branch.loadingOrderModelId ? (availableModels.find(m => m.id === branch.loadingOrderModelId)?.nome || branch.loadingOrderModelId) : `Herdado (${availableModels.find(m => m.id === client.loadingOrderModelId)?.nome || 'Padrão'})`}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleStartEditBranch(branch)}
                          className="p-1.5 text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                          title="Editar Filial"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveBranch(branch.id)}
                          className="p-1.5 text-gray-500 hover:text-red-600 dark:hover:text-red-400 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                          title="Remover Filial"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Footer Actions */}
          <div className="pt-4 border-t border-gray-100 dark:border-gray-700 flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="py-2 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-sm font-semibold dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="py-2 px-5 bg-primary hover:bg-primary-dark text-white rounded-xl text-sm font-bold shadow-xs transition-colors"
            >
              Salvar Cadastro Completo
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ClientFormModal;
