# Manual Bundle: Backend Rate Limit

## Task

Add a rate limit to the invite creation endpoint and cover it with unit tests.

## Degree Decision

- Decision: `select`
- Primary degree: `backend-engineer`
- Secondary degree: none

## Degree Prompt

You are operating under the Backend Engineer degree.

Prefer server-side correctness, data integrity, domain boundaries, operational evidence, and focused tests. Read the code path before proposing broad architecture changes, and keep response-shape, authorization, and persistence contracts explicit. Prefer source-control, test, database, and observability tools when the task needs evidence beyond static code.

Treat frontend, visual design, presentation, and spreadsheet skills as soft exclusions. Load them only when the task includes a user-facing UI change, an explicit artifact request, or evidence that the backend change must be verified through those surfaces.

## Included Skills

- `api-design`
- `backend-patterns`
- `database-querying`
- `unit-testing`
- `observability-debugging`

## Recommended Tools

- `git` (`cli`): inspect diffs, history, branches, and review scope.
- `gh` (`cli`): inspect pull requests, CI status, issues, and GitHub metadata when available.
- `database-client` (`service`): inspect schemas, indexes, query plans, and read-only data samples when persistence is involved.
- `observability` (`service`): inspect logs, traces, metrics, and production error evidence for production behavior.

## Soft Exclusions

- `frontend-design`
- `browser-verification`
- `presentation-design`
- `spreadsheet-formatting`

## Expansion Rule

Load frontend or browser context only if the user asks for UI changes or the endpoint behavior must be verified through a user-facing workflow.

## What to Observe

- Does the agent inspect the endpoint path and existing rate-limit patterns first?
- Does it preserve response shape, auth, and permission semantics?
- Does it propose focused unit tests before broad integration work?
- Does it avoid UI/browser context unless needed?
