#!/usr/bin/env python3
import json
import signal
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / ".env")

sys.path.insert(0, str(Path(__file__).resolve().parent))

from src.baselines import BaselineRefresher  # noqa: E402
from src.config import load_config  # noqa: E402
from src.db import Database  # noqa: E402
from src.scorer import AnomalyScorer  # noqa: E402


def _log(event: str, **fields) -> None:
    print(
        json.dumps(
            {
                "ts": datetime.now(timezone.utc).isoformat(),
                "service": "insider-detection",
                "event": event,
                **fields,
            }
        )
    )


def main() -> None:
    config = load_config()
    db = Database()
    baselines = BaselineRefresher(db, config)
    scorer = AnomalyScorer(db, config)

    running = True

    def handle_signal(signum, _frame):
        nonlocal running
        _log("shutdown_start", signal=signum)
        running = False

    signal.signal(signal.SIGINT, handle_signal)
    signal.signal(signal.SIGTERM, handle_signal)

    _log(
        "started",
        scorer_interval_sec=config.anomaly_scorer_interval_sec,
        baseline_interval_sec=config.baseline_refresh_interval_sec,
    )

    last_baseline = 0.0
    last_scorer = 0.0

    # Run baseline refresh once on startup if table is likely empty.
    try:
        count = baselines.refresh()
        _log("baseline_refresh_complete", rows_upserted=count, startup=True)
        last_baseline = time.monotonic()
    except Exception as exc:
        _log("baseline_refresh_error", error=str(exc), startup=True)

    while running:
        now = time.monotonic()

        if now - last_baseline >= config.baseline_refresh_interval_sec:
            try:
                count = baselines.refresh()
                _log("baseline_refresh_complete", rows_upserted=count)
            except Exception as exc:
                _log("baseline_refresh_error", error=str(exc))
            last_baseline = now

        if now - last_scorer >= config.anomaly_scorer_interval_sec:
            try:
                scorer.run_cycle()
            except Exception as exc:
                _log("score_cycle_error", error=str(exc))
            last_scorer = now

        time.sleep(1)

    db.close()
    _log("shutdown_complete")


if __name__ == "__main__":
    main()
