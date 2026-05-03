const CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQZYeQoQBd_4Kzz8E2FxrAqISWC8mYanr1Cw0HIw6r1ZwRUUtiQgUyU-bteg11Pmf3Kqk-xjgDUzS-b/pub?gid=0&single=true&output=csv";

const $root = document.querySelector("#organigrama");
const $yearSelector = document.querySelector("#year-selector");

let CURRENT_YEAR = $yearSelector?.value || "2026";

/* HELPERS */

function boolValue(value) {
  return ["TRUE", "VERDADERO", "1", "SI", "SÍ"].includes(String(value || "").trim().toUpperCase());
}

function splitIds(value) {
  return String(value || "")
    .split(";")
    .map(id => id.trim())
    .filter(Boolean);
}

function escapeHTML(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function driveImageUrl(url) {
  if (!url) return "";
  const match = String(url).match(/\/d\/([^/]+)/);
  return match ? `https://drive.google.com/thumbnail?id=${match[1]}&sz=w800` : url;
}

/* CSV */

function parseCSV(text) {
  return text.split("\n").map(row => row.split(","));
}

function procesarTablas(rows) {
  const tables = {};
  const headers = {};

  rows.forEach(row => {
    const section = row[0]?.trim().toLowerCase();
    const type = row[1]?.trim().toLowerCase();

    if (!section || !type) return;

    if (type === "títulos") {
      headers[section] = row.slice(2).map(h => h.trim());
      if (!tables[section]) tables[section] = [];
    }

    if (type === "data" && headers[section]) {
      const item = {};
      headers[section].forEach((h, i) => {
        item[h] = row[i + 2] || "";
      });
      tables[section].push(item);
    }
  });

  return tables;
}

/* NOMBRES */

function displayName(d) {
  const soloApodo = boolValue(d["Sólo Apodo"]);
  const apodo = d.Apodo || "";
  const nombre = d.Nombre || "";
  const apellido = d.Apellido || "";

  return soloApodo && apodo
    ? `${apodo} ${apellido}`
    : `${nombre} ${apellido}`;
}

function nombreReal(d) {
  return `${d.Nombre || ""} ${d.Apellido || ""}`.trim();
}

function nombreComisionPorDocentes(ids, docentes) {
  return ids.map(id => docentes[id]?.Apodo || id).join(" + ");
}

/* CARD */

function docenteCard(id, docentes, rol = "", extraClass = "", meta = {}) {
  const d = docentes[id];
  if (!d) return "";

  const foto = driveImageUrl(d.Foto);

  return `
    <button
      class="card ${extraClass}"
      data-docente-id="${id}"
      data-rol="${rol}"
      data-nivel="${meta.nivel || ""}"
      data-comision="${meta.comision || ""}"
      data-nombre-comision="${meta.nombreComision || ""}"
      data-taller="${meta.taller || ""}"
      data-equipo="${meta.equipo || ""}"
    >
      <div class="avatar">
        ${foto ? `<img src="${foto}">` : `<div class="avatar-fallback"></div>`}
      </div>
      <div class="info">
        <strong>${displayName(d)}</strong>
        ${rol ? `<em>${rol}</em>` : ""}
      </div>
    </button>
  `;
}

/* NIVELES */

function nivelRoleGroup(adjuntos, responsables, docentes, nivelId) {
  const personas = [
    ...adjuntos.map(id => ({ id, rol: "Adjunto" })),
    ...responsables.map(id => ({ id, rol: "Resp. nivel" }))
  ];

  if (!personas.length) return "";

  return `
    <div class="card nivel-rol nivel-rol-grupo">
      ${personas.map(p => docenteCard(p.id, docentes, p.rol, "", { nivel: nivelId })).join("")}
    </div>
  `;
}

/* RENDER */

function render(tables) {
  const docentes = {};
  (tables.docentes || []).forEach(d => docentes[d.ID] = d);

  window.__docentes = docentes;

  const niveles = (tables.niveles || []).filter(n => n.Año === CURRENT_YEAR);
  const comisiones = (tables.comisiones || []).filter(c => c.Año === CURRENT_YEAR);

  const jefatura = niveles.find(n => n.ID === "todo");
  const nivelesReales = niveles.filter(n => n.ID !== "todo");

  let html = "";

  if (jefatura) {
    splitIds(jefatura["A cargo"]).forEach(id => {
      html += docenteCard(id, docentes, "Titular", "principal", { nivel: "General" });
    });
  }

  html += `<section class="levels">`;

  nivelesReales.forEach(nivel => {
    const nivelId = nivel.ID;
    const coms = comisiones.filter(c => c.ID.startsWith(nivelId));

    html += `
      <article class="level">
        <div class="level-title">Nivel ${nivelId}</div>

        ${nivelRoleGroup(
          splitIds(nivel.Adjunto),
          splitIds(nivel["A cargo"]),
          docentes,
          nivelId
        )}

        <div class="commissions">
          ${coms.map(com => {
            const ids = splitIds(com.Docentes);
            const nombreEquipo = nombreComisionPorDocentes(ids, docentes);

            const nombreComision = coms.length === 1
              ? "Comisión"
              : `Comisión ${com.ID}`;

            return `
              <section class="commission">
                <div class="commission-header">
                  <div class="commission-meta">
                    <span class="commission-label">${nombreComision}</span>
                    <span class="aula">Taller ${com.Taller}</span>
                  </div>
                  <div class="commission-name">${nombreEquipo}</div>
                </div>

                <div class="commission-team">
                  ${ids.map(id => {
                    const esCabeza = boolValue(com["Mostrar a cargo"]) && id === com["A cargo"];

                    return docenteCard(id, docentes, esCabeza ? "A cargo" : "", "", {
                      nivel: nivelId,
                      comision: com.ID,
                      nombreComision,
                      taller: com.Taller,
                      equipo: nombreEquipo
                    });
                  }).join("")}
                </div>
              </section>
            `;
          }).join("")}
        </div>
      </article>
    `;
  });

  html += `</section>`;
  $root.innerHTML = html;
}

/* TRANSICION */

function renderConTransicion(tables) {
  $root.classList.add("is-changing");

  setTimeout(() => {
    render(tables);
    requestAnimationFrame(() => $root.classList.remove("is-changing"));
  }, 220);
}

/* LIGHTBOX */

function abrirLightbox(card) {
  const d = window.__docentes?.[card.dataset.docenteId];
  if (!d) return;

  const lightbox = document.querySelector("#lightbox");

  lightbox.querySelector(".lightbox-card").classList.toggle(
    "lightbox-nivel-rol",
    ["Titular", "Resp. nivel", "Adjunto"].includes(card.dataset.rol)
  );

  document.querySelector("#lightbox-photo").innerHTML =
    d.Foto ? `<img src="${driveImageUrl(d.Foto)}">` : `<div class="avatar-fallback"></div>`;

  document.querySelector("#lightbox-name").textContent = nombreReal(d);
  document.querySelector("#lightbox-apodo").textContent = d.Apodo || "";

  document.querySelector("#lightbox-nivel").textContent =
    card.dataset.nivel === "General"
      ? "Titular de cátedra"
      : card.dataset.nivel
        ? `Nivel ${card.dataset.nivel}`
        : "";

  document.querySelector("#lightbox-taller").textContent =
    card.dataset.taller ? `Taller ${card.dataset.taller}` : "";

  document.querySelector("#lightbox-comision").textContent =
    card.dataset.nombreComision || "";

  document.querySelector("#lightbox-equipo").textContent =
    card.dataset.equipo || "";

  lightbox.hidden = false;
  document.body.classList.add("lightbox-open");
}

function cerrarLightbox() {
  document.querySelector("#lightbox").hidden = true;
  document.body.classList.remove("lightbox-open");
}

document.addEventListener("click", e => {
  const card = e.target.closest("[data-docente-id]");
  if (card) abrirLightbox(card);

  if (e.target.matches(".lightbox-close, .lightbox-backdrop")) {
    cerrarLightbox();
  }
});

/* AÑOS */

function obtenerAniosDisponibles(tables) {
  return [...new Set([
    ...(tables.niveles || []).map(n => n.Año),
    ...(tables.comisiones || []).map(c => c.Año)
  ])].filter(Boolean).sort((a, b) => Number(a) - Number(b));
}

function cargarSelectorDeAnios(anios) {
  $yearSelector.innerHTML = anios.map(a => `<option value="${a}">${a}</option>`).join("");
  CURRENT_YEAR = anios[0];
  $yearSelector.value = CURRENT_YEAR;
}

/* INIT */

async function init() {
  const res = await fetch(CSV_URL);
  const text = await res.text();
  const tables = procesarTablas(parseCSV(text));

  const anios = obtenerAniosDisponibles(tables);
  cargarSelectorDeAnios(anios);

  render(tables);

  $yearSelector.addEventListener("change", e => {
    CURRENT_YEAR = e.target.value;
    renderConTransicion(tables);
  });
}

init();