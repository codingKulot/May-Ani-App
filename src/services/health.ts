import { DISEASES } from '@/data/diseases';
import type { DiagnosisResult, HealthKind } from '@/types';
import type { AiCheck } from '@/services/ai';

/**
 * Offline symptom matcher. It scores each disease by how many of its keywords appear in the
 * description (longer, more specific keywords count more) and boosts diseases known to affect
 * the chosen crop/animal. It is a triage aid, never a diagnosis - confidence is capped and
 * results always carry advice to confirm with a DA technician / LGU vet / BFAR officer.
 */

const norm = (s: string) =>
  s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9\s-]/g, ' ').replace(/\s+/g, ' ').trim();

export function diagnoseOffline(description: string, kind: HealthKind, subject?: string): DiagnosisResult[] {
  const text = ` ${norm(description)} `;
  if (text.trim().length < 3) return [];
  const subj = subject ? norm(subject) : '';

  const scored = DISEASES.filter((d) => d.kind === kind)
    .map((d) => {
      let score = 0;
      let hits = 0;
      for (const kw of d.keywords) {
        const k = norm(kw);
        if (k && text.includes(` ${k} `) || (k.length >= 5 && text.includes(k))) {
          hits++;
          score += 1 + Math.min(2, k.split(' ').length - 1) * 0.5;
        }
      }
      if (hits === 0) return { d, score: 0, hits };
      if (subj && d.subjects.some((s) => norm(s) === subj || subj.includes(norm(s)) || norm(s).includes(subj))) score *= 1.5;
      else if (subj) score *= 0.7;
      return { d, score, hits };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  if (scored.length === 0) return [];
  const top = scored[0].score;
  return scored.map(({ d, score, hits }) => {
    // confidence rises with matched symptoms but is capped: text matching cannot be certain
    const raw = Math.min(0.85, 0.3 + 0.12 * hits + 0.1 * (score / top));
    const rel = score / top;
    return {
      id: d.id,
      name: d.name,
      confidence: Math.round(raw * rel * 100),
      summary: d.summary,
      actions: d.actions,
      prevention: d.prevention,
      seeExpert: d.seeExpert,
      reportable: d.reportable,
      source: 'rules' as const,
    };
  });
}

/**
 * What the Health page shows after the AI looked at a photo (or a description):
 * - `not_farm`: not a plant, animal, fish or farm scene (an electric fan, a selfie, a document); no diagnosis.
 * - `unclear`: too dark, blurry or far away to tell; no diagnosis.
 * - `no_problem`: a farm photo, but the AI saw no clear problem.
 * - `results`: likely causes.
 * `wrongKind` is set when the photo shows a plant, animal or fish other than the one the farmer picked.
 */
export type AiVerdict =
  | { type: 'results'; results: DiagnosisResult[]; seen: string; wrongKind?: HealthKind }
  | { type: 'no_problem'; seen: string; wrongKind?: HealthKind }
  | { type: 'not_farm'; seen: string }
  | { type: 'unclear'; seen: string };

export function readAiCheck(check: AiCheck, picked: HealthKind): AiVerdict {
  const { subject, seen } = check;
  if (subject === 'other') return { type: 'not_farm', seen };
  if (subject === 'unclear') return { type: 'unclear', seen };
  const wrongKind = (subject === 'plant' || subject === 'animal' || subject === 'fish') && subject !== picked ? subject : undefined;
  if (check.results.length === 0) return { type: 'no_problem', seen, wrongKind };
  return { type: 'results', results: check.results, seen, wrongKind };
}

export const HEALTH_DISCLAIMER =
  'This is a preliminary assessment to help you decide your next step. For confirmation, consult your DA technician, LGU veterinarian or BFAR fisheries officer.';
