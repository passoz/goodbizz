/**
 * Paginas da interface: lista, formulario de criacao e detalhe de um estudo.
 * Nenhum numero e recalculado aqui: tudo vem do registro persistido pelo StudyService.
 */
import { html } from "hono/html";
import type { FC } from "hono/jsx";

import type { IdeaEvaluation, StudyListItem, StudyRecord, StudyState } from "../../../domain/types.ts";

const STATE_LABEL: Record<StudyState, string> = {
  pending: "na fila",
  running: "rodando",
  done: "concluido",
  failed: "falhou",
};

/** Lista de estudos com link para o detalhe e estado vazio quando nao ha nenhum. */
export const StudiesList: FC<{ studies: StudyListItem[] }> = (props) => {
  if (props.studies.length === 0) {
    return (
      <section>
        <h2>Estudos</h2>
        <p id="studies-empty">Nenhum estudo ainda. Crie o primeiro no formulario abaixo.</p>
      </section>
    );
  }
  return (
    <section>
      <h2>Estudos</h2>
      <table id="studies">
        <thead>
          <tr>
            <th>ID</th>
            <th>Nicho</th>
            <th>Cidade</th>
            <th>Ticket</th>
            <th>Estado</th>
            <th>Etapa</th>
            <th>Ideias</th>
            <th>Melhor ideia</th>
            <th>Indice</th>
          </tr>
        </thead>
        <tbody>
          {props.studies.map((study) => (
            <tr id={`study-${study.id}`}>
              <td>
                <a href={`/studies/${study.id}`}>{study.id.slice(0, 8)}</a>
              </td>
              <td>{study.niche}</td>
              <td>{study.city || "-"}</td>
              <td>{study.monthlyTicket}</td>
              <td>
                <span class={`state state-${study.state}`}>{STATE_LABEL[study.state]}</span>
              </td>
              <td>{study.step}</td>
              <td>{study.ideaCount}</td>
              <td>{study.topIdea ?? "-"}</td>
              <td>{study.topIndex !== null ? study.topIndex.toFixed(3) : "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
};

/**
 * Formulario de criacao. O POST nativo cai em `/ui/studies` (com o campo `_csrf`); o script
 * usa a API publica na mesma origem e redireciona para o detalhe do estudo criado.
 */
export const StudyForm: FC<{ token: string; defaults: { monthlyTicket: number; numIdeas: number } }> = (
  props,
) => (
  <section>
    <h2>Novo estudo</h2>
    <form id="study-form" method="post" action="/ui/studies">
      <input type="hidden" name="_csrf" value={props.token} />
      <label>
        Nicho
        <input type="text" name="niche" required />
      </label>
      <label>
        Cidade
        <input type="text" name="city" />
      </label>
      <label>
        Ticket mensal (R$)
        <input type="number" name="monthlyTicket" min="1" value={props.defaults.monthlyTicket} />
      </label>
      <label>
        Numero de ideias
        <input type="number" name="numIdeas" min="1" max="40" value={props.defaults.numIdeas} />
      </label>
      <label>
        <input type="checkbox" name="mock" value="1" /> modo simulado (sem provedores reais)
      </label>
      <button type="submit">Criar estudo</button>
      <p id="study-error" role="alert"></p>
    </form>
    {html`<script>
      (function () {
        var form = document.getElementById("study-form");
        var errorBox = document.getElementById("study-error");
        if (!form) return;
        form.addEventListener("submit", function (event) {
          event.preventDefault();
          if (errorBox) errorBox.textContent = "";
          var data = new FormData(form);
          var payload = {
            niche: String(data.get("niche") || "").trim(),
            city: String(data.get("city") || "").trim(),
            mock: data.get("mock") !== null,
          };
          var ticket = Number(data.get("monthlyTicket"));
          var ideas = Number(data.get("numIdeas"));
          if (isFinite(ticket) && ticket > 0) payload.monthlyTicket = Math.floor(ticket);
          if (isFinite(ideas) && ideas > 0) payload.numIdeas = Math.floor(ideas);
          fetch("/api/studies", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-CSRF-Token": String(data.get("_csrf") || ""),
            },
            body: JSON.stringify(payload),
          })
            .then(function (response) {
              return response.json().then(function (body) {
                if (!response.ok) {
                  if (errorBox) {
                    errorBox.textContent = body && body.message ? body.message : "falha ao criar o estudo";
                  }
                  return;
                }
                window.location.href = "/studies/" + body.id;
              });
            })
            .catch(function (failure) {
              if (errorBox) errorBox.textContent = String(failure);
            });
        });
      })();
    </script>`}
  </section>
);

/** Detalhe: cabecalho, ranking, medias, grupos de dor, artefatos e o plano em markdown. */
export const StudyDetail: FC<{ study: StudyRecord; artifacts: string[]; plan: string | null }> = (props) => {
  const { study } = props;
  const ranked: IdeaEvaluation[] = study.summary
    ? study.summary.ordered
    : [...study.evaluations].sort((left, right) => right.index - left.index);
  const summary = study.summary;
  return (
    <section>
      <h2>{study.niche}</h2>
      <p id="study-meta">
        {study.city || "sem cidade"} · ticket R$ {study.monthlyTicket}/mes ·{" "}
        <span class={`state state-${study.progress.state}`}>{STATE_LABEL[study.progress.state]}</span> ·{" "}
        {study.progress.step}
      </p>
      {study.progress.error !== null ? (
        <p id="study-failure" role="alert">
          {study.progress.error}
        </p>
      ) : null}

      <h3>Ranking</h3>
      {ranked.length === 0 ? (
        <p id="ranking-empty">Nenhuma ideia avaliada ainda.</p>
      ) : (
        <table id="ranking">
          <thead>
            <tr>
              <th>#</th>
              <th>Ideia</th>
              <th>Indice</th>
              <th>Tier</th>
              <th>WTP</th>
              <th>Dor</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((idea, position) => (
              <tr>
                <td>{position + 1}</td>
                <td>{idea.name}</td>
                <td>{idea.index.toFixed(3)}</td>
                <td>{idea.tier}</td>
                <td>{idea.business.wtp.toFixed(2)}</td>
                <td>{idea.algorithm.label}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {summary ? (
        <>
          <h3>Medias</h3>
          <ul id="means">
            <li>fit {summary.means.fit.toFixed(2)}</li>
            <li>venda {summary.means.sale.toFixed(2)}</li>
            <li>disrupcao {summary.means.disruption.toFixed(2)}</li>
            <li>suporte solo {summary.means.solo.toFixed(2)}</li>
            <li>pagaria o ticket {summary.means.wtp.toFixed(2)}</li>
            <li>30 clientes em 24 meses {summary.means.meta30.toFixed(2)}</li>
          </ul>

          <h3>Grupos de dor</h3>
          <ul id="pain-groups">
            <li>forte: {summary.painGroups.forte.join(", ") || "nenhuma"}</li>
            <li>mista: {summary.painGroups.mista.join(", ") || "nenhuma"}</li>
            <li>fraca: {summary.painGroups.fraca.join(", ") || "nenhuma"}</li>
          </ul>
        </>
      ) : null}

      <h3>Artefatos</h3>
      {props.artifacts.length === 0 ? (
        <p id="artifacts-empty">Nenhum artefato gravado ainda.</p>
      ) : (
        <ul id="artifacts">
          {props.artifacts.map((path) => (
            <li>
              <a href={`/api/studies/${study.id}/artifacts/${path}`}>{path}</a>
            </li>
          ))}
        </ul>
      )}

      {props.plan !== null ? (
        <>
          <h3>Plano</h3>
          <pre id="plan">{props.plan}</pre>
        </>
      ) : null}
    </section>
  );
};
