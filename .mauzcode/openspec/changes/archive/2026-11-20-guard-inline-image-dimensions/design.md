## Context
Local and remote image reads converge on `agent.imageContent` before the tool result becomes model-visible. Compressed byte length does not bound either pixel dimension.

## Goals / Non-Goals
Keep incompatible images out of new tool results without modifying source files. Do not repair historical messages, change browser capture semantics, or contact a provider to validate a read.

## Decisions
Check the byte budget with a bounded read before encoding. Read dimensions from the image header using `buffer-image-size` and apply the same 2000-pixel per-axis ceiling across providers. Reject instead of silently resizing: users can choose the relevant region and retain text detail. Browser guidance recommends scrolling to the relevant viewport.

## Risks / Trade-offs
A provider may accept a larger image on its own. A conservative shared limit trades that flexibility for predictable behavior as additional images enter context. Header inspection is not a full image integrity check.
