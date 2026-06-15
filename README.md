# Agent Disciplines

Agent Disciplines is a small package manager and resolver for portable agent context profiles. A discipline is an advisory curation layer over agent skills and tools: it helps an agent choose relevant context first, without hiding skills, enforcing policy, or installing MCPs/CLIs automatically.

```sh
npx disciplines add tomcerdeira/disciplines --all --agent '*' --global
npx disciplines use installed --task "Fix keyboard navigation" --file src/components/SearchResults.tsx
npx disciplines doctor
```

## Why

Agent runtimes can accumulate many skills: frontend, backend, data, testing, observability, deployment, browser automation, documents, and more. That creates a context-selection problem. A simple UI task should not start by loading database, infrastructure, and document-editing guidance.

Disciplines sit above skills. They describe when a work mode should activate, which skill ids and tools are worth considering first, and which adjacent skill families should stay out of the initial context unless the task gives concrete evidence for them.

## Package Format

A discipline package is a folder with a `DISCIPLINE.md` entrypoint:

```text
disciplines/
  frontend-engineer/
    DISCIPLINE.md
```

`DISCIPLINE.md` uses YAML frontmatter plus a short focus prompt:

```yaml
---
id: frontend-engineer
name: Frontend Engineer
version: 0.1.0
description: Focuses agents on UI implementation, accessibility, interaction design, and browser verification.
includeSkills:
  - react-best-practices
  - frontend-design
softExcludeSkills:
  - backend-patterns
  - database-migrations
recommendedTools:
  - id: browser
    kind: mcp
    purpose: Verify user-visible behavior in a real browser.
activation:
  pathPatterns:
    - "**/*.tsx"
  commandPatterns:
    - "\\b(npm|pnpm|bun|yarn)\\s+run\\s+(dev|build|test|typecheck)\\b"
  promptSignals:
    phrases:
      - keyboard navigation
    allOf: []
    anyOf:
      - React
      - accessibility
    noneOf:
      - database migration
  minScore: 6.5
---

You are operating under the Frontend Engineer discipline.
Prefer UI, interaction, accessibility, and browser-verification context.
Treat backend, database, and infrastructure skills as soft exclusions unless concrete evidence requires them.
```

Schema: [schema/discipline.schema.json](schema/discipline.schema.json)

Authoring guide: [docs/authoring-disciplines.md](docs/authoring-disciplines.md)

## CLI

Install disciplines from a source:

```sh
npx disciplines add tomcerdeira/disciplines --discipline frontend-engineer
npx disciplines add tomcerdeira/disciplines --all --agent '*' --global --yes
```

Use a discipline without installing:

```sh
npx disciplines use tomcerdeira/disciplines@frontend-engineer
```

Resolve a task against installed disciplines:

```sh
npx disciplines use installed \
  --task "Fix keyboard navigation in SearchResults.tsx" \
  --file src/components/SearchResults.tsx
```

Inspect and manage installs:

```sh
npx disciplines list
npx disciplines find frontend
npx disciplines update
npx disciplines remove frontend-engineer
npx disciplines doctor
npx disciplines cleanup
```

Create a new discipline:

```sh
npx disciplines init software-engineer
```

Supported source formats include GitHub shorthand, full GitHub URLs, GitHub tree URLs, generic git URLs, and local paths:

```sh
npx disciplines add tomcerdeira/disciplines
npx disciplines add https://github.com/tomcerdeira/disciplines
npx disciplines add https://github.com/tomcerdeira/disciplines/tree/main/disciplines/frontend-engineer
npx disciplines add ./local-disciplines
```

Full CLI reference: [docs/cli.md](docs/cli.md)

## Installed Stores

Project installs live in:

```text
.agents/disciplines/
```

Global installs live in:

```text
~/.agent-disciplines/disciplines/
```

`add` uses symlinks by default and `--copy` when you want a copied package. Agent glue can be installed for Claude Code, Codex, and Cursor with `--agent claude-code|codex|cursor|*`.

`cleanup` removes stale `agent-degrees` files from older installs. Use `--disciplines` only when you also want to remove current installed discipline stores and agent glue.

## Included Examples

- [Frontend Engineer](disciplines/frontend-engineer/DISCIPLINE.md)
- [Backend Engineer](disciplines/backend-engineer/DISCIPLINE.md)
- [Data Analyst](disciplines/data-analyst/DISCIPLINE.md)
- [Automation Engineer](disciplines/automation-engineer/DISCIPLINE.md)
- [Product Researcher](disciplines/product-researcher/DISCIPLINE.md)

These are examples, not a universal ontology. Real teams should rename skill ids and activation signals to match their local agent setup.

## Development

```sh
npm install
npm run validate
npm run check:fixtures
npm run check:cli
```

Useful local smoke tests:

```sh
node scripts/disciplines.mjs list .
node scripts/disciplines.mjs use . --task "Fix keyboard navigation" --file src/components/SearchResults.tsx
npm publish --dry-run --access public
```

## Scope

Disciplines are advisory. They do not:

- hide or disable skills
- enforce refusals
- install MCP servers, CLIs, services, or plugins automatically
- override system, developer, user, or repository instructions

They only help agents start with a smaller, more relevant context bundle and expand deliberately when the task requires it.
