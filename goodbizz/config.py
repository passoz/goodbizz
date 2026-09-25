"""Configuration for the niche business study tool."""
from __future__ import annotations

import os
from dataclasses import dataclass, field


@dataclass
class Config:
    niche: str = ""
    city: str = ""
    monthly_ticket: int = 300
    num_ideas: int = 8
    output_dir: str = "estudo"
    ideas_file: str = ""  # JSON file with ideas list (skips LLM generation)
    evaluate_only: bool = False  # stops after evaluation (data collection for calibration)
    pain_method: str = "choice"  # "choice" (3 options) or "noul" (legacy 4 probes)

    # LLM (any OpenAI chat/completions compatible endpoint)
    llm_base_url: str = field(default_factory=lambda: os.environ.get(
        "GOODBIZZ_LLM_URL", "https://api.openai.com/v1"))
    llm_model: str = field(default_factory=lambda: os.environ.get(
        "GOODBIZZ_LLM_MODEL", "gpt-4o-mini"))
    llm_key: str = field(default_factory=lambda: os.environ.get(
        "GOODBIZZ_LLM_KEY", os.environ.get("OPENAI_API_KEY", "")))

    # Decider (System One: Jev, Laya, or any compatible endpoint). Empty falls back to mock.
    decider_url: str = field(default_factory=lambda: os.environ.get("GOODBIZZ_DECISOR_URL", ""))
    decider_model: str = field(default_factory=lambda: os.environ.get(
        "GOODBIZZ_DECISOR_MODEL", "systemone-latest"))
    decider_key: str = field(default_factory=lambda: os.environ.get("GOODBIZZ_DECISOR_KEY", ""))

    mock: bool = False  # simulates both LLM and decider
    mock_llm: bool = False  # simulates LLM only
    mock_decider: bool = False  # simulates decider only
    pdf: bool = False
    paraphrases: int = 3
    concurrency: int = 8
    timeout: float = 60.0

    # Backwards-compatibility aliases
    nicho: str = ""
    cidade: str = ""
    ticket_mes: int = 0
    n_ideias: int = 0
    saida: str = ""
    ideias_arquivo: str = ""
    so_avaliar: bool = False
    metodo_dor: str = ""
    decisor_url: str = ""
    decisor_model: str = ""
    decisor_key: str = ""
    mock_decisor: bool = False
    parafrases: int = 0
    paralelo: int = 0

    def context(self) -> str:
        """Context phrase used as state in all decision questions."""
        target_city = f" Target city/region: {self.city}." if self.city else ""
        return (
            f"Contexto do mercado: {self.niche}.{target_city} "
            "Donos operacionais, atendem no balcao, sem tempo, sem equipe de TI, "
            "orcamento curto, o canal principal e o WhatsApp."
        )

    def contexto(self) -> str:
        """Alias for context()."""
        return self.context()

    def __post_init__(self) -> None:
        # Sync backwards-compatibility attributes
        if self.nicho and not self.niche:
            self.niche = self.nicho
        if self.cidade and not self.city:
            self.city = self.cidade
        if self.ticket_mes and self.monthly_ticket == 300:
            self.monthly_ticket = self.ticket_mes
        if self.n_ideias and self.num_ideas == 8:
            self.num_ideas = self.n_ideias
        if self.saida and self.output_dir == "estudo":
            self.output_dir = self.saida
        if self.ideias_arquivo and not self.ideas_file:
            self.ideas_file = self.ideias_arquivo
        if self.so_avaliar:
            self.evaluate_only = True
        if self.metodo_dor and self.pain_method == "choice":
            self.pain_method = self.metodo_dor
        if self.decisor_url and not self.decider_url:
            self.decider_url = self.decisor_url
        if self.decisor_model and self.decider_model == "systemone-latest":
            self.decider_model = self.decisor_model
        if self.decisor_key and not self.decider_key:
            self.decider_key = self.decisor_key
        if self.mock_decisor:
            self.mock_decider = True
        if self.parafrases and self.paraphrases == 3:
            self.paraphrases = self.parafrases
        if self.paralelo and self.concurrency == 8:
            self.concurrency = self.paralelo

        # Keep aliases in sync
        self.nicho = self.niche = self.niche.strip()
        self.cidade = self.city = self.city.strip()
        self.ticket_mes = self.monthly_ticket
        self.n_ideias = self.num_ideas
        self.saida = self.output_dir
        self.ideias_arquivo = self.ideas_file
        self.so_avaliar = self.evaluate_only
        self.metodo_dor = self.pain_method
        self.decisor_url = self.decider_url
        self.decisor_model = self.decider_model
        self.decisor_key = self.decider_key
        self.parafrases = self.paraphrases
        self.paralelo = self.concurrency

        if not self.niche:
            raise ValueError("please provide the niche (--niche)")
        if self.mock:
            self.mock_llm = self.mock_decider = True
        self.mock_decisor = self.mock_decider

        if not self.mock_llm and not self.llm_key:
            raise ValueError(
                "define the LLM API key (GOODBIZZ_LLM_KEY, OPENAI_API_KEY or --llm-key) or use --mock"
            )
        if not self.decider_url and not self.mock_decider:
            raise ValueError(
                "define the decider URL (GOODBIZZ_DECISOR_URL or --decisor-url) or use --mock"
            )
