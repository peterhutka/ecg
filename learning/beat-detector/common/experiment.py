from __future__ import annotations

import csv
from datetime import datetime
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

import torch
from torch import nn
from torch.optim import Adam
from torch.utils.data import DataLoader

from common.checkpoint import load_checkpoint, save_checkpoint
from common.dataset import BeatPositionDataset, discover_examples, find_latest_run_dir, split_examples
from common.defaults import BATCH_SIZE, EARLY_STOP_PATIENCE, EPOCHS, LEARNING_RATE, SEED, TEST_SIZE, TRAIN_SIZE, WINDOW_SAMPLES
from common.device import get_torch_device
from common.evaluation import normalized_position_error


@dataclass(frozen=True)
class ExperimentConfig:
    name: str
    checkpoint_path: Path
    train_size: int = TRAIN_SIZE
    test_size: int = TEST_SIZE
    batch_size: int = BATCH_SIZE
    epochs: int = EPOCHS
    patience: int = EARLY_STOP_PATIENCE
    learning_rate: float = LEARNING_RATE
    seed: int = SEED
    window_samples: int = WINDOW_SAMPLES


@dataclass(frozen=True)
class TrainingState:
    model: nn.Module
    optimizer: Adam
    loss_fn: nn.Module
    train_loader: DataLoader
    test_loader: DataLoader
    device: torch.device


def _run_id_from_checkpoint(checkpoint: dict[str, object] | None) -> str:
    if checkpoint is not None:
        run_id = checkpoint.get("run_id")
        if isinstance(run_id, str) and run_id:
            return run_id
    return datetime.now().strftime("%Y%m%d_%H%M%S")


def _metrics_log_path(checkpoint_path: Path, run_id: str) -> Path:
    return checkpoint_path.with_name(f"{checkpoint_path.stem}_{run_id}_metrics.csv")


def _append_metrics_row(
    log_path: Path,
    *,
    config: ExperimentConfig,
    epoch: int,
    train_loss: float,
    val_loss: float,
    val_error: float,
    best_val_error: float,
    checkpoint_saved: bool,
) -> None:
    is_new_file = not log_path.exists()
    log_path.parent.mkdir(parents=True, exist_ok=True)
    with log_path.open("a", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=[
                "experiment",
                "epoch",
                "train_loss",
                "val_loss",
                "val_position_error",
                "best_val_error",
                "checkpoint_saved",
            ],
        )
        if is_new_file:
            writer.writeheader()
        writer.writerow(
            {
                "experiment": config.name,
                "epoch": epoch,
                "train_loss": f"{train_loss:.6f}",
                "val_loss": f"{val_loss:.6f}",
                "val_position_error": f"{val_error:.6f}",
                "best_val_error": f"{best_val_error:.6f}",
                "checkpoint_saved": "1" if checkpoint_saved else "0",
            }
        )


def build_training_state(
    *,
    build_model: Callable[[], nn.Module],
    config: ExperimentConfig,
) -> tuple[TrainingState, Path]:
    run_dir = find_latest_run_dir()
    examples = discover_examples(run_dir)
    train_examples, test_examples = split_examples(
        examples,
        train_size=config.train_size,
        test_size=config.test_size,
        seed=config.seed,
    )

    train_dataset = BeatPositionDataset(train_examples)
    test_dataset = BeatPositionDataset(test_examples)
    train_loader = DataLoader(train_dataset, batch_size=config.batch_size, shuffle=True)
    test_loader = DataLoader(test_dataset, batch_size=config.batch_size, shuffle=False)

    device = get_torch_device()
    model = build_model().to(device)
    optimizer = Adam(model.parameters(), lr=config.learning_rate)
    loss_fn = nn.SmoothL1Loss()

    return (
        TrainingState(
            model=model,
            optimizer=optimizer,
            loss_fn=loss_fn,
            train_loader=train_loader,
            test_loader=test_loader,
            device=device,
        ),
        run_dir,
    )


def train_one_epoch(state: TrainingState) -> float:
    state.model.train()
    total_loss = 0.0
    total_examples = 0

    for batch_x, batch_y in state.train_loader:
        batch_x = batch_x.to(state.device, dtype=torch.float32)
        batch_y = batch_y.to(state.device, dtype=torch.float32).view(-1, 1)

        state.optimizer.zero_grad(set_to_none=True)
        predictions = state.model(batch_x)
        loss = state.loss_fn(predictions, batch_y)
        loss.backward()
        state.optimizer.step()

        batch_size = batch_x.size(0)
        total_examples += batch_size
        total_loss += loss.item() * batch_size

    return total_loss / max(1, total_examples)


