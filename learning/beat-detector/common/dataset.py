from __future__ import annotations

import json
import random
from dataclasses import dataclass
from pathlib import Path
from typing import Sequence

import numpy as np

REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_DATASET_ROOT = REPO_ROOT / "shared-data" / "training-beat-detector1"


@dataclass(frozen=True)
class ExampleSpec:
    """One generated ECG window with its label sidecar."""

    stem: str
    dat_path: Path
    json_path: Path


def find_latest_run_dir(dataset_root: Path = DEFAULT_DATASET_ROOT) -> Path:
    """Pick the most recent generated run directory."""
    run_dirs = sorted(path for path in dataset_root.glob("run_*") if path.is_dir())
    if not run_dirs:
        raise FileNotFoundError(f"No run directories found under {dataset_root}")
    return run_dirs[-1]


def discover_examples(run_dir: Path) -> list[ExampleSpec]:
    """Collect matching .dat/.json example pairs from one generated run."""
    examples: list[ExampleSpec] = []
    for json_path in sorted(run_dir.glob("*.json")):
        dat_path = json_path.with_suffix(".dat")
        if dat_path.exists():
            examples.append(ExampleSpec(stem=json_path.stem, dat_path=dat_path, json_path=json_path))
    return examples


def discover_all_examples(dataset_root: Path = DEFAULT_DATASET_ROOT) -> list[ExampleSpec]:
    """Collect examples from every generated run under the dataset root."""
    examples: list[ExampleSpec] = []
    for run_dir in sorted(path for path in dataset_root.glob("run_*") if path.is_dir()):
        examples.extend(discover_examples(run_dir))
    return examples


def split_examples(
    examples: Sequence[ExampleSpec],
    train_size: int,
    test_size: int,
    seed: int = 42,
) -> tuple[list[ExampleSpec], list[ExampleSpec]]:
    """Create deterministic train/test subsets from a list of examples."""
    if train_size < 0 or test_size < 0:
        raise ValueError("train_size and test_size must be non-negative")
    if len(examples) < train_size + test_size:
        raise ValueError("Not enough examples to satisfy the requested split sizes")

    shuffled = list(examples)
    rng = random.Random(seed)
    rng.shuffle(shuffled)
    train_examples = shuffled[:train_size]
    test_examples = shuffled[train_size : train_size + test_size]
    return train_examples, test_examples


def _load_json(json_path: Path) -> dict[str, object]:
    return json.loads(json_path.read_text(encoding="utf-8"))


def _normalized_position(metadata: dict[str, object]) -> float:
    beat_position_new = int(metadata["beat_position_new"])
    shape = metadata.get("shape", [1, 1])
    if not isinstance(shape, list) or len(shape) < 2:
        raise ValueError("metadata shape must contain channel and sample dimensions")
    sample_count = int(shape[1])
    if sample_count <= 1:
        return 0.0
    return beat_position_new / float(sample_count - 1)


def _maybe_tensor(array: np.ndarray):
    try:
        import torch
    except ImportError:
        return array
    return torch.from_numpy(array)


def _maybe_scalar(value: float):
    try:
        import torch
    except ImportError:
        return float(value)
    return torch.tensor(value, dtype=torch.float32)


def load_example(example: ExampleSpec, flatten_channels: bool = True):
    """Load one example as tensors when available, otherwise as NumPy values."""
    metadata = _load_json(example.json_path)
    shape = metadata.get("shape", [1, 1])
    if not isinstance(shape, list) or len(shape) != 2:
        raise ValueError(f"Unexpected shape in {example.json_path}: {shape!r}")

    raw = np.fromfile(example.dat_path, dtype=np.float32)
    signal = raw.reshape(int(shape[0]), int(shape[1]))
    if flatten_channels:
        signal = signal.reshape(1, -1)

    x = _maybe_tensor(signal.astype(np.float32, copy=False))
    y = _maybe_scalar(_normalized_position(metadata))
    return x, y


class BeatPositionDataset:
    """Dataset of generated ECG windows for beat-position regression."""

    def __init__(self, examples: Sequence[ExampleSpec], flatten_channels: bool = True) -> None:
        self.examples = list(examples)
        self.flatten_channels = flatten_channels

    def __len__(self) -> int:
        return len(self.examples)

    def __getitem__(self, index: int):
        return load_example(self.examples[index], flatten_channels=self.flatten_channels)
