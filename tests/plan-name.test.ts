import { beforeEach, describe, expect, test } from 'bun:test';
import { getState, resetState, setState } from '@/core/store';
import { replacePlan } from '@/core/actions';
import { PLAN_NAME_MAX, cleanPlanName, planNameProblem } from '@/services/planner/name';
import type { PlanInput, PlanResult, SavedPlan } from '@/types';

/** The project name is required, and two plans of one account never share a name (owner's rule, 20 October 2026). */

const plan = (id: string, name: string, title = name): SavedPlan =>
  ({ id, createdAt: '2026-10-20T00:00:00.000Z', input: { name } as PlanInput, result: { title } as PlanResult });

const plans = [plan('p1', 'Backyard garden'), plan('p2', '', 'Small Vegetable Farm')];

describe('project name', () => {
  test('is required: empty or only spaces is refused with a plain message', () => {
    expect(planNameProblem('', plans)?.message).toContain('Give your project a name');
    expect(planNameProblem('   ', plans)?.message).toContain('Give your project a name');
  });

  test('a name nobody uses yet is fine; spaces at the ends and doubled inside are tidied', () => {
    expect(planNameProblem('Tilapia pond', plans)).toBeNull();
    expect(cleanPlanName('  Tilapia   pond ')).toBe('Tilapia pond');
  });

  test('a name the account already uses is refused, whatever the capitals or spaces, and names that plan', () => {
    for (const typed of ['Backyard garden', 'backyard GARDEN', '  Backyard   garden ']) {
      const p = planNameProblem(typed, plans);
      expect(p?.existing?.id).toBe('p1');
      expect(p?.message).toBe('You already have a plan named "Backyard garden". Choose another name.');
    }
  });

  test('an older plan without a typed name is matched by the title people see', () => {
    expect(planNameProblem('small vegetable farm', plans)?.existing?.id).toBe('p2');
  });

  test('the plan being edited may keep its own name, but not take another plan\'s', () => {
    expect(planNameProblem('Backyard garden', plans, 'p1')).toBeNull();
    expect(planNameProblem('Small Vegetable Farm', plans, 'p1')?.existing?.id).toBe('p2');
  });

  test('a very long name is refused', () => {
    expect(planNameProblem('x'.repeat(PLAN_NAME_MAX), plans)).toBeNull();
    expect(planNameProblem('x'.repeat(PLAN_NAME_MAX + 1), plans)?.message).toContain(`at most ${PLAN_NAME_MAX}`);
  });
});

describe('editing a plan', () => {
  beforeEach(() => resetState());

  test('changes the same plan: its id, date, farm link and build choices stay, and no second plan appears', () => {
    const old: SavedPlan = { ...plan('p1', 'Backyard garden'), farmId: 'f1', build: { recyclables: ['pallets'], onSite: [], notes: [] } };
    setState((s) => ({ ...s, plans: [old, plan('p2', 'Tilapia pond')] }));
    const edited = replacePlan('p1', { name: 'Backyard garden 2' } as PlanInput, { title: 'Backyard garden 2' } as PlanResult);
    expect(edited).toMatchObject({ id: 'p1', createdAt: old.createdAt, farmId: 'f1', build: old.build });
    expect(getState().plans.map((p) => [p.id, p.result.title])).toEqual([['p1', 'Backyard garden 2'], ['p2', 'Tilapia pond']]);
  });

  test('a plan deleted meanwhile (for example on another phone) is not brought back by the edit', () => {
    expect(replacePlan('gone', { name: 'X' } as PlanInput, { title: 'X' } as PlanResult)).toBeNull();
    expect(getState().plans).toEqual([]);
  });
});
