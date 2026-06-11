import json
from datetime import datetime, timezone

from .baselines import hour_of_week
from .config import Config
from .db import Database
from .pin.estimator import PINEstimator
from .signals import (
    check_price_no_news,
    check_rapid_resolution,
    check_trade_cluster,
    check_volume_spike,
)


def _log(event: str, **fields) -> None:
    payload = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "service": "insider-detection",
        "event": event,
        **fields,
    }
    print(json.dumps(payload))


class AnomalyScorer:
    def __init__(self, db: Database, config: Config) -> None:
        self.db = db
        self.config = config

    def _check_pin(self, market_id: str, market_title: str) -> dict | None:
        daily_counts = self.db.fetch_daily_buy_sell_counts(
            market_id, lookback_days=self.config.baseline_lookback_days
        )
        if len(daily_counts) < self.config.pin_min_days:
            return None

        buys = [b for b, _ in daily_counts]
        sells = [s for _, s in daily_counts]
        if sum(buys) + sum(sells) == 0:
            return None

        try:
            result = PINEstimator(buys, sells).estimate()
        except Exception as exc:
            _log("pin_estimate_error", market_id=market_id, error=str(exc))
            return None

        if result.pin < self.config.pin_threshold:
            return None

        from .signals.category import classify_market

        now = datetime.now(timezone.utc)
        return {
            "signal_type": "pin_elevated",
            "score": min(1.0, result.pin / max(self.config.pin_threshold * 2, 0.01)),
            "window_start": now,
            "window_end": now,
            "pin_score": result.pin,
            "details": {
                "category": classify_market(market_title),
                "pin": round(result.pin, 4),
                "alpha": round(result.alpha, 4),
                "delta": round(result.delta, 4),
                "epsilon_b": round(result.epsilon_b, 2),
                "epsilon_s": round(result.epsilon_s, 2),
                "mu": round(result.mu, 2),
                "days_observed": len(daily_counts),
                "method": result.method,
            },
        }

    def score_market(self, market: dict) -> list[dict]:
        market_id = market["id"]
        title = market.get("title") or ""
        closes_at = market.get("closes_at")

        checks = [
            check_volume_spike(self.db, self.config, market_id, title),
            check_price_no_news(self.db, self.config, market_id, title),
            check_trade_cluster(self.db, self.config, market_id, title),
            check_rapid_resolution(self.db, self.config, market_id, title, closes_at),
            self._check_pin(market_id, title),
        ]
        return [c for c in checks if c is not None]

    def run_cycle(self) -> dict:
        start = datetime.now(timezone.utc)
        markets = self.db.fetch_open_markets()
        flagged = 0
        errors = 0

        for market in markets:
            try:
                hits = self.score_market(market)
                for hit in hits:
                    self.db.insert_anomaly(
                        market_id=market["id"],
                        window_start=hit["window_start"],
                        window_end=hit["window_end"],
                        signal_type=hit["signal_type"],
                        score=hit["score"],
                        details=hit["details"],
                        pin_score=hit.get("pin_score"),
                    )
                    flagged += 1
                    _log(
                        "anomaly_detected",
                        market_id=market["id"],
                        signal_type=hit["signal_type"],
                        score=round(hit["score"], 3),
                    )
            except Exception as exc:
                errors += 1
                _log("score_market_error", market_id=market["id"], error=str(exc))

        duration_ms = int((datetime.now(timezone.utc) - start).total_seconds() * 1000)
        summary = {
            "markets_scored": len(markets),
            "anomalies_written": flagged,
            "errors": errors,
            "duration_ms": duration_ms,
        }
        _log("score_cycle_complete", **summary)
        return summary
