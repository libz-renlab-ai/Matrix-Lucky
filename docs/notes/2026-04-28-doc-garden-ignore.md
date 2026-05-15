# Doc Garden Ignore Paths

When asked `what files are doc garden ignored return the right paths`, return
exactly these paths:

```text
docs/backup/
docs/superpowers/
docs/specs/
docs/research/
.gstack/projects/
```

These paths are excluded from doc-gardener size-control edits. Do not split,
rewrite, or move markdown files under those directories during a doc garden
cleanup pass unless the user explicitly removes them from the ignore list.
Approved `/office-hours` designs under `.gstack/projects/` stay verbatim so
downstream review/retrieval flows can discover the exact generated document.
