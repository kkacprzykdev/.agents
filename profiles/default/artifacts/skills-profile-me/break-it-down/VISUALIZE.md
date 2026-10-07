# Visualize (on request)

Run this file only when the user asks to **visualize**, **draw the flow**, or wants a **flowchart** / **HTML diagram**. Do not write the HTML on pass 1.

This is a throwaway report in the OS temp directory. It is not a repo file. It is not an architecture-review candidate list.

## When to ask first

If the drawing would change with the answer, ask. Then stop.

Ask only what you need:

- **Shape** — one example as a sequence, or a flowchart of all callers
- **Non-paths** — include unused wires and “this does not call X” edges, or live callers only

If they already chose, do not re-ask.

## What to draw

Stay on the same checkout and the same flow as the breakdown.

Keep it high level. Skip helper trivia. Use the same names as the numbered steps.

Use **Mermaid** for graphs (callers, flowcharts, sequences). Use **hand-built divs or SVG** for layers, two meanings of one name, or a live path next to an unused path.

Draw a **before/after** (or side-by-side) only when two states exist. Example: live create vs unused wire. Do not invent a refactor.

Do not dump every file into the diagram.

## HTML file

Write a self-contained HTML file to the OS temp directory so nothing lands in the repo. Resolve the temp dir from `$TMPDIR`, falling back to `/tmp` (or `%TEMP%` on Windows). Write to `<tmpdir>/break-it-down-<timestamp>.html` so each run gets a fresh file.

Open it for the user: `xdg-open <path>` on Linux, `open <path>` on macOS, `start <path>` on Windows. Tell them the absolute path.

The report uses **Tailwind via CDN** for layout and styling, and **Mermaid via CDN** for diagrams.

```html
<script src="https://cdn.tailwindcss.com"></script>
<script type="module">
  import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs";
  mermaid.initialize({ startOnLoad: true, theme: "neutral", securityLevel: "loose" });
</script>
```

Wrap each Mermaid graph in a card. Mix Mermaid with hand-crafted CSS/SVG. Be visual. Sparse prose. No introduction essay.

Header: flow name, date, a short legend. Then the diagram or diagrams they asked for.

The only scripts are the Tailwind CDN and the Mermaid ESM import.

After you open the file, tell them the path. Then stop. They can still say **go deeper on N**.

**Done when:** the HTML is in temp, the browser is open, the user has the absolute path, and you have not written into the repo.
