"""goodbizz: niche business study generator using System One deciders."""
from __future__ import annotations

from . import (
    config,
    llm,
    decider,
    evaluation,
    algorithm,
    pain_choice,
    generation,
    reports,
    render,
    verification,
)

# Backwards-compatibility aliases
decisor = decider
avaliacao = evaluation
algoritmo = algorithm
dor_escolha = pain_choice
geracao = generation
relatorios = reports
verificacao = verification

__all__ = [
    "config", "llm", "decider", "evaluation", "algorithm", "pain_choice",
    "generation", "reports", "render", "verification",
    "decisor", "avaliacao", "algoritmo", "dor_escolha",
    "geracao", "relatorios", "verificacao",
]
