import type { SavedPlan } from '@/types';

/** The longest project name. */
export const PLAN_NAME_MAX = 60;

/** The name as it is saved: no spaces at the ends, single spaces inside. */
export const cleanPlanName = (name: string) => name.trim().replace(/\s+/g, ' ');

/** How names are compared: capital letters and extra spaces do not make a different name. */
// String(...): a plan saved without a name (an edited backup) must not stop the Planner from opening.
const nameKey = (name: unknown) => cleanPlanName(String(name ?? '')).normalize('NFKC').toLowerCase();

export interface PlanNameProblem {
  message: string;
  /** the plan that already has this name */
  existing?: SavedPlan;
}

/**
 * Checks a project name (owner's rule, 20 October 2026): it is required, and no two plans of the same account may share a name.
 * `plans` are the plans on this phone, which hold the account's plans from other phones once they have synced.
 * `exceptId` is the plan being edited: keeping its own name is fine.
 * A plan is matched by the title people see (`result.title`; plans made before names were required may have a made-up title
 * such as "Backyard Vegetable Garden") and by the name typed for it.
 */
export function planNameProblem(name: string, plans: SavedPlan[], exceptId?: string): PlanNameProblem | null {
  const clean = cleanPlanName(name);
  if (!clean) return { message: 'Give your project a name, like "Backyard garden".' };
  if ([...clean].length > PLAN_NAME_MAX) return { message: `Use a shorter name (at most ${PLAN_NAME_MAX} characters).` };
  const key = nameKey(clean);
  const existing = plans.find((p) => p.id !== exceptId && (nameKey(p.result.title) === key || nameKey(p.input.name) === key));
  if (existing) return { message: `You already have a plan named "${existing.result.title}". Choose another name.`, existing };
  return null;
}
