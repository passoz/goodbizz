"""Prompts e chamadas de geracao: brief, ideias e documento por ideia.

Regra que atravessa tudo: os NUMEROS sao calculados pelo codigo. O LLM escreve a prosa
em volta deles e nunca tem permissao de inventar numero novo.
"""
from __future__ import annotations

from . import llm as _llm

SISTEMA_BRIEF = """PALAVRA-CHAVE: BRIEF
Voce e analista de mercado. Escreva um brief curto em markdown sobre o nicho informado,
sem acento. Cubra, em topicos: quem compra (perfil do decisor), quanto ele pode gastar por
mes, onde ele esta, como se comunica, quais dores ele ja verbaliza, quem ja atende esse
mercado hoje e o que costuma ser caro ou fragil na operacao dele.
Seja concreto e curto. Nao invente numero de mercado; quando precisar de ordem de grandeza,
escreva a faixa e marque [INFERENCE]. Nao use acento em nenhuma palavra."""

SISTEMA_IDEIAS = """PALAVRA-CHAVE: IDEIAS
Voce propoe ideias de produto de automacao com IA para o nicho informado.
Responda SOMENTE um array JSON, sem texto em volta, no formato:
[{"nome": "...", "setor": "...", "descricao": "..."}]
Regras:
- "descricao" tem 1 a 2 frases, concretas: o que entra, o que o sistema faz, o que sai.
- Nada de "chatbot generico". Cada ideia precisa de um mecanismo claro e de um dono da dor.
- Cubra mecanismos diferentes entre si (triagem, agenda, documento, reputacao, preco,
  rede, estoque, verificacao), sem repetir o mesmo mecanismo duas vezes.
- Portugues sem acento. Sem numero inventado de mercado."""

SISTEMA_DOC = """Voce e consultor de negocios escrevendo um documento interno de estrategia.
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


def gerar_brief(llm, cfg) -> str:
    pedido = (f"Nicho: {cfg.nicho}\n"
              f"Cidade ou regiao alvo: {cfg.cidade or 'nao informada'}\n"
              f"Ticket mensal considerado: R$ {cfg.ticket_mes}\n")
    return llm.texto(SISTEMA_BRIEF, pedido).strip()


def gerar_ideias(llm, cfg, brief: str, n: int) -> list[dict]:
    pedido = (f"Nicho: {cfg.nicho}\n"
              f"Cidade ou regiao alvo: {cfg.cidade or 'nao informada'}\n"
              f"Quantidade de ideias: exatamente {n}\n\n"
              f"Brief de contexto:\n{brief}\n")
    dados = _llm.extrair_json(llm.texto(SISTEMA_IDEIAS, pedido))
    if isinstance(dados, dict):
        dados = dados.get("ideias") or dados.get("ideas") or []
    ideias = []
    for i, d in enumerate(dados[:n], 1):
        ideias.append({
            "n": i,
            "nome": str(d.get("nome") or d.get("name") or f"Ideia {i}").strip(),
            "setor": str(d.get("setor") or d.get("sector") or "").strip(),
            "descricao": str(d.get("descricao") or d.get("description") or "").strip(),
        })
    if not ideias:
        raise ValueError("o LLM nao devolveu ideias utilizaveis")
    return ideias


def bloco_dados(d: dict, cfg) -> str:
    """Texto com TODOS os numeros medidos desta ideia. E o unico numero que o doc pode usar."""
    i, n, a = d["indicadores"], d["negocio"], d["algoritmo"]
    probs = ", ".join(f"{k}={v:.2f}" for k, v in sorted((i.get("dor_probs") or {}).items()))
    return "\n".join([
        f"Ideia: {d['nome']} (setor: {d['setor'] or 'nao informado'})",
        f"Descricao: {d['descricao']}",
        f"Nicho: {cfg.nicho}" + (f" | Cidade/regiao: {cfg.cidade}" if cfg.cidade else ""),
        f"Ticket assumido: R$ {cfg.ticket_mes}/mes (R$ {cfg.ticket_mes * 12}/ano)",
        "",
        f"INDICE DE ACAO: {d['indice']} | TIER: {d['tier']}",
        f"fit: {i['fit']}/2.00 (confianca {i['fit_conf']:.2f})",
        f"facilidade de venda: {i['venda']}/2.00 (confianca {i['venda_conf']:.2f})",
        f"disrupcao: {i['disrupcao']}/2.00 (confianca {i['disrupcao_conf']:.2f})",
        f"tipo de dor: {i['dor']} (confianca {i['dor_conf']:.2f}) | distribuicao: {probs}",
        f"suporte solo: {i['solo']:.2f}",
        "",
        f"ALGORITMO DA DOR: {a['rotulo']} | escore de dor {a['escore_dor']} | "
        f"dor interna {a['escore_interna']} | margem {a['margem']:+.2f} | desvio {a['desvio']}",
        f"VALIDACAO: pagaria R$ {cfg.ticket_mes}/mes = {n['wtp']:.2f} | "
        f"30 clientes em 24 meses = {n['meta30']:.2f} | "
        f"preco vs valor = {n['preco']}/2.00 (confianca {n['preco_conf']:.2f})",
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


def gerar_documento(llm, d: dict, cfg, brief: str) -> str:
    pedido = (f"DADOS MEDIDOS\n{bloco_dados(d, cfg)}\nFIM DOS DADOS\n\n"
              f"Brief de contexto do nicho:\n{brief}\n\n"
              "Escreva o documento desta ideia seguindo a estrutura obrigatoria.")
    return llm.texto(SISTEMA_DOC, pedido).strip()
