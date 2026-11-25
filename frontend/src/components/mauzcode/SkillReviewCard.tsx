import { useEffect, useState } from 'react';
import { InputFrame } from './inputs/InputFrame';
import { requestJson } from '../../lib/mauzcode';

type ReviewView = {
  id: string; state: string; title: string; message: string; available: boolean;
  skillId: string; destination: string; where: string; source: string; digest: string;
  files: { path: string; bytes: number; executable: boolean; adapted: boolean }[];
  manifest: string; changes: { path: string; before: string; after: string }[];
  result: { status: string; reason?: string } | null; csrfToken: string;
};
type DecideResult = { ok: boolean; status: string; reason?: string };

const reviewPath = (id: string) => `/skills/review/${encodeURIComponent(id)}`;
const destinationLabel: Record<string, string> = { workspace: 'Проект (.mauzcode/skills)', serverProject: 'Сервер · этот проект', serverGlobal: 'Сервер · все проекты' };
const sizeLabel = (bytes: number) => bytes < 1024 ? `${bytes} Б` : `${(bytes / 1024).toFixed(1)} КБ`;

/**
 * Native card for the protected skill review. It shows exactly what will be saved and sends the person's
 * decision with the shown digest to the dedicated CSRF-protected route; generic input submission cannot approve it.
 */
export function SkillReviewCard({ inputId, title, onDone }: { inputId: string; title: string; onDone?: () => void }) {
  const [view, setView] = useState<ReviewView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    requestJson<ReviewView>(reviewPath(inputId), { signal: controller.signal })
      .then(next => { setView(next); setError(''); })
      .catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Не удалось загрузить проверку скилла'); });
    return () => controller.abort();
  }, [inputId]);
  const decide = async (decision: 'approve' | 'cancel') => {
    if (!view || busy) return;
    setBusy(true); setError('');
    try {
      const result = await requestJson<DecideResult>(reviewPath(inputId), { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': view.csrfToken }, body: JSON.stringify({ decision, digest: view.digest }) });
      if (!result.ok && result.status !== 'cancelled') setError(result.status === 'unverified' ? `Сохранено, но проверка не прошла: ${result.reason ?? ''}` : `Скилл не добавлен: ${result.reason ?? result.status}`);
      onDone?.();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось отправить решение');
    } finally { setBusy(false); }
  };
  const open = view?.state === 'open' && view.available;
  const locked = busy || !open;
  return <InputFrame className="skill-review-card" noun="проверку" busy={busy} label="Новый скилл" hint="Нужно ваше решение"
    title={title} message={view?.message} error={error}
    note={!view ? 'Загружаем…' : !view.available && view.state === 'open' ? 'Пакет изменился или устарел — попросите агента подготовить его заново' : view.state !== 'open' ? 'Проверка уже закрыта' : 'Сохранится только эта версия'}
    actions={<>
      <button type="button" className="confirm-decline" disabled={busy || view?.state !== 'open'} onClick={() => void decide('cancel')}>Отменить</button>
      <button type="button" className="confirm-accept" disabled={locked} onClick={() => void decide('approve')}>{busy ? 'Добавляем…' : 'Добавить скилл'}</button>
    </>}>
    {view?.available && <div className="skill-review">
      <dl className="skill-review-facts">
        <dt>Скилл</dt><dd><code>{view.skillId}</code></dd>
        <dt>Куда</dt><dd>{destinationLabel[view.destination] ?? view.destination}<br /><code>{view.where}</code></dd>
        <dt>Источник</dt><dd>{view.source}</dd>
        <dt>Отпечаток</dt><dd><code>{view.digest.slice(0, 16)}</code></dd>
      </dl>
      <ul className="skill-review-files" aria-label="Файлы">
        {view.files.map(file => <li key={file.path}><code>{file.path}</code> <span>{sizeLabel(file.bytes)}{file.executable ? ' · исполняемый' : ''}{file.adapted ? ' · изменён' : ''}</span></li>)}
      </ul>
      <details><summary>SKILL.md</summary><pre>{view.manifest}</pre></details>
      {view.changes.map(change => <details key={change.path} open><summary>Предлагаемое изменение: <code>{change.path}</code></summary><p>Было</p><pre>{change.before}</pre><p>Станет</p><pre>{change.after}</pre></details>)}
    </div>}
  </InputFrame>;
}
