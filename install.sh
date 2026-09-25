#!/bin/sh
# Installs the `goodbizz` command into your PATH.
#
#   ./install.sh                 installs in ~/bin
#   ./install.sh --bin ~/.local/bin
#   ./install.sh --uninstall     removes link
#
# Does not modify shell rc files: creates symlink and warns if directory is not in PATH.
set -eu

HERE=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
TARGET="$HERE/bin/goodbizz"
BIN="${BIN_DIR:-$HOME/bin}"
REMOVE=0

while [ $# -gt 0 ]; do
  case "$1" in
    --bin) BIN="$2"; shift 2 ;;
    --bin=*) BIN="${1#--bin=}"; shift ;;
    --uninstall|--remove|--remover) REMOVE=1; shift ;;
    -h|--help)
      sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'
      exit 0 ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
done

LINK="$BIN/goodbizz"

if [ "$REMOVE" = 1 ]; then
  if [ -L "$LINK" ]; then
    rm -f "$LINK"
    echo "removed: $LINK"
  else
    echo "nothing to remove at $LINK"
  fi
  exit 0
fi

[ -f "$TARGET" ] || { echo "target not found: $TARGET" >&2; exit 1; }
[ -x "$TARGET" ] || chmod +x "$TARGET"

if [ -e "$LINK" ] && [ ! -L "$LINK" ]; then
  echo "a non-symlink file already exists at $LINK." >&2
  echo "move or remove it before installing." >&2
  exit 1
fi

mkdir -p "$BIN"
ln -sfn "$TARGET" "$LINK"
echo "installed: $LINK -> $TARGET"

# Environment checks
if command -v python3 >/dev/null 2>&1; then
  VER=$(python3 -c 'import sys; print("%d.%d" % sys.version_info[:2])')
  echo "python3: $VER"
  python3 -c 'import sys; raise SystemExit(0 if sys.version_info >= (3,10) else 1)' 2>/dev/null \
    || echo "WARNING: requires python 3.10+ (found $VER)"
else
  echo "WARNING: python3 not found in PATH"
fi

case ":$PATH:" in
  *":$BIN:"*) ;;
  *) echo "WARNING: $BIN is not in your PATH. Add it to ~/.zshrc or ~/.bashrc:"
     echo "         export PATH=\"$BIN:\$PATH\"" ;;
esac

if command -v chromium >/dev/null 2>&1 || command -v chromium-browser >/dev/null 2>&1 \
   || command -v google-chrome >/dev/null 2>&1; then
  echo "chromium: found (used for PDF generation with --pdf)"
else
  echo "NOTE: without chromium, --pdf will not work (markdown and html are still generated)"
fi

VAR=$(env | grep -c '^GOODBIZZ_' || true)
if [ "$VAR" -gt 0 ]; then
  echo "credentials: $VAR GOODBIZZ_* variable(s) found in environment"
else
  echo "credentials: none found in environment — use --mock to test without credentials"
fi

cat <<'EOF'

Ready. Test with:

    goodbizz help
    goodbizz generate "any niche" --ideas 3 --mock

To run without credentials, use --mock.
With credentials, set GOODBIZZ_* environment variables or use --decider-* and --llm-* CLI flags.
EOF
