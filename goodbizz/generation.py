"""Prompts and generation calls: brief, ideas, and per-idea strategy document.

Core rule: NUMBERS are calculated by code. The LLM writes prose around them
and is never allowed to invent new numbers.
"""
from __future__ import annotations

from . import llm as _llm

BRIEF_SYSTEM_PROMPT = """PALAVRA-CHAVE: BRIEF
Voce e analista de mercado. Escreva um brief curto em markdown sobre o nicho informado,
sem acento. Cubra, em topicos: quem compra (perfil do decisor), quanto ele pode gastar por
mes, onde ele esta, como se comunica, quais dores ele ja verbaliza, quem ja atende esse
mercado hoje e o que costuma ser caro ou fragil na operacao dele.
Seja concreto e curto. Nao invente numero de mercado; quando precisar de ordem de grandeza,
escreva a faixa e marque [INFERENCE]. Nao use acento em nenhuma palavra."""
SISTEMA_BRIEF = BRIEF_SYSTEM_PROMPT

IDEAS_SYSTEM_PROMPT = """PALAVRA-CHAVE: IDEIAS
Voce propoe ideias de produto de automacao com IA para o nicho informado.
Responda SOMENTE um array JSON, sem texto em volta, no formato:
[{"nome": "...", "setor": "...", "descricao": "..."}]
Regras:
- "descricao" tem 1 a 2 frases, concretas: o que entra, o que o sistema faz, o que sai.
- Nada de "chatbot generico". Cada ideia precisa de um mecanismo claro e de um dono da dor.
- Cubra mecanismos diferentes entre si (triagem, agenda, documento, reputacao, preco,
  rede, estoque, verificacao), sem repetir o mesmo mecanismo duas vezes.
- Portugues sem acento. Sem numero inventado de mercado."""
SISTEMA_IDEIAS = IDEAS_SYSTEM_PROMPT

DOC_SYSTEM_PROMPT = """Voce e consultor de negocios escrevendo um documento interno de estrategia.
Escreva em markdown, em portugues SEM ACENTO (o repositorio inteiro e escrito assim), tom
direto e tecnico, frases curtas, sem marketing vazio.

REGRA ABSOLUTA SOBRE NUMEROS: use exatamente os numeros do bloco DADOS MEDIDOS. Voce nao
pode inventar, arredondar de forma diferente, nem criar numero de mercado novo. Se precisar
de um dado que nao esta no bloco, escreva a estimativa e marque com [INFERENCE], mostrando
o calculo, ou omita. Nunca cite fonte que nao esteja no bloco.

Estrutura obrigatoria, exatamente estes titulos de nivel 2 e nesta ordem:
## 1. Resumo executivo
## 2. Indicadores coletados
   (2.1 Indicadores principais com confianca, 2.2 Verificacao automatica da dor,
    2.3 Mercado, 2.4 Validacao de preco e meta)
## 3. Como funciona
   (fluxo; as perguntas reais ao decisor em JSON quando fizer sentido; regra de escalonamento
    para o caso incerto)
## 4. Estrategia de venda
   (cliente ideal, gatilho e dor, sequencia numerada de abordagem com precos, tabela de
    objecoes e resposta, canal prioritario)
## 5. Estrategia de marketing
   (posicionamento, mensagem principal, canais, calendario sazonal quando fizer sentido)
## 6. Precificacao e economia unitaria
   (estrutura de preco, custo e margem por cliente, regra de preco)
## 7. SWOT
## 8. Business Model Canvas
   (tabela com os 9 blocos)
## 9. Ferramentas complementares
   (9.1 Cinco Forcas de Porter com tabela, 9.2 matriz de risco com probabilidade/impacto/
    mitigacao, 9.3 4 Ps, 9.4 roadmap de 90 dias em tabela, 9.5 KPIs)
## 10. Proximos passos
   (lista de 5 itens concretos)

Escreva entre 250 e 450 linhas. Nao use cerca de codigo em volta do documento inteiro.
Responda apenas o documento."""
SISTEMA_DOC = DOC_SYSTEM_PROMPT


def generate_brief(llm, cfg) -> str:
    niche = getattr(cfg, "niche", getattr(cfg, "nicho", ""))
    city = getattr(cfg, "city", getattr(cfg, "cidade", ""))
    monthly_ticket = getattr(cfg, "monthly_ticket", getattr(cfg, "ticket_mes", 300))
    prompt = (
        f"Nicho: {niche}\n"
        f"Cidade ou regiao alvo: {city or 'nao informada'}\n"
        f"Ticket mensal considerado: R$ {monthly_ticket}\n"
    )
    caller = getattr(llm, "generate_text", getattr(llm, "texto"))
    return caller(BRIEF_SYSTEM_PROMPT, prompt).strip()


gerar_brief = generate_brief


