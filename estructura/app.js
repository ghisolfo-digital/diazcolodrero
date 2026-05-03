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

/* CSV */

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

function procesarTablas(rows) {
  const tables = {};
  const headers = {};

  rows.forEach(row => {
    const section = row[0]?.trim().toLowerCase();
    const type = row[1]?.trim().toLowerCase();

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

/* NOMBRES */

function displayName(docente) {
  const soloApodo = boolValue(docente["Sólo Apodo"]);
  const apodo = docente.Apodo?.trim() || "";
  const nombre = docente.Nombre?.trim() || "";
  const apellido = docente.Apellido?.trim() || "";

  if (soloApodo && apodo) {
    return `${apodo} ${apellido}`.trim();
  }

  return `${nombre} ${apellido}`.trim() || apodo || "Sin nombre";
}

function nombreReal(docente) {
  return `${docente.Nombre || ""} ${docente.Apellido || ""}`.trim();
}

function nombreComisionPorDocentes(ids, docentes) {
  return ids
    .map(id => {
      const d = docentes[id];
      if (!d) return id;

      return d.Apodo?.trim() || d.Nombre?.trim() || id;
    })
    .join(" + ");
}

/* CARDS */

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

  const classes = [
    "card",
    "docente",
    extraClass
  ].filter(Boolean).join(" ");

  const avatar = foto
    ? `<img src="${escapeHTML(foto)}" alt="${escapeHTML(displayName(docente))}">`
    : `<div class="avatar-fallback" aria-label="Sin foto"></div>`;

  return `
    <button
      class="${classes}"
      type="button"
      data-docente-id="${escapeHTML(id)}"
      data-rol="${escapeHTML(rol)}"
      data-nivel="${escapeHTML(meta.nivel || "")}"
      data-comision="${escapeHTML(meta.comision || "")}"
      data-taller="${escapeHTML(meta.taller || "")}"
      data-equipo="${escapeHTML(meta.equipo || "")}"
    >
      <div class="avatar">${avatar}</div>
      <div class="info">
        <strong>${escapeHTML(displayName(docente))}</strong>
        ${rol ? `<em>${escapeHTML(rol)}</em>` : ""}
      </div>
    </button>
  `;
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

function yearsDisponibles(items) {
  return [...new Set(
    items
      .map(item => Number(item.Año))
      .filter(Boolean)
  )].sort((a, b) => b - a);
}

function tomarUltimaVersionPorID(items, year) {
  const targetYear = Number(year);
  const resultado = {};

  items
    .filter(item => Number(item.Año) <= targetYear)
    .sort((a, b) => Number(a.Año) - Number(b.Año))
    .forEach(item => {
      resultado[item.ID] = item;
    });

  return Object.values(resultado);
}


/* RENDER */

function render(tables) {
  const docentes = {};
  (tables.docentes || []).forEach(d => {
    docentes[d.ID] = d;
  });

  window.__docentes = docentes;

  const niveles = (tables.niveles || []).filter(n => n.Año === CURRENT_YEAR);
  const comisiones = (tables.comisiones || []).filter(c => c.Año === CURRENT_YEAR);

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

    const coms = comisiones.filter(c => String(c.ID || "").startsWith(nivelId));

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
            const cabeza = String(com["A cargo"] || "").trim();
            const mostrarCabeza = boolValue(com["Mostrar a cargo"]);

            return `
              <section class="commission">
                <div class="commission-header">
                  <div class="commission-meta">
                    <span class="commission-label">Comisión ${escapeHTML(com.ID)}</span>
                    <span class="aula">Taller ${escapeHTML(com.Taller)}</span>
                  </div>
                  <div class="commission-name">
                    ${escapeHTML(nombreEquipo)}
                  </div>
                </div>

                <div class="commission-team">
                  ${idsDocentes.map(id => {
                    const esCabeza = mostrarCabeza && id === cabeza;

                    return docenteCard(id, docentes, esCabeza ? "A cargo" : "", "", {
                      nivel: nivelId,
                      comision: com.ID,
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

function renderConTransicion(tables) {
  $root.classList.add("is-changing");

  setTimeout(() => {
    render(tables);

    requestAnimationFrame(() => {
      $root.classList.remove("is-changing");
    });
  }, 220);
}

/* LIGHTBOX */

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
  apodo.textContent = docente.Apodo ? docente.Apodo : "";

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

/* BACK TO TOP */

const backToTop = document.querySelector("#back-to-top");

if (backToTop) {
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
}

/* INIT */

async function init() {
  try {
    const response = await fetch(CSV_URL);
    const text = await response.text();
    const rows = parseCSV(text);
    const tables = procesarTablas(rows);

const anios = obtenerAniosDisponibles(tables);
cargarSelectorDeAnios(anios);

render(tables);

$yearSelector?.addEventListener("change", e => {
  CURRENT_YEAR = e.target.value;
  renderConTransicion(tables);
});
  } catch (error) {
    console.error(error);
    $root.innerHTML = `<p class="error">No se pudo cargar el organigrama.</p>`;
  }
}

function obtenerAniosDisponibles(tables) {
  const anios = [
    ...(tables.niveles || []).map(n => String(n.Año || "").trim()),
    ...(tables.comisiones || []).map(c => String(c.Año || "").trim())
  ];

  return [...new Set(anios)]
    .filter(Boolean)
    .sort((a, b) => Number(b) - Number(a));
}

function cargarSelectorDeAnios(anios) {
  if (!$yearSelector) return;

  $yearSelector.innerHTML = anios
    .map(anio => `<option value="${escapeHTML(anio)}">${escapeHTML(anio)}</option>`)
    .join("");

  CURRENT_YEAR = anios[0] || "2026";
  $yearSelector.value = CURRENT_YEAR;
}

init();