## 1. Implementation
- [x] 1.1 Bound image reads, inspect header dimensions and reject oversized images before attachment while preserving the original file.
- [x] 1.2 Document viewport capture and cropping guidance for browser inspection.

## 2. Verification
- [x] 2.1 Cover a small PNG returned unchanged and a compressed 765 × 9340 PNG rejected without attachment or file mutation.
- [x] 2.2 Verify runtime reload, metadata, typecheck and the fast test suite (4081 passed during implementation; no live model request).
