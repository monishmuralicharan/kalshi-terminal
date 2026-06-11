from datetime import datetime, timedelta, timezone

from .config import Config
from .db import Database


def hour_of_week(dt: datetime) -> int:
    """0-167 slot: day_of_week * 24 + hour (UTC)."""
    utc = dt.astimezone(timezone.utc)
    return utc.weekday() * 24 + utc.hour


class BaselineRefresher:
    def __init__(self, db: Database, config: Config) -> None:
        self.db = db
        self.config = config

    def refresh(self) -> int:
        lookback_days = self.config.baseline_lookback_days
        since = datetime.now(timezone.utc) - timedelta(days=lookback_days)

        with self.db.connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    WITH hourly AS (
                      SELECT
                        market_id,
                        (EXTRACT(DOW FROM time AT TIME ZONE 'UTC')::int * 24
                         + EXTRACT(HOUR FROM time AT TIME ZONE 'UTC')::int) AS hour_of_week,
                        DATE(time AT TIME ZONE 'UTC') AS trade_day,
                        SUM(size) AS hour_volume,
                        STDDEV(price) AS hour_price_stddev
                      FROM trades
                      WHERE time >= %s
                      GROUP BY market_id, hour_of_week, trade_day
                    ),
                    five_min AS (
                      SELECT
                        market_id,
                        (EXTRACT(DOW FROM time AT TIME ZONE 'UTC')::int * 24
                         + EXTRACT(HOUR FROM time AT TIME ZONE 'UTC')::int) AS hour_of_week,
                        DATE(time AT TIME ZONE 'UTC') AS trade_day,
                        date_bin('5 minutes', time, TIMESTAMPTZ '2000-01-01') AS bucket,
                        COUNT(*) AS bucket_trade_count
                      FROM trades
                      WHERE time >= %s
                      GROUP BY market_id, hour_of_week, trade_day, bucket
                    ),
                    hourly_agg AS (
                      SELECT
                        market_id,
                        hour_of_week,
                        AVG(hour_volume) AS avg_volume_per_hour,
                        AVG(COALESCE(hour_price_stddev, 0)) AS avg_price_volatility,
                        COUNT(DISTINCT trade_day) AS sample_days
                      FROM hourly
                      GROUP BY market_id, hour_of_week
                    ),
                    five_min_agg AS (
                      SELECT
                        market_id,
                        hour_of_week,
                        AVG(bucket_trade_count) AS avg_trade_count_5min
                      FROM five_min
                      GROUP BY market_id, hour_of_week
                    )
                    SELECT
                      h.market_id,
                      h.hour_of_week,
                      h.avg_volume_per_hour,
                      h.avg_price_volatility,
                      COALESCE(f.avg_trade_count_5min, 0) AS avg_trade_count_5min,
                      h.sample_days
                    FROM hourly_agg h
                    LEFT JOIN five_min_agg f
                      ON h.market_id = f.market_id AND h.hour_of_week = f.hour_of_week
                    """,
                    (since, since),
                )
                rows = [
                    (
                        r[0],
                        int(r[1]),
                        float(r[2] or 0),
                        float(r[3] or 0),
                        float(r[4] or 0),
                        int(r[5] or 0),
                        datetime.now(timezone.utc),
                    )
                    for r in cur.fetchall()
                ]

        return self.db.upsert_baselines(rows)
