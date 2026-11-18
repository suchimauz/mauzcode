---
fn: tools.toolSearch
requires: [runtime.docs.search, plugins.search]
description: >-
  Search runtime functions and plugin workflows you are allowed to use, by intent or exact name.
  Returns compact entries {name, kind: function|workflow, summary, source}. Only finds APIs: call
  a found function through an existing tool (eval), and use tool_describe for its schema.
promptSnippet: "find allowed runtime functions and plugin workflows by intent"
presentation:
  label: Find tools
  icon: compass
  category: tools
  summary: "{query}"
parameters:
  type: object
  properties:
    query:
      type: string
      description: "Capability intent in concise English, or an exact dotted function name."
    limit:
      type: integer
      description: "Maximum entries, 1–30. Default 10."
    namespace:
      type: string
      description: "Restrict to a dotted namespace, for example agent or input."
  required: [query]
  additionalProperties: false
---
