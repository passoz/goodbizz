"""LLM client (any OpenAI chat/completions compatible endpoint) + mock mode."""
from __future__ import annotations

import json
import re
import time
import urllib.error
import urllib.request
from typing import Any, Protocol


class LLM(Protocol):
    def generate_text(self, system: str, user: str) -> str: ...

    def texto(self, sistema: str, usuario: str) -> str: ...


def extract_json(text: str) -> Any:
    """Parses JSON from a response that might be enclosed in markdown fences or prose."""
    text = text.strip()
    fence = re.search(r"```(?:json)?\s*(.+?)```", text, re.S)
    if fence:
        text = fence.group(1).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    for open_char, close_char in (("[", "]"), ("{", "}")):
        i, j = text.find(open_char), text.rfind(close_char)
        if i >= 0 and j > i:
            try:
                return json.loads(text[i:j + 1])
            except json.JSONDecodeError:
                continue
    raise ValueError(f"response without readable JSON: {text[:300]}")


extrair_json = extract_json


class LLMHttp:
    """Minimal HTTP client for OpenAI-compatible chat completions, no external dependencies."""

    def __init__(
        self,
        base_url: str,
        model: str,
        key: str,
        timeout: float = 60.0,
        retries: int = 3,
    ) -> None:
        self.url = base_url.rstrip("/") + "/chat/completions"
        self.model = model
        self.key = key
        self.timeout = timeout
        self.retries = retries
        self.tentativas = retries

    def generate_text(self, system: str, user: str) -> str:
        body = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "temperature": 0.4,
        }
        data = json.dumps(body).encode()
        last_exc: Exception | None = None
        for n in range(self.retries):
            try:
                req = urllib.request.Request(
                    self.url,
                    data=data,
                    headers={
                        "Content-Type": "application/json",
                        "Authorization": f"Bearer {self.key}",
                    },
                )
                with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                    return json.loads(resp.read())["choices"][0]["message"]["content"]
            except (urllib.error.URLError, TimeoutError, KeyError, json.JSONDecodeError) as err:
                last_exc = err
                time.sleep(1.5 * (n + 1))
        raise RuntimeError(f"LLM failed after {self.retries} attempts: {last_exc}")

    def texto(self, sistema: str, usuario: str) -> str:
        return self.generate_text(sistema, usuario)


class LLMMock:
    """Deterministic mock to run the entire pipeline offline without credentials.

    Does not simulate the quality of an LLM: proves that the pipeline completes
    and generates example documents.
    """

    def generate_text(self, system: str, user: str) -> str:
        if "PALAVRA-CHAVE: IDEIAS" in system or "KEYWORD: IDEAS" in system:
            return json.dumps(_IDEAS_FIXTURE, ensure_ascii=False)
        if "PALAVRA-CHAVE: BRIEF" in system or "KEYWORD: BRIEF" in system:
            return _BRIEF_FIXTURE
        return _document_fixture(user)

    def texto(self, sistema: str, usuario: str) -> str:
        return self.generate_text(sistema, usuario)


_IDEAS_FIXTURE = [
    {
        "nome": "Triagem de WhatsApp",
        "setor": "atendimento",
        "descricao": "Le as mensagens que chegam, separa duvida simples de intencao real e avisa quem decide.",
    },
    {
        "nome": "Confirmacao de horario",
        "setor": "agenda",
        "descricao": "Confirma compromissos algumas horas antes e realoca a vaga quando alguem desmarca.",
    },
    {
        "nome": "Ficha do cliente",
        "setor": "cadastro",
        "descricao": "Extrai os dados do cliente a partir do documento e preenche o cadastro obrigatorio.",
    },
    {
        "nome": "Resgate de insatisfacao",
        "setor": "reputacao",
        "descricao": "Le as conversas em andamento, detecta insatisfacao e avisa antes de virar avaliacao publica.",
    },
    {
        "nome": "Previsao de movimento",
        "setor": "operacao",
        "descricao": "Preve o movimento do dia e gera lista de compras e de preparo.",
    },
    {
        "nome": "Livro de indicacoes",
        "setor": "rede",
        "descricao": "Registra quem indicou quem e fecha o acerto do mes.",
    },
]

_BRIEF_FIXTURE = """# Brief (modo simulado)

Premissas fixas do modo --mock. Substitua por um LLM real para um brief de verdade.

- Comprador: dono-operador, decide sozinho, sem equipe de TI.
- Orcamento: baixo e mensal; o dinheiro sai do bolso dele, nao de um departamento.
- Canal de compra: WhatsApp e indicacao de conhecido.
- Dor que faz comprar: perda de dinheiro visivel ou risco de imagem.
- Volume de mensagens: alto e concentrado em poucos horarios.
"""


