# 02 Beat Position Regression Stable

## Goal

Train a second beat-position model with the same data and training split as experiment 01, but with small architecture improvements.

## Differences from 01

- padded convolutions
- Conv -> BatchNorm -> SiLU blocks
- same input data and train/validation split
- same evaluation metric
- same checkpoint/preview workflow
