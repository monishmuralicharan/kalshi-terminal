from dataclasses import dataclass

import numpy as np
from scipy.optimize import minimize


@dataclass
class PINResult:
    alpha: float
    delta: float
    epsilon_b: float
    epsilon_s: float
    mu: float
    pin: float
    loglikelihood: float
    method: str = "EHO2010"


class PINEstimator:
    """Easley-Hvidkjaer-O'Hara (2002) PIN via EHO2010 factorized log-likelihood."""

    def __init__(self, buys: np.ndarray, sells: np.ndarray) -> None:
        self.buys = np.asarray(buys, dtype=float)
        self.sells = np.asarray(sells, dtype=float)
        if len(self.buys) != len(self.sells):
            raise ValueError("buys and sells must have same length")
        if len(self.buys) == 0:
            raise ValueError("need at least one day of trade data")

    @staticmethod
    def _pin_from_params(alpha: float, epsilon_b: float, epsilon_s: float, mu: float) -> float:
        denom = alpha * mu + epsilon_b + epsilon_s
        if denom <= 0:
            return 0.0
        return float((alpha * mu) / denom)

    def _loglikelihood_eho2010(self, params: np.ndarray) -> float:
        alpha, delta, epsilon_b, epsilon_s, mu = params
        alpha = np.clip(alpha, 1e-9, 1 - 1e-9)
        delta = np.clip(delta, 1e-9, 1 - 1e-9)
        epsilon_b = max(epsilon_b, 1e-9)
        epsilon_s = max(epsilon_s, 1e-9)
        mu = max(mu, 1e-9)

        x_b = epsilon_b / (mu + epsilon_b)
        x_s = epsilon_s / (mu + epsilon_s)

        ll = 0.0
        for b, s in zip(self.buys, self.sells):
            m_i = min(b, s) + max(b, s) / 2.0
            term1 = alpha * (1 - delta) * np.exp(-mu) * (x_s ** (s - m_i)) * (x_b ** (-m_i))
            term2 = alpha * delta * np.exp(-mu) * (x_b ** (b - m_i)) * (x_s ** (-m_i))
            term3 = (1 - alpha) * (x_s ** (s - m_i)) * (x_b ** (b - m_i))
            inner = term1 + term2 + term3
            if inner <= 0:
                return 1e12
            ll += (
                -epsilon_b
                - epsilon_s
                + m_i * (np.log(x_b) + np.log(x_s))
                + b * np.log(mu + epsilon_b)
                + s * np.log(mu + epsilon_s)
                + np.log(inner)
            )
        return -ll

    def _initial_param_grid(self) -> list[np.ndarray]:
        grids = []
        for alpha in (0.2, 0.4, 0.6):
            for delta in (0.3, 0.5, 0.7):
                for eps in (10.0, 30.0, 50.0):
                    for mu in (20.0, 50.0, 80.0):
                        grids.append(np.array([alpha, delta, eps, eps, mu], dtype=float))
        return grids

    def estimate(self, method: str = "EHO2010") -> PINResult:
        bounds = [
            (1e-6, 1 - 1e-6),  # alpha
            (1e-6, 1 - 1e-6),  # delta
            (1e-3, 1e4),       # epsilon_b
            (1e-3, 1e4),       # epsilon_s
            (1e-3, 1e4),       # mu
        ]

        best = None
        for init in self._initial_param_grid():
            try:
                result = minimize(
                    self._loglikelihood_eho2010,
                    init,
                    method="L-BFGS-B",
                    bounds=bounds,
                )
                if best is None or result.fun < best.fun:
                    best = result
            except Exception:
                continue

        if best is None or not best.success:
            mean_b = float(np.mean(self.buys))
            mean_s = float(np.mean(self.sells))
            alpha, delta, epsilon_b, epsilon_s, mu = 0.3, 0.5, mean_b, mean_s, 10.0
            ll = -self._loglikelihood_eho2010(np.array([alpha, delta, epsilon_b, epsilon_s, mu]))
        else:
            alpha, delta, epsilon_b, epsilon_s, mu = best.x
            ll = -best.fun

        pin = self._pin_from_params(alpha, epsilon_b, epsilon_s, mu)
        return PINResult(
            alpha=float(alpha),
            delta=float(delta),
            epsilon_b=float(epsilon_b),
            epsilon_s=float(epsilon_s),
            mu=float(mu),
            pin=float(np.clip(pin, 0.0, 1.0)),
            loglikelihood=float(ll),
            method=method,
        )
