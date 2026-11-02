#!/usr/bin/env bash
set -euo pipefail

# Only one helper should manage the session's saved screensaver settings.
exec {guard_fd}>"${XDG_RUNTIME_DIR:?}/audio-inhibit.lock"
flock -n "$guard_fd" || exit 0

settings=$(LC_ALL=C xset q)
read -r timeout cycle < <(awk '/timeout:/ {print $2, $4}' <<<"$settings")
inhibited=false

restore_idle_timer() {
    if "$inhibited"; then
        xset s "$timeout" "$cycle"
        inhibited=false
    fi
}
trap restore_idle_timer EXIT
trap 'exit 0' HUP INT TERM

# Disable only automatic screensaver activation during playback. Do not signal
# xss-lock: some packaged versions exit on SIGHUP. Do not reset the screensaver
# or DPMS either, since that can disturb an already locked session.
while true; do
    audio=$(pactl list sink-inputs)
    if grep -q 'Corked: no' <<<"$audio"; then
        if ! "$inhibited"; then
            inhibited=true
            xset s off
        fi
    else
        restore_idle_timer
    fi
    sleep 30
done
