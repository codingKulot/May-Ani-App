import { useMemo, useState } from 'react';
import { LuExternalLink, LuMessageCircle, LuRefreshCw, LuTrendingDown, LuTrendingUp } from 'react-icons/lu';
import { useAppState } from '@/core/store';
import { useMarket, useNcrList } from '@/core/hooks';
import { setPriceOverride, toggleWatch } from '@/core/actions';
import { SECTOR_LABEL, catalogById } from '@/data/catalog';
import { applyOverrides, priceGap, sellingOptions } from '@/services/market';
import { itemRange, latestBulletin, nearbyArea, rangeText, topMarkets, watchData } from '@/services/priceWatch';
import { BUNDLED_NCR } from '@/data/priceWatch';
import type { WatchBulletin } from '@/data/priceWatch';
import { PriceWatchCard } from '@/components/PriceWatchCard';
import { peso, prettyDate } from '@/lib/format';
import type { MarketPrice, Sector } from '@/types';
import { Alert, Badge, Button, Card, Empty, Field, LinkButton, NumberInput, PageHeader, Pills, Progress, Sheet, Spinner, toast } from '@/components/ui';

type Filter = 'all' | 'watch' | Sector;
/** A DA price list the table compares with, and what to call it. */
type PriceRef = { name: string; bulletin: WatchBulletin };

