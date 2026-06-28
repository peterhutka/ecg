# 04 Beat Position Regression Baseline No Pool

This experiment keeps the baseline CNN almost unchanged, but removes the global
average pooling layer so the regressor can still see where features occurred in
the time axis.

The goal is to test the smallest useful architectural change for beat-position
regression:

- Same convolution stack as `01-beat-position-regression`
- Same ReLU activations
- Same compact hidden layer size
- No `AdaptiveAvgPool1d(1)`

