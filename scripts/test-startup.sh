#!/bin/sh
set -eu
project_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
if [ "$#" -ne 2 ]; then
  printf 'Usage: sh scripts/test-startup.sh /path/OpenMind.app /path/document.md\nRuns a real cold file-open and quits the app; the opened folder enters recent workspaces.\n' >&2
  exit 2
fi
probe_dir=$(mktemp -d "${TMPDIR:-/tmp}/openmind-startup.XXXXXX")
trap 'rm -rf "$probe_dir"' EXIT
clang -fobjc-arc -framework Cocoa -framework CoreGraphics \
  "$project_dir/scripts/test-startup.m" -o "$probe_dir/startup-probe"
"$probe_dir/startup-probe" "$1" "$2"
