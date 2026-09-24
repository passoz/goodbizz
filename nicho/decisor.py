"""Cliente do decisor (System One / laya) + modo simulado.

O `url` aponta para o endpoint System One do decisor — o mesmo padrao de endpoint
do Jev, `POST /v1/systemone`:
    POST {url}
    {"state": ..., "model": ...,
     "questions": {"id": {"type": "noul|choice|score", "instructions": ..., "criteria": ...}}}
    -> {"answers": {"id": {...}}}
So o campo `answers` e lido: `noul` traz a probabilidade, `choice` traz
`probabilities` e `score` traz o nivel esperado.
"""
from __future__ import annotations

import hashlib
import json
import time
import urllib.error
import urllib.request
from typing import Any, Protocol


class Decisor(Protocol):
    def ask(self, state: str, questions: dict[str, dict]) -> dict[str, dict]: ...
    def perguntar(self, state: str, perguntas: dict[str, str]) -> dict[str, float]:
        """Interface exigida pelo algoritmo_teste_dor: {id: P(sim)}."""
        ...


def _p(resposta: dict) -> float:
    """Extrai a probabilidade de 'sim' de uma resposta bool/noul."""
    for campo in ("noul", "bool", "probability", "probabilidade", "p", "score"):
        if campo in resposta:
            try:
                return float(resposta[campo])
            except (TypeError, ValueError):
                pass
    raise ValueError(f"resposta sem probabilidade: {resposta}")


class DecisorHttp:
    def __init__(self, url: str, model: str, key: str = "", timeout: float = 60.0,
                 tentativas: int = 3) -> None:
        self.url, self.model, self.key = url, model, key
        self.timeout, self.tentativas = timeout, tentativas

    def ask(self, state: str, questions: dict[str, dict]) -> dict[str, dict]:
        corpo = {"state": state, "model": self.model, "questions": questions}
        dados = json.dumps(corpo, ensure_ascii=False).encode()
        ultimo: Exception | None = None
        for n in range(self.tentativas):
            try:
                req = urllib.request.Request(
                    self.url, data=dados,
                    headers={"Content-Type": "application/json",
                             **({"Authorization": f"Bearer {self.key}"} if self.key else {})})
                with urllib.request.urlopen(req, timeout=self.timeout) as r:
                    return json.loads(r.read())["answers"]
            except urllib.error.HTTPError as e:
                # o corpo traz o motivo real (ex.: "type must be choice, score or noul");
                # sem ele o erro fica impossivel de diagnosticar
                corpo = ""
                try:
                    corpo = e.read().decode(errors="replace")[:400]
                except Exception:
                    pass
                if e.code in (400, 401, 403):
                    raise RuntimeError(
                        f"decisor recusou a requisicao ({e.code}): {corpo or e.reason}") from e
                ultimo = e
                time.sleep(1.5 * (n + 1))
            except (urllib.error.URLError, TimeoutError, KeyError, json.JSONDecodeError) as e:
                ultimo = e
                time.sleep(1.5 * (n + 1))
        raise RuntimeError(f"decisor falhou apos {self.tentativas} tentativas: {ultimo}")

    def perguntar(self, state: str, perguntas: dict[str, str]) -> dict[str, float]:
        qs = {pid: {"type": "noul", "instructions": txt} for pid, txt in perguntas.items()}
        return {pid: _p(ans) for pid, ans in self.ask(state, qs).items()}


class DecisorMock:
    """Deterministico: mesma entrada -> mesma saida. Nao mede nada, so exercita o pipeline."""

    def __init__(self, semente: str = "mock") -> None:
        self.semente = semente

    def _valor(self, *partes: str) -> float:
        h = hashlib.sha256(("|".join((self.semente, *partes))).encode()).digest()
        return round(int.from_bytes(h[:4], "big") / 0xFFFFFFFF, 2)

    def ask(self, state: str, questions: dict[str, dict]) -> dict[str, dict]:
        saida: dict[str, dict] = {}
        for pid, q in questions.items():
            tipo = q.get("type", "noul")
            base = self._valor(state[-120:], pid)
            if tipo == "choice":
                crit = list(q.get("criteria") or {"a": None, "b": None, "c": None})
                vencedor = crit[min(len(crit) - 1, int(base * len(crit)))]
                probs = {c: (1.0 if c == vencedor else 0.0) for c in crit}
                saida[pid] = {"choice": vencedor, "probabilities": probs, "confidence": 0.8}
            elif tipo == "score":
                n = len(q.get("criteria") or ["0", "1", "2"])
                saida[pid] = {"score": round(base * (n - 1), 2), "confidence": 0.7,
                              "probabilities": {str(i): (1.0 if i == round(base * (n - 1)) else 0.0)
                                                for i in range(n)}}
            else:
                saida[pid] = {"noul": base}
        return saida

    def perguntar(self, state: str, perguntas: dict[str, str]) -> dict[str, float]:
        qs = {pid: {"type": "noul", "instructions": txt} for pid, txt in perguntas.items()}
        return {pid: _p(ans) for pid, ans in self.ask(state, qs).items()}


def construir(cfg) -> Decisor:
    if cfg.mock_decisor or not cfg.decisor_url:
        return DecisorMock()
    return DecisorHttp(cfg.decisor_url, cfg.decisor_model, cfg.decisor_key, cfg.timeout)


__all__ = ["Decisor", "DecisorHttp", "DecisorMock", "construir", "_p"]
