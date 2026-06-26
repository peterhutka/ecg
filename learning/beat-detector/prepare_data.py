from __future__ import annotations

import random
import time
from datetime import datetime
from pathlib import Path

from beat_detector_config import (
    OFFSET_MAX_MS,
    OFFSET_MIN_MS,
    OUTPUT_ROOT,
    RANDOM_SEED,
    SOURCE_PATHS,
    SAMPLES_PER_BEAT,
    TARGET_SAMPLING_RATE_HZ,
    WINDOW_SECONDS,
)
from beat_detector_generation import discover_record_bases, process_record
from beat_detector_wfdb import load_record_metadata
from beat_detector_output import write_summary
from beat_detector_reporting import build_run_header, build_summary_lines, format_repo_path


OUTLINE = f"""Input paths: {', '.join(format_repo_path(path) for path in SOURCE_PATHS)}
Output root: {format_repo_path(OUTPUT_ROOT)}
Samples per beat: {SAMPLES_PER_BEAT}
Window seconds: {WINDOW_SECONDS}
Target sampling rate: {TARGET_SAMPLING_RATE_HZ}
Offset range ms: {OFFSET_MIN_MS}..{OFFSET_MAX_MS}

Plan:
  1. discover WFDB records from the source paths
  2. load header and atr metadata
  3. choose a normal beat and plan a chunk
  4. load, resample, and label the chunk
  5. save .dat and .json outputs"""


def discover_selected_records() -> list[Path]:
    return discover_record_bases(list(SOURCE_PATHS))


def count_total_attempts(records: list[Path]) -> int:
    total = 0
    for record_base in records:
        _, annotations, _ = load_record_metadata(record_base)
        total += sum(1 for annotation in annotations if annotation.symbol == "N") * SAMPLES_PER_BEAT
    return total


def finish_run(
    summary_path,
    record_summaries,
    overall_signals: int,
    overall_normal_beats: int,
    overall_examples: int,
    elapsed_seconds: float,
) -> None:
    report_lines = build_summary_lines(
        record_summaries,
        len(record_summaries),
        overall_signals,
        overall_normal_beats,
        overall_examples,
        elapsed_seconds,
    )
    write_summary(summary_path, report_lines)


def main() -> None:
    """Generate a small supervised beat dataset from WFDB recordings."""
    print(OUTLINE, end="\n\n")

    run_timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    run_dir = OUTPUT_ROOT / f"run_{run_timestamp}"
    summary_path = OUTPUT_ROOT / f"outputdata_{run_timestamp}.txt"
    run_dir.mkdir(parents=True, exist_ok=True)

    records_to_process = discover_selected_records()
    if not records_to_process:
        raise SystemExit("No recordings selected for processing.")

    rng = random.Random(RANDOM_SEED)
    start_time = time.monotonic()
    total_attempts_target = count_total_attempts(records_to_process)
    completed_attempts = 0
    example_id = 1
    overall_examples = 0
    overall_normal_beats = 0
    overall_signals = 0
    record_summaries = []
    report_lines = build_run_header(run_timestamp, run_dir, records_to_process)

    for record_index, record_name in enumerate(records_to_process, start=1):
        (
            record_summary,
            example_id,
            completed_attempts,
            record_examples,
            record_signals,
            record_normal_beats,
            lines,
        ) = process_record(
            record_index,
            len(records_to_process),
            record_name,
            rng,
            start_time,
            total_attempts_target,
            completed_attempts,
            run_dir,
            example_id,
        )
        record_summaries.append(record_summary)
        overall_examples += record_examples
        overall_signals += record_signals
        overall_normal_beats += record_normal_beats
        report_lines.extend(lines)

    elapsed_seconds = time.monotonic() - start_time
    finish_run(summary_path, record_summaries, overall_signals, overall_normal_beats, overall_examples, elapsed_seconds)
    print(f"Summary written to {summary_path}")
    print(f"Run directory: {format_repo_path(run_dir)}")


if __name__ == "__main__":
    main()
