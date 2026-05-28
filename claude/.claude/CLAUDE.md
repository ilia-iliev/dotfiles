## Python

- Python dependencies **must be installed, synchronized, and locked** using uv
- Never use pip, pip-tools, poetry, or conda
- Run a Python script with `uv run <script-name>.py`

## Code style

- DRY: Do not repeat code
- SRP:  Functions and methods should be small and have clearly expressed intentions
- Exception handling: only try/catch exceptions that have happened

## General styling
- Type checking: avoid unless there is a strong reason to include
- Imports: ALWAYS at the top of the file
- Arguments and parameters: don't preemtively add them. Only inclyde if there is a reason to incldue; having a pinned defaultif they vary. If only the default is being used, then it shouldn't be an argument/parameter

## Writing Style
When writing ANY human-facing text: use natural, terse, human voice. Don't use AI-slop-style language. Always offer a draft for review before posting. Never credit Claude Code.

## Workflow
- Act immediately on clearly-scoped tasks, no need to read all the files. 

