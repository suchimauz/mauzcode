// Evaluation order matters: every vendored skin overwrites window.PetRenderer, so capture it before the next one loads.
import './dundun';
import '../../vendor/tokibean/tabby.js';
import { captureRenderer } from './types';
export default captureRenderer('tabby');
