// Only the microphone source is substituted. Chromium runs the real media stream,
// AudioWorklet, PCM encoder, socket, editor and submission client.
import { createRoot } from 'react-dom/client';
import { LiveComposer } from '../../frontend/src/components/mauzcode/LiveComposer';

window.mauzcodeLive = { subscribe: () => () => {} };
Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: async () => {
  const context = new AudioContext();
  const oscillator = context.createOscillator();
  oscillator.frequency.value = 440;
  const output = context.createMediaStreamDestination();
  const volume = context.createGain();
  oscillator.connect(volume).connect(output);
  // Allow an integration test to generate a natural silence boundary before Stop.
  const tone = (event: Event) => { volume.gain.value = (event as CustomEvent<boolean>).detail ? 1 : 0; };
  window.addEventListener('fixture:tone', tone);
  oscillator.start();
  await context.resume();
  // Stopping capture stops its real track; dispose the corresponding tone graph too.
  const track = output.stream.getAudioTracks()[0]!;
  const stop = track.stop.bind(track);
  track.stop = () => { stop(); window.removeEventListener('fixture:tone', tone); oscillator.stop(); void context.close(); };
  return output.stream;
} });
const agentId = new URLSearchParams(location.search).get('agent')!;
createRoot(document.getElementById('root')!).render(<LiveComposer agentId={agentId} running onAccepted={() => {
  document.body.dataset.accepted = String(Number(document.body.dataset.accepted || 0) + 1);
}} />);
