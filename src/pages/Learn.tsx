import { useState } from 'react';
import { GUIDES } from '@/data/learn';
import { Badge, Button, Card, PageHeader, Pills } from '@/components/ui';

export function Learn() {
  const [topic, setTopic] = useState('All');
  const [open, setOpen] = useState<string | null>(null);
  const topics = ['All', ...Array.from(new Set(GUIDES.map((g) => g.topic)))];
  const list = GUIDES.filter((g) => topic === 'All' || g.topic === topic);
  return (
    <div className="page narrow">
      <PageHeader title="Learning Center" sub="Short, practical guides you can read offline." />
      <div className="stack">
        <Pills value={topic} onChange={setTopic} items={topics.map((t) => ({ id: t, label: t }))} />
        {list.map((g) => (
          <Card key={g.id} title={g.title} action={<Badge tone="gray">{g.topic} · {g.minutes} min</Badge>}>
            <p>{g.intro}</p>
            {open === g.id ? <ol className="steps" style={{ marginTop: 10 }}>{g.steps.map((x, i) => <li key={i}>{x}</li>)}</ol> : null}
            <div style={{ marginTop: 10 }}><Button size="sm" variant="secondary" onClick={() => setOpen(open === g.id ? null : g.id)}>{open === g.id ? 'Hide steps' : 'Read steps'}</Button></div>
          </Card>
        ))}
      </div>
    </div>
  );
}
