from __future__ import annotations

from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
SHARED_DATA_ROOT = REPO_ROOT / "shared-data"

# Source WFDB paths for the initial training dataset.
# Each entry can be a record file or a directory with immediate .hea files.
SOURCE_PATHS: tuple[Path, ...] = (
    SHARED_DATA_ROOT / "nsrdb_1.0.0_" / "mit-bih-normal-sinus-rhythm-database-1.0.0" / "18184.dat",
)

# Output root for generated training examples and run summaries.
OUTPUT_ROOT = SHARED_DATA_ROOT / "training-beat-detector1"

# Training example shape and generation knobs.
SAMPLES_PER_BEAT = 2
WINDOW_SECONDS = 2.0
TARGET_SAMPLING_RATE_HZ = 200.0
OFFSET_MIN_MS = -400.0
OFFSET_MAX_MS = 100.0
RANDOM_SEED = 42
