from datetime import datetime, timedelta, timezone

from ..config import Config
from ..db import Database


def check_rapid_resolution(
    db: Database,
    config: Config,
    market_id: str,
    market_title: str,
    closes_at: datetime | None,
    now: datetime | None = None,
) -> dict | None:
    if closes_at is None:
        return None

    now = now or datetime.now(timezone.utc)
    if closes_at.tzinfo is None:
        closes_at = closes_at.replace(tzinfo=timezone.utc)

    hours_to_close = (closes_at - now).total_seconds() / 3600.0
    if hours_to_close < 0 or hours_to_close > config.rapid_resolution_hours:
        return None

    window_start = now - timedelta(hours=config.rapid_resolution_hours)
    stats = db.fetch_trade_stats(market_id, window_start, now)
    volume = float(stats.get("volume") or 0)
    if volume <= 0:
        return None

    first_price = stats.get("first_price")
    last_price = stats.get("last_price")
    if first_price is None or last_price is None:
        return None

    price_delta = abs(float(last_price) - float(first_price))
    if price_delta < config.rapid_resolution_price_threshold:
        return None

    from .category import classify_market

    score = min(
        1.0,
        (price_delta / config.rapid_resolution_price_threshold) * 0.5
        + min(volume / 100.0, 0.5),
    )

    return {
        "signal_type": "rapid_resolution",
        "score": score,
        "window_start": window_start,
        "window_end": now,
        "details": {
            "category": classify_market(market_title),
            "volume": volume,
            "price_delta": round(price_delta, 4),
            "hours_to_close": round(hours_to_close, 2),
            "closes_at": closes_at.isoformat(),
        },
    }
