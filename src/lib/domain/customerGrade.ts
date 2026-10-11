// Contract-margin grading for the Customers / Margin Guard view.
// Pure function, no DB access, so it stays unit-testable.

export type ContractLineState = 'loss' | 'thin' | 'ok';
export type CustomerGrade = 'A' | 'B' | 'C' | 'D' | 'F';

/**
 * Grade reflects how much of a customer's locked contract book sits below
 * the category margin target. It is a deterministic function of real
 * margin states, never a fabricated/static value:
 * - F: 30%+ of lines are selling below cost.
 * - D: any line is selling below cost.
 * - C: no losses, but 30%+ of lines are below target (thin).
 * - B: no losses, some lines thin.
 * - A: every line at or above its category target.
 */
export function computeCustomerGrade(lineStates: ContractLineState[]): CustomerGrade {
  if (lineStates.length === 0) return 'C';
  const lossShare = lineStates.filter((s) => s === 'loss').length / lineStates.length;
  const thinShare = lineStates.filter((s) => s === 'thin').length / lineStates.length;

  if (lossShare >= 0.3) return 'F';
  if (lossShare > 0) return 'D';
  if (thinShare >= 0.3) return 'C';
  if (thinShare > 0) return 'B';
  return 'A';
}
