## Python

- Python dependencies **must be installed, synchronized, and locked** using uv
- Never use pip, pip-tools, poetry, or conda
- NEVER invoke bare `python` for ANY reason. Every Python invocation goes through `uv run` — including module calls and throwaway checks: `uv run <script>.py`, `uv run python -m py_compile <file>`, `uv run python -c "..."`. There are no exceptions.

## Code style

- DRY: Do not repeat code
- SRP:  Functions and methods should be small and have clearly expressed intentions
- Exception handling: only try/catch exceptions that have happened
- Errors and warnings should remain visible

## General styling
- Type checking: avoid unless there is a strong reason to include
- Imports: ALWAYS at the top of the file
- Arguments/parameters: only include if there is an EXISTING need for more than one value to be supported

## Writing Style
When writing ANY human-facing text: use natural, terse, human voice. Don't use AI-slop-style language. Always offer a draft for review before posting. Never credit Claude Code.

## Workflow
- Act immediately on clearly-scoped tasks, no need to read all the files. 

