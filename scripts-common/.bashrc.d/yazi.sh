# Launch Yazi with `y` and keep its final directory on exit.
y() {
    local cwd_file cwd
    cwd_file=$(mktemp -t yazi-cwd.XXXXXX) || return

    command yazi "$@" --cwd-file="$cwd_file"

    IFS= read -r cwd < "$cwd_file"
    if [ -n "$cwd" ] && [ "$cwd" != "$PWD" ]; then
        builtin cd -- "$cwd"
    fi
    rm -f -- "$cwd_file"
}
