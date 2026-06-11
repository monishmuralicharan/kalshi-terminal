import os
from dataclasses import dataclass


def _float(name: str, default: float) -> float:
    return float(os.getenv(name, str(default)))


def _int(name: str, default: int) -> int:
    return int(os.getenv(name, str(default)))


@dataclass(frozen=True)
class Config:
    anomaly_scorer_interval_sec: int = _int("ANOMALY_SCORER_INTERVAL_SEC", 300)
    baseline_refresh_interval_sec: int = _int("BASELINE_REFRESH_INTERVAL_SEC", 3600)
    baseline_lookback_days: int = _int("BASELINE_LOOKBACK_DAYS", 7)
    volume_spike_multiplier: float = _float("VOLUME_SPIKE_MULTIPLIER", 3.0)
    price_move_threshold: float = _float("PRICE_MOVE_THRESHOLD", 0.05)
    trade_cluster_multiplier: float = _float("TRADE_CLUSTER_MULTIPLIER", 3.0)
    rapid_resolution_hours: int = _int("RAPID_RESOLUTION_HOURS", 2)
    rapid_resolution_price_threshold: float = _float("RAPID_RESOLUTION_PRICE_THRESHOLD", 0.10)
    pin_threshold: float = _float("PIN_THRESHOLD", 0.15)
    pin_min_days: int = _int("PIN_MIN_DAYS", 5)
    news_buffer_minutes: int = _int("NEWS_BUFFER_MINUTES", 15)
    volume_window_minutes: int = _int("VOLUME_WINDOW_MINUTES", 30)
    price_window_minutes: int = _int("PRICE_WINDOW_MINUTES", 30)
    cluster_window_minutes: int = _int("CLUSTER_WINDOW_MINUTES", 5)


def load_config() -> Config:
    return Config()
