# Claude Code Degree Prelude

Paste this above the normal Claude Code task. Keep it task-local unless the project deliberately adopts agent-degrees as a standing workflow.

```md
<PASTE RESOLVER OUTPUT HERE>
```

Claude Code usage rules:

- Start from the selected degree's focus prompt.
- Treat included skill ids as a shortlist for relevant local instructions or references.
- Treat recommended tools and CLIs as evidence sources, not commands to run automatically.
- Prefer the repository's own instructions when choosing package managers, tests, linting, and build commands.
- Keep soft-excluded skill families out of context until the user or code evidence justifies them.
- When expanding beyond the selected degree, state the concrete reason.

Task:

```md
<PASTE USER TASK HERE>
```
