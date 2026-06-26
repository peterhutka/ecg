from __future__ import annotations

from dataclasses import asdict

from beat_detector_config import TARGET_SAMPLING_RATE_HZ, WINDOW_SECONDS
from beat_detector_types import AnnotationInfo


def select_first_normal_beat_after_start(
    annotations: list[AnnotationInfo],
    start_sample: int,
    end_sample: int,
) -> AnnotationInfo | None:
    """Pick the first normal beat that falls inside the proposed chunk."""
    for annotation in annotations:
        if annotation.symbol == "N" and start_sample <= annotation.sample < end_sample:
            return annotation
    return None


def build_metadata(
    record_name: str,
    window,
    header,
    signal_count: int,
    resampled_chunk,
    beat: AnnotationInfo,
    beat_position_old: int,
    beat_position_new: int,
) -> dict[str, object]:
    """Create the small JSON sidecar that describes one generated example."""
    return {
        "source_record": record_name,
        "chunk_start_old": window.start_sample,
        "chunk_end_old": window.end_sample,
        "old_sampling_rate_hz": float(getattr(header, "fs", 0.0)),
        "target_sampling_rate_hz": TARGET_SAMPLING_RATE_HZ,
        "window_seconds": WINDOW_SECONDS,
        "beat_present": True,
        "beat_position_old": beat_position_old,
        "beat_position_new": beat_position_new,
        "beat_annotation": asdict(beat),
        "signal_count": signal_count,
        "shape": list(resampled_chunk.shape),
        "dtype": "float32",
    }
