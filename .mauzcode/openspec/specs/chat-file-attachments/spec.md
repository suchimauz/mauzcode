# Chat file attachments

## Purpose
Describe how uploaded files become durable chat references, how forked chats can retrieve them, and how model requests use their contents without embedding bytes in chat history.

<!-- last_verified: 2026-11-22 at d35de7c21ff42cdbfb2db0272d6874d4db17a4e0; inspected source and test files were clean; tests not run -->

## Requirements

### Requirement: Validate the batch before reading files
Upload staging SHALL check the whole batch before reading file bytes, allowing at most 10 files, 40 MiB per file and 80 MiB in total.

#### Scenario: Inclusive limits
- **WHEN** ten files of 8 MiB each or two files of 40 MiB each are submitted
- **THEN** the batch passes size and count validation.

#### Scenario: Mobile upload exceeds a limit
- **WHEN** an ordinary mobile message has eleven nonempty files, one 41 MiB file, or three 30 MiB files
- **THEN** ingress returns HTTP 413 before staging, with `too_many_files`, `file_too_large`, or `attachments_too_large`, respectively.

<!-- id: attachments.saveUploads.batch-limits -->
<!-- entities: upload batch, mobile message -->
<!-- enforced: src/attachments/saveUploads.ts (attachments.saveUploads); src/api/$route_v1_agents_$id_messages_POST.ts:41-43 -->
<!-- test: src/attachments/uploadLimits.test.ts :: shared upload validation: 80 MB inclusive; mobile ingress rejects attachments_too_large before storage -->

### Requirement: Stage content separately from its reference
Staging SHALL give each nonempty uploaded file its own opaque ID and a compact reference, while reusing the stored bytes for identical content of the same kind.

#### Scenario: Duplicate images under different names
- **WHEN** two files have identical bytes recognized as PNG but different names
- **THEN** each gets an `image_ref` with its own ID, filename, MIME type and size; both use the same hash-based blob path rather than either uploaded name.

#### Scenario: Unrecognized image declaration
- **WHEN** a file named `sample.bin` declares `image/png` but has no recognized signature
- **THEN** it gets a `document_ref` with MIME type `application/octet-stream`, not an image reference.

<!-- id: attachments.saveUploads.ref -->
<!-- entities: attachment ID, blob, reference -->
<!-- enforced: src/attachments/saveUploads.ts (attachments.saveUploads) -->

### Requirement: Link uploads to the accepted message
For an accepted turn with files, the system SHALL store the references in upload order after any text and link the attachment records to the owning agent and allocated message index.

#### Scenario: Mobile file-only turn
- **WHEN** a mobile message with no text and two nonempty files is accepted
- **THEN** its user content consists of the two references, and the HTTP 202 response contains the message index and ordered attachment metadata, not the file bytes.

#### Scenario: Image sent with text in browser chat
- **WHEN** a browser user sends text and a PNG together
- **THEN** the stored text precedes the image reference and the owner has an attachment record for that upload.

<!-- id: attachments.commitUploads.message-index -->
<!-- entities: user message, attachment record, owning agent -->
<!-- enforced: src/attachments/commitUploads.ts (attachments.commitUploads); src/agent/acceptMessage.ts:148-153; src/api/$route_v1_agents_$id_messages_POST.ts:55-61 -->
<!-- test: src/attachments/attachments.test.ts :: chat attachments > multipart image persists a compact ref and metadata (browser scenario) -->

### Requirement: Restrict retrieval to visible attachments
The attachment endpoint SHALL serve an existing blob only for its owner or an agent whose full message history references its ID.

#### Scenario: Fork inherits a reference
- **WHEN** a child requests a parent's existing attachment referenced within the history it inherited before its fork offset
- **THEN** it can retrieve the bytes without a new upload or ownership transfer.

#### Scenario: Reference beyond fork boundary
- **WHEN** the only reference is in a parent message after the child's inherited prefix
- **THEN** the child receives HTTP 404, as it does for an unknown ID or a missing blob.

<!-- id: attachments.response.visible -->
<!-- kind: invariant -->
<!-- entities: owner, requesting agent, full message history, blob -->
<!-- enforced: src/attachments/response.ts (attachments.response); src/session/getFullMessages.ts (session.getFullMessages) -->

### Requirement: Serve original bytes and describe their disposition
For visible files, GET SHALL return the original bytes and HEAD SHALL return the same file headers without a body. The disposition SHALL be inline for image MIME types and PDFs and attachment otherwise.

#### Scenario: Inspect a text file without downloading it
- **WHEN** HEAD requests a visible text file
- **THEN** the response has no body and reports its recorded MIME type and byte length, an attachment disposition with filename, `private, max-age=3600` caching and `nosniff`.

<!-- id: attachments.response.method -->
<!-- entities: attachment response, file headers -->
<!-- enforced: src/attachments/response.ts (attachments.response); src/attachments/$route_$agentId_$id_GET.ts:3; src/attachments/$route_$agentId_$id_HEAD.ts:3 -->

### Requirement: Resolve references for the model request
Model request construction SHALL expand attachment references on a copy of the messages, using inline content within the supported limits and descriptive text otherwise.

#### Scenario: Image size is measured after encoding
- **WHEN** an image reference resolves to an existing file
- **THEN** it becomes a base64 image block if the encoded data is at most 4.5 MiB; above that threshold the request contains file details and a tool-inspection notice instead.

#### Scenario: PDF or ordinary document
- **WHEN** an existing document reference is resolved
- **THEN** a PDF with recorded size at most 20 MiB becomes a base64 document block with any extracted text; other documents become text with name, MIME type, byte size, local path and either extracted contents or a tool-inspection notice.

#### Scenario: Missing record or bytes
- **WHEN** a referenced attachment record or its stored file is missing
- **THEN** the request substitutes `[Attachment unavailable: <filename>]` at the reference's position and leaves the stored reference unchanged.

<!-- id: attachments.resolveContent.messages -->
<!-- entities: attachment reference, model request, stored message -->
<!-- enforced: src/attachments/resolveContent.ts (attachments.resolveContent); src/agent/buildLlmRequest.ts:114 -->

<!-- uncertainty: The sampled tests do not directly exercise fork visibility, HEAD responses, or resolver size boundaries. PDF text extraction is best effort and depends on pdftotext; no extraction success is guaranteed. -->
<!-- deferred: src/attachments/gc.ts (retention); frontend/src/test/attachments.test.tsx covers composer and preview behavior rather than server retrieval. -->
