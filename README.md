# Agent Degrees

Agent degrees are portable capability profiles for coding agents. A degree does not install, hide, or enforce skills. It curates which skills and focus instructions are likely to matter for a task, and it names the adjacent skills that should stay out of context unless the task gives concrete evidence for them.

The goal of this repository is to define a small, reviewable spec for `.degree.md` files before building any runtime. A degree should help an agent start with the right context, avoid unrelated skill bloat, and still remain free to expand when the user asks or the code demands it.

## Problem

Modern agent environments can accumulate many skills: React, databases, testing, observability, documents, deployment, browser automation, and more. More skills are useful over time, but they create a context-selection problem:

- The agent may load broad or unrelated instructions before understanding the task.
- Domain-specific instructions can compete with each other.
- A simple task can become noisy because every adjacent capability looks available.
- Different agent runtimes use different skill formats, making curation hard to reuse.

Degrees provide a portable curation layer above skills. They describe which skills to consider first, when a degree should activate, and which adjacent skills should be treated as soft exclusions.

## Vocabulary

- **Degree**: A named capability profile for an agent, stored as a `.degree.md` file.
- **Skill**: A runtime-specific instruction bundle, tool guide, or reusable workflow that a degree can reference by id.
- **Included skill**: A skill that belongs in the initial context bundle for the degree.
- **Recommended tool**: An advisory tool reference, such as an MCP server, CLI, browser, package manager, runtime, or external service.
- **Soft exclusion**: A skill or skill family that should not be loaded by default, but may be loaded when explicitly requested or supported by concrete task evidence.
- **Activation hint**: A phrase, file pattern, tool name, or domain signal that helps map a user task to a degree.
- **Focus prompt**: The markdown body of the degree file. It tells the agent how to behave while operating under that degree.
- **Resolver**: A future adapter or manual process that compares a task against available degrees and emits an advisory context bundle.

## File Format

Degrees use markdown with YAML frontmatter:

```yaml
---
id: frontend-engineer
name: Frontend Engineer
version: 0.1.0
description: Focuses agents on UI implementation, accessibility, and browser verification.
includeSkills:
  - react-best-practices
  - frontend-design
  - browser-verification
softExcludeSkills:
  - backend-patterns
  - database-migrations
recommendedTools:
  - id: browser
    kind: mcp
    purpose: Verify UI behavior in a real browser.
    when: Use after visible UI changes or when debugging browser-only behavior.
  - id: npm
    kind: package-manager
    purpose: Run frontend scripts and package checks.
activationHints:
  - TSX files
  - layout and styling
  - accessibility
---

You are operating under the Frontend Engineer degree.
Prefer UI, interaction, accessibility, and browser-verification context.
Only load backend, database, or infrastructure skills when the user explicitly asks or the task directly touches those files.
```

The portable schema lives at [schema/degree.schema.json](schema/degree.schema.json). The markdown body is intentionally free-form so each runtime can preserve its natural prompt style.

## Intended Workflow

1. A user gives the agent a task.
2. The agent, user, or future resolver compares the task with degree `activationHints`.
3. The best matching degree is selected. If confidence is low, the agent asks the user to choose.
4. The agent loads the degree focus prompt and the degree's `includeSkills`.
5. The agent considers `recommendedTools` when a task needs MCPs, CLIs, browsers, package managers, runtimes, or services.
6. The agent treats `softExcludeSkills` as advisory boundaries, not hard blocks.
7. If direct evidence appears, the agent may load an excluded or adjacent skill and should state why.

## Example Degrees

This repo includes advisory degree examples:

- [Frontend Engineer](degrees/frontend-engineer.degree.md)
- [Backend Engineer](degrees/backend-engineer.degree.md)
- [Data Analyst](degrees/data-analyst.degree.md)
- [Automation Engineer](degrees/automation-engineer.degree.md)
- [Product Researcher](degrees/product-researcher.degree.md)

These are examples, not a universal ontology. Real teams should rename skills to match their installed skill ids and local conventions.

## V1 Scope

This first version is deliberately spec-first:

- No CLI.
- No runtime integration.
- No hidden files.
- No mutation of installed skills.
- No automatic installation of MCP servers, CLIs, or services.
- No hard enforcement of exclusions.
- No claim that one degree must cover every task.

Future adapters can translate the same `.degree.md` files into Cursor, Claude Code, Codex, or generic prompt-only workflows. See [docs/adapter-notes.md](docs/adapter-notes.md).

Resolver behavior is specified in [docs/resolver-spec.md](docs/resolver-spec.md). V1 treats resolution as advisory semantics, not a committed runtime implementation.

## Manual Validation

Use [examples/task-resolution.md](examples/task-resolution.md), [examples/composed-degrees.md](examples/composed-degrees.md), and [examples/validation-matrix.md](examples/validation-matrix.md) to test whether a degree makes the initial context smaller and more relevant. The expected v1 outcome is better steering, not perfect classification.

## Repository Validation

Run the local validator before changing degree files:

```sh
npm run validate
```

The validator checks the portable schema JSON, degree frontmatter, required fields, duplicate ids, skill ids, recommended tool entries, and non-empty markdown bodies. It is repository hygiene only; it does not resolve tasks or execute recommended tools.
