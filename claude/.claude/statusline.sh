#!/bin/bash
# ~/.claude/statusline.sh
# Custom statusline script for Claude Code
 
# Read JSON data from stdin
INPUT=$(cat)
 
# Extract rate_limits with jq
CONTEXT=$(echo "$INPUT" | jq -r '.context_window.used_percentage // 0 | floor')
RATE_LIMIT=$(echo "$INPUT" | jq -r '.rate_limits.five_hour.used_percentage // 0 | floor')
MODEL=$(echo "$INPUT" | jq -r '.model.display_name')
 
# Convert reset time to human-readable format
RESETS_AT=$(echo "$INPUT" | jq -r '.rate_limits.five_hour.resets_at // 0')
if [ "$RESETS_AT" != "0" ] && [ "$RESETS_AT" != "null" ]; then
  RESET_TIME=$(date -d "@$RESETS_AT" '+%H:%M' 2>/dev/null || date -r "$RESETS_AT" '+%H:%M' 2>/dev/null)
else
  RESET_TIME="--:--"
fi
 
# Output the formatted statusline
echo "${MODEL} | Context: ${CONTEXT}% | Rate Limit: ${RATE_LIMIT}% | Reset: ${RESET_TIME}"
