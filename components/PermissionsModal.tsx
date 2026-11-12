import React, { useState, useEffect } from 'react';
import type { ProfilePermissions, Page, CrudPermissions, User } from '../types';
import { UserProfile } from '../types';
import { isDemoUser, isDeveloperUser, isAdminUser, filterVisibleUsers } from '../auth';
import { Copy, RotateCcw } from 'lucide-react';

interface PermissionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveProfilePermissions: (permissions: ProfilePermissions) => void;
  onSaveUserPermissions: (userId: string, customPermissions: { [key in Page]?: CrudPermissions }) => void;
  permissions: ProfilePermissions;
  users: User[];
  currentUser?: User | null;
}

const PAGE_NAMES: Record<Page, string> = {
  'dashboard': 'Dashboard',
  'clients': 'Clientes',
  'owners': 'Proprietários',
  'embarcadores': 'Embarcadores',
  'drivers': 'Motoristas',
  'vehicles': 'Veículos',
  'loads': 'Cargas (Cadastro)',
  'locations': 'Expedidor/Recebedor',
  'products': 'Produtos',
  'shipments': 'Embarques',
  'shipment-history': 'Histórico de Embarques',
  'load-history': 'Histórico de Cargas',
  'financial': 'Financeiro',
  'reports': 'Relatórios',
  'operational-loads': 'Cargas (Operacional)',
  'operational-map': 'Mapa Operacional',
  'users-register': 'Gerenciar Usuários',
  'corporate-email': 'E-mail Corporativo',
  'commissions': 'Comissões',
  'appearance': 'Aparência',
  'layover-calculator': 'Cálculo de Estadias',
  'freight-quote': 'Cotação de Frete',
  'atua-reconciliation': 'Auditoria Atua TMS',
  'ai-assistant': 'Assistente de IA',
  'tools-history': 'Histórico de Ferramentas',
  'freight-offers-history': 'Histórico de Ofertas',
  'branches': 'Filiais',
  'system-monitor': 'Monitoramento do Sistema',
  'risk-management': 'Gerenciadora de Risco',
  'risk-query-types': 'Tipos de Consulta GR',
  'whatsapp': 'WhatsApp',
  'messenger': 'Mensageiro',
  'apresentacao': 'Apresentação Comercial',
  'apresentacao-comercial': 'Apresentação Comercial (Completa)',
  'site': 'Website Institucional',
  'website': 'Website Institucional (transcunhaoficial.com.br)',
};

const CATEGORIES = [
  { name: 'Painel Principal', pages: ['dashboard'] as Page[] },
  { name: 'Operacional', pages: ['loads', 'shipments', 'operational-map', 'shipment-history', 'load-history', 'operational-loads', 'risk-management'] as Page[] },
  { name: 'Financeiro', pages: ['financial', 'commissions'] as Page[] },
  { name: 'Relatórios', pages: ['reports'] as Page[] },
  { name: 'Cadastros', pages: ['clients', 'owners', 'embarcadores', 'drivers', 'vehicles', 'locations', 'products', 'users-register', 'branches', 'risk-query-types'] as Page[] },
  { name: 'Configurações', pages: ['appearance'] as Page[] },
  { name: 'Ferramentas', pages: ['layover-calculator', 'freight-quote', 'atua-reconciliation', 'ai-assistant', 'freight-offers-history', 'tools-history', 'system-monitor', 'messenger'] as Page[] }
];

const READ_ONLY_PAGES = [
  'dashboard', 'reports', 'appearance', 'ai-assistant', 
  'operational-map', 'shipment-history', 'load-history', 
  'tools-history', 'freight-offers-history', 'system-monitor'
] as Page[];

const PERMISSION_NAMES: Record<keyof CrudPermissions, string> = {
  read: 'Acessar',
  create: 'Criar',
  update: 'Editar',
  delete: 'Excluir',
};

