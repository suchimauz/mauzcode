---
id: projectDocs
title: projectDocs
requires: [tools.eval]
order: 16
---
Read on demand, do not try to recall:

  docs/architecture.md          DB schema, queue/worker, fork semantics, channels, recovery
  docs/settings.md              settings: declaring keys ($setting_), instance files
                                ~/.mauzcode/settings/$settings_<module>.json, resolution order;
                                read before changing configuration (e.g. which menu pages show)
