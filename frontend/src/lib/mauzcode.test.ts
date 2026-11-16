import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, requestJson } from './mauzcode';

afterEach(() => vi.unstubAllGlobals());

function respond(body: unknown, status = 400) {
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json; charset=utf-8' },
  }));
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}

describe('shell requestJson response boundary', () => {
  it.each([null, false, 42, 'denied', [], {}, { message: 42 }, { message: {}, error: [] }, { message: '', error: '' }])(
    'uses HTTP fallback for malformed error body %j', async body => {
      const fetcher = respond(body, 422);
      const error: unknown = await requestJson('/api/test').catch(error => error);
      expect(error).toBeInstanceOf(ApiError);
      expect(error).toMatchObject({ message: 'Ошибка HTTP 422', status: 422 });
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );
  it.each([
    [{ message: 'message', error: 'error' }, 'message'],
    [{ message: '', error: 'error' }, 'error'],
    [{ message: null, error: 'error' }, 'error'],
    [{ message: 7, error: 'error' }, 'error'],
    [{ message: 'message', error: {} }, 'message'],
  ])('selects only string message/error fields in %j', async (body, message) => {
    respond(body, 403);
    await expect(requestJson('/api/test')).rejects.toMatchObject({ message, status: 403 });
  });
  it.each([200, 401, 500])('keeps non-JSON authentication boundary at HTTP %s', async status => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>login</html>', {
      status, headers: { 'content-type': 'text/html' },
    })));
    await expect(requestJson('/api/test')).rejects.toMatchObject({
      message: 'Сессия недоступна. Откройте MauzCode и войдите снова.', status: status === 200 ? 401 : status,
    });
  });
  it.each([null, [1, 2], { ok: true }])('returns successful JSON unchanged: %j', async body => {
    const fetcher = respond(body, 200);
    const signal = new AbortController().signal;
    expect(await requestJson('/api/test', { signal })).toEqual(body);
    expect(fetcher).toHaveBeenCalledWith('/api/test', {
      credentials: 'same-origin', cache: 'no-store', signal, headers: { Accept: 'application/json' },
    });
  });
});
