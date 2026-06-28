from __future__ import annotations

import torch
from torch import nn


class BeatPositionCNNTemporalMap(nn.Module):
    """CNN that keeps the final time axis for beat-position regression."""

    def __init__(self) -> None:
        super().__init__()
        self.features = nn.Sequential(
            nn.Conv1d(1, 16, kernel_size=7, stride=2, padding=3),
            nn.BatchNorm1d(16),
            nn.SiLU(),
            nn.Conv1d(16, 32, kernel_size=5, stride=2, padding=2),
            nn.BatchNorm1d(32),
            nn.SiLU(),
            nn.Conv1d(32, 64, kernel_size=5, stride=2, padding=2),
            nn.BatchNorm1d(64),
            nn.SiLU(),
        )
        self.regressor = nn.Sequential(
            nn.Flatten(),
            nn.LazyLinear(64),
            nn.SiLU(),
            nn.Linear(64, 1),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = self.features(x)
        x = self.regressor(x)
        return x


def build_model() -> BeatPositionCNNTemporalMap:
    return BeatPositionCNNTemporalMap()
