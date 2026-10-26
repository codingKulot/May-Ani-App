import { useState } from 'react';
import { LuExternalLink } from 'react-icons/lu';
import { placeLabel } from '@/data/places';
import { SECTOR_LABEL } from '@/data/catalog';
import type { WatchBulletin } from '@/data/priceWatch';
import { FRESH_DAYS, NEARBY_KM, ageLabel, bulletinAgeDays, coveredPlaces, groupCategory, rangeText, rowUnit } from '@/services/priceWatch';
import type { NearbyMarket, PriceCategory } from '@/services/priceWatch';
import { num, prettyDate } from '@/lib/format';
import type { GeoPlace, Sector } from '@/types';
import { Alert, Card, Pills } from '@/components/ui';

/**
 * Market prices for the user's location (Settings > My location): the 3 nearest DA-checked public markets, or, when none is near,
 * DA Bantay Presyo's Metro Manila list as a reference. Low to High and the most common price, with each list's date and source.
 * Sourced, not live.
 */
export function PriceWatchCard({ place, top, fallback, marketId, onMarket }: {
  place: GeoPlace;
  /** the nearest DA-checked markets, nearest first (at most 3), then the all-Metro Manila list when it is in reach */
  top: NearbyMarket[];
  /** DA Bantay Presyo's Metro Manila list, shown when no market is near */
  fallback: WatchBulletin;
  marketId: string;
  onMarket: (id: string) => void;
}) {
  const sel = top.find((m) => m.market.id === marketId) ?? top[0];

  if (!sel) {
    return (
      <Card title="Market prices for your area">
        <div className="stack">
          <Alert tone="blue" title={`No DA-checked market near ${placeLabel(place)}`}>
            None of the public markets DA checks is within {NEARBY_KM} km. May-Ani has them for {coveredPlaces().join('; ')}.
            Below is DA Bantay Presyo's Metro Manila list as a reference: prices in your area may be lower or higher. Use
            "Set my price" in the table further down to enter what you see in your own market.
          </Alert>
          <PriceTable bulletin={fallback} title="DA Bantay Presyo: Metro Manila" />
        </div>
      </Card>
    );
  }

  return (
    <Card title="Prices at markets near you">
      <div className="stack">
        <p className="small muted" style={{ margin: 0 }}>
          The public markets DA checks nearest {placeLabel(place)}. What buyers pay, from the lowest to the highest price DA found.
          Change your location in Settings to see other markets.
        </p>
        {top.length > 1 ? (
          <Pills value={sel.market.id} onChange={onMarket}
            items={top.map((m) => ({ id: m.market.id, label: m.market.area ? m.market.name : `${m.market.name.replace(/ (Public|Central) Market$/, '')} · ${num(m.km)} km` }))} />
        ) : null}
        <PriceTable bulletin={sel.bulletin} title={`${sel.market.name}, ${sel.market.place}`} />
        {!sel.market.area && sel.market.id.startsWith('ncr-') ? (
          <p className="tiny muted" style={{ margin: 0 }}>DA lists one price per product at each Metro Manila market. Tap "All Metro Manila" for Low to High across all 34 markets and more products (fruits, beef, more fish).</p>
        ) : null}
      </div>
    </Card>
  );
}

const CATEGORIES: { id: 'all' | PriceCategory; label: string }[] = [
  { id: 'all', label: 'All' },
  ...(Object.keys(SECTOR_LABEL) as Sector[]).map((k) => ({ id: k, label: SECTOR_LABEL[k] })),
  { id: 'other', label: 'Sugar & oil' },
];

/** One DA list: its date and source, category pills, and the prices grouped as DA groups them. */
function PriceTable({ bulletin: b, title }: { bulletin: WatchBulletin; title: string }) {
  const [cat, setCat] = useState<'all' | PriceCategory>('all');
  const age = bulletinAgeDays(b);
  const old = age > FRESH_DAYS;
  const items = CATEGORIES.filter((c) => c.id === 'all' || b.groups.some((g) => groupCategory(g.name) === c.id));
  // a category the newly chosen market does not have shows everything instead of an empty table
  const active = items.some((c) => c.id === cat) ? cat : 'all';
  const groups = b.groups.filter((g) => active === 'all' || groupCategory(g.name) === active);

  return (
    <>
      <h3 style={{ margin: 0 }}>{title}</h3>
      <Alert tone={old ? 'orange' : 'green'} title={old ? `Old prices: ${ageLabel(age)}` : `Checked by DA on ${prettyDate(b.asOf)}`}>
        {old ? `Checked by DA on ${prettyDate(b.asOf)}. Prices change daily, so expect today's to differ. ` : ''}Source: {b.source}{' '}
        <a href={b.sourceUrl} target="_blank" rel="noreferrer">DA's price lists <LuExternalLink size={11} /></a>. Not live prices.
      </Alert>
      <Pills value={active} onChange={setCat} items={items} />
      <div className="table-wrap">
        <table className="tbl">
          <thead><tr><th>Product</th><th className="num">Low to High</th></tr></thead>
          {groups.map((g) => (
            <tbody key={g.name}>
              <tr><th colSpan={2} scope="colgroup">{g.name}</th></tr>
              {g.rows.map(([label, low, high, prevailing]) => {
                const unit = rowUnit(label);
                return (
                  <tr key={label}>
                    <td>{label}</td>
                    {/* one column, so phones see everything without scrolling sideways */}
                    <td className="num" style={{ whiteSpace: 'nowrap' }}>
                      <b>{rangeText(low, high)}</b>{unit ? <span className="tiny muted">/{unit}</span> : null}
                      {low !== high ? <div className="tiny muted">most often {rangeText(prevailing, prevailing)}</div> : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          ))}
        </table>
      </div>
      <p className="tiny muted" style={{ margin: 0 }}>Retail prices per kilo unless shown (eggs per piece, oil per bottle). Taken from DA's published price lists.</p>
    </>
  );
}
