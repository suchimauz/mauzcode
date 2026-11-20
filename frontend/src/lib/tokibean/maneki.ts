// Evaluation order matters: every vendored skin overwrites window.PetRenderer, so capture it before the next one loads.
import './shiba';
import '../../vendor/tokibean/maneki.js';
import { captureRenderer } from './types';
export default captureRenderer('maneki');
