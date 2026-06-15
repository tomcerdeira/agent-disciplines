# Disciplines CLI

The `disciplines` CLI is a small package manager for discipline packages. It intentionally mirrors the `skills` workflow while keeping disciplines advisory: it installs `DISCIPLINE.md` packages, writes lightweight agent glue when asked, resolves tasks, and prints prompt bundles. It does not hide skills, enforce exclusions, install MCP servers, or install CLIs.

## Commands

```sh
disciplines add <source> [--discipline <ids...>|--all] [--agent <agents...>] [--global|--project] [--copy] [--yes] [--list]
disciplines use <source[@discipline]|installed> [--discipline <ids...>] [--task "..."] [--file path] [--command cmd] [--format prompt|json]
disciplines list|ls [source] [--global|--project]
disciplines find [query] [--global|--project]
disciplines check [ids...] [--discipline <ids...>] [--global|--project]
disciplines remove|rm [ids...] [--discipline <ids...>] [--all] [--global|--project] [--yes]
disciplines update [ids...] [--discipline <ids...>] [--global|--project] [--yes]
disciplines init [name]
disciplines doctor [--global|--project]
disciplines cleanup [--global|--project] [--disciplines] [--all] [--yes]
```

## Source Formats

```sh
disciplines add tomcerdeira/disciplines
disciplines add https://github.com/tomcerdeira/disciplines
disciplines add https://github.com/tomcerdeira/disciplines/tree/main/disciplines/frontend-engineer
disciplines add https://gitlab.com/org/repo
disciplines add https://gitlab.com/org/repo/-/tree/main/disciplines/frontend-engineer
disciplines add git@github.com:tomcerdeira/disciplines.git
disciplines add ./local-disciplines
```

Use `@id` when selecting one discipline from a source:

```sh
disciplines use tomcerdeira/disciplines@frontend-engineer
```

## Install

Install one discipline:

```sh
disciplines add tomcerdeira/disciplines --discipline frontend-engineer
```

Install every discipline and every supported adapter globally:

```sh
disciplines add tomcerdeira/disciplines --all --agent '*' --global --yes
```

Supported agents:

- `claude-code`: writes Claude Code skills and `/discipline` command files.
- `codex`: writes Codex-compatible skill files and project instructions.
- `cursor`: writes Cursor rule files.
- `*`: installs every supported adapter.

If `--agent` is omitted, `add` installs only discipline packages and does not write Claude Code, Codex, or Cursor glue.

Scopes:

- `--project`: installs under `.agents/disciplines/` in the current project.
- `--global`: installs under `~/.agent-disciplines/disciplines/`.
- no scope flag: defaults to `--project` for `add`, and auto-detects project before global for `list`, `find`, `remove`, and `update`.

Installation method:

- default: symlink each installed discipline to the resolved source package.
- `--copy`: copy package files into the target store.

Overwrite behavior:

- Existing target files are not overwritten unless you confirm interactively.
- In non-interactive shells, existing files are skipped unless `--yes` is passed.
- `--yes` overwrites generated adapter files and installed discipline packages.

## Use

Use without installing:

```sh
disciplines use tomcerdeira/disciplines@frontend-engineer
```

Resolve a task against installed disciplines:

```sh
disciplines use installed \
  --task "Fix keyboard navigation in the candidates desktop view" \
  --file src/modules/candidates/ui/candidates-page.tsx \
  --command "bun run typecheck"
```

The output is a task-local bundle with selected disciplines, score evidence, included skill ids, recommended tools, soft exclusions, and focus prompts. Use `--format json` when an adapter or script needs structured output.

Adapters can also import the resolver directly:

```ts
import { createResolverBundle, loadDisciplines } from "disciplines/resolver";
```

## List and Find

```sh
disciplines list
disciplines ls --global
disciplines list tomcerdeira/disciplines --discipline frontend-engineer
disciplines find react
```

`list` without a source shows installed disciplines. `list <source>` inspects a source without installing. `find` searches installed disciplines by id, name, description, aliases, included skills, and recommended tools.

## Check, Remove, and Update

```sh
disciplines check
disciplines check frontend-engineer --global
disciplines remove frontend-engineer
disciplines rm --all --global --yes
disciplines update
disciplines update frontend-engineer --project
```

`check` fetches git metadata for installed sources and compares each manifest-recorded revision with the latest known source revision. It reports `UPDATE` rows when newer source revisions are available, but it does not relink, recopy, or otherwise mutate installed packages.

`update` refreshes cached git sources and relinks or recopies installed packages based on their manifest entries.

Each project or global store includes a local `.disciplines-manifest.json`. The manifest records source roots, source paths, install mode, and git revisions. `doctor` validates this manifest and warns about entries that no longer have an installed package.

## Init

```sh
disciplines init software-engineer
```

This creates `software-engineer/DISCIPLINE.md` from the template.

Names are normalized into schema-valid ids, so `disciplines init "Software Engineer"` also creates `software-engineer/DISCIPLINE.md`.

## Doctor

```sh
disciplines doctor
disciplines doctor --project
disciplines doctor --global
```

`doctor` checks project and global discipline stores, manifests, symlinks, resolver health, installed agent glue, and old `agent-degrees` files that may need cleanup. Missing installs are warnings. Broken installed packages are failures.

## Cleanup

```sh
disciplines cleanup
disciplines cleanup --global --yes
disciplines cleanup --project --yes
disciplines cleanup --global --disciplines --yes
```

`cleanup` removes stale `agent-degrees` artifacts from older installs, such as `/degree`, `agent-degrees` skills, and old Cursor rules. By default it does not remove current `agent-disciplines` installs. Add `--disciplines` or `--all` when you also want to remove current discipline stores, manifests, source cache entries, and installed agent glue.
