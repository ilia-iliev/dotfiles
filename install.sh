#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
readonly REPO_ROOT

usage() {
    printf 'usage: %s {sway|i3}\n' "${0##*/}" >&2
    exit 2
}

read_packages() {
    local manifest
    for manifest in "$@"; do
        grep -Ev '^[[:space:]]*(#|$)' "$manifest"
    done
}

install_packages() {
    local -a packages
    mapfile -t packages < <(read_packages \
        "$REPO_ROOT/install/packages-common.txt" \
        "$REPO_ROOT/install/packages-$profile.txt")
    sudo dnf install -y "${packages[@]}"
}

install_components() {
    "$REPO_ROOT/install/components/yazi.sh"
    "$REPO_ROOT/install/components/pomobar.sh"
    "$REPO_ROOT/install/components/markatui.sh"
    if [[ $profile == sway ]]; then
        "$REPO_ROOT/install/components/sway-audio-idle-inhibit.sh"
    fi
}

stow_dotfiles() {
    local -a packages=(scripts-common claude pi automount "$profile")
    [[ $profile == sway ]] && packages+=(foot)

    # Keep systemd's user directory real. Otherwise Stow may fold it into one
    # symlink and `systemctl enable` can write generated links into this repo.
    mkdir -p "$HOME/.config/systemd/user" "$HOME/.local/bin"

    stow --dir "$REPO_ROOT" --target "$HOME" --restow "${packages[@]}"
}

install_automount() {
    sudo "$REPO_ROOT/automount/install-system.sh"
    systemd-tmpfiles --user --create
    systemctl --user daemon-reload
    systemctl --user start mtp-automount.service
}

verify_commands() {
    local -a common=(git stow yazi ya jq rclone pomo dex-autostart nm-applet udiskie flameshot pactl i3status markatui tmux)
    local -a sway=(sway foot swaybg swayidle swaylock rofi grim wl-copy sway-audio-idle-inhibit)
    local -a i3=(i3 i3lock alacritty dmenu feh scrot xclip xdotool xss-lock setxkbmap xset)
    local -a required missing=()
    local command

    required=("${common[@]}")
    if [[ $profile == sway ]]; then
        required+=("${sway[@]}")
    else
        required+=("${i3[@]}")
    fi

    for command in "${required[@]}"; do
        command -v "$command" >/dev/null || missing+=("$command")
    done

    if ((${#missing[@]})); then
        printf 'Missing required commands: %s\n' "${missing[*]}" >&2
        return 1
    fi
}

report_manual_setup() {
    local item
    [[ -f $HOME/Pictures/wallpaper.jpg ]] || printf 'Manual setup: add ~/Pictures/wallpaper.jpg\n'
    mkdir -p "$HOME/Pictures/Screenshots" "$HOME/google_drive"

    if ! rclone listremotes 2>/dev/null | grep -Fxq 'google_drive:'; then
        printf 'Manual setup: configure the rclone remote "google_drive"\n'
    fi

    if [[ $profile == sway ]]; then
        for item in google-chrome zed firefox featherpad telegram; do
            command -v "$item" >/dev/null || printf 'Optional application missing: %s\n' "$item"
        done
    elif ! command -v xcwd >/dev/null; then
        printf 'Optional i3 helper missing: xcwd (new terminals will not inherit the focused directory)\n'
    fi
}

main() {
    (($# == 1)) || usage
    profile=$1
    [[ $profile == sway || $profile == i3 ]] || usage
    [[ ${EUID:-$(id -u)} -ne 0 ]] || {
        printf 'Run this installer as your user; it invokes sudo when needed.\n' >&2
        exit 1
    }
    command -v dnf >/dev/null || {
        printf 'This installer currently supports Fedora/dnf only.\n' >&2
        exit 1
    }

    install_packages
    install_components
    stow_dotfiles
    install_automount
    verify_commands
    report_manual_setup

    printf '%s profile installed.\n' "$profile"
}

if [[ ${BASH_SOURCE[0]} == "$0" ]]; then
    main "$@"
fi
