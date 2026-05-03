const CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQZYeQoQBd_4Kzz8E2FxrAqISWC8mYanr1Cw0HIw6r1ZwRUUtiQgUyU-bteg11Pmf3Kqk-xjgDUzS-b/pub?gid=0&single=true&output=csv";

const $root = document.querySelector("#organigrama");
const $yearSelector = document.querySelector("#year-selector");

let CURRENT_YEAR = String(new Date().getFullYear());
const collapsedCommissions = new Set();

/* =========================
   HELPERS
========================= */

function boolValue(value) {
  return ["TRUE", "VERDADERO", "1", "SI", "SÍ"].includes(
    String(value || "").trim().toUpperCase()
  );
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

function capitalizar(texto) {
  const t = String(texto || "").trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : "";
}

function driveImageUrl(url) {
  if (!url) return "";

  const match = String(url).match(/\/d\/([^/]+)/);
  if (match) {
    return `https://drive.google.com/thumbnail?id=${match[1]}&sz=w800`;
  }

  return url;
}

/* =========================
   CSV
========================= */

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

      if (!tables[section]) {
        tables[section] = [];
      }
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

/* =========================
   NOMBRES
========================= */

function displayName(docente) {
  const soloApodo = boolValue(docente["Sólo Apodo"]);
  const apodo = docente.Apodo?.trim() || "";
  const nombre = docente.Nombre?.trim() || "";
  const apellido = docente.Apellido?.trim() || "";

  if (soloApodo && apodo) {
    return `${capitalizar(apodo)} ${apellido}`.trim();
  }

  return `${nombre} ${apellido}`.trim() || capitalizar(apodo) || "Sin nombre";
}

function nombreReal(docente) {
  return `${docente.Nombre || ""} ${docente.Apellido || ""}`.trim();
}

function nombreComisionPorDocentes(ids, docentes) {
  return ids
    .map(id => {
      const d = docentes[id];
      if (!d) return id;

      return capitalizar(d.Apodo || d.Nombre || id);
    })
    .join(" + ");
}

/* =========================
   CARDS
========================= */

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
      data-nombre-comision="${escapeHTML(meta.nombreComision || "")}"
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
            data-nombre-comision=""
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

/* =========================
   AÑOS / URL
========================= */

function getAnioActual() {
  return String(new Date().getFullYear());
}

function getAnioDesdeURL() {
  const params = new URLSearchParams(window.location.search);
  const anio = params.get("a");

  return anio && /^\d{4}$/.test(anio) ? anio : "";
}

function actualizarURLConAnio(anio, reemplazar = false) {
  const url = new URL(window.location.href);
  url.searchParams.set("a", anio);

  const metodo = reemplazar ? "replaceState" : "pushState";
  window.history[metodo]({ anio }, "", url);
}

function obtenerAniosDisponibles(tables) {
  const anios = [
    ...(tables.niveles || []).map(n => String(n.Año || "").trim()),
    ...(tables.comisiones || []).map(c => String(c.Año || "").trim())
  ];

  return [...new Set(anios)]
    .filter(Boolean)
    .sort((a, b) => Number(a) - Number(b));
}

function elegirAnioInicial(aniosDisponibles) {
  const anioURL = getAnioDesdeURL();
  const anioActual = getAnioActual();

  if (anioURL && aniosDisponibles.includes(anioURL)) {
    return anioURL;
  }

  if (aniosDisponibles.includes(anioActual)) {
    return anioActual;
  }

  return (
    aniosDisponibles
      .filter(a => Number(a) <= Number(anioActual))
      .at(-1) ||
    aniosDisponibles.at(-1) ||
    anioActual
  );
}

function cargarSelectorDeAnios(anios) {
  if (!$yearSelector) return;

  const aniosOrdenados = [...anios].sort((a, b) => Number(a) - Number(b));

  $yearSelector.innerHTML = aniosOrdenados
    .map(anio => `<option value="${escapeHTML(anio)}">${escapeHTML(anio)}</option>`)
    .join("");

  CURRENT_YEAR = elegirAnioInicial(aniosOrdenados);
  $yearSelector.value = CURRENT_YEAR;

  actualizarURLConAnio(CURRENT_YEAR, true);
}

/* =========================
   RENDER
========================= */

function render(tables) {
  const docentes = {};

  (tables.docentes || []).forEach(d => {
    docentes[d.ID] = d;
  });

  window.__docentes = docentes;

  const niveles = (tables.niveles || []).filter(n => String(n.Año).trim() === CURRENT_YEAR);
  const comisiones = (tables.comisiones || []).filter(c => String(c.Año).trim() === CURRENT_YEAR);

  const jefatura = niveles.find(n => n.ID === "todo");
  const nivelesReales = niveles.filter(n => n.ID !== "todo");

  let html = "";

  if (jefatura) {
    html += `<section class="top-catedra">`;

    splitIds(jefatura["A cargo"]).forEach(id => {
      html += docenteCard(id, docentes, "Titular", "principal", {
        nivel: "General"
      });
    });

    splitIds(jefatura.Adjunto).forEach(id => {
      html += docenteCard(id, docentes, "Adjunta", "principal", {
        nivel: "General"
      });
    });

    html += `</section>`;
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

            const nombreComision = coms.length === 1
              ? "Comisión"
              : `Comisión ${com.ID}`;

            const commissionKey = `${CURRENT_YEAR}-${nivelId}-${com.ID}`;
            const estaPlegada = collapsedCommissions.has(commissionKey);

            return `
              <section class="commission ${estaPlegada ? "is-collapsed" : ""}" data-commission-key="${escapeHTML(commissionKey)}">
                <div class="commission-header">
                  <div class="commission-meta">
                    <span class="commission-label">${escapeHTML(nombreComision)}</span>
                    <span class="aula">Taller ${escapeHTML(com.Taller)}</span>
                  </div>

                  <div class="commission-title-row">
                    <div class="commission-name">
                      ${escapeHTML(nombreEquipo)}
                    </div>

                    <button
                      class="commission-toggle"
                      type="button"
                      aria-label="${estaPlegada ? "Desplegar comisión" : "Plegar comisión"}"
                      aria-expanded="${estaPlegada ? "false" : "true"}"
                    >
                      <span>&gt;</span>
                    </button>
                  </div>
                </div>

                <div class="commission-team">
                  ${idsDocentes.map(id => {
                    const esCabeza = mostrarCabeza && id === cabeza;

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

function renderConTransicion(tables) {
  $root.classList.add("is-changing");

  setTimeout(() => {
    render(tables);

    requestAnimationFrame(() => {
      $root.classList.remove("is-changing");
    });
  }, 220);
}

/* =========================
   LIGHTBOX
========================= */

function abrirLightbox(card) {
  const id = card.dataset.docenteId;
  const docente = window.__docentes?.[id];

  if (!docente) return;

  const lightbox = document.querySelector("#lightbox");
  const lightboxCard = lightbox?.querySelector(".lightbox-card");
  const photo = document.querySelector("#lightbox-photo");
  const name = document.querySelector("#lightbox-name");
  const apodo = document.querySelector("#lightbox-apodo");
  const nivel = document.querySelector("#lightbox-nivel");
  const taller = document.querySelector("#lightbox-taller");
  const comision = document.querySelector("#lightbox-comision");
  const equipo = document.querySelector("#lightbox-equipo");

  if (!lightbox || !lightboxCard || !photo || !name || !apodo || !nivel || !taller || !comision || !equipo) return;

  const foto = driveImageUrl(docente.Foto);

  lightboxCard.classList.toggle(
    "lightbox-nivel-rol",
    ["Titular", "Adjunta", "Resp. nivel", "Adjunto"].includes(card.dataset.rol)
  );

  photo.innerHTML = foto
    ? `<img src="${escapeHTML(foto)}" alt="${escapeHTML(nombreReal(docente))}">`
    : `<div class="avatar-fallback"></div>`;

  name.textContent = nombreReal(docente);
  apodo.textContent = docente.Apodo ? capitalizar(docente.Apodo) : "";

  if (card.dataset.nivel === "General") {
    nivel.textContent = card.dataset.rol === "Adjunta" ? "Adjunta de cátedra" : "Titular de cátedra";
  } else {
    nivel.textContent = card.dataset.nivel
      ? `Nivel ${card.dataset.nivel}`
      : "";
  }

  taller.textContent = card.dataset.taller
    ? `Taller ${card.dataset.taller}`
    : "";

  if (card.dataset.nombreComision) {
    comision.textContent = `${card.dataset.nombreComision} — ${card.dataset.equipo || ""}`;
  } else {
    comision.textContent = card.dataset.rol || "";
  }

  equipo.textContent = "";

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

  if (e.target.matches(".lightbox-close") || e.target.matches(".lightbox-backdrop")) {
    cerrarLightbox();
  }
});

document.addEventListener("click", e => {
  const header = e.target.closest(".commission-header");
  if (!header) return;

  const commission = header.closest(".commission");
  if (!commission) return;

  const toggle = commission.querySelector(".commission-toggle");
  const key = commission.dataset.commissionKey;
  const quedaPlegada = !commission.classList.contains("is-collapsed");

  commission.classList.toggle("is-collapsed", quedaPlegada);

  if (key) {
    if (quedaPlegada) {
      collapsedCommissions.add(key);
    } else {
      collapsedCommissions.delete(key);
    }
  }

  if (toggle) {
    toggle.setAttribute("aria-expanded", quedaPlegada ? "false" : "true");
    toggle.setAttribute("aria-label", quedaPlegada ? "Desplegar comisión" : "Plegar comisión");
  }
});

document.addEventListener("keydown", e => {
  if (e.key === "Escape") cerrarLightbox();
});

/* =========================
   BACK TO TOP
========================= */

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

/* =========================
   INIT
========================= */

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
      actualizarURLConAnio(CURRENT_YEAR);
      renderConTransicion(tables);
    });

    window.addEventListener("popstate", () => {
      const anioURL = getAnioDesdeURL();
      const aniosDisponibles = obtenerAniosDisponibles(tables);

      if (!anioURL || !aniosDisponibles.includes(anioURL)) return;

      CURRENT_YEAR = anioURL;

      if ($yearSelector) {
        $yearSelector.value = CURRENT_YEAR;
      }

      renderConTransicion(tables);
    });
  } catch (error) {
    console.error(error);
    $root.innerHTML = `<p class="error">No se pudo cargar el organigrama.</p>`;
  }
}

init();