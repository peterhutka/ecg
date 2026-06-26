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
from beat_detector_examples import build_metadata, select_first_normal_beat_after_start
from beat_detector_output import write_example, write_summary
from beat_detector_reporting import (
    build_attempt_line,
    build_record_header,
    build_run_header,
    build_saved_line,
    build_summary_lines,
)
from beat_detector_types import RecordSummary
from beat_detector_wfdb import load_record_chunk, load_record_metadata, resample_chunk
from chunk_window import plan_chunk_window
from sample_index_math import map_old_sample_to_new_sample


def discover_record_bases(source_paths: list[Path]) -> list[Path]:
    """Return record base paths from file inputs or one-level directory scans."""
    record_bases: list[Path] = []
    seen: set[str] = set()

    for source_path in source_paths:
        if source_path.is_dir():
            for header_path in sorted(source_path.glob("*.hea")):
                record_base = header_path.with_suffix("")
                key = str(record_base)
                if key not in seen:
                    seen.add(key)
                    record_bases.append(record_base)
            continue

        if source_path.is_file():
            record_base = source_path.with_suffix("")
            key = str(record_base)
            if key not in seen:
                seen.add(key)
                record_bases.append(record_base)
            continue

        if source_path.suffix in {".hea", ".dat", ".atr"}:
            record_base = source_path.with_suffix("")
            key = str(record_base)
            if key not in seen:
                seen.add(key)
                record_bases.append(record_base)
            continue

        candidate_header = source_path.with_suffix(".hea")
        if candidate_header.exists():
            record_base = source_path.with_suffix("")
            key = str(record_base)
            if key not in seen:
                seen.add(key)
                record_bases.append(record_base)

    return record_bases


def count_total_attempts(records_to_process: list[Path]) -> int:
    total = 0
    for record_base in records_to_process:
        _, annotations, _ = load_record_metadata(record_base)
        total += sum(1 for annotation in annotations if annotation.symbol == "N") * SAMPLES_PER_BEAT
    return total


