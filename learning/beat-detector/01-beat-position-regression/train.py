from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from common.experiment import ExperimentConfig, run_training_experiment
from model import build_model

CHECKPOINT_PATH = Path(__file__).resolve().parent / "checkpoints" / "beat_position_cnn.pt"


def main() -> None:
    run_training_experiment(
        build_model=build_model,
        config=ExperimentConfig(
            name="01-baseline",
            checkpoint_path=CHECKPOINT_PATH,
        ),
    )


if __name__ == "__main__":
    main()
