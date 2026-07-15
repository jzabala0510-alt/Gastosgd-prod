/* ============================================================================
 * FASE 0 — Reconciliación de saldos (SOLO LECTURA)
 * ----------------------------------------------------------------------------
 * Mide qué tan bien mapean las tiendas del Excel de saldos contra
 * GENERAL.EMPRESASCONTABLES (via server/src/services/tiendaMatcher.js), y
 * verifica que los bancos del Excel existan en GD_BancoAlias/GD_Banco.
 * NO escribe nada en la base ni toca la app.
 *
 * Uso (desde la carpeta server/):
 *     node tools/reconciliacion/reconciliar_saldos.js
 *
 * Lee:  tools/reconciliacion/saldos_input.json  (extraído del Excel)
 * Usa:  server/.env  (misma conexión que la app -> apunta al server real)
 * Sale: consola + tools/reconciliacion/reconciliacion_resultado.csv
 * ==========================================================================*/
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '.env') });
const { getGeneralPool, getPool } = require('../../src/config/db');
const { normalize, prepararCandidatos, mejorCandidato } = require('../../src/services/tiendaMatcher');

(async () => {
  const input = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'saldos_input.json'), 'utf8'));
  const tiendasExcel = input.tiendas.filter((t) => !t.subtotal);

  // ── ERP: catálogo de tiendas ──────────────────────────────────────────────
  const gen = await getGeneralPool();
  const erpRaw = (await gen.request().query(
    "SELECT CODIGO, LTRIM(RTRIM(DESCRIPCION)) AS Tienda, LTRIM(RTRIM(PROVINCIA)) AS Zona, LTRIM(RTRIM(POBLACION)) AS Grupo, LTRIM(RTRIM(DIRECCION)) AS Marca FROM EMPRESASCONTABLES"
  )).recordset;
  const erp = prepararCandidatos(erpRaw);

  // ── Matching ──────────────────────────────────────────────────────────────
  const filas = [];
  const cont = { EXACTA: 0, FUERTE: 0, DUDOSA: 0, SIN_MATCH: 0 };
  for (const t of tiendasExcel) {
    const { score, clasificacion, candidato } = mejorCandidato(t.rs1, t.rs2, t.zona, t.grupo, erp);
    cont[clasificacion]++;
    const marcaOk = candidato ? (normalize(t.marca) === candidato._marcaNorm ? 'SI' : 'NO') : '';
    filas.push({
      fila: t.fila, zona: t.zona, marca: t.marca, rs2: t.rs2, rs1: t.rs1,
      clasificacion, score,
      cod: candidato ? candidato.CODIGO : '', desc_erp: candidato ? candidato.Tienda : '',
      zona_erp: candidato ? candidato.Zona : '', marca_erp: candidato ? candidato.Marca : '',
      marca_ok: marcaOk, total: t.total,
    });
  }

  // ── Bancos: valida contra el mapeo real ya sembrado en GD_BancoAlias ──────
  const app = await getPool();
  const aliasBanco = (await app.request().query(`
    SELECT a.ColumnaExcel, a.ColumnaNorm, b.Nombre AS Banco, b.Activo
    FROM dbo.GD_BancoAlias a JOIN dbo.GD_Banco b ON b.IdBanco = a.IdBanco`)).recordset;
  const porColumnaNorm = new Map(aliasBanco.map((a) => [a.ColumnaNorm, a]));

  // ── Reporte consola ───────────────────────────────────────────────────────
  const N = tiendasExcel.length;
  const pct = (n) => `${n} (${(100 * n / N).toFixed(1)}%)`;
  console.log('\n============================================================');
  console.log(' RECONCILIACIÓN DE SALDOS — FASE 0 (solo lectura)');
  console.log('============================================================');
  console.log(` Hoja Excel:            ${input.hoja}`);
  console.log(` Tiendas EMPRESASCONTABLES: ${erp.length}`);
  console.log(` Tiendas en el Excel (sin subtotales): ${N}`);
  console.log('------------------------------------------------------------');
  console.log(' MAPEO DE TIENDAS (por nombre, con similitud):');
  console.log(`   EXACTA    : ${pct(cont.EXACTA)}`);
  console.log(`   FUERTE    : ${pct(cont.FUERTE)}   (muy probable, revisar)`);
  console.log(`   DUDOSA    : ${pct(cont.DUDOSA)}   (requiere confirmación)`);
  console.log(`   SIN_MATCH : ${pct(cont.SIN_MATCH)}   (no se encontró candidata)`);
  const autom = cont.EXACTA + cont.FUERTE;
  console.log(`   -> Auto-resolubles (EXACTA+FUERTE): ${pct(autom)}`);
  console.log(`   -> A confirmar a mano (DUDOSA+SIN_MATCH): ${pct(N - autom)}`);
  const marcaDisc = filas.filter((f) => f.marca_ok === 'NO' && f.clasificacion !== 'SIN_MATCH').length;
  console.log(`   (Aviso: ${marcaDisc} matches con MARCA distinta a la del ERP — revisar en el CSV)`);

  console.log('------------------------------------------------------------');
  console.log(' BANCOS (columna Excel -> banco vía GD_BancoAlias):');
  const faltantes = [];
  for (const h of input.columnas_banco) {
    const alias = porColumnaNorm.get(normalize(h));
    if (!alias) faltantes.push(h);
    console.log(`   ${alias ? 'OK ' : '!! '} ${h.padEnd(38)} -> ${alias ? `${alias.Banco}${alias.Activo ? '' : ' (INACTIVO)'}` : '(SIN ALIAS EN GD_BancoAlias)'}`);
  }
  if (faltantes.length) console.log(`   >> Sin alias en GD_BancoAlias: ${faltantes.join(', ')}`);
  else console.log('   >> Todas las columnas de banco tienen alias configurado.');

  // ── CSV para revisión humana ──────────────────────────────────────────────
  const csvPath = path.resolve(__dirname, 'reconciliacion_resultado.csv');
  const esc = (v) => { const s = String(v == null ? '' : v); return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const head = ['fila', 'clasificacion', 'score', 'zona_excel', 'marca_excel', 'rs2', 'rs1', 'cod_erp', 'desc_erp', 'zona_erp', 'marca_erp', 'marca_ok', 'total'];
  const orden = { SIN_MATCH: 0, DUDOSA: 1, FUERTE: 2, EXACTA: 3 };
  filas.sort((a, b) => (orden[a.clasificacion] - orden[b.clasificacion]) || (a.score - b.score));
  const lines = [head.join(';')];
  for (const f of filas) lines.push([f.fila, f.clasificacion, f.score, f.zona, f.marca, f.rs2, f.rs1, f.cod, f.desc_erp, f.zona_erp, f.marca_erp, f.marca_ok, f.total].map(esc).join(';'));
  fs.writeFileSync(csvPath, '﻿' + lines.join('\r\n'), 'utf8');
  console.log('------------------------------------------------------------');
  console.log(` CSV de revisión (ordenado peor->mejor): ${csvPath}`);
  console.log('============================================================\n');
  process.exit(0);
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
