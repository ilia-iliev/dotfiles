#!/usr/bin/env bash
# Installs the root-owned half of this package. Run with sudo.
# The rest is stowed: stow -t ~ automount
set -euo pipefail

cd "$(dirname "$(readlink -f "$0")")"

command -v jmtpfs >/dev/null || dnf install -y jmtpfs

install -Dm 0755 system/usr/local/bin/usb-automount \
                 /usr/local/bin/usb-automount
install -Dm 0644 system/etc/udev/rules.d/99-usb-automount.rules \
                 /etc/udev/rules.d/99-usb-automount.rules
install -Dm 0644 system/etc/polkit-1/rules.d/50-usb-unmount.rules \
                 /etc/polkit-1/rules.d/50-usb-unmount.rules

udevadm control --reload-rules
echo "system files installed"
