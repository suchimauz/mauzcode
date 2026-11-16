## Why

The shipped Standard preset already grants OpenSpec, but this installation has a customized stored `standard` preset granting only `nrepl`. Conservative upgrades correctly preserve that customization, leaving new Standard agents without OpenSpec despite the user's request.

## What Changes

- Explicitly add `openspec` to this installation's stored `standard` plugin grants, preserving `nrepl` and every other field.
- Verify that a freshly resolved Standard snapshot permits every mounted OpenSpec function, without modifying existing agent snapshots.
- Document and test additive plugin opt-in so granting OpenSpec does not replace unrelated plugin grants.
- Keep shipped defaults, conservative migrations, deny precedence and approval requirements unchanged.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `agent-presets`: Specify preservation of unrelated stored settings when explicitly opting a customized Standard preset into OpenSpec.

## Impact

This is a targeted stored-preset configuration change using `agentPreset.update`, plus documentation and regression coverage. It requires no new runtime API, migration, restart or dependency. Existing agents retain their creation-time snapshots; new Standard agents receive the grant. The user explicitly requested both the OpenSpec change and immediate implementation.
