import json
import os
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from typing import Any, Iterator

import psycopg2
import psycopg2.extras
import psycopg2.pool


def _build_dsn() -> str:
    if url := os.getenv("POSTGRES_URL"):
        return url
    host = os.environ["POSTGRES_HOST"]
    port = os.environ.get("POSTGRES_PORT", "5432")
    user = os.environ["POSTGRES_USER"]
    password = os.environ["POSTGRES_PASSWORD"]
    database = os.environ["POSTGRES_DB"]
    return f"host={host} port={port} user={user} password={password} dbname={database}"


class Database:
    def __init__(self) -> None:
        sslmode = "require" if os.getenv("POSTGRES_SSL", "").lower() in ("1", "true", "yes") else "prefer"
        dsn = _build_dsn()
        if "sslmode=" not in dsn and sslmode == "require":
            dsn += f" sslmode={sslmode}"
        self._pool = psycopg2.pool.ThreadedConnectionPool(1, 5, dsn)

    @contextmanager
    def connection(self) -> Iterator[Any]:
        conn = self._pool.getconn()
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            self._pool.putconn(conn)

    def fetch_open_markets(self) -> list[dict]:
        with self.connection() as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute(
                    """
                    SELECT id, title, yes_price, closes_at
                    FROM markets
                    WHERE is_open = true
                    ORDER BY id
                    """
                )
                return [dict(row) for row in cur.fetchall()]

    def fetch_baseline(self, market_id: str, hour_of_week: int) -> dict | None:
        with self.connection() as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute(
                    """
                    SELECT *
                    FROM market_baselines
                    WHERE market_id = %s AND hour_of_week = %s
                    """,
                    (market_id, hour_of_week),
                )
                row = cur.fetchone()
                return dict(row) if row else None

    def upsert_baselines(self, rows: list[tuple]) -> int:
        if not rows:
            return 0
        with self.connection() as conn:
            with conn.cursor() as cur:
                psycopg2.extras.execute_values(
                    cur,
                    """
                    INSERT INTO market_baselines (
                      market_id, hour_of_week, avg_volume_per_hour,
                      avg_price_volatility, avg_trade_count_5min, sample_days, computed_at
                    )
                    VALUES %s
                    ON CONFLICT (market_id, hour_of_week) DO UPDATE SET
                      avg_volume_per_hour = EXCLUDED.avg_volume_per_hour,
                      avg_price_volatility = EXCLUDED.avg_price_volatility,
                      avg_trade_count_5min = EXCLUDED.avg_trade_count_5min,
                      sample_days = EXCLUDED.sample_days,
                      computed_at = EXCLUDED.computed_at
                    """,
                    rows,
                )
                return len(rows)

    def count_linked_articles(
        self, market_id: str, window_start: datetime, window_end: datetime
    ) -> int:
        with self.connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT COUNT(*) FROM articles
                    WHERE published_at BETWEEN %s AND %s
                      AND EXISTS (
                        SELECT 1 FROM jsonb_array_elements(market_links) AS link
                        WHERE link->>'market_id' = %s
                           OR link->>'id' = %s
                      )
                    """,
                    (window_start, window_end, market_id, market_id),
                )
                return int(cur.fetchone()[0])

    def insert_anomaly(
        self,
        market_id: str,
        window_start: datetime,
        window_end: datetime,
        signal_type: str,
        score: float,
        details: dict,
        pin_score: float | None = None,
    ) -> None:
        with self.connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO anomalies (
                      detected_at, market_id, window_start, window_end,
                      signal_type, score, details, pin_score
                    )
                    VALUES (NOW(), %s, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        market_id,
                        window_start,
                        window_end,
                        signal_type,
                        score,
                        json.dumps(details),
                        pin_score,
                    ),
                )

    def fetch_recent_anomalies(
        self,
        since: datetime | None = None,
        signal_type: str | None = None,
        market_id: str | None = None,
        limit: int = 100,
    ) -> list[dict]:
        clauses = ["1=1"]
        params: list[Any] = []
        if since:
            clauses.append("detected_at >= %s")
            params.append(since)
        if signal_type:
            clauses.append("signal_type = %s")
            params.append(signal_type)
        if market_id:
            clauses.append("market_id = %s")
            params.append(market_id)
        params.append(limit)
        sql = f"""
            SELECT id, detected_at, market_id, window_start, window_end,
                   signal_type, score, details, pin_score, acknowledged
            FROM anomalies
            WHERE {' AND '.join(clauses)}
            ORDER BY detected_at DESC
            LIMIT %s
        """
        with self.connection() as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute(sql, params)
                rows = []
                for row in cur.fetchall():
                    item = dict(row)
                    if isinstance(item.get("details"), str):
                        item["details"] = json.loads(item["details"])
                    rows.append(item)
                return rows

    def fetch_trade_stats(
        self,
        market_id: str,
        window_start: datetime,
        window_end: datetime,
    ) -> dict:
        with self.connection() as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute(
                    """
                    SELECT
                      COALESCE(SUM(size), 0) AS volume,
                      COUNT(*) AS trade_count,
                      MIN(price) AS min_price,
                      MAX(price) AS max_price,
                      (ARRAY_AGG(price ORDER BY time ASC))[1] AS first_price,
                      (ARRAY_AGG(price ORDER BY time DESC))[1] AS last_price
                    FROM trades
                    WHERE market_id = %s AND time >= %s AND time < %s
                    """,
                    (market_id, window_start, window_end),
                )
                return dict(cur.fetchone())

    def fetch_daily_buy_sell_counts(
        self, market_id: str, lookback_days: int
    ) -> list[tuple[int, int]]:
        since = datetime.now(timezone.utc) - timedelta(days=lookback_days)
        with self.connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT
                      DATE(time AT TIME ZONE 'UTC') AS day,
                      COUNT(*) FILTER (WHERE direction = 'yes') AS buys,
                      COUNT(*) FILTER (WHERE direction = 'no') AS sells
                    FROM trades
                    WHERE market_id = %s AND time >= %s
                    GROUP BY day
                    ORDER BY day
                    """,
                    (market_id, since),
                )
                return [(int(b), int(s)) for _, b, s in cur.fetchall()]

    def close(self) -> None:
        self._pool.closeall()
