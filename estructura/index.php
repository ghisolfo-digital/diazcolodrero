<?php
$csvUrl = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQZYeQoQBd_4Kzz8E2FxrAqISWC8mYanr1Cw0HIw6r1ZwRUUtiQgUyU-bteg11Pmf3Kqk-xjgDUzS-b/pub?gid=0&single=true&output=csv';

function h($str) {
  return htmlspecialchars($str ?? '', ENT_QUOTES, 'UTF-8');
}

function boolValue($value) {
  $value = strtoupper(trim($value ?? ''));
  return in_array($value, ['TRUE', 'VERDADERO', '1', 'SI', 'SÍ'], true);
}

function splitIds($value) {
  if (!$value) return [];
  return array_values(array_filter(array_map('trim', explode(';', $value))));
}

function driveImageUrl($url) {
  if (!$url) return '';
  if (preg_match('/\/d\/([^\/]+)/', $url, $m)) {
    return 'https://drive.google.com/thumbnail?id=' . $m[1] . '&sz=w400';
  }
  return $url;
}

function initials($docente) {
  $n = mb_substr($docente['nombre'] ?? '', 0, 1);
  $a = mb_substr($docente['apellido'] ?? '', 0, 1);
  return mb_strtoupper($n . $a);
}

function displayName($docente) {
  $soloApodo = boolValue($docente['SóloApodo'] ?? '');
  $apodo = trim($docente['apodo'] ?? '');

  if ($soloApodo && $apodo) return $apodo;

  $nombre = trim(($docente['nombre'] ?? '') . ' ' . ($docente['apellido'] ?? ''));
  return $nombre ?: $apodo ?: 'Sin nombre';
}

function docenteCard($id, $docentes, $rol = '', $extraClass = '') {
  if (!isset($docentes[$id])) {
    return '<div class="card missing">ID no encontrado<br><strong>' . h($id) . '</strong></div>';
  }

  $d = $docentes[$id];
  $foto = driveImageUrl($d['Foto'] ?? '');
  $apodo = trim($d['apodo'] ?? '');
  $destacar = boolValue($d['MostrarCabeza'] ?? '');

  $classes = trim('card docente ' . $extraClass . ($destacar ? ' cabeza-visible' : ''));

  $img = $foto
    ? '<img src="' . h($foto) . '" alt="' . h(displayName($d)) . '">'
    : '<div class="avatar-fallback">' . h(initials($d)) . '</div>';

  return '
    <div class="' . h($classes) . '">
      <div class="avatar">' . $img . '</div>
      <div class="info">
        <strong>' . h(displayName($d)) . '</strong>
        ' . ($apodo && !boolValue($d['SóloApodo'] ?? '') ? '<span>' . h($apodo) . '</span>' : '') . '
        ' . ($rol ? '<em>' . h($rol) . '</em>' : '') . '
      </div>
    </div>
  ';
}

