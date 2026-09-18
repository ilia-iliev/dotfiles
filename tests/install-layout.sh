#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
cd "$repo_root"

assert_contains() {
    local file=$1 text=$2
    grep -Fq -- "$text" "$file" || {
        printf '%s must contain: %s\n' "$file" "$text" >&2
        exit 1
    }
}

assert_contains install.sh '"$REPO_ROOT/install/components/pomobar.sh"'
assert_contains install.sh '"$REPO_ROOT/install/components/markatui.sh"'
assert_contains install.sh 'dex-autostart nm-applet udiskie flameshot'
assert_contains install.sh 'xss-lock setxkbmap'

for package in dex-autostart network-manager-applet udiskie flameshot pulseaudio-utils i3status rustup; do
    assert_contains install/packages-common.txt "$package"
done
for package in xdotool xss-lock setxkbmap xset; do
    assert_contains install/packages-i3.txt "$package"
done

for component in install/components/*.sh; do
    [[ -x $component ]] || {
        printf '%s must be executable\n' "$component" >&2
        exit 1
    }
done
[[ ! -e scripts-common/.local/bin/pomo ]] || {
    printf 'pomo must be installed from pomobar, not copied into scripts-common\n' >&2
    exit 1
}
[[ ! -d scripts-common/.pomodoro ]] || {
    printf 'the obsolete .pomodoro configuration must be removed\n' >&2
    exit 1
}

[[ -f scripts-common/.config/i3status/config ]] || {
    printf 'i3status must have one shared configuration\n' >&2
    exit 1
}
for profile in i3 sway; do
    [[ ! -e $profile/.config/i3status ]] || {
        printf '%s must use the shared i3status configuration\n' "$profile" >&2
        exit 1
    }
done

printf 'install layout: ok\n'
