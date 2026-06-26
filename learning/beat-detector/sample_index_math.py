"""Helpers for mapping WFDB sample positions between time bases."""

from __future__ import annotations


def map_old_sample_to_new_sample(
    old_sample_index: int,
    old_sampling_rate_hz: float,
    new_sampling_rate_hz: float,
    old_window_start_sample: int,
) -> int:
    """Convert an absolute sample index in the original recording to a sample index
    in a resampled window.

    The window start is expressed in the original recording's sample space.
    """

    if old_sampling_rate_hz <= 0:
        raise ValueError("old_sampling_rate_hz must be positive")
    if new_sampling_rate_hz <= 0:
        raise ValueError("new_sampling_rate_hz must be positive")

    relative_old_sample_index = old_sample_index - old_window_start_sample
    new_sample_index = relative_old_sample_index * new_sampling_rate_hz / old_sampling_rate_hz
    return int(round(new_sample_index))
