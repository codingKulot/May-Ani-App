import { useMemo, useState } from 'react';
import { LuDownload, LuPlus, LuTrash2 } from 'react-icons/lu';
import { navigate } from '@/core/router';
import { useAppState } from '@/core/store';
import {
  addExpense, addProduction, addSale, addTask, deleteExpense, deleteProduction, deleteSale, deleteTask, farmScoped, recordHarvest, toggleTask,
} from '@/core/actions';
import { allItems, catalogById } from '@/data/catalog';
import { addDays, isoDate, num, peso, peso2, prettyDate, sum } from '@/lib/format';
import { toCsv } from '@/lib/csv';
import { saveFile } from '@/lib/download';
import type { ExpenseCategory } from '@/types';
import { Badge, Button, Card, Empty, Field, NumberInput, PageHeader, Progress, Sheet, Stat, Tabs, askConfirm, toast } from '@/components/ui';
import { Donut } from '@/components/widgets';

type Tab = 'tasks' | 'expenses' | 'sales' | 'production' | 'reports';
const TAB_LIST: { id: Tab; label: string }[] = [
  { id: 'tasks', label: 'Tasks' }, { id: 'expenses', label: 'Expenses' }, { id: 'sales', label: 'Sales' },
  { id: 'production', label: 'Production' }, { id: 'reports', label: 'Reports' },
];
const CATS: ExpenseCategory[] = ['Seeds', 'Fertilizer', 'Feed', 'Tools', 'Labor', 'Utilities', 'Others'];

// Typo checks: numbers this big are usually an extra zero. The farmer can still save them after a second look.
const BIG_AMOUNT = 1_000_000; // pesos in one expense
const BIG_KG = 100_000; // kilos in one sale or harvest (100 tonnes)
const PRICE_TIMES_USUAL = 5; // a price per kg this many times the usual farm-gate price

/** "Is this right?" for a number that is unusually big. True means save it as typed. */
const askTypo = (title: string, typed: string) =>
  askConfirm({ title, message: `${typed}\nCheck that there is no extra zero.`, ok: 'Yes, save it', cancel: 'Let me fix it' });

/** The problem with a date from a date box, or '' when it is fine. `past`: it must be today or earlier (a sale, a cost). */
function dateProblem(date: string, past = false): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return 'Choose a date';
  if (past && date > isoDate()) return 'Choose today or an earlier date';
  return '';
}

export function Manage({ tab }: { tab: string }) {
  const t = (TAB_LIST.some((x) => x.id === tab) ? tab : 'tasks') as Tab;
  return (
    <div className="page narrow">
      <PageHeader title="Farm Management" sub="Tasks, money, harvests and reports in one place." />
      <Tabs tabs={TAB_LIST} value={t} onChange={(id) => navigate(`/manage/${id}`)} />
      {t === 'tasks' ? <Tasks /> : t === 'expenses' ? <Expenses /> : t === 'sales' ? <Sales /> : t === 'production' ? <Production /> : <Reports />}
    </div>
  );
}

function useScoped() {
  const s = useAppState();
  return {
    s,
    tasks: farmScoped(s.tasks, s.activeFarmId),
    expenses: farmScoped(s.expenses, s.activeFarmId),
    sales: farmScoped(s.sales, s.activeFarmId),
    production: farmScoped(s.production, s.activeFarmId),
  };
}

