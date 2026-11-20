## MODIFIED Requirements

### Requirement: Issue a readId for delivered text

`read` SHALL support text, ranges, hashline, images and remote hosts. For valid text it SHALL issue a short opaque `readId` bound to the raw-byte hash, host, resolved path, line range and completeness. Images, binary files and invalid UTF-8 SHALL NOT receive a receipt. A supported image SHALL be attached unchanged only if its encoded size is at most 4.5 MiB and both dimensions are known, positive and at most 3000 pixels. Rejection SHALL leave the file unchanged and return no image attachment.

#### Scenario: Plain text read
- **WHEN** an agent reads a text file, with or without hashline
- **THEN** the result contains the usual content and a readId with its line range and completeness

#### Scenario: Image read
- **WHEN** an agent reads a valid PNG within the inline size and dimension limits
- **THEN** the original image is returned and no readId is issued

#### Scenario: Larger screenshots within the inclusive limit
- **WHEN** an agent reads a valid 2560 × 1440 or 3000 × 3000 PNG within the encoded byte budget
- **THEN** the original image is attached without a readId

#### Scenario: Either edge just exceeds the limit
- **WHEN** an agent reads a 3001 × 1 or 1 × 3001 PNG within the encoded byte budget
- **THEN** the tool returns a text error reporting the dimensions and 3000-pixel limit without attaching or changing the image

#### Scenario: Full-page screenshot exceeds one edge
- **WHEN** an agent reads a 765 × 9340 PNG that fits the encoded byte budget
- **THEN** the tool returns a text error reporting its dimensions and suggesting a viewport capture or a cropped or resized copy; no image is attached

#### Scenario: Range read
- **WHEN** an agent reads lines 40–80 of a 200-line file
- **THEN** the readId covers lines 40–80 and is marked as not complete
