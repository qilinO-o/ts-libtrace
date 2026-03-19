#!/usr/bin/env bash

set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 <dir>" >&2
  exit 1
fi

dir="$1"
sampling_dir="$dir/sampling"

if [ ! -d "$dir" ]; then
  echo "Error: dir not found $dir" >&2
  exit 1
fi

if [ ! -d "$sampling_dir" ]; then
  echo "Error: sampling dir not found: $sampling_dir" >&2
  exit 1
fi

for sampled_file in "$sampling_dir"/*; do
  [ -e "$sampled_file" ] || continue

  filename="$(basename "$sampled_file")"
  target_file="$dir/$filename"

  if [ -f "$target_file" ]; then
    rm "$target_file"
    echo "Delete: $target_file"
  else
    echo "Skip: $target_file not exists"
  fi
done