from __future__ import annotations

import torch
from torch import nn


class BeatPositionCNN(nn.Module):
    """Small 1D CNN that predicts the beat position inside a fixed ECG window."""

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
            # Collapse each channel into one summary so the model can predict a
            # single beat position even if the exact window length changes later.
            nn.AdaptiveAvgPool1d(1),
        )
        self.regressor = nn.Sequential(
            # Mix the learned ECG descriptors into a compact representation.
            nn.Flatten(),
            nn.Linear(64, 32),
            nn.ReLU(),
            # Final scalar output: normalized beat position inside the window.
            nn.Linear(32, 1),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """Return one normalized beat-position prediction per input window."""
        x = self.features(x)
        x = self.regressor(x)
        return x


def build_model() -> BeatPositionCNN:
    """Convenience helper for future training scripts."""
    return BeatPositionCNN()

