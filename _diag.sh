#!/bin/bash
id
echo "--- whoami: $(whoami) ---"
for PY in /root/ClaudeCompany/.venv/bin/python /root/_archive/PJT/.venv/bin/python; do
  echo "== $PY =="
  ls -l "$PY" 2>&1 | head -1
  "$PY" -c "import playwright; print('import ok', playwright.__file__)" 2>&1 | head -3
done
