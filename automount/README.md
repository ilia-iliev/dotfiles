# automount

Removable media mounts itself, with no tray applet and no file manager.

| Device | Mechanism | Appears at |
| --- | --- | --- |
| USB sticks, external drives, mass-storage Kindles | udev rule -> `systemd-mount` | `~/media/drives/<LABEL>` |
| Phones, MTP Kindles | `mtp-automount` user service -> `jmtpfs` | `~/media/mtp/<Vendor_Model>` |

`~/media/drives` is a symlink to `/run/media/<user>`, where udev does the
mounting. Both paths are created at login by `systemd-tmpfiles`.

## Install

```bash
mkdir -p ~/.config/systemd/user          # keep stow from folding the directory
stow -t ~ automount
sudo ./automount/install-system.sh       # also installs jmtpfs
systemd-tmpfiles --user --create
systemctl --user daemon-reload && systemctl --user start mtp-automount
```

The service is enabled by the `default.target.wants` symlink in this package,
so `systemctl --user enable` is not needed -- and must not be run, since with a
folded directory it would write into this repository.

## Unplugging

`vfat` has no journal, so pulling the cable mid-write corrupts the directory
chain rather than rolling it back. Auto-unmount does not save you: it fires on
the removal event, once the cable is already out. So:

```bash
unmount Kindle        # or a path, or --all; bare, it lists what is mounted
unmount kindle        # matched as typed first, then ignoring case
```

MTP needs none of this -- writes are per-file transactions with no dirty block
cache, so unplugging a phone is safe.

## Notes

Nothing here is machine-specific. `usb-automount` mounts for whoever holds the
active `seat0` session, and the polkit rule derives the permitted unit prefix
from the calling user, so both work unchanged on any machine. On a box with no
graphical seat, set `OWNER=` in `/etc/default/usb-automount`.

Encrypted volumes are skipped: the udev rule matches `ID_FS_USAGE=filesystem`,
and LUKS containers report `crypto`. Unlock with `cryptsetup open` and mount by
hand -- the resulting mapper device is not `ID_BUS=usb`, so it will not be
picked up either.

Mounting needs no polkit agent, because udev and systemd do it as root before
any session is involved. `unmount` needs no agent either, thanks to the polkit
rule. Note that no agent runs under sway by default, so anything *else*
wanting privilege escalation will fail silently.
