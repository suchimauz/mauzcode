// Browser-only fixture: real React surfaces, no runtime/DB or application shell.
import { createRoot } from 'react-dom/client';
import { ApplicationPages } from '../../frontend/src/components/mauzcode/ApplicationPages';
import { CanvasPanel } from '../../frontend/src/components/mauzcode/CanvasPanel';
import { PeoplePage } from '../../frontend/src/components/PeoplePage';
import { Tooltip } from '@base-ui/react/tooltip';
import { QuotaMatrix } from '../../frontend/src/components/mauzcode/QuotaMatrix';
import type { QuotaAccount } from '../../frontend/src/lib/quotas';
import account from '../../src/models/fixtures/antigravity-quota-account.json';
window.mauzcodeLive = { subscribe: () => () => {} };
const surface = new URLSearchParams(location.search).get('surface');
createRoot(document.getElementById('root')!).render(surface === 'quotas' ?
  <div style={{ position: 'fixed', bottom: 8, width: 280 }}><Tooltip.Provider><QuotaMatrix accounts={[account as QuotaAccount]} /></Tooltip.Provider></div> : surface === 'people' ? <PeoplePage /> : surface === 'canvas' ?
  <CanvasPanel agentId="fixture" revision={null} theme="light" onClose={() => {}} expanded={false} onExpand={() => {}} /> : <ApplicationPages theme="dark" />);
