# Spec Delta

## MODIFIED Requirements

### Requirement: Two distinct entry points
An editable open chat SHALL show the voice controls as one group at the right edge of the composer's controls row, in this order: voice settings, voice mode, inline voice input. Each SHALL be independently named and keyboard-accessible. Voice settings SHALL use a settings (gear) icon, and inline voice input SHALL be the visually primary, accent-filled control. Neither entry point SHALL be available on the new-session or read-only composer.

#### Scenario: Discover without activating
- **WHEN** the user navigates the footer by keyboard or screen reader
- **THEN** both actions are distinguishable, the effective audio destination is discoverable before activation, and no microphone is requested.

#### Scenario: Insecure context or unsupported browser
- **WHEN** the page is opened over plain HTTP from a non-localhost address, or the browser lacks microphone capture or AudioWorklet
- **THEN** both controls are shown disabled with an explanation of what is required, no microphone permission is requested and no voice socket is opened.

#### Scenario: Fixed order and emphasis
- **WHEN** the user tabs through the voice group
- **THEN** focus reaches voice settings, then voice mode, then inline voice input, and only inline voice input has the accent fill.
