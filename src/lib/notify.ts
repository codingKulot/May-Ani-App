/**
 * Phone and computer notifications (the browser's Notification API), for new chat messages while May-Ani is in the
 * background. Browsers allow them only on https or localhost (not on a plain http://192.168... address) and only after the
 * person taps "Allow". Notifications while the app is fully closed would need Web Push (a push server), which May-Ani does
 * not have yet.
 */

export type NotifyState = NotificationPermission | 'unsupported';

export const notifyState = (): NotifyState =>
  typeof window !== 'undefined' && 'Notification' in window && window.isSecureContext ? Notification.permission : 'unsupported';

/** Shows the browser's "Allow notifications?" question. Call it from a button tap: browsers ignore it otherwise. */
export async function askToNotify(): Promise<NotifyState> {
  if (notifyState() === 'unsupported') return 'unsupported';
  try {
    return await Notification.requestPermission();
  } catch {
    return notifyState();
  }
}

/**
 * Shows a notification; tapping it opens `hash` (e.g. "#/community?with=...") in the app. Goes through the service worker
 * when there is one (Android shows notifications only that way; public/sw.js handles the tap), otherwise directly.
 */
export async function notify(title: string, body: string, hash: string, tag?: string) {
  if (notifyState() !== 'granted') return;
  const options = { body, tag, icon: './icon-192.png', badge: './icon-192.png', data: { hash } };
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg?.active) { await reg.showNotification(title, options); return; }
  } catch { /* no service worker: show it directly */ }
  try {
    const n = new Notification(title, options);
    n.onclick = () => { window.focus(); location.hash = hash; n.close(); };
  } catch { /* this browser only allows notifications from a service worker */ }
}
