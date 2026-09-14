# Route Pi through the shared tmux wrapper, regardless of where npm is on PATH.
pi() {
    "$HOME/.pi/agent/bin/pi" "$@"
}
