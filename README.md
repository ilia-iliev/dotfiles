# Dotfiles

Configuration for Fedora machines running either Sway or i3.

## Install

Clone the repository and run the installer for the desktop on that machine:

```bash
git clone git@github.com:ilia-iliev/dotfiles.git
cd dotfiles
./install.sh sway        # or: ./install.sh i3
```

The installer:

- installs Fedora packages with DNF;
- installs pinned Yazi and Pomobar releases;
- downloads and builds a pinned SwayAudioIdleInhibit release for the Sway profile;
- stows shared and desktop-specific dotfiles;
- installs the automount system files;
- checks required commands and reports manual setup.

It is safe to run again. Run it as your normal user; it uses `sudo` for system changes.

## Sources of truth

Package dependencies live in:

- `install/packages-common.txt`
- `install/packages-sway.txt`
- `install/packages-i3.txt`

Install recipes for software not supplied by DNF live in `install/components/`.
Shared dotfiles belong in `scripts-common`, `claude`, `pi`, or `automount`.
Desktop-specific files belong in `sway`, `foot`, or `i3`.

Do not stow `sway` and `i3` together. Both provide an i3status configuration.

## Manual state

The installer reports state that cannot be kept safely in this repository:

- `~/Pictures/wallpaper.jpg`
- the `rclone` remote named `google_drive`
- optional machine-specific Sway settings under `~/.config/sway/machine.d/`
- optional graphical applications from third-party repositories
