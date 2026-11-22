# app-icon Specification

## Purpose
Defines the single MauzCode brand icon and guarantees that every built-in icon surface — browser favicon, home-screen/PWA icons, desktop app and tray icons, browser extension icons — is derived from one canonical source.

## Requirements

### Requirement: Canonical brand icon source

The repository SHALL contain exactly one canonical SVG of the MauzCode mark (a cat face formed by code braces on a dark rounded tile), and every built-in raster or inline icon SHALL be generated from it rather than drawn separately.

#### Scenario: Assets regenerate from the canonical SVG

- **WHEN** a developer runs the icon generation command after editing the canonical SVG
- **THEN** the web PNG icons, desktop PNG/ICO/ICNS/tray assets and extension icons are rewritten from that SVG

#### Scenario: No stale legacy marks

- **WHEN** the built-in icon assets are inspected
- **THEN** none of them shows the former terminal-prompt glyph or the former "H" monogram

### Requirement: Built-in favicon uses the brand icon

When no per-instance favicon override is set, `ui.faviconUrl` SHALL return the canonical brand SVG as a data URL, and `/favicon.ico` SHALL serve it; a per-instance override set with `ui.setFavicon` SHALL still take precedence. Every server-rendered page, the React shell document and the sign-in document SHALL link the favicon explicitly.

#### Scenario: Default favicon

- **WHEN** no `ui.favicon` setting is stored and a page shell is rendered
- **THEN** its `<link rel="icon">` carries the brand SVG and `GET /favicon.ico` returns the same image as `image/svg+xml`

#### Scenario: Instance override still wins

- **WHEN** an instance sets its own favicon with `ui.setFavicon`
- **THEN** pages and `/favicon.ico` serve the override, and `reset: true` brings back the brand icon

#### Scenario: React shell and sign-in link the favicon

- **WHEN** the React shell document or the sign-in document is served
- **THEN** it contains `<link rel="icon" href="/favicon.ico">`, and the sign-in content security policy allows same-origin images and manifests

### Requirement: Home-screen and PWA icons use the brand icon

`/ui/app-icon` SHALL serve opaque PNG renderings of the brand icon at 180, 192 and 512 pixels, the web manifest SHALL keep referencing them, and the React shell and sign-in documents SHALL link `/ui/app-icon?size=180` as `apple-touch-icon` and `/ui/manifest.webmanifest` as `manifest`.

#### Scenario: PWA icon sizes

- **WHEN** `GET /ui/app-icon?size=192` is requested
- **THEN** the response is a 192×192 PNG of the brand icon

#### Scenario: Shell exposes install icons

- **WHEN** a phone opens the React shell or the sign-in page
- **THEN** the document links the apple-touch icon and the web manifest, so adding it to the home screen uses the brand icon

### Requirement: Desktop client icons use the brand icon

The desktop client SHALL ship the brand icon as its window icon (`icon.png`), Windows icon (`icon.ico`, 16–256 px), macOS icon (`icon.icns`, 16–1024 px) and Windows tray icon (`tray.png`), and SHALL ship black-on-transparent macOS template tray icons (18 and 36 px) derived from the brand silhouette.

#### Scenario: Desktop asset formats

- **WHEN** the desktop icon tests run
- **THEN** every PNG, ICO and ICNS asset decodes with valid structure and the template icons contain only black pixels with transparency

### Requirement: Browser extensions show the brand icon

The MauzCode browser extensions SHALL declare the brand icon in their manifests at 16, 32, 48 and 128 pixels.

#### Scenario: Extension manifest icons

- **WHEN** an extension manifest is loaded
- **THEN** its `icons` (and `action.default_icon` where an action exists) point to existing PNG files of the brand icon at those sizes

### Requirement: In-app brand mark shows the brand icon

Wherever the React UI shows the MauzCode brand mark — the navigation sidebar (expanded and compact), the new-session welcome greeting and the UI LAB prototype header — it SHALL render the brand icon generated from the canonical SVG instead of a text letter, as decorative content hidden from assistive technology.

#### Scenario: Sidebar brand

- **WHEN** the navigation sidebar renders, expanded or compact
- **THEN** its brand mark is an image of the brand icon with empty alt text, and no letter "h" is shown

#### Scenario: Welcome greeting brand

- **WHEN** the new-session welcome renders
- **THEN** the greeting's brand mark is the brand icon image

### Requirement: Standalone pages carry the brand favicon

The desktop connection window document and the documentation landing page SHALL embed the brand SVG as their favicon, kept identical to the canonical SVG by the icon generator.

#### Scenario: Embedded favicon matches canonical SVG

- **WHEN** the icon generator has run
- **THEN** `desktop/index.html` and `docs/index.html` contain a `<link rel="icon">` whose data URL decodes to the canonical brand SVG
