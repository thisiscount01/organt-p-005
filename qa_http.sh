#!/bin/bash
DF="/tmp/qa_intake_$RANDOM.json"
INTAKE_DATA="$DF" PORT=3000 node - < server.js >/dev/null 2>&1 & sleep 1.2
B=http://localhost:3000
pass=0; fail=0
okc(){ if [ "$2" = "$3" ]; then echo "PASS $1 ($2)"; pass=$((pass+1)); else echo "FAIL $1 (got=$2 want=$3)"; fail=$((fail+1)); fi; }
has(){ if printf '%s' "$2" | grep -qF -- "$3"; then echo "PASS $1"; pass=$((pass+1)); else echo "FAIL $1"; fail=$((fail+1)); fi; }

echo "### ROUTES ###"
okc "healthz 200" "$(curl -s -o /dev/null -w %{http_code} $B/healthz)" 200
okc "index 200" "$(curl -s -o /dev/null -w %{http_code} $B/)" 200
okc "content.json 200" "$(curl -s -o /dev/null -w %{http_code} $B/content.json)" 200
okc "app.js 200" "$(curl -s -o /dev/null -w %{http_code} $B/app.js)" 200
okc "404 missing" "$(curl -s -o /dev/null -w %{http_code} $B/nope.xyz)" 404

echo "### VERBATIM FACTS (served content.json) ###"
C=$(curl -s $B/content.json)
has 'fact print(...)'         "$C" 'print("Hello, Python!")'
has 'fact PyCon 2024'         "$C" 'PyCon Korea 2024'
has 'fact PyCon 2025'         "$C" 'PyCon Korea 2025'
has 'fact defer:print(title)' "$C" 'defer: print(title)'
has 'fact EvalFrameDefault'   "$C" '_PyEval_EvalFrameDefault'
has 'fact Platinum 2.5%'      "$C" 'Platinum 4 · 상위 2.5%'
has 'fact 사이버메드'          "$C" '사이버메드'
has 'fact DICOM'              "$C" 'DICOM'
has 'fact RESUME'             "$C" 'RESUME'
has 'fact PUSH_NULL'          "$C" 'PUSH_NULL'
has 'fact refcount'           "$C" 'refcount'
has 'fact 요즘IT'             "$C" '요즘IT'

echo "### WIRING (served app.js) ###"
A=$(curl -s $B/app.js)
has 'kbd depth 1-4'      "$A" 'k >= "1" && k <= "4"'
has 'kbd arrows'         "$A" 'ArrowDown'
has 'scroll-progress'    "$A" '--scroll-progress'
has 'reduced-motion'     "$A" 'prefers-reduced-motion'
has 'aria announcer'     "$A" 'depth-announcer'
has 'throwArtifact'      "$A" 'throwArtifact'
has 'syncGet(merge)'     "$A" 'syncGet'
has 'syncPost'           "$A" 'syncPost'
has 'intake autofocus'   "$A" 'focusIntake'
has 'data-depth set'     "$A" 'data-depth'
has 'global paste'       "$A" 'clipboardData'

SUP=$(printf '%s' "$C" | python3 -c "import sys,json;d=json.load(sys.stdin);s=[x for x in d['depths'] if x['id']=='surface'][0];print(len(s['support']))")
if [ "$SUP" -le 2 ]; then echo "PASS surface support<=2 ($SUP)"; pass=$((pass+1)); else echo "FAIL surface support ($SUP)"; fail=$((fail+1)); fi

echo "### PERSISTENCE LIFECYCLE ###"
curl -s -X POST $B/api/intake -H 'Content-Type: application/json' -d '{"type":"answer","depth":"surface","content":"첫 딥다이브 이야기 A"}' >/dev/null
curl -s -X POST $B/api/intake -H 'Content-Type: application/json' -d '{"type":"artifact","kind":"code","depth":"bytecode","content":"def f():\n  return 42"}' >/dev/null
N1=$(curl -s $B/healthz | grep -oE '[0-9]+' )
okc "after 2 POSTs entries" "$N1" 2
echo "-- SEPARATE process (server restart sim) on :3001 reading same data file --"
INTAKE_DATA="$DF" PORT=3001 node - < server.js >/dev/null 2>&1 & sleep 1.2
N2=$(curl -s http://localhost:3001/healthz | grep -oE '[0-9]+')
okc "RESTART sees persisted" "$N2" 2
DID=$(curl -s $B/api/intake | grep -oE 'e_[a-z0-9]+' | head -1)
curl -s -X DELETE $B/api/intake/$DID >/dev/null
N3=$(curl -s $B/healthz | grep -oE '[0-9]+')
okc "after DELETE entries" "$N3" 1
# cross-check: :3001 (other process) also reflects delete on its next read
N4=$(curl -s http://localhost:3001/api/intake | grep -oc 'e_[a-z0-9]*')

echo
echo "=== SUMMARY pass=$pass fail=$fail ==="