/**
 * Paginas da interface.
 *
 * Duas regras de leitura:
 * 1. todo dado apresentado vem com o seu helper, no formato "dado 0.89 (maior é melhor)";
 * 2. as cores nao sao decoracao: elas seguem a escala do operador, do vermelho (sinal ruim ou
 *    quente) ao verde (sinal bom), conforme os limiares da metodologia.
 */
import type { FC } from "hono/jsx";
import { html, raw } from "hono/html";

import { estimateCost } from "../../../application/costs.ts";
import { tierOf } from "../../../application/evaluate.ts";
import { MAX_IDEAS_PER_STUDY } from "../../../application/study-service.ts";
import { explainFailure } from "../../../application/failures.ts";
import { folderName } from "../../../application/reports.ts";
import { MAX_DESCRIPTION_LENGTH, MAX_NICHE_LENGTH } from "../../../domain/naming.ts";
import { PROVIDER_GROUPS } from "../../../config/providers.ts";
import type { ProviderSettingRow, ProviderSource } from "../../../config/providers.ts";
import type {
  StudyIdea,
  StudyListItem,
  StudyRecord,
  StudyState,
  StudyUsage,
  Tier,
} from "../../../domain/types.ts";
import { GLOSSARY, Term } from "./layout.tsx";

const STATE_LABEL: Record<StudyState, string> = {
  pending: "na fila",
  running: "executando",
  done: "concluído",
  failed: "falhou",
};

/** Tom de cor por estado: verde so quando terminou bem. */
const STATE_TONE: Record<StudyState, string> = {
  pending: "b-yellow",
  running: "b-orange",
  done: "b-green",
  failed: "b-red",
};

const STATE_TIP: Record<StudyState, string> = {
  pending: "Criado agora, aguardando o início do pipeline.",
  running: "Em andamento: brief, ideias, avaliação, documentos e relatórios.",
  done: "Terminou bem. Ranking, médias, artefatos e plano estão disponíveis.",
  failed: "Terminou com erro. O motivo e a ação de executar de novo aparecem no painel de alerta.",
};

const TIER_NOTE: Record<Tier, string> = {
  A: "aderência alta e venda natural",
  B: "boa ideia, exige provar valor",
  C: "venda difícil ou mudança de hábito",
};

/** Dor: vermelho e o sinal que interessa (consequencia imediata), amarelo e dor interna. */
const PAIN_TONE: Record<string, string> = {
  FORTE: "b-red",
  INSTAVEL: "b-orange",
  INDETERMINADO: "b-orange",
  FRACA: "b-yellow",
};

/** Rotulo de exibicao da dor; o valor recebido do dominio nunca muda. */
const PAIN_LABEL: Record<string, string> = {
  FORTE: "FORTE",
  FRACA: "FRACA",
  INDETERMINADO: "INDETERMINADO",
  INSTAVEL: "INSTÁVEL",
};

export const PAIN_MEANING: Record<string, string> = {
  FORTE: "o dono perde dinheiro hoje ou queima a imagem pública",
  FRACA: "ganho interno de organização; o dono não paga por urgência",
  INDETERMINADO: "zona cinzenta; precisa de revisão manual",
  INSTAVEL: "as paráfrases divergem; a medição não é confiável",
};

/** Escala de cor aplicada ao indice de acao (0 a 2, maior é melhor). */
function indexTone(index: number): string {
  if (index >= 1.84) return "green";
  if (index >= 1.6) return "lime";
  if (index >= 1.2) return "yellow";
  return "orange";
}

/** Desvio entre parafrases (menor é melhor). */
function deviationTone(deviation: number): string {
  if (deviation < 0.15) return "green";
  if (deviation < 0.3) return "yellow";
  return "red";
}

/** Probabilidade de 0 a 1 (maior é melhor). */
function probabilityTone(value: number): string {
  if (value >= 0.66) return "green";
  if (value >= 0.5) return "lime";
  if (value >= 0.33) return "yellow";
  if (value >= 0.15) return "orange";
  return "red";
}

const ARTIFACT_HINTS: Array<[RegExp, string]> = [
  [/^00-brief\.md$/, "leitura de mercado que orientou as ideias"],
  [/^00-tabelao\.md$/, "todos os indicadores lado a lado"],
  [/^00-tabelao\.csv$/, "mesma tabela para planilha"],
  [/^dados\.json$/, "dados brutos; entrada do recalibrate"],
  [/^README\.md$/, "índice do estudo com o ranking"],
  [/^\d+-.+\/README\.md$/, "plano completo da ideia"],
];

function artifactHint(path: string): string {
  for (const [pattern, hint] of ARTIFACT_HINTS) if (pattern.test(path)) return hint;
  return "arquivo do estudo";
}

function artifactExt(path: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(path);
  return match?.[1]?.toLowerCase() ?? "arquivo";
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleDateString("pt-BR");
}

const Hint: FC<{ children: string }> = (props) => <span class="hint">({props.children})</span>;

const StateBadge: FC<{ state: StudyState }> = (props) => (
  <span class={`badge ${STATE_TONE[props.state]} has-tip`} tabindex="0">
    {STATE_LABEL[props.state]}
    <span class="tip" role="tooltip">
      {STATE_TIP[props.state]}
    </span>
  </span>
);

const TierBadge: FC<{ tier: Tier }> = (props) => (
  <span class={`tier has-tip tier-${props.tier}`} tabindex="0">
    {props.tier}
    <span class="tip" role="tooltip">
      {`Tier ${props.tier}: ${TIER_NOTE[props.tier]}. ${GLOSSARY["Tier"] ?? ""}`}
    </span>
  </span>
);

const PainBadge: FC<{ label: string }> = (props) => (
  <span class={`badge ${PAIN_TONE[props.label] ?? "b-yellow"} has-tip`} tabindex="0">
    {PAIN_LABEL[props.label] ?? props.label}
    <span class="tip" role="tooltip">
      {GLOSSARY[props.label] ?? PAIN_MEANING[props.label] ?? ""}
    </span>
  </span>
);

/** Bloco de metrica: rotulo, valor em monospace, tom da escala e o helper de leitura. */
const Metric: FC<{
  term: string;
  label: string;
  value: string;
  hint: string;
  note?: string;
  tone: string;
}> = (props) => (
  <li class={`metric tone-${props.tone}`}>
    <span class="metric-label">
      <Term of={props.term}>{props.label}</Term>
    </span>
    <span class="value">{props.value}</span>
    <span class="hint">({props.hint})</span>
    {props.note !== undefined ? <span class="metric-note">{props.note}</span> : null}
  </li>
);

/**
 * Consumo medido e custo estimado do estudo. Sem `usage` (estudo antigo) nao ha o que mostrar alem
 * do aviso; com `usage`, o custo vem do helper `estimateCost`, que le os precos do ambiente.
 */
