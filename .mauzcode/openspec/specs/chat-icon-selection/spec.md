# Chat icon selection

## Purpose
Describe how callers find bundled Lucide artwork, assign it or custom artwork to a chat, and read the result as an image.

## Requirements

### Requirement: Search the local catalogue
Search SHALL return matching names, tags and scores from the bundled catalogue, ranked by descending score and then by name.

#### Scenario: Search by name or tag
- **WHEN** a caller searches for `palette` or its tag `watercolor`
- **THEN** `palette` ranks first for its exact name and appears among the tag matches.

#### Scenario: Limit results
- **WHEN** a caller searches with a valid integer limit from 1 to 30, defaulting to 5
- **THEN** at most that many matches are returned; a blank or unmatched query returns none. An invalid limit is rejected even for a blank query.

<!-- id: icons.search.rank -->
<!-- entities: query, catalogue entry -->
<!-- enforced: plugins/icons/src/icons/search.ts (icons.search) -->
<!-- test: plugins/icons/src/icons/icons.test.ts :: exact names, tags, bounds and missing matches -->

### Requirement: Retrieve bundled artwork
Lookup SHALL return the named local SVG unchanged by default, optionally centered in a padded square, and reject malformed or unknown names.

#### Scenario: Request a chat-sized drawing
- **WHEN** `shapes` is requested with padding
- **THEN** its drawing is scaled by 0.75 and translated by (7, 7) inside a 32 by 32 viewBox; without padding its original 24 by 24 viewBox remains.

<!-- id: icons.get.padded -->
<!-- entities: Lucide name, SVG -->
<!-- enforced: plugins/icons/src/icons/get.ts (icons.get) -->
<!-- test: plugins/icons/src/icons/icons.test.ts :: SVG retrieval, padding and path validation -->

### Requirement: Assign a catalogue icon
Catalogue assignment SHALL pass the padded SVG to chat icon storage and return the selected name with the resulting chat ID and icon.

#### Scenario: Select a named icon
- **WHEN** a caller selects `palette` for an explicit chat
- **THEN** that chat receives the padded artwork; without an explicit ID the assignment targets the calling agent.

<!-- id: icons.set.assign -->
<!-- entities: Lucide name, chat -->
<!-- enforced: plugins/icons/src/icons/set.ts (icons.set); src/chat/setIcon.ts (chat.setIcon) -->
<!-- test: plugins/icons/src/icons/icons.test.ts :: set passes padded SVG and target to core persistence -->

### Requirement: Clean custom SVG before storage
Raw icon assignment SHALL require one SVG root, remove disallowed elements and event attributes, and reject cleaned artwork exceeding 8192 bytes.

#### Scenario: Preserve local drawing references
- **WHEN** an SVG contains a local gradient, a script, an event handler and a use element referencing an external URL
- **THEN** the local gradient reference remains but the script, event attribute and external href do not.

#### Scenario: Supply dimensions without a viewBox
- **WHEN** the root has no viewBox
- **THEN** positive numeric width and height supply its viewBox; without usable dimensions the icon is rejected.

<!-- id: chat.sanitizeSvg.clean -->
<!-- entities: raw SVG, stored SVG -->
<!-- enforced: src/chat/sanitizeSvg.ts (chat.sanitizeSvg); src/chat/setIcon.ts (chat.setIcon) -->
<!-- test: src/chat/chat.test.ts :: sanitizeSvg keeps drawing and drops scripts, handlers, foreign content and external refs -->
<!-- verified_by: src/chat/chat.test.ts :: sanitizeSvg rejects non-svg, sizeless and oversized input -->

### Requirement: Replace or clear the chat icon
An icon update SHALL require exactly one of SVG, emoji text or reset and return the target chat ID and stored icon, or null for reset.

#### Scenario: Store a text badge
- **WHEN** a caller supplies emoji text for a non-archived chat
- **THEN** the first two Unicode code points after trimming are drawn on a circle, using the supplied background or `#334155`; an invalid background is rejected.

#### Scenario: Read the updated icon
- **WHEN** an icon update succeeds
- **THEN** the stored chat and its live state, if loaded, reflect the replacement or reset, and an agent change notification identifies the chat and the reason `icon`.

<!-- id: chat.setIcon.update -->
<!-- entities: chat, stored icon -->
<!-- enforced: src/chat/setIcon.ts (chat.setIcon) -->
<!-- test: src/chat/chat.test.ts :: setIcon stores emoji/svg, icon draws it as an image with a model mark, reset returns the logo -->

### Requirement: Render custom artwork as an image
The chat icon renderer SHALL display stored custom SVG through an image data URL rather than inserting its markup into the page.

#### Scenario: Draw the stored icon
- **WHEN** the renderer receives nonblank SVG
- **THEN** it emits an image whose data URL contains the encoded drawing.

<!-- id: chat.icon.src -->
<!-- entities: stored icon, image -->
<!-- enforced: src/chat/icon.ts (chat.icon) -->
<!-- test: src/chat/chat.test.ts :: setIcon stores emoji/svg, icon draws it as an image with a model mark, reset returns the logo -->

<!-- sources: plugins/icons/src/icons/{search,get,set}.ts; src/chat/{sanitizeSvg,setIcon,icon}.ts -->
<!-- Last verified: 2026-11-22 at d35de7c21ff42cdbfb2db0272d6874d4db17a4e0 (source inspection) -->
<!-- uncertainty: The catalogue assignment test substitutes a storage spy; it does not exercise end-to-end persistence or notification delivery. -->
<!-- deferred: plugins/icons/ui/index.tsx; plugins/icons/src/icons/$route_catalog_GET.ts; plugins/icons/src/icons/$route_svg_GET.ts (native catalogue browser and transport) -->
