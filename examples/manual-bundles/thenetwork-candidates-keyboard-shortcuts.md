# Manual Bundle: TheNetwork Candidates Keyboard Shortcuts

## Task

In `thenetwork-frontend`, update the desktop `/candidates` view so:

- `Shift+Tab` moves between candidate status tabs: `new`, `interesting`, and `skipped`.
- `Shift+ArrowUp` and `Shift+ArrowDown` move between roles.

## Degree Decision

- Decision: `select`
- Primary degree: `frontend-engineer`
- Secondary degree: none
- Confidence: high

## Activation Matches

- Prompt signals: `keyboard navigation`, `focus management`, `browser verification`
- Repo signals:
  - `src/modules/candidates/views/candidates-view.tsx`
  - `src/modules/candidates/client/hooks/use-candidates-page.ts`
  - `src/modules/candidates/ui/role-vertical-tabs.tsx`
  - `src/modules/candidates/ui/candidate-bucket-tabs.tsx`
- Command signals:
  - `bun run typecheck`
  - `bun test ...`
  - `bun run lint`

## Degree Prompt

You are operating under the Frontend Engineer degree.

Prefer UI, interaction, accessibility, visual polish, and browser-verification context. Start with the smallest set of relevant component, styling, and design-system files. Prefer browser and frontend package-manager tools when verifying visible behavior.

Treat backend, database, infrastructure, and data-pipeline skills as soft exclusions. Load them only when the user explicitly asks, the route crosses an API boundary that must be changed, or concrete code evidence shows the frontend behavior depends on them.

## Included Skills

- `react-best-practices`
- `frontend-design`
- `accessibility-review`
- `browser-verification`
- `e2e-testing`

## Recommended Tools

- `browser` (`mcp`): inspect and verify user-visible behavior in a real browser.
- `package-manager` (`package-manager`): use the repo-required package manager. In `thenetwork-frontend`, local instructions require `bun`.
- `playwright` (`cli`): run browser-level tests and targeted UI flows when available.

## Soft Exclusions

- `backend-patterns`
- `database-migrations`
- `infrastructure-deployments`
- `data-pipelines`

## Expansion Rule

Load backend or database context only if the shortcut behavior depends on an API response shape, persisted candidate status semantics, route authorization, or explicit user request. For this task, route-local UI state and existing candidate-list data are enough.

## Baseline Observation From Real Run

- The implementation selected the correct local files and used a real browser, `bun test`, `bun run typecheck`, and scoped ESLint.
- The implementation did not explicitly resolve or announce the degree bundle first.
- Because the degree was not applied up front, missing or approximate skill mappings were not surfaced before work began.
- The existing frontend degree recommended `npm`, which was too concrete for a repo whose instructions require `bun`. The degree was updated to recommend a portable `package-manager` instead.

## What to Observe

- Does the agent select `frontend-engineer` before implementation?
- Does it map `package-manager` to `bun` after reading repo instructions?
- Does it inspect the candidates view, role tabs, bucket tabs, and keyboard hooks before editing?
- Does it reason about the collision with existing row keyboard navigation?
- Does it avoid backend/database context unless concrete evidence appears?
- Does it attempt browser verification and clearly report authentication blockers?
