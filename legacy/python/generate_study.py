#!/usr/bin/env python3
"""Automated niche business study generator: small prompt in, complete study out.

    python3 generate_study.py --niche "clinicas odontologicas em cidade media do interior" \
        --city "Regiao dos Lagos" --ticket 350 --ideas 8 --output estudo --pdf

Pipeline steps:
  1. BRIEF      - LLM reads the niche context and writes market analysis.
  2. IDEAS      - LLM generates N automation product ideas (JSON, distinct mechanisms).
  3. EVALUATION - Each idea is evaluated on the DECIDER (System One: fit, sale, disruption,
                  pain type, solo support, WTP, meta 30, price vs value).
  4. PAIN       - 3-way forced choice ensemble measures pain severity and stability.
  5. DOCUMENTS  - LLM drafts a strategy document per idea constrained to measured numbers.
  6. VERIFY     - Checks required sections, accents, table alignment, and number presence.
  7. OUTPUT     - Markdown + CSV + JSON and optional unified PDF.
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

from goodbizz import evaluation, decider as dec_mod, generation, llm as llm_mod, reports, render
from goodbizz.config import Config
from goodbizz.verification import check_document

CACHE_FILE = ".cache.json"


class Cache:
    """Stores raw API responses to avoid duplicate spend on re-runs."""

    def __init__(self, path: Path) -> None:
        self.path = path
        self.data: dict = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
        self.hits = 0

    @staticmethod
    def key(*parts: str) -> str:
        return hashlib.sha256("|".join(parts).encode()).hexdigest()[:24]

    def get(self, key: str):
        if key in self.data:
            self.hits += 1
            return self.data[key]
        return None

    def put(self, key: str, value) -> None:
        self.data[key] = value
        self.path.write_text(json.dumps(self.data, ensure_ascii=False, indent=1), encoding="utf-8")

    def count(self) -> int:
        return len(self.data)

    # Backwards compatibility methods
    pegar = get
    guardar = put
    salvos = count


def log(msg: str) -> None:
    print(f"  {msg}", flush=True)


def load_ideas(path: str) -> list[dict]:
    """Accepts [{"nome","setor","descricao"}] or ["description 1", "description 2"]."""
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    if isinstance(data, dict):
        data = data.get("ideias") or data.get("ideas") or []
    ideas = []
    for i, d in enumerate(data, 1):
        if isinstance(d, str):
            ideas.append({"n": i, "nome": d.strip(), "setor": "", "descricao": d.strip()})
        else:
            name = str(d.get("nome") or d.get("name") or f"Ideia {i}").strip()
            sector = str(d.get("setor") or d.get("sector") or "").strip()
            desc = str(d.get("descricao") or d.get("description") or name).strip()
            ideas.append({"n": i, "nome": name, "setor": sector, "descricao": desc})
    if not ideas:
        raise ValueError(f"{path} does not contain usable ideas")
    return ideas


_carregar_ideias = load_ideas


def write_reports(
    root: Path,
    cfg: Config,
    brief: str,
    summary_data: dict,
    data: list[dict],
    folder_by_name: dict[str, str],
) -> None:
    (root / "00-brief.md").write_text(
        f"# Brief de contexto — {cfg.niche}\n\n{reports.scope_notice(cfg)}\n{brief.strip()}\n",
        encoding="utf-8",
    )
    (root / "00-tabelao.md").write_text(reports.indicators_table_markdown(cfg, data), encoding="utf-8")
    (root / "00-tabelao.csv").write_text(reports.indicators_table_csv(data), encoding="utf-8")
    if folder_by_name:
        (root / "README.md").write_text(
            reports.index_markdown(cfg, brief, summary_data, folder_by_name),
            encoding="utf-8",
        )
    (root / "dados.json").write_text(
        json.dumps({
            "config": {
                "nicho": cfg.niche, "cidade": cfg.city,
                "ticket_mes": cfg.monthly_ticket, "n_ideias": cfg.num_ideas,
                "mock": cfg.mock, "so_avaliar": cfg.evaluate_only,
            },
            "medias": summary_data["medias"],
            "grupos_dor": summary_data["grupos_dor"],
            "tiers": summary_data.get("tiers", {}),
            "ideias": data,
        }, ensure_ascii=False, indent=1),
        encoding="utf-8",
    )


_escrever_relatorios = write_reports


async def execute(cfg: Config) -> int:
    t0 = time.perf_counter()
    root = Path(cfg.output_dir)
    root.mkdir(parents=True, exist_ok=True)
    cache = Cache(root / CACHE_FILE)

    llm = llm_mod.LLMMock() if cfg.mock_llm else llm_mod.LLMHttp(
        cfg.llm_base_url, cfg.llm_model, cfg.llm_key, cfg.timeout
    )
    decider = dec_mod.build(cfg)

    print(f"\nEstudo de nicho: {cfg.niche}")
    if cfg.city:
        print(f"Regiao: {cfg.city}")
    print(f"Ticket: R$ {cfg.monthly_ticket}/mes | ideias: {cfg.num_ideas} | "
          f"modo: {'SIMULADO' if cfg.mock else 'real'}\n")

    # 1. Brief
    ck = Cache.key("brief", cfg.niche, cfg.city)
    brief = cache.get(ck)
    if brief is None:
        brief = generation.generate_brief(llm, cfg)
        cache.put(ck, brief)
    log(f"[1/6] brief de contexto ({len(brief)} caracteres)")

    # 2. Ideas
    if cfg.ideas_file:
        ideas = load_ideas(cfg.ideas_file)
        log(f"[2/6] {len(ideas)} ideias carregadas de {cfg.ideas_file}")
    else:
        ck = Cache.key("ideias", cfg.niche, cfg.city, str(cfg.num_ideas))
        ideas = cache.get(ck)
        if ideas is None:
            ideas = generation.generate_ideas(llm, cfg, brief, cfg.num_ideas)
            cache.put(ck, ideas)
        log(f"[2/6] {len(ideas)} ideias geradas")

    # 3. Decider evaluation (parallel via semaphore)
    semaphore = asyncio.Semaphore(cfg.concurrency)

    async def evaluate_single(idea: dict) -> dict:
        ck_item = Cache.key(
            "aval", cfg.niche, cfg.city, str(cfg.monthly_ticket),
            idea["nome"], idea["descricao"]
        )
        saved = cache.get(ck_item)
        if saved is not None:
            return saved
        async with semaphore:
            evaluated = await asyncio.to_thread(evaluation.evaluate_idea, idea, decider, cfg)
        cache.put(ck_item, evaluated)
        return evaluated

    data = await asyncio.gather(*(evaluate_single(i) for i in ideas))
    for d in sorted(data, key=lambda x: -x["indice"]):
        a = d["algoritmo"]
        log(f"[3/6] {d['nome'][:38]:<38} indice {d['indice']:.3f} tier {d['tier']} dor {a['rotulo']}")

    summary_data = evaluation.summary(data)

    if cfg.evaluate_only:
        write_reports(root, cfg, brief, summary_data, data, {})
        print(f"\nModo --so-avaliar: parou depois da avaliacao. Dados em {root}/dados.json")
        return 0
    log(f"[4/6] grupos de dor: forte={len(summary_data['grupos_dor']['forte'])} "
        f"mista={len(summary_data['grupos_dor']['mista'])} fraca={len(summary_data['grupos_dor']['fraca'])}")

    folder_by_name = {
        d["nome"]: reports.folder(pos, d["nome"])
        for pos, d in enumerate(summary_data["ordenado"], 1)
    }
    doc_by_name = {d["nome"]: d for d in data}
    issues_list: list[str] = []

    async def write_document(name: str, folder_name: str) -> None:
        d = doc_by_name[name]
        ck_doc = Cache.key("doc", cfg.niche, str(cfg.monthly_ticket), name, str(d["indice"]))
        txt = cache.get(ck_doc)
        if txt is None:
            async with semaphore:
                txt = await asyncio.to_thread(generation.generate_document, llm, d, cfg, brief)
            cache.put(ck_doc, txt)
        txt = txt.replace("\r\n", "\n").strip() + "\n"
        txt = reports.verification.strip_accents(txt)
        i, g, a = d["indicadores"], d["negocio"], d["algoritmo"]
        numbers = [
            d["indice"], i["fit"], i["venda"], i["disrupcao"], i["solo"],
            a["escore_dor"], g["wtp"], cfg.monthly_ticket,
        ]
        literals = ["Tier", "SWOT", "Business Model Canvas", "Porter", "Proximos passos"]
        findings = check_document(txt, numbers, literals)
        dest = root / folder_name / "README.md"
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(txt, encoding="utf-8")
        status = "ok" if not findings else "ATENCAO: " + "; ".join(findings)
        log(f"[5/6] {folder_name:<34} {len(txt) // 1024:>3} KB  {status}")
        if findings:
            issues_list.append(f"{folder_name}: {'; '.join(findings)}")

    await asyncio.gather(*(write_document(name, fname) for name, fname in folder_by_name.items()))

    # 6. Reports and accent normalization
    write_reports(root, cfg, brief, summary_data, data, folder_by_name)

    normalized = reports.normalize_output(root)
    if normalized:
        log(f"[6/6] acentos normalizados em {len(normalized)} arquivo(s)")
    else:
        log("[6/6] nenhum acento a normalizar")

    # 7. Optional PDF compilation
    if cfg.pdf:
        parts = [(root / "README.md"), (root / "00-brief.md"), (root / "00-tabelao.md")]
        parts += [root / folder_by_name[d["nome"]] / "README.md" for d in summary_data["ordenado"]]
        body_elements = []
        for f in parts:
            if f.exists():
                body_elements.append(render.md_to_html(f.read_text(encoding="utf-8")))
                body_elements.append('<hr style="page-break-after: always">')
        html_content = render.full_html(f"Estudo de nicho — {cfg.niche}", "\n".join(body_elements))
        html_path = root / "estudo-completo.html"
        html_path.write_text(html_content, encoding="utf-8")
        ok, msg = render.to_pdf(html_path, root / "estudo-completo.pdf")
        log(f"     pdf: {msg}")

    duration = time.perf_counter() - t0
    print(f"\nPronto em {duration:.1f}s. Saida em {root}/")
    print(f"  README.md, 00-brief.md, 00-tabelao.md/.csv, dados.json, {len(folder_by_name)} pastas de ideia")
    print(f"  cache: {cache.count()} respostas guardadas ({cache.hits} reaproveitadas)")
    if issues_list:
        print(f"\n{len(issues_list)} documento(s) com aviso:")
        for p in issues_list:
            print(f"  - {p}")
    if cfg.mock_llm or cfg.mock_decider:
        parts_warn = []
        if cfg.mock_llm:
            parts_warn.append("texto sintetico (LLM simulado)")
        if cfg.mock_decider:
            parts_warn.append("numeros deterministicos (decisor simulado)")
        print(f"\nAVISO: {' e '.join(parts_warn)}. Nao use esta saida como estudo real.")
    return 0


executar = execute


def main() -> int:
    p = argparse.ArgumentParser(
        description="Generates a complete niche business study from a short prompt.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    p.add_argument("niche", nargs="?", help="the niche in a single sentence")
    p.add_argument("--niche", "--nicho", dest="niche_opt", help="the niche (option alternative)")
    p.add_argument("--city", "--cidade", default="", help="target city or region")
    p.add_argument("--ticket", type=int, default=300, help="monthly ticket in BRL (default: 300)")
    p.add_argument("--ideas", "--ideias", type=int, default=8, help="number of ideas to generate (default: 8)")
    p.add_argument("--output", "--output-dir", "--saida", default="estudo", help="output directory (default: ./estudo)")
    p.add_argument("--ideas-file", "--ideias-arquivo", default="", help="JSON file with ideas (skips LLM generation)")
    p.add_argument("--pain-method", "--metodo-dor", choices=("choice", "escolha", "noul"), default="choice",
                   help="pain measurement method: choice (default, 3 options) or noul (4 probes)")
    p.add_argument("--eval-only", "--so-avaliar", action="store_true", help="stop after evaluation (collect data for calibration)")
    p.add_argument("--mock", action="store_true", help="run offline with simulated LLM and decider")
    p.add_argument("--mock-llm", action="store_true", help="simulate LLM only (use real decider)")
    p.add_argument("--mock-decider", "--mock-decisor", action="store_true", help="simulate decider only (use real LLM)")
    p.add_argument("--pdf", action="store_true", help="compile a single PDF study document")
    p.add_argument("--concurrency", "--paralelo", type=int, default=8, help="concurrent API calls (default: 8)")
    p.add_argument("--timeout", type=float, default=60.0, help="timeout per call in seconds (default: 60.0)")
    p.add_argument("--decider-url", "--decisor-url", default=None, help="System One endpoint URL (Jev, Laya, local, etc.)")
    p.add_argument("--decider-model", "--decisor-model", default=None, help="decider model (e.g. jev-latest, laya-multilingual-v1)")
    p.add_argument("--decider-key", "--decisor-key", default=None, help="decider authentication key (Bearer or x-api-key)")
    p.add_argument("--llm-url", default=None, help="OpenAI-compatible LLM base URL")
    p.add_argument("--llm-model", default=None, help="LLM model (default: gpt-4o-mini)")
    p.add_argument("--llm-key", default=None, help="LLM API key")
    args = p.parse_args()

    niche = (args.niche_opt or args.niche or "").strip()
    if not niche:
        p.error("informe o nicho: --niche \"...\" (or as first positional argument)")

    pain_method = "choice" if args.pain_method in ("choice", "escolha") else "noul"

    cfg_args = {
        "niche": niche,
        "city": args.city,
        "monthly_ticket": args.ticket,
        "num_ideas": args.ideas,
        "output_dir": args.output,
        "ideas_file": args.ideas_file,
        "evaluate_only": args.eval_only,
        "pain_method": pain_method,
        "mock": args.mock,
        "mock_llm": args.mock_llm,
        "mock_decider": args.mock_decider,
        "pdf": args.pdf,
        "concurrency": args.concurrency,
        "timeout": args.timeout,
    }
    if args.decider_url is not None:
        cfg_args["decider_url"] = args.decider_url
    if args.decider_model is not None:
        cfg_args["decider_model"] = args.decider_model
    if args.decider_key is not None:
        cfg_args["decider_key"] = args.decider_key
    if args.llm_url is not None:
        cfg_args["llm_base_url"] = args.llm_url
    if args.llm_model is not None:
        cfg_args["llm_model"] = args.llm_model
    if args.llm_key is not None:
        cfg_args["llm_key"] = args.llm_key

    try:
        cfg = Config(**cfg_args)
    except ValueError as err:
        print(f"configuration error: {err}", file=sys.stderr)
        return 2

    try:
        return asyncio.run(execute(cfg))
    except KeyboardInterrupt:
        print("\ninterrupted", file=sys.stderr)
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
