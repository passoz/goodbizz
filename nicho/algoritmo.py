#!/usr/bin/env python3
"""
Teste automatizado de "dor forte vs dor fraca" para ideias de produto.

VENDORIZADO de `evolucsia/strategy/algoritmo_teste_dor.py`. Este repo mantem a
propria copia para nao depender de outro repositorio; se a calibracao mudar (as
sondas, as parafrases ou os limiares), atualize aqui de proposito.

Calibracao atual: limiares ajustados sobre 17 casos do nicho de turismo
(`LIMIAR_FORTE = 0.65`, `LIMIAR_FRACA = 0.50`, `LIMIAR_INSTAVEL = 0.15`).
Trocando de nicho, revalide antes de confiar no rotulo.

Simula, num decisor tipo System One, o teste de uma pergunta:
    "essa dor tira dinheiro do dono hoje, ou suja o nome dele hoje?"

Por que não é uma pergunta só
-----------------------------
Uma pergunta única e holística ("essa dor é forte?") é um proxy não validado e
instável. Este algoritmo entrega confiabilidade por cinco mecanismos:

  1. DECOMPOSIÇÃO  - 4 sondas atômicas (dinheiro / reputação / processo /
                     tecnologia) em vez de 1 pergunta guarda-chuva.
  2. ENSEMBLE      - cada sonda é perguntada em 3 paráfrases independentes.
                     Medido: 3 de 17 ideias mudam de veredito quando se usa
                     1 paráfrase só. O ensemble reduz isso.
  3. VARIÂNCIA     - desvio entre paráfrases é calculado e exposto; acima do
                     limite, a ideia é marcada INSTÁVEL em vez de classificada.
  4. LIMIAR ALTO   - o limiar é escolhido para zerar o erro perigoso
                     (falso "FORTE"), não para maximizar acertos.
  5. ESCALONAMENTO - o que cai na zona cinzenta vai para revisão humana, com o
                     motivo registrado. Nunca é forçado num binário.

Uso
---
    from algoritmo_teste_dor import avaliar, HttpBackend

    be = HttpBackend(url="https://SUA-API/v1/systemone", api_key="...")
    res = avaliar("Robô que tria o WhatsApp da pousada...", backend=be)
    print(res.rotulo, res.score_dor, res.margem, res.escalar)

    # autoteste offline (sem rede):
    python algoritmo_teste_dor.py --self-test

Calibração
----------
Os limiares abaixo foram ajustados sobre 17 casos reais já medidos. Com n=17
isso é AJUSTE, não validação. Revalide com casos novos antes de confiar.
"""

from __future__ import annotations

import json
import statistics
import sys
import urllib.request
from dataclasses import dataclass, field
from typing import Any, Callable, Protocol

# --------------------------------------------------------------------------
# Parâmetros (calibrados sobre 17 casos; ver relatório para a varredura)
# --------------------------------------------------------------------------

LIMIAR_FORTE = 0.65     # >= isto e dominante -> DOR FORTE
LIMIAR_FRACA = 0.50     # >= isto e dominante -> DOR FRACA
LIMIAR_INSTAVEL = 0.15  # desvio entre paráfrases acima disto -> INSTÁVEL
MIN_PARAFRASES = 3      # menos que isto e o resultado não é confiável

# --------------------------------------------------------------------------
# Sondas: 4 perguntas atômicas x 3 paráfrases
# --------------------------------------------------------------------------

SONDAS: dict[str, dict[str, str]] = {
    "A": {
        "dinheiro": (
            "Se este problema não for resolvido, o dono perde dinheiro de forma direta e "
            "perceptível (venda que não acontece, custo que sobe, prejuízo que aparece no caixa)?"
        ),
        "reputacao": (
            "Este produto protege a imagem pública do negócio (avaliação online, nota no Google, "
            "boca a boca do turista)?"
        ),
        "processo": (
            "O valor principal deste produto é organizar trabalho interno (documento, burocracia, "
            "planilha, mensagem) SEM que isso esteja ligado a dinheiro ou imagem que o dono perceba?"
        ),
        "tecnologia": (
            "Este produto existe para proteger ou viabilizar tecnologia/IA que o negócio já usa, "
            "sem efeito direto no dinheiro ou na imagem do dono?"
        ),
    },
    "B": {
        "dinheiro": "Esta ideia evita uma perda de dinheiro concreta que o dono já sofre hoje?",
        "reputacao": "Esta ideia evita que a reputação do negócio seja manchada publicamente?",
        "processo": (
            "A dor que esta ideia resolve é puramente operacional e interna, sem dono claro do "
            "prejuízo em dinheiro?"
        ),
        "tecnologia": "Esta ideia só faz sentido para quem já opera IA ou tecnologia própria?",
    },
    "C": {
        "dinheiro": "O dono pagaria por isso porque está perdendo dinheiro agora?",
        "reputacao": "O dono pagaria por isso com medo de uma avaliação ruim aparecer?",
        "processo": (
            "O dono pagaria por isso apenas para 'organizar a casa', sem ver dinheiro ou imagem mudar?"
        ),
        "tecnologia": "O dono pagaria por isso para proteger um sistema de IA que ele tem?",
    },
}

