# 01 Beat Position Regression

## Goal

Train a first simple model that takes a fixed ECG window and predicts the beat position inside that window.

## Scope

- Input: fixed-length resampled ECG window
- Output: a single beat position
- Data: positive windows only for the first version
- Data loader: read generated `.dat`/`.json` pairs from the latest run
- Training: stop early after 5 validation epochs without improvement
- Status: training scaffold exists, model tuning comes next
