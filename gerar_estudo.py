#!/usr/bin/env python3
"""
Estudo de nicho automatico: um prompt pequeno entra, um estudo completo sai.

    python3 gerar_estudo.py --nicho "clinicas odontologicas em cidade media do interior" \
        --cidade "Regiao dos Lagos" --ticket 350 --ideias 8 --saida estudo --pdf

O que ele faz, em ordem:

  1. BRIEF      - o LLM le o nicho e escreve o contexto de mercado.
  2. IDEIAS     - o LLM propoe N ideias de automacao (JSON, mecanismos diferentes).
  3. AVALIACAO  - cada ideia vai ao DECISOR (System One), que devolve nota e probabilidade:
                  fit, facilidade de venda, disrupcao, tipo de dor, suporte solo,
                  disposicao a pagar no ticket informado, meta de clientes e preco vs valor.
  4. DOR        - o algoritmo de 4 sondas x N parafrases classifica a dor (FORTE / FRACA /
                  INDETERMINADO / INSTAVEL) com limiar calibrado e escalonamento.
  5. DOCUMENTOS - o LLM escreve um plano por ideia (venda, marketing, SWOT, Canvas, Porter,
                  riscos, roadmap, KPIs) usando SOMENTE os numeros medidos.
  6. VERIFICACAO- checa secoes, acentos, tabelas e presenca dos numeros; normaliza acentos.
  7. SAIDA      - md + csv + json e, com --pdf, um PDF unico com tudo.

Configuracao por variavel de ambiente ou argumento CLI:
  GOODBIZZ_LLM_URL / GOODBIZZ_LLM_MODEL / GOODBIZZ_LLM_KEY (--llm-url, --llm-model, --llm-key)
  GOODBIZZ_DECISOR_URL / GOODBIZZ_DECISOR_MODEL / GOODBIZZ_DECISOR_KEY (--decisor-url, --decisor-model, --decisor-key)
  Funciona com qualquer System One: Jev, Laya (cloud/local), self-hosted ou gateway.

Sem credencial, rode com --mock: o encanamento inteiro executa com dados deterministicos.
"""
from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from nicho import avaliacao, decisor as dec_mod, geracao, llm as llm_mod, relatorios, render
from nicho.config import Config
from nicho.verificacao import checar_documento

CACHE_ARQUIVO = ".cache.json"


class Cache:
    """Guarda respostas cruas para nao gastar de novo em reexecucao."""

    def __init__(self, caminho: Path) -> None:
        self.caminho = caminho
        self.dados: dict = json.loads(caminho.read_text()) if caminho.exists() else {}
        self.acertos = 0

    @staticmethod
    def chave(*partes: str) -> str:
        return hashlib.sha256("|".join(partes).encode()).hexdigest()[:24]

    def pegar(self, chave: str):
        if chave in self.dados:
            self.acertos += 1
            return self.dados[chave]
        return None

    def guardar(self, chave: str, valor) -> None:
        self.dados[chave] = valor
        self.caminho.write_text(json.dumps(self.dados, ensure_ascii=False, indent=1))

    def salvos(self) -> int:
        return len(self.dados)


def log(msg: str) -> None:
    print(f"  {msg}", flush=True)


def _carregar_ideias(caminho: str) -> list[dict]:
    """Aceita [{"nome","setor","descricao"}] ou ["descricao 1", "descricao 2"]."""
    dados = json.loads(Path(caminho).read_text(encoding="utf-8"))
    if isinstance(dados, dict):
        dados = dados.get("ideias") or dados.get("ideas") or []
    ideias = []
    for i, d in enumerate(dados, 1):
        if isinstance(d, str):
            ideias.append({"n": i, "nome": d.strip(), "setor": "", "descricao": d.strip()})
        else:
            nome = str(d.get("nome") or d.get("name") or f"Ideia {i}").strip()
            ideias.append({"n": i, "nome": nome, "setor": str(d.get("setor") or "").strip(),
                           "descricao": str(d.get("descricao") or d.get("description") or nome).strip()})
    if not ideias:
        raise ValueError(f"{caminho} nao tem ideias utilizaveis")
    return ideias


