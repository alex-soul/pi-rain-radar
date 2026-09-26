#!/usr/bin/env bash
# Permanent public bootstrap. Requires Raspberry Pi OS Desktop's Python and curl.
set -Eeuo pipefail
umask 077
case "${1:-}" in
    --help|-h)
        printf '%s\n' 'Pi Rain Radar guided installer (hardware testing)' \
            'Run as the desktop user. Options: --check, --reconfigure, --refresh-installer.' \
            'A normal rerun resumes the recorded installer and app versions.'
        exit 0 ;;
    ''|--check|--reconfigure|--refresh-installer) ;;
    *) echo 'Unknown option. Use --help.' >&2; exit 2 ;;
esac
[[ $# -le 1 ]] || exit 2
[[ $EUID != 0 ]] || { echo 'Run as your desktop user, without sudo.' >&2; exit 1; }
[[ -r /etc/rpi-issue ]] || { echo 'Raspberry Pi OS with Desktop is required.' >&2; exit 1; }
for tool in python3 curl flock; do
    command -v "$tool" >/dev/null || { echo "Required OS tool missing: $tool" >&2; exit 1; }
done
state="$HOME/.local/state/pi-rain-radar"
cache="$HOME/.local/share/pi-rain-radar-installer"
mkdir -p "$state" "$cache"
exec 8>"$state/bootstrap.lock"
flock -n 8 || { echo 'An installer is already running.' >&2; exit 1; }
sha=''
if [[ -f "$state/install.json" && ${1:-} != --refresh-installer ]]; then
    sha=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["installer_commit"])' "$state/install.json")
fi
if [[ -z $sha ]]; then
    echo 'Resolving the current installer snapshot...'
    sha=$(curl --fail --silent --show-error --retry 3 --connect-timeout 15 --max-time 60 \
        https://api.github.com/repos/alex-soul/pi-rain-radar/commits/main |
        python3 -c 'import json,sys; print(json.load(sys.stdin)["sha"])')
fi
[[ $sha =~ ^[0-9a-f]{40}$ ]] || { echo 'Invalid installer snapshot.' >&2; exit 1; }
bundle="$cache/$sha"
if [[ ! -f "$bundle/.complete" ]]; then
    temporary=$(mktemp -d "$cache/.download-XXXXXXXX")
    trap 'rm -rf -- "${temporary:?}"' EXIT
    files=(host/installer/installer.py host/installer/release.json
        host/display-controls/config.py host/display-controls/controller.py
        host/display-controls/receiver.py host/display-controls/setup.py host/display-controls/start.sh)
    for file in "${files[@]}"; do
        mkdir -p "$temporary/$(dirname "$file")"
        curl --fail --silent --show-error --retry 3 --connect-timeout 15 --max-time 120 \
            "https://raw.githubusercontent.com/alex-soul/pi-rain-radar/$sha/$file" -o "$temporary/$file"
    done
    printf '%s\n' "$sha" >"$temporary/.complete"
    # A complete directory is renamed into place only after every download succeeds.
    [[ ! -e "$bundle" ]] || { echo 'Incomplete cache exists; inspect it before retrying.' >&2; exit 1; }
    mv -- "$temporary" "$bundle"
    trap - EXIT
fi
echo "Installer snapshot: $sha"
args=()
[[ ${1:-} != --refresh-installer && -n ${1:-} ]] && args+=("$1")
python3 "$bundle/host/installer/installer.py" --source-commit "$sha" "${args[@]}" </dev/tty
