import dundun from './dundun';
import tabby from './tabby';
import shiba from './shiba';
import maneki from './maneki';
import daruma from './daruma';
import tuerye from './tuerye';
import type { TokibeanRenderer } from './types';
export const tokibeanRenderers = { dundun, tabby, shiba, maneki, daruma, tuerye } satisfies Record<string, TokibeanRenderer>;
export type TokibeanPet = keyof typeof tokibeanRenderers;
