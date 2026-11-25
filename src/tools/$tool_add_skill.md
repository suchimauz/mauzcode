---
fn: tools.addSkill
requires: [skills.add.prepare, skills.add.review]
availableWhen: skills.offersAuthoring
description: >-
  Add an Agent Skill when the person asks for one (built-in Creator only). First ask with
  request_input for anything missing: source (draft a new skill, a ready folder on the server or an
  SSH host, or a public https Git repository), destination (workspace = this project's
  .mauzcode/skills, serverProject = server library for this project, serverGlobal = all projects)
  and whether to adapt the content. Then call action "prepare"; for a Git repository with several
  packages it returns status "choose" — ask the person which package and call prepare again with
  package. Imports keep the original bytes; pass adaptations only when the person agreed to them.
  Finally call action "review" with the draftId and end your turn: only the person's approval in
  the review card saves and verifies the skill.
promptSnippet: "draft or import an Agent Skill for human review and publication"
presentation:
  label: Add skill
  icon: book
  category: agent
  summary: "{action}[ {name}][ {url}][ {path}][ {draftId}]"
parameters:
  type: object
  properties:
    action:
      type: string
      enum: [prepare, review]
      description: "prepare stages a package; review opens the human approval card for a staged draftId."
    draftId:
      type: string
      description: "Draft id from prepare; required by review."
    source:
      type: string
      enum: [draft, folder, git]
    destination:
      type: string
      enum: [workspace, serverProject, serverGlobal]
    name:
      type: string
      description: "Draft: package name, lowercase letters, digits and single hyphens."
    description:
      type: string
      description: "Draft: one line saying what the skill does and when to use it."
    instructions:
      type: string
      description: "Draft: Markdown instructions."
    extraFiles:
      type: array
      items: { type: object, properties: { path: { type: string }, text: { type: string } }, required: [path, text], additionalProperties: false }
    host:
      type: string
      description: "Folder: SSH alias of its host; omit for the MauzCode server."
    path:
      type: string
      description: "Folder: absolute path of the ready package."
    url:
      type: string
      description: "Git: public https repository URL."
    revision:
      type: string
      description: "Git: branch, tag or commit; omit for the default branch."
    package:
      type: string
      description: "Git: package directory chosen from the choose result."
    adaptations:
      type: array
      description: "Agreed replacements of existing text files; shown to the person as a diff."
      items: { type: object, properties: { path: { type: string }, text: { type: string } }, required: [path, text], additionalProperties: false }
  required: [action]
  additionalProperties: false
---
