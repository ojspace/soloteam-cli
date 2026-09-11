#!/usr/bin/env sh
# soloteam-cli installer — downloads the standalone binary for your platform.
# No Node, no Bun, no registry needed.
#
#   curl -fsSL https://raw.githubusercontent.com/ojspace/soloteam-cli/main/install.sh | bash
#   curl -fsSL .../install.sh | bash -s -- v0.3.0   # pin a version (default: latest)
#   curl -fsSL .../install.sh | bash -s -- --dir ~/.bin   # custom install dir
set -eu

REPO="ojspace/soloteam-cli"
VERSION="latest"
BIN_DIR=""

while [ $# -gt 0 ]; do
  case "$1" in
    --dir)
      BIN_DIR="${2:?--dir needs a path}"
      shift 2
      ;;
    --dir=*)
      BIN_DIR="${1#--dir=}"
      shift
      ;;
    *)
      VERSION="$1"
      shift
      ;;
  esac
done

if [ -z "$BIN_DIR" ]; then
  BIN_DIR="${HOME}/.local/bin"
fi

OS="$(uname -s)"
ARCH="$(uname -m)"
case "${OS}-${ARCH}" in
  Darwin-arm64)  PLATFORM="darwin-arm64" ;;
  Darwin-x86_64) PLATFORM="darwin-x64" ;;
  Linux-x86_64)  PLATFORM="linux-x64" ;;
  Linux-aarch64 | Linux-arm64) PLATFORM="linux-arm64" ;;
  *)
    echo "Unsupported platform: ${OS} ${ARCH} (need macOS/Linux on arm64/x86_64)" >&2
    exit 1
    ;;
esac

if [ "$VERSION" = "latest" ]; then
  URL="https://github.com/${REPO}/releases/latest/download/soloteam-${PLATFORM}"
else
  URL="https://github.com/${REPO}/releases/download/${VERSION}/soloteam-${PLATFORM}"
fi

mkdir -p "$BIN_DIR"
TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT INT TERM

echo "Downloading soloteam ${VERSION} (${PLATFORM})..."
if command -v curl >/dev/null 2>&1; then
  curl -fsSL "$URL" -o "$TMP"
elif command -v wget >/dev/null 2>&1; then
  wget -qO "$TMP" "$URL"
else
  echo "Need curl or wget to download the binary." >&2
  exit 1
fi

chmod +x "$TMP"
mv "$TMP" "${BIN_DIR}/soloteam"
echo "Installed to ${BIN_DIR}/soloteam"

case ":${PATH}:" in
  *":${BIN_DIR}:"*) ;;
  *)
    echo ""
    echo "NOTE: ${BIN_DIR} is not on your PATH. Add it:"
    echo "  export PATH=\"${BIN_DIR}:\$PATH\""
    ;;
esac

"${BIN_DIR}/soloteam" --help >/dev/null 2>&1 && echo "Verified: soloteam runs. Start with: soloteam init --local"
