#!/bin/bash
# Checks for active audio every 30 seconds and resets X11 idle timer

while true; do
    # Check for active audio streams (works for both Pulse and PipeWire)
    if pactl list sink-inputs | grep -q "State: RUNNING"; then
        xset s reset
    fi
    sleep 30
done