const UsagePanel: FC<{ usage: StudyUsage | null }> = (props) => {
  const cost = estimateCost(props.usage);
  if (props.usage === null || cost === null) {
    return (
      <section class="panel glass" id="usage">
        <h3>
          Consumo e custo estimado <Hint>tokens medidos no pipeline</Hint>
        </h3>
        <p id="usage-empty" class="sub">
          Sem medição de consumo (estudo gerado antes desta versão).
        </p>
      </section>
    );
  }
  const totals = totalTokens(props.usage);
  return (
    <section class="panel glass" id="usage">
      <h3>
        Consumo e custo estimado <Hint>tokens medidos no pipeline e preço de tabela</Hint>
      </h3>
      <ul id="usage-metrics" class="metrics">
        <Metric
          term="LLM"
          label="chamadas ao LLM"
          value={props.usage.llm.calls.toLocaleString("pt-BR")}
          hint="requisições de texto feitas ao modelo"
          tone="neutral"
        />
        <Metric
          term="decisor"
          label="chamadas ao decisor"
          value={props.usage.decider.calls.toLocaleString("pt-BR")}
          hint="perguntas levadas ao System One"
          tone="neutral"
        />
        <Metric
          term="tokens"
          label="tokens de entrada"
          value={totals.input.toLocaleString("pt-BR")}
          hint="texto enviado aos provedores"
          tone="neutral"
        />
        {totals.cached > 0 ? (
          <Metric
            term="tokens"
            label="tokens de entrada em cache"
            value={totals.cached.toLocaleString("pt-BR")}
            hint="entrada reaproveitada, cobrada mais barata"
            tone="neutral"
          />
        ) : null}
        <Metric
          term="tokens"
          label="tokens de saída"
          value={totals.output.toLocaleString("pt-BR")}
          hint="texto gerado pelos provedores"
          tone="neutral"
        />
        <Metric
          term="custo"
          label="custo estimado"
          value={
            formatMoney("US$", cost.usd, 4) +
            (cost.brl !== null ? ` · ${formatMoney("R$", cost.brl, 2)}` : "")
          }
          hint={cost.note}
          tone="neutral"
        />
      </ul>
    </section>
  );
};

/** Como ler: as regras da metodologia, mais a leitura da escala de cor. Vive na pagina /como-ler. */
export const Legend: FC = () => (
  <section class="panel glass">
    <h3>Indicadores, limiares e escala</h3>
    <dl class="legend">
      <div>
        <dt>
          <Term of="Índice de Ação">Índice de Ação</Term>{" "}
          <Hint>média entre fit e facilidade de venda; maior é melhor</Hint>
        </dt>
        <dd>
          Tier A a partir de 1.84, Tier B a partir de 1.60, Tier C abaixo disso. É o critério de priorização,
          não uma previsão de faturamento.
        </dd>
      </div>
      <div>
        <dt>
          <Term of="escala">Escala de cor</Term>
        </dt>
        <dd>
          Vermelho aponta sinal ruim ou quente, laranja pede atenção, amarelo é médio, limão e verde apontam
          sinal bom. A mesma escala colore índice, tier, dor, desvio e estado.
          <span class="scale">
            <i />
            <i />
            <i />
            <i />
            <i />
          </span>
          <span class="scale-labels">
            <span>ruim</span>
            <span>médio</span>
            <span>bom</span>
          </span>
        </dd>
      </div>
      <div>
        <dt>
          <Term of="fit">Fit</Term> <Hint>0 a 2; maior é melhor</Hint>
        </dt>
        <dd>
          2 = resolve um caos da operação diária sem exigir mudança de hábito do dono. 0 = exige escala
          corporativa.
        </dd>
      </div>
      <div>
        <dt>
          <Term of="venda">Facilidade de venda</Term> <Hint>0 a 2; maior é melhor</Hint>
        </dt>
        <dd>2 = ataca perda de dinheiro ou de imagem agora. 0 = benefício invisível no curto prazo.</dd>
      </div>
      <div>
        <dt>
          <Term of="disrupção">Disrupção</Term> <Hint>0 a 2; maior é melhor</Hint>
        </dt>
        <dd>
          2 = muda o modelo de operação ou cria receita que não existia. 0 = automatiza o que todo mundo já
          faz.
        </dd>
      </div>
      <div>
        <dt>
          <Term of="dor">Dor</Term> <Hint>FORTE é o sinal que interessa</Hint>
        </dt>
        <dd>
          <Term of="FORTE">FORTE</Term>: escore de 0.65 ou mais é dominante. <Term of="FRACA">FRACA</Term>:
          dor interna de 0.50 ou mais. <Term of="INSTAVEL">INSTÁVEL</Term>: <Term of="desvio">desvio</Term>{" "}
          entre <Term of="paráfrases">paráfrases</Term> acima de 0.15, o que manda a ideia para revisão
          manual.
        </dd>
      </div>
      <div>
        <dt>
          Probabilidades <Hint>0 a 1; maior é melhor</Hint>
        </dt>
        <dd>
          Disposição a pagar (<Term of="WTP">WTP</Term>) e viabilidade de 30 clientes em 24 meses (
          <Term of="meta30">meta30</Term>) são probabilidades medidas no <Term of="decisor">decisor</Term>,
          não contagens. Use-as para comparar ideias entre si.
        </dd>
      </div>
      <div>
        <dt>
          Regras de negócio do plano <Hint>teto, não piso</Hint>
        </dt>
        <dd>
          O <Term of="ticket">ticket</Term> informado é o teto da precificação. A meta do plano é de 10 a 15
          clientes em 24 meses; 30 é cenário otimista, não base.
        </dd>
      </div>
      <div>
        <dt>
          Texto do plano <Hint>LLM sob guardrail</Hint>
        </dt>
        <dd>
          A prosa é escrita por um <Term of="LLM">LLM</Term>, mas todo número vem do bloco medido. Estimativa
          fora do bloco aparece marcada como <Term of="[INFERENCE]">[INFERENCE]</Term>.
        </dd>
      </div>
    </dl>
  </section>
);

/**
 * Confirmacao da exclusao: com JS, intercepta o `submit` do form, mostra o dialogo nativo, troca o
 * texto pelo nome do estudo e, no confirmado, chama `DELETE /api/studies/:id`.
 */
const DELETE_MODAL_SCRIPT = `
(function () {
  var modal = document.getElementById("delete-modal");
  if (!modal || typeof modal.showModal !== "function") return;
  var text = document.getElementById("delete-modal-text");
  var error = document.getElementById("delete-error");
  var confirmButton = document.getElementById("delete-confirm");
  var cancelButton = document.getElementById("delete-cancel");
  var current = null;
  Array.prototype.slice.call(document.querySelectorAll(".delete-form")).forEach(function (form) {
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      current = form;
      var name = form.dataset.deleteName || "";
      if (text) {
        text.textContent =
          "Excluir " + name + "? Os arquivos e o estudo são apagados do disco. Não há como desfazer.";
      }
      if (error) error.textContent = "";
      if (confirmButton) confirmButton.disabled = false;
      modal.showModal();
    });
  });
  if (cancelButton) cancelButton.addEventListener("click", function () { modal.close(); });
  modal.addEventListener("click", function (event) {
    if (event.target === modal) modal.close();
  });
  if (confirmButton) {
    confirmButton.addEventListener("click", function () {
      if (!current) return;
      confirmButton.disabled = true;
      // A falha vai para o aviso proprio: a pergunta do dialogo continua visivel, e a recusa por
      // estudo em execucao ganha a frase que diz o que fazer em vez do texto cru do dominio.
      (async function () {
        var status = 0;
        var message = "";
        try {
          var response = await fetch(current.dataset.deleteApi, { method: "DELETE" });
          if (response.ok) { window.location.href = "/"; return; }
          status = response.status;
          try {
            var body = await response.json();
            message = body && body.message ? body.message : "";
          } catch (ignored) { message = ""; }
        } catch (failure) {
          message = failure && failure.message ? failure.message : "";
        }
        if (error) {
          error.textContent = status === 409
            ? "O estudo ainda está em execução — aguarde terminar para excluir."
            : message || "falha ao excluir o estudo";
        }
        confirmButton.disabled = false;
      })();
    });
  }
})();`;

