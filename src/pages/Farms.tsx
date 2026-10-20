import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { LuApple, LuFish, LuLeaf, LuPlus, LuSparkles, LuSprout, LuTractor, LuTrash2 } from 'react-icons/lu';
import { Link, navigate } from '@/core/router';
import { useAppState } from '@/core/store';
import { addExistingFarm, removeFarm, setActiveFarm } from '@/core/actions';
import { DEFAULT_PLACE, placeLabel } from '@/data/places';
import { SECTOR_LABEL, catalogById, itemsFor, planSectors, sectorsLabel } from '@/data/catalog';
import { isoDate, peso, sum } from '@/lib/format';
import {
  NO_FARM_TYPE, TENURE_LABEL, WATER_LABEL, areaFieldLabel, checkFarmForm, itemsTitle, nameHint, startedLabel, toSqm, toggleFarmSector,
  type FarmFormErrors, type FarmFormInput, type FarmLine,
} from '@/services/farmForm';
import type { LandTenure, Sector, WaterSource } from '@/types';
import { Badge, Button, Card, Chips, Empty, Field, LinkButton, NumberInput, PageHeader, Sheet, Stat, ToggleChips, askConfirm, toast } from '@/components/ui';
import { PlaceSelect } from '@/components/widgets';

const areaLabel = (sqm: number) => (sqm >= 10000 ? `${(sqm / 10000).toFixed(2)} ha` : `${sqm} sqm`);

export function Farms() {
  const s = useAppState();
  const [open, setOpen] = useState(false);
  const drafts = s.plans.filter((p) => !p.farmId);

  return (
    <div className="page narrow">
      <PageHeader
        title="My Farms"
        sub="Everything you run, in one place."
        actions={<><Button variant="secondary" size="sm" onClick={() => setOpen(true)}><LuPlus size={16} /> I already have a farm</Button><LinkButton to="/planner" size="sm"><LuSparkles size={16} /> New plan</LinkButton></>}
      />
      {s.farms.length === 0 ? (
        <Card><Empty title="No farms yet" action={<div className="row wrap" style={{ justifyContent: 'center' }}><LinkButton to="/planner"><LuSparkles size={16} /> Create a plan with AI</LinkButton><Button variant="secondary" onClick={() => setOpen(true)}><LuPlus size={16} /> I already have a farm</Button></div>}>Starting something new? Make a plan and we'll set up your farm, production records and first tasks. Already farming? Add your farm and start keeping records right away.</Empty></Card>
      ) : (
        <div className="grid cols-2">
          {s.farms.map((f) => (
            <Link key={f.id} to={`/farms/${f.id}`} className="card item" >
              <span className="thumb"><LuSprout size={24} color="#0f6b3a" /></span>
              <div className="grow">
                <div className="bold">{f.name}</div>
                <div className="small muted">{sectorsLabel(planSectors(f))} · {areaLabel(f.areaSqm)}</div>
                <div className="tiny faint">{placeLabel(f.location)}</div>
              </div>
              {s.activeFarmId === f.id ? <Badge>Active</Badge> : null}
            </Link>
          ))}
        </div>
      )}

      {drafts.length > 0 ? (
        <div style={{ marginTop: 18 }}>
          <Card title="Draft plans">
            <div className="list">
              {drafts.map((p) => (
                <Link key={p.id} to={`/plan/${p.id}`} className="item">
                  <div className="grow"><div className="bold">{p.result.title}</div><div className="small muted">{areaLabel(p.input.areaSqm)} · {peso(p.input.capital)} budget · start-up {peso(p.result.cost.initial)}</div></div>
                  <Badge tone="orange">Draft</Badge>
                </Link>
              ))}
            </div>
          </Card>
        </div>
      ) : null}

      <AddFarm open={open} onClose={() => setOpen(false)} />
    </div>
  );
}

/** Same words and icons as the planner's type buttons. */
const TYPE_CHOICES: { id: Sector; label: string; icon: ReactNode }[] = [
  { id: 'crops', label: 'Vegetables & crops', icon: <LuLeaf size={16} /> },
  { id: 'fruits', label: 'Fruits', icon: <LuApple size={16} /> },
  { id: 'fish', label: 'Fish', icon: <LuFish size={16} /> },
  { id: 'livestock', label: 'Livestock', icon: <LuTractor size={16} /> },
];

