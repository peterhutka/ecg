from __future__ import annotations

import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))

from evaluation import normalized_position_error


def test_normalized_position_error_is_zero_when_prediction_is_exact() -> None:
    assert normalized_position_error(120, 120, 800) == 0.0


def test_normalized_position_error_scales_with_window_length() -> None:
    assert normalized_position_error(250, 50, 400) == 0.5


def test_normalized_position_error_rejects_non_positive_window_length() -> None:
    try:
        normalized_position_error(10, 12, 0)
    except ValueError as exc:
        assert "window_length_samples" in str(exc)
    else:
        raise AssertionError("Expected ValueError")

