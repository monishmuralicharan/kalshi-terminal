from datetime import datetime, timedelta, timezone

from ..config import Config
from ..db import Database


def check_price_no_news(
    db: Database,
    config: Config,
    market_id: str,
    market_title: str,
    now: datetime | None = None,
) -> dict | None:
    now = now or datetime.now(timezone.utc)
    window_start = now - timedelta(minutes=config.price_window_minutes)
    stats = db.fetch_trade_stats(market_id, window_start, now)

    first_price = stats.get("first_price")
    last_price = stats.get("last_price")
    if first_price is None or last_price is None:
        return None

    price_delta = abs(float(last_price) - float(first_price))
    if price_delta < config.price_move_threshold:
        return None

    news_start = window_start - timedelta(minutes=config.news_buffer_minutes)
    news_end = now + timedelta(minutes=config.news_buffer_minutes)
    article_count = db.count_linked_articles(market_id, news_start, news_end)
    if article_count > 0:
        return None

    from .category import classify_market

    score = min(1.0, price_delta / (config.price_move_threshold * 3))

    return {
        "signal_type": "price_no_news",
        "score": score,
        "window_start": window_start,
        "window_end": now,
        "details": {
            "category": classify_market(market_title),
            "price_delta": round(price_delta, 4),
            "first_price": float(first_price),
            "last_price": float(last_price),
            "article_count": article_count,
            "news_search_start": news_start.isoformat(),
            "news_search_end": news_end.isoformat(),
        },
    }
