import { useEffect, useRef, useState } from 'react';
import { LuDownload, LuUpload } from 'react-icons/lu';
import { damagedCopy, forgetDamagedCopy, useAppState } from '@/core/store';
import { saveFile } from '@/lib/download';
import { isoDate } from '@/lib/format';
import { downloadBackup, hasUserData, importData, unlinkAccount, updateProfile, updateSettings, wipeAllData } from '@/core/actions';
import { placeLabel } from '@/data/places';
import { ApiError, serverStatus, type ServerStatus } from '@/services/ai';
import { clearSession, saveAccountProfile } from '@/services/auth';
import type { Profile } from '@/types';
import { Alert, Badge, Button, Card, Chips, Field, PageHeader, askConfirm, toast } from '@/components/ui';
import { PlaceSelect } from '@/components/widgets';
import { LogOutButton } from '@/components/AuthForms';
import { SyncStatusPanel } from '@/components/SyncStatus';

export function Settings() {
  const s = useAppState();
  const p = s.profile!;
  const hasData = hasUserData(s);
  const [name, setName] = useState(p.name);
  const [api, setApi] = useState(s.settings.apiBase);
  const [feed, setFeed] = useState(s.settings.marketFeedUrl);
  const [status, setStatus] = useState<ServerStatus | null | 'checking'>('checking');
  const file = useRef<HTMLInputElement | null>(null);
  const [install, setInstall] = useState<any>(null);
  const [damaged, setDamaged] = useState(damagedCopy);

  useEffect(() => { serverStatus(true).then(setStatus); }, [s.settings.apiBase]);
  useEffect(() => {
    const h = (e: Event) => { e.preventDefault(); setInstall(e); };
    window.addEventListener('beforeinstallprompt', h);
    return () => window.removeEventListener('beforeinstallprompt', h);
  }, []);

  /** Saves on this phone at once; with an account, also on the server (the phone copy wins if that fails). */
  const saveProfile = (patch: Partial<Pick<Profile, 'name' | 'role' | 'location'>>) => {
    updateProfile(patch);
    if (!p.account) return;
    saveAccountProfile(patch).catch((e) => {
      if (e instanceof ApiError && e.status === 401) {
        clearSession();
        unlinkAccount();
        toast('Your login has ended. Saved on this phone; log in again to update your account.');
      } else {
        toast('Saved on this phone. Could not update your account right now.');
      }
    });
  };

  return (
    <div className="page narrow">
      <PageHeader title="Settings" />
      <div className="stack">
        <Card title="Account">
          <div className="stack sm">
            <p className="small">Logged in as <strong>{p.account?.email}</strong>. Changes to your name, role and location below are saved to your account.</p>
            <SyncStatusPanel />
            <div className="row wrap"><LogOutButton /></div>
          </div>
        </Card>

        <Card title="Profile">
          <div className="stack">
            <Field label="Your name" htmlFor="pn"><input id="pn" className="input" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() && name.trim() !== p.name && saveProfile({ name: name.trim() })} /></Field>
            <Field label="I am a…"><Chips items={[{ id: 'farmer', label: 'Farmer' }, { id: 'supplier', label: 'Supplier' }, { id: 'buyer', label: 'Buyer' }, { id: 'expert', label: 'Expert' }]} value={p.role} onChange={(role) => saveProfile({ role })} /></Field>
            <Field label="My location" hint={`Used for weather, hazards and prices. Now: ${placeLabel(p.location)}`}><PlaceSelect value={p.location} onChange={(location) => saveProfile({ location })} /></Field>
          </div>
        </Card>

        <Card title="Connections">
          <div className="stack">
            <Field label="May-Ani server address" htmlFor="api" hint="Leave blank if the app is served by the May-Ani server. Needed for AI photo analysis and real chat.">
              <div className="input-group"><input id="api" className="input" value={api} placeholder="https://your-server.example" onChange={(e) => setApi(e.target.value)} />
                <Button variant="secondary" onClick={() => { updateSettings({ apiBase: api.trim() }); toast('Saved'); }}>Save</Button></div>
            </Field>
            <div className="row wrap">
              {status === 'checking' ? <Badge tone="gray">Checking…</Badge> : status ? <><Badge>Server connected</Badge><Badge tone={status.ai ? 'green' : 'orange'}>AI {status.ai ? 'on' : 'off'}</Badge><Badge tone={status.chat ? 'green' : 'orange'}>Chat {status.chat ? 'on' : 'off'}</Badge><Badge tone={status.accounts ? 'green' : 'orange'}>Accounts {status.accounts ? 'on' : 'off'}</Badge></> : <Badge tone="orange">No server (offline features only)</Badge>}
              <Button size="sm" variant="ghost" onClick={() => { setStatus('checking'); serverStatus(true).then(setStatus); }}>Check again</Button>
            </div>
            <Field label="Market price feed URL" htmlFor="feed" hint="Optional JSON feed of live prices (format in README). Blank = planning estimates.">
              <div className="input-group"><input id="feed" className="input" value={feed} placeholder="https://…/prices.json" onChange={(e) => setFeed(e.target.value)} />
                <Button variant="secondary" onClick={() => { updateSettings({ marketFeedUrl: feed.trim() }); toast('Saved'); }}>Save</Button></div>
            </Field>
          </div>
        </Card>

        <Card title="Your data">
          <div className="stack sm">
            <p className="small muted">Your farms, plans and records are on this device and saved to your account. A backup file is an extra copy you keep yourself (photos are not in it).</p>
            {hasData ? null : <p className="small muted">Nothing to back up or delete yet. Add a farm, plan or record first. You can still restore a backup file.</p>}
            {damaged ? (
              <Alert tone="orange" title="Older data that could not be read" action={
                <div className="row wrap" style={{ marginTop: 8 }}>
                  <Button size="sm" variant="secondary" onClick={() => saveFile(`may-ani-damaged-data-${isoDate()}.json`, damaged, 'application/json')}>Download it</Button>
                  <Button size="sm" variant="ghost" onClick={async () => {
                    if (!(await askConfirm({ title: 'Delete the copy that could not be read?', message: 'Download it first if you may need it. This cannot be undone.', ok: 'Delete it', danger: true }))) return;
                    forgetDamagedCopy(); setDamaged(null);
                  }}>Delete it</Button>
                </div>
              }>
                At one start-up May-Ani could not read the data saved on this phone, so it kept a copy. Download it before deleting it: someone who knows computers may be able to repair it, and parts of it can be restored as a backup.
              </Alert>
            ) : null}
            <div className="row wrap">
              <Button variant="secondary" onClick={downloadBackup} disabled={!hasData}><LuDownload size={16} /> Back up</Button>
              <Button variant="secondary" onClick={() => file.current?.click()}><LuUpload size={16} /> Restore</Button>
              <input ref={file} type="file" accept="application/json" hidden onChange={async (e) => {
                const f = e.target.files?.[0]; e.target.value = '';
                if (!f) return;
                const r = importData(await f.text());
                toast(!r.ok ? r.error ?? 'Could not restore'
                  : r.skipped ? `Backup restored. ${r.skipped} damaged item${r.skipped === 1 ? ' was' : 's were'} left out.` : 'Backup restored');
              }} />
              {install ? <Button onClick={async () => { install.prompt(); setInstall(null); }}>Install app</Button> : null}
            </div>
            <Button variant="danger" disabled={!hasData} onClick={async () => {
              if (!(await askConfirm({
                title: 'Delete all data on this phone and log out?',
                message: 'This cannot be undone on this phone. Your online account and the farm data saved in it are not deleted: log in again to get them back.',
                ok: 'Delete everything', danger: true,
              }))) return;
              wipeAllData(); location.hash = '#/welcome';
            }}>Delete all my data</Button>
          </div>
        </Card>

        <Alert tone="blue" title="About May-Ani">Plans, prices, fault data and health results are guides to help you decide. They are not professional, legal or veterinary advice. Confirm with your DA, BFAR, LGU or a licensed professional before big decisions.</Alert>
      </div>
    </div>
  );
}
