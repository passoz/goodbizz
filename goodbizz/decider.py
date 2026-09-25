"""Decider client (System One) compatible with any provider (Jev, Laya, local) + mock mode.

Works with any endpoint implementing the System One standard:
    POST {url}
    {"state": ..., "model": ...,
     "questions": {"id": {"type": "noul|choice|score", "instructions": ..., "criteria": ...}}}
    -> {"answers": {"id": {...}}}

Supports authentication via Bearer token or x-api-key (compatible with Jev, Laya Studio,
custom gateways, and self-hosted runtimes such as GGUF, MLX, and local daemons).
Automatically normalizes URLs and tolerates variations in response envelope format.
"""
from __future__ import annotations

import hashlib
import json
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Protocol


class Decider(Protocol):
    def ask(self, state: str, questions: dict[str, dict]) -> dict[str, dict]: ...

    def query_probes(self, state: str, probes: dict[str, str]) -> dict[str, float]:
        """Simplified probe interface: {id: P(yes)}."""
        ...

    def perguntar(self, state: str, perguntas: dict[str, str]) -> dict[str, float]:
        """Backwards compatibility alias for query_probes."""
        ...


# Backwards compatibility alias
Decisor = Decider


def normalize_url(url: str) -> str:
    """Ensure the URL points to a valid System One endpoint.

    If the URL is a root API (e.g., https://api.typesafe.ai or https://api.laya.studio),
    it automatically appends /v1/systemone. If it already has a specific path
    (e.g., /v1/systemone, /api/predict, /api/decide), the given path is preserved.
    """
    url = url.strip().rstrip("/")
    if not url:
        return ""
    parsed = urllib.parse.urlparse(url)
    if not parsed.path or parsed.path == "/":
        return f"{url}/v1/systemone"
    if parsed.path.endswith("/v1"):
        return f"{url}/systemone"
    return url


# Backwards compatibility alias
normalizar_url = normalize_url


def extract_answers(body: Any, questions: dict[str, dict] | None = None) -> dict[str, dict]:
    """Extract answers dictionary tolerating multiple envelope structures."""
    if not isinstance(body, dict):
        raise ValueError(f"decider response is not a valid JSON object: {type(body)}")
    for key in ("answers", "results", "data", "questions", "decisions"):
        if key in body and isinstance(body[key], dict):
            return body[key]
    # If question IDs were returned directly at the root level:
    if questions and any(qid in body for qid in questions):
        return {
            qid: v for qid, v in body.items()
            if qid in questions and isinstance(v, (dict, int, float, str))
        }
    if "answers" in body and isinstance(body["answers"], dict):
        return body["answers"]
    raise KeyError(
        f"decider response without recognized answers envelope ('answers', 'results', 'data'): "
        f"{list(body.keys())[:10]}"
    )


_extrair_respostas = extract_answers


def extract_probability(response: Any) -> float:
    """Extract probability of 'yes' from a bool/noul response from any provider."""
    if isinstance(response, (int, float)):
        return float(response)
    if isinstance(response, dict):
        for field_name in (
            "noul", "bool", "probability", "probabilidade", "p",
            "score", "value", "act_probability",
        ):
            if field_name in response:
                val = response[field_name]
                if isinstance(val, bool):
                    return 1.0 if val else 0.0
                try:
                    return float(val)
                except (TypeError, ValueError):
                    pass
        if "choice" in response:
            choice = str(response["choice"]).strip().lower()
            if choice in ("true", "yes", "sim", "1"):
                return 1.0
            if choice in ("false", "no", "nao", "0"):
                return 0.0
    raise ValueError(f"response without recognizable probability: {response}")


# Backwards compatibility alias
_p = extract_probability


