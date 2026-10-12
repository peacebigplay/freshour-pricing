'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { useState } from 'react';
import { approveCentralPriceLine, type ApproveResult } from './actions';
import type { PricingGoalSuggestion } from '@/lib/domain/pricingGoals';

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
    <button type="submit" className="confirmbtn" disabled={pending}>
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
    <form action={formAction} style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 230 }}>
      <input type="hidden" name="lineId" value={lineId} />
      <input type="hidden" name="expectedVersion" value={version} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
        {goals.map((g) => (
          <button
            key={g.goal}
            type="button"
            className={`opt2${selectedGoal === g.goal ? ' on' : ''}`}
            style={g.belowFloor && selectedGoal !== g.goal ? { borderColor: 'var(--red-b)', background: 'var(--red-l)' } : undefined}
            title={g.rationale}
            onClick={() => {
              setPrice(g.suggestedPrice);
              setSelectedGoal(g.goal);
            }}
          >
            <b>{g.suggestedPrice.toLocaleString('th-TH')}</b>
            <i>
              {GOAL_LABEL[g.goal] ?? g.goal} · {g.resultingMarginPct.toFixed(1)}%
            </i>
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
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
          className="pin"
        />
        <SubmitButton />
      </div>
      {state.error && <span style={{ color: 'var(--red)', fontSize: 11 }}>{state.error}</span>}
    </form>
  );
}
