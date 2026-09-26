#!/bin/sh
set -eu
: "${XDG_RUNTIME_DIR:?Desktop runtime directory is required}"
: "${WAYLAND_DISPLAY:?Wayland session is required}"
systemctl --user import-environment XDG_RUNTIME_DIR WAYLAND_DISPLAY
exec systemctl --user start pi-rain-radar-display.service
