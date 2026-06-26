#!/usr/bin/env python3
"""Render one derived beat-detector sample into a compact PNG preview."""

from __future__ import annotations

import argparse
import json
import random
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2] / "shared-data" / "training-beat-detector1"
PREVIEW_ROOT = Path(__file__).resolve().parents[2] / "learning" / "beat-detector" / "previews"
PX_PER_SECOND = 100
HEIGHT = 50
PAD_X = 4
PAD_Y = 6


def _first(meta: dict[str, Any], keys: list[str], default: Any = None) -> Any:
    for key in keys:
        value = meta.get(key)
        if value is not None:
            return value
    return default


def _load_inline_samples(meta: dict[str, Any]) -> np.ndarray | None:
    for key in ("samples", "waveform", "signal", "data"):
        value = meta.get(key)
        if value is not None:
            return np.asarray(value, dtype=np.float32)
    return None


def _load_raw_samples(path: Path, meta: dict[str, Any]) -> np.ndarray:
    suffix = path.suffix.lower()
    if suffix == ".npy":
        return np.asarray(np.load(path), dtype=np.float32)
    if suffix == ".npz":
        archive = np.load(path)
        for key in ("samples", "waveform", "signal", "data"):
            if key in archive:
                return np.asarray(archive[key], dtype=np.float32)
        first_key = archive.files[0] if archive.files else None
        if first_key is None:
            raise ValueError(f"No arrays found in {path.name}")
        return np.asarray(archive[first_key], dtype=np.float32)
    if suffix in {".txt", ".csv"}:
        return np.loadtxt(path, delimiter="," if suffix == ".csv" else None, dtype=np.float32)
    if suffix == ".dat":
        dtype = np.dtype(str(_first(meta, ["dtype"], "float32")))
        shape = _first(meta, ["shape"])
        samples = np.fromfile(path, dtype=dtype)
        if isinstance(shape, list) and shape:
            try:
                samples = samples.reshape(tuple(int(part) for part in shape))
            except Exception:
                pass
        elif samples.ndim == 1 and int(_first(meta, ["channels"], 1)) > 1:
            channels = int(_first(meta, ["channels"], 1))
            samples = samples.reshape(-1, channels)
        return np.asarray(samples, dtype=np.float32)
    raise ValueError(f"Unsupported sample file type: {path.suffix}")


def _pick_visual_channel(samples: np.ndarray) -> np.ndarray:
    if samples.ndim == 1:
        return samples
    if samples.ndim != 2:
        return np.asarray(samples).reshape(-1)

    channel_axis = 0 if samples.shape[0] <= samples.shape[1] else 1
    channels = samples if channel_axis == 0 else samples.T
    best_index = 0
    best_score = -1.0
    for index, channel in enumerate(channels):
        centered = channel - np.median(channel)
        score = float(np.max(np.abs(centered)))
        if score > best_score:
            best_score = score
            best_index = index
    return np.asarray(channels[best_index], dtype=np.float32)


def render_window(
    samples: np.ndarray,
    meta: dict[str, Any] | None = None,
    *,
    sample_id: str = "window",
    output: Path | None = None,
    preview_root: Path = PREVIEW_ROOT,
) -> Path:
    meta = meta or {}
    samples = _pick_visual_channel(np.asarray(samples, dtype=np.float32))
    samples = samples.reshape(-1)
    if samples.size == 0:
        raise ValueError("Empty sample window")

    sampling_rate = float(_first(meta, ["sampling_rate_hz", "samplingRateHz", "sr"], 0) or 0)
    duration_seconds = float(
        _first(meta, ["window_seconds", "duration_seconds", "durationSeconds"], 0)
        or (samples.size / sampling_rate if sampling_rate > 0 else samples.size / PX_PER_SECOND)
    )
    width = max(100, int(round(duration_seconds * PX_PER_SECOND)))

    centered = samples - float(np.median(samples))
    peak = float(np.max(np.abs(centered)))
    if not np.isfinite(peak) or peak <= 1e-9:
        peak = 1.0

    # Use the full peak excursion so the waveform stays within the image bounds.
    scale = peak / 0.95
    normalized = np.clip(centered / scale, -0.95, 0.95)
    is_flat = peak <= 1e-9

    source_x = np.linspace(0, samples.size - 1, num=width)
    plotted = np.interp(source_x, np.arange(samples.size), normalized)

    image = Image.new("RGBA", (width, HEIGHT), (255, 255, 255, 255))
    draw = ImageDraw.Draw(image)
    center_y = HEIGHT // 2

    draw.line((0, center_y, width, center_y), fill=(210, 210, 210, 255), width=1)

    amplitude = max(1, center_y - PAD_Y)
    points = [(x, int(round(center_y - value * amplitude))) for x, value in enumerate(plotted)]
    draw.line(points, fill=(201, 30, 30, 255), width=2)

    beat_present = bool(_first(meta, ["beat_present", "present", "has_beat"], False))
    beat_position = _first(
        meta,
        ["beat_position_new", "beat_position", "beat_position_sample", "position", "label_position"],
    )
    if beat_present and beat_position is not None:
        beat_sample = float(beat_position)
        beat_x = int(round((beat_sample / max(samples.size - 1, 1)) * (width - 1)))
        draw.line((beat_x, 0, beat_x, HEIGHT - 1), fill=(30, 80, 220, 255), width=3)

    predicted_position = _first(
        meta,
        [
            "predicted_beat_position_new",
            "predicted_beat_position",
            "predicted_position",
            "prediction_position",
        ],
    )
    if predicted_position is not None:
        predicted_sample = float(predicted_position)
        predicted_x = int(round((predicted_sample / max(samples.size - 1, 1)) * (width - 1)))
        draw.line((predicted_x, 0, predicted_x, HEIGHT - 1), fill=(255, 155, 0, 255), width=3)

    if is_flat:
        draw.text((6, 6), "flat sample", fill=(120, 120, 120, 255))

    if output and output.suffix.lower() == ".png":
        output_path = output
        output_path.parent.mkdir(parents=True, exist_ok=True)
    else:
        output_dir = output if output else preview_root
        output_dir.mkdir(parents=True, exist_ok=True)
        output_path = output_dir / f"{sample_id}.png"
    image.save(output_path)
    return output_path


