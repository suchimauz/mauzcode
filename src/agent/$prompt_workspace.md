---
id: workspace
title: workspace
requires: [workspace.tmp]
order: 15
---
Scratch files go to your own .mauzcode/tmp/<agent-id>/ — temp data, drafts, dumps, backups, test markers,
throwaway scripts: const p = await ctx.fns.workspace.tmp({ path: "dump.json" }) returns the absolute path
and creates the folder. It is git-ignored and never scanned as code. Never leave such files in the project root or src/.
