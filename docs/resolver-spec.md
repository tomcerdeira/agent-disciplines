# Resolver Spec

The resolver is the advisory process that maps a user task to one or more degrees. V1 defines the expected behavior and output shape, not a required implementation.

Adapters may implement resolution with deterministic heuristics, embeddings, LLM judgment, or a manual user choice. Whatever the implementation, it should follow this contract.

## Goals

- Select the most relevant degree for the task.
- Keep the initial context smaller than loading every available skill.
- Recommend relevant tools without assuming they are installed.
- Preserve soft exclusions as advisory boundaries.
- Ask the user when the task is too ambiguous to classify confidently.

## Non-Goals

- Do not hide, disable, or sandbox skills.
- Do not install MCP servers, CLIs, packages, or services.
- Do not execute recommended tools just because a degree names them.
- Do not require a specific agent runtime.
- Do not require deterministic scoring across implementations.
- Do not force every task into exactly one degree.

## Inputs

A resolver may use these inputs:

- `task`: the user's task text.
- `degrees`: available degree packages with `DEGREE.md` entrypoints.
- `availableSkills`: optional runtime skill ids that can be mapped to `includeSkills`.
- `availableTools`: optional runtime tools, MCP servers, CLIs, apps, services, or package managers.
- `repoSignals`: optional file paths, changed files, language/framework hints, tests, logs, traces, or other local evidence.
- `userPreference`: optional explicit degree choice or domain preference from the user.

Only `task` and `degrees` are required for a portable prompt-only resolver.

## Matching Signals

The resolver should look for evidence in this order:

1. Explicit user intent, such as "use the frontend degree" or "treat this as automation work".
2. Direct task evidence, such as file paths, extensions, commands, tools, frameworks, or artifact types.
3. Degree `activation` signals, including `pathPatterns`, `commandPatterns`, and `promptSignals`.
4. Repo signals, such as changed files, package names, route names, tests, logs, or schemas.
5. General domain language, such as "layout", "endpoint", "CSV", "workflow", or "PRD".

Weak domain language alone should not override clearer file or user signals.

## Confidence Guidance

Confidence is advisory. Implementations do not need identical numeric scores, but they should make the same kind of decision.

Use these bands:

- `0.80` to `1.00`: select one primary degree.
- `0.60` to `0.79`: select one primary degree if the next-best degree is clearly weaker.
- `0.45` to `0.59`: ask the user unless repo evidence makes one degree clearly preferable.
- Below `0.45`: ask the user to choose or narrow the task.

Composition is appropriate when two degrees each have concrete evidence and the task crosses a real boundary. It should not be used just because two degrees are vaguely relevant.

## Decisions

A resolver returns one of these decisions:

- `select`: use one primary degree.
- `compose`: use one primary degree plus one secondary degree.
- `ask`: ask the user to choose or narrow the task.
- `none`: no available degree fits; proceed without a degree or ask for one.

## Primary and Secondary Degrees

The primary degree owns the main focus prompt and initial plan. A secondary degree contributes only the skills, tools, and focus guidance needed for the crossed boundary.

Composition rules:

- Prefer one primary degree.
- Add at most one secondary degree in v1.
- Do not merge every skill from both degrees by default.
- Keep the secondary degree's contribution narrow and justified.
- If three or more degrees seem necessary, ask the user to narrow the first milestone.

## Output Bundle

A resolver should emit a compact bundle:

```json
{
  "decision": "select",
  "task": "Fix keyboard navigation in SearchResults.tsx and verify it in browser.",
  "selectedDegrees": [
    {
      "id": "frontend-engineer",
      "role": "primary",
      "confidence": 0.84,
      "reason": "Task mentions a TSX file, keyboard navigation, and browser verification."
    }
  ],
  "activationMatches": [
    {
      "degreeId": "frontend-engineer",
      "pathPatterns": ["**/*.tsx"],
      "commandPatterns": [],
      "promptSignals": ["TSX files", "keyboard navigation", "browser verification"]
    }
  ],
  "includeSkills": [
    "react-best-practices",
    "frontend-design",
    "accessibility-review",
    "browser-verification",
    "e2e-testing"
  ],
  "recommendedTools": [
    {
      "id": "browser",
      "kind": "mcp",
      "purpose": "Inspect and verify user-visible behavior in a real browser.",
      "status": "unknown"
    },
    {
      "id": "package-manager",
      "kind": "package-manager",
      "purpose": "Run the repository's configured frontend scripts such as typecheck, lint, test, and build.",
      "status": "unknown"
    }
  ],
  "softExcludeSkills": [
    "backend-patterns",
    "database-migrations",
    "infrastructure-deployments",
    "data-pipelines"
  ],
  "prompt": "You are operating under the Frontend Engineer degree...",
  "notes": [
    "Soft exclusions are advisory and may be overridden by explicit user request or concrete evidence."
  ]
}
```

The exact JSON field order is not significant. Adapters may add runtime-specific fields, but should preserve the portable fields above. See [../examples/resolver-output.jsonc](../examples/resolver-output.jsonc) for complete `select`, `compose`, `ask`, and `none` examples.

## Recommended Tool Status

If `availableTools` are provided, the resolver or adapter should annotate each recommended tool:

- `available`: the tool is configured and can be used.
- `missing`: the tool is not configured or not found.
- `unknown`: availability was not checked.

Missing tools should not be silently replaced with unrelated tools. The agent may continue with a fallback, but should say what evidence is weaker without the recommended tool.

## Missing Skills

If a degree includes a skill that is unavailable in the runtime:

- Report the missing skill id.
- Keep the degree focus prompt.
- Use available adjacent skills only when they are a clear semantic match.
- Do not silently substitute broad or unrelated skills.

## Soft Exclusions

Soft exclusions guide the initial context. They can be overridden when:

- The user explicitly asks for the excluded domain.
- Code, files, logs, traces, tests, or errors show the task crosses that boundary.
- The selected degree cannot complete the task without adjacent context.

When overriding a soft exclusion, the agent should state the reason briefly.

## Ask Behavior

When confidence is low, ask one concise question with two or three likely choices.

Example:

```json
{
  "decision": "ask",
  "task": "Improve onboarding.",
  "question": "Should I treat this as product research, frontend implementation, or analytics work?",
  "choices": [
    "product-researcher",
    "frontend-engineer",
    "data-analyst"
  ],
  "reason": "The task is broad and could map to several degrees without stronger evidence."
}
```

Do not ask when the user already supplied a clear degree or the task has strong direct evidence.

## Implementation Notes

The resolver should be conservative:

- Prefer fewer skills and tools at the start.
- Let the task and evidence justify expansion.
- Preserve user intent over heuristic matches.
- Keep reasons short enough for a human to audit.
- Treat confidence as an explanation aid, not a mathematical guarantee.

Future resolver implementations should be tested against [../examples/validation-matrix.md](../examples/validation-matrix.md).

Machine-readable fixture cases live in [../fixtures/resolver-cases.jsonc](../fixtures/resolver-cases.jsonc). These fixtures define expected decisions and matched signals, but they do not imply that v1 ships a resolver runtime.
