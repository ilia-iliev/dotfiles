This repository manages my personal configuration files for Sway, Foot, VS Code, Claude, and Pi using GNU Stow, simplifying synchronization across machines.

## Prerequisites
Install GNU Stow:

```bash
sudo dnf install stow
```

## Setup
```bash
stow -t ~ sway foot vscode scripts-common claude pi automount
```
