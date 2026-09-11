#!/usr/bin/env bash
set -euo pipefail

readonly COMMIT=2f0f9f34472031a565876c80ad44256509403860
readonly SHA256=a433e5351c0110745e62362e89df28349e5b28a8f976bb22a59be348575c1cf6
readonly URL="https://raw.githubusercontent.com/ilia-iliev/pomobar/$COMMIT/pomo"
readonly TARGET="$HOME/.local/bin/pomo"

if [[ -f $TARGET ]] && printf '%s  %s\n' "$SHA256" "$TARGET" |
    sha256sum --check --status; then
    exit 0
fi

workdir=$(mktemp -d)
trap 'rm -rf "$workdir"' EXIT
curl --fail --location --retry 3 --output "$workdir/pomo" "$URL"
printf '%s  %s\n' "$SHA256" "$workdir/pomo" | sha256sum --check --status || {
    printf 'Pomobar script checksum mismatch.\n' >&2
    exit 1
}
install -Dm755 "$workdir/pomo" "$TARGET"
