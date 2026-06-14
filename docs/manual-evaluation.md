# Manual Evaluation

Use this playbook to test degrees in real agent sessions before building runtime adapters.

The goal is to compare normal agent behavior against degree-guided behavior on real tasks. This is not a benchmark; use either the manual bundles or `npm run resolve -- ...` as the degree-guided input.

## What to Test

Pick two or three real tasks that you would naturally give an agent:

- A clear single-degree task.
- A task where recommended tools matter.
- A cross-boundary task where two degrees may compose.

This repo includes ready-to-use bundles:

- [Frontend keyboard navigation](../examples/manual-bundles/frontend-keyboard-navigation.md)
- [TheNetwork candidates keyboard shortcuts](../examples/manual-bundles/thenetwork-candidates-keyboard-shortcuts.md)
- [Backend rate limit](../examples/manual-bundles/backend-rate-limit.md)
- [Billing settings compose](../examples/manual-bundles/billing-settings-compose.md)

## Run Method

For each task, run two passes in comparable agent contexts.

### Pass A: Baseline

Give the agent only the task.

Record:

- First plan.
- Skills or tools the agent tries to load.
- Whether unrelated context appears.
- Whether the agent asks a useful clarifying question.
- Whether the agent proposes reasonable verification.

### Pass B: Degree-Guided

Give the same task plus the matching manual bundle or the output of `npm run resolve -- ...`.

Record:

- First plan.
- Whether included skills match the task.
- Whether recommended tools are relevant.
- Whether soft exclusions keep unrelated context out.
- Whether the agent expands past soft exclusions only with evidence.
- Whether the degree prompt over-constrains the agent.

## Evaluation Table

Use this table after each run:

| Task | Baseline first plan | Degree first plan | Better first plan? | Context bloat reduced? | Tool choice improved? | Bad exclusion? | Metadata changes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Frontend keyboard navigation |  |  |  |  |  |  |  |
| TheNetwork candidates keyboard shortcuts |  |  |  |  |  |  |  |
| Backend rate limit |  |  |  |  |  |  |  |
| Billing settings compose |  |  |  |  |  |  |  |

## What Counts as Success

A degree is helping when:

- The first plan starts closer to the intended domain.
- The agent names fewer unrelated skills or systems.
- Tool recommendations map to the evidence needed for the task.
- Soft exclusions reduce noise without blocking useful expansion.
- The agent can explain why it expands into a secondary degree.

## What Counts as Failure

A degree needs tuning when:

- It selects the wrong domain from clear evidence.
- It hides or discourages context that the task obviously needs.
- It recommends unavailable or irrelevant tools as if they are mandatory.
- It asks the user even when evidence is clear.
- It overfits broad words like "improve", "bug", or "code".

## After the Run

Update degree metadata, not the task, when the task exposes a real mismatch:

- Add or remove `activation.pathPatterns`.
- Add or remove `activation.commandPatterns`.
- Tune `activation.promptSignals`.
- Adjust `softExcludeSkills`.
- Clarify the focus prompt.
- Add a fixture case if the scenario should become part of the evaluation set.
