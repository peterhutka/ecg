from __future__ import annotations

from datetime import datetime
from pathlib import Path

from beat_detector_config import (
    OFFSET_MAX_MS,
    OFFSET_MIN_MS,
    REPO_ROOT,
    SOURCE_PATHS,
    SAMPLES_PER_BEAT,
    TARGET_SAMPLING_RATE_HZ,
    WINDOW_SECONDS,
)
from beat_detector_types import RecordSummary


def format_duration(seconds: float) -> str:
    """Render a rough elapsed/eta duration for console updates."""
    seconds = max(0.0, seconds)
    total_seconds = int(seconds)
    hours, remainder = divmod(total_seconds, 3600)
    minutes, secs = divmod(remainder, 60)
    return f"{hours:02d}:{minutes:02d}:{secs:02d}" if hours else f"{minutes:02d}:{secs:02d}"


def format_repo_path(path: Path) -> str:
    try:
        return str(path.relative_to(REPO_ROOT))
    except ValueError:
        return str(path)


def build_run_header(run_timestamp: str, run_dir, records_to_process: list[Path]) -> list[str]:
    return [
        f"Run timestamp: {run_timestamp}",
        f"Input paths: {', '.join(format_repo_path(path) for path in SOURCE_PATHS)}",
        f"Output root: {format_repo_path(run_dir)}",
        f"Selected recordings: {', '.join(format_repo_path(path) for path in records_to_process)}",
        f"Samples per beat: {SAMPLES_PER_BEAT}",
        f"Window seconds: {WINDOW_SECONDS}",
        f"Target sampling rate: {TARGET_SAMPLING_RATE_HZ}",
        f"Offset range ms: {OFFSET_MIN_MS}..{OFFSET_MAX_MS}",
        "",
    ]


def build_record_header(
    record_index: int,
    total_records: int,
    record_name: str,
    signal_count: int,
    normal_beat_count: int,
    sample_count: int,
    sampling_rate_hz: float,
) -> list[str]:
    return [
        f"Recording {record_index}/{total_records}: {record_name}",
        f"  signal_count: {signal_count}",
        f"  normal_beats: {normal_beat_count}",
        f"  sample_count: {sample_count}",
        f"  sampling_rate_hz: {sampling_rate_hz}",
    ]


def build_attempt_line(attempt_index: int, total_attempts: int, message: str, eta_seconds: float) -> str:
    return f"  attempt {attempt_index:03d}/{total_attempts}: {message} (eta {format_duration(eta_seconds)})"


def build_saved_line(example_id: int, beat_position_old: int, beat_position_new: int, eta_seconds: float) -> str:
    return (
        f"  saved {example_id:05d}.dat "
        f"(beat old={beat_position_old}, new={beat_position_new}, eta {format_duration(eta_seconds)})"
    )


def build_summary_lines(
    record_summaries: list[RecordSummary],
    recordings_processed: int,
    overall_signals: int,
    overall_normal_beats: int,
    overall_examples: int,
    elapsed_seconds: float,
) -> list[str]:
    lines = [
        "Summary",
        f"  recordings_processed: {recordings_processed}",
        f"  signals_processed: {overall_signals}",
        f"  normal_beats_seen: {overall_normal_beats}",
        f"  saved_examples: {overall_examples}",
        f"  elapsed: {format_duration(elapsed_seconds)}",
        "",
    ]

    for record_summary in record_summaries:
        lines.extend(
            [
                f"Recording {record_summary.record_name}",
                f"  signals: {record_summary.signal_count}",
                f"  normal_beats: {record_summary.normal_beat_count}",
                f"  attempts: {record_summary.attempts}",
                f"  saved_examples: {record_summary.saved_examples}",
                f"  skipped_window_out_of_bounds: {record_summary.skipped_window_out_of_bounds}",
                f"  skipped_no_normal_beat_in_window: {record_summary.skipped_no_normal_beat_in_window}",
                f"  skipped_decode_or_format: {record_summary.skipped_decode_or_format}",
            ]
        )
        for signal_summary in record_summary.signal_summaries or []:
            lines.append(
                f"  signal {signal_summary.name}: file={signal_summary.file}, format={signal_summary.format}, "
                f"gain={signal_summary.gain}, adc_zero={signal_summary.adc_zero}, source_samples={signal_summary.sample_count}"
            )
        lines.append("")

    return lines
