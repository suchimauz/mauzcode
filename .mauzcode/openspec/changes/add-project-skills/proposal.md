# Proposal

## Why

MauzCode can read a plugin’s workflow and export it to other coding tools, but a chat cannot discover and apply an Agent Skill belonging to its workspace by name. Teams need portable project instructions, reusable server-side packages and opt-in plugin skills without copying them into every repository or giving agents new permissions.

## What Changes

- Discover standard `SKILL.md` packages from the local or SSH workspace, a project-specific or instance-wide server library, and explicitly declared exports of mounted plugins. Server packages are ordinary directories, not database content. Give each source a stable, qualified ID; never resolve a collision by precedence.
- Let a project configure extra named roots and opt in to individual plugin exports in `.mauzcode/skills.json`. Apply the same visibility rules to discovery, manual invocation, automatic selection and resource reads.
- Add a **Skills** section to the existing slash menu. Show short names with their sources in the menu and as chips in the composer and transcript, while preserving the exact, copyable command, e.g. `/skill.plugin.git:review`.
- Give eligible agents one source-independent `read_skill` tool. Add a Creator-only `add_skill` workflow to draft or import one package from a directory or public HTTPS Git repository, preview optional adaptations and save only the approved package.
- Leave existing commands, plugin documentation and `mauzcode skills mount` intact. No management screen, Git auto-updates or external publication in this version.

## Capabilities

### New Capabilities
- `project-agent-skills`: portable packages, qualified identities, workspace, server and plugin sources, progressive reading, safe creation and import.

### Modified Capabilities
- `chat-command-registry`: skill entries in the shared catalogue, search versus exact invocation, source-labelled chips and replay-safe dispatch in new and existing chats.
- `agent-presets`: native skill access, workspace enablement plus effective plugin grants, restricted Creator inventory and authoring, and consistent enforcement on all entry points.

## Impact

Affects package discovery, the plugin manifest, workspace-aware file access, preset and prompt generation, native tools, the command catalogue/dispatcher, and the React composer and transcript. Adds an installation-owned filesystem library; no skill-package database migration or automatic import of existing plugin workflows. This change is a specification for review: implementation and release are separate work.
