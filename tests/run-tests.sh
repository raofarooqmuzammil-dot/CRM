#!/usr/bin/env bash
# Runs the logic tests with plain Node (no database needed). Usage: bash tests/run-tests.sh
set -e
here=$(cd "$(dirname "$0")" && pwd); root=$(cd "$here/.." && pwd); tmp=$(mktemp -d)
cp -r "$root/lib" "$tmp/lib"; cp "$here"/*.mjs "$tmp"/; echo '{"type":"module"}' > "$tmp/package.json"
# let plain Node import the project's files
sed -i "s#from '\./\([a-z]*\)'#from './\1.js'#" "$tmp"/lib/*.js
for f in import quickadd grid results team lists; do
  sed -e "s#^'use server';##" \
      -e "s#^import { redirect }.*#const redirect = (u) => { const e = new Error('REDIRECT'); e.url = u; throw e; };#" \
      -e "s#^import { revalidatePath }.*#const revalidatePath = () => {};#" \
      -e "s#^import { createClient }.*#const createClient = () => globalThis.__sb;#" \
      -e "s#^import { createAdminClient }.*#const createAdminClient = () => globalThis.__admin;#" \
      -e "s#'\.\./\.\./lib/\([a-z/]*\)'#'./lib/\1.js'#" \
      "$root/app/actions/$f.js" > "$tmp/$f.mjs"
done
fail=0; cd "$tmp"
for t in *.test.mjs; do
  out=$(node "$t" 2>&1) && ok=1 || ok=0
  if echo "$out" | grep -q "FAIL" || [ $ok = 0 ]; then echo "FAILED  $t"; echo "$out" | grep -E "FAIL|Error" | head -8; fail=1; else echo "passed  $t ($(echo "$out" | grep -c '^ok') checks)"; fi
done
exit $fail
