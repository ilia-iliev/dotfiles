#!/usr/bin/env bash
set -euo pipefail

readonly VERSION=26.9.1
readonly SHA256=a02fe91d3304294048c681f010f1100856872a4e98ecf6927328e888d40a6ad2
readonly TARGET=x86_64-unknown-linux-gnu
readonly ARCHIVE="yazi-$TARGET.zip"
readonly URL="https://github.com/sxyazi/yazi/releases/download/v$VERSION/$ARCHIVE"

if command -v yazi >/dev/null && command -v ya >/dev/null &&
    yazi --version 2>/dev/null | grep -Fq "Version: $VERSION"; then
    exit 0
fi

[[ $(uname -m) == x86_64 ]] || {
    printf 'The pinned Yazi binary currently supports x86_64 only.\n' >&2
    exit 1
}

workdir=$(mktemp -d)
trap 'rm -rf "$workdir"' EXIT
curl --fail --location --retry 3 --output "$workdir/$ARCHIVE" "$URL"
printf '%s  %s\n' "$SHA256" "$workdir/$ARCHIVE" | sha256sum --check --status || {
    printf 'Yazi archive checksum mismatch.\n' >&2
    exit 1
}
unzip -q "$workdir/$ARCHIVE" -d "$workdir"
install -Dm755 "$workdir/yazi-$TARGET/yazi" "$HOME/.local/bin/yazi"
install -Dm755 "$workdir/yazi-$TARGET/ya" "$HOME/.local/bin/ya"
