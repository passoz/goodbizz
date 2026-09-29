/**
 * Paginas da interface. Regra de leitura: todo dado apresentado vem acompanhado do seu helper,
 * no formato "dado 0.89 (maior e melhor)" ou com a escala explicita. O leitor nao precisa
 * conhecer a metodologia para interpretar um numero.
 */
import type { FC } from "hono/jsx";
import { html } from "hono/html";

import type { IdeaEvaluation, StudyListItem, StudyRecord, StudyState, Tier } from "../../../domain/types.ts";
import { GLOSSARY, Term } from "./layout.tsx";

const STATE_LABEL: Record<StudyState, string> = {
  pending: "na fila",
  running: "executando",
  done: "concluido",
  failed: "falhou",
};

const STATE_TONE: Record<StudyState, string> = {
  pending: "badge",
  running: "badge badge-running",
  done: "badge badge-done",
  failed: "badge badge-failed",
};

const PAIN_TONE: Record<string, string> = {
  FORTE: "badge badge-strong",
  FRACA: "badge badge-weak",
  INSTAVEL: "badge badge-unstable",
  INDETERMINADO: "badge",
};

const TIER_NOTE: Record<Tier, string> = {
  A: "aderencia alta e venda natural",
  B: "boa ideia, exige provar valor",
  C: "venda dificil ou mudanca de habito",
};

