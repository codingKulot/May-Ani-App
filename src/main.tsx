import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary whole>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);

// Offline-first shell for the installed PWA (production only, so dev reloads are never stale).
if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => { /* PWA is an enhancement, never required */ });
  });
}

// A tapped notification (public/sw.js) asks the open app to show a page, e.g. the conversation with a new message.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (e) => {
    const d = e.data as { type?: string; hash?: string } | null;
    if (d?.type === 'may-ani:open' && typeof d.hash === 'string' && d.hash.startsWith('#/')) location.hash = d.hash;
  });
}
