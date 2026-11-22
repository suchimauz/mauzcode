// A private CDP target, attached before navigation so the handshake and first frame are observable.
import type { HeadlessChrome } from './headless';

export async function openVoiceTab(chrome: HeadlessChrome, secret: string) {
  const target = await (await fetch(`${chrome.url}/json/new?about:blank`, { method: 'PUT' })).json() as { id: string; webSocketDebuggerUrl: string };
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise<void>((resolve, reject) => { ws.onopen = () => resolve(); ws.onerror = () => reject(new Error('Could not attach test Chrome')); });
  const pending = new Map<number, { resolve: (result: any) => void; reject: (e: Error) => void }>();
  let id = 0, leaked = false;
  const frames: { sent: boolean; type: string }[] = [];
  const sockets: string[] = [];
  const pcmFrames: Buffer[] = [];
  let closedSockets = 0;
  ws.onmessage = ({ data }) => {
    const msg = JSON.parse(String(data));
    if (msg.id) {
      const call = pending.get(msg.id); if (!call) return;
      if (msg.error || msg.result.exceptionDetails) call.reject(new Error(msg.error?.message ?? msg.result.exceptionDetails.text));
      else call.resolve(msg.result);
      return;
    }
    if (!msg.method.startsWith('Network.')) return;
    // Include HTTP request bodies, extra/handshake headers and both WS directions.
    leaked ||= String(data).includes(secret);
    if (msg.method === 'Network.webSocketClosed') closedSockets++;
    if (msg.method === 'Network.webSocketCreated') sockets.push(msg.params.url);
    if (!['Network.webSocketFrameSent', 'Network.webSocketFrameReceived'].includes(msg.method)) return;
    const { opcode, payloadData } = msg.params.response;
    if (opcode === 2 && msg.method.endsWith('Sent')) pcmFrames.push(Buffer.from(payloadData, 'base64').subarray(4)); // Skip the uint32 sequence.
    if (opcode === 2) leaked ||= Buffer.from(payloadData, 'base64').includes(secret);
    if (opcode === 1 || opcode === 2) frames.push({ sent: msg.method.endsWith('Sent'), type: opcode === 2 ? 'pcm' : JSON.parse(payloadData).type });
  };
  const command = (method: string, params = {}): Promise<any> => new Promise((resolve, reject) => {
    const seq = ++id;
    const timer = setTimeout(() => { pending.delete(seq); reject(new Error(`Timed out: ${method}`)); }, 5000);
    pending.set(seq, { resolve: v => { clearTimeout(timer); pending.delete(seq); resolve(v); }, reject: e => { clearTimeout(timer); pending.delete(seq); reject(e); } });
    ws.send(JSON.stringify({ id: seq, method, params }));
  });
  const evaluate = async (expression: string) => (await command('Runtime.evaluate', { expression, userGesture: true, returnByValue: true })).result.value;
  const wait = async (expression: string) => {
    const deadline = Date.now() + 5000;
    do { if (await evaluate(`Boolean(${expression})`)) return; await Bun.sleep(25); } while (Date.now() < deadline);
    throw new Error(`Composer condition timed out: ${expression}`);
  };
  await command('Network.enable');
  const close = async () => { ws.close(); await fetch(`${chrome.url}/json/close/${target.id}`, { signal: AbortSignal.timeout(2000) }); };
  return { command, evaluate, wait, frames, sockets, pcmFrames, closedSockets: () => closedSockets, leaked: () => leaked, close };
}
