// Browser-only fixture: the real MessageInput + CommandEditor with the product CSS, no runtime or network.
// `?layout=<width>` renders the chat composer frame (add button, model, voice group, send) and the metrics row.
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../frontend/src/styles/tokens.css';
import '../../frontend/src/styles/ui.css';
import '../../frontend/src/styles/message-input.css';
import '../../frontend/src/components/mauzcode/composer-footer.css';
import '../../frontend/src/components/mauzcode/model-picker.css';
import '../../frontend/src/components/mauzcode/voice-route-picker.css';
import { MessageInput } from '../../frontend/src/components/mauzcode/MessageInput';
import { ComposerAddButton } from '../../frontend/src/components/mauzcode/ComposerAddButton';

const width = Number(new URLSearchParams(location.search).get('layout')) || 480;
const long = 'Wrapped draft text that is long enough to need three lines in a narrow composer so wrapped lines start under the add button.';
function Fixture() {
  const [value, setValue] = useState(new URLSearchParams(location.search).has('layout') ? long : '');
  const model = <button type="button" className="model-picker-trigger" data-testid="model"><span className="model-picker-body"><span className="model-picker-row"><span className="model-picker-label">Claude Opus 4.6 with a long label</span><span className="model-picker-effort">high</span></span></span></button>;
  const voice = <div className="voice-entry-group is-flat" role="group" aria-label="Голос">{['settings', 'panel', 'inline'].map(mode => <button key={mode} type="button" className="voice-route-trigger voice-entry" data-primary={mode === 'inline' ? '' : undefined} aria-label={mode}>•</button>)}</div>;
  return <div style={{ width, padding: 0 }} className="composer-input-anchor">
    <MessageInput value={value} onChange={setValue} onSend={() => {}} commandsEnabled placeholder="Напишите сообщение…" leading={<ComposerAddButton open={false} disabled={false} onClick={() => {}} />} bar={{ start: model, end: voice }} />
    <div className="composer-footer"><div className="composer-metrics-row">
      <button type="button" className="composer-metrics"><span className="composer-metrics-usage"><span className="composer-cost">$0.31</span><span className="composer-token-count">↑184k</span><span className="composer-token-count">↓9.4k</span><span className="composer-cache-hit">87%</span></span></button>
      <button type="button" className="composer-metrics"><span className="composer-metrics-context">42%<span className="composer-metrics-window">· 84k / 200k</span></span></button>
    </div></div>
    <output data-testid="value" hidden>{JSON.stringify(value)}</output>
  </div>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
