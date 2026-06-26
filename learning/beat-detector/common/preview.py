from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Callable, Sequence

import numpy as np
import torch

from common.checkpoint import load_checkpoint
from common.dataset import DEFAULT_DATASET_ROOT, ExampleSpec, discover_all_examples, load_example
from common.device import get_torch_device
from common.sampling import choose_random_examples
from visualise import render_window


def render_random_model_predictions(
    *,
    build_model: Callable[[], torch.nn.Module],
    checkpoint_path: Path,
    output_root: Path,
    dataset_root: Path = DEFAULT_DATASET_ROOT,
    count: int = 10,
    seed: int = 42,
    examples: Sequence[ExampleSpec] | None = None,
    title: str | None = None,
) -> Path:
    all_examples = list(examples) if examples is not None else discover_all_examples(dataset_root)
    if not all_examples:
        raise SystemExit(f"No generated examples found under {dataset_root}")

    chosen = choose_random_examples(all_examples, count=count, seed=seed)
    device = get_torch_device()
    model = build_model().to(device)
    checkpoint = load_checkpoint(checkpoint_path, map_location=device)
    if checkpoint is None:
        raise FileNotFoundError(checkpoint_path)
    model.load_state_dict(checkpoint["model_state_dict"])
    model.eval()

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    output_dir = output_root / timestamp
    output_dir.mkdir(parents=True, exist_ok=True)

    if title:
        print(title)
    print(f"Dataset root: {dataset_root}")
    print(f"Loaded {len(all_examples)} examples")
    print(f"Using device: {device}")
    print(f"Writing previews to: {output_dir}")

    for index, example in enumerate(chosen, start=1):
        x, y = load_example(example)
        x_tensor = x.to(device, dtype=torch.float32)
        with torch.no_grad():
            prediction = model(x_tensor.unsqueeze(0)).squeeze().item()

        metadata = json.loads(example.json_path.read_text(encoding="utf-8"))
        shape = metadata.get("shape", [1, int(x_tensor.shape[-1])])
        sample_count = int(shape[1]) if isinstance(shape, list) and len(shape) > 1 else int(x_tensor.shape[-1])
        predicted_sample = int(round(prediction * max(sample_count - 1, 1)))
        metadata["predicted_beat_position_new"] = predicted_sample
        metadata["prediction_normalized"] = float(prediction)

        relative_name = str(example.json_path.relative_to(dataset_root).with_suffix("")).replace("/", "__")
        safe_name = relative_name
        output_path = output_dir / f"{index:02d}__{safe_name}.png"
        render_window(_to_numpy(x), metadata, sample_id=safe_name, output=output_path)
        print(
            f"[{index}/{len(chosen)}] {example.stem} -> {output_path.name} "
            f"(target={float(y):.3f}, pred={prediction:.3f})"
        )

    return output_dir


def _to_numpy(value: object) -> np.ndarray:
    if hasattr(value, "detach"):
        value = value.detach()  # type: ignore[assignment]
    if hasattr(value, "cpu"):
        value = value.cpu()  # type: ignore[assignment]
    if hasattr(value, "numpy"):
        return np.asarray(value.numpy(), dtype=np.float32)  # type: ignore[call-arg]
    return np.asarray(value, dtype=np.float32)
