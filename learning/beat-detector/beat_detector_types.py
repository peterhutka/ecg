from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class AnnotationInfo:
    sample: int
    symbol: str
    subtype: int | None = None
    chan: int | None = None
    num: int | None = None
    aux_note: str | None = None


@dataclass(frozen=True)
class SignalSummary:
    name: str
    file: str
    format: str
    gain: float | None
    adc_zero: int | None
    sample_count: int


@dataclass
class RecordSummary:
    record_name: str
    signal_count: int
    normal_beat_count: int
    attempts: int = 0
    saved_examples: int = 0
    skipped_window_out_of_bounds: int = 0
    skipped_no_normal_beat_in_window: int = 0
    skipped_decode_or_format: int = 0
    signal_summaries: list[SignalSummary] | None = None
