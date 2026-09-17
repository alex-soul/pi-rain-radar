#!/bin/sh
set -eu

# Optional host installation only. This script never requests restart/shutdown.
action=${1:-status}
case "$action" in install|remove|status) ;; *) echo 'Use install, remove or status.' >&2; exit 2;; esac
if [ "$(id -u)" != 0 ]; then echo 'Run with sudo on the Debian/Raspberry Pi OS host.' >&2; exit 1; fi
if [ "$(uname -s)" != Linux ] || [ ! -d /run/systemd/system ]; then
  echo 'Device Power needs a Debian/Raspberry Pi OS host running systemd.' >&2; exit 1
fi
. /etc/os-release
case "$ID" in debian|raspbian) ;; *) echo 'Supported hosts: Debian and Raspberry Pi OS.' >&2; exit 1;; esac
dpkg --compare-versions "${VERSION_ID:-0}" ge 12 || { echo 'Debian/Raspberry Pi OS 12 or later is required.' >&2; exit 1; }
config=/etc/pi-rain-radar-power
unit=/etc/systemd/system/pi-rain-radar-power.service
library=/usr/local/lib/pi-rain-radar-power
if [ "$action" = status ]; then
  systemctl status pi-rain-radar-power.service --no-pager
  exit
fi
if [ "$action" = remove ]; then
  if [ -f "$unit" ]; then systemctl disable --now pi-rain-radar-power.service; fi
  rm -f "$unit" "$library/helper.py"
  rmdir "$library" 2>/dev/null || true
  systemctl daemon-reload
  echo 'Helper removed. Token, replay ledger and group preserved for reinstall.'
  echo 'Recreate the app without /etc/pi-rain-radar-power/compose.power.yaml.'
  exit
fi
command -v python3 >/dev/null || { echo 'Install python3 first: sudo apt install python3' >&2; exit 1; }
source_dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
getent group radar-power >/dev/null || groupadd --system radar-power
group_id=$(getent group radar-power | cut -d: -f3)
case "$group_id" in ''|*[!0-9]*) echo 'Cannot resolve helper group.' >&2; exit 1;; esac
install -d -o root -g root -m 0755 "$library" "$config"
if [ -L "$config/token" ]; then echo 'Refusing a symlink token.' >&2; exit 1; fi
if [ ! -e "$config/token" ]; then
  (umask 077; python3 -c 'import secrets; print(secrets.token_hex(32))' > "$config/token")
fi
python3 -c 'import pathlib,re; assert re.fullmatch("[a-f0-9]{64}", pathlib.Path("/etc/pi-rain-radar-power/token").read_text().strip()), "Invalid existing token; restore it before reinstalling"'
chown root:radar-power "$config/token"
chmod 0440 "$config/token"
install -o root -g root -m 0644 "$source_dir/helper.py" "$library/helper.py"
install -o root -g root -m 0644 "$source_dir/pi-rain-radar-power.service" "$unit"
cat > "$config/compose.power.yaml" <<EOF
# Generated optional Device Power integration. Contains no secret values.
services:
  radar:
    environment:
      POWER_HELPER_SOCKET: /run/radar-power/control.sock
      POWER_HELPER_TOKEN_FILE: /run/secrets/radar-power-token
    group_add:
      - "$group_id"
    volumes:
      - type: bind
        source: /run/pi-rain-radar-power
        target: /run/radar-power
        read_only: true
        bind:
          create_host_path: false
      - type: bind
        source: /etc/pi-rain-radar-power/token
        target: /run/secrets/radar-power-token
        read_only: true
        bind:
          create_host_path: false
EOF
chmod 0644 "$config/compose.power.yaml"
systemctl daemon-reload
systemctl enable --now pi-rain-radar-power.service
systemctl restart pi-rain-radar-power.service
systemctl is-active --quiet pi-rain-radar-power.service
echo 'Helper installed. From the app Compose directory, enable its optional override:'
echo 'sudo docker compose -f compose.yaml -f /etc/pi-rain-radar-power/compose.power.yaml up -d'
