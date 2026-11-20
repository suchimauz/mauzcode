import type { ReactNode } from 'react';
import './composer-footer.css';

/**
 * Row above the message input for active mode indicators (the planning badge today), left-aligned. The chat pet is
 * perched above the composer stack; while this row is shown and no question card is open, CSS lowers the perch so the
 * pet stands at the row's right end. Without a mode the row is not rendered and adds no height.
 */
export function ComposerStatusRow({ modes }: { modes?: ReactNode }) {
  if (!modes) return null;
  return <div className="composer-status-row" role="group" aria-label="Режимы чата">{modes}</div>;
}
