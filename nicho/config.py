"""Configuracao da ferramenta de estudo de nicho."""
from __future__ import annotations

import os
from dataclasses import dataclass, field


@dataclass
class Config:
    nicho: str
    cidade: str = ""
    ticket_mes: int = 300
    n_ideias: int = 8
    saida: str = "estudo"
    ideias_arquivo: str = ""   # JSON com a lista de ideias (pula a geracao)
    so_avaliar: bool = False    # para depois da avaliacao (coleta para recalibrar)
    metodo_dor: str = "escolha"  # "escolha" (3 opcoes) ou "noul" (4 sondas antigas)

    # LLM (qualquer endpoint compativel com OpenAI chat/completions)
    llm_base_url: str = field(default_factory=lambda: os.environ.get(
        "GOODBIZZ_LLM_URL", "https://api.openai.com/v1"))
    llm_model: str = field(default_factory=lambda: os.environ.get(
        "GOODBIZZ_LLM_MODEL", "gpt-4o-mini"))
    llm_key: str = field(default_factory=lambda: os.environ.get(
        "GOODBIZZ_LLM_KEY", os.environ.get("OPENAI_API_KEY", "")))

    # Decisor (System One: Jev, Laya ou qualquer endpoint compativel). Sem url, cai no modo simulado.
    decisor_url: str = field(default_factory=lambda: os.environ.get("GOODBIZZ_DECISOR_URL", ""))
    decisor_model: str = field(default_factory=lambda: os.environ.get(
        "GOODBIZZ_DECISOR_MODEL", "systemone-latest"))
    decisor_key: str = field(default_factory=lambda: os.environ.get("GOODBIZZ_DECISOR_KEY", ""))

    mock: bool = False          # simula LLM e decisor
    mock_llm: bool = False      # simula so o LLM
    mock_decisor: bool = False  # simula so o decisor
    pdf: bool = False
    parafrases: int = 3
    paralelo: int = 8
    timeout: float = 60.0

    def contexto(self) -> str:
        """Frase de contexto usada como state em todas as perguntas."""
        alvo = f" Cidade/regiao alvo: {self.cidade}." if self.cidade else ""
        return (
            f"Contexto do mercado: {self.nicho}.{alvo} "
            "Donos operacionais, atendem no balcao, sem tempo, sem equipe de TI, "
            "orcamento curto, o canal principal e o WhatsApp."
        )

    def __post_init__(self) -> None:
        self.nicho = self.nicho.strip()
        if not self.nicho:
            raise ValueError("informe o nicho")
        if self.mock:
            self.mock_llm = self.mock_decisor = True
        if not self.mock_llm and not self.llm_key:
            raise ValueError(
                "defina a chave do LLM (GOODBIZZ_LLM_KEY, OPENAI_API_KEY ou --llm-key) ou use --mock")
        if not self.decisor_url and not self.mock_decisor:
            raise ValueError(
                "defina a URL do decisor (GOODBIZZ_DECISOR_URL ou --decisor-url) ou use --mock")
