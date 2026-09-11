#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
# shellcheck source=../install.sh
source "$repo_root/install.sh"

calls=()
record() {
    calls+=("$1:$profile")
}
install_packages() { record packages; }
install_components() { record components; }
stow_dotfiles() { record stow; }
install_automount() { record automount; }
verify_commands() { record verify; }
report_manual_setup() { record report; }

for selected_profile in sway i3; do
    calls=()
    main "$selected_profile" >/dev/null
    expected=(
        "packages:$selected_profile"
        "components:$selected_profile"
        "stow:$selected_profile"
        "automount:$selected_profile"
        "verify:$selected_profile"
        "report:$selected_profile"
    )
    [[ ${calls[*]} == "${expected[*]}" ]] || {
        printf 'unexpected %s install order: %s\n' "$selected_profile" "${calls[*]}" >&2
        exit 1
    }
done

if (main invalid >/dev/null 2>&1); then
    printf 'invalid profiles must fail\n' >&2
    exit 1
fi
if (main >/dev/null 2>&1); then
    printf 'a missing profile must fail\n' >&2
    exit 1
fi

printf 'install flow: ok\n'
