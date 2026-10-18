import { useEffect, useRef, useState } from 'react';
import { LuCamera, LuCheck, LuMessageCircle, LuPencil, LuSparkles, LuStethoscope, LuTriangleAlert } from 'react-icons/lu';
import { useAppState } from '@/core/store';
import { logHealth, resolveHealth } from '@/core/actions';
import { navigate } from '@/core/router';
import { allItems } from '@/data/catalog';
import { placeLabel } from '@/data/places';
import { HEALTH_DISCLAIMER, diagnoseOffline, readAiCheck, type AiVerdict } from '@/services/health';
import { aiDiagnose, aiProblem, serverStatus, type DailyAllowance, type ServerStatus } from '@/services/ai';
import { fileToImagePayload, type ImagePayload } from '@/lib/image';
import { prettyDate } from '@/lib/format';
import type { DiagnosisResult, HealthKind } from '@/types';
import { Alert, Badge, Button, Card, Chips, Empty, Field, LinkButton, PageHeader, Progress, Spinner, Tabs, toast } from '@/components/ui';

const KINDS: { id: HealthKind; label: string }[] = [
  { id: 'plant', label: 'Plant' },
  { id: 'animal', label: 'Animal' },
  { id: 'fish', label: 'Fish' },
];
const A_KIND: Record<HealthKind, string> = { plant: 'a plant', animal: 'an animal', fish: 'a fish' };
const kindLabel = (k: HealthKind) => KINDS.find((x) => x.id === k)!.label;
const subjectsFor = (k: HealthKind) =>
  allItems().filter((c) => (k === 'plant' ? c.sector === 'crops' : k === 'fish' ? c.sector === 'fish' : c.sector === 'livestock')).map((c) => c.name);

/** Photos are sent at up to 1568 px on the long side: the whole photo, never cropped, with enough detail for small spots. */
const PHOTO_MAX_PX = 1568;

const failTitle = (code: string, photo: boolean) => {
  const what = photo ? 'Photo checking' : 'AI checking';
  return ({
    ai_billing: `${what} is paused (no AI credit)`,
    ai_off: `${what} is not set up`,
    ai_key: `${what} is not working`,
    ai_offline: 'The AI cannot be reached',
    ai_timeout: 'The AI took too long',
    ai_busy: 'The AI service is busy',
    ai_refused: 'The AI did not answer',
    ai_quota: "Today's AI checks are used up",
    ai_daily_cap: 'The AI has reached its limit for today',
  } as Record<string, string>)[code] ?? 'The AI check did not work';
};

/** "Free AI checks: 5 a day on this phone, 20 with an account." (the server's numbers) */
function allowanceLine(a: DailyAllowance, hasAccount: boolean): string {
  if (hasAccount && a.account !== undefined) return `AI checks: ${a.account} a day with your account.`;
  if (a.guest === 0) return 'AI checks need an account on this server.';
  return `Free AI checks: ${a.guest} a day on this phone${a.account !== undefined ? `, ${a.account} with a free account` : ''}.`;
}

/** What the last "Analyze" produced. `verdict` is missing when the answer came from the offline symptom guide only. */
interface Outcome {
  verdict?: AiVerdict['type'];
  results: DiagnosisResult[];
  seen?: string;
  /** the photo shows this kind instead of the one picked */
  wrongKind?: HealthKind;
  pickedKind: HealthKind;
  /** what a saved log entry is filed under */
  logKind: HealthKind;
  logSubject?: string;
  /** a photo was part of this check */
  photo: boolean;
  /** the farmer wrote a description */
  described: boolean;
  note?: string;
  aiFail?: { code: string; text: string };
}

