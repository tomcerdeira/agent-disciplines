# Authoring Degrees

Use this guide when adding or editing degree packages.

Degrees should be small, advisory, and easy to review. A good degree helps an agent start with relevant context. It does not claim ownership of every possible task in a domain.

## Package Layout

A degree is a folder with a `DEGREE.md` entrypoint:

```text
degrees/
  frontend-engineer/
    DEGREE.md
```

The folder name is the canonical package id and must match the frontmatter `id`.

Start from the template when creating a new degree:

```sh
mkdir -p degrees/software-engineer
cp templates/degree/DEGREE.md degrees/software-engineer/DEGREE.md
```

Then change both the folder name and frontmatter `id` to the same kebab-case value.

Future package resources can live beside `DEGREE.md`:

```text
degrees/
  frontend-engineer/
    DEGREE.md
    references/
    examples/
    adapters/
```

Keep `DEGREE.md` as the required entrypoint. Do not use `SKILL.md`; a degree curates skills but is not itself a skill.

## Loading Model

Author degrees for progressive disclosure, mirroring how skills work:

1. The resolver sees lightweight metadata for every degree: folder id, `name`, `description`, and `activation`.
2. The resolver selects, composes, asks, or returns none.
3. The agent loads only the selected degree's full `DEGREE.md`.
4. The selected degree then exposes preferred skill ids, recommended tools, and soft exclusions.
5. The agent maps those ids to local runtime skills/tools and loads full skill or tool instructions only when the task needs them.

This means a degree description and activation metadata must be strong enough to decide whether the degree should load. The body should assume the degree already matched; it should not repeat every possible trigger phrase.

## Start With the Boundary

Before writing fields, answer two questions:

- What kind of task should clearly activate this degree?
- What adjacent domains should stay out of the initial context unless the task supplies evidence?

If the answer is "almost everything", the degree is too broad.

## Choose `id` and `name`

Use a stable kebab-case folder and matching `id`:

```yaml
id: frontend-engineer
name: Frontend Engineer
```

Good ids:

- `frontend-engineer`
- `data-analyst`
- `automation-engineer`

Weak ids:

- `general-engineer`
- `everything-agent`
- `frontend-vibes`

The folder and id are for adapters and references. The name is for humans.

## Write a Specific `description`

The description should say when the degree is useful:

```yaml
description: Focuses agents on UI implementation, accessibility, interaction design, and browser verification.
```

Avoid descriptions that only restate the name:

```yaml
description: Does frontend work.
```

## Pick `includeSkills`

Include skills that should usually be in the first context bundle for this degree.

Good included skills are:

- directly relevant to the domain
- repeatedly useful across tasks
- specific enough to steer behavior
- named with ids that adapters can map to local skills

Avoid including skills just because they might become useful later. Those belong in another degree or can be loaded after evidence appears.

## Write `softExcludeSkills`

Soft exclusions are not bans. They are reminders to keep unrelated context out of the initial bundle.

Good soft exclusions name adjacent domains:

```yaml
softExcludeSkills:
  - backend-patterns
  - database-migrations
  - infrastructure-deployments
```

Do not write soft exclusions as security policy or hard refusal language. The degree body should explain when they can be overridden:

```md
Load backend skills only when the user explicitly asks, the task crosses an API boundary, or code evidence shows the UI behavior depends on the server.
```

## Recommend Tools Carefully

Use `recommendedTools` for MCP servers, CLIs, package managers, runtimes, services, browsers, and external systems that are commonly useful for the degree.

```yaml
recommendedTools:
  - id: browser
    kind: mcp
    purpose: Inspect and verify user-visible behavior in a real browser.
    when: Use after UI changes, layout fixes, accessibility work, or visual regression checks.
  - id: package-manager
    kind: package-manager
    purpose: Run the repository's configured frontend scripts such as typecheck, lint, test, and build.
    when: Prefer the package manager required by local repo instructions.
```

Tool recommendations should not assume availability. Do not tell adapters to install, configure, or execute tools automatically.

Use these `kind` values:

- `mcp`
- `cli`
- `browser`
- `package-manager`
- `runtime`
- `service`
- `other`

Good tool recommendations explain why the tool helps. Weak recommendations only name a tool:

```yaml
# Weak
recommendedTools:
  - id: gh
    kind: cli
    purpose: GitHub.
```

```yaml
# Better
recommendedTools:
  - id: gh
    kind: cli
    purpose: Inspect pull requests, CI status, issues, and GitHub metadata when available.
```

## Write Useful `activation`

Activation signals should describe concrete evidence that this degree fits a task. Use structured fields so resolvers can match paths, commands, and prompt language without guessing from prose.

Good activation:

```yaml
activation:
  pathPatterns:
    - "**/*.tsx"
    - "**/*.jsx"
    - "src/components/**"
  commandPatterns:
    - "\\bplaywright\\b"
  promptSignals:
    phrases:
      - React components
      - TSX files
      - accessibility
      - keyboard navigation
    allOf:
      - [browser, verify]
    anyOf:
      - ARIA
      - focus management
    noneOf:
      - database migration
  minScore: 6.5
```

Weak activation:

```yaml
activation:
  pathPatterns: []
  commandPatterns: []
  promptSignals:
    phrases:
      - code
      - bug
      - improve things
      - make it better
    allOf: []
    anyOf: []
    noneOf: []
  minScore: 1
```

Prefer activation signals that mention:

- file types
- frameworks
- artifacts
- user-visible task language
- tools or evidence sources
- domain-specific nouns

Use `pathPatterns` for repo evidence, `commandPatterns` for shell/tool evidence, `promptSignals` for user language, and `minScore` for resolver selection guidance.

## Set `confidenceThreshold`

Use `confidenceThreshold` to say how much evidence should be required before selecting the degree without asking the user.

Common values:

- `0.65` for narrower engineering degrees with clear file or framework signals.
- `0.60` for broader work types such as analysis, research, or automation.

Do not treat the threshold as a mathematical guarantee. It is a resolver hint.

## Write the Focus Prompt

The markdown body is the degree's focus prompt. Keep it short and operational.

It should tell the agent:

- what to prefer
- what to inspect first
- what to verify
- when to expand beyond the degree
- how to treat soft exclusions

Good body:

```md
You are operating under the Frontend Engineer degree.

Prefer UI, interaction, accessibility, visual polish, and browser-verification context. Start with the smallest set of relevant component, styling, and design-system files. Prefer browser and frontend package-manager tools when verifying visible behavior.

Treat backend, database, infrastructure, and data-pipeline skills as soft exclusions. Load them only when the user explicitly asks, the route crosses an API boundary that must be changed, or concrete code evidence shows the frontend behavior depends on them.
```

Weak body:

```md
You are a great frontend engineer. Do frontend things.
```

## Degree Size

A degree should usually have:

- 3 to 7 included skills
- 2 to 6 soft exclusions
- 2 to 5 recommended tools
- 4 to 12 concrete activation signals across paths, commands, and prompt phrases
- 2 to 4 short focus-prompt paragraphs

These are review guidelines, not schema limits.

## Before Opening a PR

Run:

```sh
npm run validate
```

Then check:

- The degree has a clear boundary.
- The package folder and id match.
- The id is stable and kebab-case.
- Included skills are relevant to the initial context.
- Soft exclusions are advisory and overrideable.
- Recommended tools explain purpose and do not assume availability.
- Activation signals are concrete and structured.
- The focus prompt is short enough to fit into an agent context bundle.
- The degree does not duplicate another degree's purpose.
