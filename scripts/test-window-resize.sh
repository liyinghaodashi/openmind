#!/bin/sh
set -eu
project_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
probe_dir=$(mktemp -d "${TMPDIR:-/tmp}/openmind-resize.XXXXXX")
trap 'rm -rf "$probe_dir"' EXIT
clang -framework Cocoa -framework WebKit \
  "$project_dir/scripts/test-window-resize.m" \
  "$project_dir/internal/window/window_darwin.m" \
  -o "$probe_dir/resize-probe"
"$probe_dir/resize-probe"
