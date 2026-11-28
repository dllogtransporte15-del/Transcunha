
import React, { useState, useMemo } from 'react';
import Header from '../components/Header';
import UserTable from '../components/UserTable';
import UserFilter, { UserFilters } from '../components/UserFilter';
import UserFormModal from '../components/UserFormModal';
import PermissionsModal from '../components/PermissionsModal';
import UserAccessViewerModal from '../components/UserAccessViewerModal';
import type { 
  User, ProfilePermissions, Client, Branch, Cargo, Shipment, Owner, 
  Driver, Vehicle, Product, FreightOffer, RiskQueryOption, Ticket 
} from '../types';
import { UserProfile } from '../types';
import { can, isDeveloperUser, filterVisibleUsers, filterVisibleProfiles } from '../auth';
import { useToast } from '../hooks/useToast';
import { Building2, Globe, Truck, Users, Mail } from 'lucide-react';

export type UserTabType = 'internal' | 'external_clients' | 'external_drivers' | 'all';

interface UsersPageProps {
  users: User[];
  setUsers: React.Dispatch<React.SetStateAction<User[]>>;
  onSaveUser: (userData: User | Omit<User, 'id'>) => void;
  currentUser: User;
  profilePermissions: ProfilePermissions;
  onSavePermissions: (permissions: ProfilePermissions) => void;
  clients: Client[];
  onDeleteUser: (userId: string) => void;
  branches: Branch[];
  cargos?: Cargo[];
  shipments?: Shipment[];
  owners?: Owner[];
  drivers?: Driver[];
  vehicles?: Vehicle[];
  products?: Product[];
  freightOffers?: FreightOffer[];
  stays?: any[];
  tickets?: Ticket[];
  riskQueryOptions?: RiskQueryOption[];
  companyLogo?: string | null;
}

export const isExternalUserProfile = (profile?: UserProfile | string): boolean => {
  return profile === UserProfile.Cliente || profile === UserProfile.Motorista;
};

