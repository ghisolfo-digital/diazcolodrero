const CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQZYeQoQBd_4Kzz8E2FxrAqISWC8mYanr1Cw0HIw6r1ZwRUUtiQgUyU-bteg11Pmf3Kqk-xjgDUzS-b/pub?gid=0&single=true&output=csv";

const $root = document.querySelector("#organigrama");

function parseCSV(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let insideQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"' && insideQuotes && next === '"') {
      cell += '"';
      i++;
    } else if (char === '"') {
      insideQuotes = !insideQuotes;
    } else if (char === "," && !insideQuotes) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !insideQuotes) {
      if (cell || row.length) {
        row.push(cell);
        rows.push(row);
        row = [];
        cell = "";
      }
      if (char === "\r" && next === "\n") i++;
    } else {
      cell += char;
    }
  }

  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

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
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function driveImageUrl(url) {
  if (!url) return "";

  const match = String(url).match(/\/d\/([^/]+)/);
  if (match) {
    return `https://drive.google.com/thumbnail?id=${match[1]}&sz=w800`;
  }

  return url;
}

function displayName(docente) {
  const soloApodo = boolValue(docente["SóloApodo"]);
  const apodo = docente.apodo?.trim() || "";
  const nombre = docente.nombre?.trim() || "";
  const apellido = docente.apellido?.trim() || "";

  if (soloApodo && apodo) {
    return `${apodo} ${apellido}`.trim();
  }

  return `${nombre} ${apellido}`.trim() || apodo || "Sin nombre";
}

function nombreReal(docente) {
  return `${docente.nombre || ""} ${docente.apellido || ""}`.trim();
}

function nombreComisionPorDocentes(ids, docentes) {
  return ids
    .map(id => {
      const d = docentes[id];
      if (!d) return id;

      const apodo = d.apodo?.trim();
      const nombre = d.nombre?.trim();

      return apodo || nombre || id;
    })
    .join(" + ");
}

function docenteCard(id, docentes, rol = "", extraClass = "", meta = {}) {
  const docente = docentes[id];

  if (!docente) {
    return `
      <div class="card missing">
        ID no encontrado<br>
        <strong>${escapeHTML(id)}</strong>
      </div>
    `;
  }

  const foto = driveImageUrl(docente.Foto);

  const destacar = boolValue(docente.MostrarCabeza);
  const rolFinal = rol || (destacar ? "A cargo" : "");

  const classes = [
    "card",
    "docente",
    extraClass,
    destacar ? "cabeza-visible" : ""
  ].filter(Boolean).join(" ");

  const avatar = foto
    ? `<img src="${escapeHTML(foto)}" alt="${escapeHTML(displayName(docente))}">`
    : `<div class="avatar-fallback" aria-label="Sin foto"></div>`;

  return `
    <button 
      class="${classes}" 
      type="button"
      data-docente-id="${escapeHTML(id)}"
      data-rol="${escapeHTML(rolFinal)}"
      data-nivel="${escapeHTML(meta.nivel || "")}"
      data-comision="${escapeHTML(meta.comision || "")}"
      data-taller="${escapeHTML(meta.taller || "")}"
      data-equipo="${escapeHTML(meta.equipo || "")}"
    >
      <div class="avatar">${avatar}</div>
      <div class="info">
        <strong>${escapeHTML(displayName(docente))}</strong>
        ${rolFinal ? `<em>${escapeHTML(rolFinal)}</em>` : ""}
      </div>
    </button>
  `;
}

function procesarTablas(rows) {
  const tables = {};
  const headers = {};

  rows.forEach(row => {
    const section = row[0]?.trim();
    const type = row[1]?.trim();

    if (!section || !type) return;

    if (type === "títulos") {
      headers[section] = row.slice(2).map(h => h.trim());
      tables[section] = [];
    }

    if (type === "data" && headers[section]) {
      const values = row.slice(2);
      const item = {};

      headers[section].forEach((header, i) => {
        if (header) item[header] = values[i] || "";
      });

      tables[section].push(item);
    }
  });

  return tables;
}

function comisionesDelNivel(nivelId, comisiones) {
  return comisiones.filter(c => String(c.ID || "").startsWith(nivelId));
}

function nivelRoleGroup(adjuntos, responsables, docentes, nivelId) {
  const personas = [
    ...adjuntos.map(id => ({ id, rol: "Adjunto" })),
    ...responsables.map(id => ({ id, rol: "Resp. nivel" }))
  ];

  if (!personas.length) return "";

  return `
    <div class="card nivel-rol nivel-rol-grupo">
      ${personas.map(p => {
        const docente = docentes[p.id];

        if (!docente) {
          return `
            <div class="nivel-persona missing-inline">
              ID no encontrado<br>
              <strong>${escapeHTML(p.id)}</strong>
            </div>
          `;
        }

        const foto = driveImageUrl(docente.Foto);

        const avatar = foto
          ? `<img src="${escapeHTML(foto)}" alt="${escapeHTML(displayName(docente))}">`
          : `<div class="avatar-fallback" aria-label="Sin foto"></div>`;

        return `
          <button 
            class="nivel-persona"
            type="button"
            data-docente-id="${escapeHTML(p.id)}"
            data-rol="${escapeHTML(p.rol)}"
            data-nivel="${escapeHTML(nivelId)}"
            data-comision=""
            data-taller=""
            data-equipo=""
          >
            <div class="avatar">${avatar}</div>
            <div class="info">
              <strong>${escapeHTML(displayName(docente))}</strong>
              <em>${escapeHTML(p.rol)}</em>
            </div>
          </button>
        `;
      }).join("")}
    </div>
  `;
}

