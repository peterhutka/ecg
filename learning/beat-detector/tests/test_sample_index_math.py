from __future__ import annotations

import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))

from sample_index_math import map_old_sample_to_new_sample


def test_same_sampling_rate_keeps_position_relative_to_window_start() -> None:
    # 1000 Hz to 1000 Hz should keep the relative sample index unchanged.
    assert map_old_sample_to_new_sample(550, 1000, 1000, 500) == 50


def test_downsampling_shifts_position_to_fewer_samples() -> None:
    # 200 Hz to 100 Hz halves the sample index inside the window.
    assert map_old_sample_to_new_sample(240, 200, 100, 200) == 20


def test_upsampling_shifts_position_to_more_samples() -> None:
    # 100 Hz to 250 Hz multiplies the relative position by 2.5.
    assert map_old_sample_to_new_sample(108, 100, 250, 100) == 20


def test_non_integer_scaling_rounds_to_nearest_sample() -> None:
    # 300 Hz to 100 Hz with a 500-sample offset lands at exactly 7 samples.
    assert map_old_sample_to_new_sample(521, 300, 100, 500) == 7
