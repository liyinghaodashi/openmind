#!/bin/sh
set -eu
project_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
probe_dir=$(mktemp -d "${TMPDIR:-/tmp}/openmind-caret.XXXXXX")
trap 'rm -rf "$probe_dir"' EXIT
node --input-type=module - "$project_dir" "$probe_dir/index.html" <<'JS'
import {readFileSync,writeFileSync} from 'node:fs';
const [root,output]=process.argv.slice(2);
const style=process.env.OPENMIND_MIND_STYLE||'processon';
if(!['processon','mindnode'].includes(style))throw new Error('Invalid mind style');
const css=[`styles/app.css`,`styles/caret.css`,`src/mind-styles/${style}/style.css`].map(name=>readFileSync(`${root}/frontend/${name}`,'utf8')).join('\n');
const source=readFileSync(`${root}/frontend/src/features/global-caret.js`,'utf8').replace('export function mountGlobalCaret','function mountGlobalCaret');
const checks=readFileSync(`${root}/frontend/test/node-caret.webkit.js`,'utf8');
writeFileSync(output,`<!doctype html><meta charset="utf-8"><style>${css}</style><body data-mind-style="${style}"><script>${source}\n${checks}</script>`);
JS
clang -framework Cocoa -framework WebKit "$project_dir/scripts/test-node-caret.m" -o "$probe_dir/caret-probe"
"$probe_dir/caret-probe" "$probe_dir/index.html"
