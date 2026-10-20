import { Fragment, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { LuApple, LuFish, LuImagePlus, LuLeaf, LuPlus, LuSparkles, LuTractor, LuX } from 'react-icons/lu';
import { Link, navigate } from '@/core/router';
import { getState } from '@/core/store';
import { useAppState } from '@/core/store';
import { removeCustomItem, replacePlan, savePlanDraft } from '@/core/actions';
import { DEFAULT_PLACE } from '@/data/places';
import { SECTORS, SECTOR_LABEL, catalogById, itemsFor, planSectors } from '@/data/catalog';
import { generatePlan } from '@/services/planner';
import { PLAN_NAME_MAX, cleanPlanName, planNameProblem } from '@/services/planner/name';
import { aiSiteAnalysis, serverStatus, type ServerStatus } from '@/services/ai';
import { fileToImagePayload, type ImagePayload } from '@/lib/image';
import { deletePhotos, loadPhotos, savePhotos, toPayload, toStored } from '@/lib/photoStore';
import { peso } from '@/lib/format';
import { useDebounced } from '@/core/hooks';
import type { Experience, GeoPlace, Goal, PlanInput, PlanResult, Sector, SiteConditions } from '@/types';
import { Alert, Button, Card, Chips, Field, NumberInput, PageHeader, Sheet, Spinner, Tabs, ToggleChips, toast } from '@/components/ui';
import { PlaceSelect } from '@/components/widgets';
import { CustomItemSheet } from '@/components/CustomItemSheet';
import { ForecastCard } from '@/components/ForecastCard';
import { AiSetupHelp } from '@/components/AiSetupHelp';
import { MapMeasure, PhotoMeasure } from '@/components/MeasureTools';

const DEFAULT_SITE: SiteConditions = {
  slope: 'gentle', waterSource: 'municipal', power: 'grid', floodProne: false, sunlight: 'full', brackishWater: false, cool: false,
};

const TYPE_CHOICES: { id: Sector; label: string; icon: ReactNode }[] = [
  { id: 'crops', label: 'Vegetables & crops', icon: <LuLeaf size={16} /> },
  { id: 'fruits', label: 'Fruits', icon: <LuApple size={16} /> },
  { id: 'fish', label: 'Fish', icon: <LuFish size={16} /> },
  { id: 'livestock', label: 'Livestock', icon: <LuTractor size={16} /> },
];
const PICK_LABEL: Record<Sector, string> = { crops: 'Which vegetables & crops?', fruits: 'Which fruits?', fish: 'Which fish?', livestock: 'Which livestock & poultry?' };
const NO_TYPE = 'Choose at least one: vegetables & crops, fruits, fish or livestock.';

interface Draft {
  name: string;
  /** one or more types, in SECTORS order */
  sectors: Sector[];
  areaValue: number;
  unit: 'sqm' | 'ha';
  capital: number;
  place: GeoPlace;
  experience: Experience;
  goal: Goal;
  site: SiteConditions;
  preferred: string[];
}

const toSqm = (d: Draft) => Math.round(d.unit === 'ha' ? d.areaValue * 10000 : d.areaValue);

export function Planner({ editId }: { editId?: string }) {
  const s = useAppState();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [draft, setDraft] = useState<Draft>(() => {
    const edit = editId ? getState().plans.find((p) => p.id === editId) : undefined;
    if (edit) {
      const i = edit.input;
      // plans made before a name was required keep the title they were shown with
      return { name: i.name.trim() || edit.result.title, sectors: planSectors(i), areaValue: i.areaSqm, unit: 'sqm', capital: i.capital, place: i.location, experience: i.experience, goal: i.goal, site: i.site, preferred: i.preferred ?? [] };
    }
    return { name: '', sectors: ['crops'], areaValue: 20, unit: 'sqm', capital: 5000, place: s.profile?.location ?? DEFAULT_PLACE, experience: 'beginner', goal: 'family_sell', site: DEFAULT_SITE, preferred: [] };
  });
  const [photos, setPhotos] = useState<ImagePayload[]>([]);
  const [measureTab, setMeasureTab] = useState<'photo' | 'map'>('map');
  const [measurePhoto, setMeasurePhoto] = useState(0);
  const [aiNotes, setAiNotes] = useState<string[]>([]);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiMsg, setAiMsg] = useState<string | null>(null);
  const [server, setServer] = useState<ServerStatus | null | undefined>(undefined); // undefined = still checking
  useEffect(() => { serverStatus().then(setServer); }, []);
  // editing an existing plan: bring its photos back so they are not lost when the plan is regenerated
  const [photosLoaded, setPhotosLoaded] = useState(!editId);
  useEffect(() => {
    if (!editId) return;
    let alive = true;
    loadPhotos(editId).then((p) => { if (!alive) return; if (p.length) setPhotos(p.map(toPayload)); setPhotosLoaded(true); });
    return () => { alive = false; };
  }, [editId]);
  const [aiArea, setAiArea] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const setSite = <K extends keyof SiteConditions>(k: K, v: SiteConditions[K]) => setDraft((d) => ({ ...d, site: { ...d.site, [k]: v } }));
  const area = toSqm(draft);

  useEffect(() => { if (measureTab === 'photo' && photos.length === 0) setMeasureTab('map'); }, [photos.length, measureTab]);

  const addPhotos = async (files: FileList | null) => {
    if (!files) return;
    try {
      const added: ImagePayload[] = [];
      for (const f of Array.from(files).slice(0, 3 - photos.length)) added.push(await fileToImagePayload(f));
      setPhotos((p) => [...p, ...added].slice(0, 3));
    } catch (e) {
      toast((e as Error).message);
    }
  };

  const analyse = async () => {
    setAiBusy(true);
    setAiMsg(null);
    try {
      const st = await serverStatus(true);
      setServer(st);
      if (!st) throw new Error('Not connected yet. Follow the steps below, then tap Analyse again. You can also answer the quick questions below and still get a full plan.');
      if (!st.ai) throw new Error('The server is running but has no AI key yet. Follow the steps below, then tap Analyse again.');
      const out = await aiSiteAnalysis({ sectors: draft.sectors, images: photos });
      setAiNotes(out.notes);
      setDraft((d) => ({ ...d, site: { ...d.site, ...out.site } }));
      if (out.estimatedAreaSqm) setAiArea(out.estimatedAreaSqm);
      setAiMsg(out.notes.length ? 'Photo analysis done. We filled in what we could see; please double-check the answers below.' : 'The AI could not read much from these photos. Please answer the questions below.');
    } catch (e) {
      setAiMsg((e as Error).message);
    } finally {
      setAiBusy(false);
    }
  };

  // The project name is required and must differ from the account's other plans (services/planner/name.ts). An empty name is
  // pointed out once the box was left; a name that is already used is pointed out at once, while typing.
  const [nameLeft, setNameLeft] = useState(false);
  const nameProblem = useMemo(() => planNameProblem(draft.name, s.plans, editId), [draft.name, s.plans, editId]);
  const showNameProblem = !!nameProblem && (nameLeft || !!nameProblem.existing);

  const valid1 = area > 0 && !nameProblem;
  const valid2 = draft.capital >= 0 && draft.sectors.length > 0;

  const generate = () => {
    // checked again: another phone may have saved a plan with this name while this one was being filled in
    const problem = planNameProblem(draft.name, getState().plans, editId);
    if (problem) {
      setNameLeft(true);
      setStep(1);
      toast(problem.message);
      return;
    }
    setBusy(true);
    // yield a frame so the busy state paints before the (synchronous) engine runs
    setTimeout(async () => {
      const input: PlanInput = {
        name: cleanPlanName(draft.name), sector: draft.sectors[0], sectors: draft.sectors, areaSqm: area, capital: draft.capital, location: draft.place,
        experience: draft.experience, goal: draft.goal, site: draft.site, preferred: draft.preferred, photoCount: photos.length, aiSiteNotes: aiNotes,
      };
      const result = generatePlan(input);
      // Editing changes the same plan (it keeps its farm link, floor corners and build choices); a new plan is added only
      // when there is none to edit (for example it was deleted on another phone meanwhile).
      const edited = editId ? replacePlan(editId, input, result) : null;
      const saved = edited ?? savePlanDraft(input, result);
      if (photos.length) await savePhotos(saved.id, photos.map(toStored));
      else if (edited && photosLoaded) await deletePhotos(saved.id); // every photo was removed while editing (the pictures drawn on them go too)
      setBusy(false);
      navigate(`/plan/${saved.id}`);
    }, 50);
  };

  // live preview for step 2: re-runs the planner (a few ms) shortly after the user stops typing
  const liveDraft = useDebounced(draft, 250);
  const preview = useMemo<PlanResult | null>(() => {
    if (step !== 2 || toSqm(liveDraft) <= 0 || !(liveDraft.capital > 0) || liveDraft.sectors.length === 0) return null;
    try {
      return generatePlan({
        name: liveDraft.name, sector: liveDraft.sectors[0], sectors: liveDraft.sectors, areaSqm: toSqm(liveDraft), capital: liveDraft.capital, location: liveDraft.place,
        experience: liveDraft.experience, goal: liveDraft.goal, site: liveDraft.site, preferred: liveDraft.preferred, photoCount: 0,
      });
    } catch { return null; }
  }, [step, liveDraft, s.customItems]);
  const [addFor, setAddFor] = useState<Sector | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const togglePreferred = (id: string) => set('preferred', draft.preferred.includes(id) ? draft.preferred.filter((x) => x !== id) : [...draft.preferred, id]);
  // any mix of types; turning one off drops its picks, so the plan never carries items of a type that is not chosen
  const toggleSector = (id: Sector) => setDraft((d) => {
    const sectors = d.sectors.includes(id) ? d.sectors.filter((x) => x !== id) : SECTORS.filter((x) => x === id || d.sectors.includes(x));
    return { ...d, sectors, preferred: d.preferred.filter((p) => sectors.includes(catalogById(p)?.sector as Sector)) };
  });
  const mixed = draft.sectors.length > 1;
  const landEach = mixed && area > 0 ? Math.round(area / draft.sectors.length) : 0;
  const pickChip = (i: ReturnType<typeof itemsFor>[number]) => (
    <button key={i.id} type="button" className={`chip ${draft.preferred.includes(i.id) ? 'on' : ''}`} aria-pressed={draft.preferred.includes(i.id)} onClick={() => togglePreferred(i.id)}>{i.emoji} {i.name}</button>
  );

  return (
    <div className="page narrow">
      <PageHeader title="AI Farm & Aquaculture Planner" sub="Tell us about your space and budget. We'll draft a full plan: what to grow or raise, the layout, water, drainage, power and costs." />

      <div className="stepper" aria-label="Progress">
        {([['Land & Space', 1], ['Budget & Goals', 2], ['Review', 3]] as const).map(([label, n], i) => (
          <Fragment key={n}>
            {i > 0 ? <div className="bar" /> : null}
            <div className={`s ${step === n ? 'on' : step > n ? 'done' : ''}`}><i>{step > n ? '✓' : n}</i><span>{label}</span></div>
          </Fragment>
        ))}
      </div>

      {step === 1 ? (
        <div className="stack">
          <Card title="1. Photos of your area (optional)">
            <p className="small muted" style={{ marginBottom: 10 }}>Add up to 3 photos. With the May-Ani server connected, AI reads slope, shade, drainage and water clues from them.</p>
            <div className="photo-row">
              {photos.map((p, i) => (
                <div className="ph" key={i}>
                  <img src={p.dataUrl} alt={`Site photo ${i + 1}`} />
                  <button aria-label={`Remove photo ${i + 1}`} onClick={() => setPhotos((a) => a.filter((_, j) => j !== i))}><LuX size={14} /></button>
                </div>
              ))}
              {photos.length < 3 ? (
                <label className="add">
                  <LuImagePlus size={22} /> Add photo
                  <input type="file" accept="image/*" multiple hidden onChange={(e) => { addPhotos(e.target.files); e.target.value = ''; }} />
                </label>
              ) : null}
            </div>
            {photos.length > 0 ? (
              <div className="stack sm" style={{ marginTop: 12 }}>
                <Button variant="secondary" onClick={analyse} disabled={aiBusy}>{aiBusy ? <><Spinner /> Analysing photos…</> : <><LuSparkles size={16} /> Analyse photos with AI</>}</Button>
                {server?.ai ? <p className="small" role="status" style={{ color: 'var(--green-800)' }}>✓ AI is connected. It will read slope, shade, drainage and water clues from your photos.</p> : null}
                {aiMsg ? <p className="small muted" role="status">{aiMsg}</p> : null}
                {server !== undefined && !server?.ai ? <AiSetupHelp serverUp={!!server} /> : null}
                {aiNotes.length > 0 ? <ul className="steps small">{aiNotes.map((n, i) => <li key={i}>{n}</li>)}</ul> : null}
                {aiArea ? <Alert tone="blue" title={`The AI estimates roughly ${aiArea} sqm`} action={<Button size="sm" variant="secondary" onClick={() => { set('unit', 'sqm'); set('areaValue', aiArea); setAiArea(null); }}>Use this</Button>}>Only a rough guess from the photo scale. Measuring below is more reliable.</Alert> : null}
              </div>
            ) : null}
          </Card>

          <Card title="2. Where and how big?">
            <div className="form-grid">
              <Field label="Location" htmlFor="loc"><PlaceSelect id="loc" value={draft.place} onChange={(p) => set('place', p)} /></Field>
              <div className="form-grid two">
                <Field label="Available area (approx.)" htmlFor="area">
                  <div className="input-group">
                    <NumberInput id="area" value={draft.areaValue} min={1} onChange={(n) => set('areaValue', n)} />
                    <select className="input" style={{ maxWidth: 130 }} aria-label="Area unit" value={draft.unit} onChange={(e) => set('unit', e.target.value as 'sqm' | 'ha')}>
                      <option value="sqm">sq. meters</option>
                      <option value="ha">hectares</option>
                    </select>
                  </div>
                </Field>
                <Field label="Project name" htmlFor="pname">
                  <input
                    id="pname" className="input" value={draft.name} placeholder="e.g. Backyard garden" maxLength={PLAN_NAME_MAX} required autoComplete="off"
                    aria-invalid={showNameProblem ? true : undefined} aria-describedby={showNameProblem ? 'pname-problem' : undefined}
                    onChange={(e) => set('name', e.target.value)} onBlur={() => setNameLeft(true)}
                  />
                  {showNameProblem ? (
                    <span id="pname-problem" className="field-error" role="alert">
                      {nameProblem!.message}{nameProblem!.existing ? <> <Link to={`/plan/${nameProblem!.existing.id}`}>Open that plan</Link></> : null}
                    </span>
                  ) : null}
                </Field>
              </div>
              <details className="fold card flat" style={{ padding: 0 }}>
                <summary className="row between" style={{ padding: 12 }}><span className="bold"><LuTractor size={16} /> Not sure of the size? Measure it</span><span className="small muted">tap to open</span></summary>
                <div style={{ padding: '0 12px 12px' }}>
                  <Tabs tabs={[{ id: 'map', label: 'Outline on map' }, { id: 'photo', label: 'Outline on photo' }]} value={measureTab} onChange={(t) => { if (t === 'photo' && photos.length === 0) { toast('Add a photo first (top of this page).'); return; } setMeasureTab(t); }} />
                  {measureTab === 'map' ? (
                    <MapMeasure lat={draft.place.lat} lon={draft.place.lon} onUse={(sqm) => { set('unit', 'sqm'); set('areaValue', sqm); toast(`Area set to ${sqm.toLocaleString()} sqm`); }} />
                  ) : (
                    <div className="stack sm">
                      {photos.length > 1 ? <Chips value={String(measurePhoto)} onChange={(v) => setMeasurePhoto(Number(v))} items={photos.map((_, i) => ({ id: String(i), label: `Photo ${i + 1}` }))} /> : null}
                      <PhotoMeasure image={photos[Math.min(measurePhoto, photos.length - 1)]} onUse={(sqm) => { set('unit', 'sqm'); set('areaValue', sqm); toast(`Area set to ${sqm.toLocaleString()} sqm`); }} />
                    </div>
                  )}
                </div>
              </details>
            </div>
          </Card>

          <Card title="3. About the site">
            <p className="small muted" style={{ marginBottom: 10 }}>These answers shape drainage, water and what will grow well.</p>
            <div className="form-grid">
              <Field label="Slope of the land"><Chips seg value={draft.site.slope} onChange={(v) => setSite('slope', v)} items={[{ id: 'flat', label: 'Flat' }, { id: 'gentle', label: 'Gentle' }, { id: 'steep', label: 'Steep' }]} /></Field>
              <Field label="Sunlight"><Chips seg value={draft.site.sunlight} onChange={(v) => setSite('sunlight', v)} items={[{ id: 'full', label: 'Full sun' }, { id: 'partial', label: 'Partial' }, { id: 'shaded', label: 'Shaded' }]} /></Field>
              <div className="form-grid two">
                <Field label="Water source" htmlFor="ws">
                  <select id="ws" className="input" value={draft.site.waterSource} onChange={(e) => setSite('waterSource', e.target.value as SiteConditions['waterSource'])}>
                    <option value="municipal">Municipal / water district</option>
                    <option value="well">Well / deep well</option>
                    <option value="stream">Stream, canal or spring</option>
                    <option value="rain">Rainwater only</option>
                    <option value="none">None yet</option>
                  </select>
                </Field>
                <Field label="Electricity" htmlFor="pw">
                  <select id="pw" className="input" value={draft.site.power} onChange={(e) => setSite('power', e.target.value as SiteConditions['power'])}>
                    <option value="grid">Grid power available</option>
                    <option value="solar_possible">No grid - solar possible</option>
                    <option value="none">None</option>
                  </select>
                </Field>
              </div>
              <label className="row"><input type="checkbox" className="check" checked={draft.site.floodProne} onChange={(e) => setSite('floodProne', e.target.checked)} /> The area floods or stays waterlogged in heavy rain</label>
              {draft.sectors.includes('fish') ? <label className="row"><input type="checkbox" className="check" checked={draft.site.brackishWater} onChange={(e) => setSite('brackishWater', e.target.checked)} /> Water is brackish (coastal / salty)</label> : null}
              {draft.sectors.includes('crops') ? <label className="row"><input type="checkbox" className="check" checked={draft.site.cool} onChange={(e) => setSite('cool', e.target.checked)} /> Cool highland climate (e.g. Benguet, Bukidnon, Tagaytay)</label> : null}
            </div>
          </Card>

          <div className="row between">
            <span className="muted small">
              {area <= 0 ? 'Enter your area to continue'
                : nameProblem?.existing ? 'Choose another project name to continue'
                  : nameProblem ? 'Name your project to continue' : `${area.toLocaleString()} sqm`}
            </span>
            <Button disabled={!valid1} onClick={() => setStep(2)}>Next</Button>
          </div>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="stack">
          <Card title="What do you want to grow or raise?">
            <ToggleChips label="What do you want to grow or raise?" value={draft.sectors} onToggle={toggleSector} items={TYPE_CHOICES} />
            {draft.sectors.length === 0 ? (
              <p className="field-error" role="alert" style={{ marginTop: 8 }}>{NO_TYPE}</p>
            ) : (
              <p className="small muted" style={{ marginTop: 8 }}>
                {mixed ? `Mixed farm: your land is split evenly, about ${landEach.toLocaleString()} sqm for each type, and one budget covers them all.` : 'Tap more than one to mix them, for example vegetables with fruits or fish.'}
              </p>
            )}
            {draft.sectors.map((sec) => (
              <Fragment key={sec}>
                <hr className="sep" />
                <Field label={`${PICK_LABEL[sec]} Pick one or more`}>
                  <div className="chips" role="group" aria-label={PICK_LABEL[sec]}>
                    {itemsFor(sec).map((i) => (
                      <span key={i.id} className="row" style={{ gap: 2 }}>
                        {pickChip(i)}
                        {i.custom ? (
                          <button type="button" className="icon-btn" aria-label={`Remove ${i.name} from my list`} title="Remove" onClick={() => {
                            if (!removeCustomItem(i.id)) return toast(`${i.name} is used in a saved plan or record, so it can't be removed.`);
                            set('preferred', draft.preferred.filter((x) => x !== i.id));
                          }}><LuX size={14} /></button>
                        ) : null}
                      </span>
                    ))}
                    <button type="button" className="chip" onClick={() => setAddFor(sec)}><LuPlus size={16} /> Add your own</button>
                  </div>
                </Field>
              </Fragment>
            ))}
            {draft.sectors.length ? <p className="hint" style={{ marginTop: 8 }}>Your plan uses exactly what you pick. Not sure? Leave a type empty and we'll suggest some below.</p> : null}
          </Card>
          <CustomItemSheet open={addFor !== null} onClose={() => setAddFor(null)} sector={addFor ?? 'crops'} onAdded={(item) => set('preferred', [...draft.preferred, item.id])} />
          <Card title="Budget and goals">
            <div className="form-grid">
              <Field label="Starting capital (PHP)" htmlFor="cap" hint="Include only money you can spend now. We'll scope the first phase to fit it.">
                <NumberInput id="cap" value={draft.capital} min={0} onChange={(n) => set('capital', n)} />
              </Field>
              <Field label="Your experience"><Chips seg value={draft.experience} onChange={(v) => set('experience', v)} items={[{ id: 'beginner', label: 'Beginner' }, { id: 'intermediate', label: 'Some' }, { id: 'advanced', label: 'Experienced' }]} /></Field>
              <Field label="Your goal" htmlFor="goal">
                <select id="goal" className="input" value={draft.goal} onChange={(e) => set('goal', e.target.value as Goal)}>
                  <option value="family">Food for my family</option>
                  <option value="family_sell">Family consumption + selling the extra</option>
                  <option value="commercial">Commercial: sell everything</option>
                </select>
              </Field>
            </div>
          </Card>
          {draft.sectors.length ? <ForecastCard result={preview} goal={draft.goal} capital={draft.capital > 0 ? draft.capital : undefined} picking={{
            sectors: draft.sectors,
            picked: draft.preferred,
            onAdd: (id) => { if (!draft.preferred.includes(id)) set('preferred', [...draft.preferred, id]); },
            onRemove: (id) => set('preferred', draft.preferred.filter((x) => x !== id)),
            onOpenPicker: () => setPickerOpen(true),
          }} /> : null}
          <Sheet open={pickerOpen} onClose={() => setPickerOpen(false)} title={mixed ? 'Add items' : `Add ${SECTOR_LABEL[draft.sectors[0] ?? 'crops'].toLowerCase()}`}>
            <div className="stack">
              <p className="small muted">Tap to add or remove. Each one gets its own harvest and price estimate.</p>
              {draft.sectors.map((sec) => (
                <div key={sec} className="stack sm">
                  {mixed ? <h3 className="small bold">{SECTOR_LABEL[sec]}</h3> : null}
                  <div className="chips">
                    {itemsFor(sec).map(pickChip)}
                    <button type="button" className="chip" onClick={() => { setPickerOpen(false); setAddFor(sec); }}><LuPlus size={16} /> Add your own</button>
                  </div>
                </div>
              ))}
              <Button block onClick={() => setPickerOpen(false)}>Done{draft.preferred.length ? ` (${draft.preferred.length} picked)` : ''}</Button>
            </div>
          </Sheet>
          <div className="row between"><Button variant="ghost" onClick={() => setStep(1)}>Back</Button>{draft.sectors.length ? null : <span className="small muted grow" style={{ textAlign: 'right' }}>Choose what to grow or raise</span>}<Button disabled={!valid2} onClick={() => setStep(3)}>Next</Button></div>
        </div>
      ) : null}

      {step === 3 ? (
        <div className="stack">
          <Card title="Review">
            <div className="kv">
              <span className="muted">Project</span><span className="bold">{cleanPlanName(draft.name)}</span>
              <span className="muted">Location</span><span className="bold">{draft.place.name}, {draft.place.province}</span>
              <span className="muted">Area</span><span className="bold">{area.toLocaleString()} sqm</span>
              <span className="muted">{mixed ? 'Types' : 'Type'}</span><span className="bold">{draft.sectors.map((sec) => SECTOR_LABEL[sec]).join(' + ')}</span>
              {mixed ? <><span className="muted">Land split</span><span className="bold">About {landEach.toLocaleString()} sqm for each type</span></> : null}
              <span className="muted">Picked</span>
              <span className="bold">
                {draft.sectors.map((sec) => {
                  const names = draft.preferred.filter((id) => catalogById(id)?.sector === sec).map((id) => catalogById(id)!.name);
                  const text = names.length ? names.join(', ') : "None: we'll suggest";
                  return <span key={sec} style={{ display: 'block' }}>{mixed ? `${SECTOR_LABEL[sec]}: ${text}` : text}</span>;
                })}
              </span>
              <span className="muted">Capital</span><span className="bold">{peso(draft.capital)}</span>
              <span className="muted">Experience</span><span className="bold" style={{ textTransform: 'capitalize' }}>{draft.experience}</span>
              <span className="muted">Site</span><span className="bold">{draft.site.slope} slope · {draft.site.sunlight.replace('full', 'full sun')} · {draft.site.waterSource === 'none' ? 'no water yet' : `${draft.site.waterSource} water`}{draft.site.floodProne ? ' · floods' : ''}</span>
              <span className="muted">Photos</span><span className="bold">{photos.length}{aiNotes.length ? ' (AI-analysed)' : ''}</span>
            </div>
          </Card>
          <Alert tone="blue" title="This is a planning draft">Costs and yields are estimates. A DA technician, BFAR officer or licensed engineer should review the water, drainage and electrical design before you build.</Alert>
          <div className="row between"><Button variant="ghost" onClick={() => setStep(2)}>Back</Button><Button onClick={generate} disabled={busy}>{busy ? <><Spinner /> Building your plan…</> : <><LuSparkles size={16} /> Generate plan</>}</Button></div>
        </div>
      ) : null}
    </div>
  );
}