SONDAS_FORTES = ("dinheiro", "reputacao")   # dor com dono claro
SONDAS_INTERNAS = ("processo", "tecnologia")  # dor sem dono claro do prejuízo

CONTEXTO_PADRAO = (
    "Contexto do mercado: cidade turística pequena no Brasil. Comércio local (pousadas, "
    "restaurantes, passeios, lojinhas). Donos operacionais, atendem no balcão, não têm tempo "
    "nem equipe de TI, orçamento curto. O canal é o WhatsApp."
)

# --------------------------------------------------------------------------
# Backends
# --------------------------------------------------------------------------


class Backend(Protocol):
    """Qualquer decisor que responda bool por id de pergunta."""

    def perguntar(self, state: str, perguntas: dict[str, str]) -> dict[str, float]:
        """perguntas: {id: instrução} -> {id: P(sim) em 0..1}"""
        ...


@dataclass
class HttpBackend:
    """Adaptador para qualquer endpoint no formato System One.

    Espera um POST JSON:
        {"state": "...", "model": "...",
         "questions": {"p_dinheiro": {"type": "noul", "instructions": "..."}}}
    e uma resposta com:
        {"answers": {"p_dinheiro": {"type": "noul", "noul": 0.81}}}
    Ajuste `extrair` se o seu serviço devolver outra forma.
    """

    url: str
    api_key: str | None = None
    model: str = "systemone-latest"
    timeout: float = 30.0
    extrair: Callable[[dict[str, Any]], dict[str, float]] | None = None

    def perguntar(self, state: str, perguntas: dict[str, str]) -> dict[str, float]:
        payload = {
            "state": state,
            "model": self.model,
            "questions": {
                pid: {"type": "noul", "instructions": txt} for pid, txt in perguntas.items()
            },
        }
        req = urllib.request.Request(
            self.url,
            data=json.dumps(payload).encode(),
            headers={
                "Content-Type": "application/json",
                **({"Authorization": f"Bearer {self.api_key}"} if self.api_key else {}),
            },
        )
        with urllib.request.urlopen(req, timeout=self.timeout) as r:
            body = json.loads(r.read())
        extractor = self.extrair or _extrair_padrao
        return extractor(body)


def _extrair_padrao(body: dict[str, Any]) -> dict[str, float]:
    out: dict[str, float] = {}
    for pid, ans in body["answers"].items():
        if isinstance(ans, dict):
            for chave in ("noul", "bool", "probabilidade", "probability", "p"):
                if chave in ans:
                    out[pid] = float(ans[chave])
                    break
        else:
            out[pid] = float(ans)
    return out


@dataclass
class StubBackend:
    """Backend determinístico para autoteste (sem rede)."""

    respostas: dict[str, float]
    padrao: float = 0.5

    def perguntar(self, state: str, perguntas: dict[str, str]) -> dict[str, float]:
        return {pid: self.respostas.get(pid, self.padrao) for pid in perguntas}


# --------------------------------------------------------------------------
# Algoritmo
# --------------------------------------------------------------------------


@dataclass
class Resultado:
    rotulo: str                 # "FORTE" | "FRACA" | "INDETERMINADO" | "INSTAVEL"
    score_dor: float            # max(dinheiro, reputação) médio
    score_interna: float        # max(processo, tecnologia) médio
    margem: float               # score_dor - score_interna
    desvio: float               # maior desvio entre paráfrases
    por_parafrase: dict[str, dict[str, float]] = field(default_factory=dict)
    escalar: bool = False
    motivo: str = ""
    detalhe: dict[str, float] = field(default_factory=dict)

    def __str__(self) -> str:
        flag = "  [ESCALAR]" if self.escalar else ""
        return (
            f"{self.rotulo:<15} dor={self.score_dor:.2f} interna={self.score_interna:.2f} "
            f"margem={self.margem:+.2f} desvio={self.desvio:.3f}{flag}  {self.motivo}"
        )


def _perguntas(variante: str) -> dict[str, str]:
    return {f"p_{k}": txt for k, txt in SONDAS[variante].items()}


