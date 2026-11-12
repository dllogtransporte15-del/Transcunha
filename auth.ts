
import type { User, Page, ProfilePermissions, CrudPermissions } from './types';
import { UserProfile } from './types';

const allPages: Page[] = ['dashboard', 'clients', 'owners', 'embarcadores', 'drivers', 'vehicles', 'loads', 'locations', 'products', 'shipments', 'financial', 'reports', 'operational-loads', 'operational-map', 'users-register', 'corporate-email', 'commissions', 'appearance', 'shipment-history', 'load-history', 'layover-calculator', 'freight-quote', 'atua-reconciliation', 'ai-assistant', 'tools-history', 'branches', 'system-monitor', 'freight-offers-history', 'risk-management', 'risk-query-types', 'whatsapp', 'messenger'];

const createPermissions = (pages: Page[], readOnly = false): { [key in Page]?: CrudPermissions } => {
  const permissions: { [key in Page]?: CrudPermissions } = {};
  for (const page of allPages) {
    const canAccess = pages.includes(page);
    permissions[page] = {
      read: canAccess,
      create: canAccess && !readOnly,
      update: canAccess && !readOnly,
      delete: canAccess && !readOnly,
    };
  }
  return permissions;
};

const createPermissionsWithoutDelete = (pages: Page[]): { [key in Page]?: CrudPermissions } => {
  const permissions: { [key in Page]?: CrudPermissions } = {};
  for (const page of allPages) {
    const canAccess = pages.includes(page);
    permissions[page] = {
      read: canAccess,
      create: canAccess,
      update: canAccess,
      delete: false,
    };
  }
  return permissions;
};

const supervisorAndDiretorPages = allPages.filter(p => p !== 'appearance');
const gerenciadoraDeRiscoPages = allPages.filter(p => p !== 'financial' && p !== 'reports');

export const INITIAL_PERMISSIONS: ProfilePermissions = {
  [UserProfile.Desenvolvedor]: createPermissions(allPages),
  [UserProfile.Admin]: createPermissions(allPages),
  [UserProfile.Comercial]: createPermissions(['dashboard', 'clients', 'owners', 'drivers', 'vehicles', 'loads', 'locations', 'shipments', 'reports', 'operational-loads', 'financial', 'operational-map', 'commissions', 'shipment-history', 'load-history', 'layover-calculator', 'freight-quote', 'atua-reconciliation', 'freight-offers-history', 'risk-management', 'risk-query-types', 'messenger']),
  [UserProfile.Fiscal]: createPermissions(['dashboard', 'shipments', 'reports', 'atua-reconciliation', 'shipment-history', 'load-history', 'risk-management', 'risk-query-types'], true),
  [UserProfile.Financeiro]: createPermissions(['dashboard', 'shipments', 'reports', 'financial', 'commissions', 'atua-reconciliation', 'shipment-history', 'load-history', 'risk-management', 'risk-query-types', 'messenger'], true),
  [UserProfile.Embarcador]: createPermissions(['dashboard', 'reports', 'operational-loads', 'shipments', 'operational-map', 'shipment-history', 'load-history', 'layover-calculator', 'risk-management'], true),
  [UserProfile.Agenciador]: createPermissions(['dashboard', 'reports', 'operational-loads', 'shipments', 'operational-map', 'shipment-history', 'load-history', 'layover-calculator', 'risk-management', 'clients', 'loads', 'locations', 'products', 'vehicles', 'drivers', 'embarcadores', 'freight-quote', 'messenger']),
  [UserProfile.Cliente]: createPermissions(['dashboard', 'loads', 'shipments', 'shipment-history', 'load-history', 'operational-loads', 'freight-offers-history', 'reports'], true),
  [UserProfile.Supervisor]: createPermissions(supervisorAndDiretorPages),
  [UserProfile.Diretor]: createPermissions(supervisorAndDiretorPages, true),
  [UserProfile.Motorista]: createPermissions(['operational-loads', 'shipment-history'], true),
  [UserProfile.GerenciadoraDeRisco]: createPermissionsWithoutDelete(gerenciadoraDeRiscoPages),
  [UserProfile.Demonstracao]: createPermissions(allPages, true),
};

if (INITIAL_PERMISSIONS[UserProfile.Fiscal] && INITIAL_PERMISSIONS[UserProfile.Fiscal]!['shipments']) {
    INITIAL_PERMISSIONS[UserProfile.Fiscal]!['shipments']!.delete = true;
}

// Specifically grant 'create' permission for 'shipments' to 'Embarcador' profile
if (INITIAL_PERMISSIONS[UserProfile.Embarcador] && INITIAL_PERMISSIONS[UserProfile.Embarcador]!['shipments']) {
    INITIAL_PERMISSIONS[UserProfile.Embarcador]!['shipments']!.create = true;
}

