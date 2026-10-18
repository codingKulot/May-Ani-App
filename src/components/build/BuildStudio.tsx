import { useEffect, useMemo, useState } from 'react';
import { LuCamera, LuImage, LuSparkles } from 'react-icons/lu';
import { updatePlanBuild } from '@/core/actions';
import { useAppState } from '@/core/store';
import { catalogById } from '@/data/catalog';
import { recyclableById } from '@/data/recyclables';
import { fileToImagePayload } from '@/lib/image';
import { loadPhotos, loadRender, saveRender, savePhotos, toPayload, toStored, type StoredPhoto } from '@/lib/photoStore';
import { peso } from '@/lib/format';
import { aiRenderPicture, aiSiteSurvey, serverStatus, type ServerStatus } from '@/services/ai';
import { generateDesigns, priceDesign, type BuildDesign, type DesignId, type Surface } from '@/services/build/designs';
import { buildImagePrompt } from '@/services/build/prompt';
import type { PlanBuild, SavedPlan } from '@/types';
import { Alert, Button, Card, Chips, Empty, Spinner, toast } from '@/components/ui';
import { AiSetupHelp } from '@/components/AiSetupHelp';
import { MaterialsCard } from './MaterialsCard';
import { RecyclingCard } from './RecyclingCard';
import { BuildSteps } from './BuildSteps';

const EMPTY: PlanBuild = { recyclables: [], onSite: [], notes: [] };
const ON_SITE = [
  { id: 'shade_net', label: 'Shade net' }, { id: 'gravel', label: 'Gravel' }, { id: 'drum_200l', label: 'Water drum' },
  { id: 'bamboo_pole', label: 'Bamboo poles' }, { id: 'trellis_net', label: 'Trellis net' }, { id: 'garden_hose', label: 'Garden hose' },
];
const DESIGN_IDS: DesignId[] = ['raised', 'containers', 'vertical'];
const toggle = (arr: string[], id: string) => (arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]);
type Status = 'idle' | 'working' | 'error';

function PictureSetupHelp({ serverUp }: { serverUp: boolean }) {
  return (
    <details className="small">
      <summary className="bold" style={{ cursor: 'pointer' }}>How to switch on realistic pictures</summary>
      <div className="stack sm" style={{ marginTop: 8 }}>
        <p>Claude (the AI that reads your photo) cannot draw pictures, so May-Ani uses a separate image service with <b>your own key</b>. Each picture costs a small amount on your account at that service. Check their current price before you start.</p>
        <ol style={{ margin: 0, paddingLeft: 18 }}>
          <li>Pick one: Google AI Studio (<a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">aistudio.google.com/apikey</a>) or OpenAI (<a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer">platform.openai.com/api-keys</a>). Create a key and make sure the account has credit.</li>
          <li>Open the <code>.env</code> file in your May-Ani folder and add one line: <code>GEMINI_API_KEY=your-key</code> or <code>OPENAI_API_KEY=your-key</code>. Save it.</li>
          <li>{serverUp ? 'Stop the May-Ani server (Ctrl+C in its window) and start it again with ' : 'Start the May-Ani server with '}<code>bun run server</code>. Its first line should say <code>pictures: gemini</code> or <code>pictures: openai</code>.</li>
          <li>Come back here and press the button. If it says the model was not found, set <code>GEMINI_IMAGE_MODEL</code> or <code>OPENAI_IMAGE_MODEL</code> in <code>.env</code> to a current image model name from your provider.</li>
        </ol>
      </div>
    </details>
  );
}

/**
 * Layout > ideas for your site. One photo in, three pictures out (one per design), each with its own
 * materials, current prices, recycling options and measured build steps below.
 */
