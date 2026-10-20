import { useState } from 'react';
import { LuChevronDown, LuCopy, LuExternalLink } from 'react-icons/lu';
import { useAppState } from '@/core/store';
import { setState } from '@/core/store';
import { togglePermit } from '@/core/actions';
import { PERMIT_SECTORS, permitsFor } from '@/data/permits';
import type { PermitSector } from '@/types';
import { Alert, Badge, Button, Card, PageHeader, Pills, Progress, toast } from '@/components/ui';

const LEVEL: Record<string, string> = { barangay: 'Barangay', lgu: 'City / Municipality', national: 'National', regional: 'Regional' };

export function Permits() {
  const s = useAppState();
  const sector = s.permitSector;
  const items = permitsFor(sector);
  const [open, setOpen] = useState<string | null>(null);
  const mandatory = items.filter((i) => i.required === 'mandatory');
  const done = mandatory.filter((i) => s.permitProgress[i.id]).length;
  const pct = mandatory.length ? (done / mandatory.length) * 100 : 0;

  const copy = async () => {
    const text = `May-Ani checklist: ${PERMIT_SECTORS.find((x) => x.id === sector)?.label}\n` +
      items.map((i) => `${s.permitProgress[i.id] ? '[x]' : '[ ]'} ${i.title} (${i.agency})${i.required === 'if_applicable' ? ' - if applicable' : ''}`).join('\n');
    try { await navigator.clipboard.writeText(text); toast('Checklist copied'); } catch { toast('Could not copy on this device'); }
  };

  return (
    <div className="page narrow">
      <PageHeader title="Permits & Compliance" sub="What you usually need to start legally in the Philippines." actions={<Button size="sm" variant="secondary" onClick={copy}><LuCopy size={14} /> Copy list</Button>} />
      <div className="stack">
        <Pills value={sector} onChange={(id: PermitSector) => setState((st) => ({ ...st, permitSector: id }))} items={PERMIT_SECTORS} />
        <p className="small muted">Vegetables, crops and fruits are under Agriculture, fish under Aquaculture. A mixed farm: check the list for each type you have.</p>
        <Card>
          <div className="row between"><b>Mandatory steps done</b><span className="bold">{done} / {mandatory.length}</span></div>
          <div style={{ marginTop: 8 }}><Progress value={pct} label="Permit progress" /></div>
        </Card>
        <Alert tone="blue" title="Always confirm locally">Requirements, fees and processing times differ by city or municipality and change over time. Use this as your starting checklist and confirm with your Barangay, Mayor's/BPLO office, and the DA / BFAR office in your area.</Alert>
        <Card>
          <div className="list">
            {items.map((i) => {
              const isOpen = open === i.id;
              return (
                <div key={i.id} className="stack sm">
                  <div className="row">
                    <input className="check" type="checkbox" checked={!!s.permitProgress[i.id]} aria-label={`Done: ${i.title}`} onChange={() => togglePermit(i.id)} />
                    <button className="convo" style={{ border: 0, padding: 0 }} aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : i.id)}>
                      <div className="grow">
                        <div className={s.permitProgress[i.id] ? 'done bold' : 'bold'}>{i.title}</div>
                        <div className="small muted">{i.agency} · {LEVEL[i.level]}</div>
                      </div>
                      <Badge tone={i.required === 'mandatory' ? 'red' : 'gray'}>{i.required === 'mandatory' ? 'Required' : 'If applicable'}</Badge>
                      <span style={{ display: 'inline-flex', transform: isOpen ? 'rotate(180deg)' : undefined }}><LuChevronDown size={18} /></span>
                    </button>
                  </div>
                  {isOpen ? <div className="small" style={{ paddingLeft: 34 }}>{i.detail}{i.link ? <> <a href={i.link} target="_blank" rel="noreferrer">Official site <LuExternalLink size={11} /></a></> : null}</div> : null}
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}
