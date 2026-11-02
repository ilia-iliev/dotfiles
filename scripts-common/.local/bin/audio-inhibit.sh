#!/bin/bash
# Active audio delays idle locking, but never resets an already locked session.

while true; do
    if pactl list sink-inputs | grep -q "Corked: no"; then
        pkill -HUP -u "$UID" -x xss-lock
    fi
    sleep 30
done
