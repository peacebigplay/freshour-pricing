// Public quote DTO — Freshour Master Prompt v2, Section 18.
// Strips every internal field before a quote line is ever sent to a customer.
// This is the single choke point every public /q/:token response must pass
// through — never hand-assemble a public payload anywhere else.

export interface InternalQuoteLine {
  productId: string;
  productName: string;
  unit: string;
  offeredPrice: number;
  // Internal-only fields that must never reach a public response:
  currentCost: number;
  marginPct: number;
  targetMarginPct: number;
  marginFloorPct: number;
  competitorPrice?: number | null;
  supplierCostTarget?: number | null;
  internalNote?: string | null;
  matchConfidence?: number | null;
  sourceMetadata?: Record<string, unknown>;
}

export interface PublicQuoteLineDto {
  productName: string;
  unit: string;
  price: number;
}

const PUBLIC_FIELDS: ReadonlyArray<keyof PublicQuoteLineDto> = ['productName', 'unit', 'price'];

export function toPublicQuoteLine(line: InternalQuoteLine): PublicQuoteLineDto {
  return {
    productName: line.productName,
    unit: line.unit,
    price: line.offeredPrice,
  };
}

/** Used by tests/audits to assert no internal key leaked onto a public DTO. */
export function countInternalFieldsOnPublicDto(dto: Record<string, unknown>): number {
  const allowed = new Set<string>(PUBLIC_FIELDS);
  return Object.keys(dto).filter((k) => !allowed.has(k)).length;
}
