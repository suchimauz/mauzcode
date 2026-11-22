# Workspace file browsing

## Purpose
Describe how people browse local and SSH directories and preview files from the standalone Files page or an agent's Canvas tab.

<!-- last_verified: d35de7c2, 2026-11-22 -->

## Requirements

### Requirement: Standalone browser access
The standalone Files and raw routes SHALL reject unauthenticated requests when authentication is required and reject unknown SSH aliases before serving files.

#### Scenario: Missing authentication
- **WHEN** authentication is required and the request has neither a user nor legacy authorization
- **THEN** the route returns 401.

#### Scenario: Unrecognized host
- **WHEN** a request passes authentication but names an unknown host
- **THEN** the route returns 400.

<!-- id: files.route-get.access -->
<!-- entities: Files request, SSH alias -->
<!-- enforced: src/files/$route_GET.ts and src/files/$route_raw_GET.ts, default exports -->

### Requirement: Directory contents
A local listing SHALL return immediate children with names and directory flags, sorted by directory first and then by name within each group, omitting `.git`, `node_modules` and `.DS_Store`.

#### Scenario: Browse a local directory
- **WHEN** a directory contains `a.txt`, `src/` and `.git/`
- **THEN** the listing places `src` before `a.txt`, marks only `src` as a directory and omits `.git`.

<!-- id: files.list.local -->
<!-- entities: directory, entry -->
<!-- enforced: src/files/list.ts, default export local readdir branch -->
<!-- test: src/files/list.test.ts :: directories come first, then files, both alphabetical -->

### Requirement: Private results are unavailable
Standalone browsing, raw access and Canvas file reads SHALL return 404 for private result paths and browser listings SHALL omit entries identified as private.

#### Scenario: Alias in a directory
- **WHEN** a listed child resolves into `.mauzcode/results` on the local or selected SSH host
- **THEN** the browser omits its name even if the alias itself does not contain that path segment.

#### Scenario: Private target
- **WHEN** an authorized request directly names a file inside the configured local result store
- **THEN** it receives 404 rather than file contents.

<!-- id: files.is-private-result.browser -->
<!-- kind: invariant -->
<!-- entities: private result, alias, directory listing -->
<!-- enforced: src/files/isPrivateResult.ts, src/files/browserData.ts, src/files/rawResponse.ts and src/canvas/$route_$id_item_$itemId_POST.ts, default exports -->
<!-- test: src/files/privateListing.mock.test.ts :: private listing filters canonical aliases before response (local); private listing filters canonical aliases before response (remote-test) -->

### Requirement: Bounded preview data
File reads for either browser SHALL return preview metadata instead of inline content for recognized media, PDFs, files larger than 1 MiB and text reads containing a NUL character.

#### Scenario: Media classification
- **WHEN** a browser requests JSON data for a PNG, MP4, MP3 or PDF file
- **THEN** it receives the image, video, audio or PDF preview kind respectively, with file size instead of decoded text.

#### Scenario: Text boundary
- **WHEN** a Markdown file is exactly 1 MiB and its decoded text contains no NUL
- **THEN** the response includes its content and Markdown kind; above that size the kind is download and content is omitted.

<!-- id: files.browser-data.preview-kind -->
<!-- entities: file, preview metadata -->
<!-- enforced: src/files/browserData.ts and src/canvas/$route_$id_item_$itemId_POST.ts, previewKind branches -->
<!-- test: src/files/routeMediaPreview.test.ts :: uses native preview elements for video, audio and pdf -->

### Requirement: Raw preview and download
The raw Files endpoint SHALL serve available file bytes without text decoding, with a content type, byte length, sandbox policy and no-referrer policy; HEAD responses SHALL omit the body.

#### Scenario: PNG preview
- **WHEN** a client fetches a PNG via `/files/raw`
- **THEN** the response contains the original bytes with type `image/png`.

#### Scenario: Download request
- **WHEN** a client requests a file with `download=1`
- **THEN** the raw endpoint sets `Content-Disposition` to `attachment`.

<!-- id: files.raw-response.body -->
<!-- entities: raw file, HTTP response -->
<!-- enforced: src/files/rawResponse.ts and src/files/$route_raw_GET.ts, default exports -->
<!-- test: src/files/routeMediaPreview.test.ts :: renders png through the raw media endpoint without decoding it as text -->

### Requirement: Browser navigation context
Standalone navigation SHALL retain the selected SSH host. A Canvas workspace tree SHALL open a selected file in place using the agent and item identifiers of its tab.

#### Scenario: Standalone SSH directory
- **WHEN** a person selects a child in a standalone SSH directory listing
- **THEN** the Files page navigates to the child path with the same host query parameter.

#### Scenario: Canvas tree selection
- **WHEN** a person selects a Markdown file in the workspace tree
- **THEN** the viewer requests the selected path through the tab-bound endpoint and displays it in the same viewer.

<!-- id: canvas-file.navigate.tree -->
<!-- entities: Files page, SSH host, Canvas tab -->
<!-- enforced: frontend/src/components/mauzcode/FilesPage.tsx FilesPage; frontend/src/components/mauzcode/CanvasFile.tsx CanvasFile -->
<!-- test: frontend/src/components/mauzcode/CanvasFile.test.tsx :: shows the workspace tree and opens a file in place through the tab-bound endpoint -->

### Requirement: Render previews without executing document scripts
The shared viewer SHALL skip embedded HTML in rendered Markdown and use sandboxed frames for HTML and PDF previews. Images, audio and video SHALL use their native media elements.

#### Scenario: Markdown with embedded script
- **WHEN** a Markdown preview contains a heading and a script element
- **THEN** the heading is rendered and the script element is omitted.

#### Scenario: HTML source preview
- **WHEN** the viewer previews inline HTML content
- **THEN** it displays the content in a sandboxed frame with a path-based base URL and a restrictive content security policy.

<!-- id: canvas-file.preview.render -->
<!-- entities: preview, document, media element -->
<!-- enforced: frontend/src/components/mauzcode/CanvasFile.tsx CanvasFile -->
<!-- test: frontend/src/components/mauzcode/CanvasFile.test.tsx :: renders Markdown locally without allowing raw executable HTML; gives HTML a path-based base and restrictive CSP without enabling scripts -->

<!-- uncertainty: The listing tests mock private-path classification; they do not exercise SSH canonicalization on a live server. Remote listing order and incremental remote byte transfer are not guaranteed here. -->
<!-- deferred: src/files/privateResults.test.ts; src/files/absoluteRoute.test.ts -->
