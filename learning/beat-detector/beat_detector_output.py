from __future__ import annotations

import json
from pathlib import Path


def write_example(output_dir: Path, example_id: int, chunk, metadata: dict[str, object]) -> None:
    """Store one training example and its JSON sidecar."""
    stem = f"{example_id:05d}"
    (output_dir / f"{stem}.dat").write_bytes(chunk.tobytes())
    (output_dir / f"{stem}.json").write_text(json.dumps(metadata, indent=2, sort_keys=True), encoding="utf-8")


def write_summary(summary_path: Path, lines: list[str]) -> None:
    """Store the human-readable run summary next to the dataset."""
    summary_path.write_text("\n".join(lines), encoding="utf-8")
