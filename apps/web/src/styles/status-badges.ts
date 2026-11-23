import type { OrderStatus, StockMovementType, UserRole } from '@omni-ops/shared';

export type BadgeTone =
  | 'emerald'
  | 'amber'
  | 'rose'
  | 'indigo'
  | 'cyan'
  | 'purple'
  | 'teal'
  | 'zinc';

export type InventoryHealthStatus = 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';

export const INVENTORY_STATUS_TONE: Record<InventoryHealthStatus, BadgeTone> = {
  IN_STOCK: 'emerald',
  LOW_STOCK: 'amber',
  OUT_OF_STOCK: 'rose',
};

export const ORDER_STATUS_TONE: Record<OrderStatus, BadgeTone> = {
  PENDING: 'amber',
  CONFIRMED: 'indigo',
  SHIPPED: 'cyan',
  DELIVERED: 'emerald',
  CANCELLED: 'rose',
  REFUNDED: 'purple',
};

export const MOVEMENT_TYPE_TONE: Record<StockMovementType, BadgeTone> = {
  IN: 'emerald',
  TRANSFER_IN: 'emerald',
  OUT: 'rose',
  TRANSFER_OUT: 'rose',
  ADJUSTMENT: 'amber',
};

export const ROLE_BADGE_TONE: Record<UserRole, BadgeTone> = {
  ADMIN: 'indigo',
  EDITOR: 'teal',
  VIEWER: 'zinc',
};

export function getBadgeTokenStyles(tone: BadgeTone) {
  return {
    pill: {
      backgroundColor: `var(--status-${tone}-bg)`,
      color: `var(--status-${tone}-text)`,
    },
    dot: {
      backgroundColor: `var(--status-${tone}-dot)`,
    },
  } as const;
}
