## Context
Local and remote `read` calls share `agent.imageContent`. Its bounded read enforces the base64 budget independently of the header-based width and height check.

## Goals / Non-Goals
Keep one predictable admission rule without resizing files, negotiating provider capabilities, or changing screenshot capture or recovery guidance.

## Decisions
Use 3000 pixels as the inclusive ceiling for each axis. [Anthropic's vision guidance](https://platform.claude.com/docs/en/build-with-claude/vision) informs this choice as a recommendation, not a universal provider maximum. Keep the shared guard rather than varying it by model: the result can outlive the current provider selection.

## Risks / Trade-offs
Larger attachments can cost more to process, and admission cannot guarantee model acceptance. Keep the existing 4.5 MiB base64 cap and recommend viewport captures or cropped copies rather than silently transforming the image.
