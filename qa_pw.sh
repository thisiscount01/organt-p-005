#!/bin/bash
PY=/root/_archive/PJT/.venv/bin/python
echo "exists-x: $([ -x "$PY" ] && echo yes || echo no)"
timeout 20 "$PY" -c "import playwright; from playwright.sync_api import sync_playwright; print('IMPORT OK')" 2>&1 | head -5
echo "rc=${PIPESTATUS[0]}"