export const isDeveloperUser = (user: User | null | undefined): boolean => {
  if (!user) return false;
  return (
    user.profile === UserProfile.Desenvolvedor ||
    (user.profile as string) === 'Desenvolvedor' ||
    user.id === 'USR-001' ||
    Boolean(user.email && user.email.toLowerCase() === 'dllogtransporte15@gmail.com') ||
    Boolean(user.name && user.name.trim().toLowerCase() === 'desenvolvedor')
  );
};

export const isDemoUser = (user: User | null | undefined): boolean => {
  if (!user) return false;
  return (
    user.profile === UserProfile.Demonstracao ||
    (user.profile as string) === 'Demo' ||
    (user.profile as string) === 'Demonstração' ||
    user.id === 'USR-292' ||
    Boolean(user.email && user.email.toLowerCase() === 'demo@demo.com') ||
    Boolean(user.name && user.name.toUpperCase().includes('DEMONSTRA')) ||
    Boolean(user.name && user.name.trim().toUpperCase() === 'DEMO')
  );
};

export const isAdminUser = (user: User | null | undefined): boolean => {
  if (!user) return false;
  return (
    user.profile === UserProfile.Admin ||
    (user.profile as string) === 'Administrador do Sistema' ||
    isDeveloperUser(user)
  );
};

/**
 * Retorna true se o usuário for um colaborador/usuário interno da Transcunha
 * (qualquer perfil da equipe exceto clientes externos e motoristas).
 */
export const isInternalUser = (user: User | null | undefined): boolean => {
  if (!user) return false;
  return (
    isDeveloperUser(user) ||
    (
      user.profile !== UserProfile.Cliente &&
      (user.profile as string) !== 'Cliente' &&
      user.profile !== UserProfile.Motorista &&
      (user.profile as string) !== 'Motorista'
    )
  );
};

/**
 * Permissão de Desconciliação Bancária
 * Restrito rigorosamente a Administradores, Diretoria e Master
 */
export const canUnreconcileTransaction = (user: User | null | undefined): boolean => {
  if (!user) return false;
  return (
    isDeveloperUser(user) ||
    isAdminUser(user) ||
    user.profile === UserProfile.Diretor ||
    (user.profile as string) === 'Diretor' ||
    (user as any).role === 'admin' ||
    Boolean((user as any).is_master)
  );
};

export const filterVisibleUsers = (users: User[], viewer: User | null | undefined): User[] => {
  if (isDeveloperUser(viewer)) return users;
  const isAdmin = isAdminUser(viewer);
  return users.filter(u => {
    if (isDeveloperUser(u)) return false;
    if (isDemoUser(u) && !isAdmin) return false;
    return true;
  });
};

export const filterVisibleProfiles = (profiles: UserProfile[], viewer: User | null | undefined): UserProfile[] => {
  const isDev = isDeveloperUser(viewer);
  const isAdmin = isAdminUser(viewer);
  return profiles.filter(p => {
    if (p === UserProfile.Desenvolvedor) return isDev;
    if (p === UserProfile.Demonstracao) return isDev || isAdmin;
    return true;
  });
};

export const can = (
  action: keyof CrudPermissions,
  user: User | null,
  page: Page,
  permissions: ProfilePermissions
): boolean => {
  if (!user) return false;
  
  // Demonstracao / Demo user can ONLY read (all pages), never create, update or delete
  if (isDemoUser(user)) {
    return action === 'read';
  }

  // Desenvolvedor and Admin can do everything, always.
  if (isDeveloperUser(user) || user.profile === UserProfile.Admin) return true;

  // Gerenciadora de Risco: same functions and permissions as Admin,
  // EXCEPT: access to 'financial' and 'reports', and any 'delete' commands.
  const isGerenciadora = user.profile === UserProfile.GerenciadoraDeRisco ||
    (user.profile as string) === 'Gerenciadora de Risco' ||
    Boolean(user.name && (user.name.toLowerCase().includes('samanta') || user.name.toLowerCase().includes('samantha'))) ||
    Boolean(user.email && (user.email.toLowerCase().includes('samanta') || user.email.toLowerCase().includes('samantha')));

  if (isGerenciadora) {
    if (page === 'financial' || page === 'reports') return false;
    if (action === 'delete') return false;
    if (user.customPermissions && user.customPermissions[page]) {
      return Boolean(user.customPermissions[page]![action]);
    }
    return true;
  }

  // Explicitly block 'reports' for 'Fiscal' profile as requested, overriding DB
  if (user.profile === UserProfile.Fiscal && page === 'reports') return false;

  // Check User-specific custom permissions first
  if (user.customPermissions && user.customPermissions[page]) {
    return user.customPermissions[page]![action];
  }

  const userProfilePermissions = permissions[user.profile];
  const pagePermissions = userProfilePermissions?.[page] ?? INITIAL_PERMISSIONS[user.profile]?.[page];
  if (!pagePermissions) return false;

  return pagePermissions[action];
};

