#!/usr/bin/env python3
"""Automated 'strong pain vs. weak pain' test for product ideas.

Evaluates, via a System One decider, the core question:
    "Does this pain take money from the owner today, or damage their reputation today?"

Five reliability mechanisms:
  1. DECOMPOSITION  - 4 atomic probes instead of 1 umbrella question.
  2. ENSEMBLE      - Each probe is asked in 3 independent paraphrases.
  3. VARIANCE     - Deviation between paraphrases is computed; above threshold -> UNSTABLE.
  4. HIGH THRESHOLD - Threshold chosen to eliminate false positives (false "STRONG").
  5. ESCALATION   - Borderline cases are escalated for human review.
"""
from __future__ import annotations

import json
import statistics
import sys
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from typing import Any, Callable, Protocol

# --------------------------------------------------------------------------
# Parameters (calibrated over 17 cases)
# --------------------------------------------------------------------------

STRONG_THRESHOLD = 0.65     # >= this and dominant -> STRONG PAIN
WEAK_THRESHOLD = 0.50       # >= this and dominant -> WEAK PAIN
UNSTABLE_THRESHOLD = 0.15   # deviation between paraphrases above this -> UNSTABLE
MIN_PARAPHRASES = 3         # fewer than this is unreliable

# Backwards compatibility aliases
LIMIAR_FORTE = STRONG_THRESHOLD
LIMIAR_FRACA = WEAK_THRESHOLD
LIMIAR_INSTAVEL = UNSTABLE_THRESHOLD
MIN_PARAFRASES = MIN_PARAPHRASES

# --------------------------------------------------------------------------
# Probes: 4 atomic questions x 3 paraphrases
# --------------------------------------------------------------------------

PROBES: dict[str, dict[str, str]] = {
    "v1": {
        "dinheiro": (
            "Se o dono NÃO tiver essa solução, ele perde dinheiro que entraria hoje "
            "(ex.: venda perdida, cliente que desiste, cobrança que não acontece)?"
        ),
        "reputacao": (
            "Se o dono NÃO tiver essa solução, ele fica mal falado publicamente "
            "(ex.: avaliação ruim no Google/TripAdvisor, cliente reclamando para outros)?"
        ),
        "processo": (
            "Essa solução serve principalmente para organizar processos internos ou economizar "
            "tempo da equipe, sem impacto direto e imediato em vendas ou reputação?"
        ),
        "tecnologia": (
            "Essa solução é basicamente 'modernização tecnológica' (ter app, ter IA, ter site bonito) "
            "que o dono compra por vaidade ou porque os outros têm, e não por dor concreta?"
        ),
    },
    "v2": {
        "dinheiro": (
            "A falta dessa solução causa sangria financeira visível no caixa do negócio esta semana?"
        ),
        "reputacao": (
            "A falta dessa solução queima o nome do negócio com clientes a ponto de virar queixa pública?"
        ),
        "processo": (
            "O benefício principal é eficiência operacional interna (menos retrabalho, equipe mais organizada)?"
        ),
        "tecnologia": (
            "O apelo principal é tecnológico/inovação ('ter inteligência artificial', 'automatizar tudo') "
            "mais do que resolver um prejuízo palpável?"
        ),
    },
    "v3": {
        "dinheiro": (
            "O dono do negócio sente no bolso, em reais, todo mês que não usa uma solução como essa?"
        ),
        "reputacao": (
            "Um cliente insatisfeito por causa desse problema provavelmente deixará uma nota ruim ou fará propaganda negativa?"
        ),
        "processo": (
            "Essa solução é um 'nice to have' de gestão interna que a operação consegue empurrar com a barriga se o orçamento apertar?"
        ),
        "tecnologia": (
            "Essa ideia parece mais uma solução procurando um problema do que a resposta a uma dor que tira o sono do dono?"
        ),
    },
}

SONDAS = PROBES
STRONG_PROBES = ("dinheiro", "reputacao")
INTERNAL_PROBES = ("processo", "tecnologia")
SONDAS_FORTES = STRONG_PROBES
SONDAS_INTERNAS = INTERNAL_PROBES

