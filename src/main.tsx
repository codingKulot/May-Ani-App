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
