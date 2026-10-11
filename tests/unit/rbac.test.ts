import { describe, expect, it } from 'vitest';
import { assertCan, can, ForbiddenError } from '@/lib/domain/rbac';

describe('RBAC', () => {
  it('PRICING can approve central and customer prices', () => {
    expect(can('PRICING', 'approve_central_price')).toBe(true);
    expect(can('PRICING', 'approve_customer_price')).toBe(true);
  });

  it('SALES cannot approve a new authoritative selling price (Section 7)', () => {
    expect(can('SALES', 'approve_central_price')).toBe(false);
    expect(can('SALES', 'approve_customer_price')).toBe(false);
  });

  it('SALES cannot edit factory cost', () => {
    expect(can('SALES', 'edit_factory_cost')).toBe(false);
  });

  it('EXECUTIVE cannot publish selling prices or edit cost', () => {
    expect(can('EXECUTIVE', 'publish_selling_price')).toBe(false);
    expect(can('EXECUTIVE', 'edit_factory_cost')).toBe(false);
  });

  it('only ADMIN manages users and integrations', () => {
    expect(can('ADMIN', 'manage_users')).toBe(true);
    expect(can('PRICING', 'manage_users')).toBe(false);
    expect(can('EXECUTIVE', 'manage_users')).toBe(false);
    expect(can('SALES', 'manage_users')).toBe(false);
  });

  it('assertCan throws ForbiddenError for a disallowed action', () => {
    expect(() => assertCan('SALES', 'manage_users')).toThrow(ForbiddenError);
  });

  it('assertCan does not throw for an allowed action', () => {
    expect(() => assertCan('SALES', 'close_deal')).not.toThrow();
  });
});
