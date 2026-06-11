from datetime import datetime, timedelta, timezone

from ..baselines import hour_of_week
from ..config import Config
from ..db import Database


def check_trade_cluster(
    db: Database,
    config: Config,
    market_id: str,
    market_title: str,
    now: datetime | None = None,
) -> dict | None:
    now = now or datetime.now(timezone.utc)
    window_start = now - timedelta(minutes=config.cluster_window_minutes)
    stats = db.fetch_trade_stats(market_id, window_start, now)
    trade_count = int(stats.get("trade_count") or 0)
    if trade_count <= 0:
        return None

    baseline = db.fetch_baseline(market_id, hour_of_week(now))
    if not baseline or baseline.get("avg_trade_count_5min", 0) <= 0:
        return None

    expected = float(baseline["avg_trade_count_5min"])
    multiplier = trade_count / expected if expected > 0 else 0.0
    if multiplier < config.trade_cluster_multiplier:
        return None

    from .category import classify_market

    score = min(1.0, (multiplier - config.trade_cluster_multiplier) / config.trade_cluster_multiplier + 0.4)

    return {
        "signal_type": "trade_cluster",
        "score": score,
        "window_start": window_start,
        "window_end": now,
        "details": {
            "category": classify_market(market_title),
            "trade_count": trade_count,
            "expected_trade_count": expected,
            "multiplier": round(multiplier, 2),
            "baseline_avg_trade_count_5min": baseline["avg_trade_count_5min"],
        },
    }
