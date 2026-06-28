from __future__ import annotations

import torch
from torch import nn


class BeatPositionCNNNoPool(nn.Module):
    """Baseline 1D CNN with the temporal feature map preserved."""

    def __init__(self) -> None:
        super().__init__()
        self.features = nn.Sequential(
            # Look for tiny local ECG shapes such as edges and steep slopes.
            nn.Conv1d(1, 16, kernel_size=7, stride=2),
            nn.ReLU(),
            # Combine nearby local features into richer waveform fragments.
            nn.Conv1d(16, 32, kernel_size=5, stride=2),
            nn.ReLU(),
            # Learn higher-level beat-like motifs from the intermediate features.
            nn.Conv1d(32, 64, kernel_size=5, stride=2),
            nn.ReLU(),
        )
        self.regressor = nn.Sequential(
            # Flatten keeps channel and time-position information.
            nn.Flatten(),
            nn.LazyLinear(32),
            nn.ReLU(),
            # Final scalar output: normalized beat position inside the window.
            nn.Linear(32, 1),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """Return one normalized beat-position prediction per input window."""
        x = self.features(x)
        x = self.regressor(x)
        return x


def build_model() -> BeatPositionCNNNoPool:
    """Convenience helper for training and preview scripts."""
    return BeatPositionCNNNoPool()

