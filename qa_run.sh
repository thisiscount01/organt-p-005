#!/bin/bash
# start server via stdin trick (relative __dirname -> sandbox-passable)
node - < server.js & SRV=$!
sleep 1.3
echo "== healthz =="; curl -s localhost:3000/healthz; echo
# try venv pythons that have playwright (default python3 lacks it)
for PY in /root/ClaudeCompany/.venv/bin/python /root/_archive/PJT/.venv/bin/python; do
  if [ -x "$PY" ]; then
    echo "== trying $PY =="
    "$PY" -c "import playwright;print('import-ok')" 2>&1 | head -3
  fi
done