def evaluate(state: TrainingState, window_samples: int) -> tuple[float, float]:
    state.model.eval()
    total_loss = 0.0
    total_error = 0.0
    total_examples = 0

    with torch.no_grad():
        for batch_x, batch_y in state.test_loader:
            batch_x = batch_x.to(state.device, dtype=torch.float32)
            batch_y = batch_y.to(state.device, dtype=torch.float32).view(-1, 1)
            predictions = state.model(batch_x)
            loss = state.loss_fn(predictions, batch_y)

            predicted_samples = torch.round(predictions.squeeze(1) * (window_samples - 1))
            true_samples = torch.round(batch_y.squeeze(1) * (window_samples - 1))
            batch_errors = [
                normalized_position_error(int(pred), int(true), window_samples)
                for pred, true in zip(predicted_samples.tolist(), true_samples.tolist())
            ]

            batch_size = batch_x.size(0)
            total_examples += batch_size
            total_loss += loss.item() * batch_size
            total_error += sum(batch_errors)

    mean_loss = total_loss / max(1, total_examples)
    mean_error = total_error / max(1, total_examples)
    return mean_loss, mean_error


def run_training_experiment(
    *,
    build_model: Callable[[], nn.Module],
    config: ExperimentConfig,
) -> None:
    torch.manual_seed(config.seed)
    state, run_dir = build_training_state(build_model=build_model, config=config)
    print(f"Experiment: {config.name}")
    print(f"Training run directory: {run_dir}")
    print(f"Device: {state.device}")
    print(f"Train size: {len(state.train_loader.dataset)}")
    print(f"Test size: {len(state.test_loader.dataset)}")
    print(f"Batch size: {config.batch_size}")
    print(f"Epochs: {config.epochs}")
    print(f"Early stop patience: {config.patience}")
    print(f"Learning rate: {config.learning_rate}")

    checkpoint = load_checkpoint(config.checkpoint_path, state.device)
    run_id = _run_id_from_checkpoint(checkpoint)
    metrics_log_path = _metrics_log_path(config.checkpoint_path, run_id)
    start_epoch = 1
    best_val_error = float("inf")
    if checkpoint is not None:
        state.model.load_state_dict(checkpoint["model_state_dict"])
        state.optimizer.load_state_dict(checkpoint["optimizer_state_dict"])
        start_epoch = int(checkpoint["epoch"]) + 1
        best_val_error = float(checkpoint.get("best_val_error", float("inf")))
        print(f"Resuming from checkpoint at epoch {start_epoch - 1}")
    print(f"Metrics log: {metrics_log_path}")

    epochs_without_improvement = 0
    for epoch in range(start_epoch, config.epochs + 1):
        train_loss = train_one_epoch(state)
        val_loss, val_error = evaluate(state, config.window_samples)
        print(
            f"Epoch {epoch:02d} | "
            f"train_loss={train_loss:.6f} | "
            f"val_loss={val_loss:.6f} | "
            f"val_position_error={val_error:.6f}"
        )

        checkpoint_saved = False
        if val_error < best_val_error:
            best_val_error = val_error
            epochs_without_improvement = 0
            save_checkpoint(
                config.checkpoint_path,
                {
                    "epoch": epoch,
                    "model_state_dict": state.model.state_dict(),
                    "optimizer_state_dict": state.optimizer.state_dict(),
                    "best_val_error": best_val_error,
                    "run_id": run_id,
                    "train_size": config.train_size,
                    "test_size": config.test_size,
                    "batch_size": config.batch_size,
                    "learning_rate": config.learning_rate,
                    "window_samples": config.window_samples,
                },
            )
            print(f"Saved checkpoint to {config.checkpoint_path}")
            checkpoint_saved = True

        _append_metrics_row(
            metrics_log_path,
            config=config,
            epoch=epoch,
            train_loss=train_loss,
            val_loss=val_loss,
            val_error=val_error,
            best_val_error=best_val_error,
            checkpoint_saved=checkpoint_saved,
        )

        if not checkpoint_saved:
            epochs_without_improvement += 1
            if epochs_without_improvement >= config.patience:
                print(f"Early stopping after {config.patience} epochs without validation improvement.")
                break