export function Health() {
  const s = useAppState();
  const [mode, setMode] = useState<'photo' | 'describe'>('photo');
  const [kind, setKind] = useState<HealthKind>('plant');
  const [subject, setSubject] = useState('');
  const [text, setText] = useState('');
  const [image, setImage] = useState<ImagePayload | null>(null);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  /** undefined while asking the server, null when it cannot be reached */
  const [server, setServer] = useState<ServerStatus | null | undefined>(undefined);
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const resRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => { serverStatus().then(setServer); }, []);
  useEffect(() => { if (outcome) resRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, [outcome]);

  const pick = async (files: FileList | null) => {
    if (!files?.[0]) return;
    try { setImage(await fileToImagePayload(files[0], PHOTO_MAX_PX)); setOutcome(null); } catch { toast('That photo could not be read. Try another one.'); }
  };
  const photoInput = <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => { pick(e.target.files); e.target.value = ''; }} />;

  const aiOn = !!server?.ai;
  const usePhoto = mode === 'photo' && !!image;
  const canRun = text.trim().length >= 3 || (aiOn && usePhoto);

  const run = async () => {
    const described = text.trim().length > 0;
    const picked = subject || undefined;
    setBusy(true); setOutcome(null); setSaved({});
    const offline = diagnoseOffline(text, kind, picked);
    const base = { pickedKind: kind, logKind: kind, logSubject: picked, photo: usePhoto, described };
    try {
      if (aiOn && (usePhoto || described)) {
        const check = await aiDiagnose({ kind, subject: picked, description: text, image: usePhoto ? image! : undefined, place: placeLabel(s.profile!.location) });
        const v = readAiCheck(check, kind);
        if (v.type === 'not_farm' || v.type === 'unclear') setOutcome({ ...base, verdict: v.type, results: [], seen: v.seen });
        else {
          // a wrong-kind photo is filed under what it shows; the crop/animal picked from the list does not apply to it
          const filed = v.wrongKind ? { logKind: v.wrongKind, logSubject: undefined } : {};
          const fromGuide = v.type === 'no_problem' && offline.length > 0;
          setOutcome({
            ...base, ...filed, verdict: v.type, seen: v.seen, wrongKind: v.wrongKind,
            results: v.type === 'results' ? v.results : offline,
            note: fromGuide ? 'The AI saw no clear problem in the photo. These matches come from the built-in symptom guide, based on your description.' : undefined,
          });
        }
      } else {
        setOutcome({ ...base, photo: false, results: offline, note: usePhoto ? 'Photo checking needs AI, which is not available right now, so this result uses your written description only.' : undefined });
      }
    } catch (e) {
      setOutcome({ ...base, results: offline, aiFail: aiProblem(e) });
    } finally { setBusy(false); }
  };

  const save = (r: DiagnosisResult) => {
    if (!outcome) return;
    logHealth({ kind: outcome.logKind, subject: outcome.logSubject, title: r.name, confidence: r.confidence, source: r.source, reportable: r.reportable, farmId: s.activeFarmId });
    setSaved((m) => ({ ...m, [r.id]: true }));
    toast('Saved to your health log');
  };

  const askExpert = <Button variant="secondary" onClick={() => navigate('/community')}><LuMessageCircle size={16} /> Ask an expert</Button>;
  const seenLine = (seen?: string) => (seen ? <><br /><span className="bold">What the AI sees:</span> {seen}</> : null);

  const renderOutcome = (o: Outcome) => {
    if (o.verdict === 'not_farm') {
      return o.photo ? (
        <Card><Empty icon="🚫" title="This photo does not look like a plant, animal or fish">
          Please take a photo of the affected crop, animal or fish. May-Ani only checks farm and fishpond photos.{seenLine(o.seen)}
        </Empty></Card>
      ) : (
        <Card><Empty icon="🚫" title="This does not seem to be about a crop, animal or fish">
          Describe the problem with your crop, farm animal or fish, for example: yellow leaves with brown spots, after heavy rain.
        </Empty></Card>
      );
    }
    if (o.verdict === 'unclear') {
      return (
        <Card><Empty icon="📷" title="The photo is too unclear to check">
          Take a sharper photo in daylight, close enough that the sick part fills most of the picture.{seenLine(o.seen)}
        </Empty></Card>
      );
    }
    if (o.verdict === 'no_problem' && o.results.length === 0) {
      return (
        <Card><Empty icon="🌿" title={o.photo ? 'No clear problem seen in this photo' : 'No clear problem found'} action={askExpert}>
          {o.photo ? 'If something is wrong, take a closer photo of the affected part, or add a few words (when it started, how many are affected).' : 'Add more detail, or contact your DA technician, LGU vet or BFAR officer.'}{seenLine(o.seen)}
        </Empty></Card>
      );
    }
    if (o.results.length === 0) {
      // AI failed and there was no description to fall back on: the alert above already says what to do
      if (o.aiFail && !o.described) return null;
      return (
        <Card><Empty icon="🔍" title="No clear match" action={askExpert}>
          Add more detail (what part is affected, colour, how fast it spreads, how many are affected) or contact your DA technician, LGU vet or BFAR officer.
        </Empty></Card>
      );
    }
    return (
      <>
        {o.seen ? <p className="small muted"><span className="bold">What the AI sees:</span> {o.seen}</p> : null}
        {o.results.some((r) => r.reportable) ? (
          <Alert tone="red" title="Possible reportable disease">Some animal and fish diseases must be reported to the authorities. Isolate affected stock, do not sell or move them, and contact your LGU veterinarian or BFAR / Bureau of Animal Industry right away.</Alert>
        ) : null}
        {o.results.map((r, i) => (
          <Card key={r.id} title={<span className="row" style={{ gap: 8 }}><LuStethoscope size={18} /> {i === 0 ? 'Most likely: ' : ''}{r.name}</span>}
            action={<Badge tone={r.source === 'ai' ? 'blue' : 'gray'}>{r.source === 'ai' ? 'AI' : 'Symptom guide'}</Badge>}>
            <div className="stack sm">
              <div className="row"><span className="small bold">Confidence {r.confidence}%</span><div className="grow"><Progress value={r.confidence} label="Confidence" warn={r.confidence < 40} /></div></div>
              <p>{r.summary}</p>
              {r.evidence ? <p className="small"><span className="bold">Seen in the photo:</span> {r.evidence}</p> : null}
              <div><div className="bold">What to do now</div>
                <ol className="steps">{r.actions.map((a, j) => <li key={j}>{a}</li>)}</ol></div>
              {r.prevention.length ? <div><div className="bold">Prevent it next time</div>
                <ul className="steps">{r.prevention.map((a, j) => <li key={j}>{a}</li>)}</ul></div> : null}
              {r.seeExpert ? <Alert tone="orange" title="Get expert confirmation">This can spread or cause big losses. Have a technician check it soon.</Alert> : null}
              <div className="row wrap">
                <Button size="sm" variant="secondary" disabled={saved[r.id]} onClick={() => save(r)}>{saved[r.id] ? <><LuCheck size={14} /> Saved</> : 'Save to health log'}</Button>
                <Button size="sm" variant="ghost" onClick={() => navigate('/community')}><LuMessageCircle size={14} /> Ask follow-up</Button>
              </div>
            </div>
          </Card>
        ))}
        <p className="tiny muted"><LuTriangleAlert size={12} /> {HEALTH_DISCLAIMER} May-Ani does not give medicine doses; follow your vet's or technician's instructions and the product label.</p>
      </>
    );
  };

  return (
    <div className="page narrow">
      <PageHeader title="Plant & Animal Health" sub="Send a photo or describe the problem. Get likely causes and what to do next." />
      <div className="stack">
        <Card>
          <Tabs tabs={[{ id: 'photo', label: 'Take photo' }, { id: 'describe', label: 'Describe problem' }]} value={mode} onChange={setMode} />
          <div className="stack">
            <Chips seg items={KINDS} value={kind} onChange={(k) => { setKind(k); setSubject(''); }} />
            <Field label={kind === 'plant' ? 'Which crop?' : kind === 'animal' ? 'Which animal?' : 'Which fish?'} htmlFor="subj">
              <select id="subj" className="input" value={subject} onChange={(e) => setSubject(e.target.value)}>
                <option value="">Not sure / other</option>
                {subjectsFor(kind).map((n) => <option key={n}>{n}</option>)}
              </select>
            </Field>

            {mode === 'photo' ? (
              image ? (
                <div className={`scan ${busy ? 'busy' : ''}`}>
                  <img src={image.dataUrl} alt="Photo of the problem" />
                  {busy ? <div className="sweep" aria-hidden="true" /> : null}
                </div>
              ) : (
                <label className="drop">
                  <LuCamera size={28} />
                  <b>Take or choose a photo</b>
                  <span className="small">The sick leaf, fruit, animal or fish. The whole photo is checked; good light helps.</span>
                  {photoInput}
                </label>
              )
            ) : null}
            {mode === 'photo' && image ? (
              <div className="row wrap">
                <label className="btn ghost sm" style={{ cursor: 'pointer' }}>Change photo{photoInput}</label>
                <Button size="sm" variant="ghost" onClick={() => { setImage(null); setOutcome(null); }}>Remove photo</Button>
                {aiOn ? <span className="small muted">The whole photo is checked, edge to edge.</span> : null}
              </div>
            ) : null}
            {mode === 'photo' && server !== undefined && !aiOn ? (
              <Alert tone="orange" title="Photo checking is not available right now">
                {server === null ? 'The May-Ani server is not connected, and photo checking needs its AI.' : 'The AI is not set up on the May-Ani server, and photo checking needs it.'}{' '}
                You can still describe the problem below: checking by description works offline.
              </Alert>
            ) : null}

            <Field label={mode === 'photo' ? (aiOn ? 'Add a short description (optional)' : 'Describe the problem') : 'What do you see?'} htmlFor="desc"
              hint={mode === 'photo' && aiOn
                ? 'The photo alone is enough. Words help with what a photo cannot show: when it started, how many are sick, smell or behaviour. Filipino is fine.'
                : 'Example: yellow leaves with brown spots, lower leaves first, after heavy rain. Filipino is fine.'}>
              <textarea id="desc" className="input" rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="Describe the colour, spots, smell, behaviour, when it started…" />
            </Field>
            <Button block disabled={!canRun || busy} onClick={run}>
              {busy ? <><Spinner /> {usePhoto ? 'Checking the whole photo…' : 'Analyzing…'}</> : <><LuSparkles size={18} /> Analyze{aiOn ? ' with AI' : ''}</>}
            </Button>
            {aiOn && server?.daily ? <p className="tiny muted">{allowanceLine(server.daily.ai, !!s.profile?.account)}</p> : null}
            {mode === 'describe' && server !== undefined && !aiOn ? (
              <p className="tiny muted">{server === null ? 'AI server not connected' : 'AI is not set up on the server'}: results come from the built-in symptom guide (works offline).</p>
            ) : null}
          </div>
        </Card>

        <div ref={resRef} />
        {outcome ? (
          <div className="stack">
            {outcome.aiFail ? (
              <Alert tone="orange" title={failTitle(outcome.aiFail.code, outcome.photo)} action={outcome.aiFail.code === 'ai_quota' && !s.profile?.account && server?.accounts
                ? <div style={{ marginTop: 8 }}><LinkButton to="/account?mode=signup" size="sm" variant="secondary">Create a free account</LinkButton></div> : undefined}>
                {outcome.aiFail.text}{' '}
                {outcome.described
                  ? 'The results below come from the built-in symptom guide, based on your description.'
                  : 'Photo checking needs AI. Checking by description still works offline: describe what you see above and tap Analyze again.'}
              </Alert>
            ) : null}
            {outcome.note ? <Alert tone="blue" title="Note">{outcome.note}</Alert> : null}
            {outcome.wrongKind && outcome.wrongKind !== kind ? (
              <Alert tone="blue" title={`This looks like ${A_KIND[outcome.wrongKind]}, not ${A_KIND[outcome.pickedKind]}`}
                action={<div style={{ marginTop: 8 }}><Button size="sm" variant="secondary" onClick={() => { setKind(outcome.wrongKind!); setSubject(''); }}>Switch to {kindLabel(outcome.wrongKind)}</Button></div>}>
                You picked {kindLabel(outcome.pickedKind)}, so the check below is for what the photo shows. Pick {kindLabel(outcome.wrongKind)} so the list and your health log match.
              </Alert>
            ) : null}
            {renderOutcome(outcome)}
          </div>
        ) : null}

        <Card title="Health log">
          {s.healthLog.length === 0 ? <Empty icon={<LuPencil size={28} />} title="Nothing logged yet">Saved diagnoses appear here so you can track what happened and when.</Empty> : (
            <div className="list">
              {s.healthLog.slice(0, 20).map((h) => (
                <div key={h.id} className="row">
                  <div className="grow">
                    <div className={`bold ${h.resolved ? 'done' : ''}`}>{h.title}{h.subject ? ` · ${h.subject}` : ''}</div>
                    <div className="small muted">{prettyDate(h.date)} · {h.confidence}% · {h.source === 'ai' ? 'AI' : 'symptom guide'}</div>
                  </div>
                  {h.reportable ? <Badge tone="red">Reportable</Badge> : null}
                  <Button size="sm" variant="ghost" onClick={() => resolveHealth(h.id)}>{h.resolved ? 'Reopen' : 'Resolved'}</Button>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
