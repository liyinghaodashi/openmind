#!/bin/sh
set -eu

project_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$project_dir"

target_arch=${1:-arm64}
case "$target_arch" in
  arm64|amd64) ;;
  *) printf 'Unsupported macOS architecture: %s\n' "$target_arch" >&2; exit 1 ;;
esac

if command -v wails >/dev/null 2>&1; then
  wails_bin=$(command -v wails)
else
  wails_bin="$(go env GOPATH)/bin/wails"
fi

if [ ! -x "$wails_bin" ]; then
  printf 'Wails v2.15.0 is required. Install it with: go install github.com/wailsapp/wails/v2/cmd/wails@v2.15.0\n' >&2
  exit 1
fi

CGO_CFLAGS="${CGO_CFLAGS:-} -mmacosx-version-min=13.0" \
CGO_LDFLAGS="${CGO_LDFLAGS:-} -mmacosx-version-min=13.0" \
  "$wails_bin" build -platform "darwin/$target_arch" -trimpath
