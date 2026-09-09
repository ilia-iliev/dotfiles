# Report the current directory so foot can inherit it when spawning a terminal.
__foot_osc7() {
    printf '\e]7;file://%s%s\e\\' "$HOSTNAME" "$PWD"
}

PROMPT_COMMAND="__foot_osc7${PROMPT_COMMAND:+;$PROMPT_COMMAND}"
