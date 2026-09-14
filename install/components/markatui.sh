#!/usr/bin/env bash
set -euo pipefail

# markatui is written on this machine, so the installed command is a link to its
# checkout's build rather than a copy: an ordinary `cargo build --release` there is
# the editor in use from the moment it finishes.
readonly REMOTE=git@github.com:ilia-iliev/markatui.git
readonly CHECKOUT="$HOME/repositories/markatui"
readonly TARGET="$HOME/.local/bin/markatui"

command -v cargo >/dev/null || {
    printf 'markatui needs a Rust toolchain (1.95 or newer); install rustup first.\n' >&2
    exit 1
}

# Clone only what is missing. Pulling an existing checkout would disturb work in progress.
[[ -d $CHECKOUT/.git ]] || git clone "$REMOTE" "$CHECKOUT"

# From inside the checkout, so its rust-toolchain.toml decides which toolchain builds it.
cd "$CHECKOUT"
cargo build --release

mkdir -p "$(dirname "$TARGET")"
ln -sfn "$CHECKOUT/target/release/markatui" "$TARGET"
