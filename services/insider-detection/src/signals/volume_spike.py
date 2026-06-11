from datetime import datetime, timedelta, timezone

from ..baselines import hour_of_week
from ..config import Config
from ..db import Database


def _score_from_multiplier(multiplier: float, threshold: float) -> float:
    if multiplier < threshold:
        return 0.0
    # 3x -> ~0.5, 5x+ -> ~1.0
    return min(1.0, (multiplier - threshold) / (threshold * 1.5) + 0.3)


def check_volume_spike(
    db: Database,
    config: Config,
    market_id: str,
    market_title: str,
    now: datetime | None = None,
) -> dict | None:
    now = now or datetime.now(timezone.utc)
    window_start = now - timedelta(minutes=config.volume_window_minutes)
    stats = db.fetch_trade_stats(market_id, window_start, now)
    volume = float(stats.get("volume") or 0)
    if volume <= 0:
        return None

    baseline = db.fetch_baseline(market_id, hour_of_week(now))
    if not baseline or baseline.get("avg_volume_per_hour", 0) <= 0:
        return None

    expected = float(baseline["avg_volume_per_hour"]) * (config.volume_window_minutes / 60.0)
    multiplier = volume / expected if expected > 0 else 0.0
    if multiplier < config.volume_spike_multiplier:
        return None

    from .category import classify_market

    return {
        "signal_type": "volume_spike",
        "score": _score_from_multiplier(multiplier, config.volume_spike_multiplier),
        "window_start": window_start,
        "window_end": now,
        "details": {
            "category": classify_market(market_title),
            "volume": volume,
            "expected_volume": expected,
            "multiplier": round(multiplier, 2),
            "baseline_avg_volume_per_hour": baseline["avg_volume_per_hour"],
            "sample_days": baseline.get("sample_days"),
        },
    }
