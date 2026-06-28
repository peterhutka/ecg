# 03 Beat Position Regression Temporal Map

## Goal

Train a third beat-position model that preserves temporal location after the convolutional feature extractor.

## Difference from 02

Experiment 02 uses `AdaptiveAvgPool1d(1)`, which answers "did this feature appear?" but discards most of the "where did it appear?" information.

This model keeps the final convolutional feature map as `channels x time`, then flattens it before regression. That gives the regressor access to activation position, which should matter for beat localization.

## Tradeoff

This model has more dense-head parameters than the pooled model. If it performs better, the improvement may come from preserving position, extra capacity, or both. That is still a useful next experiment.