/**
 * Formulario de exclusao: sem JS posta direto em `/ui/studies/:id/delete` (mesma origem + CSRF);
 * com JS, o `submit` e interceptado e a confirmacao acontece no dialogo abaixo.
 */
const DeleteForm: FC<{ id: string; token: string; name: string }> = (props) => (
  <form
    class="delete-form"
    method="post"
    action={`/ui/studies/${props.id}/delete`}
    data-delete-api={`/api/studies/${props.id}`}
    data-delete-name={props.name}
  >
    <input type="hidden" name="_csrf" value={props.token} />
    <button type="submit" class="btn btn-danger btn-sm">
      Excluir
    </button>
  </form>
);

/** Confirmacao da exclusao. Serao o dialogo nativo e o `fetch(DELETE)`; sem JS o form posta direto. */
const DeleteDialog: FC = () => (
  <>
    <dialog id="delete-modal" class="modal modal-confirm" aria-labelledby="delete-modal-title">
      <div class="modal-head">
        <h3 id="delete-modal-title">Excluir estudo</h3>
      </div>
      <div class="modal-body">
        <p id="delete-modal-text">Os arquivos e o estudo são apagados do disco. Não há como desfazer.</p>
        <p id="delete-error" class="alert" role="alert" />
        <div class="form-actions">
          <button type="button" class="btn btn-ghost" id="delete-cancel">
            Cancelar
          </button>
          <button type="button" class="btn btn-danger" id="delete-confirm">
            Excluir
          </button>
        </div>
      </div>
    </dialog>
    <script>{raw(DELETE_MODAL_SCRIPT)}</script>
  </>
);

/**
 * Renomear: com JS intercepta o `submit`, abre o dialogo e envia um `PATCH`; sem JS o form posta
 * direto em `/ui/studies/:id/rename` (mesma origem + CSRF), que responde 303 para a pagina do estudo.
 */
const RENAME_MODAL_SCRIPT = `
(function () {
  var modal = document.getElementById("rename-modal");
  if (!modal || typeof modal.showModal !== "function") return;
  var input = document.getElementById("rename-input");
  var error = document.getElementById("rename-error");
  var saveButton = document.getElementById("rename-save");
  var cancelButton = document.getElementById("rename-cancel");
  var current = null;
  function close() { modal.close(); }
  Array.prototype.slice.call(document.querySelectorAll(".rename-form")).forEach(function (form) {
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      current = form;
      if (input) input.value = form.dataset.renameCurrent || "";
      if (error) error.textContent = "";
      if (saveButton) saveButton.disabled = false;
      modal.showModal();
      if (input) input.focus();
    });
  });
  if (cancelButton) cancelButton.addEventListener("click", close);
  modal.addEventListener("click", function (event) {
    if (event.target === modal) close();
  });
  if (saveButton) {
    saveButton.addEventListener("click", function () {
      if (!current || !input) return;
      var niche = input.value.trim();
      if (!niche) {
        if (error) error.textContent = "o título não pode ficar vazio";
        return;
      }
      saveButton.disabled = true;
      fetch(current.dataset.renameApi, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ niche: niche }),
      })
        .then(function (response) {
          if (response.ok) { window.location.reload(); return null; }
          return response.json().then(
            function (body) { throw new Error(body.message || "não foi possível renomear o estudo"); },
            function () { throw new Error("não foi possível renomear o estudo"); },
          );
        })
        .catch(function (failure) {
          // 422 (nicho curto) e outros erros ficam no diálogo; ele não fecha.
          if (error) error.textContent = failure.message || "não foi possível renomear o estudo";
          saveButton.disabled = false;
        });
    });
  }
})();`;

/** Form de renomear: o campo inline e o fallback sem JS; com JS ele some e sobra o gatilho. */
const RenameForm: FC<{ id: string; token: string; niche: string }> = (props) => (
  <form
    class="rename-form"
    method="post"
    action={`/ui/studies/${props.id}/rename`}
    data-rename-api={`/api/studies/${props.id}`}
    data-rename-current={props.niche}
  >
    <input type="hidden" name="_csrf" value={props.token} />
    <input
      class="rename-inline"
      name="niche"
      type="text"
      value={props.niche}
      aria-label="Novo título do estudo"
    />
    <button type="submit" class="btn btn-ghost btn-sm">
      Renomear
    </button>
  </form>
);

/** Dialogo de renomear: campo pre-preenchido, erro inline e os botoes Salvar/Cancelar. */
const RenameDialog: FC = () => (
  <>
    <dialog id="rename-modal" class="modal modal-confirm" aria-labelledby="rename-modal-title">
      <div class="modal-head">
        <h3 id="rename-modal-title">Renomear estudo</h3>
      </div>
      <div class="modal-body">
        <div class="field">
          <label for="rename-input">Título do estudo</label>
          <input id="rename-input" type="text" />
          <p id="rename-error" class="alert" role="alert" />
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-ghost" id="rename-cancel">
            Cancelar
          </button>
          <button type="button" class="btn btn-primary" id="rename-save">
            Salvar
          </button>
        </div>
      </div>
    </dialog>
    <script>{raw(RENAME_MODAL_SCRIPT)}</script>
  </>
);

/**
 * Executar de novo: com JS chama `POST /api/studies/:id/run` e recarrega; sem JS posta em
 * `/ui/studies/:id/run` (mesma origem + CSRF), que reinicia o pipeline e responde 303.
 */
const RUN_SCRIPT = `
(function () {
  var error = document.getElementById("run-error");
  Array.prototype.slice.call(document.querySelectorAll(".run-form")).forEach(function (form) {
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var button = form.querySelector("button[type=submit]");
      if (error) error.textContent = "";
      if (button) { button.disabled = true; button.textContent = "Executando..."; }
      fetch(form.dataset.runApi, { method: "POST" })
        .then(function (response) {
          if (response.ok) { window.location.reload(); return null; }
          return response.json().then(
            function (body) { throw new Error(body.message || "não foi possível executar o estudo"); },
            function () { throw new Error("não foi possível executar o estudo"); },
          );
        })
        .catch(function (failure) {
          if (error) error.textContent = failure.message || "não foi possível executar o estudo";
          if (button) { button.disabled = false; button.textContent = "Executar de novo"; }
        });
    });
  });
})();`;

const RunForm: FC<{ id: string; token: string }> = (props) => (
  <form
    class="run-form"
    method="post"
    action={`/ui/studies/${props.id}/run`}
    data-run-api={`/api/studies/${props.id}/run`}
  >
    <input type="hidden" name="_csrf" value={props.token} />
    <button type="submit" class="btn btn-primary">
      Executar de novo
    </button>
  </form>
);

/** Chip discreto de custo no cartao da lista: some quando nao ha consumo medido ou o custo e zero. */
const CostChip: FC<{ usage: StudyUsage | null }> = (props) => {
  const cost = estimateCost(props.usage);
  if (cost === null || cost.usd <= 0) return null;
  return (
    <span class="chip" title="custo estimado do consumo medido">
      ~{formatMoney("US$", cost.usd, 3)}
    </span>
  );
};

