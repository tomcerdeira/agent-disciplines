# Task Resolution Examples

These examples show how a human, the local resolver script, or a future adapter might map a task to a degree. Scores are illustrative.

## Frontend Task

Task:

> Fix the mobile layout in `SearchResults.tsx` and verify keyboard navigation.

Likely degree: `frontend-engineer`

Why:

- Mentions a TSX file.
- Mentions layout.
- Mentions keyboard navigation.

Initial context:

- Frontend degree prompt.
- Frontend, accessibility, and browser-verification skills.
- Browser and frontend package-manager tools when available.

Soft exclusions:

- Backend and database skills stay out unless the component behavior depends on an API contract.

## Backend Task

Task:

> Add a rate limit to the invite creation endpoint and cover it with unit tests.

Likely degree: `backend-engineer`

Why:

- Mentions an endpoint.
- Mentions server-side behavior and tests.

Initial context:

- Backend degree prompt.
- API design, backend patterns, unit testing, and observability skills.
- Source-control, test, database, and observability tools when the task needs evidence beyond static code.

Soft exclusions:

- Frontend design and browser skills stay out unless the user asks to change the invite UI.

## Data Task

Task:

> Analyze this CSV export and chart weekly activation by account segment.

Likely degree: `data-analyst`

Why:

- Mentions a CSV.
- Mentions charting and aggregate analysis.

Initial context:

- Data degree prompt.
- Spreadsheet analysis, visualization, SQL analysis, and report-writing skills.
- Python, spreadsheet, or SQL tools when they make the analysis reproducible.

Soft exclusions:

- Runtime implementation skills stay out unless the user asks to automate or productize the analysis.

## Automation Task

Task:

> Turn this manual release checklist into a repeatable GitHub Actions workflow.

Likely degree: `automation-engineer`

Why:

- Mentions repeatability.
- Mentions GitHub Actions.
- Implies workflow reliability and failure handling.

Initial context:

- Automation degree prompt.
- Workflow automation, CI/CD, shell scripting, and integration-testing skills.
- Shell, GitHub, CI, and scheduler tools when available.

Soft exclusions:

- Product research and visual design skills stay out unless the workflow produces those artifacts.

## Low-Confidence Task

Task:

> Improve the onboarding flow.

Likely result: ask the user to choose.

Why:

- Could mean product research, frontend implementation, backend instrumentation, or data analysis.
- The resolver should not overfit a vague task to one degree.

Good follow-up:

> Should I treat this as product research, frontend implementation, or analytics work?

## Soft Exclusion Expansion

Task:

> Fix the settings page save button. It renders correctly, but the API returns 403.

Initial degree: `frontend-engineer`

Expansion:

- Load backend/auth context after inspecting the failed request or API route.
- State why: the task crossed from UI behavior into authorization failure evidence.

Soft exclusions still helped because backend context was not loaded until the task justified it.

## Missing Recommended Tool

Task:

> Verify this React modal works on mobile.

Likely degree: `frontend-engineer`

Recommended tool:

- `browser`

If the browser MCP is not available:

- Do not install or configure it automatically.
- Say that browser verification is recommended but unavailable.
- Fall back to code inspection and any available local test commands.
- Ask before adding a new MCP, package, or CLI dependency.