/** O que cada artefato responde, por padrao de caminho. */
const ARTIFACT_HINTS: Array<[RegExp, string]> = [
  [/^00-brief\.md$/, "leitura de mercado que orientou as ideias"],
  [/^00-tabelao\.md$/, "todos os indicadores lado a lado"],
  [/^00-tabelao\.csv$/, "mesma tabela para planilha"],
  [/^dados\.json$/, "dados brutos; entrada do recalibrate"],
  [/^README\.md$/, "indice do estudo com o ranking"],
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

const Hint: FC<{ children: string }> = (props) => <span class="hint">({props.children})</span>;

/** Dica de cada estado. Nao repete o rotulo visivel, para nao confundir leitura em texto puro. */
const STATE_TIP: Record<StudyState, string> = {
  pending: "Criado agora, aguardando o inicio do pipeline.",
  running: "Em andamento: brief, ideias, avaliacao, documentos e relatorios.",
  done: "Terminou bem. Ranking, medias, artefatos e plano estao disponiveis.",
  failed: "Terminou com erro. A mensagem aparece no topo desta pagina.",
};

const StateBadge: FC<{ state: StudyState }> = (props) => (
  <span class={`${STATE_TONE[props.state]} has-tip`} tabindex="0">
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
  <span class={`${PAIN_TONE[props.label] ?? "badge"} has-tip`} tabindex="0">
    {props.label}
    <span class="tip" role="tooltip">
      {GLOSSARY[props.label] ?? PAIN_MEANING[props.label] ?? ""}
    </span>
  </span>
);

/** Significado de cada rotulo de dor, usado no title e na legenda. */
export const PAIN_MEANING: Record<string, string> = {
  FORTE: "o dono perde dinheiro hoje ou queima a imagem publica",
  FRACA: "ganho interno de organizacao; o dono nao paga por urgencia",
  INDETERMINADO: "zona cinzenta; precisa de revisao manual",
  INSTAVEL: "as parafrases divergem; a medicao nao e confiavel",
};

/** Bloco de metrica: rotulo, valor em monospace e o helper de leitura. */
const Metric: FC<{ term: string; label: string; value: string; hint: string; note?: string }> = (props) => (
  <li class="metric">
    <span class="metric-label">
      <Term of={props.term}>{props.label}</Term>
    </span>
    <span class="value">{props.value}</span>
    <span class="hint">({props.hint})</span>
    {props.note !== undefined ? <span class="metric-note">{props.note}</span> : null}
  </li>
);

/** Como ler: as regras da metodologia, para o numero fazer sentido sem consultar o codigo. */
export const Legend: FC = () => (
  <section class="panel glass">
    <h3>Como ler estes numeros</h3>
    <dl class="legend">
      <div>
        <dt>
          <Term of="Indice de Acao">Indice de Acao</Term>{" "}
          <Hint>media entre fit e facilidade de venda; maior e melhor</Hint>
        </dt>
        <dd>
          Tier A a partir de 1.84, Tier B a partir de 1.60, Tier C abaixo disso. E o criterio de priorizacao,
          nao uma previsao de faturamento.
        </dd>
      </div>
      <div>
        <dt>
          <Term of="fit">Fit</Term> <Hint>0 a 2; maior e melhor</Hint>
        </dt>
        <dd>
          2 = resolve um caos da operacao diaria sem exigir mudanca de habito do dono. 0 = exige escala
          corporativa.
        </dd>
      </div>
      <div>
        <dt>
          <Term of="venda">Facilidade de venda</Term> <Hint>0 a 2; maior e melhor</Hint>
        </dt>
        <dd>2 = ataca perda de dinheiro ou de imagem agora. 0 = beneficio invisivel no curto prazo.</dd>
      </div>
      <div>
        <dt>
          <Term of="disrupcao">Disrupcao</Term> <Hint>0 a 2; maior e melhor</Hint>
        </dt>
        <dd>
          2 = muda o modelo de operacao ou cria receita que nao existia. 0 = automatiza o que todo mundo ja
          faz.
        </dd>
      </div>
      <div>
        <dt>
          <Term of="dor">Dor</Term> <Hint>FORTE e o sinal que interessa</Hint>
        </dt>
        <dd>
          <Term of="FORTE">FORTE</Term>: escore de 0.65 ou mais e dominante. <Term of="FRACA">FRACA</Term>:
          dor interna de 0.50 ou mais. <Term of="INSTAVEL">INSTAVEL</Term>: <Term of="desvio">desvio</Term>{" "}
          entre <Term of="parafrases">parafrases</Term> acima de 0.15, o que manda a ideia para revisao
          manual.
        </dd>
      </div>
      <div>
        <dt>
          Probabilidades <Hint>0 a 1; maior e melhor</Hint>
        </dt>
        <dd>
          Disposicao a pagar (<Term of="WTP">WTP</Term>) e viabilidade de 30 clientes em 24 meses (
          <Term of="meta30">meta30</Term>) sao probabilidades medidas no <Term of="decisor">decisor</Term>,
          nao contagens. Use-as para comparar ideias entre si.
        </dd>
      </div>
      <div>
        <dt>
          Regras de negocio do plano <Hint>teto, nao piso</Hint>
        </dt>
        <dd>
          O <Term of="ticket">ticket</Term> informado e o teto da precificacao. A meta do plano e de 10 a 15
          clientes em 24 meses; 30 e cenario otimista, nao base.
        </dd>
      </div>
      <div>
        <dt>
          Texto do plano <Hint>LLM sob guardrail</Hint>
        </dt>
        <dd>
          A prosa e escrita por um <Term of="LLM">LLM</Term>, mas todo numero vem do bloco medido. Estimativa
          fora do bloco aparece marcada como <Term of="[INFERENCE]">[INFERENCE]</Term>.
        </dd>
      </div>
    </dl>
  </section>
);

/** Lista de estudos: uma linha por estudo, com a leitura de cada coluna. */
export const StudiesList: FC<{ studies: StudyListItem[] }> = (props) => (
  <section class="panel glass">
    <h2>Estudos</h2>
    <p class="sub">
      Cada estudo e uma rodada de medicao: ideias geradas, avaliadas por um decisor probabilistico e
      ranqueadas pelo Indice de Acao.
    </p>
    {props.studies.length === 0 ? (
      <p id="studies-empty" class="empty">
        Nenhum estudo ainda. Crie o primeiro no formulario abaixo: basta uma frase de nicho e o modo simulado
        roda sem credenciais.
      </p>
    ) : (
      <div class="table-wrap">
        <table id="studies">
          <thead>
            <tr>
              <th>Estudo</th>
              <th>Nicho</th>
              <th>Cidade</th>
              <th class="num">
                <Term of="ticket">Ticket</Term> <Hint>R$ por mes; teto da precificacao</Hint>
              </th>
              <th>
                Estado <Hint>situacao da execucao</Hint>
              </th>
              <th>
                Ideias <Hint>quantas foram avaliadas</Hint>
              </th>
              <th>
                Melhor ideia <Hint>maior Indice de Acao</Hint>
              </th>
              <th class="num">
                <Term of="Indice de Acao">Indice</Term> <Hint>0 a 2; maior e melhor</Hint>
              </th>
            </tr>
          </thead>
          <tbody>
            {props.studies.map((study) => (
              <tr>
                <td>
                  <a href={`/studies/${study.id}`}>{study.id.slice(0, 8)}</a>
                </td>
                <td>{study.niche}</td>
                <td>{study.city !== "" ? study.city : "-"}</td>
                <td class="num">{study.monthlyTicket}</td>
                <td>
                  <StateBadge state={study.state} />
                </td>
                <td class="num">{study.ideaCount}</td>
                <td>{study.topIdea !== null ? study.topIdea : "-"}</td>
                <td class="num">{study.topIndex !== null ? study.topIndex.toFixed(3) : "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
  </section>
);

/** Formulario de criacao. Os helpers explicam o efeito de cada campo no estudo. */
export const StudyForm: FC<{ token: string; defaults: { monthlyTicket: number; numIdeas: number } }> = (
  props,
) => (
  <section class="panel glass">
    <h2>Novo estudo</h2>
    <p class="sub">
      Descreva o nicho em uma frase. O restante influencia a medicao de preco e o volume de hipoteses.
    </p>
    <form id="study-form" method="post" action="/ui/studies">
      <input type="hidden" name="_csrf" value={props.token} />
      <div class="form-grid">
        <div class="field">
          <label for="niche">Nicho</label>
          <input
            id="niche"
            name="niche"
            type="text"
            required
            placeholder="clinicas odontologicas em cidade media"
          />
          <span class="hint">uma frase, do jeito que voce contaria para um conhecido</span>
        </div>
        <div class="field">
          <label for="city">Cidade ou regiao</label>
          <input id="city" name="city" type="text" placeholder="Regiao dos Lagos" />
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
          <span class="hint">quanto o dono pagaria por mes; vira o teto, nao o piso</span>
        </div>
        <div class="field">
          <label for="numIdeas">Numero de ideias</label>
          <input
            id="numIdeas"
            name="numIdeas"
            type="number"
            min="1"
            max="40"
            value={String(props.defaults.numIdeas)}
          />
          <span class="hint">quantas hipoteses avaliar; 5 a 10 costuma bastar</span>
        </div>
      </div>
      <div class="form-actions">
        <label class="check">
          <input type="checkbox" name="mock" value="1" checked />
          <Term of="modo simulado">modo simulado</Term> <Hint>sem provedores reais e sem custo</Hint>
        </label>
        <button class="btn btn-primary" type="submit">
          Criar estudo
        </button>
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

/** Detalhe: cabecalho, legenda, ranking, medias, grupos de dor, artefatos e o plano. */
export const StudyDetail: FC<{ study: StudyRecord; artifacts: string[]; plan: string | null }> = (props) => {
  const { study } = props;
  const ranked: IdeaEvaluation[] = study.summary
    ? study.summary.ordered
    : [...study.evaluations].sort((left, right) => right.index - left.index);
  const summary = study.summary;
  const showStep = study.progress.step !== "" && study.progress.step !== STATE_LABEL[study.progress.state];
  return (
    <>
      <section class="panel glass">
        <h2>{study.niche}</h2>
        <p id="study-meta" class="sub">
          <StateBadge state={study.progress.state} />
          {showStep ? <span> {study.progress.step}</span> : null}
          <span>
            {" "}
            Cidade: {study.city !== "" ? study.city : "nao informada"} |{" "}
            <Term of="ticket">Ticket considerado</Term>: R$ {study.monthlyTicket}/mes | Ideias avaliadas:{" "}
            {study.evaluations.length} | Metodo de dor:{" "}
            {study.painMethod === "choice" ? (
              <Term of="escolha forcada">escolha forcada (3 consequencias)</Term>
            ) : (
              <Term of="parafrases">sondas com 3 parafrases</Term>
            )}
          </span>
        </p>
        {study.progress.error !== null ? (
          <p id="study-failure" class="alert" role="alert">
            {study.progress.error}
          </p>
        ) : null}
      </section>

      <Legend />

      <section class="panel glass">
        <h3>Ranking</h3>
        {ranked.length === 0 ? (
          <p id="ranking-empty" class="empty">
            Nenhuma ideia avaliada ainda. O ranking aparece assim que a medicao termina.
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
                    <Term of="Indice de Acao">Indice</Term> <Hint>0 a 2; maior e melhor</Hint>
                  </th>
                  <th>
                    <Term of="Tier">Tier</Term> <Hint>A e o melhor</Hint>
                  </th>
                  <th class="num">
                    <Term of="WTP">Pagaria o ticket</Term> <Hint>0 a 1; maior e melhor</Hint>
                  </th>
                  <th class="num">
                    <Term of="desvio">Desvio</Term> <Hint>menor e melhor</Hint>
                  </th>
                  <th class="tip-end">
                    <Term of="dor">Dor</Term> <Hint>FORTE e o sinal que interessa</Hint>
                  </th>
                </tr>
              </thead>
              <tbody>
                {ranked.map((idea, position) => (
                  <tr>
                    <td class="num">{position + 1}</td>
                    <td title={idea.description}>{idea.name}</td>
                    <td>{idea.sector !== "" ? idea.sector : "-"}</td>
                    <td
                      class="num"
                      title={`Indice de Acao: media entre fit e venda, maior e melhor. Tier ${idea.tier}: ${TIER_NOTE[idea.tier]}`}
                    >
                      {idea.index.toFixed(3)}
                    </td>
                    <td>
                      <TierBadge tier={idea.tier} />
                    </td>
                    <td class="num" title="Probabilidade de o dono pagar o ticket, de 0 a 1">
                      {idea.business.wtp.toFixed(2)}
                    </td>
                    <td
                      class="num"
                      title="Desvio entre as parafrases das sondas: menor e melhor. Acima de 0.15 a medicao e considerada instavel"
                    >
                      {idea.algorithm.deviation.toFixed(3)}
                    </td>
                    <td>
                      <PainBadge label={idea.algorithm.label} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {summary ? (
        <section class="panel glass">
          <h3>
            Medias do estudo <Hint>media aritmetica entre as ideias avaliadas</Hint>
          </h3>
          <ul id="means" class="metrics">
            <Metric
              term="fit"
              label="fit"
              value={summary.means.fit.toFixed(2)}
              hint="0 a 2; maior e melhor"
              note="2 = resolve o caos do balcao sem exigir mudanca de habito"
            />
            <Metric
              term="venda"
              label="venda"
              value={summary.means.sale.toFixed(2)}
              hint="0 a 2; maior e melhor"
              note="2 = ataca perda de dinheiro ou de imagem agora"
            />
            <Metric
              term="disrupcao"
              label="disrupcao"
              value={summary.means.disruption.toFixed(2)}
              hint="0 a 2; maior e melhor"
              note="2 = muda o modelo de operacao"
            />
            <Metric
              term="solo"
              label="suporte solo"
              value={summary.means.solo.toFixed(2)}
              hint="0 a 1; maior e melhor"
              note="um consultor mantendo 30 clientes sem colapsar"
            />
            <Metric
              term="WTP"
              label="pagaria o ticket"
              value={summary.means.wtp.toFixed(2)}
              hint="0 a 1; maior e melhor"
              note={`probabilidade media de pagar R$ ${study.monthlyTicket}/mes`}
            />
            <Metric
              term="meta30"
              label="30 clientes em 24 meses"
              value={summary.means.meta30.toFixed(2)}
              hint="0 a 1; maior e melhor"
              note="a base do plano e 10 a 15 clientes"
            />
          </ul>

          <h3>
            Grupos por natureza da dor <Hint>o preditor mais forte de compra</Hint>
          </h3>
          <ul id="pain-groups" class="groups">
            <li class="pain-row pain-row-forte">
              forte: {summary.painGroups.forte.join(", ") || "nenhuma"}{" "}
              <Hint>perde dinheiro hoje ou queima a imagem</Hint>
            </li>
            <li class="pain-row pain-row-mista">
              mista: {summary.painGroups.mista.join(", ") || "nenhuma"} <Hint>consequencias divididas</Hint>
            </li>
            <li class="pain-row pain-row-fraca">
              fraca: {summary.painGroups.fraca.join(", ") || "nenhuma"}{" "}
              <Hint>sobra trabalho manual; sem urgencia de compra</Hint>
            </li>
          </ul>
        </section>
      ) : null}

      <section class="panel glass">
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
                <a class="file" href={`/api/studies/${study.id}/artifacts/${path}`}>
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

      {props.plan !== null ? (
        <section class="panel glass">
          <h3>
            Plano da melhor ideia <Hint>texto do LLM sobre os numeros medidos</Hint>
          </h3>
          <pre id="plan">{props.plan}</pre>
        </section>
      ) : null}
    </>
  );
};