/** Lista de estudos como cartoes. O cartao INTEIRO e a entrada: o titulo carrega um link esticado
 * (`.stretch`) que cobre a area toda, e o selo "Abrir estudo" mostra a acao sem esconder o alvo.
 */
export const StudiesList: FC<{ studies: StudyListItem[]; token: string }> = (props) => (
  <section>
    <div class="page-head">
      <div>
        <h2>Estudos</h2>
        <p class="sub">
          Cada estudo é uma rodada de medição: ideias geradas, avaliadas por um decisor probabilístico e
          ranqueadas pelo Índice de Ação. Clique em qualquer ponto do cartão para abrir.
        </p>
      </div>
    </div>

    {props.studies.length === 0 ? (
      <div class="panel glass">
        <div class="empty">
          <p id="studies-empty">
            Nenhum estudo ainda. Descreva um nicho em uma frase e o modo simulado roda sem credenciais, sem
            custo e em menos de um segundo.
          </p>
          <a class="btn btn-primary" href="/new">
            Criar o primeiro estudo
          </a>
        </div>
      </div>
    ) : (
      <ul class="studies">
        {props.studies.map((study) => (
          <li class="study-card glass">
            <div>
              <h3>
                <a class="stretch" href={`/studies/${study.id}`}>
                  {study.niche}
                </a>
              </h3>
              <p class="study-meta">
                <span class="chip">Cidade: {study.city !== "" ? study.city : "não informada"}</span>
                <span class="chip">
                  <Term of="ticket">Ticket</Term>: R$ {study.monthlyTicket}/mês
                </span>
                <span class="chip">{study.ideaCount} ideias avaliadas</span>
                <CostChip usage={study.usage} />
                <span class="chip">criado em {formatDate(study.createdAt)}</span>
              </p>
              <p class="study-top">
                Melhor ideia <b>{study.topIdea !== null ? study.topIdea : "ainda não avaliada"}</b>
              </p>
              <p class="study-id">id {study.id.slice(0, 8)} (usado nas chamadas de API)</p>
            </div>
            <div class="study-side">
              {study.topIndex !== null ? (
                <span class="study-score">
                  <span class={`score tone-${indexTone(study.topIndex)} tone-text`}>
                    {study.topIndex.toFixed(3)}
                  </span>
                  <span class="score-side">
                    <TierBadge tier={tierOf(study.topIndex)} />
                    <Hint>maior é melhor</Hint>
                  </span>
                </span>
              ) : null}
              <StateBadge state={study.state} />
              <span class="open-cta">Abrir estudo</span>
              <DeleteForm id={study.id} token={props.token} name={study.niche} />
            </div>
          </li>
        ))}
      </ul>
    )}
    {props.studies.length > 0 ? <DeleteDialog /> : null}
  </section>
);

/** Formulario de criacao, em pagina propria. Os helpers explicam o efeito de cada campo. */
export const StudyForm: FC<{
  token: string;
  defaults: { monthlyTicket: number; numIdeas: number };
  providers?: { llm: string; decider: string };
}> = (props) => (
  <section>
    <div class="page-head">
      <div>
        <h2>Novo estudo</h2>
        <p class="sub">
          O título vira o cabeçalho do estudo: no máximo {MAX_NICHE_LENGTH} caracteres, com cada palavra
          capitalizada. O detalhe do mercado vai na descrição, que alimenta a medição sem aparecer no título.
        </p>
        {props.providers ? (
          <p id="providers" class="sub">
            Neste serviço: <Term of="LLM">texto</Term> {props.providers.llm} ·{" "}
            <Term of="decisor">números</Term> {props.providers.decider}.
          </p>
        ) : null}
      </div>
      <a class="btn btn-ghost" href="/">
        Voltar para os estudos
      </a>
    </div>

    <form id="study-form" method="post" action="/ui/studies" class="panel glass">
      <input type="hidden" name="_csrf" value={props.token} />
      <div class="form-grid">
        <div class="field">
          <label for="niche">Título do estudo</label>
          <input
            id="niche"
            name="niche"
            type="text"
            required
            minlength="2"
            maxlength={String(MAX_NICHE_LENGTH)}
            placeholder="clínicas odontológicas em cidade média"
          />
          <span class="hint">
            até {MAX_NICHE_LENGTH} caracteres; cada palavra vira maiúscula (ex.: Clínicas Odontológicas)
          </span>
        </div>
        <div class="field">
          <label for="description">Descrição do contexto</label>
          <textarea
            id="description"
            name="description"
            rows={2}
            maxlength={String(MAX_DESCRIPTION_LENGTH)}
            placeholder="clínicas de bairro, uma cadeira, agenda no papel"
          />
          <span class="hint">
            até {MAX_DESCRIPTION_LENGTH} caracteres; entra no prompt junto do título e não é exibida
          </span>
        </div>
        <div class="field">
          <label for="city">Cidade ou região</label>
          <input id="city" name="city" type="text" placeholder="Região dos Lagos" />
          <span class="hint">opcional; estreita o contexto do decisor</span>
        </div>
        <div class="field">
          <label for="monthlyTicket">
            <Term of="ticket">Ticket mensal (R$)</Term>
          </label>
          <input
            id="monthlyTicket"
            name="monthlyTicket"
            type="number"
            min="1"
            value={String(props.defaults.monthlyTicket)}
          />
          <span class="hint">quanto o dono pagaria por mês; vira o teto, não o piso</span>
        </div>
        <div class="field">
          <label for="numIdeas">Número de ideias</label>
          <input
            id="numIdeas"
            name="numIdeas"
            type="number"
            min="1"
            max="40"
            value={String(props.defaults.numIdeas)}
          />
          <span class="hint">quantas hipóteses avaliar; 5 a 10 costuma bastar</span>
        </div>
      </div>
      <div class="form-actions">
        <button class="btn btn-primary" type="submit">
          Criar estudo
        </button>
        <label class="check">
          <input type="checkbox" name="mock" value="1" />
          <Term of="modo simulado">forçar modo simulado</Term>{" "}
          <Hint>ignora os provedores configurados; sem custo, sem valor de mercado</Hint>
        </label>
        <p id="study-error" role="alert" />
      </div>
    </form>
    {html`<script>
      (function () {
        var form = document.getElementById("study-form");
        if (!form) return;
        form.addEventListener("submit", function (event) {
          event.preventDefault();
          var error = document.getElementById("study-error");
          var button = form.querySelector("button[type=submit]");
          var token = form.elements["_csrf"].value;
          error.textContent = "";
          button.disabled = true;
          button.textContent = "Criando...";
          fetch("/api/studies", {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-CSRF-Token": token },
            body: JSON.stringify({
              niche: form.elements["niche"].value,
              description: form.elements["description"].value,
              city: form.elements["city"].value,
              monthlyTicket: Number(form.elements["monthlyTicket"].value) || undefined,
              numIdeas: Number(form.elements["numIdeas"].value) || undefined,
              mock: form.elements["mock"].checked,
            }),
          })
            .then(function (response) {
              return response.json().then(function (body) {
                if (!response.ok) throw new Error(body.message || "falha ao criar o estudo");
                return body;
              });
            })
            .then(function (study) {
              window.location.href = "/studies/" + study.id;
            })
            .catch(function (failure) {
              error.textContent = failure.message;
              button.disabled = false;
              button.textContent = "Criar estudo";
            });
        });
      })();
    </script>`}
  </section>
);