class DeciderHttp:
    """HTTP client compatible with any System One endpoint (Jev, Laya, local runtimes, etc.)."""

    def __init__(
        self,
        url: str,
        model: str = "",
        key: str = "",
        timeout: float = 60.0,
        retries: int = 3,
    ) -> None:
        self.url = normalize_url(url)
        self.model = model.strip() if model else ""
        self.key = key.strip() if key else ""
        self.timeout = timeout
        self.retries = retries

    def ask(self, state: str, questions: dict[str, dict]) -> dict[str, dict]:
        body: dict[str, Any] = {"state": state, "questions": questions}
        if self.model:
            body["model"] = self.model
        data = json.dumps(body, ensure_ascii=False).encode()
        headers = {
            "Content-Type": "application/json",
            "User-Agent": "goodbizz/1.0",
        }
        if self.key:
            headers["Authorization"] = f"Bearer {self.key}"
            headers["x-api-key"] = self.key
        last_exc: Exception | None = None
        for n in range(self.retries):
            try:
                req = urllib.request.Request(self.url, data=data, headers=headers)
                with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                    raw = json.loads(resp.read().decode("utf-8", errors="replace"))
                    return extract_answers(raw, questions)
            except urllib.error.HTTPError as err:
                error_body = ""
                try:
                    error_body = err.read().decode(errors="replace")[:400]
                except Exception:
                    pass
                if err.code in (400, 401, 403):
                    raise RuntimeError(
                        f"decider rejected request ({err.code}): {error_body or err.reason}"
                    ) from err
                last_exc = err
                time.sleep(1.5 * (n + 1))
            except (urllib.error.URLError, TimeoutError, KeyError, json.JSONDecodeError) as err:
                last_exc = err
                time.sleep(1.5 * (n + 1))
        raise RuntimeError(f"decider failed after {self.retries} attempts: {last_exc}")

    def query_probes(self, state: str, probes: dict[str, str]) -> dict[str, float]:
        qs = {pid: {"type": "noul", "instructions": text} for pid, text in probes.items()}
        return {pid: extract_probability(ans) for pid, ans in self.ask(state, qs).items()}

    def perguntar(self, state: str, perguntas: dict[str, str]) -> dict[str, float]:
        return self.query_probes(state, perguntas)


DecisorHttp = DeciderHttp


class DeciderMock:
    """Deterministic mock: same input -> same output. Exercises the full pipeline offline."""

    def __init__(self, seed: str = "mock") -> None:
        self.seed = seed

    def _value(self, *parts: str) -> float:
        digest = hashlib.sha256(("|".join((self.seed, *parts))).encode()).digest()
        return round(int.from_bytes(digest[:4], "big") / 0xFFFFFFFF, 2)

    def ask(self, state: str, questions: dict[str, dict]) -> dict[str, dict]:
        output: dict[str, dict] = {}
        for qid, q in questions.items():
            q_type = q.get("type", "noul")
            base = self._value(state[-120:], qid)
            if q_type == "choice":
                criteria = list(q.get("criteria") or {"a": None, "b": None, "c": None})
                winner = criteria[min(len(criteria) - 1, int(base * len(criteria)))]
                probs = {c: (1.0 if c == winner else 0.0) for c in criteria}
                output[qid] = {"choice": winner, "probabilities": probs, "confidence": 0.8}
            elif q_type == "score":
                n = len(q.get("criteria") or ["0", "1", "2"])
                score_val = round(base * (n - 1), 2)
                output[qid] = {
                    "score": score_val,
                    "confidence": 0.7,
                    "probabilities": {
                        str(i): (1.0 if i == round(score_val) else 0.0) for i in range(n)
                    },
                }
            else:
                output[qid] = {"noul": base}
        return output

    def query_probes(self, state: str, probes: dict[str, str]) -> dict[str, float]:
        qs = {pid: {"type": "noul", "instructions": text} for pid, text in probes.items()}
        return {pid: extract_probability(ans) for pid, ans in self.ask(state, qs).items()}

    def perguntar(self, state: str, perguntas: dict[str, str]) -> dict[str, float]:
        return self.query_probes(state, perguntas)


DecisorMock = DeciderMock


def build(cfg) -> Decider:
    mock_flag = getattr(cfg, "mock_decider", False) or getattr(cfg, "mock_decisor", False)
    decider_url = getattr(cfg, "decider_url", "") or getattr(cfg, "decisor_url", "")
    decider_model = getattr(cfg, "decider_model", "") or getattr(cfg, "decisor_model", "systemone-latest")
    decider_key = getattr(cfg, "decider_key", "") or getattr(cfg, "decisor_key", "")
    timeout = getattr(cfg, "timeout", 60.0)

    if mock_flag or not decider_url:
        return DeciderMock()
    return DeciderHttp(decider_url, decider_model, decider_key, timeout)


# Backwards compatibility alias
construir = build


__all__ = [
    "Decider", "DeciderHttp", "DeciderMock", "build", "normalize_url", "extract_probability",
    "Decisor", "DecisorHttp", "DecisorMock", "construir", "normalizar_url", "_p",
]
