from __future__ import annotations


def normalized_position_error(
    predicted_sample: int,
    true_sample: int,
    window_length_samples: int,
) -> float:
    """Return the absolute beat-position error normalized by the window length."""
    if window_length_samples <= 0:
        raise ValueError("window_length_samples must be positive")

    return abs(predicted_sample - true_sample) / window_length_samples
