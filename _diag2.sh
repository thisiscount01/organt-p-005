#!/bin/bash
for b in chromium chromium-browser google-chrome google-chrome-stable headless_shell chrome; do
  p=$(command -v $b 2>/dev/null)
  [ -n "$p" ] && echo "FOUND $b -> $p"
done
echo "--- glob playwright chromium cache ---"
ls -d /root/.cache/ms-playwright/chromium*/chrome-linux/chrome 2>/dev/null | head
ls -d ~/.cache/ms-playwright/chromium*/chrome-linux/chrome 2>/dev/null | head
echo "--- node global ---"
npm root -g 2>/dev/null
echo "done"
