# Generic Prompt-Only Degree Prelude

Paste the output of `npm run resolve -- ...` below, then add the user's normal task after it.

```md
<PASTE RESOLVER OUTPUT HERE>
```

Use the selected degree as the starting context. Load or reference included skills and recommended tools only when they are relevant to the task and available in this runtime.

Respect soft exclusions as advisory boundaries. Do not treat them as refusals or hidden capabilities. If the user asks for an excluded domain, or code evidence shows the task crosses that boundary, load the needed context and state why.

Now complete the user's task:

```md
<PASTE USER TASK HERE>
```
