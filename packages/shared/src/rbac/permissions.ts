export const ROLES = {
  ADMIN: 'ADMIN',
  EDITOR: 'EDITOR',
  VIEWER: 'VIEWER',
} as const;

export type UserRole = (typeof ROLES)[keyof typeof ROLES];

export const PERMISSIONS = {
  // Read permissions
  ANALYTICS_READ: 'analytics:read',
  PRODUCTS_READ: 'products:read',
  INVENTORY_READ: 'inventory:read',
  ORDERS_READ: 'orders:read',
  CUSTOMERS_READ: 'customers:read',
  WAREHOUSES_READ: 'warehouses:read',

  // Operational write permissions
  PRODUCTS_WRITE: 'products:write',
  CUSTOMERS_WRITE: 'customers:write',
  ORDERS_WRITE: 'orders:write',
  INVENTORY_ADJUST: 'inventory:adjust',
  INVENTORY_TRANSFER: 'inventory:transfer',

  // Destructive / sensitive permissions (Admin only)
  PRODUCTS_DELETE: 'products:delete',
  CUSTOMERS_DELETE: 'customers:delete',
  ORDERS_CANCEL: 'orders:cancel',
  ORDERS_REFUND: 'orders:refund',

  // Reports & Exports
  REPORTS_EXPORT: 'reports:export',

  // Administration (Admin only)
  WAREHOUSES_MANAGE: 'warehouses:manage',
  USERS_MANAGE: 'users:manage',
  AUDIT_READ: 'audit:read',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

const VIEWER_PERMISSIONS: readonly Permission[] = [
  PERMISSIONS.ANALYTICS_READ,
  PERMISSIONS.PRODUCTS_READ,
  PERMISSIONS.INVENTORY_READ,
  PERMISSIONS.ORDERS_READ,
  PERMISSIONS.CUSTOMERS_READ,
  PERMISSIONS.WAREHOUSES_READ,
  PERMISSIONS.REPORTS_EXPORT,
];

const EDITOR_PERMISSIONS: readonly Permission[] = [
  ...VIEWER_PERMISSIONS,
  PERMISSIONS.PRODUCTS_WRITE,
  PERMISSIONS.CUSTOMERS_WRITE,
  PERMISSIONS.ORDERS_WRITE,
  PERMISSIONS.INVENTORY_ADJUST,
  PERMISSIONS.INVENTORY_TRANSFER,
];

const ADMIN_PERMISSIONS: readonly Permission[] = [
  ...EDITOR_PERMISSIONS,
  PERMISSIONS.PRODUCTS_DELETE,
  PERMISSIONS.CUSTOMERS_DELETE,
  PERMISSIONS.ORDERS_CANCEL,
  PERMISSIONS.ORDERS_REFUND,
  PERMISSIONS.WAREHOUSES_MANAGE,
  PERMISSIONS.USERS_MANAGE,
  PERMISSIONS.AUDIT_READ,
];

export const ROLE_PERMISSIONS: Record<UserRole, readonly Permission[]> = {
  [ROLES.VIEWER]: VIEWER_PERMISSIONS,
  [ROLES.EDITOR]: EDITOR_PERMISSIONS,
  [ROLES.ADMIN]: ADMIN_PERMISSIONS,
};

export function hasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function hasAllPermissions(role: UserRole, permissions: readonly Permission[]): boolean {
  const granted = ROLE_PERMISSIONS[role];
  return permissions.every((p) => granted.includes(p));
}

export function hasAnyPermission(role: UserRole, permissions: readonly Permission[]): boolean {
  const granted = ROLE_PERMISSIONS[role];
  return permissions.some((p) => granted.includes(p));
}
