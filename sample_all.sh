#!/usr/bin/env bash
set -euo pipefail

# usage: ./sample_all.sh /path/to/tracesDir
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

# only top-level file: -maxdepth 1
find "$tracesDir" -maxdepth 1 -type f -print0 | while IFS= read -r -d '' filePath; do
  echo "Sampling: $filePath"
  python3 ./sample_jsonl.py $filePath --sample-size 4 --short-threshold 500 --seed 42
done

echo "Done."