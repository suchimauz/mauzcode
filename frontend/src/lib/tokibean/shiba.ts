// Evaluation order matters: every vendored skin overwrites window.PetRenderer, so capture it before the next one loads.
import './tabby';
import '../../vendor/tokibean/shiba.js';
import { captureRenderer } from './types';
export default captureRenderer('shiba');
