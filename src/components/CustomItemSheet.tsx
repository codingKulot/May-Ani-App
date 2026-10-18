import { useState } from 'react';
import { addCustomItem } from '@/core/actions';
import { buildCustomItem, SECTOR_LABEL } from '@/data/catalog';
import type { CatalogItem, Sector } from '@/types';
import { Alert, Button, Field, NumberInput, Sheet, toast } from './ui';

const EXAMPLES: Record<Sector, string> = { crops: 'e.g. Mango, Calamansi, Cassava', fish: 'e.g. Pangasius, Gourami, Shrimp', livestock: 'e.g. Hog, Quail, Duck' };

/**
 * "Add your own": for anything not on the built-in list. The grower gives a name and the price they expect
 * (the one number we can't guess); days and yield are optional, everything else is estimated from similar items.
 */
export function CustomItemSheet({ open, onClose, sector, onAdded }: { open: boolean; onClose: () => void; sector: Sector; onAdded: (item: CatalogItem) => void }) {
  const [name, setName] = useState('');
  const [price, setPrice] = useState(0);
  const [days, setDays] = useState(0);
  const [yieldKg, setYieldKg] = useState(0);
  const [error, setError] = useState('');

  const reset = () => { setName(''); setPrice(0); setDays(0); setYieldKg(0); setError(''); };
  const close = () => { reset(); onClose(); };

  const save = () => {
    const r = buildCustomItem({ name, sector, farmGatePerKg: price, daysToHarvest: days > 0 ? days : undefined, yieldKgPerSqm: yieldKg > 0 ? yieldKg : undefined });
    if (!r.ok) return setError(r.error);
    addCustomItem(r.item);
    onAdded(r.item);
    toast(`${r.item.name} added`);
    close();
  };

  return (
    <Sheet open={open} onClose={close} title={`Add your own (${SECTOR_LABEL[sector].toLowerCase()})`}>
      <div className="stack">
        <Field label="Name" htmlFor="ci-name" hint={EXAMPLES[sector]}>
          <input id="ci-name" className="input" value={name} maxLength={40} autoFocus onChange={(e) => { setName(e.target.value); setError(''); }} />
        </Field>
        <Field label="Price you expect to be paid (₱ per kg)" htmlFor="ci-price" hint="Ask a local buyer or trader. Livestock: price per kg live weight.">
          <NumberInput id="ci-price" value={price} min={0} onChange={(n) => { setPrice(n); setError(''); }} />
        </Field>
        <details>
          <summary className="small bold" style={{ cursor: 'pointer' }}>More details (optional, makes the plan more accurate)</summary>
          <div className="stack sm" style={{ marginTop: 10 }}>
            <Field label="Days until first harvest or sale" htmlFor="ci-days"><NumberInput id="ci-days" value={days} min={0} onChange={setDays} /></Field>
            <Field label="Kilos harvested per sqm per cycle" htmlFor="ci-yield"><NumberInput id="ci-yield" value={yieldKg} min={0} onChange={setYieldKg} /></Field>
          </div>
        </details>
        <Alert tone="blue" title="Estimates for the rest">Costs, water use and anything you leave blank are estimated from similar items, so the plan is a starting point. Confirm with your DA, BFAR or LGU technician.</Alert>
        {error ? <p role="alert" className="small" style={{ color: '#c0392b' }}>{error}</p> : null}
        <Button block onClick={save}>Add to my list</Button>
      </div>
    </Sheet>
  );
}
