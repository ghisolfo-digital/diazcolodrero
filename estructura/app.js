const CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQZYeQoQBd_4Kzz8E2FxrAqISWC8mYanr1Cw0HIw6r1ZwRUUtiQgUyU-bteg11Pmf3Kqk-xjgDUzS-b/pub?gid=0&single=true&output=csv";

const $root = document.querySelector("#organigrama");
const $yearSelector = document.querySelector("#year-selector");

let CURRENT_YEAR = String(new Date().getFullYear());
const collapsedCommissions = new Set();
const collapsedLevels = new Set();

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

function domId(str) {
  return String(str || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "item";
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

/*
  CSV esperado:
  - Ciclo = año calendario: 2023, 2024, 2025, 2026...
  - Nivel = todo, 1, 2, 3, 4...
  - Comisión = A, B, C...
*/

function getCiclo(item) {
  return String(item.Ciclo || item.Año || "").trim();
}

function getNivelId(item) {
  return String(item.Nivel || item.ID || item.Año || "").trim();
}

function getComisionParte(item) {
  return String(item.Comisión || item.Comision || item.Letra || item.Grupo || "").trim();
}

function getComisionId(item) {
  const nivel = getNivelId(item);
  const comision = getComisionParte(item);

  if (nivel && comision) return `${nivel}${comision}`;
  return String(item.ID || "").trim();
}

/* =========================
   CSV
========================= */

function detectarSeparador(text) {
  const primeraLinea = String(text || "").split(/\r?\n/).find(line => line.trim()) || "";

  const tabs = (primeraLinea.match(/\t/g) || []).length;
  const commas = (primeraLinea.match(/,/g) || []).length;

  return tabs > commas ? "\t" : ",";
}

function parseCSV(text) {
  const separator = detectarSeparador(text);
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
    } else if (char === separator && !insideQuotes) {
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
      data-ciclo="${escapeHTML(meta.ciclo || CURRENT_YEAR)}"
    >
      <div class="avatar">${avatar}</div>
      <div class="info">
        <strong>${escapeHTML(displayName(docente))}</strong>
        ${rol ? `<em>${escapeHTML(rol)}</em>` : ""}
      </div>
    </button>
  `;
}

function nivelRoleGroup(adjuntos, responsables, docentes, nivelId, ciclo) {
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
            data-ciclo="${escapeHTML(ciclo || CURRENT_YEAR)}"
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
    ...(tables.niveles || []).map(n => getCiclo(n)),
    ...(tables.comisiones || []).map(c => getCiclo(c))
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
   JEFATURA / FALLBACK
========================= */

function buscarJefatura(todosLosNiveles, anioActual) {
  const aniosOrdenados = [...new Set(
    (todosLosNiveles || [])
      .map(n => getCiclo(n))
      .filter(Boolean)
  )].sort((a, b) => Number(b) - Number(a));

  const aniosCandidatos = aniosOrdenados.filter(anio => {
    if (Number.isNaN(Number(anioActual))) return anio === anioActual;
    return Number(anio) <= Number(anioActual);
  });

  for (const anio of aniosCandidatos) {
    const jefatura = (todosLosNiveles || []).find(n =>
      getCiclo(n) === anio &&
      getNivelId(n).toLowerCase() === "todo"
    );

    if (jefatura) return jefatura;
  }

  return null;
}

/* =========================
   STICKY LEVELS
========================= */

function actualizarStickyLevels() {
  document.querySelectorAll(".level").forEach(level => {
    const title = level.querySelector(".level-title");
    if (!title) return;

    const titleRect = title.getBoundingClientRect();
    const levelRect = level.getBoundingClientRect();

    const estaSticky = titleRect.top <= 0 && levelRect.bottom > titleRect.height + 20;

    level.classList.toggle("is-level-sticky", estaSticky);
  });
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

  const todosLosNiveles = tables.niveles || [];
  const todasLasComisiones = tables.comisiones || [];

  const nivelesDelAnio = todosLosNiveles.filter(n => getCiclo(n) === CURRENT_YEAR);
  const comisionesDelAnio = todasLasComisiones.filter(c => getCiclo(c) === CURRENT_YEAR);

  const jefatura = buscarJefatura(todosLosNiveles, CURRENT_YEAR);
  const nivelesReales = nivelesDelAnio.filter(n => getNivelId(n).toLowerCase() !== "todo");

  let html = "";

  if (nivelesReales.length) {
    html += `
      <nav class="level-index" aria-label="Índice de niveles">
        ${nivelesReales.map(nivel => {
          const nivelId = getNivelId(nivel);
          const nivelDomId = domId(nivelId);

          return `
            <button
              class="level-index-link"
              type="button"
              data-level-target="nivel-${escapeHTML(nivelDomId)}"
            >
              Nivel ${escapeHTML(nivelId)}
            </button>
          `;
        }).join("")}
      </nav>
    `;
  }

  if (jefatura) {
    html += `<section class="top-catedra">`;

    splitIds(jefatura["A cargo"]).forEach(id => {
      html += docenteCard(id, docentes, "Titular", "principal", {
        nivel: "General",
        ciclo: CURRENT_YEAR
      });
    });

    splitIds(jefatura.Adjunto).forEach(id => {
      html += docenteCard(id, docentes, "Adjunta", "principal", {
        nivel: "General",
        ciclo: CURRENT_YEAR
      });
    });

    html += `</section>`;
  }

  html += `<section class="levels">`;

  nivelesReales.forEach(nivel => {
    const nivelId = getNivelId(nivel);
    const responsables = splitIds(nivel["A cargo"]);
    const adjuntos = splitIds(nivel.Adjunto);
    const coms = comisionesDelAnio.filter(c => getNivelId(c) === nivelId);

    const levelKey = `${CURRENT_YEAR}-${nivelId}`;
    const nivelPlegado = collapsedLevels.has(levelKey);
    const nivelDomId = domId(nivelId);

    html += `
      <article
        id="nivel-${escapeHTML(nivelDomId)}"
        class="level ${nivelPlegado ? "is-level-collapsed" : ""}"
        data-level-key="${escapeHTML(levelKey)}"
      >
        <div class="level-head-cap"></div>

        <div
          class="level-title"
          role="button"
          tabindex="0"
          aria-expanded="${nivelPlegado ? "false" : "true"}"
          aria-label="${nivelPlegado ? "Desplegar nivel" : "Plegar nivel"}"
        >
          <span class="level-title-text">Nivel ${escapeHTML(nivelId)}</span>

          <button
            class="level-toggle"
            type="button"
            tabindex="-1"
            aria-hidden="true"
          >
            <span>&gt;</span>
          </button>
        </div>

        <div class="level-head-base"></div>

        <div class="level-team">
          ${nivelRoleGroup(adjuntos, responsables, docentes, nivelId, CURRENT_YEAR)}
        </div>

        <div class="commissions">
          ${coms.map(com => {
            const idsDocentes = splitIds(com.Docentes);
            const nombreEquipo = nombreComisionPorDocentes(idsDocentes, docentes);
            const cabeza = String(com["A cargo"] || "").trim();
            const mostrarCabeza = boolValue(com["Mostrar a cargo"]);

            const comisionId = getComisionId(com);
            const comisionLabel = getComisionId(com);

            const nombreComision = coms.length === 1
              ? "Comisión"
              : `Comisión ${comisionLabel}`;

            const commissionKey = `${CURRENT_YEAR}-${nivelId}-${comisionId}`;
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
                      comision: comisionId,
                      nombreComision,
                      taller: com.Taller,
                      equipo: nombreEquipo,
                      ciclo: CURRENT_YEAR
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
  actualizarStickyLevels();
}

function renderConTransicion(tables) {
  $root.classList.add("is-changing");

  setTimeout(() => {
    render(tables);

    requestAnimationFrame(() => {
      $root.classList.remove("is-changing");
      actualizarStickyLevels();
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
  const ciclo = card.dataset.ciclo || CURRENT_YEAR;

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
    nivel.textContent = card.dataset.rol === "Adjunta"
      ? `Adjunta de cátedra, año ${ciclo}`
      : `Titular de cátedra, año ${ciclo}`;
  } else {
    nivel.textContent = card.dataset.nivel
      ? `Nivel ${card.dataset.nivel}, año ${ciclo}`
      : "";
  }

  if (card.dataset.nombreComision) {
    comision.textContent = `${card.dataset.nombreComision} — ${card.dataset.equipo || ""}`;
  } else {
    comision.textContent = card.dataset.rol || "";
  }

  taller.textContent = card.dataset.taller
    ? `Taller ${card.dataset.taller}`
    : "";

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

/* =========================
   COLLAPSE HELPERS
========================= */

function toggleLevel(level) {
  const title = level.querySelector(".level-title");
  const key = level.dataset.levelKey;
  const quedaPlegado = !level.classList.contains("is-level-collapsed");

  level.classList.toggle("is-level-collapsed", quedaPlegado);

  if (key) {
    if (quedaPlegado) {
      collapsedLevels.add(key);
    } else {
      collapsedLevels.delete(key);
    }
  }

  if (title) {
    title.setAttribute("aria-expanded", quedaPlegado ? "false" : "true");
    title.setAttribute("aria-label", quedaPlegado ? "Desplegar nivel" : "Plegar nivel");
  }

  actualizarStickyLevels();
}

function toggleCommission(commission) {
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

  actualizarStickyLevels();
}

function resetCollapses() {
  collapsedCommissions.clear();
  collapsedLevels.clear();
}

/* =========================
   EVENTS
========================= */

document.addEventListener("click", e => {
  const indexButton = e.target.closest(".level-index-link");
  if (indexButton) {
    const targetId = indexButton.dataset.levelTarget;
    const target = targetId ? document.getElementById(targetId) : null;

    if (target) {
      target.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    }

    return;
  }

  const title = e.target.closest(".level-title");
  if (title) {
    const level = title.closest(".level");
    if (level) toggleLevel(level);
    return;
  }

  const header = e.target.closest(".commission-header");
  if (header) {
    const commission = header.closest(".commission");
    if (commission) toggleCommission(commission);
    return;
  }

  const card = e.target.closest("[data-docente-id]");
  if (card) abrirLightbox(card);

  if (e.target.matches(".lightbox-close") || e.target.matches(".lightbox-backdrop")) {
    cerrarLightbox();
  }
});

document.addEventListener("keydown", e => {
  if (e.key === "Escape") {
    cerrarLightbox();
    return;
  }

  if ((e.key === "Enter" || e.key === " ") && e.target.matches(".level-title")) {
    e.preventDefault();
    const level = e.target.closest(".level");
    if (level) toggleLevel(level);
  }
});

window.addEventListener("scroll", actualizarStickyLevels, { passive: true });
window.addEventListener("resize", actualizarStickyLevels);

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

    if (!response.ok) {
      throw new Error(`Error HTTP ${response.status}`);
    }

    const text = await response.text();

    if (!text || !text.includes("docentes") || !text.includes("niveles")) {
      throw new Error("El CSV no parece tener la estructura esperada.");
    }

    const rows = parseCSV(text);
    const tables = procesarTablas(rows);

    const anios = obtenerAniosDisponibles(tables);

    if (!anios.length) {
      throw new Error("No se encontraron ciclos/años disponibles en el CSV.");
    }

    cargarSelectorDeAnios(anios);

    render(tables);

    $yearSelector?.addEventListener("change", e => {
      CURRENT_YEAR = e.target.value;
      resetCollapses();
      actualizarURLConAnio(CURRENT_YEAR);
      renderConTransicion(tables);
    });

    window.addEventListener("popstate", () => {
      const anioURL = getAnioDesdeURL();
      const aniosDisponibles = obtenerAniosDisponibles(tables);

      if (!anioURL || !aniosDisponibles.includes(anioURL)) return;

      CURRENT_YEAR = anioURL;
      resetCollapses();

      if ($yearSelector) {
        $yearSelector.value = CURRENT_YEAR;
      }

      renderConTransicion(tables);
    });
  } catch (error) {
    console.error(error);

    if ($root) {
      $root.innerHTML = `
        <p class="error">
          No se pudo cargar el organigrama.
        </p>
      `;
    }

    if ($yearSelector) {
      $yearSelector.innerHTML = "";
      $yearSelector.disabled = true;
    }
  }
}

init();