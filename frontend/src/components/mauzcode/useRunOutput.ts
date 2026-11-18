import { useEffect, useRef, useState } from 'react';
import { ApiError, getRunOutput } from '../../lib/mauzcode';

type RunOutput = { text: string; start: number; end: number; loaded: boolean; error: string };
const EMPTY: RunOutput = { text: '', start: 0, end: 0, loaded: false, error: '' };

/** Full retained output of a running call: loaded from offset 0 on expand, then appended from the last received `end` whenever the live activity reports a larger `outputEnd`, so reconnects leave no gaps or duplicates. `start` above zero is the amount of output the server cap dropped. */
export function useRunOutput(agentId: string | undefined, runId: string, enabled: boolean, outputEnd: number | undefined): RunOutput {
  const [state, setState] = useState<RunOutput>(EMPTY);
  const end = useRef(0);
  const busy = useRef(false);
  const [tick, setTick] = useState(0);
  useEffect(() => { end.current = 0; setState(EMPTY); }, [runId]);
  useEffect(() => {
    if (!enabled || !agentId || busy.current) return;
    if (state.loaded && (outputEnd === undefined || outputEnd <= end.current)) return;
    const controller = new AbortController();
    busy.current = true;
    getRunOutput(agentId, runId, end.current, controller.signal).then(chunk => {
      if (controller.signal.aborted) return;
      // Contiguous chunk: append. Otherwise the cap dropped what we had not seen yet: restart from the retained start.
      setState(previous => previous.loaded && chunk.from === previous.end
        ? { text: previous.text + chunk.text, start: previous.start, end: chunk.end, loaded: true, error: '' }
        : { text: chunk.text, start: chunk.from, end: chunk.end, loaded: true, error: '' });
      end.current = chunk.end;
      // Re-check once settled, so an outputEnd that advanced during the request is not missed.
      setTick(value => value + 1);
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      // 404: the call has just finished; the stored result replaces this row.
      if (error instanceof ApiError && error.status === 404) return;
      setState(previous => ({ ...previous, error: error instanceof Error ? error.message : 'Не удалось загрузить вывод' }));
    }).finally(() => { busy.current = false; });
    return () => { controller.abort(); busy.current = false; };
  }, [enabled, agentId, runId, outputEnd, tick, state.loaded]);
  return state;
}
