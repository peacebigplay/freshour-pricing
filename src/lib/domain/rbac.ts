// Server-side RBAC — Freshour Master Prompt v2, Sections 7 and 28.
// A single source of truth for "can this role do this action" so UI and API
// routes can't disagree. Never trust a browser-side role claim.

export type Role = 'EXECUTIVE' | 'PRICING' | 'SALES' | 'ADMIN';

export type Action =
  | 'view_executive_dashboard'
  | 'record_executive_decision'
  | 'edit_factory_cost'
  | 'publish_selling_price'
  | 'approve_central_price'
  | 'approve_customer_price'
  | 'manage_margin_guard'
  | 'generate_quotation'
  | 'close_deal'
  | 'manage_users'
  | 'manage_integrations'
  | 'import_financial_fallback';

const ROLE_ACTIONS: Record<Role, ReadonlySet<Action>> = {
  EXECUTIVE: new Set<Action>(['view_executive_dashboard', 'record_executive_decision']),
  PRICING: new Set<Action>([
    'approve_central_price',
    'approve_customer_price',
    'manage_margin_guard',
  ]),
  SALES: new Set<Action>(['generate_quotation', 'close_deal']),
  ADMIN: new Set<Action>(['manage_users', 'manage_integrations', 'import_financial_fallback']),
};

export function can(role: Role, action: Action): boolean {
  return ROLE_ACTIONS[role]?.has(action) ?? false;
}

export class ForbiddenError extends Error {
  constructor(action: Action, role: Role) {
    super(`Role ${role} is not permitted to perform ${action}`);
    this.name = 'ForbiddenError';
  }
}

export function assertCan(role: Role, action: Action): void {
  if (!can(role, action)) {
    throw new ForbiddenError(action, role);
  }
}
