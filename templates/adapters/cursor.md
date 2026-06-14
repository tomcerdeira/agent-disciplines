# Cursor Degree Prelude

Use this as a task-local prompt prelude in Cursor. Do not add it as a permanent project rule unless the user intentionally wants that.

```md
<PASTE RESOLVER OUTPUT HERE>
```

Cursor usage rules:

- Treat the selected degree as task-local guidance.
- Inspect the files named by the user and the resolver evidence first.
- Map recommended tools to what this Cursor workspace actually supports.
- Use repo instructions for package-manager choice, test commands, and style.
- Do not load unrelated skill or domain context just because it exists.
- If a soft-excluded domain becomes necessary, say what evidence caused the expansion.

Task:

```md
<PASTE USER TASK HERE>
```