def _document_fixture(user: str) -> str:
    """Synthetic document echoing the received data block."""
    raw_data = ""
    if "DADOS MEDIDOS" in user:
        raw_data = user.split("DADOS MEDIDOS", 1)[1].split("FIM DOS DADOS", 1)[0].strip()
    elif "MEASURED DATA" in user:
        raw_data = user.split("MEASURED DATA", 1)[1].split("END OF DATA", 1)[0].strip()

    lines = {
        line.split(":", 1)[0].strip(): line.split(":", 1)[1].strip()
        for line in raw_data.splitlines()
        if ":" in line
    }

    def first(field_name: str, fallback: str = "-") -> str:
        return lines.get(field_name, fallback).split(" | ")[0].strip()

    def complete(field_name: str, fallback: str = "-") -> str:
        return lines.get(field_name, fallback).replace(" | ", " · ").strip()

    name = lines.get("Ideia", lines.get("Idea", "ideia de exemplo"))
    index_val = first("INDICE DE ACAO", first("ACTION INDEX", "-"))
    tier_val = first("TIER") or complete("TIER")
    if "TIER:" in lines.get("INDICE DE ACAO", ""):
        tier_val = lines["INDICE DE ACAO"].split("TIER:", 1)[1].split(" | ")[0].strip()

    fit = first("fit")
    sale = first("facilidade de venda", first("sale ease", "-"))
    disruption = first("disrupcao", first("disruption", "-"))
    solo = first("suporte solo", first("solo support", "-"))
    pain = complete("tipo de dor", complete("pain type", "-"))
    algo = complete("ALGORITMO DA DOR", complete("PAIN ALGORITHM", "-"))
    val = complete("VALIDACAO", complete("VALIDATION", "-"))
    ticket = "300"
    for part in val.split("R$ "):
        if "por mes" in part or "per month" in part:
            ticket = part.split(" ")[0].strip()
            break

    return f"""# {name}

**Indice de Acao:** {index_val} · **Tier:** {tier_val}
**Dor verificada:** {algo}

> Documento gerado em modo `--mock`. O texto abaixo e sintetico e existe apenas para
> exercitar o pipeline de ponta a ponta. Nao use como estudo real.

## 1. Resumo executivo

Esta e uma saida de exemplo. Em execucao real, o LLM escreve aqui o veredito da ideia,
as duas ou tres fraquezas que o plano precisa resolver e o alerta de preco.

O indice de acao medido foi {index_val}, com Tier {tier_val}. A dor foi classificada como {algo}.

## 2. Indicadores coletados

### 2.1 Indicadores principais

| Indicador | Valor |
|---|---|
| Aderencia ao mercado (fit) | {fit} |
| Facilidade de venda | {sale} |
| Disrupcao | {disruption} |
| Suporte solo | {solo} |
| Tipo de dor | {pain} |

### 2.2 Verificacao automatica da dor

{algo}

### 2.3 Mercado

Em execucao real, esta secao recebe as ancoras de mercado do brief. Nenhum numero de
mercado e gerado pelo modelo: ou vem do brief, ou e marcado `[INFERENCE]`.

### 2.4 Validacao de preco e meta

{val}

O ticket de R$ {ticket} por mes e **teto, nao piso**, e a meta de clientes e de 10 a 15 em
24 meses.

## 3. Como funciona

Fluxo de exemplo: a mensagem entra, o decisor classifica, o codigo decide e o dono recebe
apenas o que precisa de acao humana. Toda classificacao abaixo do limiar de confianca vai
para revisao em vez de ser executada.

```json
{{
  "intencao": {{
    "type": "choice",
    "instructions": "Classifique a intencao do cliente",
    "criteria": {{"duvida": "...", "compra": "...", "problema": "..."}}
  }},
  "urgencia": {{"type": "bool", "instructions": "O cliente demonstra pressa?"}}
}}
```

## 4. Estrategia de venda

1. Demonstrar com o dado do proprio dono, sem cobrar.
2. Diagnostico pago como filtro.
3. Piloto com escopo fechado e metrica combinada.
4. Assinatura mensal.

| Objecao | Resposta |
|---|---|
| "Ja testei e nao funcionou" | Provar com o dado dele, nao com promessa. |
| "E caro para o meu tamanho" | Comparar com a perda mensal medida. |

## 5. Estrategia de marketing

Posicionamento em uma frase, mensagem principal, canais e calendario sazonal quando fizer
sentido. Nada de jargao de IA.

## 6. Precificacao e economia unitaria

Entrada mais baixa que o teto, com migracao para o preco cheio depois de valor provado.
Custo marginal de modelo de decisao e de centavos por milhar de chamadas.

## 7. SWOT

- Forcas: dor medida e mecanismo claro.
- Fraquezas: suporte e integracao sao o gargalo, nao o modelo.
- Oportunidades: vender via associacao local.
- Ameacas: concorrente nacional e substituto gratuito.

## 8. Business Model Canvas

| Bloco | Conteudo |
|---|---|
| Segmentos de cliente | dono-operador do nicho |
| Proposta de valor | resolver a dor medida |
| Canais | WhatsApp, indicacao, associacao |
| Relacionamento | proximo na entrada, remoto no recorrente |
| Fontes de receita | setup + mensalidade |
| Recursos principais | o classificador e a integracao |
| Atividades principais | configurar, medir, vender |
| Parcerias principais | associacao local e provedor do canal |
| Estrutura de custos | API, infraestrutura, suporte |

## 9. Ferramentas complementares

### 9.1 Cinco Forcas de Porter

| Forca | Intensidade |
|---|---|
| Rivalidade | media |
| Poder dos clientes | alto |
| Poder dos fornecedores | alto |
| Novos entrantes | alta |
| Substitutos | media |

### 9.2 Matriz de risco

| Risco | Probabilidade | Impacto | Mitigacao |
|---|---|---|---|
| beneficios invisivel | media | alto | provar com o dado do cliente |

### 9.3 4 Ps

Produto, preco, praca e promocao definidos a partir dos indicadores medidos.

### 9.4 Roadmap de 90 dias

| Semana | Foco |
|---|---|
| 1-2 | oferta e discurso |
| 3-4 | primeiras conversas |
| 5-8 | pilotos |

### 9.5 KPIs

Metricas de uso, de conversao e de churn.

## 10. Proximos passos

1. Fechar a oferta.
2. Conseguir um cliente conhecido para a demonstracao.
3. Medir a linha de base.
4. Definir o limiar de confianca.
5. Levar o caso pronto a associacao local.
"""


_documento_fixture = _document_fixture

__all__ = [
    "LLM", "LLMHttp", "LLMMock", "extract_json", "extrair_json",
]