def avaliar(
    ideia: str,
    backend: Backend,
    contexto: str = CONTEXTO_PADRAO,
    variantes: tuple[str, ...] = ("A", "B", "C"),
) -> Resultado:
    """Roda as sondas em todas as paráfrases e combina."""
    if len(variantes) < MIN_PARAFRASES:
        raise ValueError(
            f"use ao menos {MIN_PARAFRASES} paráfrases; com {len(variantes)} o veredito não é confiável"
        )

    state = f"{contexto}\nIdeia: {ideia.strip()}"
    por_variante: dict[str, dict[str, float]] = {}
    for v in variantes:
        bruto = backend.perguntar(state, _perguntas(v))
        por_variante[v] = {k.replace("p_", "", 1): float(x) for k, x in bruto.items()}

    nomes = tuple(SONDAS[variantes[0]])
    media = {n: statistics.fmean(por_variante[v][n] for v in variantes) for n in nomes}
    desvio = max(statistics.pstdev([por_variante[v][n] for v in variantes]) for n in nomes)

    score_dor = max(media[n] for n in SONDAS_FORTES)
    score_interna = max(media[n] for n in SONDAS_INTERNAS)
    margem = score_dor - score_interna

    if desvio > LIMIAR_INSTAVEL:
        return Resultado(
            "INSTAVEL", score_dor, score_interna, margem, desvio, por_variante,
            escalar=True,
            motivo=f"sondas divergem entre paráfrases (desvio {desvio:.3f} > {LIMIAR_INSTAVEL})",
            detalhe=media,
        )
    if score_dor >= LIMIAR_FORTE and score_dor > score_interna:
        return Resultado("FORTE", score_dor, score_interna, margem, desvio, por_variante,
                         detalhe=media, motivo="dor com dono claro e dominante")
    if score_interna >= LIMIAR_FRACA and score_interna > score_dor:
        return Resultado("FRACA", score_dor, score_interna, margem, desvio, por_variante,
                         detalhe=media, motivo="dor interna, sem dono claro do prejuízo")
    return Resultado(
        "INDETERMINADO", score_dor, score_interna, margem, desvio, por_variante,
        escalar=True,
        motivo=(
            "zona cinzenta: "
            + ("nenhum sinal passou do limiar" if max(score_dor, score_interna) < LIMIAR_FRACA
               else f"dor={score_dor:.2f} não supera o limiar seguro {LIMIAR_FORTE}")
        ),
        detalhe=media,
    )


def recomendar(res: Resultado) -> str:
    """Traduz o rótulo numa decisão de negócio."""
    if res.rotulo == "FORTE":
        return "ATACAR — use o Índice de Ação para priorizar contra as outras ideias."
    if res.rotulo == "FRACA":
        return "DESCARTAR (ou reposicionar) — a dor não tem dono claro do prejuízo."
    return "REVISAR À MÃO — não decida por este teste; veja o motivo e a margem."


# --------------------------------------------------------------------------
# Autoteste
# --------------------------------------------------------------------------


def _self_test() -> int:
    # caso 1: dor forte nítida (perde dinheiro, nada de processo)
    forte = StubBackend({
        "p_dinheiro": 0.85, "p_reputacao": 0.50, "p_processo": 0.10, "p_tecnologia": 0.10,
    })
    # caso 2: dor interna nítida (processo puro)
    fraca = StubBackend({
        "p_dinheiro": 0.20, "p_reputacao": 0.20, "p_processo": 0.70, "p_tecnologia": 0.10,
    })
    # caso 3: zona cinzenta (nada passa do limiar seguro)
    cinza = StubBackend({
        "p_dinheiro": 0.55, "p_reputacao": 0.45, "p_processo": 0.40, "p_tecnologia": 0.20,
    })

    casos = [
        ("forte", forte, "FORTE"),
        ("fraca", fraca, "FRACA"),
        ("cinzenta", cinza, "INDETERMINADO"),
    ]
    falhas = 0
    for nome, be, esperado in casos:
        res = avaliar("ideia de teste", be)
        ok = res.rotulo == esperado
        falhas += 0 if ok else 1
        print(f"[{'ok ' if ok else 'FALHA'}] {nome:<9} -> {res}")

    # guarda: menos de 3 paráfrases deve falhar alto, não devolver número
    try:
        avaliar("ideia de teste", forte, variantes=("A",))
        print("[FALHA] aceitou 1 paráfrase"); falhas += 1
    except ValueError:
        print("[ok ] rejeitou 1 paráfrase (guarda funcionando)")

    # guarda: desvio alto deve virar INSTAVEL
    instavel = StubBackend({"p_dinheiro": 0.9, "p_reputacao": 0.5, "p_processo": 0.2, "p_tecnologia": 0.1})
    class Ruidoso(StubBackend):
        def __init__(self) -> None: super().__init__({}); self.n = 0
        def perguntar(self, state, perguntas):
            self.n += 1
            base = {p: instavel.padrao for p in perguntas}
            base.update({p: 0.9 if self.n % 2 else 0.1 for p in perguntas})
            return base
    res = avaliar("ideia ruidosa", Ruidoso())
    ok = res.rotulo == "INSTAVEL"
    print(f"[{'ok ' if ok else 'FALHA'}] ruidosa   -> {res}")
    falhas += 0 if ok else 1

    print("\nSELF-TEST:", "PASSOU" if falhas == 0 else f"{falhas} FALHA(S)")
    return 1 if falhas else 0


if __name__ == "__main__":
    if "--self-test" in sys.argv:
        raise SystemExit(_self_test())
    if "--demo" in sys.argv:
        # demonstração offline com um backend fixo
        be = StubBackend({"p_dinheiro": 0.81, "p_reputacao": 0.50,
                          "p_processo": 0.15, "p_tecnologia": 0.12})
        r = avaliar("Robô que tria o WhatsApp da pousada e apita o dono só no lead quente.", be)
        print(r); print("->", recomendar(r))
        raise SystemExit(0)
    print(__doc__)
