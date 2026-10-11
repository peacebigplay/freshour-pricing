import { describe, expect, it } from 'vitest';
import { countInternalFieldsOnPublicDto, toPublicQuoteLine, type InternalQuoteLine } from '@/lib/domain/publicQuoteDto';

const internalLine: InternalQuoteLine = {
  productId: 'p1',
  productName: 'หมูสันนอก',
  unit: 'กก.',
  offeredPrice: 150,
  currentCost: 100,
  marginPct: 33.3,
  targetMarginPct: 20,
  marginFloorPct: 12,
  competitorPrice: 140,
  supplierCostTarget: 95,
  internalNote: 'customer always negotiates 5%',
  matchConfidence: 0.92,
  sourceMetadata: { sourceRowNo: 42 },
};

describe('toPublicQuoteLine', () => {
  it('only exposes productName, unit, and price', () => {
    const dto = toPublicQuoteLine(internalLine);
    expect(Object.keys(dto).sort()).toEqual(['price', 'productName', 'unit']);
  });

  it('never leaks cost, margin, or internal metadata fields', () => {
    const dto = toPublicQuoteLine(internalLine) as unknown as Record<string, unknown>;
    expect(dto).not.toHaveProperty('currentCost');
    expect(dto).not.toHaveProperty('marginPct');
    expect(dto).not.toHaveProperty('targetMarginPct');
    expect(dto).not.toHaveProperty('marginFloorPct');
    expect(dto).not.toHaveProperty('competitorPrice');
    expect(dto).not.toHaveProperty('supplierCostTarget');
    expect(dto).not.toHaveProperty('internalNote');
    expect(dto).not.toHaveProperty('matchConfidence');
    expect(dto).not.toHaveProperty('sourceMetadata');
  });

  it('countInternalFieldsOnPublicDto reports 0 for a correctly-stripped DTO', () => {
    const dto = toPublicQuoteLine(internalLine);
    expect(countInternalFieldsOnPublicDto(dto as unknown as Record<string, unknown>)).toBe(0);
  });

  it('countInternalFieldsOnPublicDto catches an accidentally-leaked internal field', () => {
    const leaked = { ...toPublicQuoteLine(internalLine), currentCost: 100 };
    expect(countInternalFieldsOnPublicDto(leaked)).toBe(1);
  });
});