def process_record(
    record_index: int,
    total_records: int,
    record_base: Path,
    rng: random.Random,
    start_time: float,
    total_attempts_target: int,
    completed_attempts: int,
    run_dir: Path,
    example_id: int,
) -> tuple[RecordSummary, int, int, int, int, int, list[str]]:
    record_name = record_base.name
    header, annotations, signal_summaries = load_record_metadata(record_base)
    sampling_rate_hz = float(getattr(header, "fs", 0.0))
    sample_count = int(getattr(header, "sig_len", 0))
    signal_count = int(getattr(header, "n_sig", len(signal_summaries)))
    normal_beats = [annotation for annotation in annotations if annotation.symbol == "N"]
    record_summary = RecordSummary(record_name, signal_count, len(normal_beats), signal_summaries=signal_summaries)
    report_lines = build_record_header(
        record_index,
        total_records,
        record_name,
        signal_count,
        len(normal_beats),
        sample_count,
        sampling_rate_hz,
    )

    overall_examples = 0
    overall_signals = signal_count
    overall_normal_beats = len(normal_beats)

    if not normal_beats:
        report_lines.extend(["  no normal beats found, skipped", ""])
        return (
            record_summary,
            example_id,
            completed_attempts,
            overall_examples,
            overall_signals,
            overall_normal_beats,
            report_lines,
        )

    attempt_index = 0
    total_attempts = max(1, len(normal_beats) * SAMPLES_PER_BEAT)

    for beat in normal_beats:
        for _ in range(SAMPLES_PER_BEAT):
            attempt_index += 1
            record_summary.attempts += 1
            completed_attempts += 1
            window = plan_chunk_window(
                beat_sample=beat.sample,
                offset_min_ms=OFFSET_MIN_MS,
                offset_max_ms=OFFSET_MAX_MS,
                chunk_length_seconds=WINDOW_SECONDS,
                sampling_rate_hz=sampling_rate_hz,
                record_length_samples=sample_count,
                offset_fraction=rng.random(),
            )
            progress = completed_attempts / max(1, total_attempts_target)
            elapsed = time.monotonic() - start_time
            eta = elapsed / progress - elapsed if progress > 0 else 0.0

            if window is None:
                record_summary.skipped_window_out_of_bounds += 1
                message = build_attempt_line(attempt_index, total_attempts, "skip window out of bounds", eta)
                print(message, flush=True)
                report_lines.append(message)
                continue

            chunk = load_record_chunk(record_base, window.start_sample, window.end_sample)
            if chunk.size == 0:
                record_summary.skipped_decode_or_format += 1
                message = build_attempt_line(attempt_index, total_attempts, "skip empty chunk", eta)
                print(message, flush=True)
                report_lines.append(message)
                continue

            first_beat = select_first_normal_beat_after_start(annotations, window.start_sample, window.end_sample)
            if first_beat is None:
                record_summary.skipped_no_normal_beat_in_window += 1
                message = build_attempt_line(attempt_index, total_attempts, "skip no normal beat in window", eta)
                print(message, flush=True)
                report_lines.append(message)
                continue

            resampled = resample_chunk(chunk, sampling_rate_hz, TARGET_SAMPLING_RATE_HZ)
            beat_position_old = first_beat.sample - window.start_sample
            beat_position_new = map_old_sample_to_new_sample(
                old_sample_index=first_beat.sample,
                old_sampling_rate_hz=sampling_rate_hz,
                new_sampling_rate_hz=TARGET_SAMPLING_RATE_HZ,
                old_window_start_sample=window.start_sample,
            )
            if beat_position_new < 0 or beat_position_new >= resampled.shape[1]:
                record_summary.skipped_decode_or_format += 1
                message = build_attempt_line(attempt_index, total_attempts, "skip label outside chunk", eta)
                print(message, flush=True)
                report_lines.append(message)
                continue

            write_example(
                run_dir,
                example_id,
                resampled,
                build_metadata(record_name, window, header, signal_count, resampled, first_beat, beat_position_old, beat_position_new),
            )
            record_summary.saved_examples += 1
            overall_examples += 1
            message = build_saved_line(example_id, beat_position_old, beat_position_new, eta)
            print(message, flush=True)
            report_lines.append(message)
            example_id += 1

    report_lines.append("")
    return (
        record_summary,
        example_id,
        completed_attempts,
        overall_examples,
        overall_signals,
        overall_normal_beats,
        report_lines,
    )


def generate_dataset() -> Path:
    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    run_timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    run_dir = OUTPUT_ROOT / f"run_{run_timestamp}"
    run_dir.mkdir(parents=True, exist_ok=True)
    summary_path = OUTPUT_ROOT / f"outputdata_{run_timestamp}.txt"

    records_to_process = discover_record_bases(list(SOURCE_PATHS))
    if not records_to_process:
        raise SystemExit("No recordings selected for processing.")

    rng = random.Random(RANDOM_SEED)
    report_lines = build_run_header(run_timestamp, run_dir, records_to_process)
    start_time = time.monotonic()
    total_attempts_target = count_total_attempts(records_to_process)
    completed_attempts = 0
    example_id = 1
    overall_examples = 0
    overall_normal_beats = 0
    overall_signals = 0
    record_summaries: list[RecordSummary] = []

    for record_index, record_base in enumerate(records_to_process, start=1):
        record_summary, example_id, completed_attempts, record_examples, record_signals, record_normal_beats, lines = process_record(
            record_index,
            len(records_to_process),
            record_base,
            rng,
            start_time,
            total_attempts_target,
            completed_attempts,
            run_dir,
            example_id,
        )
        overall_examples += record_examples
        overall_signals += record_signals
        overall_normal_beats += record_normal_beats
        record_summaries.append(record_summary)
        report_lines.extend(lines)

    total_elapsed = time.monotonic() - start_time
    report_lines.extend(
        build_summary_lines(
            record_summaries,
            len(record_summaries),
            overall_signals,
            overall_normal_beats,
            overall_examples,
            total_elapsed,
        )
    )
    write_summary(summary_path, report_lines)
    print(f"Summary written to {summary_path}", flush=True)
    return run_dir
