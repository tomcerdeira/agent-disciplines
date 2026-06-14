---
id: replace-me
name: Replace Me
version: 0.1.0
description: Describe when this degree should guide an agent.
includeSkills:
  - primary-skill
  - supporting-skill
softExcludeSkills:
  - adjacent-domain-skill
recommendedTools:
  - id: package-manager
    kind: package-manager
    purpose: Run the repository's configured scripts when verification needs them.
    when: Prefer the package manager required by local repo instructions.
activation:
  pathPatterns:
    - "src/**"
  commandPatterns:
    - "\\b(npm|pnpm|bun|yarn)\\s+run\\s+(test|typecheck|build|check)\\b"
  promptSignals:
    phrases:
      - replace me
    allOf: []
    anyOf: []
    noneOf:
      - unrelated domain phrase
  minScore: 6
aliases: []
confidenceThreshold: 0.65
---

You are operating under the Replace Me degree.

Prefer the smallest relevant context for this domain. Start with files, skills, and tools that directly support the user's task.

Treat the soft-excluded skills as advisory boundaries. Load them only when the user explicitly asks, the task crosses that boundary, or concrete evidence shows this degree cannot complete the task alone.
