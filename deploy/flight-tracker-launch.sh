#!/usr/bin/env bash
set -e

# Ensure both the Wayland compositor and Chromium request the installed
# transparent cursor theme before the kiosk window is created.
export XCURSOR_THEME=transparent
export XCURSOR_SIZE=24

# Wait until the UI is responding.
until curl -sf http://127.0.0.1:8080 >/dev/null; do
  sleep 1
done

exec chromium \
  --app=http://127.0.0.1:8080 \
  --start-maximized \
  --noerrdialogs \
  --disable-infobars \
  --user-data-dir=/home/memerson/.config/chromium-flighttracker \
  --no-first-run \
  --disable-features=PasswordManagerEnabled \
  --password-store=basic \
  --use-mock-keychain \
  --hide-scrollbars \
  --start-fullscreen
