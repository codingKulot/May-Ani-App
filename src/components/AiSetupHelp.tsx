import { Alert } from './ui';

/** Plain steps to switch on the AI features. Shown only while the server or its key is missing. */
export function AiSetupHelp({ serverUp }: { serverUp: boolean }) {
  return (
    <Alert tone="blue" title={serverUp ? 'Add your AI key to turn on photo analysis' : 'Turn on AI photo analysis'}>
      <>
        You can already make a full plan without a photo. AI only adds reading your photos. To switch it on:
        <ol className="steps" style={{ marginTop: 8 }}>
          <li>In the project folder, copy <b>.env.example</b> to a new file named <b>.env</b>.</li>
          <li>Open <b>.env</b> and paste your key after <b>ANTHROPIC_API_KEY=</b> (get one at console.anthropic.com).</li>
          <li>In a terminal in the project folder run <b>bun run start</b>, then open <b>http://localhost:8787</b>.</li>
        </ol>
        <span className="tiny muted">If you use <b>bun run dev</b> (port 3000), start the server in a second terminal with <b>bun run server</b>. The app finds it automatically.</span>
      </>
    </Alert>
  );
}