function render(tables) {
  const niveles = tables.niveles || [];
  const comisiones = tables.comisiones || [];
  const docentesRows = tables.docentes || [];

  const docentes = {};
  docentesRows.forEach(d => {
    docentes[d.ID] = d;
  });

  window.__docentes = docentes;

  const jefatura = niveles.find(n => n.ID === "todo");
  const nivelesReales = niveles.filter(n => n.ID !== "todo");

  let html = "";

  if (jefatura) {
    splitIds(jefatura["A cargo"]).forEach(id => {
      html += docenteCard(id, docentes, "Titular", "principal", {
        nivel: "General"
      });
    });
  }

  html += `<section class="levels">`;

  nivelesReales.forEach(nivel => {
    const nivelId = nivel.ID;
    const responsables = splitIds(nivel["A cargo"]);
    const adjuntos = splitIds(nivel.Adjunto);
    const coms = comisionesDelNivel(nivelId, comisiones);

    html += `
      <article class="level">
        <div class="level-title">Nivel ${escapeHTML(nivelId)}</div>

        <div class="level-team">
          ${nivelRoleGroup(adjuntos, responsables, docentes, nivelId)}
        </div>

        <div class="commissions">
          ${coms.map(com => {
            const idsDocentes = splitIds(com.Docentes);
            const nombreEquipo = nombreComisionPorDocentes(idsDocentes, docentes);

            return `
              <section class="commission">
                <div class="commission-header">
                  <div class="commission-meta">
                    <span class="commission-label">Comisión ${escapeHTML(com.ID)}</span>
                    <span class="aula">Taller ${escapeHTML(com.Aula)}</span>
                  </div>
                  <div class="commission-name">
                    ${escapeHTML(nombreEquipo)}
                  </div>
                </div>

                <div class="commission-team">
                  ${idsDocentes.map(id => docenteCard(id, docentes, "", "", {
                    nivel: nivelId,
                    comision: com.ID,
                    taller: com.Aula,
                    equipo: nombreEquipo
                  })).join("")}
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

function abrirLightbox(card) {
  const id = card.dataset.docenteId;
  const docente = window.__docentes?.[id];

  if (!docente) return;

  const lightbox = document.querySelector("#lightbox");
  const photo = document.querySelector("#lightbox-photo");
  const name = document.querySelector("#lightbox-name");
  const apodo = document.querySelector("#lightbox-apodo");
  const nivel = document.querySelector("#lightbox-nivel");
  const taller = document.querySelector("#lightbox-taller");
  const comision = document.querySelector("#lightbox-comision");
  const equipo = document.querySelector("#lightbox-equipo");

  if (!lightbox || !photo || !name || !apodo || !nivel || !taller || !comision || !equipo) return;

  const foto = driveImageUrl(docente.Foto);

  lightbox.querySelector(".lightbox-card").classList.toggle(
    "lightbox-nivel-rol",
    card.dataset.rol === "Resp. nivel" || card.dataset.rol === "Adjunto"
  );

  photo.innerHTML = foto
    ? `<img src="${escapeHTML(foto)}" alt="${escapeHTML(nombreReal(docente))}">`
    : `<div class="avatar-fallback"></div>`;

  name.textContent = nombreReal(docente);
  apodo.textContent = docente.apodo ? docente.apodo : "";

  if (card.dataset.nivel === "General") {
    nivel.textContent = "Titular de cátedra";
  } else {
    nivel.textContent = card.dataset.nivel
      ? `Nivel ${card.dataset.nivel}`
      : "";
  }

  taller.textContent = card.dataset.taller
    ? `Taller ${card.dataset.taller}`
    : "";

if (card.dataset.comision) {
  comision.textContent = `Comisión ${card.dataset.comision} — ${card.dataset.equipo || ""}`;
  equipo.textContent = "";
} else {
  comision.textContent = card.dataset.rol || "";
  equipo.textContent = "";
}
  
  lightbox.hidden = false;
  document.body.classList.add("lightbox-open");
}

function cerrarLightbox() {
  const lightbox = document.querySelector("#lightbox");
  if (!lightbox) return;

  lightbox.hidden = true;
  document.body.classList.remove("lightbox-open");
}

document.addEventListener("click", e => {
  const card = e.target.closest("[data-docente-id]");
  if (card) abrirLightbox(card);

  if (
    e.target.matches(".lightbox-close") ||
    e.target.matches(".lightbox-backdrop")
  ) {
    cerrarLightbox();
  }
});

document.addEventListener("keydown", e => {
  if (e.key === "Escape") cerrarLightbox();
});

async function init() {
  try {
    const response = await fetch(CSV_URL);
    const text = await response.text();
    const rows = parseCSV(text);
    const tables = procesarTablas(rows);
    render(tables);
  } catch (error) {
    console.error(error);
    $root.innerHTML = `<p class="error">No se pudo cargar el organigrama.</p>`;
  }
}

const backToTop = document.querySelector("#back-to-top");

window.addEventListener("scroll", () => {
  if (window.scrollY > 300) {
    backToTop.classList.add("visible");
  } else {
    backToTop.classList.remove("visible");
  }
});

backToTop.addEventListener("click", () => {
  window.scrollTo({ top: 0, behavior: "smooth" });
});

init();