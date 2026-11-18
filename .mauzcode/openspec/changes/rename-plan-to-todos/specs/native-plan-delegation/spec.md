## REMOVED Requirements

### Requirement: Native plan update
**Reason**: Renamed to the todo vocabulary to avoid confusion with planning mode, and extended with parallel active todos. The capability moves to `native-todo-delegation`.
**Migration**: Use `todo_update`; see "Native todo update" in `native-todo-delegation`. Presets granting the old adapter are migrated automatically.

### Requirement: Native plan completion
**Reason**: Renamed to the todo vocabulary to avoid confusion with planning mode. The capability moves to `native-todo-delegation`.
**Migration**: Use `todo_done`; see "Native todo completion" in `native-todo-delegation`. Presets granting the old adapter are migrated automatically.

### Requirement: Native delegation
**Reason**: Moved unchanged in meaning (tasks are now todos) to `native-todo-delegation`.
**Migration**: See "Native delegation" in `native-todo-delegation`.

### Requirement: Child-only task finish
**Reason**: Moved to `native-todo-delegation`; it now checks the child's todos.
**Migration**: See "Child-only task finish" in `native-todo-delegation`.

### Requirement: Typed finish result
**Reason**: Moved unchanged to `native-todo-delegation`.
**Migration**: See "Typed finish result" in `native-todo-delegation`.

### Requirement: Trusted agent binding
**Reason**: Moved to `native-todo-delegation` with the todo tool names.
**Migration**: See "Trusted agent binding" in `native-todo-delegation`.

### Requirement: Preset gating
**Reason**: Moved to `native-todo-delegation` with the todo tool names.
**Migration**: See "Preset gating" in `native-todo-delegation`.
