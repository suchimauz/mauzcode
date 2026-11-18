---
fn: tools.toolDescribe
requires: [runtime.docs.get, plugins.read]
description: >-
  Describe one allowed runtime function (documentation, input schema, return type) or one mounted
  plugin (workflow overview and its allowed functions). Exact function names win over plugin names.
  Never returns source code.
promptSnippet: "show the schema and docs of one allowed function or plugin"
presentation:
  label: Describe tool
  icon: book
  category: tools
  summary: "{name}"
parameters:
  type: object
  properties:
    name:
      type: string
      description: "Exact dotted function name (input.request) or exact mounted plugin name (openspec)."
  required: [name]
  additionalProperties: false
---
