export const ORDER_STATUSES = {
  PENDING: 'PENDING',
  CONFIRMED: 'CONFIRMED',
  SHIPPED: 'SHIPPED',
  DELIVERED: 'DELIVERED',
  CANCELLED: 'CANCELLED',
  REFUNDED: 'REFUNDED',
} as const;

export type OrderStatus = (typeof ORDER_STATUSES)[keyof typeof ORDER_STATUSES];

export const STOCK_MOVEMENT_TYPES = {
  IN: 'IN',
  OUT: 'OUT',
  ADJUSTMENT: 'ADJUSTMENT',
  TRANSFER_IN: 'TRANSFER_IN',
  TRANSFER_OUT: 'TRANSFER_OUT',
} as const;

export type StockMovementType = (typeof STOCK_MOVEMENT_TYPES)[keyof typeof STOCK_MOVEMENT_TYPES];

/**
 * Valid Order Lifecycle transitions:
 * - Creation (PENDING): increases `quantity_reserved` only.
 * - PENDING -> CONFIRMED: keeps `quantity_reserved` intact.
 * - CONFIRMED -> SHIPPED: deducts `quantity_reserved` AND `quantity_on_hand`, appends `OUT` stock movement.
 * - PENDING/CONFIRMED -> CANCELLED: releases `quantity_reserved` (requires cancellation reason).
 * - SHIPPED -> DELIVERED: marks order complete.
 * - DELIVERED -> REFUNDED: optional restock increases `quantity_on_hand` and appends `IN` stock movement.
 */
export const ALLOWED_ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  [ORDER_STATUSES.PENDING]: [ORDER_STATUSES.CONFIRMED, ORDER_STATUSES.CANCELLED],
  [ORDER_STATUSES.CONFIRMED]: [ORDER_STATUSES.SHIPPED, ORDER_STATUSES.CANCELLED],
  [ORDER_STATUSES.SHIPPED]: [ORDER_STATUSES.DELIVERED],
  [ORDER_STATUSES.DELIVERED]: [ORDER_STATUSES.REFUNDED],
  [ORDER_STATUSES.CANCELLED]: [],
  [ORDER_STATUSES.REFUNDED]: [],
};

export function canTransitionOrderStatus(from: OrderStatus, to: OrderStatus): boolean {
  return ALLOWED_ORDER_TRANSITIONS[from].includes(to);
}

export function requiresTransitionReason(to: OrderStatus): boolean {
  return to === ORDER_STATUSES.CANCELLED || to === ORDER_STATUSES.REFUNDED;
}