$raw = file($csvUrl, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
$tables = [];
$currentHeaders = [];

foreach ($raw as $line) {
  $row = str_getcsv($line);

  $section = trim($row[0] ?? '');
  $type = trim($row[1] ?? '');

  if (!$section || !$type) continue;

  if ($type === 'títulos') {
    $headers = array_slice($row, 2);
    $currentHeaders[$section] = $headers;
    $tables[$section] = [];
  }

  if ($type === 'data' && isset($currentHeaders[$section])) {
    $values = array_slice($row, 2);
    $item = [];

    foreach ($currentHeaders[$section] as $i => $header) {
      if ($header !== '') {
        $item[$header] = $values[$i] ?? '';
      }
    }

    $tables[$section][] = $item;
  }
}

$niveles = $tables['niveles'] ?? [];
$comisiones = $tables['comisiones'] ?? [];
$docentesRows = $tables['docentes'] ?? [];

$docentes = [];
foreach ($docentesRows as $d) {
  $docentes[$d['ID']] = $d;
}

$jefatura = null;
$nivelesReales = [];

foreach ($niveles as $nivel) {
  if (($nivel['ID'] ?? '') === 'todo') {
    $jefatura = $nivel;
  } else {
    $nivelesReales[] = $nivel;
  }
}

function comisionesDelNivel($nivelId, $comisiones) {
  return array_values(array_filter($comisiones, function($c) use ($nivelId) {
    return str_starts_with($c['ID'] ?? '', $nivelId);
  }));
}
?>
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Organigrama de cátedra</title>

  <style>
    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #f4f4f1;
      color: #222;
    }

    .page {
      width: min(1400px, 100%);
      margin: 0 auto;
      padding: 32px 20px 48px;
    }

    h1 {
      margin: 0 0 28px;
      text-align: center;
      font-size: clamp(28px, 4vw, 48px);
      line-height: 1;
    }

    .tree {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 28px;
    }

    .levels {
      width: 100%;
      display: grid;
      grid-template-columns: repeat(4, minmax(240px, 1fr));
      gap: 20px;
      align-items: start;
    }

    .level {
      background: white;
      border: 1px solid #ddd;
      border-radius: 22px;
      padding: 16px;
      box-shadow: 0 8px 24px rgba(0,0,0,.06);
    }

    .level-title {
      text-align: center;
      font-size: 22px;
      font-weight: 800;
      margin-bottom: 14px;
      padding-bottom: 10px;
      border-bottom: 1px solid #e5e5e5;
    }

    .level-team,
    .commission-team {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .commissions {
      display: flex;
      flex-direction: column;
      gap: 14px;
      margin-top: 16px;
    }

    .commission {
      border: 1px solid #e1e1e1;
      border-radius: 18px;
      padding: 12px;
      background: #fafafa;
    }

    .commission-header {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: center;
      margin-bottom: 10px;
      font-weight: 800;
    }

    .aula {
      font-size: 13px;
      font-weight: 700;
      color: #666;
      background: #eee;
      border-radius: 999px;
      padding: 4px 8px;
      white-space: nowrap;
    }

    .card {
      display: flex;
      align-items: center;
      gap: 10px;
      min-height: 72px;
      padding: 10px;
      border-radius: 16px;
      background: #fff;
      border: 1px solid #e2e2e2;
    }

    .card.principal {
      width: min(320px, 100%);
      justify-content: center;
      box-shadow: 0 10px 28px rgba(0,0,0,.08);
    }

    .card.cabeza-visible {
      border: 2px solid #222;
      background: #fff7c7;
    }

    .card.missing {
      color: #990000;
      background: #ffe2e2;
      border-color: #e2aaaa;
      justify-content: center;
      text-align: center;
      font-size: 13px;
    }

    .avatar {
      width: 52px;
      height: 52px;
      border-radius: 50%;
      overflow: hidden;
      background: #ddd;
      flex: 0 0 auto;
    }

    .avatar img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }

    .avatar-fallback {
      width: 100%;
      height: 100%;
      display: grid;
      place-items: center;
      font-weight: 800;
      color: #555;
    }

    .info {
      min-width: 0;
      display: flex;
      flex-direction: column;
      line-height: 1.1;
    }

    .info strong {
      font-size: 15px;
    }

    .info span {
      margin-top: 3px;
      font-size: 13px;
      color: #666;
    }

    .info em {
      margin-top: 4px;
      font-size: 12px;
      font-style: normal;
      font-weight: 700;
      color: #777;
      text-transform: uppercase;
      letter-spacing: .04em;
    }

    @media (max-width: 1100px) {
      .levels {
        grid-template-columns: repeat(2, minmax(240px, 1fr));
      }
    }

    @media (max-width: 620px) {
      .levels {
        grid-template-columns: 1fr;
      }

      .page {
        padding-inline: 12px;
      }
    }
  </style>
</head>

<body>
  <main class="page">
    <h1>Organigrama de cátedra</h1>

    <section class="tree">

      <?php if ($jefatura): ?>
        <?php foreach (splitIds($jefatura['A cargo'] ?? '') as $id): ?>
          <?= docenteCard($id, $docentes, 'Jefatura', 'principal') ?>
        <?php endforeach; ?>
      <?php endif; ?>

      <section class="levels">
        <?php foreach ($nivelesReales as $nivel): ?>
          <?php
            $nivelId = $nivel['ID'] ?? '';
            $responsables = splitIds($nivel['A cargo'] ?? '');
            $adjuntos = splitIds($nivel['Adjunto'] ?? '');
            $coms = comisionesDelNivel($nivelId, $comisiones);
          ?>

          <article class="level">
            <div class="level-title">Nivel <?= h($nivelId) ?></div>

            <div class="level-team">
              <?php foreach ($responsables as $id): ?>
                <?= docenteCard($id, $docentes, 'A cargo') ?>
              <?php endforeach; ?>

              <?php foreach ($adjuntos as $id): ?>
                <?= docenteCard($id, $docentes, 'Adjunto') ?>
              <?php endforeach; ?>
            </div>

            <div class="commissions">
              <?php foreach ($coms as $com): ?>
                <section class="commission">
                  <div class="commission-header">
                    <span>Comisión <?= h($com['ID'] ?? '') ?></span>
                    <span class="aula">Aula <?= h($com['Aula'] ?? '') ?></span>
                  </div>

                  <div class="commission-team">
                    <?php foreach (splitIds($com['Docentes'] ?? '') as $id): ?>
                      <?= docenteCard($id, $docentes) ?>
                    <?php endforeach; ?>
                  </div>
                </section>
              <?php endforeach; ?>
            </div>
          </article>
        <?php endforeach; ?>
      </section>

    </section>
  </main>
</body>
</html>