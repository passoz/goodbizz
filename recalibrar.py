#!/usr/bin/env python3
"""
Recalibra os limiares do classificador de dor para um nicho novo.

Por que isso e necessario
-------------------------
As sondas (`nicho/algoritmo.py`) sao genericas, mas os LIMIARES foram ajustados
sobre 17 ideias do nicho de turismo. O que decide a compra varia por nicho: o que
e "dor que faz comprar" numa pousada nao e necessariamente o que faz comprar numa
clinica. Usar o limiar de outro nicho produz o sintoma classico: tudo sai
INSTAVEL ou INDETERMINADO.

Como usar
---------
1. Colete um conjunto rotulado do nicho novo (ideal: 20 a 30 ideias). Nao precisa
   de LLM para gerar texto; precisa da descricao da ideia:

       python3 gerar_estudo.py "seu nicho" --ideias-arquivo ideias.json \
           --so-avaliar --saida coleta --mock-llm

   `--so-avaliar` para depois da avaliacao; `ideias.json` e uma lista, aceitando
   [{"nome": "...", "descricao": "..."}] ou ["descricao 1", "descricao 2"].
   Sem `--mock-llm`, o LLM tambem escreve o brief (nao afeta a calibracao).

2. Rode a varredura:

       python3 recalibrar.py coleta/dados.json

3. Cole os limiares recomendados em `nicho/algoritmo.py` e registre o conjunto de
   dados como regressao: ele e o teste que impede a calibracao de regredir.

O que serve de rotulo
---------------------
O alvo e o indicador `venda` (facilidade de venda, 0 a 2) do proprio decisor:
ele responde "quao facil e vender isso para este dono". O classificador de dor
existe para PREVER essa resposta. Zona morta no meio: ideias com venda entre
`corte - 0.4` e `corte` sao ignoradas, porque nelas nem o decisor se decidiu.

O que a varredura otimiza
-------------------------
Primeiro o erro que custa dinheiro (falso FORTE: dizer "ataca" numa ideia que nao
vende), depois o numero de acertos, depois o menor escalonamento. O resultado e
deliberadamente conservador: prefere dizer "revise a mao" a arriscar um veredito
errado na direcao perigosa.
"""
from __future__ import annotations

import argparse
import json
import statistics as st
import sys
from dataclasses import dataclass
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from nicho import algoritmo as ALG  # noqa: E402

GRADE_FORTE = [round(0.45 + 0.05 * i, 2) for i in range(8)]      # 0.45 .. 0.80
GRADE_FRACA = [0.40, 0.50, 0.60]
GRADE_INSTAVEL = [round(0.10 + 0.05 * i, 2) for i in range(5)]   # 0.10 .. 0.30


@dataclass
class Caso:
    nome: str
    sondas: dict[str, float]
    por_parafrase: dict[str, dict[str, float]]
    venda: float

    @property
    def desvio(self) -> float:
        if not self.por_parafrase:
            return 0.0
        sondas = list(next(iter(self.por_parafrase.values())).keys())
        return max(
            (st.pstdev([v[s] for v in self.por_parafrase.values()]) for s in sondas),
            default=0.0,
        )

    @property
    def score_dor(self) -> float:
        return max(self.sondas.get("dinheiro", 0.0), self.sondas.get("reputacao", 0.0))

    @property
    def score_interna(self) -> float:
        return max(self.sondas.get("processo", 0.0), self.sondas.get("tecnologia", 0.0))


def decidir(c: Caso, t_forte: float, t_fraca: float, t_instavel: float) -> str:
    """Espelha a decisao de nicho/algoritmo.py, para poder variar os limiares."""
    if c.desvio > t_instavel:
        return "INSTAVEL"
    if c.score_dor >= t_forte and c.score_dor > c.score_interna:
        return "FORTE"
    if c.score_interna >= t_fraca and c.score_interna > c.score_dor:
        return "FRACA"
    return "INDETERMINADO"


def carregar(caminhos: list[str], corte: float) -> tuple[list[Caso], list[Caso]]:
    casos, ignorados = [], []
    for caminho in caminhos:
        dados = json.loads(Path(caminho).read_text(encoding="utf-8"))
        for d in dados.get("ideias", []):
            a = d.get("algoritmo", {})
            sondas = a.get("sondas") or {}
            if not sondas:
                ignorados.append(d.get("nome", "?"))
                continue
            c = Caso(nome=d.get("nome", "?"), sondas=sondas,
                     por_parafrase=a.get("por_parafrase") or {},
                     venda=float(d.get("negocio", {}).get("venda", d.get("indicadores", {}).get("venda", 0))))
            if c.venda >= corte or c.venda <= corte - 0.4:
                casos.append(c)
            else:
                ignorados.append(c.nome)
    return casos, ignorados


