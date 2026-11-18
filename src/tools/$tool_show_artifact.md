---
fn: tools.showArtifact
requires: [canvas.show, files.embedUrl]
description: >-
  Show a workspace file or directory to the person on your canvas beside the chat, as the active tab.
  Use when the person asks to see a file or when a produced report is the answer. Relative paths resolve
  in your workspace; for another project pass an absolute path. Showing the same file again switches to
  its tab. Returns { itemId, title, path, host }.
promptSnippet: "show a workspace file or directory on your canvas beside the chat"
presentation:
  label: Show
  icon: canvas
  category: agent
  summary: "{title} || {path}"
parameters:
  type: object
  properties:
    path:
      type: string
      description: "File or directory path, relative to your workspace or absolute."
    title:
      type: string
      description: "Tab title; defaults to the file name."
    host:
      type: string
      description: "SSH host alias the path lives on; omit for your workspace."
    mode:
      type: string
      enum: [auto, preview, source]
      description: "Initial view; auto lets the Files UI choose."
  required: [path]
  additionalProperties: false
---