def load_sample(sample_id: str, root: Path = ROOT) -> tuple[np.ndarray, dict[str, Any], Path]:
    meta_candidates = sorted(root.rglob(f"{sample_id}.json"))
    data_candidates: list[Path] = []
    for extension in (".npy", ".npz", ".dat", ".csv", ".txt"):
        data_candidates.extend(sorted(root.rglob(f"{sample_id}{extension}")))

    if not meta_candidates and not data_candidates:
        raise FileNotFoundError(f"Could not find data for sample {sample_id}")

    meta: dict[str, Any] = {}
    meta_path = meta_candidates[0] if meta_candidates else None
    sample_dir = meta_path.parent if meta_path else (data_candidates[0].parent if data_candidates else root)
    source_path = data_candidates[0] if data_candidates else sample_dir / f"{sample_id}.dat"

    if meta_path and meta_path.exists():
        meta = json.loads(meta_path.read_text())

    samples = _load_inline_samples(meta)
    if samples is not None:
        return samples, meta, sample_dir

    sample_file_name = _first(
        meta,
        ["samples_file", "waveform_file", "data_file", "path", "file"],
    )
    if sample_file_name:
        sample_path = sample_dir / str(sample_file_name)
        if not sample_path.exists():
            sample_path = root / str(sample_file_name)
        if not sample_path.exists():
            raise FileNotFoundError(sample_path)
        return _load_raw_samples(sample_path, meta), meta, sample_path.parent

    if data_candidates:
        return _load_raw_samples(data_candidates[0], meta), meta, data_candidates[0].parent

    raise FileNotFoundError(f"Could not find data for sample {sample_id}")


def find_all_sample_ids(root: Path = ROOT) -> list[str]:
    ids: set[str] = set()
    for meta_path in root.rglob("*.json"):
        ids.add(meta_path.stem)
    for extension in (".npy", ".npz", ".dat", ".csv", ".txt"):
        for data_path in root.rglob(f"*{extension}"):
            ids.add(data_path.stem)
    return sorted(ids)


def render(sample_id: str, root: Path = ROOT, output: Path | None = None) -> Path:
    samples, meta, _ = load_sample(sample_id, root=root)
    return render_window(samples, meta, sample_id=sample_id, output=output)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("sample_id", nargs="?")
    parser.add_argument("--random", type=int, default=0)
    parser.add_argument("--root", type=Path, default=ROOT)
    parser.add_argument("--output", type=Path, default=None)
    args = parser.parse_args()

    if args.random > 0:
        sample_ids = find_all_sample_ids(root=args.root)
        if not sample_ids:
            raise SystemExit("No samples found.")
        chosen_ids = random.sample(sample_ids, k=min(args.random, len(sample_ids)))
        for sample_id in chosen_ids:
            print(render(sample_id, root=args.root, output=args.output))
        return

    if not args.sample_id:
        raise SystemExit("Provide a sample_id or --random N")

    print(render(args.sample_id, root=args.root, output=args.output))


if __name__ == "__main__":
    main()