DEFAULT_CONTEXT = (
    "Contexto do mercado: pousadas de até 20 quartos, hotéis boutique, hostels e "
    "pequenos meios de hospedagem no Brasil. Donos operacionais, sem equipe de TI, "
    "orçamento curto, atendem no balcão e no WhatsApp."
)
CONTEXTO_PADRAO = DEFAULT_CONTEXT

# --------------------------------------------------------------------------
# Backends
# --------------------------------------------------------------------------


class Backend(Protocol):
    """Any decider that returns probabilities for question IDs."""

    def query_probes(self, state: str, probes: dict[str, str]) -> dict[str, float]:
        """probes: {id: instruction} -> {id: P(yes) in 0..1}"""
        ...

    def perguntar(self, state: str, perguntas: dict[str, str]) -> dict[str, float]:
        ...


@dataclass
class HttpBackend:
    """Adapter for any System One endpoint (Jev, Laya, local)."""

    url: str
    api_key: str | None = None
    model: str = "systemone-latest"
    timeout: float = 30.0
    extractor: Callable[[dict[str, Any]], dict[str, float]] | None = None

    def __post_init__(self) -> None:
        u = self.url.strip().rstrip("/")
        if u:
            parsed = urllib.parse.urlparse(u)
            if not parsed.path or parsed.path == "/":
                u = f"{u}/v1/systemone"
            elif parsed.path.endswith("/v1"):
                u = f"{u}/systemone"
            self.url = u

    def query_probes(self, state: str, probes: dict[str, str]) -> dict[str, float]:
        payload: dict[str, Any] = {
            "state": state,
            "questions": {
                pid: {"type": "noul", "instructions": text} for pid, text in probes.items()
            },
        }
        if self.model:
            payload["model"] = self.model
        headers = {"Content-Type": "application/json", "User-Agent": "goodbizz/1.0"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
            headers["x-api-key"] = self.api_key
        req = urllib.request.Request(
            self.url,
            data=json.dumps(payload, ensure_ascii=False).encode(),
            headers=headers,
        )
        with urllib.request.urlopen(req, timeout=self.timeout) as resp:
            body = json.loads(resp.read().decode("utf-8", errors="replace"))
        ext = self.extractor or default_extract
        return ext(body)

    def perguntar(self, state: str, perguntas: dict[str, str]) -> dict[str, float]:
        return self.query_probes(state, perguntas)


def default_extract(body: dict[str, Any]) -> dict[str, float]:
    out: dict[str, float] = {}
    answers = body.get("answers") or body.get("results") or body.get("data")
    if not isinstance(answers, dict):
        answers = {k: v for k, v in body.items() if isinstance(v, (dict, int, float))}
    for pid, ans in answers.items():
        if isinstance(ans, dict):
            for key in (
                "noul", "bool", "probabilidade", "probability", "p",
                "act_probability", "score", "value",
            ):
                if key in ans:
                    val = ans[key]
                    try:
                        out[pid] = 1.0 if val is True else (0.0 if val is False else float(val))
                        break
                    except (TypeError, ValueError):
                        pass
        else:
            try:
                out[pid] = float(ans)
            except (TypeError, ValueError):
                pass
    return out


_extrair_padrao = default_extract


@dataclass
class StubBackend:
    """Deterministic backend for offline self-test (no network)."""

    answers: dict[str, float]
    default: float = 0.5

    # Backwards compatibility
    respostas: dict[str, float] = field(default_factory=dict)
    padrao: float = 0.5

    def __post_init__(self) -> None:
        if self.respostas and not self.answers:
            self.answers = self.respostas
        if not self.respostas:
            self.respostas = self.answers
        if self.padrao != 0.5 and self.default == 0.5:
            self.default = self.padrao

    def query_probes(self, state: str, probes: dict[str, str]) -> dict[str, float]:
        return {pid: self.answers.get(pid, self.default) for pid in probes}

    def perguntar(self, state: str, perguntas: dict[str, str]) -> dict[str, float]:
        return self.query_probes(state, perguntas)


# --------------------------------------------------------------------------
# Algorithm
# --------------------------------------------------------------------------


@dataclass
class Result:
    label: str  # "FORTE" | "FRACA" | "INDETERMINADO" | "INSTAVEL"
    pain_score: float
    internal_score: float
    margin: float
    deviation: float
    escalate: bool
    reason: str
    detail: dict[str, float] = field(default_factory=dict)
    by_paraphrase: dict[str, dict[str, float]] = field(default_factory=dict)

    # Backwards compatibility properties
    @property
    def rotulo(self) -> str:
        return self.label

    @property
    def score_dor(self) -> float:
        return self.pain_score

    @property
    def escore_dor(self) -> float:
        return self.pain_score

    @property
    def score_interna(self) -> float:
        return self.internal_score

    @property
    def escore_interna(self) -> float:
        return self.internal_score

    @property
    def margem(self) -> float:
        return self.margin

    @property
    def desvio(self) -> float:
        return self.deviation

    @property
    def escalar(self) -> bool:
        return self.escalate

    @property
    def motivo(self) -> str:
        return self.reason

    @property
    def detalhe(self) -> dict[str, float]:
        return self.detail

    @property
    def por_parafrase(self) -> dict[str, dict[str, float]]:
        return self.by_paraphrase

    def summary(self) -> str:
        tag = "[ESCALATE]" if self.escalate else "          "
        return (
            f"{self.label:<13} pain={self.pain_score:.2f} internal={self.internal_score:.2f} "
            f"margin={self.margin:+.2f} dev={self.deviation:.3f}  {tag}  {self.reason}"
        )


Resultado = Result


def _probe_questions(variant: str) -> dict[str, str]:
    return {f"p_{k}": text for k, text in PROBES[variant].items()}


def evaluate(
    description: str,
    backend: Backend,
    context: str = DEFAULT_CONTEXT,
    variants: tuple[str, ...] = ("v1", "v2", "v3"),
) -> Result:
    """Run probes across all paraphrases and combine results."""
    if len(variants) < MIN_PARAPHRASES:
        raise ValueError(f"need at least {MIN_PARAPHRASES} paraphrases (received {len(variants)})")

    by_para: dict[str, dict[str, float]] = {}
    for var in variants:
        qs = _probe_questions(var)
        caller = getattr(backend, "query_probes", getattr(backend, "perguntar"))
        raw = caller(state=f"{context}\n\nIdeia:\n{description}", probes=qs) if hasattr(backend, "query_probes") else backend.perguntar(f"{context}\n\nIdeia:\n{description}", qs)
        by_para[var] = {k: float(raw[f"p_{k}"]) for k in PROBES[var]}

    probe_keys = list(PROBES[variants[0]].keys())
    means: dict[str, float] = {
        k: statistics.mean(by_para[v][k] for v in variants) for k in probe_keys
    }

    deviations = [
        statistics.pstdev(by_para[v][k] for v in variants) for k in probe_keys
    ]
    max_dev = max(deviations) if deviations else 0.0

    pain_score = max(means[k] for k in STRONG_PROBES)
    internal_score = max(means[k] for k in INTERNAL_PROBES)
    margin = pain_score - internal_score

    if max_dev > UNSTABLE_THRESHOLD:
        label = "INSTAVEL"
        escalate = True
        reason = (
            f"sondas divergem entre paráfrases (desvio {max_dev:.3f} > {UNSTABLE_THRESHOLD})"
        )
    elif pain_score >= STRONG_THRESHOLD and pain_score > internal_score:
        label = "FORTE"
        escalate = False
        reason = "dor com dono claro e dominante"
    elif internal_score >= WEAK_THRESHOLD and internal_score > pain_score:
        label = "FRACA"
        escalate = False
        reason = "dor interna, sem dono claro do prejuízo"
    else:
        label = "INDETERMINADO"
        escalate = True
        if pain_score < STRONG_THRESHOLD and internal_score < WEAK_THRESHOLD:
            reason = f"zona cinzenta: dor={pain_score:.2f} não supera o limiar seguro {STRONG_THRESHOLD}"
        else:
            reason = f"empate técnico: dor={pain_score:.2f} vs interna={internal_score:.2f} (margem {margin:+.2f})"

    return Result(
        label=label,
        pain_score=round(pain_score, 4),
        internal_score=round(internal_score, 4),
        margin=round(margin, 4),
        deviation=round(max_dev, 4),
        escalate=escalate,
        reason=reason,
        detail={k: round(v, 4) for k, v in means.items()},
        by_paraphrase=by_para,
    )


# Backwards compatibility alias
avaliar = evaluate


def recommend(res: Result) -> str:
    """Translate label into business decision recommendation."""
    if res.label == "FORTE" and not res.escalate:
        return "AVANÇAR — dor validada com dono claro; vá para precificação e pré-venda."
    if res.label == "FRACA" and not res.escalate:
        return "DESCARTAR OU REPOSICIONAR — dor interna; o dono não vê urgência em pagar."
    return "REVISAR À MÃO — não decida por este teste; veja o motivo e a margem."


recomendar = recommend


# --------------------------------------------------------------------------
# Self-test
# --------------------------------------------------------------------------


def self_test() -> int:
    strong = StubBackend({
        "p_dinheiro": 0.85, "p_reputacao": 0.40,
        "p_processo": 0.10, "p_tecnologia": 0.05,
    })
    weak = StubBackend({
        "p_dinheiro": 0.20, "p_reputacao": 0.15,
        "p_processo": 0.70, "p_tecnologia": 0.30,
    })
    grey = StubBackend({
        "p_dinheiro": 0.55, "p_reputacao": 0.50,
        "p_processo": 0.40, "p_tecnologia": 0.20,
    })
    noisy = StubBackend({"p_dinheiro": 0.90, "p_reputacao": 0.10})

    failures = 0

    r = evaluate("Ideia 1", strong)
    if r.label == "FORTE" and not r.escalate:
        print(f"[ok ] forte     -> {r.summary()}")
    else:
        print(f"[FAIL] forte: {r.summary()}")
        failures += 1

    r = evaluate("Ideia 2", weak)
    if r.label == "FRACA" and not r.escalate:
        print(f"[ok ] fraca     -> {r.summary()}")
    else:
        print(f"[FAIL] fraca: {r.summary()}")
        failures += 1

    r = evaluate("Ideia 3", grey)
    if r.label == "INDETERMINADO" and r.escalate:
        print(f"[ok ] cinzenta  -> {r.summary()}")
    else:
        print(f"[FAIL] cinzenta: {r.summary()}")
        failures += 1

    try:
        evaluate("Ideia 4", strong, variants=("v1",))
        print("[FAIL] permitiu 1 paráfrase só")
        failures += 1
    except ValueError:
        print("[ok ] rejeitou 1 paráfrase (guarda funcionando)")

    class NoisyBackend:
        def __init__(self) -> None:
            self.count = 0

        def query_probes(self, state: str, probes: dict[str, str]) -> dict[str, float]:
            self.count += 1
            val = 0.90 if self.count == 1 else 0.20
            return {
                "p_dinheiro": val, "p_reputacao": 0.10,
                "p_processo": 0.10, "p_tecnologia": 0.10,
            }

        def perguntar(self, state: str, perguntas: dict[str, str]) -> dict[str, float]:
            return self.query_probes(state, perguntas)

    r = evaluate("Ideia 5", NoisyBackend())
    if r.label == "INSTAVEL" and r.escalate:
        print(f"[ok ] ruidosa   -> {r.summary()}")
    else:
        print(f"[FAIL] ruidosa: {r.summary()}")
        failures += 1

    print("\nSELF-TEST:", "PASSOU" if not failures else f"{failures} FALHAS")
    return 1 if failures else 0


_self_test = self_test


if __name__ == "__main__":
    if "--self-test" in sys.argv:
        sys.exit(self_test())
    print(__doc__)