function AddFarm({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { profile } = useAppState();
  const blank = (): FarmFormInput => ({ name: '', sectors: ['crops'], area: 0, unit: 'sqm', location: profile?.location ?? DEFAULT_PLACE, barangay: '', notes: '', lines: [] });
  const [f, setF] = useState<FarmFormInput>(blank);
  const [tried, setTried] = useState(false);
  const rowSeq = useRef(0);
  const set = (patch: Partial<FarmFormInput>) => setF((x) => ({ ...x, ...patch }));
  const setLine = (i: number, patch: Partial<FarmLine>) => set({ lines: f.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) });
  const mixed = f.sectors.length > 1;
  const items = f.sectors.flatMap(itemsFor);
  const options = (sec: Sector) => itemsFor(sec).map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>);
  const errors = checkFarmForm(f);
  const err = (k: keyof FarmFormErrors) => (tried && errors[k] ? <span className="field-error" role="alert">{errors[k]}</span> : undefined);
  const close = () => { onClose(); setF(blank()); setTried(false); };

  const submit = () => {
    setTried(true);
    if (Object.keys(errors).length) return;
    const farm = addExistingFarm(f);
    toast('Farm added');
    close();
    navigate(`/farms/${farm.id}`);
  };

  return (
    <Sheet open={open} onClose={close} title="Add a farm you already run">
      <div className="stack">
        <p className="small muted">Only the first part is needed. The rest helps with weather tips, records and reports, and you can skip it.</p>

        <div className="form-section">
          <h3>Your farm</h3>
          <Field label="Farm name" htmlFor="fn" hint={err('name')}><input id="fn" className="input" value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder={nameHint(f.sectors)} /></Field>
          {/* The "choose at least one" message shows at once, like in the planner, not only after "Add farm". */}
          <Field label="What kind of farm?" hint={f.sectors.length === 0 ? <span className="field-error" role="alert">{NO_FARM_TYPE}</span> : mixed ? 'Mixed farm: add what is on each part below.' : 'Tap more than one for a mixed farm, for example vegetables with fish.'}>
            <ToggleChips label="What kind of farm?" value={f.sectors} onToggle={(id) => setF((x) => toggleFarmSector(x, id))} items={TYPE_CHOICES} />
          </Field>
          <Field label={areaFieldLabel(f.sectors)} htmlFor="fa" hint={err('area') ?? (f.unit === 'ha' && f.area > 0 ? `= ${toSqm(f.area, 'ha').toLocaleString()} sqm` : '1 hectare = 10,000 sqm')}>
            <div className="input-group">
              <NumberInput id="fa" value={f.area} min={0} onChange={(area) => set({ area })} placeholder="0" />
              <Chips seg value={f.unit} onChange={(unit) => set({ unit })} items={[{ id: 'sqm', label: 'sqm' }, { id: 'ha', label: 'hectares' }]} />
            </div>
          </Field>
          <div className="form-grid two">
            <Field label="Town / city"><PlaceSelect value={f.location} onChange={(location) => set({ location })} /></Field>
            <Field label="Barangay or sitio (optional)" htmlFor="fb"><input id="fb" className="input" value={f.barangay} onChange={(e) => set({ barangay: e.target.value })} placeholder="e.g. Brgy. San Isidro" /></Field>
          </div>
        </div>

        <div className="form-section">
          <h3>{itemsTitle(f.sectors)} <span className="faint small">(optional)</span></h3>
          <p className="small muted" style={{ marginTop: -6 }}>Each one becomes a production record, so you can log harvests and sales right away.</p>
          {f.lines.map((l, i) => (
            <div key={l.row ?? i} className="line-item">
              <Field label="Item" htmlFor={`li${i}`}>
                <select id={`li${i}`} className="input" value={l.itemId} onChange={(e) => setLine(i, { itemId: e.target.value })}>
                  {mixed ? f.sectors.map((sec) => <optgroup key={sec} label={SECTOR_LABEL[sec]}>{options(sec)}</optgroup>) : options(f.sectors[0])}
                </select>
              </Field>
              <Field label="Area (sqm)" htmlFor={`la${i}`}><NumberInput id={`la${i}`} value={l.areaSqm} min={0} onChange={(areaSqm) => setLine(i, { areaSqm })} placeholder="0" /></Field>
              <div className="date"><Field label={startedLabel(l.itemId, f.sectors[0] ?? 'crops')} htmlFor={`ld${i}`}><input id={`ld${i}`} type="date" className="input" max={isoDate()} value={l.startedOn} onChange={(e) => setLine(i, { startedOn: e.target.value })} /></Field></div>
              <button type="button" className="icon-btn del" aria-label="Remove item" onClick={() => set({ lines: f.lines.filter((_, j) => j !== i) })}><LuTrash2 size={16} /></button>
            </div>
          ))}
          {err('lines')}
          {items.length ? <div><Button variant="secondary" size="sm" onClick={() => set({ lines: [...f.lines, { row: ++rowSeq.current, itemId: items[0].id, areaSqm: 0, startedOn: isoDate() }] })}><LuPlus size={14} /> Add {f.lines.length ? 'another' : 'an item'}</Button></div> : null}
        </div>

        <div className="form-section">
          <h3>More about your farm <span className="faint small">(optional)</span></h3>
          <Field label="Land"><Chips value={f.tenure ?? ('' as LandTenure)} onChange={(tenure) => set({ tenure: f.tenure === tenure ? undefined : tenure })} items={(Object.keys(TENURE_LABEL) as LandTenure[]).map((id) => ({ id, label: TENURE_LABEL[id] }))} /></Field>
          <div className="form-grid two">
            <Field label="Main water source" htmlFor="fw"><select id="fw" className="input" value={f.waterSource ?? ''} onChange={(e) => set({ waterSource: (e.target.value || undefined) as WaterSource | undefined })}><option value="">Choose…</option>{(Object.keys(WATER_LABEL) as WaterSource[]).map((id) => <option key={id} value={id}>{WATER_LABEL[id]}</option>)}</select></Field>
            <Field label="Farming here since (year)" htmlFor="fy" hint={err('sinceYear')}><NumberInput id="fy" value={f.sinceYear ?? 0} min={1900} max={new Date().getFullYear()} onChange={(sinceYear) => set({ sinceYear: sinceYear || undefined })} placeholder={`e.g. ${new Date().getFullYear() - 5}`} /></Field>
          </div>
          <Field label="Notes" htmlFor="fnotes"><textarea id="fnotes" className="input" value={f.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="e.g. Floods near the creek in August. Buyer: Aling Nena at the bagsakan." /></Field>
        </div>

        <Button block onClick={submit}>Add farm</Button>
      </div>
    </Sheet>
  );
}