/** Fase atual do pipeline a partir do passo gravado (`[3/6] ...`). */
const PHASE_COUNT = 6;

/** Rotulo humano de cada fase do pipeline; a chave e o numero que vem no passo `[n/6]`. */
const PHASE_LABEL: Record<number, string> = {
  1: "Lendo o nicho e escrevendo o brief de mercado",
  2: "Gerando as ideias de produto",
  3: "Avaliando cada ideia com o decisor System One",
  4: "Medindo a natureza da dor de cada ideia",
  5: "Escrevendo o plano de cada ideia",
  6: "Montando os artefatos (índice, tabelão, CSV, JSON)",
};

/** Casas decimais e separador de milhar em pt-BR: `US$ 0,0142` em vez de `US$ 0.0142`. */
function formatMoney(prefix: string, value: number, digits: number): string {
  return `${prefix} ${value.toFixed(digits).replace(".", ",")}`;
}

/** Soma o consumo dos dois provedores num unico total por tipo de token. */
function totalTokens(usage: StudyUsage): { input: number; cached: number; output: number } {
  return {
    input: usage.llm.inputTokens + usage.decider.inputTokens,
    cached: usage.llm.cachedInputTokens + usage.decider.cachedInputTokens,
    output: usage.llm.outputTokens + usage.decider.outputTokens,
  };
}

function parsePhase(step: string): { phase: number; text: string } {
  const match = /\[(\d)\/(\d)\]\s*([\s\S]*)/.exec(step);
  if (match === null) return { phase: 0, text: step.trim() };
  const phase = Number(match[1] ?? "0");
  return { phase: Number.isFinite(phase) ? phase : 0, text: (match[3] ?? "").trim() };
}

/** Enquanto o pipeline roda, a pagina se atualiza sozinha com o passo atual da API. */
function progressScript(id: string): string {
  return `
(function () {
  var id = ${JSON.stringify(id)};
  var LABELS = ${JSON.stringify(PHASE_LABEL)};
  var phase = document.getElementById("progress-phase");
  var label = document.getElementById("progress-label");
  var line = document.getElementById("progress-step");
  var elapsed = document.getElementById("progress-elapsed");
  var steps = Array.prototype.slice.call(document.querySelectorAll("#progress-steps li"));
  var lastChange = Date.now();
  var previous = "";
  // Uma fase leva minutos (cada documento tem ~23 KB de prosa): sem um contador visivel, um passo
  // parado parece travamento. Acima de 2 min o contador muda de tom.
  function tick() {
    if (!elapsed) return;
    var seconds = Math.round((Date.now() - lastChange) / 1000);
    elapsed.textContent = seconds < 2 ? "agora" : "há " + seconds + "s";
    if (seconds > 120) elapsed.classList.add("progress-stalled");
    else elapsed.classList.remove("progress-stalled");
  }
  setInterval(tick, 1000);
  function paint(data) {
    var text = typeof data.step === "string" ? data.step : "";
    if (text !== previous) {
      previous = text;
      lastChange = Date.now();
    }
    tick();
    var match = /\\[(\\d)\\/6\\]\\s*([\\s\\S]*)/.exec(text);
    var current = match ? Number(match[1]) : 0;
    if (phase) phase.textContent = current ? current + "/6" : "iniciando";
    if (label)
      label.textContent = current
        ? "Fase " + current + " de 6 — " + (LABELS[current] || "")
        : "Iniciando o estudo";
    if (line) line.textContent = match ? match[2].trim() : text;
    steps.forEach(function (item, index) {
      item.setAttribute("data-done", index + 1 < current ? "1" : "0");
      item.setAttribute("data-live", index + 1 === current ? "1" : "0");
    });
  }
  function poll() {
    fetch("/api/studies/" + id, { cache: "no-store" })
      .then(function (response) { return response.ok ? response.json() : null; })
      .then(function (data) {
        if (!data) return;
        paint(data);
        if (data.state === "pending" || data.state === "running") { setTimeout(poll, 2000); return; }
        window.location.reload();
      })
      .catch(function () { setTimeout(poll, 4000); });
  }
  setTimeout(poll, 1200);
})();`;
}

/** Pagina propria do "como ler": sai do detalhe do estudo para nao competir com os numeros. */
export const HelpPage: FC = () => (
  <>
    <section class="panel glass">
      <p class="sub">
        <a href="/">Estudos</a> / como ler
      </p>
      <h2>Como ler estes números</h2>
      <p class="lead">
        Todo dado da interface vem com direção, escala e um helper curto (
        <code>dado 0.89 (maior é melhor)</code>
        ). Esta página reúne as regras da metodologia: o que cada indicador mede, onde ficam os limiares de
        tier e de dor e o que a escala de cor aponta.
      </p>
    </section>
    <Legend />
  </>
);

/** Vocabulario e selos da origem de cada campo da configuracao (mesma escala do resto da UI). */
const SOURCE_LABEL: Record<ProviderSource, string> = {
  settings: "definido aqui",
  env: "do ambiente",
  vazio: "não definido",
};

const SOURCE_TONE: Record<ProviderSource, string> = {
  settings: "b-green",
  env: "b-yellow",
  vazio: "b-red",
};

/**
 * Configuracao dos provedores: com JS intercepta o `submit`, envia `PATCH /api/settings` e recarrega,
 * mostrando o erro inline; sem JS o form posta em `/ui/settings` (mesma origem + CSRF), que responde
 * 303 para ca. Campo preenchido define, "limpar" volta a herdar o ambiente e campo vazio nao mexe.
 */
const SETTINGS_SCRIPT = `
(function () {
  var form = document.getElementById("settings-form");
  if (!form) return;
  form.addEventListener("submit", function (event) {
    event.preventDefault();
    var error = document.getElementById("settings-error");
    var button = form.querySelector("button[type=submit]");
    var token = form.elements["_csrf"].value;
    var patch = {};
    Array.prototype.slice.call(form.querySelectorAll("[data-setting]")).forEach(function (row) {
      var key = row.getAttribute("data-setting");
      var clear = row.querySelector("input[data-clear]");
      var input = row.querySelector("input[data-value]");
      if (clear && clear.checked) { patch[key] = null; return; }
      var value = input ? input.value.trim() : "";
      if (value) patch[key] = value;
    });
    error.textContent = "";
    button.disabled = true;
    button.textContent = "Salvando...";
    fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": token },
      body: JSON.stringify(patch),
    })
      .then(function (response) {
        if (response.ok) { window.location.reload(); return null; }
        return response.json().then(
          function (body) { throw new Error(body.message || "não foi possível salvar"); },
          function () { throw new Error("não foi possível salvar"); },
        );
      })
      .catch(function (failure) {
        error.textContent = failure.message || "não foi possível salvar";
        button.disabled = false;
        button.textContent = "Salvar";
      });
  });
})();`;

/**
 * Configuracao dos provedores de IA, na pagina `/settings`. Cada linha traz o valor efetivo (chave
 * sempre mascarada), a origem e um campo que, vazio, nao mexe em nada. O que for salvo sobrepoe as
 * variaveis de ambiente e vale para os proximos estudos.
 */
