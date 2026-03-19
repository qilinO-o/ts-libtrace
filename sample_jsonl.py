#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import argparse
import random
from pathlib import Path


def count_text_length(line: str) -> int:
    return len(line.strip())


def read_nonempty_lines(file_path: Path) -> list[str]:
    content = file_path.read_text(encoding="utf-8")
    lines = content.splitlines()

    start = 0
    end = len(lines)

    while start < end and lines[start].strip() == "":
        start += 1
    while end > start and lines[end - 1].strip() == "":
        end -= 1

    return lines[start:end]


def group_lines(lines: list[str]) -> list[tuple[str, str]]:
    if len(lines) % 2 != 0:
        raise ValueError(
            f"non-empty line num {len(lines)} is not even, cannot process"
        )

    groups = []
    for i in range(0, len(lines), 2):
        groups.append((lines[i], lines[i + 1]))
    return groups


def sample_groups(
    groups: list[tuple[str, str]],
    sample_size: int,
    short_threshold: int,
    seed: int | None = None,
) -> list[tuple[str, str]]:
    if seed is not None:
        random.seed(seed)

    if len(groups) <= sample_size:
        return groups

    short_groups = []
    long_groups = []

    for group in groups:
        len1 = count_text_length(group[0])
        len2 = count_text_length(group[1])

        if len1 < short_threshold and len2 < short_threshold:
            short_groups.append(group)
        else:
            long_groups.append(group)

    selected = []

    if len(short_groups) >= sample_size:
        selected = random.sample(short_groups, sample_size)
    else:
        selected.extend(short_groups)
        remaining = sample_size - len(selected)
        if remaining > 0:
            selected.extend(random.sample(long_groups, remaining))

    return selected


def write_output(
    input_path: Path,
    sampled_groups: list[tuple[str, str]],
) -> Path:
    output_dir = input_path.parent / "sampling"
    output_dir.mkdir(parents=True, exist_ok=True)

    output_path = output_dir / input_path.name

    with output_path.open("w", encoding="utf-8") as f:
        for line1, line2 in sampled_groups:
            f.write(line1.rstrip("\n") + "\n")
            f.write(line2.rstrip("\n") + "\n")

    return output_path


def parse_args():
    parser = argparse.ArgumentParser(
        description="Sample trace jsonl"
    )
    parser.add_argument(
        "input_file",
        type=str,
        help="imput jsonl file path",
    )
    parser.add_argument(
        "--sample-size",
        type=int,
        default=5,
        help="sample size, default to 5",
    )
    parser.add_argument(
        "--short-threshold",
        type=int,
        default=500,
        help="first sample those line length < short threshold, default to 500",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=None,
        help="random seed",
    )
    return parser.parse_args()


def main():
    args = parse_args()

    input_path = Path(args.input_file)
    if not input_path.is_file():
        raise FileNotFoundError(f"input file not found: {input_path}")

    lines = read_nonempty_lines(input_path)
    groups = group_lines(lines)

    sampled_groups = sample_groups(
        groups=groups,
        sample_size=args.sample_size,
        short_threshold=args.short_threshold,
        seed=args.seed,
    )

    output_path = write_output(input_path, sampled_groups)

    print(f"input file   : {input_path}")
    print(f"All groups   : {len(groups)}")
    print(f"Sample groups: {len(sampled_groups)}")
    print(f"output file  : {output_path}")


if __name__ == "__main__":
    main()