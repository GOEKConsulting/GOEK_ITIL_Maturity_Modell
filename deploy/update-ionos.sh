#!/usr/bin/env bash
# Update only the GÖK frontend; retain PocketBase, accounts, shared data and TLS.
# Run as root in the existing SSH session. No passwords belong in this script.
# Frontend target is pinned; the legacy install.sh must NOT be rerun for updates.
set -Eeuo pipefail
umask 077
BASE=/opt/goek-itil
TARGET=4d433e40179507eb57e2d931b0e1acf8e7672d7f
STAMP=$(date -u +%Y%m%dT%H%M%SZ)-$$
BACKUP=/var/backups/goek-itil/$STAMP
WORK=
STOPPED=0
SWITCHED=0
DONE=0
exec 9>/run/lock/goek-itil-update.lock
flock -n 9 || { echo "Another ITIL update is running."; exit 1; }

finish() {
  rc=$?
  trap - EXIT
  if [ "$DONE" -ne 1 ]; then
    set +e
    if [ "$SWITCHED" -eq 1 ]; then
      systemctl stop goek-itil
      if [ -e "$BASE/public" ]; then
        mv "$BASE/public" "$WORK/failed-public"
      fi
      if [ ! -e "$BASE/public" ] && [ -d "$BACKUP/public" ]; then
        mv "$BACKUP/public" "$BASE/public"
        echo "Previous frontend restored."
      else
        echo "WARNING: automatic frontend restoration failed; inspect $BACKUP and $WORK."
      fi
    fi
    if [ "$STOPPED" -eq 1 ]; then
      systemctl start goek-itil
      systemctl is-active goek-itil
    fi
    echo "UPDATE NOT COMPLETED. Diagnostics/staging: $WORK"
    echo "Backup (if created): $BACKUP"
    if [ "$rc" -eq 0 ]; then rc=1; fi
  fi
  exit "$rc"
}
trap finish EXIT

[ "$(id -u)" -eq 0 ] || { echo "Run as root."; exit 1; }
for cmd in git tar python3 curl flock systemctl nginx; do command -v "$cmd" >/dev/null; done
[ -d "$BASE/source/.git" ] && [ -d "$BASE/public" ] && [ ! -L "$BASE/public" ]
[ -f "$BASE/verify.py" ] && [ -x "$BASE/pocketbase" ]
systemctl is-active --quiet goek-itil
nginx -t
[ -z "$(git -C "$BASE/source" status --porcelain)" ] || {
  echo "Source checkout has local changes; update stopped without changing deployment."
  exit 1
}
REMOTE=$(git -C "$BASE/source" remote get-url origin)
case "$REMOTE" in
  https://github.com/GOEKConsulting/GOEK_ITIL_Maturity_Modell|https://github.com/GOEKConsulting/GOEK_ITIL_Maturity_Modell.git) ;;
  *) echo "Unexpected Git remote; stopped."; exit 1 ;;
esac

WORK=$(mktemp -d "$BASE/.update-$STAMP.XXXXXX")
STAGE=$WORK/public
mkdir "$STAGE"
git -C "$BASE/source" fetch --no-tags origin main
git -C "$BASE/source" cat-file -e "$TARGET^{commit}"
git -C "$BASE/source" archive "$TARGET" | tar -x -C "$STAGE"
for name in server-loader.js sharing.html sharing.js; do
  test -f "$BASE/public/$name"
  cp -a "$BASE/public/$name" "$STAGE/$name"
done

python3 - "$STAGE" "$TARGET" <<'PY'
from pathlib import Path
import json, re, sys
p, sha = Path(sys.argv[1]), sys.argv[2]
main = (p / "main.js").read_text()
index = (p / "index.html").read_text()
loader = (p / "server-loader.js").read_text()
match = re.search(r"""\bKEY\s*=\s*(['"])(.*?)\1""", loader)
assert match, "Existing server loader storage key not recognized"
key = match.group(2)
for needle in (
    "function persistWorkspace(){",
    "localStorage.setItem(STORAGE_KEY,JSON.stringify(workspace));",
):
    assert main.count(needle) == 1, "Frontend adapter marker changed: " + needle