def avaliar(casos: list[Caso], corte: float, t_forte: float, t_fraca: float,
            t_instavel: float) -> dict:
    tp = fp = tn = fn = esc = 0
    for c in casos:
        positivo = c.venda >= corte
        r = decidir(c, t_forte, t_fraca, t_instavel)
        if r == "INSTAVEL" or r == "INDETERMINADO":
            esc += 1
        elif r == "FORTE":
            if positivo:
                tp += 1
            else:
                fp += 1
        else:  # FRACA
            if positivo:
                fn += 1
            else:
                tn += 1
    return {"tp": tp, "fp": fp, "tn": tn, "fn": fn, "esc": esc}


def imprime_tabela(linhas: list[tuple], corte: float) -> None:
    print(f"{'forte':>6}{'fraca':>7}{'instav':>8}   {'ataca certo':>12}{'ATACA ERRADO':>14}"
          f"{'rejeita certo':>15}{'rejeita errado':>16}{'escalona':>10}")
    for t_f, t_fr, t_i, m in linhas:
        print(f"{t_f:>6.2f}{t_fr:>7.2f}{t_i:>8.2f}   {m['tp']:>12}{m['fp']:>14}"
              f"{m['tn']:>15}{m['fn']:>16}{m['esc']:>10}")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("dados", nargs="+", help="um ou mais dados.json de execucoes anteriores")
    ap.add_argument("--corte", type=float, default=1.40,
                    help="venda >= corte conta como 'dor que faz comprar' (padrao 1.40)")
    a = ap.parse_args()

    casos, ignorados = carregar(a.dados, a.corte)
    positivos = sum(1 for c in casos if c.venda >= a.corte)
    print(f"\nconjunto: {len(casos)} casos rotulados "
          f"({positivos} que vendem, {len(casos) - positivos} que nao)")
    if ignorados:
        print(f"zona morta (venda entre {a.corte - 0.4:.2f} e {a.corte:.2f}): "
              f"{len(ignorados)} caso(s) ignorado(s)")
    if len(casos) < 12:
        print("\nATENCAO: menos de 12 casos. A varredura vai decorar a amostra em vez de"
              "\nmedir. Junte mais ideias antes de confiar no resultado.")
    if positivos < 3 or len(casos) - positivos < 3:
        print("\nATENCAO: um dos lados tem menos de 3 casos. O resultado nao separa nada.")

    atual = ALG.LIMIAR_FORTE, ALG.LIMIAR_FRACA, ALG.LIMIAR_INSTAVEL
    m_atual = avaliar(casos, a.corte, *atual)
    print(f"\nlimiar em uso ({atual[0]}/{atual[1]}/{atual[2]}): "
          f"ataca certo={m_atual['tp']} ATACA ERRADO={m_atual['fp']} "
          f"rejeita certo={m_atual['tn']} escalona={m_atual['esc']}")

    linhas = []
    for t_f in GRADE_FORTE:
        for t_fr in GRADE_FRACA:
            for t_i in GRADE_INSTAVEL:
                linhas.append((t_f, t_fr, t_i, avaliar(casos, a.corte, t_f, t_fr, t_i)))

    # ordem: menos erro perigoso, depois mais acerto, depois menos escalonamento
    linhas.sort(key=lambda x: (x[3]["fp"], -(x[3]["tp"] + x[3]["tn"]), x[3]["esc"]))

    print("\nmelhores combinacoes (falso FORTE primeiro, depois acerto, depois escalonamento):")
    imprime_tabela(linhas[:12], a.corte)

    melhor = linhas[0]
    t_f, t_fr, t_i, m = melhor
    print(f"\nrecomendado: LIMIAR_FORTE={t_f}  LIMIAR_FRACA={t_fr}  LIMIAR_INSTAVEL={t_i}")
    print(f"  ataca certo={m['tp']}  ATACA ERRADO={m['fp']}  "
          f"rejeita certo={m['tn']}  rejeita errado={m['fn']}  escalona={m['esc']}")

    if m["fp"] > 0:
        print("\nNAO ha combinacao sem falso FORTE neste conjunto: nem todo rotulo e"
              "\nseparavel pelas 4 sondas. Aceite o menor valor ou adicione sondas.")
    elif m["esc"] > len(casos) / 2:
        print("\nMais da metade escalona: a separacao e fraca. Considere que este nicho"
              "\nnao e bem capturado por estas 4 sondas.")

    print("\npara aplicar, troque as constantes em nicho/algoritmo.py:")
    print(f"    LIMIAR_FORTE = {t_f}\n    LIMIAR_FRACA = {t_fr}\n    LIMIAR_INSTAVEL = {t_i}")
    print("\ne registre o conjunto como regressao: ele e o teste que impede a calibracao"
          "\nde regredir numa proxima mudanca de sonda.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
