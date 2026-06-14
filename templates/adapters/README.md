# Adapter Templates

These templates are copy-paste surfaces for v1. They do not install an adapter or mutate an agent runtime.

Use them like this:

1. Run `npm run resolve -- ...` for the task.
2. Copy the resolver output.
3. Paste the resolver output into one of these templates.
4. Put the completed template above the normal task prompt in Cursor, Claude Code, Codex, or a generic chat model.

Templates:

- [generic-prompt.md](generic-prompt.md)
- [cursor.md](cursor.md)
- [claude-code.md](claude-code.md)
- [codex.md](codex.md)

Each template preserves the same v1 rules: degrees are advisory, soft exclusions are overrideable with evidence, and recommended tools are not automatically installed or executed.