def _escrever_relatorios(raiz: Path, cfg: Config, brief: str, r: dict, dados: list[dict],
                         pasta_por_nome: dict[str, str]) -> None:
    (raiz / "00-brief.md").write_text(
        f"# Brief de contexto — {cfg.nicho}\n\n{relatorios.aviso_escopo(cfg)}\n"
        f"{brief.strip()}\n", encoding="utf-8")
    (raiz / "00-tabelao.md").write_text(relatorios.tabelao_md(cfg, dados), encoding="utf-8")
    (raiz / "00-tabelao.csv").write_text(relatorios.tabelao_csv(dados), encoding="utf-8")
    if pasta_por_nome:
        (raiz / "README.md").write_text(
            relatorios.indice_md(cfg, brief, r, pasta_por_nome), encoding="utf-8")
    (raiz / "dados.json").write_text(
        json.dumps({"config": {"nicho": cfg.nicho, "cidade": cfg.cidade,
                               "ticket_mes": cfg.ticket_mes, "n_ideias": cfg.n_ideias,
                               "mock": cfg.mock, "so_avaliar": cfg.so_avaliar},
                    "medias": r["medias"], "grupos_dor": r["grupos_dor"],
                    "tiers": r["tiers"], "ideias": dados},
                   ensure_ascii=False, indent=1), encoding="utf-8")