export const SettingsPage: FC<{ rows: ProviderSettingRow[]; token: string }> = (props) => (
  <section>
    <div class="page-head">
      <div>
        <h2>Configuração dos provedores</h2>
        <p class="sub">
          O que você salvar aqui sobrepõe as variáveis de ambiente e passa a valer na hora, sem reiniciar o
          serviço. A configuração vale para os próximos estudos. Deixe o campo vazio para não mexer.
        </p>
      </div>
      <a class="btn btn-ghost" href="/">
        Voltar para os estudos
      </a>
    </div>

    <form id="settings-form" method="post" action="/ui/settings" class="panel glass">
      <input type="hidden" name="_csrf" value={props.token} />
      {PROVIDER_GROUPS.map((group) => (
        <fieldset class="settings-group">
          <legend>{group.title}</legend>
          <p class="group-note">{group.description}</p>
          <div class="form-grid">
            {props.rows
              .filter((row) => group.keys.includes(row.key))
              .map((row) => {
                // O texto de ajuda é referenciado pelo input: o leitor de tela lê o mesmo valor
                // efetivo e a mesma origem que aparecem na linha.
                const helpId = `setting-help-${row.key}`;
                return (
                  <div class="field" data-setting={row.key}>
                    <label for={`setting-${row.key}`}>{row.label}</label>
                    <p class="hint" id={helpId}>
                      atual: <code>{row.value || "não definido"}</code>{" "}
                      <span class={`badge ${SOURCE_TONE[row.source]}`}>{SOURCE_LABEL[row.source]}</span>
                    </p>
                    <input
                      id={`setting-${row.key}`}
                      name={row.key}
                      data-value
                      aria-describedby={helpId}
                      spellcheck={false}
                      type={row.secret ? "password" : "text"}
                      autocomplete={row.secret ? "off" : undefined}
                      placeholder={row.secret ? "••••••" : "vazio = não mexer"}
                    />
                    {row.source === "settings" ? (
                      <label class="check">
                        <input type="checkbox" name={`clear_${row.key}`} value="1" data-clear />
                        Limpar <Hint>voltar a usar o ambiente</Hint>
                      </label>
                    ) : null}
                  </div>
                );
              })}
          </div>
        </fieldset>
      ))}
      <div class="form-actions">
        <button class="btn btn-primary" type="submit">
          Salvar
        </button>
        <p id="settings-error" role="alert" />
      </div>
    </form>
    <script>{raw(SETTINGS_SCRIPT)}</script>
  </section>
);

/** Abre o plano da ideia em modal: busca o fragmento ja renderizado no servidor e injeta. */
const IDEA_MODAL_SCRIPT = `
(function () {
  var modal = document.getElementById("idea-modal");
  if (!modal || typeof modal.showModal !== "function") return;
  var title = document.getElementById("idea-modal-title");
  var body = document.getElementById("idea-modal-body");
  function show(link) {
    title.textContent = link.dataset.ideaTitle || "Plano da ideia";
    body.innerHTML = '<p class="modal-loading">Carregando o plano...</p>';
    modal.showModal();
    fetch(link.dataset.ideaOpen, { headers: { Accept: "text/html" } })
      .then(function (response) {
        if (!response.ok) throw new Error("o plano ainda não está disponível");
        return response.text();
      })
      .then(function (html) { body.innerHTML = html; })
      .catch(function (failure) {
        body.innerHTML = '<p class="alert">' + (failure.message || "falha ao carregar o plano") + "</p>";
      });
  }
  Array.prototype.slice.call(document.querySelectorAll("[data-idea-open]")).forEach(function (link) {
    link.addEventListener("click", function (event) {
      // Ctrl/Cmd/clique do meio continuam abrindo o artefato cru em outra aba.
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
      event.preventDefault();
      show(link);
    });
  });
  Array.prototype.slice.call(document.querySelectorAll("[data-modal-close]")).forEach(function (button) {
    button.addEventListener("click", function () { modal.close(); });
  });
  // Clique no backdrop (fora do painel) fecha.
  modal.addEventListener("click", function (event) {
    if (event.target === modal) modal.close();
  });
})();`;

/**
 * Excluir uma ideia: com JS intercepta o `submit`, confirma no dialogo e envia o `DELETE`; sem JS o
 * form posta direto em `/ui/studies/:id/ideas/:ideaId/delete` (mesma origem + CSRF).
 *
 * A identidade vai no `data-idea-delete` e no action da URL, nunca no nome nem na posicao: nomes
 * repetem e a posicao muda quando outra ideia e removida.
 */
const IdeaDeleteForm: FC<{ id: string; ideaId: string; token: string; name: string }> = (props) => (
  <form
    class="idea-delete-form"
    method="post"
    action={`/ui/studies/${props.id}/ideas/${props.ideaId}/delete`}
    data-idea-delete={props.ideaId}
    data-delete-api={`/api/studies/${props.id}/ideas/${props.ideaId}`}
    data-delete-name={props.name}
  >
    <input type="hidden" name="_csrf" value={props.token} />
    <button type="submit" class="btn btn-danger btn-sm" title={`Excluir ${props.name}`}>
      Excluir
    </button>
  </form>
);

/** Script do dialogo de exclusao de ideia; sem JS o form acima ja posta direto. */
const IDEA_DELETE_SCRIPT = `
(function () {
  var modal = document.getElementById("idea-delete-modal");
  if (!modal || typeof modal.showModal !== "function") return;
  var text = document.getElementById("idea-delete-text");
  var error = document.getElementById("idea-delete-error");
  var cancel = document.getElementById("idea-delete-cancel");
  var confirm = document.getElementById("idea-delete-confirm");
  var pending = null;
  function close() { if (modal.open) modal.close(); pending = null; }
  Array.prototype.slice.call(document.querySelectorAll(".idea-delete-form")).forEach(function (form) {
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      pending = form;
      if (text) text.textContent = "Excluir " + (form.getAttribute("data-delete-name") || "esta ideia") + "? O ranking inteiro e renumerado.";
      if (error) error.textContent = "";
      if (confirm) confirm.disabled = false;
      modal.showModal();
    });
  });
  if (cancel) cancel.addEventListener("click", close);
  if (confirm) {
    confirm.addEventListener("click", function () {
      if (!pending) return close();
      var form = pending;
      confirm.disabled = true;
      var button = form.querySelector("button");
      if (button) { button.disabled = true; button.textContent = "Excluindo..."; }
      // O dialogo so sai de cena quando a exclusao conclui: se falhar, a ideia continua no estudo e
      // o motivo precisa ficar na tela em vez de morrer no console.
      (async function () {
        var status = 0;
        var message = "";
        try {
          var response = await fetch(form.getAttribute("data-delete-api"), { method: "DELETE", headers: { Accept: "application/json" } });
          if (response.ok) { location.reload(); return; }
          status = response.status;
          try {
            var body = await response.json();
            message = body && body.message ? body.message : "";
          } catch (ignored) { message = ""; }
        } catch (failure) {
          message = failure && failure.message ? failure.message : "";
        }
        if (error) {
          error.textContent = status === 409
            ? "O estudo ainda está em execução — aguarde terminar para excluir."
            : message || "falha ao excluir a ideia";
        }
        confirm.disabled = false;
        if (button) { button.disabled = false; button.textContent = "Excluir"; }
      })();
    });
  }
  modal.addEventListener("cancel", close);
  modal.addEventListener("click", function (event) { if (event.target === modal) close(); });
})();`;

