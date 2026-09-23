"""Cliente de LLM (qualquer endpoint compativel com OpenAI chat/completions) + modo simulado."""
from __future__ import annotations

import json
import re
import time
import urllib.error
import urllib.request
from typing import Any, Protocol


class LLM(Protocol):
    def texto(self, sistema: str, usuario: str) -> str: ...


def extrair_json(txt: str) -> Any:
    """Le JSON de uma resposta que pode vir cercada de ``` ou de prosa."""
    txt = txt.strip()
    cerca = re.search(r"```(?:json)?\s*(.+?)```", txt, re.S)
    if cerca:
        txt = cerca.group(1).strip()
    try:
        return json.loads(txt)
    except json.JSONDecodeError:
        pass
    for abre, fecha in (("[", "]"), ("{", "}")):
        i, j = txt.find(abre), txt.rfind(fecha)
        if i >= 0 and j > i:
            try:
                return json.loads(txt[i:j + 1])
            except json.JSONDecodeError:
                continue
    raise ValueError(f"resposta sem JSON legivel: {txt[:300]}")


class LLMHttp:
    """Cliente HTTP minimo, sem dependencias externas."""

    def __init__(self, base_url: str, model: str, key: str, timeout: float = 60.0,
                 tentativas: int = 3) -> None:
        self.url = base_url.rstrip("/") + "/chat/completions"
        self.model, self.key, self.timeout, self.tentativas = model, key, timeout, tentativas

    def texto(self, sistema: str, usuario: str) -> str:
        corpo = {
            "model": self.model,
            "messages": [{"role": "system", "content": sistema},
                         {"role": "user", "content": usuario}],
            "temperature": 0.4,
        }
        dados = json.dumps(corpo).encode()
        ultimo: Exception | None = None
        for n in range(self.tentativas):
            try:
                req = urllib.request.Request(
                    self.url, data=dados,
                    headers={"Content-Type": "application/json",
                             "Authorization": f"Bearer {self.key}"})
                with urllib.request.urlopen(req, timeout=self.timeout) as r:
                    return json.loads(r.read())["choices"][0]["message"]["content"]
            except (urllib.error.URLError, TimeoutError, KeyError, json.JSONDecodeError) as e:
                ultimo = e
                time.sleep(1.5 * (n + 1))
        raise RuntimeError(f"LLM falhou apos {self.tentativas} tentativas: {ultimo}")


class LLMMock:
    """Deterministico, para rodar o pipeline inteiro sem credencial.

    Nao simula a qualidade de um LLM: existe para provar que o encanamento funciona
    e para gerar um documento de exemplo. Nunca use a saida dele como estudo real.
    """

    def texto(self, sistema: str, usuario: str) -> str:
        if "PALAVRA-CHAVE: IDEIAS" in sistema:
            return json.dumps(_IDEIAS_FIXTURE, ensure_ascii=False)
        if "PALAVRA-CHAVE: BRIEF" in sistema:
            return _BRIEF_FIXTURE
        return _documento_fixture(usuario)


_IDEIAS_FIXTURE = [
    {"nome": "Triagem de WhatsApp", "setor": "atendimento",
     "descricao": "Le as mensagens que chegam, separa duvida simples de intencao real e avisa quem decide."},
    {"nome": "Confirmacao de horario", "setor": "agenda",
     "descricao": "Confirma compromissos algumas horas antes e realoca a vaga quando alguem desmarca."},
    {"nome": "Ficha do cliente", "setor": "cadastro",
     "descricao": "Extrai os dados do cliente a partir do documento e preenche o cadastro obrigatorio."},
    {"nome": "Resgate de insatisfacao", "setor": "reputacao",
     "descricao": "Le as conversas em andamento, detecta insatisfacao e avisa antes de virar avaliacao publica."},
    {"nome": "Previsao de movimento", "setor": "operacao",
     "descricao": "Preve o movimento do dia e gera lista de compras e de preparo."},
    {"nome": "Livro de indicacoes", "setor": "rede",
     "descricao": "Registra quem indicou quem e fecha o acerto do mes."},
]

_BRIEF_FIXTURE = """# Brief (modo simulado)

Premissas fixas do modo --mock. Substitua por um LLM real para um brief de verdade.

- Comprador: dono-operador, decide sozinho, sem equipe de TI.
- Orcamento: baixo e mensal; o dinheiro sai do bolso dele, nao de um departamento.
- Canal de compra: WhatsApp e indicacao de conhecido.
- Dor que faz comprar: perda de dinheiro visivel ou risco de imagem.
- Volume de mensagens: alto e concentrado em poucos horarios.
"""


def _documento_fixture(usuario: str) -> str:
    """Documento sintetico que ecoa o bloco de dados recebido.

    Existe para provar que o pipeline inteiro (geracao -> verificacao -> saida) completa.
    Os numeros vem do proprio bloco de dados, entao a verificacao passa como passaria
    com um LLM real que respeitasse a instrucao de nao inventar numero.
    """
    dados = ""
    if "DADOS MEDIDOS" in usuario:
        dados = usuario.split("DADOS MEDIDOS", 1)[1].split("FIM DOS DADOS", 1)[0].strip()
    linhas = {l.split(":", 1)[0].strip(): l.split(":", 1)[1].strip()
              for l in dados.splitlines() if ":" in l}

    def primeiro(campo: str, padrao: str = "-") -> str:
        return linhas.get(campo, padrao).split(" | ")[0].strip()

    def completo(campo: str, padrao: str = "-") -> str:
        """Valor inteiro, com os separadores trocados para nao virar tabela sem querer."""
        return linhas.get(campo, padrao).replace(" | ", " · ").strip()

    nome = linhas.get("Ideia", "ideia de exemplo")
    indice = primeiro("INDICE DE ACAO")
    tier = primeiro("TIER") or completo("TIER")
    if "TIER:" in linhas.get("INDICE DE ACAO", ""):
        tier = linhas["INDICE DE ACAO"].split("TIER:", 1)[1].split(" | ")[0].strip()
    fit = primeiro("fit")
    venda = primeiro("facilidade de venda")
    disrupcao = primeiro("disrupcao")
    solo = primeiro("suporte solo")
    dor = completo("tipo de dor")
    algo = completo("ALGORITMO DA DOR")
    val = completo("VALIDACAO")
    ticket = "300"
    for pedaco in val.split("R$ "):
        if "por mes" in pedaco:
            ticket = pedaco.split(" ")[0].strip()
            break
    return f"""# {nome}

**Indice de Acao:** {indice} · **Tier:** {tier}
**Dor verificada:** {algo}

> Documento gerado em modo `--mock`. O texto abaixo e sintetico e existe apenas para
> exercitar o pipeline de ponta a ponta. Nao use como estudo real.

## 1. Resumo executivo

Esta e uma saida de exemplo. Em execucao real, o LLM escreve aqui o veredito da ideia,
as duas ou tres fraquezas que o plano precisa resolver e o alerta de preco.

O indice de acao medido foi {indice}, com Tier {tier}. A dor foi classificada como {algo}.

## 2. Indicadores coletados

### 2.1 Indicadores principais

| Indicador | Valor |
|---|---|
| Aderencia ao mercado (fit) | {fit} |
| Facilidade de venda | {venda} |
| Disrupcao | {disrupcao} |
| Suporte solo | {solo} |
| Tipo de dor | {dor} |

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
