/** Every chat pet, with the renderer that draws it. Keep in sync with the agents.mascot CHECK and the new-session bridge. */
export const mascotCatalog = {
  crab: { name: 'Краб', kind: 'sheet' },
  deepy: { name: 'Deepy', kind: 'sheet' },
  whalegirl: { name: 'Whalegirl', kind: 'sheet' },
  dundun: { name: 'Dundun', kind: 'tokibean' },
  tabby: { name: 'Tabby', kind: 'tokibean' },
  shiba: { name: 'Shiba', kind: 'tokibean' },
  maneki: { name: 'Maneki', kind: 'tokibean' },
  daruma: { name: 'Daruma', kind: 'tokibean' },
  tuerye: { name: "Tu'er Ye", kind: 'tokibean' },
  calico: { name: 'Calico', kind: 'image' },
  cloudling: { name: 'Cloudling', kind: 'image' },
  clawd: { name: 'Clawd', kind: 'image' },
  claude: { name: 'Claude', kind: 'image' },
} as const;
export type Mascot = keyof typeof mascotCatalog;
export type MascotKind = (typeof mascotCatalog)[Mascot]['kind'];
export type MascotChoice = Mascot | 'random';
export const mascotNames = Object.fromEntries(Object.entries(mascotCatalog).map(([id, pet]) => [id, pet.name])) as { [K in Mascot]: (typeof mascotCatalog)[K]['name'] };
export function mascotsOfKind<K extends MascotKind>(kind: K) { return (Object.keys(mascotCatalog) as Mascot[]).filter(id => mascotCatalog[id].kind === kind); }
export function normalizeMascotChoice(value: unknown): MascotChoice { return typeof value === 'string' && Object.hasOwn(mascotCatalog, value) ? value as Mascot : 'random'; }
