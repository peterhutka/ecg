from __future__ import annotations

from typing import Any
from pathlib import Path

import numpy as np

try:
    import wfdb
    from wfdb.processing import resample_sig
except ImportError as exc:  # pragma: no cover - runtime dependency guard
    raise SystemExit(
        "Missing dependencies. Install them first: uv pip install wfdb numpy scipy"
    ) from exc

from beat_detector_types import AnnotationInfo, SignalSummary


def as_sequence(value: Any) -> list[Any]:
    if value is None:
        return []
    if isinstance(value, list):
        return value
    if isinstance(value, tuple):
        return list(value)
    if isinstance(value, np.ndarray):
        return value.tolist()
    return [value]


def sequence_value(sequence: Any, index: int) -> Any:
    if sequence is None:
        return None
    try:
        value = sequence[index]
    except (TypeError, IndexError):
        return None
    return value.item() if isinstance(value, np.generic) else value


def normalize_optional_int(value: Any) -> int | None:
    if value is None:
        return None
    if isinstance(value, np.generic):
        value = value.item()
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def normalize_optional_float(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, np.generic):
        value = value.item()
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def load_record_metadata(record_base: Path) -> tuple[Any, list[AnnotationInfo], list[SignalSummary]]:
    """Load header and annotations using wfdb, then distill them into app-friendly types."""
    record_base_str = str(record_base)
    header = wfdb.rdheader(record_base_str)
    annotation_obj = wfdb.rdann(record_base_str, "atr")

    annotations: list[AnnotationInfo] = []
    samples = as_sequence(getattr(annotation_obj, "sample", []))
    symbols = as_sequence(getattr(annotation_obj, "symbol", []))
    subtypes = getattr(annotation_obj, "subtype", None)
    chans = getattr(annotation_obj, "chan", None)
    nums = getattr(annotation_obj, "num", None)
    aux_notes = getattr(annotation_obj, "aux_note", None)

    for index, sample in enumerate(samples):
        annotations.append(
            AnnotationInfo(
                sample=int(sample),
                symbol=str(sequence_value(symbols, index) or ""),
                subtype=normalize_optional_int(sequence_value(subtypes, index)),
                chan=normalize_optional_int(sequence_value(chans, index)),
                num=normalize_optional_int(sequence_value(nums, index)),
                aux_note=sequence_value(aux_notes, index),
            )
        )

    signal_names = as_sequence(getattr(header, "sig_name", []))
    signal_files = as_sequence(getattr(header, "file_name", []))
    signal_formats = as_sequence(getattr(header, "fmt", []))
    signal_gains = as_sequence(getattr(header, "adc_gain", []))
    signal_zeros = as_sequence(getattr(header, "adc_zero", []))
    signal_count = int(getattr(header, "n_sig", len(signal_names)))
    sample_count = int(getattr(header, "sig_len", 0))

    signal_summaries = [
        SignalSummary(
            name=str(sequence_value(signal_names, index) or f"signal-{index + 1}"),
            file=str(sequence_value(signal_files, index) or record_name),
            format=str(sequence_value(signal_formats, index) or ""),
            gain=normalize_optional_float(sequence_value(signal_gains, index)),
            adc_zero=normalize_optional_int(sequence_value(signal_zeros, index)),
            sample_count=sample_count,
        )
        for index in range(signal_count)
    ]

    return header, annotations, signal_summaries


def load_record_chunk(record_base: Path, start_sample: int, end_sample: int) -> np.ndarray:
    """Load a slice of raw digital samples and return it as channels x samples."""
    record = wfdb.rdrecord(
        str(record_base),
        sampfrom=start_sample,
        sampto=end_sample,
        physical=False,
    )
    chunk = np.asarray(record.d_signal)
    if chunk.ndim == 1:
        return chunk[np.newaxis, :]
    return chunk.T


def resample_chunk(chunk: np.ndarray, source_rate: float, target_rate: float) -> np.ndarray:
    """Resample each channel to the target frequency."""
    if source_rate <= 0 or target_rate <= 0:
        raise ValueError("sampling rates must be positive")

    resampled_channels: list[np.ndarray] = []
    for channel in chunk:
        resampled_channel, _ = resample_sig(channel, source_rate, target_rate)
        resampled_channels.append(np.asarray(resampled_channel))

    resampled = np.vstack(resampled_channels)
    expected_length = int(round(chunk.shape[1] * target_rate / source_rate))
    if resampled.shape[1] > expected_length:
        return resampled[:, :expected_length].astype(np.float32, copy=False)
    if resampled.shape[1] < expected_length:
        pad_width = expected_length - resampled.shape[1]
        resampled = np.pad(resampled, ((0, 0), (0, pad_width)), mode="edge")
    return resampled.astype(np.float32, copy=False)
