'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { useState } from 'react';
import { approveCentralPriceLine, type ApproveResult } from './actions';
import type { PricingGoalSuggestion } from '@/lib/domain/pricingGoals';
import sharedStyles from '@/components/ui/shared.module.css';
import styles from './ApproveForm.module.css';

const initial: ApproveResult = { ok: false };

const GOAL_LABEL: Record<string, string> = {
  COMPETITIVE: 'แข่งขันได้',
  HOLD: 'ยืนราคาเดิม',
  TARGET: 'กำไรตามเป้า',
  PROTECT: 'ป้องกันกำไร',
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={sharedStyles.primaryButton} disabled={pending} style={{ padding: '5px 12px', fontSize: 12 }}>
      {pending ? '...' : '✓ ยืนยันราคานี้'}
    </button>
  );
}

export function ApproveForm({
  lineId,
  version,
  defaultPrice,
  goals,
}: {
  lineId: string;
  version: number;
  defaultPrice: number;
  goals: PricingGoalSuggestion[];
}) {
  const [state, formAction] = useFormState(approveCentralPriceLine, initial);
  const [price, setPrice] = useState(defaultPrice);
  const [selectedGoal, setSelectedGoal] = useState<string | null>(null);

  return (
    <form action={formAction} className={styles.wrap}>
      <input type="hidden" name="lineId" value={lineId} />
      <input type="hidden" name="expectedVersion" value={version} />

      <div className={styles.goalRow}>
        {goals.map((g) => (
          <button
            key={g.goal}
            type="button"
            className={`${styles.goalBtn} ${selectedGoal === g.goal ? styles.goalBtnOn : ''} ${g.belowFloor ? styles.goalBtnWarn : ''}`}
            title={g.rationale}
            onClick={() => {
              setPrice(g.suggestedPrice);
              setSelectedGoal(g.goal);
            }}
          >
            <span>{GOAL_LABEL[g.goal] ?? g.goal}</span>
            <b>{g.suggestedPrice.toLocaleString('th-TH')}</b>
            <em>{g.resultingMarginPct.toFixed(1)}%</em>
          </button>
        ))}
      </div>

      <div className={styles.confirmRow}>
        <input
          type="number"
          name="approvedPrice"
          value={price}
          min={0}
          step="1"
          onChange={(e) => {
            setPrice(Number(e.target.value));
            setSelectedGoal(null);
          }}
          className={styles.priceInput}
        />
        <SubmitButton />
      </div>
      {state.error && <span style={{ color: 'var(--danger)', fontSize: 11 }}>{state.error}</span>}
    </form>
  );
}
