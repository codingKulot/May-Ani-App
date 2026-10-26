import { useState } from 'react';
import {
  LuArrowLeft, LuBookOpen, LuChevronRight, LuCircleCheck, LuCirclePlay, LuClock, LuExternalLink, LuFileText, LuGauge,
  LuLightbulb, LuMapPin, LuRuler, LuWallet,
} from 'react-icons/lu';
import { GUIDES } from '@/data/learn';
import { START_PATHS, startPath, type StartLink, type StartPath } from '@/data/startPaths';
import { Link } from '@/core/router';
import { SectorIcon } from '@/components/widgets';
import { Alert, Badge, Button, Card, Empty, LinkButton, PageHeader, Pills } from '@/components/ui';

/** A path's icon tile: its farm type's tint, or a green book for the "for everyone" path. */
function PathIcon({ path, size = 22 }: { path: StartPath; size?: number }) {
  return path.sector ? <SectorIcon sector={path.sector} size={size} /> : <span className="ic crops" aria-hidden="true"><LuBookOpen size={size} /></span>;
}

export function Learn() {
  const [topic, setTopic] = useState('All');
  const [open, setOpen] = useState<string | null>(null);
  const topics = ['All', ...Array.from(new Set(GUIDES.map((g) => g.topic)))];
  const list = GUIDES.filter((g) => topic === 'All' || g.topic === topic);
  return (
    <div className="page narrow">
      <PageHeader title="Learning Center" sub="Step-by-step guides for first-time farmers, with trusted links and videos." />
      <div className="stack">
        <section className="learn-start" aria-labelledby="start-here">
          <h2 id="start-here">New to farming? Start here</h2>
          <p className="small muted">Pick what you want to start. Each path walks you from zero to your first harvest or sale.</p>
          <div className="path-cards">
            {START_PATHS.map((p) => (
              <Link key={p.id} to={`/learn/${p.id}`} className={`path-card ${p.sector ?? 'all'}`}>
                <PathIcon path={p} />
                <div className="grow">
                  <div className="bold">{p.title}</div>
                  <div className="small muted">{p.tagline}</div>
                  <div className="path-meta">
                    <span><LuClock size={13} /> {p.sector ? p.firstIncome.split(/;| \(/)[0] : 'Do this first'}</span>
                    <span><LuGauge size={13} /> {p.level}</span>
                  </div>
                </div>
                <span className="faint" aria-hidden="true"><LuChevronRight size={18} /></span>
              </Link>
            ))}
          </div>
        </section>

        <h2 className="learn-h2">Quick guides</h2>
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

function LinkRow({ l, video }: { l: StartLink; video?: boolean }) {
  const Icon = video ? LuCirclePlay : LuFileText;
  return (
    <a className="res-link" href={l.url} target="_blank" rel="noopener noreferrer" title="Opens in a new tab">
      <span className={`res-ic ${video ? 'video' : ''}`} aria-hidden="true"><Icon size={20} /></span>
      <span className="grow">
        <span className="bold">{l.label}</span>
        <span className="small muted res-src">
          {l.source}
          <Badge tone={l.official ? 'green' : 'gray'}>{l.official ? 'Official' : 'Independent'}</Badge>
          {l.lang ? <Badge tone="blue">{l.lang}</Badge> : null}
        </span>
        {l.note ? <span className="small res-note">{l.note}</span> : null}
      </span>
      <span className="ext faint" aria-hidden="true"><LuExternalLink size={16} /></span>
    </a>
  );
}

/** One "Start here" path: quick facts, a checklist, numbered steps, mistakes, local help, reading and videos. */
export function LearnPath({ id }: { id: string }) {
  const p = startPath(id);
  if (!p) {
    return (
      <div className="page narrow">
        <Empty title="Guide not found" action={<LinkButton to="/learn" variant="secondary">Back to Learning Center</LinkButton>}>This guide may have been renamed.</Empty>
      </div>
    );
  }
  const facts = [
    { Icon: LuMapPin, k: 'Good for', v: p.goodFor },
    { Icon: LuRuler, k: 'Space', v: p.space },
    { Icon: LuWallet, k: 'Starting money', v: p.money },
    { Icon: LuClock, k: 'First harvest or sale', v: p.firstIncome },
  ];
  return (
    <div className="page narrow">
      <Link to="/learn" className="back-link"><LuArrowLeft size={16} /> Learning Center</Link>
      <div className="stack">
        <section className={`path-hero ${p.sector ?? 'all'}`}>
          <div className="row" style={{ alignItems: 'flex-start' }}>
            <PathIcon path={p} size={26} />
            <div className="grow">
              <h1>{p.title}</h1>
              <p>{p.tagline}</p>
            </div>
          </div>
          <div className="row wrap" style={{ gap: 6 }}>
            <Badge tone={p.level === 'Easy' ? 'green' : p.level === 'Medium' ? 'orange' : 'red'}>{p.level} for beginners</Badge>
            <Badge tone="gray">{p.steps.length} steps</Badge>
          </div>
          <dl className="path-facts">
            {facts.map(({ Icon, k, v }) => (
              <div key={k}>
                <dt><Icon size={14} /> {k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </section>

        {p.sector ? (
          <p className="disclaimer">Money and time are rough beginner estimates for 2026, not quotes. Prices differ by place and season: check the Market page and ask your supplier and Municipal Agriculture Office before you buy.</p>
        ) : null}

        <Card title="Before you spend a peso">
          <ul className="check-list">
            {p.before.map((b, i) => <li key={i}><LuCircleCheck size={18} aria-hidden="true" /> <span>{b}</span></li>)}
          </ul>
        </Card>

        <Card title="Step by step">
          <ol className="path-steps">
            {p.steps.map((s, i) => (
              <li key={i}>
                <span className="n" aria-hidden="true">{i + 1}</span>
                <div className="grow">
                  <h3>{s.title}</h3>
                  <p>{s.body}</p>
                  {s.tip ? <p className="path-tip"><LuLightbulb size={15} aria-hidden="true" /> <span>{s.tip}</span></p> : null}
                </div>
              </li>
            ))}
          </ol>
        </Card>

        <Alert tone="orange" title="Beginner mistakes to avoid">
          <ul className="plain-list">{p.mistakes.map((m, i) => <li key={i}>{m}</li>)}</ul>
        </Alert>

        <Card title="Who to ask near you">
          <ul className="plain-list">{p.help.map((h, i) => <li key={i}>{h}</li>)}</ul>
          <p className="small muted" style={{ marginTop: 8 }}>Most of their advice and trainings are free. Bring your ID, and your RSBSA stub once you have it.</p>
        </Card>

        <Card title="Read and learn">
          <div className="res-list">{p.read.map((l) => <LinkRow key={l.url + l.label} l={l} />)}</div>
        </Card>

        <Card title="Watch">
          <div className="res-list">{p.watch.map((l) => <LinkRow key={l.url + l.label} l={l} video />)}</div>
          <p className="small muted" style={{ marginTop: 8 }}>Videos open in YouTube and use mobile data. "Official" means a government or public research source; "Independent" videos are from Filipino farm channels, so ask your technician if something differs.</p>
        </Card>

        <Card tint title="Next in May-Ani">
          <div className="row wrap">
            {p.sector ? <LinkButton to="/planner" size="sm">Make a farm plan</LinkButton> : null}
            <LinkButton to="/permits" size="sm" variant={p.sector ? 'secondary' : undefined}>Permits checklist</LinkButton>
            {p.sector ? <LinkButton to="/health" size="sm" variant="secondary">Check plant or animal health</LinkButton> : null}
            <LinkButton to="/market" size="sm" variant="secondary">See market prices</LinkButton>
          </div>
        </Card>
      </div>
    </div>
  );
}
