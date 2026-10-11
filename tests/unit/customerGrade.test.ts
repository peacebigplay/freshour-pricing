import { describe, expect, it } from 'vitest';
import { computeCustomerGrade } from '@/lib/domain/customerGrade';

describe('computeCustomerGrade', () => {
  it('grades A when every line meets its category target', () => {
    expect(computeCustomerGrade(['ok', 'ok', 'ok'])).toBe('A');
  });

  it('grades B when some lines are thin but none are losses', () => {
    expect(computeCustomerGrade(['ok', 'ok', 'ok', 'ok', 'thin'])).toBe('B');
  });

  it('grades C when 30% or more of lines are thin but none are losses', () => {
    expect(computeCustomerGrade(['thin', 'thin', 'ok'])).toBe('C');
  });

  it('grades D when at least one line is a loss but under 30% of the book', () => {
    expect(computeCustomerGrade(['loss', 'ok', 'ok', 'ok', 'ok'])).toBe('D');
  });

  it('grades F when 30% or more of lines are losses', () => {
    expect(computeCustomerGrade(['loss', 'loss', 'ok'])).toBe('F');
  });

  it('defaults to C for a customer with no locked lines', () => {
    expect(computeCustomerGrade([])).toBe('C');
  });
});
