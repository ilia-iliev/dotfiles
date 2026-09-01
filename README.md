This repository manages my personal configuration files for i3, Sway, VS Code, Claude, and Pi using GNU Stow, simplifying synchronization across machines.

## Prerequisites
Please ensure GNU Stow is installed (e.g., `sudo apt install stow` on Debian/Ubuntu).

## Setup
```bash
stow -t ~ i3 sway vscode scripts-common claude pi
```
