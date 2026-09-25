#!/bin/sh
# Instala o comando `goodbizz` no seu PATH.
#
#   ./instalar.sh                 instala em ~/bin
#   ./instalar.sh --bin ~/.local/bin
#   ./instalar.sh --uninstall     remove
#
# Nao mexe no seu shell rc: so cria o link e avisa se a pasta nao estiver no PATH.
set -eu

AQUI=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
ALVO="$AQUI/bin/goodbizz"
BIN="${BIN_DIR:-$HOME/bin}"
REMOVER=0

while [ $# -gt 0 ]; do
  case "$1" in
    --bin) BIN="$2"; shift 2 ;;
    --bin=*) BIN="${1#--bin=}"; shift ;;
    --uninstall|--remover) REMOVER=1; shift ;;
    -h|--help)
      sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'
      exit 0 ;;
    *) echo "opcao desconhecida: $1" >&2; exit 2 ;;
  esac
done

LINK="$BIN/goodbizz"

if [ "$REMOVER" = 1 ]; then
  if [ -L "$LINK" ]; then
    rm -f "$LINK"
    echo "removido: $LINK"
  else
    echo "nada a remover em $LINK"
  fi
  exit 0
fi

[ -f "$ALVO" ] || { echo "nao encontrei $ALVO" >&2; exit 1; }
[ -x "$ALVO" ] || chmod +x "$ALVO"

# nao sobrescreve arquivo que nao seja nosso
if [ -e "$LINK" ] && [ ! -L "$LINK" ]; then
  echo "ja existe um arquivo em $LINK e ele nao e um link nosso." >&2
  echo "mova ou remova esse arquivo antes de instalar." >&2
  exit 1
fi

mkdir -p "$BIN"
ln -sfn "$ALVO" "$LINK"
echo "instalado: $LINK -> $ALVO"

# checagens de ambiente, sem falhar o install
if command -v python3 >/dev/null 2>&1; then
  VER=$(python3 -c 'import sys; print("%d.%d" % sys.version_info[:2])')
  echo "python3: $VER"
  python3 -c 'import sys; raise SystemExit(0 if sys.version_info >= (3,10) else 1)' 2>/dev/null \
    || echo "AVISO: precisa de python 3.10+ e este e o $VER"
else
  echo "AVISO: nao encontrei python3 no PATH"
fi

case ":$PATH:" in
  *":$BIN:"*) ;;
  *) echo "AVISO: $BIN nao esta no seu PATH. Adicione ao ~/.zshrc:"
     echo "         export PATH=\"$BIN:\$PATH\"" ;;
esac

if command -v chromium >/dev/null 2>&1 || command -v chromium-browser >/dev/null 2>&1 \
   || command -v google-chrome >/dev/null 2>&1; then
  echo "chromium: encontrado (usado para gerar o PDF com --pdf)"
else
  echo "AVISO: sem chromium, o --pdf nao funciona (o .md e o .html continuam saindo)"
fi

VAR=$(env | grep -c '^GOODBIZZ_' || true)
if [ "$VAR" -gt 0 ]; then
  echo "credenciais: $VAR variavel(is) GOODBIZZ_* no ambiente"
else
  echo "credenciais: nenhuma GOODBIZZ_* no ambiente — use --mock para testar sem chave"
fi

cat <<'FIM'

pronto. teste com:

    goodbizz ajuda
    goodbizz gerar "any niche" --ideias 3 --mock

sem credencial nenhuma, use --mock. Com credencial, exporte as GOODBIZZ_* ou use as flags --decisor-* e --llm-*.
FIM
