from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np

sys.path.append(str(Path(__file__).resolve().parents[1]))

from dataset import BeatPositionDataset, ExampleSpec, discover_examples, split_examples


def _write_example(root: Path, stem: str, values: np.ndarray, beat_position: int) -> ExampleSpec:
    dat_path = root / f"{stem}.dat"
    json_path = root / f"{stem}.json"
    values.astype(np.float32).tofile(dat_path)
    json_path.write_text(
        json.dumps(
            {
                "beat_position_new": beat_position,
                "shape": list(values.shape),
            }
        ),
        encoding="utf-8",
    )
    return ExampleSpec(stem=stem, dat_path=dat_path, json_path=json_path)


def test_discover_examples_pairs_dat_and_json(tmp_path: Path) -> None:
    _write_example(tmp_path, "00001", np.array([[1.0, 2.0], [3.0, 4.0]], dtype=np.float32), 1)
    _write_example(tmp_path, "00002", np.array([[5.0, 6.0], [7.0, 8.0]], dtype=np.float32), 0)

    examples = discover_examples(tmp_path)

    assert [example.stem for example in examples] == ["00001", "00002"]


def test_split_examples_is_deterministic_and_disjoint(tmp_path: Path) -> None:
    examples = [
        _write_example(tmp_path, f"{index:05d}", np.array([[float(index)]], dtype=np.float32), 0)
        for index in range(6)
    ]

    train_a, test_a = split_examples(examples, train_size=3, test_size=2, seed=7)
    train_b, test_b = split_examples(examples, train_size=3, test_size=2, seed=7)

    assert [example.stem for example in train_a] == [example.stem for example in train_b]
    assert [example.stem for example in test_a] == [example.stem for example in test_b]
    assert set(example.stem for example in train_a).isdisjoint(example.stem for example in test_a)


def test_dataset_returns_flattened_signal_and_normalized_label(tmp_path: Path) -> None:
    example = _write_example(
        tmp_path,
        "00001",
        np.array([[10.0, 20.0], [30.0, 40.0]], dtype=np.float32),
        beat_position=1,
    )

    dataset = BeatPositionDataset([example], flatten_channels=True)
    x, y = dataset[0]

    assert tuple(np.asarray(x).shape) == (1, 4)
    assert float(y) == 1.0