async def executar(cfg: Config) -> int:
    t0 = time.perf_counter()
    raiz = Path(cfg.saida)
    raiz.mkdir(parents=True, exist_ok=True)
    cache = Cache(raiz / CACHE_ARQUIVO)

    llm = llm_mod.LLMMock() if cfg.mock_llm else llm_mod.LLMHttp(
        cfg.llm_base_url, cfg.llm_model, cfg.llm_key, cfg.timeout)
    decisor = dec_mod.construir(cfg)

    print(f"\nEstudo de nicho: {cfg.nicho}")
    if cfg.cidade:
        print(f"Regiao: {cfg.cidade}")
    print(f"Ticket: R$ {cfg.ticket_mes}/mes | ideias: {cfg.n_ideias} | "
          f"modo: {'SIMULADO' if cfg.mock else 'real'}\n")

    # 1. brief
    ck = Cache.chave("brief", cfg.nicho, cfg.cidade)
    brief = cache.pegar(ck)
    if brief is None:
        brief = geracao.gerar_brief(llm, cfg)
        cache.guardar(ck, brief)
    log(f"[1/6] brief de contexto ({len(brief)} caracteres)")

    # 2. ideias
    if cfg.ideias_arquivo:
        ideias = _carregar_ideias(cfg.ideias_arquivo)
        log(f"[2/6] {len(ideias)} ideias carregadas de {cfg.ideias_arquivo}")
    else:
        ck = Cache.chave("ideias", cfg.nicho, cfg.cidade, str(cfg.n_ideias))
        ideias = cache.pegar(ck)
        if ideias is None:
            ideias = geracao.gerar_ideias(llm, cfg, brief, cfg.n_ideias)
            cache.guardar(ck, ideias)
        log(f"[2/6] {len(ideias)} ideias geradas")
    # 3. avaliacao no decisor (paralelo)
    semente = asyncio.Semaphore(cfg.paralelo)

    async def avaliar(ideia: dict) -> dict:
        ck = Cache.chave("aval", cfg.nicho, cfg.cidade, str(cfg.ticket_mes),
                         ideia["nome"], ideia["descricao"])
        guardado = cache.pegar(ck)
        if guardado is not None:
            return guardado
        async with semente:
            d = await asyncio.to_thread(avaliacao.avaliar_ideia, ideia, decisor, cfg)
        cache.guardar(ck, d)
        return d

    dados = await asyncio.gather(*(avaliar(i) for i in ideias))
    for d in sorted(dados, key=lambda x: -x["indice"]):
        a = d["algoritmo"]
        log(f"[3/6] {d['nome'][:38]:<38} indice {d['indice']:.3f} tier {d['tier']} "
            f"dor {a['rotulo']}")

    r = avaliacao.resumo(dados)

    if cfg.so_avaliar:
        _escrever_relatorios(raiz, cfg, brief, r, dados, {})
        print(f"\nModo --so-avaliar: parou depois da avaliacao. Dados em {raiz}/dados.json")
        return 0
    log(f"[4/6] grupos de dor: forte={len(r['grupos_dor']['forte'])} "
        f"mista={len(r['grupos_dor']['mista'])} fraca={len(r['grupos_dor']['fraca'])}")

    # as pastas seguem a ORDEM DO RANKING, para que o numero da pasta e a posicao
    # no indice sejam sempre o mesmo
    pasta_por_nome = {d["nome"]: relatorios.pasta(pos, d["nome"])
                      for pos, d in enumerate(r["ordenado"], 1)}
    doc_por_nome = {d["nome"]: d for d in dados}
    problemas: list[str] = []

    async def escrever(nome: str, pasta: str) -> None:
        d = doc_por_nome[nome]
        ck = Cache.chave("doc", cfg.nicho, str(cfg.ticket_mes), nome, str(d["indice"]))
        txt = cache.pegar(ck)
        if txt is None:
            async with semente:
                txt = await asyncio.to_thread(geracao.gerar_documento, llm, d, cfg, brief)
            cache.guardar(ck, txt)
        txt = txt.replace("\r\n", "\n").strip() + "\n"
        # normaliza ANTES de verificar: o verificador tem que julgar o artefato final,
        # nao o texto cru do LLM
        txt = relatorios.verificacao.sem_acento(txt)
        i, g, a = d["indicadores"], d["negocio"], d["algoritmo"]
        numeros = [d["indice"], i["fit"], i["venda"], i["disrupcao"], i["solo"],
                   a["escore_dor"], g["wtp"], cfg.ticket_mes]
        literais = ["Tier", "SWOT", "Business Model Canvas", "Porter", "Proximos passos"]
        achados = checar_documento(txt, numeros, literais)
        destino = raiz / pasta / "README.md"
        destino.parent.mkdir(parents=True, exist_ok=True)
        destino.write_text(txt, encoding="utf-8")
        marca = "ok" if not achados else "ATENCAO: " + "; ".join(achados)
        log(f"[5/6] {pasta:<34} {len(txt) // 1024:>3} KB  {marca}")
        if achados:
            problemas.append(f"{pasta}: {'; '.join(achados)}")

    await asyncio.gather(*(escrever(nome, pasta) for nome, pasta in pasta_por_nome.items()))

    # 6. relatorios deterministicos + normalizacao
    _escrever_relatorios(raiz, cfg, brief, r, dados, pasta_por_nome)

    mudou = relatorios.normalizar_saida(raiz)
    if mudou:
        log(f"[6/6] acentos normalizados em {len(mudou)} arquivo(s)")
    else:
        log("[6/6] nenhum acento a normalizar")

    # pdf opcional
    if cfg.pdf:
        pedacos = [(raiz / "README.md"), (raiz / "00-brief.md"), (raiz / "00-tabelao.md")]
        pedacos += [raiz / pasta_por_nome[d["nome"]] / "README.md" for d in r["ordenado"]]
        corpo = []
        for f in pedacos:
            if f.exists():
                corpo.append(render.md_para_html(f.read_text(encoding="utf-8")))
                corpo.append('<hr style="page-break-after: always">')
        html = render.html_completo(f"Estudo de nicho — {cfg.nicho}", "\n".join(corpo))
        html_path = raiz / "estudo-completo.html"
        html_path.write_text(html, encoding="utf-8")
        ok, msg = render.para_pdf(html_path, raiz / "estudo-completo.pdf")
        log(f"     pdf: {msg}")

    dur = time.perf_counter() - t0
    print(f"\nPronto em {dur:.1f}s. Saida em {raiz}/")
    print(f"  README.md, 00-brief.md, 00-tabelao.md/.csv, dados.json, "
          f"{len(pasta_por_nome)} pastas de ideia")
    print(f"  cache: {cache.salvos()} respostas guardadas ({cache.acertos} reaproveitadas)")
    if problemas:
        print(f"\n{len(problemas)} documento(s) com aviso:")
        for p in problemas:
            print(f"  - {p}")
    if cfg.mock_llm or cfg.mock_decisor:
        partes = []
        if cfg.mock_llm:
            partes.append("texto sintetico (LLM simulado)")
        if cfg.mock_decisor:
            partes.append("numeros deterministicos (decisor simulado)")
        print(f"\nAVISO: {' e '.join(partes)}. Nao use esta saida como estudo real.")
    return 0


