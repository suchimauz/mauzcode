export type LiveStatus = 'connecting' | 'connected' | 'disconnected';
/** 'lost' only after a real transport failure; a planned stream replacement stays 'ok'. */
export type LiveHealth = 'ok' | 'lost';
export type LiveEvent = { type?: string; topic?: string; agentId?: string };
/** Window bridge of the desktop client's integrated frame (absent in ordinary browsers). */
export type DesktopWindowBridge = {
  version: number;
  platform: 'darwin' | 'win32' | 'linux';
  titleBar: { height: number; controls: 'left' | 'right' };
  setTheme: (theme: 'light' | 'dark') => void;
  openMenu: (x: number, y: number) => void;
};
declare global {
  interface Window {
    /** Present only in the sandboxed desktop client; the page never calls it for status UI. */
    mauzcodeDesktopLive?: unknown;
    /** Present only in the sandboxed desktop client: title-strip geometry, theme reporting and the shell menu. */
    mauzcodeDesktopWindow?: DesktopWindowBridge;
    mauzcodeLive?: {
      subscribe: (options: { name: string; types?: string[]; onEvent: (event: LiveEvent) => void; resync: (reason: string) => void }) => () => void;
      refreshTopics?: () => void;
      getStatus?: () => LiveStatus;
      onStatus?: (listener: (status: LiveStatus) => void) => () => void;
      getHealth?: () => LiveHealth;
      onHealth?: (listener: (health: LiveHealth) => void) => () => void;
    };
  }
}
let loading: Promise<void> | undefined;
/** Reuse MauzCode's transport and reconnect/resume recovery; never open a second SSE implementation. */
export function loadLiveClient(): Promise<void> {
  if (window.mauzcodeLive) return Promise.resolve();
  if (loading) return loading;
  loading = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = '/procs/events/client.js'; script.async = true;
    script.onload = () => window.mauzcodeLive ? resolve() : reject(new Error('Live transport unavailable'));
    script.onerror = () => { script.remove(); reject(new Error('Не удалось подключить живые обновления')); };
    document.head.append(script);
  }).catch(error => { loading = undefined; throw error; });
  return loading;
}
