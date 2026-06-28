from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from common.dataset import DEFAULT_DATASET_ROOT
from common.defaults import SEED
from common.preview import render_random_model_predictions
from model import build_model

CHECKPOINT_PATH = Path(__file__).resolve().parent / "checkpoints" / "beat_position_cnn.pt"
PREVIEW_ROOT = ROOT / "previews" / "predictions"


def main() -> None:
    render_random_model_predictions(
        build_model=build_model,
        checkpoint_path=CHECKPOINT_PATH,
        output_root=PREVIEW_ROOT,
        dataset_root=DEFAULT_DATASET_ROOT,
        count=10,
        seed=SEED,
        title="Baseline no-pool model preview",
    )


if __name__ == "__main__":
    main()