def main() -> int:
    p = argparse.ArgumentParser(
        description="Gera um estudo de nicho completo a partir de um prompt pequeno.",
        formatter_class=argparse.RawDescriptionHelpFormatter, epilog=__doc__)
    p.add_argument("nicho", nargs="?", help="o nicho, em uma frase")
    p.add_argument("--nicho", dest="nicho_opt", help="o nicho (alternativa ao argumento)")
    p.add_argument("--cidade", default="", help="cidade ou regiao alvo")
    p.add_argument("--ticket", type=int, default=300, help="ticket mensal em reais (padrao 300)")
    p.add_argument("--ideias", type=int, default=8, help="quantidade de ideias (padrao 8)")
    p.add_argument("--saida", default="estudo", help="pasta de saida (padrao ./estudo)")
    p.add_argument("--ideias-arquivo", default="",
                   help="JSON com a lista de ideias: pula a geracao por LLM")
    p.add_argument("--metodo-dor", choices=("escolha", "noul"), default="escolha",
                   help="como medir a dor: escolha (padrao, 3 opcoes) ou noul (4 sondas)")
    p.add_argument("--so-avaliar", action="store_true",
                   help="para depois da avaliacao (coleta dados para recalibrar)")
    p.add_argument("--mock", action="store_true",
                   help="roda sem credencial, com LLM e decisor simulados")
    p.add_argument("--mock-llm", action="store_true", help="simula so o LLM (decisor real)")
    p.add_argument("--mock-decisor", action="store_true",
                   help="simula so o decisor (LLM real)")
    p.add_argument("--pdf", action="store_true", help="gera tambem um PDF unico")
    p.add_argument("--paralelo", type=int, default=8, help="chamadas simultaneas (padrao 8)")
    p.add_argument("--timeout", type=float, default=60.0, help="timeout por chamada, em segundos")
    p.add_argument("--decisor-url", default=None,
                   help="URL do endpoint System One (Jev, Laya, local, etc.)")
    p.add_argument("--decisor-model", default=None,
                   help="modelo do decisor (ex: jev-latest, laya-multilingual-v1)")
    p.add_argument("--decisor-key", default=None,
                   help="chave de autenticacao do decisor (Bearer ou x-api-key)")
    p.add_argument("--llm-url", default=None,
                   help="URL base do LLM compativel OpenAI")
    p.add_argument("--llm-model", default=None,
                   help="modelo do LLM (padrao: gpt-4o-mini)")
    p.add_argument("--llm-key", default=None,
                   help="chave de API do LLM")
    a = p.parse_args()

    nicho = (a.nicho_opt or a.nicho or "").strip()
    if not nicho:
        p.error("informe o nicho: --nicho \"...\" (ou como primeiro argumento)")
    cfg_args = {
        "nicho": nicho, "cidade": a.cidade, "ticket_mes": a.ticket, "n_ideias": a.ideias,
        "saida": a.saida, "ideias_arquivo": a.ideias_arquivo,
        "so_avaliar": a.so_avaliar, "metodo_dor": a.metodo_dor,
        "mock": a.mock, "mock_llm": a.mock_llm,
        "mock_decisor": a.mock_decisor, "pdf": a.pdf, "paralelo": a.paralelo,
        "timeout": a.timeout,
    }
    if a.decisor_url is not None:
        cfg_args["decisor_url"] = a.decisor_url
    if a.decisor_model is not None:
        cfg_args["decisor_model"] = a.decisor_model
    if a.decisor_key is not None:
        cfg_args["decisor_key"] = a.decisor_key
    if a.llm_url is not None:
        cfg_args["llm_base_url"] = a.llm_url
    if a.llm_model is not None:
        cfg_args["llm_model"] = a.llm_model
    if a.llm_key is not None:
        cfg_args["llm_key"] = a.llm_key
    try:
        cfg = Config(**cfg_args)
    except ValueError as e:
        print(f"erro de configuracao: {e}", file=sys.stderr)
        return 2
    try:
        return asyncio.run(executar(cfg))
    except KeyboardInterrupt:
        print("\ninterrompido", file=sys.stderr)
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
