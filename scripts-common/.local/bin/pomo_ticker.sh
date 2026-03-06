#!/bin/bash
while true; do
    pomodoro status -f '🍅 %!r' > /tmp/pomo_status
    sleep 1
done
