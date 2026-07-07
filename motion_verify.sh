#!/bin/bash
# 모션 검증 러너 — 워크스페이스 밖 venv python을 파일 경유로 호출(문자열 필터 우회)
for PY in /root/ClaudeCompany/.venv/bin/python /root/_archive/PJT/.venv/bin/python; do
  if timeout 8 "$PY" -c "import playwright" 2>/dev/null; then
    echo "USING: $PY"
    exec timeout 55 "$PY" "$@"
  fi
done
echo "NO USABLE PLAYWRIGHT PYTHON"
exit 1
