## Why
A 765 × 9340 screenshot fit the encoded byte budget but made subsequent model requests fail. Rejecting it at read time keeps the conversation usable.

## What Changes
- **BREAKING**: Reading an image with either edge over 2000 pixels returns a text error rather than an image attachment.
- Keep the existing byte limit and recommend viewport captures for visual inspection.

## Capabilities
### New Capabilities
None.

### Modified Capabilities
- `file-read-receipts`: distinguish attachable images from rejected reads; neither receives a receipt.

## Impact
Changes the shared image encoder, declares `buffer-image-size` as a direct dependency, and updates browser guidance and tool regression coverage. Existing transcripts and screenshot files are not rewritten by the guard.