assert index.count('src="./main.js"') == 1, "Unexpected HTML entry point"
assert loader.count("import('./main.js')") == 1, "Unexpected server loader entry point"
main, count = re.subn(
    r"const STORAGE_KEY='[^']+';",
    "const STORAGE_KEY=" + json.dumps(key) + ";",
    main,
)
assert count == 1, "Unexpected frontend storage key"
main = main.replace("function persistWorkspace(){", "async function persistWorkspace(){", 1)
main = main.replace(
    "localStorage.setItem(STORAGE_KEY,JSON.stringify(workspace));",
    "await window.goekPersistWorkspace(workspace);", 1,
)
main = main.replace("aus diesem Browser", "aus dem gemeinsamen Arbeitsstand")
main = main.replace("im Browser entfernt", "im gemeinsamen Arbeitsstand entfernt")
loader = loader.replace("import('./main.js')", "import('./main.js?v=" + sha + "')", 1)
index = index.replace('src="./main.js"', 'src="./server-loader.js?v=' + sha + '"', 1)
(p / "main.js").write_text(main)
(p / "server-loader.js").write_text(loader)
(p / "index.html").write_text(index)
(p / "DEPLOYED_COMMIT").write_text(sha + "\n")
for js in p.glob("*.js"):
    for path in re.findall(r"""(?:from\s+|import\s*\()\s*['"](\./[^'"]+)['"]""", js.read_text()):
        assert (js.parent / path.split("?", 1)[0]).is_file(), "Missing module: " + path
for name in ("pdf-report.js", "pdf-report-model.js", "improvement-plan.js",
             "vendor/jspdf.umd.min.js", "assets/goek-logo-report.png"):
    assert (p / name).is_file(), "Missing new frontend file: " + name
assert "await window.goekPersistWorkspace(workspace);" in main
assert "src=\"./server-loader.js?v=" in index
print("PASS: new frontend files, module paths and central storage adapter")
PY

# Existing integration suite uses an isolated temporary DB, never production.
python3 "$BASE/verify.py" "$BASE"
chown -R root:root "$STAGE"
chmod -R a+rX "$STAGE"
mkdir -p "$BACKUP"
chmod 700 "$BACKUP"

# Stop the app briefly for a consistent SQLite/data backup.
systemctl stop goek-itil
STOPPED=1
tar -C / -czf "$BACKUP/server-before.tgz" \
  var/lib/goek-itil \
  opt/goek-itil/pb_hooks \
  opt/goek-itil/pb_migrations \
  etc/nginx/sites-available/goek-itil \
  etc/letsencrypt \
  etc/systemd/system/goek-itil.service
mv "$BASE/public" "$BACKUP/public"
SWITCHED=1
mv "$STAGE" "$BASE/public"
systemctl start goek-itil

for attempt in $(seq 1 15); do
  if curl --fail --silent --max-time 3 http://127.0.0.1:8090/api/health >/dev/null; then break; fi
  sleep 1
done
curl --fail --silent --show-error --max-time 15 \
  --resolve itil.goek.consulting:443:127.0.0.1 \
  https://itil.goek.consulting/api/health
echo
SERVED=$(curl --fail --silent --show-error --max-time 15 \
  --resolve itil.goek.consulting:443:127.0.0.1 \
  https://itil.goek.consulting/DEPLOYED_COMMIT)
[ "$SERVED" = "$TARGET" ]
systemctl is-active --quiet goek-itil
DONE=1
echo "UPDATE OK: $TARGET"
echo "Previous frontend: $BACKUP/public"
echo "Consistent data/config backup: $BACKUP/server-before.tgz"
echo "Open https://itil.goek.consulting/ and press Ctrl+F5."
echo "Still verify interactively: login, shared project save/reload, PDF report."
