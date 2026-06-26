"""Helpers for planning fixed-length training windows around beat annotations."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class PlannedChunkWindow:
    start_sample: int
    end_sample: int
    beat_offset_sample: int
    beat_offset_ms: float


def plan_chunk_window(
    beat_sample: int,
    offset_min_ms: float,
    offset_max_ms: float,
    chunk_length_seconds: float,
    sampling_rate_hz: float,
    record_length_samples: int,
    offset_fraction: float = 0.5,
) -> PlannedChunkWindow | None:
    """Plan one deterministic chunk window around a beat.

    The beat is placed somewhere within the pre-beat offset range by linear interpolation.
    """

    if sampling_rate_hz <= 0:
        raise ValueError("sampling_rate_hz must be positive")
    if chunk_length_seconds <= 0:
        raise ValueError("chunk_length_seconds must be positive")
    if record_length_samples <= 0:
        raise ValueError("record_length_samples must be positive")
    if offset_min_ms > offset_max_ms:
        raise ValueError("offset_min_ms must be <= offset_max_ms")
    if not 0 <= offset_fraction <= 1:
        raise ValueError("offset_fraction must be between 0 and 1")

    offset_ms = offset_min_ms + (offset_max_ms - offset_min_ms) * offset_fraction
    beat_offset_sample = int(round(offset_ms * sampling_rate_hz / 1000.0))
    chunk_length_samples = int(round(chunk_length_seconds * sampling_rate_hz))

    start_sample = beat_sample - beat_offset_sample
    end_sample = start_sample + chunk_length_samples

    if start_sample < 0:
        return None
    if end_sample > record_length_samples:
        return None

    return PlannedChunkWindow(
        start_sample=start_sample,
        end_sample=end_sample,
        beat_offset_sample=beat_offset_sample,
        beat_offset_ms=offset_ms,
    )