/** Confirmacao da exclusao de uma ideia. */
const IdeaDeleteDialog: FC = () => (
  <dialog id="idea-delete-modal" class="modal modal-confirm" aria-labelledby="idea-delete-title">
    <div class="modal-head">
      <h3 id="idea-delete-title">Excluir ideia</h3>
    </div>
    <div class="modal-body">
      <p id="idea-delete-text">Excluir esta ideia? O ranking inteiro e renumerado.</p>
      <p id="idea-delete-error" class="alert" role="alert" />
      <div class="form-actions">
        <button type="button" class="btn btn-ghost" id="idea-delete-cancel">
          Cancelar
        </button>
        <button type="button" class="btn btn-danger" id="idea-delete-confirm">
          Confirmar
        </button>
      </div>
    </div>
  </dialog>
);

/**
 * Pedir mais ideias: com JS intercepta o `submit` e mostra o estudo recarregando; sem JS o form posta
 * direto em `/ui/studies/:id/ideas` (mesma origem + CSRF), que responde 303 para a pagina do estudo.
 *
 * O teto aparece no campo: descobrir o limite so depois de pedir queima uma geracao.
 */
const AddIdeasForm: FC<{ id: string; token: string; remaining: number }> = (props) => (
  <form class="add-ideas-form" method="post" action={`/ui/studies/${props.id}/ideas`} data-add-ideas>
    <input type="hidden" name="_csrf" value={props.token} />
    <div class="field">
      <label for="add-ideas-count">Acrescentar ideias</label>
      <input
        id="add-ideas-count"
        type="number"
        name="count"
        min="1"
        max={String(props.remaining)}
        value="1"
        required
      />
      <span class="hint">
        até {props.remaining}; o estudo fecha em {MAX_IDEAS_PER_STUDY}
      </span>
    </div>
    <div class="form-actions">
      <button type="submit" class="btn btn-primary">
        Adicionar
      </button>
    </div>
  </form>
);

