"""Synthetic training source used only by the provenance example."""

MODEL_VERSION = "v1"
RANDOM_SEED = 42691


def train(records):
    """Return a deterministic toy model summary without loading external data."""
    return {"version": MODEL_VERSION, "record_count": len(records), "seed": RANDOM_SEED}
