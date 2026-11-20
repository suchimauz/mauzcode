## Why
The 2000-pixel ceiling rejects ordinary 2560 × 1440 screenshots even when they fit the encoded byte budget. A 3000-pixel ceiling admits these captures while still rejecting unusually tall full-page screenshots.

## What Changes
- Accept supported images up to 3000 pixels on each axis, inclusive.
- Retain the 4.5 MiB base64 budget, unchanged attachments, and viewport or crop advice on rejection.

## Capabilities
### New Capabilities
None.

### Modified Capabilities
- `file-read-receipts`: relax the dimension check for inline images returned by `read`.

## Impact
Affects the shared image guard and its regression tests. No new dependencies, settings or provider-specific behavior.
