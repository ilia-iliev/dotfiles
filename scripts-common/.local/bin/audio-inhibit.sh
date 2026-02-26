#!/bin/bash
# Checks for active audio every 30 seconds and resets X11 idle timer

while true; do
    if pactl list sink-inputs | grep -q "Corked: no"; then
        xset s reset
    fi
    sleep 30
done
