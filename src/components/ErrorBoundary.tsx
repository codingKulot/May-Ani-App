import { Component, type ErrorInfo, type ReactNode } from 'react';
import { downloadBackup } from '@/core/actions';

interface Props {
  children?: ReactNode;
  /** When this changes (the user opened another page), the crashed page is tried again. */
  resetKey?: string;
  /** Around the whole app: there is no menu left to tap, so offer "Reload the app" instead of "Go to dashboard". */
  whole?: boolean;
}
interface State { error: Error | null; key?: string }

/**
 * Catches a crash inside a page and shows a way out, instead of a blank white screen.
 * Kept to plain markup on purpose, so it still works if a shared component is what crashed.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, key: this.props.resetKey };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    return props.resetKey !== state.key ? { error: null, key: props.resetKey } : null;
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('May-Ani: a page crashed.', error, info.componentStack ?? '');
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const backup = () => {
      try { downloadBackup(); } catch { /* nothing more we can do here */ }
    };
    return (
      <div className="page narrow crash" role="alert">
        <section className="card stack">
          <h2>Something went wrong {this.props.whole ? 'in the app' : 'on this page'}</h2>
          <p className="small">
            Your farms and records are still saved on this phone. {this.props.whole ? 'Reload the app' : 'Try again or open another page'}.
            If it keeps happening, download a backup so you have a copy of your data.
          </p>
          <div className="row wrap">
            {this.props.whole
              ? <button type="button" className="btn" onClick={() => location.reload()}>Reload the app</button>
              : <a className="btn" href="#/">Go to dashboard</a>}
            <button type="button" className="btn secondary" onClick={() => this.setState({ error: null })}>Try again</button>
            <button type="button" className="btn ghost" onClick={backup}>Download a backup</button>
          </div>
          <details>
            <summary className="small muted">Details for the developer</summary>
            <pre className="small">{error.message || String(error)}</pre>
          </details>
        </section>
      </div>
    );
  }
}
