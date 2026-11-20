import type { MascotActivity } from './mascotActivity';

/** Per-state animated images under public/mascot/<pet>/. Missing activities fall back to `working`, then `idle`. */
export type ImageMascotManifest = {
  /** Source canvas size and the idle art's bounding box [left, top, right, bottom] in source pixels. */
  size: [number, number]; art: [number, number, number, number];
  /** Rendered height of that art box in CSS px; the box's bottom rests on the input. */
  height: number;
  idle: string; working: string; done: string; sleeping: string; poke: string[];
  /** Occasional idle variations, played once after a quiet spell. */
  idleExtras?: string[];
  states: Partial<Record<MascotActivity, string>>;
};

export const imageMascots = {
  calico: { size: [266, 200], art: [35, 24, 221, 166], height: 42, idle: 'idle.png', working: 'typing.png', done: 'happy.png', sleeping: 'sleeping.png', poke: ['poke.png', 'happy.png'],
    states: { thinking: 'thinking.png', command: 'building.png', git: 'carrying.png', testing: 'building.png', editing: 'typing.png', searching: 'sweeping.png', delegating: 'conducting.png', planning: 'juggling.png', compacting: 'sweeping.png', waiting: 'notification.png', error: 'error.png' } },
  cloudling: { size: [302, 300], art: [94, 94, 205, 205], height: 38, idle: 'idle.gif', working: 'typing.gif', done: 'attention.gif', sleeping: 'sleeping.gif', poke: ['attention.gif'], idleExtras: ['idle-reading.gif'],
    states: { thinking: 'thinking.gif', command: 'building.gif', git: 'carrying.gif', testing: 'building.gif', editing: 'typing.gif', reading: 'idle-reading.gif', searching: 'sweeping.gif', delegating: 'conducting.gif', planning: 'juggling.gif', compacting: 'sweeping.gif', waiting: 'notification.gif', error: 'error.gif' } },
  clawd: { size: [500, 500], art: [166, 344, 333, 455], height: 38, idle: 'idle-living.svg', working: 'working-typing.svg', done: 'happy.svg', sleeping: 'sleeping.svg', poke: ['react-left.svg', 'react-right.svg', 'react-annoyed.svg'], idleExtras: ['idle-look.svg', 'idle-reading.svg'],
    states: { thinking: 'working-thinking.svg', command: 'working-typing.svg', git: 'working-carrying.svg', testing: 'working-building.svg', editing: 'working-typing.svg', reading: 'idle-reading.svg', searching: 'working-debugger.svg', browsing: 'working-wizard.svg', delegating: 'working-juggling.svg', planning: 'working-ultrathink.svg', compacting: 'working-sweeping.svg', waiting: 'notification.svg', error: 'error.svg' } },
  claude: { size: [240, 220], art: [53, 110, 181, 195], height: 40, idle: 'idle.svg', working: 'using-tool.svg', done: 'done.svg', sleeping: 'asleep.svg', poke: ['greeting.svg'], idleExtras: ['idle-breathe.svg', 'idle-look-around.svg', 'gag-coffee.svg', 'gag-dance.svg', 'gag-robot.svg', 'gag-buffering.svg'],
    states: { thinking: 'thinking.svg', command: 'running-commands.svg', git: 'committing.svg', testing: 'testing.svg', editing: 'writing.svg', reading: 'reading.svg', searching: 'searching-code.svg', browsing: 'searching-web.svg', delegating: 'directing-helpers.svg', planning: 'plan-progress.svg', waiting: 'waiting-for-you.svg', compacting: 'compacting.svg', error: 'error.svg' } },
} satisfies Record<string, ImageMascotManifest>;
export type ImagePet = keyof typeof imageMascots;

/** The file for an activity: its own art, else the general working art for busy activities, else idle. */
export function imageFor(manifest: ImageMascotManifest, activity: MascotActivity): string {
  return manifest.states[activity] ?? (activity === 'idle' ? manifest.idle : manifest.working);
}
