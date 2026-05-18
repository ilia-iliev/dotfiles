---
name: refactor
description: Audit a codebase for refactoring opportunities across five passes — dead code, simplification, duplication, file size, and folder structure. Invoked explicitly via /refactor. Produces a single report and waits for sign-off before making any edits.
tools: Read, Glob, Grep, Bash, Edit
---

# Refactor

Run a five-pass refactoring audit. Each pass leaves less noise for the next, so keep the order: **removal → consolidation → organization**.

Do **not** edit anything during the audit. Produce one report, then wait for the user to pick which findings to act on.

## Scope

- Current working directory, respecting `.gitignore`.
- If the user passes a path or glob as argument, scope to that.
- Skip vendored/generated dirs: `node_modules`, `build`, `dist`, `.gradle`, `target`, `vendor`, `__pycache__`, `.next`, `coverage`.

## Pass 1 — Dead code

Find code that is defined but never used.

- Unreferenced exports, unused imports, unreachable branches, files no one imports.
- Use language-appropriate tools when available, fall back to `rg`:
  - TypeScript/JS: `ts-prune`, `knip`, or `tsc --noUnusedLocals`
  - Python: `vulture`, `ruff` (`F401`, `F841`)
  - Rust: `cargo +nightly udeps`, compiler `dead_code` warnings
  - Java/Kotlin: IDE inspections aren't available — grep-based for symbols, build warnings
- For files: list candidates that nothing imports, but flag entry points (main, CLI, test files, framework-magic files like Next.js routes, Spring components, Android Activities) as **likely false positives**.

Report format per finding: `path:line — symbol — reason`.

## Pass 2 — Simplification

Find symbols used in only **1–2 places** that could be inlined without changing intent

- Functions called from a single site where the body is shorter than the call setup
- Wrapper classes/types with one consumer
- Constants defined once, used once, where the literal would be clearer
- Single-implementation interfaces with one caller (premature abstraction)

For each, ask: *would inlining this make the code clearer or just shorter?* Only report if the answer is "clearer." Cosmetic shortening is not a refactor.

Report format: `path:line — symbol — N call sites — suggested action`.

## Pass 3 — Duplication (DRY)

Find repeated logic.

- Near-identical function bodies (use `rg` for distinctive substrings, then diff visually).
- Copy-pasted constants/strings that should share a source of truth.
- Parallel control structures across files (same switch, same validation chain).

Be wary of **coincidental duplication** — two functions that look alike but evolve independently. Only flag duplication where a single change would need to land in both places to keep behavior consistent. If you can't articulate the shared invariant, don't flag it.

Report format: `pathA:line ↔ pathB:line — what's shared — proposed extraction site`.

## Pass 4 — File size

Flag files that are too large to hold in your head.

- Threshold: ~400 LOC for most languages, ~250 for JSX/TSX with markup, ~600 for tests.
- For each oversize file, propose a split along a clear seam: route vs handler, model vs query, component vs hook, public API vs internal helpers. Don't propose a split if no natural seam exists — say so instead.

Report format: `path — N LOC — proposed seams (or "no clear seam")`.

## Pass 5 — Folder structure

Eyeball the top-level layout and one level down.

- Files that don't fit their folder (a `utils/auth.ts` that's actually domain logic).
- Naming inconsistencies (`helpers/` vs `utils/` vs `lib/` for the same role).
- Orphan directories (one file in a folder; or a folder whose name no longer matches its contents).
- Cross-cutting concerns scattered (logging, config, error types) that would benefit from a single home.
- Overly general naming to the point of no meaning - processing, controller, manager, item

Don't propose a full reorganization — propose targeted moves with a one-line reason each.

Report format: `current path → proposed path — reason`.

## Output

One report, in this structure:

```
# Refactor audit — <scope>

## 1. Dead code (<count>)
- ...

## 2. Simplification (<count>)
- ...

## 3. Duplication (<count>)
- ...

## 4. File size (<count>)
- ...

## 5. Folder structure (<count>)
- ...
```

Each section: bullet list, file:line refs, one line per finding. If a section is empty, write `None.` — don't pad.

After the report, ask: *"Which of these should I act on? Pick by section + index, or say 'all of section N'."*

Do not start editing until the user replies.

## When acting on findings

- Make changes in the same order as the passes (removal first, organization last).
- Group commits by pass, not by file.
- For folder moves, use `git mv` so history follows.
- After each pass, run the project's test/build command if one is obvious from the repo. If it fails, stop and report — don't try to fix unrelated breakage.
