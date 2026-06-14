# Manual Bundle: Frontend Keyboard Navigation

## Task

Fix keyboard navigation in `SearchResults.tsx` and verify it in browser.

## Degree Decision

- Decision: `select`
- Primary degree: `frontend-engineer`
- Secondary degree: none

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
- `npm` (`package-manager`): run frontend scripts such as typecheck, lint, test, and build.
- `playwright` (`cli`): run browser-level tests and targeted UI flows when available.

## Soft Exclusions

- `backend-patterns`
- `database-migrations`
- `infrastructure-deployments`
- `data-pipelines`

## Expansion Rule

Load backend or database context only if keyboard behavior depends on an API response, route boundary, persisted state, or explicit user request.

## What to Observe

- Does the agent inspect the component and nearby UI state first?
- Does it reason about focus order, ARIA, and keyboard interaction?
- Does it recommend browser verification or a targeted UI test?
- Does it avoid backend/database context unless evidence appears?
