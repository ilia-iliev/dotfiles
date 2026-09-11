#!/usr/bin/env bash
set -euo pipefail

readonly VERSION=0.2.0
readonly SHA256=8c832ca0904ae9c1423d9744d6d14555cbc26237da81c4dc8e9e8b963e9a4d68
readonly ARCHIVE="SwayAudioIdleInhibit-$VERSION.tar.gz"
readonly URL="https://github.com/ErikReider/SwayAudioIdleInhibit/archive/refs/tags/v$VERSION.tar.gz"
REPO_ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
readonly REPO_ROOT
readonly SOURCE_DIR="$REPO_ROOT/.build/sway-audio-idle-inhibit-source-$VERSION"
readonly BUILD_DIR="$REPO_ROOT/.build/sway-audio-idle-inhibit"

prepare_source() {
    local workdir
    [[ -f $SOURCE_DIR/meson.build ]] && return

    mkdir -p "$REPO_ROOT/.build"
    workdir=$(mktemp -d "$REPO_ROOT/.build/sway-audio-idle-inhibit.XXXXXX")
    trap 'rm -rf "$workdir"' RETURN

    curl --fail --location --retry 3 --output "$workdir/$ARCHIVE" "$URL"
    printf '%s  %s\n' "$SHA256" "$workdir/$ARCHIVE" |
        sha256sum --check --status || {
        printf 'SwayAudioIdleInhibit archive checksum mismatch.\n' >&2
        exit 1
    }
    mkdir "$workdir/source"
    tar -xzf "$workdir/$ARCHIVE" --strip-components=1 -C "$workdir/source"
    rm -rf "$SOURCE_DIR"
    mv "$workdir/source" "$SOURCE_DIR"
}

prepare_source
if [[ -f $BUILD_DIR/build.ninja ]] &&
    ! grep -Fq "\"source\": \"$SOURCE_DIR\"" "$BUILD_DIR/meson-info/meson-info.json"; then
    rm -rf "$BUILD_DIR"
fi

if [[ -f $BUILD_DIR/build.ninja ]]; then
    meson setup --reconfigure "$BUILD_DIR" "$SOURCE_DIR" \
        --buildtype=release -Dlogind-provider=systemd
else
    meson setup "$BUILD_DIR" "$SOURCE_DIR" \
        --buildtype=release -Dlogind-provider=systemd
fi
meson compile -C "$BUILD_DIR"
install -Dm755 "$BUILD_DIR/sway-audio-idle-inhibit" \
    "$HOME/.local/bin/sway-audio-idle-inhibit"