function Tasks() {
  const { s, tasks } = useScoped();
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(isoDate());
  const [time, setTime] = useState('');
  const today = isoDate();
  const sorted = [...tasks].sort((a, b) => Number(a.done) - Number(b.done) || a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? ''));
  const add = () => {
    if (!title.trim()) return toast('Type what needs to be done');
    if (dateProblem(date)) return toast(dateProblem(date));
    addTask({ title: title.trim(), date, time: time || undefined, farmId: s.activeFarmId });
    setTitle(''); setTime('');
  };
  return (
    <div className="stack">
      <Card title="Add a task">
        <div className="stack sm">
          <input className="input" aria-label="Task" placeholder="e.g. Water the beds, feed the fish" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
          <div className="row wrap">
            <input className="input" type="date" aria-label="Date" value={date} onChange={(e) => setDate(e.target.value)} style={{ width: 170 }} />
            <input className="input" type="time" aria-label="Time" value={time} onChange={(e) => setTime(e.target.value)} style={{ width: 130 }} />
            <span className="grow" />
            <Button onClick={add}><LuPlus size={16} /> Add</Button>
          </div>
        </div>
      </Card>
      <Card title="Your tasks">
        {sorted.length === 0 ? <Empty title="No tasks">Add your first task above. Plans you save create starter tasks for you.</Empty> : (
          <div className="list">
            {sorted.map((t) => (
              <div key={t.id} className="row">
                <input className="check" type="checkbox" checked={t.done} aria-label={`Done: ${t.title}`} onChange={() => toggleTask(t.id)} />
                <div className="grow">
                  <div className={t.done ? 'done' : 'bold'}>{t.title}</div>
                  <div className="small muted">{t.date === today ? 'Today' : prettyDate(t.date)}{t.time ? ` · ${t.time}` : ''}</div>
                </div>
                {!t.done && t.date < today ? <Badge tone="red">Overdue</Badge> : null}
                <button className="icon-btn" aria-label={`Delete ${t.title}`} onClick={() => deleteTask(t.id)}><LuTrash2 size={16} /></button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function Expenses() {
  const { s, expenses } = useScoped();
  const [open, setOpen] = useState(false);
  const total = sum(expenses.map((e) => e.amount));
  const byCat = CATS.map((c) => ({ label: c, value: sum(expenses.filter((e) => e.category === c).map((e) => e.amount)) })).filter((x) => x.value > 0);
  const month = isoDate().slice(0, 7);
  const monthTotal = sum(expenses.filter((e) => e.date.startsWith(month)).map((e) => e.amount));
  return (
    <div className="stack">
      <div className="grid stats">
        <Stat label="This month" value={peso(monthTotal)} />
        <Stat label="All time" value={peso(total)} />
      </div>
      <Card title="Where the money goes" action={<Button size="sm" onClick={() => setOpen(true)}><LuPlus size={14} /> Add expense</Button>}>
        {byCat.length === 0 ? <Empty title="No expenses yet">Log every peso you spend, even small ones. It shows if you are really earning.</Empty> : <Donut data={byCat} centerTop={peso(total)} centerBottom="Total expenses" />}
      </Card>
      {expenses.length > 0 ? (
        <Card title="Recent">
          <div className="list">
            {[...expenses].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30).map((e) => (
              <div key={e.id} className="row">
                <div className="grow"><div className="bold">{e.note || e.category}</div><div className="small muted">{e.category} · {prettyDate(e.date)}</div></div>
                <b>{peso(e.amount)}</b>
                <button className="icon-btn" aria-label="Delete expense" onClick={() => deleteExpense(e.id)}><LuTrash2 size={16} /></button>
              </div>
            ))}
          </div>
        </Card>
      ) : null}
      <ExpenseSheet open={open} onClose={() => setOpen(false)} farmId={s.activeFarmId} />
    </div>
  );
}

function ExpenseSheet({ open, onClose, farmId }: { open: boolean; onClose: () => void; farmId?: string }) {
  const [category, setCategory] = useState<ExpenseCategory>('Seeds');
  const [amount, setAmount] = useState(0);
  const [note, setNote] = useState('');
  const [date, setDate] = useState(isoDate());
  return (
    <Sheet open={open} onClose={onClose} title="Add expense">
      <div className="stack">
        <Field label="Category" htmlFor="ec"><select id="ec" className="input" value={category} onChange={(e) => setCategory(e.target.value as ExpenseCategory)}>{CATS.map((c) => <option key={c}>{c}</option>)}</select></Field>
        <Field label="Amount (₱)" htmlFor="ea" hint={amount > 0 ? `= ${peso2(amount)}` : undefined}><NumberInput id="ea" value={amount} min={0} onChange={setAmount} /></Field>
        <Field label="Note (optional)" htmlFor="en"><input id="en" className="input" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        <Field label="Date" htmlFor="ed"><input id="ed" type="date" className="input" max={isoDate()} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Button block onClick={async () => {
          if (!(amount > 0)) return toast('Enter an amount');
          if (dateProblem(date, true)) return toast(dateProblem(date, true));
          if (amount >= BIG_AMOUNT && !(await askTypo('Is this amount right?', `You typed ${peso2(amount)} for one expense.`))) return;
          addExpense({ category, amount, note: note.trim(), date, farmId }); setAmount(0); setNote(''); onClose(); toast('Expense added');
        }}>Save expense</Button>
      </div>
    </Sheet>
  );
}

function Sales() {
  const { s, sales } = useScoped();
  const [open, setOpen] = useState(false);
  const total = sum(sales.map((x) => x.kg * x.pricePerKg));
  return (
    <div className="stack">
      <div className="grid stats"><Stat label="Total sales" value={peso(total)} /><Stat label="Kg sold" value={Math.round(sum(sales.map((x) => x.kg))).toLocaleString()} /></div>
      <Card title="Sales" action={<Button size="sm" onClick={() => setOpen(true)}><LuPlus size={14} /> Record sale</Button>}>
        {sales.length === 0 ? <Empty title="No sales yet">Record each sale to see your real income and profit.</Empty> : (
          <div className="list">
            {[...sales].sort((a, b) => b.date.localeCompare(a.date)).map((x) => (
              <div key={x.id} className="row">
                <span className="thumb">{catalogById(x.itemId)?.emoji ?? '📦'}</span>
                <div className="grow"><div className="bold">{catalogById(x.itemId)?.name ?? x.itemId} · {x.kg} kg @ {peso(x.pricePerKg)}</div><div className="small muted">{prettyDate(x.date)}{x.buyer ? ` · ${x.buyer}` : ''}</div></div>
                <b>{peso(x.kg * x.pricePerKg)}</b>
                <button className="icon-btn" aria-label="Delete sale" onClick={() => deleteSale(x.id)}><LuTrash2 size={16} /></button>
              </div>
            ))}
          </div>
        )}
      </Card>
      <SaleSheet open={open} onClose={() => setOpen(false)} farmId={s.activeFarmId} />
    </div>
  );
}

function SaleSheet({ open, onClose, farmId }: { open: boolean; onClose: () => void; farmId?: string }) {
  const [itemId, setItemId] = useState(allItems()[0].id);
  const [kg, setKg] = useState(0);
  const [price, setPrice] = useState(0);
  const [buyer, setBuyer] = useState('');
  const [date, setDate] = useState(isoDate());
  const save = async () => {
    if (!(kg > 0 && price > 0)) return toast('Enter kilos and price');
    if (dateProblem(date, true)) return toast(dateProblem(date, true));
    const item = catalogById(itemId);
    const usual = item?.farmGatePerKg ?? 0;
    const odd = [
      kg >= BIG_KG ? `${num(kg)} kg sold` : '',
      usual > 0 && price > usual * PRICE_TIMES_USUAL ? `${peso2(price)} per kg (usually about ${peso(usual)} at the farm gate)` : '',
    ].filter(Boolean);
    if (odd.length && !(await askTypo('Please check this sale', `You typed ${odd.join(' and ')}.\nTotal: ${peso2(kg * price)}.`))) return;
    addSale({ itemId, kg, pricePerKg: price, buyer: buyer.trim() || undefined, date, farmId });
    setKg(0); setPrice(0); setBuyer(''); setDate(isoDate()); onClose(); toast('Sale recorded');
  };
  return (
    <Sheet open={open} onClose={onClose} title="Record a sale">
      <div className="stack">
        <Field label="Product" htmlFor="si"><select id="si" className="input" value={itemId} onChange={(e) => setItemId(e.target.value)}>{allItems().map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}</select></Field>
        <div className="grid cols-2">
          <Field label="Kilos sold" htmlFor="sk"><NumberInput id="sk" value={kg} min={0} onChange={setKg} /></Field>
          <Field label="Price per kg (₱)" htmlFor="sp"><NumberInput id="sp" value={price} min={0} onChange={setPrice} /></Field>
        </div>
        {kg > 0 && price > 0 ? <p className="small muted">Total: <b>{peso2(kg * price)}</b></p> : null}
        <Field label="Date sold" htmlFor="sd"><input id="sd" type="date" className="input" max={isoDate()} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Buyer (optional)" htmlFor="sb"><input id="sb" className="input" value={buyer} onChange={(e) => setBuyer(e.target.value)} /></Field>
        <Button block onClick={save}>Save sale</Button>
      </div>
    </Sheet>
  );
}

function Production() {
  const { s, production } = useScoped();
  const [open, setOpen] = useState(false);
  const [harvest, setHarvest] = useState<{ id: string; kg: number } | null>(null);
  const today = isoDate();
  return (
    <div className="stack">
      <Card title="Production records" action={<Button size="sm" onClick={() => setOpen(true)}><LuPlus size={14} /> Add</Button>}>
        {production.length === 0 ? <Empty title="No production records">Add what you planted or stocked and when. We estimate harvest dates for you.</Empty> : (
          <div className="list">
            {production.map((p) => {
              const c = catalogById(p.itemId);
              const ready = addDays(p.plantedOn, c?.daysToHarvest ?? 60);
              const elapsed = Math.max(0, (new Date(today).getTime() - new Date(p.plantedOn).getTime()) / 86_400_000);
              const pct = c ? (elapsed / c.daysToHarvest) * 100 : 0;
              return (
                <div key={p.id} className="stack sm">
                  <div className="row">
                    <span className="thumb">{c?.emoji ?? '🌱'}</span>
                    <div className="grow"><div className="bold">{c?.name ?? p.itemId} · {p.areaSqm} sqm</div><div className="small muted">Started {prettyDate(p.plantedOn)} · ready ≈ {prettyDate(ready)}</div></div>
                    <button className="icon-btn" aria-label="Delete record" onClick={() => deleteProduction(p.id)}><LuTrash2 size={16} /></button>
                  </div>
                  <div className="row"><div className="grow"><Progress value={pct} label="Growth progress" /></div><span className="small">{Math.min(100, Math.round(pct))}%</span></div>
                  <div className="row wrap">
                    {p.harvestedKg ? <Badge>{p.harvestedKg} kg harvested</Badge> : <Badge tone="gray">Not harvested yet</Badge>}
                    <span className="grow" />
                    <Button size="sm" variant="secondary" onClick={() => setHarvest({ id: p.id, kg: 0 })}>Record harvest</Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
      <ProductionSheet open={open} onClose={() => setOpen(false)} farmId={s.activeFarmId} />
      <Sheet open={!!harvest} onClose={() => setHarvest(null)} title="Record harvest">
        {harvest ? (
          <div className="stack">
            <Field label="Kilos harvested" htmlFor="hk"><NumberInput id="hk" value={harvest.kg} min={0} onChange={(kg) => setHarvest({ ...harvest, kg })} /></Field>
            <Button block onClick={async () => {
              if (!(harvest.kg > 0)) return toast('Enter the kilos');
              if (harvest.kg >= BIG_KG && !(await askTypo('Is this harvest right?', `You typed ${num(harvest.kg)} kg.`))) return;
              recordHarvest(harvest.id, harvest.kg); setHarvest(null); toast('Harvest recorded');
            }}>Save harvest</Button>
          </div>
        ) : null}
      </Sheet>
    </div>
  );
}

function ProductionSheet({ open, onClose, farmId }: { open: boolean; onClose: () => void; farmId?: string }) {
  const [itemId, setItemId] = useState(allItems()[0].id);
  const [area, setArea] = useState(0);
  const [date, setDate] = useState(isoDate());
  return (
    <Sheet open={open} onClose={onClose} title="Add production record">
      <div className="stack">
        <Field label="What did you plant or stock?" htmlFor="pi"><select id="pi" className="input" value={itemId} onChange={(e) => setItemId(e.target.value)}>{allItems().map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}</select></Field>
        <Field label="Area (sqm)" htmlFor="pa"><NumberInput id="pa" value={area} min={0} onChange={setArea} /></Field>
        <Field label="Started on" htmlFor="pd"><input id="pd" type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Button block onClick={() => { if (!(area > 0)) return toast('Enter the area'); if (dateProblem(date)) return toast(dateProblem(date)); addProduction({ itemId, areaSqm: area, plantedOn: date, farmId }); setArea(0); onClose(); toast('Record added'); }}>Save record</Button>
      </div>
    </Sheet>
  );
}

function Reports() {
  const { expenses, sales, production } = useScoped();
  const income = sum(sales.map((x) => x.kg * x.pricePerKg));
  const cost = sum(expenses.map((x) => x.amount));
  const months = useMemo(() => {
    const m = new Map<string, { income: number; cost: number }>();
    for (const x of sales) { const k = x.date.slice(0, 7); const r = m.get(k) ?? { income: 0, cost: 0 }; r.income += x.kg * x.pricePerKg; m.set(k, r); }
    for (const x of expenses) { const k = x.date.slice(0, 7); const r = m.get(k) ?? { income: 0, cost: 0 }; r.cost += x.amount; m.set(k, r); }
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 12);
  }, [sales, expenses]);
  const perItem = useMemo(() => {
    const m = new Map<string, number>();
    for (const x of sales) m.set(x.itemId, (m.get(x.itemId) ?? 0) + x.kg * x.pricePerKg);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [sales]);
  const maxBar = Math.max(1, ...months.map(([, v]) => Math.max(v.income, v.cost)));

  const exportCsv = () => {
    const rows = [['type', 'date', 'item/category', 'note', 'kg', 'price_per_kg', 'amount_php']];
    sales.forEach((x) => rows.push(['sale', x.date, catalogById(x.itemId)?.name ?? x.itemId, x.buyer ?? '', String(x.kg), String(x.pricePerKg), String(x.kg * x.pricePerKg)]));
    expenses.forEach((x) => rows.push(['expense', x.date, x.category, x.note, '', '', String(-x.amount)]));
    production.forEach((x) => rows.push(['production', x.plantedOn, catalogById(x.itemId)?.name ?? x.itemId, `${x.areaSqm} sqm`, String(x.harvestedKg ?? ''), '', '']));
    saveFile(`may-ani-report-${isoDate()}.csv`, toCsv(rows), 'text/csv;charset=utf-8');
  };

  return (
    <div className="stack">
      <div className="grid stats">
        <Stat label="Income" value={peso(income)} tone="green" />
        <Stat label="Expenses" value={peso(cost)} tone="orange" />
        <Stat label="Profit" value={peso(income - cost)} tone={income - cost >= 0 ? 'green' : 'red'} sub={income - cost >= 0 ? 'You are earning' : 'Spending more than earning'} />
        <Stat label="Harvested" value={`${Math.round(sum(production.map((p) => p.harvestedKg ?? 0))).toLocaleString()} kg`} />
      </div>
      <Card title="Month by month" action={<Button size="sm" variant="secondary" onClick={exportCsv}><LuDownload size={14} /> Export CSV</Button>}>
        {months.length === 0 ? <Empty title="No data yet">Record sales and expenses to see monthly profit and loss.</Empty> : (
          <div className="stack sm">
            {months.map(([k, v]) => (
              <div key={k} className="stack sm" style={{ gap: 4 }}>
                <div className="row between"><b className="small">{new Date(`${k}-01T00:00:00`).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })}</b><span className={`small bold ${v.income - v.cost < 0 ? 'neg' : ''}`}>{v.income - v.cost >= 0 ? '+' : '−'}{peso(Math.abs(v.income - v.cost))}</span></div>
                <div className="row"><span className="tiny" style={{ width: 52 }}>Income</span><div className="grow"><Progress value={(v.income / maxBar) * 100} label="Income" /></div><span className="tiny" style={{ width: 70, textAlign: 'right' }}>{peso(v.income)}</span></div>
                <div className="row"><span className="tiny" style={{ width: 52 }}>Costs</span><div className="grow"><Progress value={(v.cost / maxBar) * 100} warn label="Costs" /></div><span className="tiny" style={{ width: 70, textAlign: 'right' }}>{peso(v.cost)}</span></div>
              </div>
            ))}
          </div>
        )}
      </Card>
      {perItem.length > 0 ? (
        <Card title="Income by product">
          <div className="list">{perItem.map(([id, v]) => <div key={id} className="row"><span className="thumb">{catalogById(id)?.emoji}</span><div className="grow bold">{catalogById(id)?.name ?? id}</div><b>{peso(v)}</b></div>)}</div>
        </Card>
      ) : null}
    </div>
  );
}
