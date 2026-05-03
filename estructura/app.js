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
    return `https://drive.google.com/thumbnail?id=${match[1]}&sz=w400`;
  }

  return url;
}

function initials(docente) {
  const n = docente.nombre?.trim()?.[0] || "";
  const a = docente.apellido?.trim()?.[0] || "";
  return (n + a).toUpperCase();
}

function displayName(docente) {
  const soloApodo = boolValue(docente["SóloApodo"]);
  const apodo = docente.apodo?.trim() || "";
  const nombre = `${docente.nombre || ""} ${docente.apellido || ""}`.trim();

  if (soloApodo && apodo) return apodo;

  return nombre || apodo || "Sin nombre";
}

function docenteCard(id, docentes, rol = "", extraClass = "") {
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
    <div class="${classes}">
      <div class="avatar">${avatar}</div>
      <div class="info">
        <strong>${escapeHTML(displayName(docente))}</strong>
        ${rol ? `<em>${escapeHTML(rol)}</em>` : ""}
      </div>
    </div>
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

function render(tables) {
  const niveles = tables.niveles || [];
  const comisiones = tables.comisiones || [];
  const docentesRows = tables.docentes || [];

  const docentes = {};
  docentesRows.forEach(d => {
    docentes[d.ID] = d;
  });

  const jefatura = niveles.find(n => n.ID === "todo");
  const nivelesReales = niveles.filter(n => n.ID !== "todo");

  let html = "";

  if (jefatura) {
    splitIds(jefatura["A cargo"]).forEach(id => {
      html += docenteCard(id, docentes, "Titular", "principal");
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
          ${adjuntos.map(id => docenteCard(id, docentes, "Adjunto")).join("")}
          ${responsables.map(id => docenteCard(id, docentes, "Resp. nivel")).join("")}
        </div>

        <div class="commissions">
          ${coms.map(com => `
            <section class="commission">
              <div class="commission-header">
                <div class="commission-meta">
                  <span class="commission-label">Comisión</span>
                  <span class="aula">Aula ${escapeHTML(com.Aula)}</span>
                </div>
                <div class="commission-name">
                  ${escapeHTML(nombreComisionPorDocentes(splitIds(com.Docentes), docentes))}
                </div>
              </div>

              <div class="commission-team">
                ${splitIds(com.Docentes).map(id => docenteCard(id, docentes)).join("")}
              </div>
            </section>
          `).join("")}
        </div>
      </article>
    `;
  });

  html += `</section>`;

  $root.innerHTML = html;
}

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

init();