export function BuildStudio({ plan }: { plan: SavedPlan }) {
  const { materialPrices } = useAppState();
  const build = plan.build ?? EMPTY;
  const [photos, setPhotos] = useState<StoredPhoto[] | null>(null);
  const [renders, setRenders] = useState<Partial<Record<DesignId, string>>>({});
  const [status, setStatus] = useState<Partial<Record<DesignId, Status>>>({});
  const [errors, setErrors] = useState<string[]>([]);
  const [readNote, setReadNote] = useState<string | null>(null);
  const [analysing, setAnalysing] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'blue' | 'orange' | 'green'; text: string } | null>(null);
  const [server, setServer] = useState<ServerStatus | null | undefined>(undefined);
  const [seen, setSeen] = useState<{ reusable: string[]; onSite: string[] }>({ reusable: [], onSite: [] });

  useEffect(() => { let alive = true; loadPhotos(plan.id).then((p) => { if (alive) setPhotos(p); }); return () => { alive = false; }; }, [plan.id]);
  useEffect(() => { serverStatus().then(setServer); }, []);
  useEffect(() => {
    let alive = true;
    Promise.all(DESIGN_IDS.map((d) => loadRender(plan.id, d))).then((r) => {
      if (alive) setRenders(Object.fromEntries(DESIGN_IDS.flatMap((d, i) => (r[i] ? [[d, r[i]]] : []))));
    });
    return () => { alive = false; };
  }, [plan.id]);

  const surface: Surface = build.surface ?? 'soil';
  const designId: DesignId = build.design ?? 'raised';
  const { layout, allocations } = plan.result;
  const isCrops = plan.input.sector === 'crops';
  const designsFor = (sf: Surface): BuildDesign[] => (isCrops ? generateDesigns({ layout, allocations, surface: sf, sunlight: plan.input.site.sunlight }) : []);
  const designs = useMemo(
    () => (isCrops ? generateDesigns({ layout, allocations, surface, sunlight: plan.input.site.sunlight }) : []),
    [isCrops, plan.input.site.sunlight, layout, allocations, surface],
  );
  const design = designs.find((d) => d.id === designId) ?? designs[0];
  const priced = useMemo(
    () => designs.map((d) => priceDesign(d, { overrides: materialPrices, recyclables: build.recyclables, onSite: build.onSite })),
    [designs, materialPrices, build.recyclables, build.onSite],
  );
  const idx = Math.max(0, designs.findIndex((d) => d.id === design?.id));
  const photo = photos?.[0];

  if (!isCrops || designs.length === 0) {
    return (
      <Card title="Ideas for your site">
        <Empty icon="🛠️" title="Build ideas are for crop gardens">The pictures, materials list and step-by-step build currently cover vegetable and crop plans up to 600 sqm. Fish and livestock builds are not covered yet.</Empty>
      </Card>
    );
  }

  const set = (patch: Partial<PlanBuild>) => updatePlanBuild(plan.id, patch);
  const busy = analysing || DESIGN_IDS.some((d) => status[d] === 'working');

  const addPhoto = async (files: FileList | null) => {
    const f = files?.[0];
    if (!f) return;
    try {
      const p = toStored(await fileToImagePayload(f));
      await savePhotos(plan.id, [p]);
      setPhotos([p]);
      set({ aiUsed: false });
      setMsg({ tone: 'blue', text: 'Photo added. Press the green button to get 3 ideas.' });
    } catch (e) {
      toast(e instanceof Error ? e.message : 'That photo could not be used.');
    }
  };

  const reuseNames = build.recyclables.map((id) => recyclableById(id)?.label.toLowerCase() ?? '').filter(Boolean);
  const onSiteNames = build.onSite.map((id) => ON_SITE.find((o) => o.id === id)?.label.toLowerCase() ?? '').filter(Boolean);

  const drawOne = async (d: BuildDesign, sf: Surface): Promise<string | null> => {
    if (!photo) return null;
    setStatus((s) => ({ ...s, [d.id]: 'working' }));
    try {
      const prompt = buildImagePrompt({ design: d, surface: sf, nameOf: (id) => catalogById(id)?.name ?? id, reuse: reuseNames, onSite: onSiteNames });
      const url = await aiRenderPicture(toPayload(photo), prompt);
      await saveRender(plan.id, d.id, url);
      setRenders((r) => ({ ...r, [d.id]: url }));
      setStatus((s) => ({ ...s, [d.id]: 'idle' }));
      return null;
    } catch (e) {
      setStatus((s) => ({ ...s, [d.id]: 'error' }));
      return `${d.title}: ${e instanceof Error ? e.message : 'the picture could not be made.'}`;
    }
  };

  /** Reads the photo with Claude (if it is switched on), then draws all three designs. Reading is optional: a failure never blocks the pictures. */
  const makeAll = async () => {
    if (!photo) return;
    setMsg(null); setErrors([]); setReadNote(null);
    const st = await serverStatus(true);
    setServer(st);
    if (!st?.render) { setMsg({ tone: 'orange', text: st ? 'Picture making is not switched on yet. The setup steps are below.' : 'The May-Ani server is not running, so no pictures can be made. The setup steps are below.' }); return; }
    let sf = surface;
    if (st.ai) {
      setAnalysing(true);
      try {
        const sv = await aiSiteSurvey(toPayload(photo));
        sf = sv.surface ? (sv.surface === 'mixed' ? 'hard' : sv.surface) : surface;
        set({ aiUsed: true, notes: sv.notes, surface: sf });
        setSeen({ reusable: sv.reusable, onSite: sv.onSite });
      } catch (e) {
        setReadNote(`The AI could not read the photo (${e instanceof Error ? e.message : 'unknown error'}). The pictures are made anyway.`);
      } finally {
        setAnalysing(false);
      }
    }
    const results = await Promise.all(designsFor(sf).map((d) => drawOne(d, sf)));
    const errs = results.filter((r): r is string => !!r);
    setErrors(errs);
    if (errs.length < results.length) setMsg({ tone: 'green', text: errs.length ? 'Some pictures are ready. See below for the ones that failed.' : 'Your 3 ideas are ready. Tap one to see its materials, prices and build steps.' });
  };

  const adoptSeen = () => {
    set({ recyclables: [...new Set([...build.recyclables, ...seen.reusable])], onSite: [...new Set([...build.onSite, ...seen.onSite])] });
    setSeen({ reusable: [], onSite: [] });
  };

  return (
    <div className="stack">
      <Card title="3 ideas for your site">
        {!photo ? (
          <div className="stack">
            <p className="small">Add a photo of the spot where you will build. The AI looks at it and draws 3 different ways to build your garden there, each with its materials and current prices.</p>
            <label className="btn secondary" style={{ alignSelf: 'flex-start', cursor: 'pointer' }}>
              <LuCamera size={16} /> {photos === null ? 'Loading…' : 'Add a photo of your site'}
              <input type="file" accept="image/*" hidden onChange={(e) => { addPhoto(e.target.files); e.target.value = ''; }} />
            </label>
            <p className="tiny muted">The photo stays on this device until you ask for pictures. Without a photo you still get the materials list and the build steps below.</p>
          </div>
        ) : (
          <div className="stack">
            <div className="row wrap" style={{ gap: 12, alignItems: 'center' }}>
              <img src={photo.dataUrl} alt="Your site photo" style={{ width: 96, height: 72, objectFit: 'cover', borderRadius: 8 }} />
              <div className="row wrap" style={{ gap: 8 }}>
                <Button onClick={makeAll} disabled={busy}>{busy ? <><Spinner /> {analysing ? 'Reading your photo…' : 'Drawing your garden… up to 2 minutes'}</> : <><LuSparkles size={16} /> {Object.keys(renders).length ? 'Make 3 new pictures' : 'Analyze my photo and make 3 pictures'}</>}</Button>
                <label className="btn ghost sm" style={{ cursor: 'pointer' }}>Change photo<input type="file" accept="image/*" hidden onChange={(e) => { addPhoto(e.target.files); e.target.value = ''; }} /></label>
              </div>
            </div>
            {msg ? <Alert tone={msg.tone} title={msg.text} /> : null}
            {readNote ? <Alert tone="orange" title={readNote} /> : null}
            {errors.length ? <Alert tone="orange" title="Some pictures could not be made">{errors.map((e) => <div key={e}>{e}</div>)}</Alert> : null}
            {server === null || (server && !server.render) ? <PictureSetupHelp serverUp={server !== null} /> : null}
            {server === null || (server && !server.ai) ? <AiSetupHelp serverUp={server !== null} /> : null}
            {build.notes.length ? (
              <div className="small"><b>What the AI noticed about your site</b><ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{build.notes.map((n, i) => <li key={i}>{n}</li>)}</ul></div>
            ) : null}
            {seen.reusable.length + seen.onSite.length > 0 ? (
              <Alert tone="blue" title="The AI spotted things you could reuse" action={<Button size="sm" variant="secondary" onClick={adoptSeen}>Count them as mine</Button>}>
                They are marked “AI saw this” below. Only tick what you really have and can use.
              </Alert>
            ) : null}
          </div>
        )}

        <div className="design-grid" role="group" aria-label="Choose an idea" style={{ marginTop: 14 }}>
          {designs.map((d, i) => (
            <button key={d.id} type="button" className="design-card" aria-pressed={d.id === design.id} onClick={() => set({ design: d.id })}>
              {renders[d.id]
                ? <img src={renders[d.id]} alt={`AI picture: ${d.title}`} style={{ width: '100%', borderRadius: 8, display: 'block' }} />
                : <div className="design-ph" aria-hidden="true">{status[d.id] === 'working' ? <Spinner /> : ['🌱', '🪣', '🌿'][i]}</div>}
              <div className="bold">{d.title}</div>
              <div className="small muted">{d.tagline}</div>
              <div className="row between small" style={{ marginTop: 6 }}><span className="bold">{peso(priced[i].total)}</span><span className="muted">{d.growAreaSqm} sqm growing</span></div>
              {photo && !renders[d.id] && status[d.id] !== 'working' ? <span className="tiny muted">{status[d.id] === 'error' ? 'Picture failed' : 'No picture yet'}</span> : null}
            </button>
          ))}
        </div>
        {Object.keys(renders).length ? <p className="disclaimer">AI-made pictures are ideas, not plans: sizes, counts and materials in a picture can be off. Trust the measurements and the materials list below. They are saved on this device.</p> : null}
        {photo && !renders[design.id] && !busy ? (
          <div style={{ marginTop: 8 }}><Button size="sm" variant="secondary" onClick={async () => { const e = await drawOne(design, surface); setErrors(e ? [e] : []); }}><LuImage size={14} /> Make just “{design.title}”</Button></div>
        ) : null}
        <div className="grid cols-2" style={{ marginTop: 12 }}>
          <div className="small"><b>Good</b><ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{design.pros.map((p) => <li key={p}>{p}</li>)}</ul></div>
          <div className="small"><b>Think about</b><ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{design.cons.map((p) => <li key={p}>{p}</li>)}</ul></div>
        </div>
      </Card>

      <Card title="About your site">
        <div className="stack">
          <div>
            <div className="small bold" style={{ marginBottom: 6 }}>What is the ground like?</div>
            <Chips value={surface} onChange={(v) => set({ surface: v })} items={[{ id: 'soil', label: 'Soil or grass' }, { id: 'hard', label: 'Concrete or tiles' }, { id: 'gravel', label: 'Gravel' }]} />
          </div>
          <div>
            <div className="small bold" style={{ marginBottom: 6 }}>Already on site (nothing to buy)</div>
            <div className="chips" role="group" aria-label="Already on site">
              {ON_SITE.map((o) => (
                <button key={o.id} type="button" className={`chip ${build.onSite.includes(o.id) ? 'on' : ''}`} aria-pressed={build.onSite.includes(o.id)} onClick={() => set({ onSite: toggle(build.onSite, o.id) })}>
                  {o.label}{seen.onSite.includes(o.id) ? <span className="tiny"> · AI saw this</span> : null}
                </button>
              ))}
            </div>
          </div>
          <p className="tiny muted">Change these, then press the button again to redraw the pictures with them.</p>
        </div>
      </Card>

      <RecyclingCard design={design} selected={build.recyclables} onToggle={(id) => set({ recyclables: toggle(build.recyclables, id) })} seen={seen.reusable} overrides={materialPrices} onSite={build.onSite} />
      <MaterialsCard priced={priced[idx]} capital={plan.input.capital} initialEstimate={plan.result.cost.initial} />
      <BuildSteps design={design} />
    </div>
  );
}
