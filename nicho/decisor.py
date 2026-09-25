"""Cliente do decisor (System One) compativel com qualquer provedor (Jev, Laya, locais) + modo simulado.

Funciona com qualquer endpoint que implemente o padrao System One:
    POST {url}
    {"state": ..., "model": ...,
     "questions": {"id": {"type": "noul|choice|score", "instructions": ..., "criteria": ...}}}
    -> {"answers": {"id": {...}}}

Suporta autenticacao via Bearer token ou x-api-key (compativel com Jev, Laya Studio,
gateways customizados e runtimes locais/self-hosted como GGUF, MLX e daemon local).
Normaliza a URL automaticamente e tolera variacoes no encapsulamento de resposta.
"""
from __future__ import annotations

import hashlib
import json
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Protocol


class Decisor(Protocol):
    def ask(self, state: str, questions: dict[str, dict]) -> dict[str, dict]: ...
    def perguntar(self, state: str, perguntas: dict[str, str]) -> dict[str, float]:
        """Interface exigida pelo algoritmo_teste_dor: {id: P(sim)}."""
        ...


def normalizar_url(url: str) -> str:
    """Garante que a URL aponte para um endpoint valido de System One.

    Se a URL for uma raiz (ex: https://api.typesafe.ai ou https://api.laya.studio),
    adiciona automaticamente /v1/systemone. Se ja trouxer um caminho especifico
    (ex: /v1/systemone, /api/predict, /api/decide), respeita o caminho informado.
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


def _extrair_respostas(corpo: Any, questions: dict[str, dict] | None = None) -> dict[str, dict]:
    """Extrai o bloco de respostas de forma tolerante a diferentes formatos de encapsulamento."""
    if not isinstance(corpo, dict):
        raise ValueError(f"resposta do decisor nao e um objeto JSON valido: {type(corpo)}")
    for campo in ("answers", "results", "data", "questions", "decisions"):
        if campo in corpo and isinstance(corpo[campo], dict):
            return corpo[campo]
    # Se os IDs das perguntas foram devolvidos diretamente no nivel raiz:
    if questions and any(qid in corpo for qid in questions):
        return {qid: v for qid, v in corpo.items() if qid in questions and isinstance(v, (dict, int, float, str))}
    if "answers" in corpo and isinstance(corpo["answers"], dict):
        return corpo["answers"]
    raise KeyError(
        f"resposta do decisor sem envelope de respostas ('answers', 'results', 'data'): "
        f"{list(corpo.keys())[:10]}"
    )


def _p(resposta: Any) -> float:
    """Extrai a probabilidade de 'sim' de uma resposta bool/noul de qualquer provedor."""
    if isinstance(resposta, (int, float)):
        return float(resposta)
    if isinstance(resposta, dict):
        for campo in ("noul", "bool", "probability", "probabilidade", "p", "score",
                      "value", "act_probability"):
            if campo in resposta:
                val = resposta[campo]
                if isinstance(val, bool):
                    return 1.0 if val else 0.0
                try:
                    return float(val)
                except (TypeError, ValueError):
                    pass
        if "choice" in resposta:
            c = str(resposta["choice"]).strip().lower()
            if c in ("true", "yes", "sim", "1"):
                return 1.0
            if c in ("false", "no", "nao", "0"):
                return 0.0
    raise ValueError(f"resposta sem probabilidade reconhecida: {resposta}")

class DecisorHttp:
    """Cliente HTTP compativel com qualquer endpoint System One (Jev, Laya, runtimes locais, etc.)."""

    def __init__(self, url: str, model: str = "", key: str = "", timeout: float = 60.0,
                 tentativas: int = 3) -> None:
        self.url = normalizar_url(url)
        self.model = model.strip() if model else ""
        self.key = key.strip() if key else ""
        self.timeout = timeout
        self.tentativas = tentativas

    def ask(self, state: str, questions: dict[str, dict]) -> dict[str, dict]:
        corpo: dict[str, Any] = {"state": state, "questions": questions}
        if self.model:
            corpo["model"] = self.model
        dados = json.dumps(corpo, ensure_ascii=False).encode()
        headers = {
            "Content-Type": "application/json",
            "User-Agent": "goodbizz/1.0",
        }
        if self.key:
            headers["Authorization"] = f"Bearer {self.key}"
            headers["x-api-key"] = self.key
        ultimo: Exception | None = None
        for n in range(self.tentativas):
            try:
                req = urllib.request.Request(self.url, data=dados, headers=headers)
                with urllib.request.urlopen(req, timeout=self.timeout) as r:
                    raw = json.loads(r.read().decode("utf-8", errors="replace"))
                    return _extrair_respostas(raw, questions)
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


__all__ = ["Decisor", "DecisorHttp", "DecisorMock", "construir", "normalizar_url", "_p"]
