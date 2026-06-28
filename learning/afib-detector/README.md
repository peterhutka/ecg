# AFib Detector

This folder is for experiments that detect atrial fibrillation from ECG records.

The first goal is not to choose the final model. The first goal is to make small experiments easy to run and compare without losing track of data, labels, splits, preprocessing, or metrics.

## Shape

```text
configs/      Versioned experiment inputs
cache/        Rebuildable preprocessed data
runs/         One directory per training or evaluation run
mlruns/       Local MLflow tracking store
src/          AFib detector code
tests/        Focused tests for parsing, splits, labels, and metrics
notebooks/    Scratch analysis that can later become scripts
```

See `../../GOOD_PRACTICES.md` for the project rules this folder should follow.
