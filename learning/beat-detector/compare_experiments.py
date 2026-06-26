from __future__ import annotations

import argparse
import importlib.util
import sys
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

import torch

ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from common.dataset import DEFAULT_DATASET_ROOT, discover_all_examples, load_example
from common.checkpoint import load_checkpoint
from common.device import get_torch_device
from common.evaluation import normalized_position_error
from common.sampling import choose_random_examples


@dataclass(frozen=True)
class ExperimentSpec:
    name: str
    model_path: Path
    checkpoint_path: Path


EXPERIMENTS = (
    ExperimentSpec(
        name="01-baseline",
        model_path=ROOT / "01-beat-position-regression" / "model.py",
        checkpoint_path=ROOT / "01-beat-position-regression" / "checkpoints" / "beat_position_cnn.pt",
    ),
    ExperimentSpec(
        name="02-stable",
        model_path=ROOT / "02-beat-position-regression-stable" / "model.py",
        checkpoint_path=ROOT / "02-beat-position-regression-stable" / "checkpoints" / "beat_position_cnn.pt",
    ),
)


def _load_build_model(model_path: Path, module_name: str):
    spec = importlib.util.spec_from_file_location(module_name, model_path)
    if spec is None or spec.loader is None:
        raise ImportError(model_path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module.build_model


def _load_model(spec: ExperimentSpec, device: torch.device):
    build_model = _load_build_model(spec.model_path, f"_compare_{spec.name.replace('-', '_')}")
    model = build_model().to(device)
    checkpoint = load_checkpoint(spec.checkpoint_path, map_location=device)
    if checkpoint is None:
        raise FileNotFoundError(spec.checkpoint_path)
    model.load_state_dict(checkpoint["model_state_dict"])
    model.eval()
    return model


def main() -> None:
    parser = argparse.ArgumentParser(description="Compare two beat-position experiments on random windows.")
    parser.add_argument("--count", type=int, default=10)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--dataset-root", type=Path, default=DEFAULT_DATASET_ROOT)
    parser.add_argument("--report-root", type=Path, default=ROOT / "comparisons")
    args = parser.parse_args()

    examples = discover_all_examples(args.dataset_root)
    if not examples:
        raise SystemExit(f"No generated examples found under {args.dataset_root}")

    chosen = choose_random_examples(examples, count=args.count, seed=args.seed)
    device = get_torch_device()
    models = {spec.name: _load_model(spec, device) for spec in EXPERIMENTS}

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    report_dir = args.report_root
    report_dir.mkdir(parents=True, exist_ok=True)
    report_path = report_dir / f"compare_{timestamp}.txt"

    lines: list[str] = []
    lines.append(f"Dataset root: {args.dataset_root}")
    lines.append(f"Selected examples: {len(chosen)}")
    lines.append(f"Device: {device}")
    lines.append("")

    totals = {spec.name: 0.0 for spec in EXPERIMENTS}
    for index, example in enumerate(chosen, start=1):
        x, y = load_example(example)
        x_tensor = x.to(device, dtype=torch.float32).unsqueeze(0)
        true_position = float(y)
        line_parts = [f"[{index}/{len(chosen)}] {example.stem} target={true_position:.3f}"]

        for spec in EXPERIMENTS:
            with torch.no_grad():
                prediction = models[spec.name](x_tensor).squeeze().item()
            sample_count = int(x.shape[-1])
            predicted_sample = int(round(prediction * max(sample_count - 1, 1)))
            true_sample = int(round(true_position * max(sample_count - 1, 1)))
            error = normalized_position_error(predicted_sample, true_sample, sample_count)
            totals[spec.name] += error
            line_parts.append(f"{spec.name} pred={prediction:.3f} err={error:.4f}")

        line = " | ".join(line_parts)
        lines.append(line)
        print(line)

    lines.append("")
    lines.append("Summary")
    for spec in EXPERIMENTS:
        mean_error = totals[spec.name] / max(1, len(chosen))
        lines.append(f"  {spec.name}: mean_normalized_error={mean_error:.6f}")

    report_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Saved comparison report to {report_path}")


if __name__ == "__main__":
    main()