export function Market() {
  const s = useAppState();
  const mk = useMarket(s.settings.marketFeedUrl);
  const [filter, setFilter] = useState<Filter>('all');
  const [sel, setSel] = useState<MarketPrice | null>(null);
  const place = s.profile!.location;
  const ncr = useNcrList();
  const data = useMemo(() => watchData(ncr.data ?? BUNDLED_NCR), [ncr.data]);
  // the 3 nearest markets, plus the all-Metro Manila list (every category) when the user is within reach of it
  const choices = useMemo(() => {
    const area = nearbyArea(place, data.markets, data.bulletins);
    const top = topMarkets(place, data.markets, data.bulletins);
    return area ? [...top, area] : top;
  }, [place, data]);
  const [marketId, setMarketId] = useState('');
  const near = choices.find((m) => m.market.id === marketId) ?? choices[0];
  const areaList = latestBulletin('ncr', data.bulletins)!;
  // the DA list the table compares with: the chosen nearby market, else Bantay Presyo's Metro Manila list
  const watch: PriceRef = near ? { name: near.market.name, bulletin: near.bulletin } : { name: 'Metro Manila markets (DA Bantay Presyo)', bulletin: areaList };

  const snap = useMemo(() => (mk.data ? applyOverrides(mk.data.snapshot, s.marketOverrides) : null), [mk.data, s.marketOverrides]);
  const rows = (snap?.prices ?? []).filter((p) => {
    const c = catalogById(p.itemId);
    if (!c) return false;
    if (filter === 'all') return true;
    if (filter === 'watch') return s.watchlist.includes(p.itemId);
    return c.sector === filter;
  });
  const live = snap?.source === 'feed';
  const best = [...(snap?.prices ?? [])].sort((a, b) => priceGap(b).gapPesos / b.retailPerKg - priceGap(a).gapPesos / a.retailPerKg)[0];

  return (
    <div className="page">
      <PageHeader title="Market Prices" sub="What buyers pay in the market versus what farmers receive at the farm gate."
        actions={<Button size="sm" variant="secondary" onClick={mk.reload}><LuRefreshCw size={14} /> Refresh</Button>} />
      <div className="stack">
        <PriceWatchCard place={place} top={choices} fallback={areaList} marketId={near?.market.id ?? ''} onMarket={setMarketId} />
        <h2 style={{ margin: '8px 0 0' }}>Market versus farm-gate</h2>
        {snap ? (
          <Alert tone={live ? 'green' : 'orange'} title={live ? snap.sourceLabel : 'Estimated prices, not live'}>
            {live
              ? `Data as of ${snap.asOf || 'latest feed'}.`
              : `${snap.sourceLabel}. Prices change daily and by place. Use "Set my price" to enter what you see in your local market, or connect a price feed in Settings.`}
          </Alert>
        ) : null}
        {mk.data?.error ? <Alert tone="orange" title="Price feed problem">{mk.data.error}</Alert> : null}
        {best ? <p className="small muted">Biggest gap right now: <b>{catalogById(best.itemId)?.name}</b>, where growers get only {priceGap(best).farmerSharePct}% of the retail price. Selling direct can capture more of it.</p> : null}

        <Pills value={filter} onChange={setFilter} items={[{ id: 'all', label: 'All' }, { id: 'watch', label: '★ Watchlist' }, ...(Object.keys(SECTOR_LABEL) as Sector[]).map((k) => ({ id: k, label: SECTOR_LABEL[k] }))]} />

        <Card>
          {!snap && mk.loading ? <div className="row"><Spinner /> Loading prices…</div> : rows.length === 0 ? <Empty title={filter === 'watch' ? 'Watchlist is empty' : 'No prices'}>{filter === 'watch' ? 'Tap the star next to a product to follow it.' : 'Nothing to show for this filter.'}</Empty> : (
            <div className="table-wrap">
              <table className="tbl">
                <thead><tr><th></th><th>Product</th><th className="num">Market (₱/kg)</th><th className="num">Farm-gate (₱/kg)</th><th className="num">Gap</th><th>Farmer share</th><th></th></tr></thead>
                <tbody>
                  {rows.map((p) => {
                    const c = catalogById(p.itemId)!;
                    const g = priceGap(p);
                    const watched = s.watchlist.includes(p.itemId);
                    const da = itemRange(p.itemId, watch.bulletin);
                    return (
                      <tr key={p.itemId}>
                        <td><button className="icon-btn" aria-pressed={watched} aria-label={`${watched ? 'Unfollow' : 'Follow'} ${c.name}`} onClick={() => toggleWatch(p.itemId)}><span style={{ fontSize: 20, color: watched ? '#e8a317' : '#8a9a8f' }}>{watched ? '★' : '☆'}</span></button></td>
                        <td><b>{c.emoji} {c.name}</b>{s.marketOverrides[p.itemId] ? <> <Badge tone="blue">my price</Badge></> : null}</td>
                        <td className="num">{peso(p.retailPerKg)}{da ? <div className="tiny muted" title={`${watch.name}, DA, ${prettyDate(watch.bulletin.asOf)}: ${da.label}`}>DA: {rangeText(da.low, da.high)}</div> : null}</td>
                        <td className="num"><b>{peso(p.farmGatePerKg)}</b></td>
                        <td className="num">{peso(g.gapPesos)}{p.trend7d ? <span className={p.trend7d > 0 ? 'pos' : 'neg'} title="7-day change"> {p.trend7d > 0 ? <LuTrendingUp size={13} /> : <LuTrendingDown size={13} />}{Math.abs(p.trend7d)}%</span> : null}</td>
                        <td style={{ minWidth: 100 }}><div className="row"><div className="grow"><Progress value={g.farmerSharePct} label="Farmer share" warn={g.farmerSharePct < 50} /></div><span className="tiny">{g.farmerSharePct}%</span></div></td>
                        <td><Button size="sm" variant="secondary" onClick={() => setSel(p)}>Details</Button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="tiny muted" style={{ marginTop: 8 }}>Livestock farm-gate is per kg live weight; retail is dressed meat or eggs. For official prices see <a href="https://www.da.gov.ph" target="_blank" rel="noreferrer">DA <LuExternalLink size={11} /></a> Bantay Presyo.</p>
        </Card>
      </div>
      <Detail p={sel} watch={watch} onClose={() => setSel(null)} />
    </div>
  );
}

function Detail({ p, watch, onClose }: { p: MarketPrice | null; watch: PriceRef; onClose: () => void }) {
  const s = useAppState();
  const [kg, setKg] = useState(100);
  const [retail, setRetail] = useState(0);
  const [farm, setFarm] = useState(0);
  const [lastId, setLastId] = useState('');
  if (p && p.itemId !== lastId) { setLastId(p.itemId); setRetail(p.retailPerKg); setFarm(p.farmGatePerKg); }
  const c = p ? catalogById(p.itemId) : null;
  const da = p ? itemRange(p.itemId, watch.bulletin) : null;
  return (
    <Sheet open={!!p} onClose={onClose} title={c ? `${c.emoji} ${c.name}` : ''}>
      {p && c ? (
        <div className="stack">
          <div className="stack sm">
            <b>Where should I sell?</b>
            <Field label="How many kilos do you have?" htmlFor="mk-kg"><NumberInput id="mk-kg" value={kg} min={1} onChange={setKg} /></Field>
            <div className="list">
              {sellingOptions(p, kg || 0).map((o) => (
                <div key={o.label} className="row"><div className="grow"><div className="bold">{o.label}</div><div className="small muted">{peso(o.perKg)}/kg</div></div><b>{peso(o.total)}</b></div>
              ))}
            </div>
            <p className="tiny muted">Direct and retail sales take extra work (transport, packing, time, unsold stock). The farm-gate buyer pays less but takes everything at once.</p>
          </div>
          <div className="stack sm">
            <b>Set my price</b>
            <p className="small muted">Enter what you actually see in your local market. It replaces the estimate on this device.</p>
            {da ? (
              <div className="row wrap">
                <span className="small grow">At {watch.name} DA found <b>{rangeText(da.low, da.high)}</b>/kg, most often {rangeText(da.prevailing, da.prevailing)} ({da.label}, {prettyDate(watch.bulletin.asOf)}).</span>
                <Button size="sm" variant="secondary" onClick={() => setRetail(da.prevailing)}>Use {rangeText(da.prevailing, da.prevailing)}</Button>
              </div>
            ) : null}
            <div className="grid cols-2">
              <Field label="Market (₱/kg)" htmlFor="o-r"><NumberInput id="o-r" value={retail} min={0} onChange={setRetail} /></Field>
              <Field label="Farm-gate (₱/kg)" htmlFor="o-f"><NumberInput id="o-f" value={farm} min={0} onChange={setFarm} /></Field>
            </div>
            <div className="row wrap">
              <Button onClick={() => { if (!(retail > 0 && farm > 0)) return toast('Enter both prices'); setPriceOverride(p.itemId, { retailPerKg: retail, farmGatePerKg: farm }); toast('Saved'); onClose(); }}>Save</Button>
              {s.marketOverrides[p.itemId] ? <Button variant="ghost" onClick={() => { setPriceOverride(p.itemId, null); onClose(); }}>Reset</Button> : null}
            </div>
          </div>
          <LinkButton to="/community" variant="secondary" block><LuMessageCircle size={16} /> Find buyers & suppliers</LinkButton>
        </div>
      ) : null}
    </Sheet>
  );
}
