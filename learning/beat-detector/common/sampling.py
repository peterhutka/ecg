from __future__ import annotations

import random
from typing import Sequence, TypeVar

T = TypeVar("T")


def choose_random_examples(items: Sequence[T], count: int, seed: int) -> list[T]:
    if count < 0:
        raise ValueError("count must be non-negative")
    if not items:
        return []
    rng = random.Random(seed)
    return rng.sample(list(items), k=min(count, len(items)))
