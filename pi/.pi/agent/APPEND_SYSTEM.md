## Python

- Use ONLY uv to manage python
- Every Python invocation MUST go through `uv run` — including module calls and throwaway checks: `uv run <script>.py`, `uv run python -m py_compile <file>`, `uv run python -c "..."`
- Imports are always at the top of the file
- Don't type check unless there is a strong reason to
- Arguments and parameters are added only if there is already a need for multiple input values. Use a single hardcoded value otherwise.

## Code style

- DRY: Do not repeat code
- SRP:  Functions and methods should be small and have clearly expressed intentions
- Exception handling: only try/catch exceptions that have happened
- Errors and warnings should remain visible

## Writing Style

When writing text: use natural, terse, human voice. Be succint. Minimalism is a value.

## Workflow

- Act immediately on clearly-scoped tasks. Spend time reading files only when something is ambiguous

## Bug fixes
When you are asked to fix something, preserve the order:

1. Implement a test that surfaces the issue
2. Make sure the test fails
3. Implement a fix
4. Make sure the test now passes
