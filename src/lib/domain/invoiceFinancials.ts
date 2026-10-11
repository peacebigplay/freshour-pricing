// Invoice / Executive financial boundary — Freshour Master Prompt v2, Section 21.

export interface InvoiceLineInput {
  netSales: number;
  recognizedCost: number | null; // null => COST_PENDING
}

/**
 * line_gp = line_net_sales - recognized_cost_total
 * Returns null (COST_PENDING) when the recognized cost is not yet resolvable —
 * never falls back to invoice_total * fixed_margin_percent.
 */
export function lineGrossProfit(line: InvoiceLineInput): number | null {
  if (line.recognizedCost == null) return null;
  return line.netSales - line.recognizedCost;
}

export function sumPostedRevenue(lines: InvoiceLineInput[]): number {
  return lines.reduce((sum, l) => sum + l.netSales, 0);
}

export interface GrossProfitCoverage {
  totalGp: number;
  costPendingLineCount: number;
  coveragePct: number; // % of lines with a resolved GP
}

export function grossProfitCoverage(lines: InvoiceLineInput[]): GrossProfitCoverage {
  let totalGp = 0;
  let pending = 0;
  for (const line of lines) {
    const gp = lineGrossProfit(line);
    if (gp == null) {
      pending += 1;
    } else {
      totalGp += gp;
    }
  }
  const coveragePct = lines.length === 0 ? 100 : ((lines.length - pending) / lines.length) * 100;
  return { totalGp, costPendingLineCount: pending, coveragePct };
}