def generate_ideas(llm, cfg, brief: str, count: int) -> list[dict]:
    niche = getattr(cfg, "niche", getattr(cfg, "nicho", ""))
    city = getattr(cfg, "city", getattr(cfg, "cidade", ""))
    monthly_ticket = getattr(cfg, "monthly_ticket", getattr(cfg, "ticket_mes", 300))
    prompt = (
        f"Nicho: {niche}\n"
        f"Cidade ou regiao alvo: {city or 'nao informada'}\n"
        f"Ticket mensal considerado: R$ {monthly_ticket}\n\n"
        f"Brief de mercado:\n{brief}\n\n"
        f"Gere exatamente {count} ideias em JSON. Retorne apenas o array."
    )
    caller = getattr(llm, "generate_text", getattr(llm, "texto"))
    text = caller(IDEAS_SYSTEM_PROMPT, prompt)
    extractor = getattr(_llm, "extract_json", getattr(_llm, "extrair_json"))
    raw = extractor(text)
    if not isinstance(raw, list):
        raise ValueError(f"expected JSON array of ideas, got: {type(raw)}")
    ideas = []
    for i, item in enumerate(raw, 1):
        name = str(item.get("nome") or item.get("name") or f"Ideia {i}").strip()
        sector = str(item.get("setor") or item.get("sector") or "").strip()
        desc = str(item.get("descricao") or item.get("description") or name).strip()
        ideas.append({"n": i, "nome": name, "setor": sector, "descricao": desc})
    return ideas


gerar_ideias = generate_ideas


def data_block(d: dict, cfg) -> str:
    """Formatted text with ALL measured numbers for this idea.

    This is the only source of numbers that the document generator may use.
    """
    ind, biz, algo = d["indicadores"], d["negocio"], d["algoritmo"]
    probs = ", ".join(f"{k}={v:.2f}" for k, v in sorted((ind.get("dor_probs") or {}).items()))
    niche = getattr(cfg, "niche", getattr(cfg, "nicho", ""))
    city = getattr(cfg, "city", getattr(cfg, "cidade", ""))
    monthly_ticket = getattr(cfg, "monthly_ticket", getattr(cfg, "ticket_mes", 300))

    return "\n".join([
        f"Ideia: {d['nome']} (setor: {d['setor'] or 'nao informado'})",
        f"Descricao: {d['descricao']}",
        f"Nicho: {niche}" + (f" | Cidade/regiao: {city}" if city else ""),
        f"Ticket assumido: R$ {monthly_ticket}/mes (R$ {monthly_ticket * 12}/ano)",
        "",
        f"INDICE DE ACAO: {d['indice']} | TIER: {d['tier']}",
        f"fit: {ind['fit']}/2.00 (confianca {ind['fit_conf']:.2f})",
        f"facilidade de venda: {ind['venda']}/2.00 (confianca {ind['venda_conf']:.2f})",
        f"disrupcao: {ind['disrupcao']}/2.00 (confianca {ind['disrupcao_conf']:.2f})",
        f"tipo de dor: {ind['dor']} (confianca {ind['dor_conf']:.2f}) | distribuicao: {probs}",
        f"suporte solo: {ind['solo']:.2f}",
        "",
        f"ALGORITMO DA DOR: {algo['rotulo']} | escore de dor {algo['escore_dor']} | "
        f"dor interna {algo['escore_interna']} | margem {algo['margem']:+.2f} | desvio {algo['desvio']}",
        f"VALIDACAO: pagaria R$ {monthly_ticket}/mes = {biz['wtp']:.2f} | "
        f"30 clientes em 24 meses = {biz['meta30']:.2f} | "
        f"preco vs valor = {biz['preco']}/2.00 (confianca {biz['preco_conf']:.2f})",
        "",
        "Escalas: fit 0=exige escala corporativa, 1=exige mudar rotina, 2=resolve o caos sem "
        "mudar habito. Venda 0=beneficio invisivel, 2=ataca perda de dinheiro/reputacao "
        "imediata. Disrupcao 0=so automatiza o que existe, 2=muda o modelo de operacao. "
        "Preco 0=acima do valor percebido, 2=abaixo do valor com folga.",
        "",
        "Regras de negocio para este plano: o ticket e TETO, nao piso; a meta de clientes e de "
        "10 a 15 em 24 meses (o 30 medido e upside, nao base); nenhum TAM nacional deve ser "
        "usado como argumento principal.",
    ])


bloco_dados = data_block


def generate_document(llm, d: dict, cfg, brief: str) -> str:
    prompt = (
        f"DADOS MEDIDOS\n{data_block(d, cfg)}\nFIM DOS DADOS\n\n"
        f"Brief de contexto do nicho:\n{brief}\n\n"
        "Escreva o documento desta ideia seguindo a estrutura obrigatoria."
    )
    caller = getattr(llm, "generate_text", getattr(llm, "texto"))
    return caller(DOC_SYSTEM_PROMPT, prompt).strip()


gerar_documento = generate_document

__all__ = [
    "generate_brief", "generate_ideas", "generate_document", "data_block",
    "gerar_brief", "gerar_ideias", "gerar_documento", "bloco_dados",
    "BRIEF_SYSTEM_PROMPT", "IDEAS_SYSTEM_PROMPT", "DOC_SYSTEM_PROMPT",
    "SISTEMA_BRIEF", "SISTEMA_IDEIAS", "SISTEMA_DOC",
]
