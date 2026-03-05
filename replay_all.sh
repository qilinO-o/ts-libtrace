#!/usr/bin/env bash
set -euo pipefail

# usage: ./replay_all.sh /path/to/tracesDir
if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <tracesDir>" >&2
  exit 1
fi

tracesDir="$1"

if [[ ! -d "$tracesDir" ]]; then
  echo "Error: tracesDir is not a directory: $tracesDir" >&2
  exit 1
fi

tracesDir="$(cd "$tracesDir" && pwd)"

outDir="$tracesDir/tests"
mkdir -p "$outDir"

# only top-level file: -maxdepth 1
find "$tracesDir" -maxdepth 1 -type f -print0 | while IFS= read -r -d '' filePath; do
  echo "Replaying: $filePath"
  node ./dist/bin.js replay --as --ut "$filePath" --outDir "$outDir"
done

echo "Done. Output in: $outDir"