const UsersPage: React.FC<UsersPageProps> = ({ 
  users, 
  setUsers, 
  onSaveUser, 
  currentUser, 
  profilePermissions, 
  onSavePermissions, 
  clients, 
  onDeleteUser, 
  branches,
  cargos = [],
  shipments = [],
  owners = [],
  drivers = [],
  vehicles = [],
  products = [],
  freightOffers = [],
  stays = [],
  tickets = [],
  riskQueryOptions = [],
  companyLogo = null
}) => {
  const [activeTab, setActiveTab] = useState<UserTabType>('internal');
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [isPermissionsModalOpen, setIsPermissionsModalOpen] = useState(false);
  const [userToEdit, setUserToEdit] = useState<User | null>(null);
  const [userToInspect, setUserToInspect] = useState<User | null>(null);
  const [filters, setFilters] = useState<UserFilters>({
    id: '',
    name: '',
    profile: '',
    status: '',
  });

  const isDev = isDeveloperUser(currentUser);
  const isAdmin = currentUser.profile === UserProfile.Admin || currentUser.profile === UserProfile.GerenciadoraDeRisco || isDev;

  const canCreateUser = can('create', currentUser, 'users-register', profilePermissions);
  const canUpdateUser = can('update', currentUser, 'users-register', profilePermissions);
  const canDeleteUser = can('delete', currentUser, 'users-register', profilePermissions);

  const visibleUsersList = useMemo(() => {
    return filterVisibleUsers(users, currentUser);
  }, [users, currentUser]);

  const internalCount = useMemo(() => visibleUsersList.filter(u => u.profile !== UserProfile.Cliente && u.profile !== UserProfile.Motorista).length, [visibleUsersList]);
  const externalClientsCount = useMemo(() => visibleUsersList.filter(u => u.profile === UserProfile.Cliente).length, [visibleUsersList]);
  const externalDriversCount = useMemo(() => visibleUsersList.filter(u => u.profile === UserProfile.Motorista).length, [visibleUsersList]);
  const allCount = visibleUsersList.length;

  const availableProfiles = useMemo(() => {
    let base: UserProfile[];
    if (activeTab === 'internal') {
      base = Object.values(UserProfile).filter(p => p !== UserProfile.Cliente && p !== UserProfile.Motorista);
    } else if (activeTab === 'external_clients') {
      base = [UserProfile.Cliente];
    } else if (activeTab === 'external_drivers') {
      base = [UserProfile.Motorista];
    } else {
      base = Object.values(UserProfile);
    }
    return filterVisibleProfiles(base, currentUser);
  }, [activeTab, currentUser]);

  const handleTabChange = (tab: UserTabType) => {
    setActiveTab(tab);
    if (filters.profile) {
      if (tab === 'internal' && isExternalUserProfile(filters.profile as UserProfile)) {
        setFilters(prev => ({ ...prev, profile: '' }));
      } else if (tab === 'external_clients' && filters.profile !== UserProfile.Cliente) {
        setFilters(prev => ({ ...prev, profile: '' }));
      } else if (tab === 'external_drivers' && filters.profile !== UserProfile.Motorista) {
        setFilters(prev => ({ ...prev, profile: '' }));
      }
    }
  };

  const filteredUsers = useMemo(() => {
    return visibleUsersList.filter(user => {
      // Category Tab Filter
      if (activeTab === 'internal' && isExternalUserProfile(user.profile)) return false;
      if (activeTab === 'external_clients' && user.profile !== UserProfile.Cliente) return false;
      if (activeTab === 'external_drivers' && user.profile !== UserProfile.Motorista) return false;

      // Inputs & Dropdown Filters
      const idMatch = !filters.id || (user.id && user.id.toLowerCase().includes(filters.id.toLowerCase()));
      const nameMatch = !filters.name || (user.name && user.name.toLowerCase().includes(filters.name.toLowerCase()));
      const profileMatch = !filters.profile || user.profile === filters.profile;
      const statusMatch = !filters.status || (filters.status === 'active' ? user.active === true : user.active === false);
      const branchMatch = !filters.branchId || (filters.branchId === 'none' ? !user.branchId : (user.branchId === filters.branchId || (user as any).filialId === filters.branchId));

      return idMatch && nameMatch && profileMatch && statusMatch && branchMatch;
    });
  }, [visibleUsersList, filters, activeTab]);

  const { showToast } = useToast();

  const handleOpenUserModal = () => {
    setUserToEdit(null);
    setIsUserModalOpen(true);
  };
  const handleCloseUserModal = () => setIsUserModalOpen(false);
  const handleEditUser = (user: User) => {
    setUserToEdit(user);
    setIsUserModalOpen(true);
  };
  const handleDeleteUser = (userId: string) => {
    onDeleteUser(userId);
  };
  const handleSaveUser = (user: User | Omit<User, 'id'>) => {
    onSaveUser(user);
    handleCloseUserModal();
  };

  const handleToggleDriverRequests = (user: User) => {
    const newStatus = user.availableForDriverRequests === false ? true : false;
    onSaveUser({
      ...user,
      availableForDriverRequests: newStatus,
    });
    showToast(
      newStatus 
        ? `${user.name} agora está visível no App para receber direcionamento de cargas!`
        : `${user.name} foi ocultado do App e não receberá direcionamento direto de motoristas.`,
      newStatus ? 'success' : 'info'
    );
  };

  const defaultProfileForNewUser = activeTab === 'external_drivers' ? UserProfile.Motorista : (activeTab === 'external_clients' ? UserProfile.Cliente : UserProfile.Comercial);
  const addUserButtonLabel = activeTab === 'external_drivers' ? 'Adicionar Motorista' : (activeTab === 'external_clients' ? 'Adicionar Cliente' : 'Adicionar Usuário');

  return (
    <>
      <Header title="Gerenciar Usuários">
          {canUpdateUser && (
              <button
                  onClick={() => setIsPermissionsModalOpen(true)}
                  className="px-4 py-2 bg-secondary text-white rounded-lg hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 font-medium text-sm transition-colors cursor-pointer"
              >
                  Gerenciar Permissões
              </button>
          )}
          {canCreateUser && (
              <button
                  onClick={handleOpenUserModal}
                  className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary font-medium text-sm transition-colors"
              >
                  {addUserButtonLabel}
              </button>
          )}
      </Header>

      {/* Tabs: Usuários Internos vs Usuários Externos (Clientes) vs Usuários Externos (Motoristas) vs Todos */}
      <div className="mb-6 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 rounded-t-lg px-4 shadow-sm overflow-x-auto">
        <nav className="-mb-px flex space-x-4 sm:space-x-8" aria-label="Tabs">
          <button
            onClick={() => handleTabChange('internal')}
            className={`whitespace-nowrap flex items-center py-4 px-2 border-b-2 font-medium text-sm transition-all duration-200 ${
              activeTab === 'internal'
                ? 'border-primary text-primary dark:border-blue-400 dark:text-blue-400 font-bold'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            <Building2 className="w-4 h-4 mr-2" />
            <span>Usuários Internos</span>
            <span className={`ml-2 px-2.5 py-0.5 text-xs rounded-full font-bold transition-colors ${
              activeTab === 'internal'
                ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-200'
                : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
            }`}>
              {internalCount}
            </span>
          </button>

          <button
            onClick={() => handleTabChange('external_clients')}
            className={`whitespace-nowrap flex items-center py-4 px-2 border-b-2 font-medium text-sm transition-all duration-200 ${
              activeTab === 'external_clients'
                ? 'border-primary text-primary dark:border-blue-400 dark:text-blue-400 font-bold'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            <Globe className="w-4 h-4 mr-2" />
            <span>Usuários Externos (Clientes)</span>
            <span className={`ml-2 px-2.5 py-0.5 text-xs rounded-full font-bold transition-colors ${
              activeTab === 'external_clients'
                ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-200'
                : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
            }`}>
              {externalClientsCount}
            </span>
          </button>

          <button
            onClick={() => handleTabChange('external_drivers')}
            className={`whitespace-nowrap flex items-center py-4 px-2 border-b-2 font-medium text-sm transition-all duration-200 ${
              activeTab === 'external_drivers'
                ? 'border-primary text-primary dark:border-blue-400 dark:text-blue-400 font-bold'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            <Truck className="w-4 h-4 mr-2" />
            <span>Usuários Externos (Motoristas)</span>
            <span className={`ml-2 px-2.5 py-0.5 text-xs rounded-full font-bold transition-colors ${
              activeTab === 'external_drivers'
                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200'
                : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
            }`}>
              {externalDriversCount}
            </span>
          </button>

          <button
            onClick={() => handleTabChange('all')}
            className={`whitespace-nowrap flex items-center py-4 px-2 border-b-2 font-medium text-sm transition-all duration-200 ${
              activeTab === 'all'
                ? 'border-primary text-primary dark:border-blue-400 dark:text-blue-400 font-bold'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            <Users className="w-4 h-4 mr-2" />
            <span>Todos</span>
            <span className={`ml-2 px-2.5 py-0.5 text-xs rounded-full font-bold transition-colors ${
              activeTab === 'all'
                ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-200'
                : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
            }`}>
              {allCount}
            </span>
          </button>
        </nav>
      </div>

      <UserFilter 
        filters={filters} 
        onFilterChange={setFilters} 
        availableProfiles={availableProfiles}
        branches={branches}
        currentUser={currentUser}
      />

      <UserTable 
        users={filteredUsers} 
        allUsers={visibleUsersList}
        currentUser={currentUser}
        onEdit={canUpdateUser ? handleEditUser : undefined} 
        onDelete={canDeleteUser ? handleDeleteUser : undefined}
        onInspectUser={isAdmin ? (user) => setUserToInspect(user) : undefined}
        clients={clients}
        branches={branches}
        showAppOptionColumn={activeTab === 'internal' || activeTab === 'all'}
        onToggleDriverRequests={canUpdateUser ? handleToggleDriverRequests : undefined}
      />

      <UserFormModal
        isOpen={isUserModalOpen}
        onClose={handleCloseUserModal}
        onSave={handleSaveUser}
        userToEdit={userToEdit}
        clients={clients}
        branches={branches}
        users={visibleUsersList}
        defaultProfile={defaultProfileForNewUser}
        availableProfiles={availableProfiles}
        currentUser={currentUser}
      />
      
      <PermissionsModal
        isOpen={isPermissionsModalOpen}
        onClose={() => setIsPermissionsModalOpen(false)}
        onSaveProfilePermissions={onSavePermissions}
        onSaveUserPermissions={(userId, customPermissions) => {
          const user = visibleUsersList.find(u => u.id === userId);
          if (user) {
            onSaveUser({ ...user, customPermissions });
          }
        }}
        permissions={profilePermissions}
        users={visibleUsersList}
        currentUser={currentUser}
      />

      <UserAccessViewerModal
        isOpen={Boolean(userToInspect)}
        onClose={() => setUserToInspect(null)}
        targetUser={userToInspect}
        currentUser={currentUser}
        profilePermissions={profilePermissions}
        onSaveUserPermissions={(userId, customPermissions) => {
          const user = visibleUsersList.find(u => u.id === userId);
          if (user) {
            const updatedUser = { ...user, customPermissions };
            onSaveUser(updatedUser);
            setUserToInspect(updatedUser);
          }
        }}
        cargos={cargos}
        shipments={shipments}
        clients={clients}
        owners={owners}
        drivers={drivers}
        vehicles={vehicles}
        products={products}
        branches={branches}
        users={visibleUsersList}
        freightOffers={freightOffers}
        stays={stays}
        tickets={tickets}
        riskQueryOptions={riskQueryOptions}
        companyLogo={companyLogo}
      />
    </>
  );
};

export default UsersPage;