const PermissionsModal: React.FC<PermissionsModalProps> = ({ 
  isOpen, onClose, onSaveProfilePermissions, onSaveUserPermissions, permissions, users, currentUser 
}) => {
  const [mode, setMode] = useState<'profile' | 'user'>('profile');
  
  const [editableProfilePermissions, setEditableProfilePermissions] = useState<ProfilePermissions>({});
  const [selectedProfile, setSelectedProfile] = useState<UserProfile>(UserProfile.Comercial);

  const [editableUserPermissions, setEditableUserPermissions] = useState<{ [key in Page]?: CrudPermissions }>({});
  const [selectedUserId, setSelectedUserId] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      setEditableProfilePermissions(JSON.parse(JSON.stringify(permissions)));
      const firstNonAdminUser = filterVisibleUsers(users, currentUser).find(u => u.profile !== UserProfile.Admin && !isDeveloperUser(u) && (isAdminUser(currentUser) || !isDemoUser(u)));
      if (firstNonAdminUser) setSelectedUserId(firstNonAdminUser.id);
    }
  }, [permissions, isOpen, users]);

  useEffect(() => {
    if (mode === 'user' && selectedUserId) {
      const user = users.find(u => u.id === selectedUserId);
      if (user) {
        if (user.customPermissions) {
          setEditableUserPermissions(JSON.parse(JSON.stringify(user.customPermissions)));
        } else {
          // If no custom permissions, populate with their profile's permissions as a starting point
          const profilePerms = permissions[user.profile] || {};
          setEditableUserPermissions(JSON.parse(JSON.stringify(profilePerms)));
        }
      }
    }
  }, [selectedUserId, mode, users, permissions]);

  const handleProfileCheckboxChange = (page: Page, action: keyof CrudPermissions) => {
    setEditableProfilePermissions(prev => {
      const newPermissions = { ...prev };
      const currentProfile = { ...(newPermissions[selectedProfile] || {}) };
      const newPageState = { ...(currentProfile[page] || { read: false, create: false, update: false, delete: false }) };
      
      newPageState[action] = !newPageState[action];

      if (action === 'read' && !newPageState.read) {
        newPageState.create = false;
        newPageState.update = false;
        newPageState.delete = false;
      }
      
      if (action !== 'read' && newPageState[action]) {
        newPageState.read = true;
      }

      currentProfile[page] = newPageState;
      newPermissions[selectedProfile] = currentProfile;
      return newPermissions;
    });
  };

  const handleUserCheckboxChange = (page: Page, action: keyof CrudPermissions) => {
    setEditableUserPermissions(prev => {
      const newPermissions = { ...prev };
      const newPageState = { ...(newPermissions[page] || { read: false, create: false, update: false, delete: false }) };
      
      newPageState[action] = !newPageState[action];

      if (action === 'read' && !newPageState.read) {
        newPageState.create = false;
        newPageState.update = false;
        newPageState.delete = false;
      }
      
      if (action !== 'read' && newPageState[action]) {
        newPageState.read = true;
      }

      newPermissions[page] = newPageState;
      return newPermissions;
    });
  };

  const handleSelectAllCategory = (categoryPages: Page[], value: boolean) => {
    if (mode === 'profile') {
      setEditableProfilePermissions(prev => {
        const newPermissions = { ...prev };
        const currentProfile = { ...(newPermissions[selectedProfile] || {}) };
        
        categoryPages.forEach(page => {
          const isReadOnly = READ_ONLY_PAGES.includes(page);
          currentProfile[page] = {
            read: value,
            create: isReadOnly ? false : value,
            update: isReadOnly ? false : value,
            delete: isReadOnly ? false : value
          };
        });
        
        newPermissions[selectedProfile] = currentProfile;
        return newPermissions;
      });
    } else {
      setEditableUserPermissions(prev => {
        const newPermissions = { ...prev };
        categoryPages.forEach(page => {
          const isReadOnly = READ_ONLY_PAGES.includes(page);
          newPermissions[page] = {
            read: value,
            create: isReadOnly ? false : value,
            update: isReadOnly ? false : value,
            delete: isReadOnly ? false : value
          };
        });
        return newPermissions;
      });
    }
  };

  const handleMirrorUserPermissions = (sourceUserId: string) => {
    if (!sourceUserId) return;
    const sourceUser = users.find(u => u.id === sourceUserId);
    if (!sourceUser) return;

    if (sourceUser.customPermissions && Object.keys(sourceUser.customPermissions).length > 0) {
      setEditableUserPermissions(JSON.parse(JSON.stringify(sourceUser.customPermissions)));
    } else {
      const sourceProfilePerms = permissions[sourceUser.profile] || {};
      setEditableUserPermissions(JSON.parse(JSON.stringify(sourceProfilePerms)));
    }
  };

  const handleSave = () => {
    if (mode === 'profile') {
      onSaveProfilePermissions(editableProfilePermissions);
    } else {
      if (selectedUserId) {
        onSaveUserPermissions(selectedUserId, editableUserPermissions);
      }
    }
    onClose();
  };

  if (!isOpen) return null;

  const isDev = isDeveloperUser(currentUser);
  const isAdmin = isAdminUser(currentUser);
  const availableProfiles = Object.values(UserProfile).filter(p => p !== UserProfile.Admin && (isDev || p !== UserProfile.Desenvolvedor) && (isDev || isAdmin || p !== UserProfile.Demonstracao));
  const availableUsers = filterVisibleUsers(users, currentUser).filter(u => u.profile !== UserProfile.Admin && !isDeveloperUser(u) && (isAdmin || !isDemoUser(u)));

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-5xl w-full h-[90vh] flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="px-6 py-4 border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex justify-between items-center">
          <h2 className="text-xl font-bold text-gray-800 dark:text-white">Gerenciar Permissões</h2>
          
          <div className="flex bg-gray-200 dark:bg-gray-700 rounded-lg p-1">
            <button
              onClick={() => setMode('profile')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${mode === 'profile' ? 'bg-white dark:bg-gray-600 shadow text-primary dark:text-white' : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'}`}
            >
              Por Perfil
            </button>
            <button
              onClick={() => setMode('user')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${mode === 'user' ? 'bg-white dark:bg-gray-600 shadow text-primary dark:text-white' : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'}`}
            >
              Por Usuário Específico
            </button>
          </div>
        </div>
        
        {/* Selector */}
        <div className="p-6 bg-white dark:bg-gray-800 border-b dark:border-gray-700">
          {mode === 'profile' ? (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Selecione o perfil:</label>
              <select
                value={selectedProfile}
                onChange={(e) => setSelectedProfile(e.target.value as UserProfile)}
                className="w-full md:w-1/3 pl-3 pr-10 py-2 border-gray-300 focus:outline-none focus:ring-primary focus:border-primary sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              >
                {availableProfiles.map(profile => (
                  <option key={profile} value={profile}>{profile}</option>
                ))}
              </select>
            </div>
          ) : (
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Selecione o usuário para configurar:</label>
                <select
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                  className="w-full pl-3 pr-10 py-2 border-gray-300 focus:outline-none focus:ring-primary focus:border-primary sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                >
                  {availableUsers.map(user => (
                    <option key={user.id} value={user.id}>{user.name} ({user.profile})</option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  As permissões definidas aqui sobrescrevem as regras do perfil do usuário.
                </p>
              </div>

              <div className="w-full md:w-auto p-3 bg-blue-50 dark:bg-blue-950/40 rounded-lg border border-blue-200 dark:border-blue-800">
                <label className="block text-xs font-bold text-blue-900 dark:text-blue-200 mb-1 flex items-center gap-1">
                  <Copy className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                  Espelhar Acessos de Outro Usuário:
                </label>
                <select
                  onChange={(e) => {
                    handleMirrorUserPermissions(e.target.value);
                    e.target.value = '';
                  }}
                  className="w-full pl-2.5 pr-8 py-1.5 text-xs border border-blue-300 dark:border-blue-700 rounded bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 cursor-pointer"
                  defaultValue=""
                >
                  <option value="" disabled>Selecione um usuário para espelhar...</option>
                  {availableUsers
                    .filter(u => u.id !== selectedUserId)
                    .map(u => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({u.profile})
                      </option>
                    ))
                  }
                </select>
              </div>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-gray-50 dark:bg-gray-900 space-y-6">
          {CATEGORIES.map(category => (
            <div key={category.name} className="bg-white dark:bg-gray-800 rounded-lg shadow border dark:border-gray-700 overflow-hidden">
              
              <div className="bg-gray-100 dark:bg-gray-700 px-4 py-3 flex justify-between items-center border-b dark:border-gray-600">
                <h3 className="font-bold text-gray-800 dark:text-white">{category.name}</h3>
                <div className="space-x-2">
                  <button onClick={() => handleSelectAllCategory(category.pages, true)} className="text-xs text-primary hover:text-primary-dark font-medium">
                    Marcar Todos
                  </button>
                  <span className="text-gray-300 dark:text-gray-500">|</span>
                  <button onClick={() => handleSelectAllCategory(category.pages, false)} className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 font-medium">
                    Desmarcar Todos
                  </button>
                </div>
              </div>

              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-800">
                  <tr>
                    <th scope="col" className="px-6 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 tracking-wider w-1/3">Página</th>
                    {(Object.keys(PERMISSION_NAMES) as (keyof CrudPermissions)[]).map(action => (
                      <th key={action} scope="col" className="px-2 py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-400 tracking-wider">
                        {PERMISSION_NAMES[action]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {category.pages.map(page => {
                    const isReadOnly = READ_ONLY_PAGES.includes(page);
                    
                    let pagePerms = { read: false, create: false, update: false, delete: false };
                    if (mode === 'profile') {
                       pagePerms = editableProfilePermissions[selectedProfile]?.[page] || pagePerms;
                    } else {
                       pagePerms = editableUserPermissions[page] || pagePerms;
                    }

                    return (
                      <tr key={page} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                        <td className="px-6 py-3 text-sm font-medium text-gray-900 dark:text-gray-200">
                          {PAGE_NAMES[page] || page}
                          {isReadOnly && <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">Somente Leitura</span>}
                        </td>
                        {(Object.keys(PERMISSION_NAMES) as (keyof CrudPermissions)[]).map(action => (
                          <td key={action} className="px-2 py-3 text-center">
                            {(isReadOnly && action !== 'read') ? (
                              <span className="text-gray-300 dark:text-gray-600">-</span>
                            ) : (
                              <input
                                type="checkbox"
                                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary dark:bg-gray-600 dark:border-gray-500 cursor-pointer"
                                checked={pagePerms[action]}
                                onChange={() => mode === 'profile' ? handleProfileCheckboxChange(page, action) : handleUserCheckboxChange(page, action)}
                              />
                            )}
                          </td>
                        ))}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ))}
        </div>
        
        {/* Footer */}
        <div className="p-4 border-t dark:border-gray-700 bg-white dark:bg-gray-800 flex justify-end space-x-3">
          <button type="button" onClick={onClose} className="px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600 dark:hover:bg-gray-600">
            Cancelar
          </button>
          <button type="button" onClick={handleSave} className="px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-primary hover:bg-primary-dark">
            {mode === 'profile' ? 'Salvar Permissões do Perfil' : 'Salvar Permissões do Usuário'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PermissionsModal;