/** Detalhe: cabecalho com as acoes, progresso ao vivo, ranking, medias, grupos e artefatos. */
export const StudyDetail: FC<{ study: StudyRecord; artifacts: string[]; token: string }> = (props) => {
  const { study } = props;
  // `StudyIdea`, e nao `IdeaEvaluation`: e ela que carrega o id usado nas acoes por linha.
  const ranked: StudyIdea[] = study.summary
    ? study.summary.ordered
    : [...study.evaluations].sort((left, right) => right.index - left.index);
  const summary = study.summary;
  const running = study.progress.state === "pending" || study.progress.state === "running";
  const current = parsePhase(study.progress.step);
  return (
    <>
      <section class="panel glass study-head">
        <div class="study-head-main">
          <p class="sub">
            <a href="/">Estudos</a> / {study.niche}
          </p>
          <h2>{study.niche}</h2>
          <p id="study-meta" class="sub">
            <StateBadge state={study.progress.state} />
            <span>
              {" "}
              Cidade: {study.city !== "" ? study.city : "não informada"} |{" "}
              <Term of="ticket">Ticket considerado</Term>: R$ {study.monthlyTicket}/mês | Ideias avaliadas:{" "}
              {study.evaluations.length} | Método de dor:{" "}
              {study.painMethod === "choice" ? (
                <Term of="escolha forçada">escolha forçada (3 consequências)</Term>
              ) : (
                <Term of="paráfrases">sondas com 3 paráfrases</Term>
              )}
            </span>
          </p>
        </div>
        <div class="study-head-actions">
          {props.artifacts.length > 0 ? (
            <>
              <a class="btn btn-primary" href={`/api/studies/${study.id}/artifacts.zip`}>
                Baixar .zip <Hint>{`${props.artifacts.length} arquivos em uma pasta`}</Hint>
              </a>
              <a class="btn btn-ghost" href="#artefatos">
                Ver arquivos
              </a>
            </>
          ) : null}
          <RenameForm id={study.id} token={props.token} niche={study.niche} />
          <DeleteForm id={study.id} token={props.token} name={study.niche} />
        </div>
      </section>

      {running ? (
        <section class="panel glass" id="progress-panel" aria-live="polite" aria-busy="true">
          <div class="progress-head">
            <h3>Estudo em execução</h3>
            <span class="progress-phase">
              <span id="progress-elapsed" class="progress-elapsed">
                agora
              </span>{" "}
              <span id="progress-phase">
                {current.phase > 0 ? `${current.phase}/${PHASE_COUNT}` : "iniciando"}
              </span>
            </span>
          </div>
          <ol class="progress-steps" id="progress-steps">
            {Array.from({ length: PHASE_COUNT }, (_unused, index) => (
              <li
                data-done={index + 1 < current.phase ? "1" : "0"}
                data-live={index + 1 === current.phase ? "1" : "0"}
              />
            ))}
          </ol>
          <p class="progress-label" id="progress-label">
            {current.phase > 0
              ? `Fase ${current.phase} de ${PHASE_COUNT} — ${PHASE_LABEL[current.phase] ?? ""}`
              : "Iniciando o estudo"}
          </p>
          <p class="progress-step-line" id="progress-step">
            {current.text}
          </p>
          <p class="progress-note">
            A página acompanha o pipeline e recarrega quando terminar. Sem JavaScript, recarregue para ver o
            passo atual.
          </p>
          <script>{raw(progressScript(study.id))}</script>
        </section>
      ) : null}

      {study.progress.state === "failed" ? (
        <section class="panel glass" id="failure-panel">
          <h3>O estudo falhou</h3>
          <p id="study-failure" class="alert" role="alert">
            {study.progress.error === null ? "" : explainFailure(study.progress.error)}
          </p>
          <p class="sub">
            O que já foi gerado continua em disco e é reaproveitado: executar de novo retoma do ponto onde
            parou, sem repetir as fases concluídas nem pagar de novo por elas. Os artefatos abaixo seguem
            baixáveis.
          </p>
          <div class="form-actions">
            <RunForm id={study.id} token={props.token} />
            <p id="run-error" role="alert" />
          </div>
          <script>{raw(RUN_SCRIPT)}</script>
        </section>
      ) : null}

      <section class="panel glass">
        <h3>Ranking</h3>
        {ranked.length === 0 ? (
          <p id="ranking-empty" class="empty">
            Nenhuma ideia avaliada ainda. O ranking aparece assim que a medição termina.
          </p>
        ) : (
          <div class="table-wrap">
            <table id="ranking" class="rank">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Ideia</th>
                  <th>Setor</th>
                  <th class="num">
                    <Term of="Índice de Ação">Índice</Term> <Hint>0 a 2; maior é melhor</Hint>
                  </th>
                  <th>
                    <Term of="Tier">Tier</Term> <Hint>A é o melhor</Hint>
                  </th>
                  <th class="num">
                    <Term of="WTP">Pagaria o ticket</Term> <Hint>0 a 1; maior é melhor</Hint>
                  </th>
                  <th class="num">
                    <Term of="desvio">Desvio</Term> <Hint>menor é melhor</Hint>
                  </th>
                  <th class="tip-end">
                    <Term of="dor">Dor</Term> <Hint>FORTE é o sinal que interessa</Hint>
                  </th>
                  <th class="tip-end">
                    <span class="sr-only">Acoes</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {ranked.map((idea, position) => {
                  // O plano completo vive no artefato `NN-slug/README.md` da mesma ideia.
                  const planPath = props.artifacts.find(
                    (path) => path === `${folderName(position + 1, idea.name)}/README.md`,
                  );
                  return (
                    <tr>
                      <td class="num">{position + 1}</td>
                      <td title={idea.description}>
                        {planPath === undefined ? (
                          idea.name
                        ) : (
                          <a
                            class="idea-link"
                            href={`/api/studies/${study.id}/artifacts/${planPath}`}
                            data-idea-open={`/studies/${study.id}/ideas/${position + 1}`}
                            data-idea-title={idea.name}
                          >
                            {idea.name}
                            <span class="idea-chip">plano</span>
                          </a>
                        )}
                      </td>
                      <td>{idea.sector !== "" ? idea.sector : "-"}</td>
                      <td
                        class={`num tone-${indexTone(idea.index)} tone-text`}
                        title={`Índice de Ação: média entre fit e venda, maior é melhor. Tier ${idea.tier}: ${TIER_NOTE[idea.tier]}`}
                      >
                        {idea.index.toFixed(3)}
                        <span class={`rank-bar tone-${indexTone(idea.index)}`} />
                      </td>
                      <td>
                        <TierBadge tier={idea.tier} />
                      </td>
                      <td
                        class={`num tone-${probabilityTone(idea.business.wtp)} tone-text`}
                        title="Probabilidade de o dono pagar o ticket, de 0 a 1"
                      >
                        {idea.business.wtp.toFixed(2)}
                      </td>
                      <td
                        class={`num tone-${deviationTone(idea.algorithm.deviation)} tone-text`}
                        title="Desvio entre as paráfrases das sondas: menor é melhor. Acima de 0.15 a medição é considerada instável"
                      >
                        {idea.algorithm.deviation.toFixed(3)}
                      </td>
                      <td>
                        <PainBadge label={idea.algorithm.label} />
                      </td>
                      <td class="tip-end">
                        {/* Acao mutavel some enquanto o pipeline roda, junto com o formulario de adicao. */}
                        {running ? null : (
                          <IdeaDeleteForm
                            id={study.id}
                            ideaId={idea.id}
                            token={props.token}
                            name={idea.name}
                          />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {running ? null : (
        <section class="panel glass" id="add-ideas">
          <h3>Acrescentar ideias</h3>
          <p class="sub">
            As {ranked.length} ideias atuais ficam como estão: o que já foi medido e documentado não é
            refeito, e o ranking inteiro é renumerado.
          </p>
          <AddIdeasForm
            id={study.id}
            token={props.token}
            remaining={Math.max(0, MAX_IDEAS_PER_STUDY - ranked.length)}
          />
        </section>
      )}

      {summary ? (
        <section class="panel glass">
          <h3>
            Médias do estudo <Hint>média aritmética entre as ideias avaliadas</Hint>
          </h3>
          <ul id="means" class="metrics">
            <Metric
              term="fit"
              label="fit"
              value={summary.means.fit.toFixed(2)}
              hint="0 a 2; maior é melhor"
              note="2 = resolve o caos do balcão sem exigir mudança de hábito"
              tone={probabilityTone(summary.means.fit / 2)}
            />
            <Metric
              term="venda"
              label="venda"
              value={summary.means.sale.toFixed(2)}
              hint="0 a 2; maior é melhor"
              note="2 = ataca perda de dinheiro ou de imagem agora"
              tone={probabilityTone(summary.means.sale / 2)}
            />
            <Metric
              term="disrupção"
              label="disrupção"
              value={summary.means.disruption.toFixed(2)}
              hint="0 a 2; maior é melhor"
              note="2 = muda o modelo de operação"
              tone={probabilityTone(summary.means.disruption / 2)}
            />
            <Metric
              term="solo"
              label="suporte solo"
              value={summary.means.solo.toFixed(2)}
              hint="0 a 1; maior é melhor"
              note="um consultor mantendo 30 clientes sem colapsar"
              tone={probabilityTone(summary.means.solo)}
            />
            <Metric
              term="WTP"
              label="pagaria o ticket"
              value={summary.means.wtp.toFixed(2)}
              hint="0 a 1; maior é melhor"
              note={`probabilidade média de pagar R$ ${study.monthlyTicket}/mês`}
              tone={probabilityTone(summary.means.wtp)}
            />
            <Metric
              term="meta30"
              label="30 clientes em 24 meses"
              value={summary.means.meta30.toFixed(2)}
              hint="0 a 1; maior é melhor"
              note="a base do plano é de 10 a 15 clientes"
              tone={probabilityTone(summary.means.meta30)}
            />
          </ul>

          <h3>
            Grupos por natureza da dor <Hint>o preditor mais forte de compra</Hint>
          </h3>
          <ul id="pain-groups" class="groups">
            <li class="pain-row pain-forte">
              forte: {summary.painGroups.forte.join(", ") || "nenhuma"}{" "}
              <Hint>perde dinheiro hoje ou queima a imagem</Hint>
            </li>
            <li class="pain-row pain-mista">
              mista: {summary.painGroups.mista.join(", ") || "nenhuma"} <Hint>consequências divididas</Hint>
            </li>
            <li class="pain-row pain-fraca">
              fraca: {summary.painGroups.fraca.join(", ") || "nenhuma"}{" "}
              <Hint>sobra trabalho manual; sem urgência de compra</Hint>
            </li>
          </ul>
        </section>
      ) : null}

      <UsagePanel usage={study.usage} />

      <section class="panel glass" id="artefatos">
        <h3>
          Artefatos <Hint>arquivos do estudo no disco, servidos pela API</Hint>
        </h3>
        {props.artifacts.length === 0 ? (
          <p id="artifacts-empty" class="empty">
            Nenhum artefato gravado ainda. Eles aparecem quando o pipeline termina.
          </p>
        ) : (
          <ul id="artifacts" class="files">
            {props.artifacts.map((path) => (
              <li>
                <a class="file" href={`/api/studies/${study.id}/artifacts/${path}`} download>
                  <span class="file-ext">{artifactExt(path)}</span>
                  <span class="file-path">
                    {path}
                    <br />
                    <span class="hint">({artifactHint(path)})</span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      {ranked.length > 0 ? (
        <>
          {/* Modal nativo: ESC, foco e backdrop vem do navegador. Sem JS o link da ideia cai no
              artefato cru (markdown servido pela API). */}
          <dialog id="idea-modal" class="modal" aria-labelledby="idea-modal-title">
            <div class="modal-head">
              <h3 id="idea-modal-title">Plano da ideia</h3>
              <button type="button" class="modal-close" data-modal-close>
                Fechar
              </button>
            </div>
            <div class="modal-body" id="idea-modal-body">
              <p class="modal-loading">Carregando o plano...</p>
            </div>
          </dialog>
          <script>{raw(IDEA_MODAL_SCRIPT)}</script>
        </>
      ) : null}

      <DeleteDialog />
      <IdeaDeleteDialog />
      <script>{raw(IDEA_DELETE_SCRIPT)}</script>
      <RenameDialog />
    </>
  );
};
