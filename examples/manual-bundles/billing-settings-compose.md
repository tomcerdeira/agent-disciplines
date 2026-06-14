# Manual Bundle: Billing Settings Compose

## Task

Add a billing settings page that lets an admin update invoice recipients.

## Degree Decision

- Decision: `compose`
- Primary degree: `frontend-engineer`
- Secondary degree: `backend-engineer`

## Degree Prompt

Use the Frontend Engineer degree as primary. Add only the backend context needed for API and permission boundaries.

Prefer UI, interaction, accessibility, visual polish, and browser-verification context. Start with the smallest set of relevant component, styling, and design-system files. Prefer browser and frontend package-manager tools when verifying visible behavior.

For the backend boundary, prefer server-side correctness, response-shape stability, authorization checks, persistence contracts, and focused tests.

## Included Skills

- `react-best-practices`
- `frontend-design`
- `accessibility-review`
- `browser-verification`
- `api-design`
- `backend-patterns`
- `unit-testing`

## Recommended Tools

- `browser` (`mcp`): inspect and verify the settings page workflow.
- `npm` (`package-manager`): run frontend scripts such as typecheck, lint, test, and build.
- `git` (`cli`): keep the full-stack change scoped and reviewable.
- `database-client` (`service`): inspect persistence only if invoice recipients require schema or data-shape confirmation.

## Soft Exclusions

- `infrastructure-deployments`
- `data-pipelines`
- `presentation-design`
- `spreadsheet-formatting`

## Expansion Rule

Do not merge every skill from both degrees. Keep frontend as the primary workflow. Load backend details only for API shape, permissions, persistence, and server-side tests.

## What to Observe

- Does the agent plan the visible settings workflow first?
- Does it identify API and permission boundaries without turning the task into a backend-only project?
- Does it keep unrelated infra/data/presentation context out?
- Does it propose both browser verification and focused backend tests?
