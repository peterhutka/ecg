from __future__ import annotations

import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))

from chunk_window import plan_chunk_window


def test_midpoint_offset_plans_a_valid_window() -> None:
    # Offset midpoint of 100-300 ms is 200 ms.
    window = plan_chunk_window(
        beat_sample=700,
        offset_min_ms=100,
        offset_max_ms=300,
        chunk_length_seconds=2,
        sampling_rate_hz=1000,
        record_length_samples=5000,
    )

    assert window is not None
    assert window.start_sample == 500
    assert window.end_sample == 2500
    assert window.beat_offset_sample == 200


def test_window_that_would_start_before_recording_is_skipped() -> None:
    # Even the minimum offset would place the window before sample 0.
    window = plan_chunk_window(
        beat_sample=150,
        offset_min_ms=200,
        offset_max_ms=200,
        chunk_length_seconds=1,
        sampling_rate_hz=1000,
        record_length_samples=5000,
    )

    assert window is None


def test_window_that_would_extend_past_recording_end_is_skipped() -> None:
    # The planned chunk is too close to the end of the recording.
    window = plan_chunk_window(
        beat_sample=4950,
        offset_min_ms=100,
        offset_max_ms=100,
        chunk_length_seconds=1,
        sampling_rate_hz=1000,
        record_length_samples=5000,
    )

    assert window is None
