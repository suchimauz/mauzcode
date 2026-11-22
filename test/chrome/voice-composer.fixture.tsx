// Only the microphone source is substituted. Chromium runs the real media stream,
// AudioWorklet, PCM encoder, socket, editor and submission client.
import { useChatSelection } from '../../frontend/src/hooks/useChatSelection';
import { createRoot } from 'react-dom/client';
import { ComposerCoordinator, LiveComposer, useComposerNavigation } from '../../frontend/src/components/mauzcode/LiveComposer';

window.mauzcodeLive = { subscribe: () => () => {} };
Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: async () => {
  document.body.dataset.captures = String(Number(document.body.dataset.captures || 0) + 1);
  const context = new AudioContext();
  const oscillator = context.createOscillator();
  oscillator.frequency.value = 440;
  const output = context.createMediaStreamDestination();
  const volume = context.createGain();
  oscillator.connect(volume).connect(output);
  // Allow an integration test to generate a natural silence boundary before Stop.
  const tone = (event: Event) => { volume.gain.value = (event as CustomEvent<boolean>).detail ? 1 : 0; };
  window.addEventListener('fixture:tone', tone);
  const marker = (event: Event) => {
    oscillator.frequency.value = (event as CustomEvent<boolean>).detail ? 2400 : 440;
  };
  window.addEventListener('fixture:marker', marker);
  oscillator.start();
  await context.resume();
  // Stopping capture stops its real track; dispose the corresponding tone graph too.
  const track = output.stream.getAudioTracks()[0]!;
  const stop = track.stop.bind(track);
  track.stop = () => { stop(); window.removeEventListener('fixture:tone', tone); window.removeEventListener('fixture:marker', marker); oscillator.stop(); void context.close(); };
  return output.stream;
} });
const chats = new URLSearchParams(location.search).getAll('agent');
function Fixture() {
  const { selected, select } = useChatSelection();
  const beforeNavigation = useComposerNavigation();
  const navigate = (id: string) => { if (id !== selected) { beforeNavigation(); select(id); } };
  return <><nav>{chats.map((id, i) => <button key={id} data-chat={i} onClick={() => navigate(id)}>Chat {i + 1}</button>)}</nav>
    <LiveComposer key={selected} agentId={selected} running onAccepted={() => {
      document.body.dataset.accepted = String(Number(document.body.dataset.accepted || 0) + 1);
    }} /></>;
}
createRoot(document.getElementById('root')!).render(<ComposerCoordinator><Fixture /></ComposerCoordinator>);
