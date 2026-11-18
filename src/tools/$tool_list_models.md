---
fn: tools.listModels
requires: [models.selectable]
description: >-
  List exact model routes selectable for a child agent, with their supported reasoning levels.
  Cached catalogues only: no provider request, no secrets. Returns {models:[{route,label,reasoning}],total}.
promptSnippet: "list model routes and reasoning levels"
presentation:
  label: Models
  icon: list
  category: agent
  summary: "{provider}"
parameters:
  type: object
  properties:
    provider:
      type: string
      description: "Only routes of this provider id."
    limit:
      type: integer
      description: "Maximum rows."
      minimum: 1
      maximum: 1000
  additionalProperties: false
---