export function FarmDetail({ id }: { id: string }) {
  const s = useAppState();
  const farm = s.farms.find((f) => f.id === id);
  if (!farm) return <div className="page narrow"><Empty icon="🌾" title="Farm not found" action={<LinkButton to="/farms">Back to My Farms</LinkButton>} /></div>;

  const mine = <T extends { farmId?: string }>(xs: T[]) => xs.filter((x) => x.farmId === id);
  const exp = sum(mine(s.expenses).map((e) => e.amount));
  const sales = sum(mine(s.sales).map((x) => x.kg * x.pricePerKg));
  const prod = mine(s.production);
  const tasksOpen = mine(s.tasks).filter((t) => !t.done).length;
  const plan = farm.planId ? s.plans.find((p) => p.id === farm.planId) : undefined;

  return (
    <div className="page narrow">
      <PageHeader
        title={farm.name}
        sub={`${sectorsLabel(planSectors(farm))} · ${areaLabel(farm.areaSqm)} · ${farm.barangay ? `${farm.barangay}, ` : ''}${placeLabel(farm.location)}`}
        actions={<>
          {s.activeFarmId !== id ? <Button size="sm" variant="secondary" onClick={() => { setActiveFarm(id); toast('Set as active farm'); }}>Make active</Button> : <Badge>Active</Badge>}
          <Button size="sm" variant="danger" title="Delete farm" onClick={async () => {
            if (!(await askConfirm({
              title: `Delete "${farm.name}"?`,
              message: 'Its tasks, expenses, sales and production records are deleted too. Plans made for it are kept. This cannot be undone.',
              ok: 'Delete farm', danger: true,
            }))) return;
            removeFarm(id); navigate('/farms');
          }}><LuTrash2 size={14} /></Button>
        </>}
      />
      <div className="grid stats" style={{ marginBottom: 14 }}>
        <Stat tone="red" label="Expenses" value={peso(exp)} />
        <Stat tone="green" label="Sales" value={peso(sales)} />
        <Stat tone="blue" label="Open tasks" value={tasksOpen} />
        <Stat tone={sales - exp >= 0 ? 'green' : 'orange'} label="Profit so far" value={peso(sales - exp)} />
      </div>
      <div className="stack">
        <Card title="In production">
          {prod.length === 0 ? <Empty icon="🌱" title="Nothing recorded yet" action={<LinkButton to="/manage/production" size="sm" variant="secondary">Add production</LinkButton>} /> : (
            <div className="list">{prod.map((p) => { const it = catalogById(p.itemId); return <div key={p.id} className="item"><span className="thumb">{it?.emoji}</span><div className="grow"><div className="bold">{it?.name}</div><div className="small muted">{p.areaSqm} sqm · started {p.plantedOn}{p.harvestedKg ? ` · harvested ${p.harvestedKg} kg` : ''}</div></div></div>; })}</div>
          )}
        </Card>
        {farm.tenure || farm.waterSource || farm.sinceYear || farm.notes ? (
          <Card title="Farm details">
            <div className="list">
              {farm.tenure ? <div className="row between"><span className="muted">Land</span><span>{TENURE_LABEL[farm.tenure]}</span></div> : null}
              {farm.waterSource ? <div className="row between"><span className="muted">Water source</span><span>{WATER_LABEL[farm.waterSource]}</span></div> : null}
              {farm.sinceYear ? <div className="row between"><span className="muted">Farming here since</span><span>{farm.sinceYear}</span></div> : null}
              {farm.notes ? <div><div className="muted small">Notes</div><p style={{ whiteSpace: 'pre-wrap' }}>{farm.notes}</p></div> : null}
            </div>
          </Card>
        ) : null}
        {plan ? <Card title="Plan"><div className="row between"><div><div className="bold">{plan.result.title}</div><div className="small muted">Start-up {peso(plan.result.cost.initial)}</div></div><LinkButton to={`/plan/${plan.id}`} size="sm" variant="secondary">View plan</LinkButton></div></Card> : null}
        <div className="grid cols-3">
          <LinkButton to="/manage/tasks" variant="secondary">Tasks</LinkButton>
          <LinkButton to="/manage/expenses" variant="secondary">Expenses</LinkButton>
          <LinkButton to="/manage/reports" variant="secondary">Reports</LinkButton>
        </div>
      </div>
    </div>
  );
}
