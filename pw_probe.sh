#!/bin/bash
for PY in /root/ClaudeCompany/.venv/bin/python /root/_archive/PJT/.venv/bin/python /usr/bin/python3; do
  echo "== $PY"
  [ -x "$PY" ] && echo "exists" || echo "MISSING"
  "$PY" -c "import playwright, sys; print('PW', sys.version.split()[0])" 2>&1 | tail -1
done
