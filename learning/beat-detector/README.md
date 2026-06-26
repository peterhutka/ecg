# Beat Detector

## Goal

Build a simple, realistic first ECG model that takes a fixed window of resampled samples and predicts whether a beat is present and where it occurs in the window.

## Starting point

- Input: 400-sample windows at a unified sampling rate
- Output: beat presence plus beat position
- Data source: WFDB records and annotations from the current project

## Experiments

- `01-beat-position-regression/`
- `02-beat-position-regression-stable/`

## Shared utilities

- `common/`
- `compare_experiments.py`
